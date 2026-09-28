import { describe, expect, it } from 'vitest';
import { foldEnToken, foldZh, isTermGap, singular, tokenizeEn, unfoldSpan } from './fold';

describe('foldZh', () => {
  it('maps every folded character back to the original string', () => {
    const text = '「住户」的 收入　與經濟週期';
    const f = foldZh(text);
    expect(f.folded).toBe('住戶的收入與經濟周期');
    for (let i = 0; i < f.folded.length; i++) {
      expect(foldZh(text[f.map[i]]).folded).toBe(f.folded[i]);
    }
    const at = f.folded.indexOf('經濟周期');
    const span = unfoldSpan(f, at, at + 4);
    expect(text.slice(span.start, span.end)).toBe('經濟週期');
  });

  it('folds compatibility ideographs by NFC', () => {
    expect(foldZh('洛倫茨曲線').folded).toBe('洛倫茨曲線');
  });

  it('folds variant characters on both sides', () => {
    expect(foldZh('掛鉤、信託、部分、復甦、經常賬、意味着').folded).toBe('掛鈎、信托、部份、復蘇、經常帳、意味著');
    expect(foldZh('（香港）').folded).toBe('(香港)');
  });

  it('folds 係 only inside 係數', () => {
    expect(foldZh('堅尼係數').folded).toBe('堅尼系數');
    expect(foldZh('關係').folded).toBe('關係');
  });

  it('drops 的 between two CJK characters only when asked', () => {
    expect(foldZh('搭便車的人').folded).toBe('搭便車的人');
    const bare = foldZh('搭便車的人', { dropDe: true });
    expect(bare.folded).toBe('搭便車人');
    expect(bare.map).toEqual([0, 1, 2, 4]);
    expect(foldZh('的確', { dropDe: true }).folded).toBe('的確');
  });
});

describe('English folds', () => {
  it('folds spelling both ways', () => {
    expect(foldEnToken('stabilisation')).toBe(foldEnToken('stabilization'));
    expect(foldEnToken('Labour')).toBe(foldEnToken('labor'));
    expect(foldEnToken('judgement')).toBe('judgment');
    expect(foldEnToken("consumer's")).toBe('consumer');
    expect(foldEnToken('analyse')).toBe(foldEnToken('analyze'));
  });

  it('singularises, but never -ss/-us/-is/-ics/-ous', () => {
    expect(singular('elasticities')).toBe('elasticity');
    expect(singular('taxes')).toBe('tax');
    expect(singular('indices')).toBe('index');
    expect(singular('theses')).toBe('thesis');
    expect(singular('goods')).toBe('good');
    expect(singular('losses')).toBe('loss');
    expect(singular('businesses')).toBe('business');
    expect(singular(foldEnToken('enterprises'))).toBe(foldEnToken('enterprise'));
    expect(singular('freezes')).toBe('freeze');
    for (const word of ['economics', 'gross', 'bonus', 'analysis', 'various']) expect(singular(word)).toBe(word);
  });

  it('tokenises words, keeping an inner apostrophe and splitting hyphens', () => {
    expect(tokenizeEn("per-unit tax, consumer's").map((t) => t.text)).toEqual(['per', 'unit', 'tax', "consumer's"]);
  });

  it('joins a term across a space, hyphen or possessive only', () => {
    expect(isTermGap(' ')).toBe(true);
    expect(isTermGap('-')).toBe(true);
    expect(isTermGap("' ")).toBe(true);
    expect(isTermGap(', ')).toBe(false);
    expect(isTermGap('    ')).toBe(false);
  });
});
