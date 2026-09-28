import { describe, expect, it } from 'vitest';
import raw from './data/edb-economics-2020.json';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';

const g = createGlossary(raw as RawGlossary);
const lines = (texts: string[], direction: 'toZh' | 'toEn', opts?: { denyHints?: boolean; limit?: number }) =>
  g.pin(texts, direction, opts).map((p) => p.line);

describe('pin, EN → ZH', () => {
  it('pins the preferred rendering only, with equal variants', () => {
    expect(lines(['The price level and the deadweight loss; terms of trade.'], 'toZh')).toEqual([
      'price level → 物價水平',
      'deadweight loss → 效率損失',
      'terms of trade → 貿易價格比率 / 貿易比率',
    ]);
  });

  it('pins 進口 for the import family, never 入口', () => {
    expect(lines(['An import quota cuts imports.'], 'toZh')).toEqual([
      'import quota → 進口配額',
      'import → 進口 [quantity or value]',
    ]);
  });

  it('shows every sense of a multi-sense entry, and only the pinned sense of the GDP family', () => {
    expect(lines(['appreciation'], 'toZh')).toEqual([
      'appreciation → (1) 增值 (2) 升值 [floating exchange rate] — choose by meaning',
    ]);
    expect(lines(['GDP and real GDP'], 'toZh')).toEqual(['GDP → 本地生產總值', 'real GDP → 實質本地生產總值']);
    expect(lines(['household'], 'toZh')).toEqual(['household → 住戶']);
  });

  it('marks generic words', () => {
    expect(lines(['a share'], 'toZh')).toEqual(['[only if economic sense] share → (1) 股份 (2) 股票 (3) 份額 — choose by meaning']);
    expect(g.pin(['a share'], 'toZh')[0].tier).toBe('generic');
  });

  it('adds at most two (not …) hints, and only when asked', () => {
    expect(lines(['price level'], 'toZh')).toEqual(['price level → 物價水平']);
    expect(lines(['price level'], 'toZh', { denyHints: true })).toEqual(['price level → 物價水平 (not 價格水平)']);
    expect(lines(['tax incidence'], 'toZh', { denyHints: true })).toEqual(['tax incidence → 稅收承擔 (not 稅項歸宿, 稅收歸宿)']);
    expect(lines(['elastic demand'], 'toZh', { denyHints: true })[0]).not.toContain('缺乏彈性');
  });

  it('dedupes by entry in first-occurrence order across texts, and caps', () => {
    const pins = g.pin(['demand and supply', 'supply, demand and tax'], 'toZh');
    expect(pins.map((p) => g.entries[p.entryId].en)).toEqual(['demand', 'supply', 'tax']);
    expect(g.pin(['demand and supply and tax'], 'toZh', { limit: 2 })).toHaveLength(2);
    const long = g.entries.filter((e) => e.tier === 'core').map((e) => e.enForms[0]).join('. ');
    expect(g.pin([long], 'toZh').length).toBe(200);
  });
});

describe('pin, ZH → EN', () => {
  it('pins the key as written, with divergent keys to choose by context', () => {
    expect(lines(['物價水平上升，總收入下跌；升值。'], 'toEn')).toEqual([
      '物價水平 → price level',
      '總收入 → aggregate income / total revenue — choose by context',
      '升值 → appreciation (floating rate) / revaluation (fixed rate) — choose by context',
    ]);
  });

  it('never pins a generic word, or 稅 alone', () => {
    expect(lines(['價格和稅'], 'toEn')).toEqual([]);
  });
});
