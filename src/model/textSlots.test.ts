import { describe, expect, it } from 'vitest';
import { mapSame, missingSide, patch, sameRuns } from './textSlots';
import type { BiText } from './types';

const bi = (en: string, zh: string): BiText => ({
  en: en ? [{ text: en }] : [],
  zh: zh ? [{ text: zh }] : [],
});

describe('patch', () => {
  it('returns the same object when nothing changed', () => {
    const obj = { a: 1, b: { c: 2 } };
    expect(patch(obj, { a: 1, b: obj.b })).toBe(obj);
    expect(patch(obj, {})).toBe(obj);
  });

  it('treats an absent field and undefined as equal, and never creates the field', () => {
    const obj: { a: number; opt?: string } = { a: 1 };
    const same = patch(obj, { opt: undefined });
    expect(same).toBe(obj);
    const changed = patch(obj, { a: 2, opt: undefined });
    expect(changed).not.toBe(obj);
    expect(changed).toEqual({ a: 2 });
    expect('opt' in changed).toBe(false);
  });

  it('copies without mutating the input', () => {
    const obj = { a: 1, b: 2 };
    const next = patch(obj, { b: 3 });
    expect(next).toEqual({ a: 1, b: 3 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });
});

describe('mapSame', () => {
  it('returns the input array when every element comes back unchanged', () => {
    const items = [{ id: 1 }, { id: 2 }];
    expect(mapSame(items, (x) => x)).toBe(items);
  });

  it('returns a new array holding the changed element and the untouched ones', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const replaced = { id: 20 };
    const out = mapSame(items, (x, i) => (i === 1 ? replaced : x));
    expect(out).not.toBe(items);
    expect(out[0]).toBe(items[0]);
    expect(out[1]).toBe(replaced);
    expect(out[2]).toBe(items[2]);
  });
});

describe('sameRuns', () => {
  it('is true for the same array', () => {
    const runs = [{ text: 'x' }];
    expect(sameRuns(runs, runs)).toBe(true);
  });

  it('compares after normalizing, so split runs equal merged ones', () => {
    expect(sameRuns([{ text: 'ab' }], [{ text: 'a' }, { text: 'b' }, { text: '' }])).toBe(true);
    expect(sameRuns([{ text: 'a', bold: undefined }], [{ text: 'a' }])).toBe(true);
  });

  it('sees text and formatting differences', () => {
    expect(sameRuns([{ text: 'a' }], [{ text: 'b' }])).toBe(false);
    expect(sameRuns([{ text: 'a' }], [{ text: 'a', bold: true }])).toBe(false);
    expect(
      sameRuns(
        [{ text: 'a', fonts: { latin: 'Arial', eastAsia: 'PMingLiU' } }],
        [{ text: 'a', fonts: { latin: 'Arial', eastAsia: 'MingLiU' } }],
      ),
    ).toBe(false);
    expect(sameRuns([{ text: 'a' }], [])).toBe(false);
  });
});

describe('missingSide', () => {
  it('names the empty side of a one-sided text', () => {
    expect(missingSide(bi('Price', ''))).toBe('zh');
    expect(missingSide(bi('', '價格'))).toBe('en');
  });

  it('counts a whitespace-only side as empty', () => {
    expect(missingSide(bi('Price', ' \n'))).toBe('zh');
  });

  it('is null when both or neither side has words', () => {
    expect(missingSide(bi('Price', '價格'))).toBeNull();
    expect(missingSide(bi('', ''))).toBeNull();
    expect(missingSide(bi(' ', ''))).toBeNull();
  });
});
