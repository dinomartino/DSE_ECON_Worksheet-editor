import { describe, expect, it } from 'vitest';
import { findAcross } from './PaperPreview';

describe('findAcross (✦ review marks on the paper)', () => {
  it('finds a text split across formatting runs, one piece per run', () => {
    // "price elasticity of demand", with "elasticity" in bold.
    const runs = ['The price ', 'elasticity', ' of demand is low.'];
    expect(findAcross(runs, 'price elasticity of demand')).toEqual([
      [
        { index: 0, start: 4, end: 10 },
        { index: 1, start: 0, end: 10 },
        { index: 2, start: 0, end: 10 },
      ],
    ]);
  });

  it('still finds a text inside one run, every time, without overlaps', () => {
    expect(findAcross(['aa aa', 'a'], 'aa')).toEqual([[{ index: 0, start: 0, end: 2 }], [{ index: 0, start: 3, end: 5 }]]);
    expect(findAcross(['需求', '彈性'], '求彈')).toEqual([
      [
        { index: 0, start: 1, end: 2 },
        { index: 1, start: 0, end: 1 },
      ],
    ]);
  });

  it('finds nothing for an empty or absent text', () => {
    expect(findAcross(['abc'], '')).toEqual([]);
    expect(findAcross(['ab', 'c'], 'abd')).toEqual([]);
    expect(findAcross([], 'a')).toEqual([]);
  });
});
