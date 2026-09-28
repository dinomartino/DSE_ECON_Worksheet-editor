import { describe, expect, it } from 'vitest';
import { ITEMS_SCHEMA, JSON_SHAPE_HINT, parseItemsPayload } from './schema';

describe('ITEMS_SCHEMA', () => {
  it('is one flat, closed shape with no optional fields', () => {
    const items = (ITEMS_SCHEMA.properties as { items: { items: Record<string, unknown> } }).items.items;
    expect(ITEMS_SCHEMA.required).toEqual(['items']);
    expect(ITEMS_SCHEMA.additionalProperties).toBe(false);
    expect(items.required).toEqual(['key', 'text']);
    expect(items.additionalProperties).toBe(false);
    expect(JSON.stringify(ITEMS_SCHEMA)).not.toMatch(/enum|minItems|maxLength|anyOf|oneOf/);
  });

  it('has a shape hint that names JSON and shows an example', () => {
    expect(JSON_SHAPE_HINT).toMatch(/JSON/);
    expect(JSON_SHAPE_HINT).toContain('{"items":[{"key":"t1"');
  });
});

describe('parseItemsPayload', () => {
  it('reads a plain payload', () => {
    expect(parseItemsPayload('{"items":[{"key":"t1","text":"價格"}]}')).toEqual([{ key: 't1', text: '價格' }]);
  });

  it('reads a fenced payload with prose around it', () => {
    const reply = 'Here you go:\n```json\n{"items":[{"key":"t1","text":"a"},{"key":"t2","text":"b"}]}\n```';
    expect(parseItemsPayload(reply)).toEqual([
      { key: 't1', text: 'a' },
      { key: 't2', text: 'b' },
    ]);
  });

  it('keeps a text that itself contains braces or backticks', () => {
    expect(parseItemsPayload('{"items":[{"key":"t1","text":"{x} ```"}]}')).toEqual([{ key: 't1', text: '{x} ```' }]);
  });

  it('ignores extra fields', () => {
    expect(parseItemsPayload('{"items":[{"key":"t1","text":"a","note":1}],"model":"x"}')).toEqual([
      { key: 't1', text: 'a' },
    ]);
  });

  it('returns null for anything else', () => {
    expect(parseItemsPayload('')).toBeNull();
    expect(parseItemsPayload('no json here')).toBeNull();
    expect(parseItemsPayload('{"items":')).toBeNull();
    expect(parseItemsPayload('{"items":{}}')).toBeNull();
    expect(parseItemsPayload('{"items":[{"key":1,"text":"a"}]}')).toBeNull();
    expect(parseItemsPayload('{"items":[{"key":"t1"}]}')).toBeNull();
    expect(parseItemsPayload('{"items":[null]}')).toBeNull();
  });

  it('accepts an empty list', () => {
    expect(parseItemsPayload('{"items":[]}')).toEqual([]);
  });
});
