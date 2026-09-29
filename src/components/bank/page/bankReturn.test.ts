import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_FILTERS } from './bankPage';
import { tagIndexOf, useBankReturn } from './bankReturn';

describe('bankReturn', () => {
  beforeEach(() => useBankReturn.getState().clear());

  it('remembers the place until cleared', () => {
    const place = { level: { kind: 'review', topic: '1.1' } as const, filters: DEFAULT_FILTERS, focusKey: 'a/b' };
    useBankReturn.getState().set(place);
    expect(useBankReturn.getState().saved).toEqual(place);
    useBankReturn.getState().clear();
    expect(useBankReturn.getState().saved).toBeNull();
  });

  it('finds the tagged question again, or starts over when it is gone', () => {
    expect(tagIndexOf(['a', 'b', 'c'], 'c')).toBe(2);
    expect(tagIndexOf(['a', 'b'], 'zzz')).toBe(0);
    expect(tagIndexOf(['a'], undefined)).toBe(0);
  });
});
