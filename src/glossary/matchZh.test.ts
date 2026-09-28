import { describe, expect, it } from 'vitest';
import raw from './data/edb-economics-2020.json';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';

const g = createGlossary(raw as RawGlossary);
/** `[original text, keys]` per leftmost-longest hit. */
const hits = (text: string) =>
  g.matchZh(text).map((h) => [text.slice(h.start, h.end), h.entryIds.map((id) => g.entries[id].en).join(' | ')]);

describe('matchZh', () => {
  it('is leftmost-longest', () => {
    expect(hits('需求價格彈性')).toEqual([['需求價格彈性', 'price elasticity of demand']]);
    expect(hits('需求量改變')[0][0]).toBe('需求量改變');
    // A straddle resolves left first: 政府開支 then 出現, never 支出.
    expect(hits('政府開支出現')[0]).toEqual(['政府開支', 'government expenditure']);
    expect(hits('政府開支出現').map((h) => h[0])).not.toContain('支出');
  });

  it('keeps a literal comma inside a term', () => {
    expect(hits('主張大市場，小政府。')).toEqual([['大市場，小政府', 'big market, small government']]);
  });

  it('reports offsets in the original string, across folds', () => {
    const text = '「住户」 的經濟週期';
    const found = hits(text);
    expect(found).toContainEqual(['住户', 'household']);
    expect(found).toContainEqual(['經濟週期', 'business cycle']);
  });

  it('matches a 的-phrase variant with or without its 的', () => {
    expect(hits('搭便車的人')).toEqual([['搭便車的人', 'free rider']]);
    expect(hits('搭便車人')).toEqual([['搭便車人', 'free rider']]);
  });

  it('returns every key a rendering serves', () => {
    expect(hits('總收入')).toEqual([['總收入', 'aggregate income | total revenue']]);
  });

  it('matches compatibility-ideograph and variant spellings', () => {
    expect(hits('堅尼係數')).toEqual([['堅尼係數', 'Gini coefficient']]);
  });
});
