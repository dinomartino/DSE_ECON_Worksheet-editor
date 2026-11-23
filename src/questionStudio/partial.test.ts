import { describe, expect, it } from 'vitest';
import { parsePartialJson, partialDrafts } from './partial';

const FULL = JSON.stringify({
  questions: [
    { stem: { en: 'Price rises "a lot"', zh: '價格上升' }, statements: [], options: [{ en: 'A', zh: 'A' }, { en: 'B', zh: 'B' }], answer: 1, explanation: { en: 'because', zh: '因為' }, angle: 'slip' },
    { stem: { en: 'Second', zh: '第二' }, statements: [], options: [], answer: 0, explanation: { en: '', zh: '' }, angle: 'x' },
  ],
});

describe('parsePartialJson', () => {
  it('every cut of a valid reply parses (or is undefined before the first brace), and the whole parses to itself', () => {
    expect(parsePartialJson(FULL)).toEqual(JSON.parse(FULL));
    for (let i = 0; i <= FULL.length; i += 1) {
      const out = parsePartialJson(FULL.slice(0, i));
      if (i > 0 && out === undefined) throw new Error(`cut ${i} did not parse: ${FULL.slice(0, i)}`);
    }
  });
  it('closes an open string, drops a dangling key, gives a colon null', () => {
    expect(parsePartialJson('{"a":"hel')).toEqual({ a: 'hel' });
    expect(parsePartialJson('{"a":1,"b"')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":1,"b":')).toEqual({ a: 1, b: null });
    expect(parsePartialJson('{"a":"x\\')).toEqual({ a: 'x' });
    expect(parsePartialJson('{"a":"\\u00')).toEqual({ a: '' });
    expect(parsePartialJson('{"a":[1,2,')).toEqual({ a: [1, 2] });
    expect(parsePartialJson('nonsense')).toBeUndefined();
    expect(parsePartialJson('```json\n{"a":"b"')).toEqual({ a: 'b' });
  });
});

describe('partialDrafts', () => {
  it('shows words as they arrive: the first draft grows and completes when the second starts', () => {
    const mid = partialDrafts(FULL.slice(0, FULL.indexOf('"zh":"價格上升"') + 6));
    expect(mid).toHaveLength(1);
    expect(mid[0]).toMatchObject({ index: 0, complete: false, stem: { en: 'Price rises "a lot"' } });
    expect(mid[0].answer).toBeUndefined();
    const second = partialDrafts(FULL.slice(0, FULL.indexOf('"Second"') + 4));
    expect(second.map((d) => d.complete)).toEqual([true, false]);
    expect(second[0].answer).toBe(1);
    const all = partialDrafts(FULL, true);
    expect(all.map((d) => d.complete)).toEqual([true, true]);
    expect(all[0].options).toHaveLength(2);
  });
  it('is [] for anything that is not the write reply', () => {
    expect(partialDrafts('{"answers":[]}')).toEqual([]);
    expect(partialDrafts('')).toEqual([]);
  });
});
