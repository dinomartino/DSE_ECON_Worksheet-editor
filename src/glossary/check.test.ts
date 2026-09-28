import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RichText } from '@/model/types';
import raw from './data/edb-economics-2020.json';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';
import type { TermCheck } from './types';

const g = createGlossary(raw as RawGlossary);
const only = (en: string, zh: string): TermCheck => {
  const checks = g.checkEnToZh(en, zh);
  expect(checks, JSON.stringify(checks)).toHaveLength(1);
  return checks[0];
};

describe('checkEnToZh states (§D.7)', () => {
  it('ok on the preferred rendering, with where it was found', () => {
    expect(only('deadweight loss', '造成效率損失')).toMatchObject({
      state: 'ok',
      severity: 'none',
      expected: '效率損失',
      found: { text: '效率損失', start: 2, end: 6, rank: 1 },
    });
    expect(only('household', '住戶').state).toBe('ok');
    expect(only('Gini coefficient', '堅尼係數').state).toBe('ok');
  });

  it('ok-abbr when the abbreviation is kept', () => {
    expect(only('the GDP deflator', 'GDP平減物價指數').state).toBe('ok-abbr');
    expect(only('the GDP deflator', '平減物價指數').state).not.toBe('ok-abbr');
  });

  it('not-preferred on a lower rank, with a fix to rank 1', () => {
    const c = only('explain the deadweight loss', '解釋無謂損失');
    expect(c).toMatchObject({ state: 'not-preferred', severity: 'note', found: { text: '無謂損失', rank: 3 } });
    expect(c.fix).toEqual({ start: 2, end: 6, to: '效率損失', kind: 'lowerRank' });
  });

  it('not-preferred on the national sense of GDP', () => {
    expect(only('GDP', '國內生產總值')).toMatchObject({ state: 'not-preferred', fix: { to: '本地生產總值' } });
    expect(only('GDP', '本地生產總值').state).toBe('ok');
  });

  it('prefers 進口 for the import family; 入口 passes as not preferred', () => {
    expect(only('import quota', '進口配額')).toMatchObject({ state: 'ok', expected: '進口配額' });
    expect(only('import quota', '入口配額')).toMatchObject({ state: 'not-preferred', fix: { to: '進口配額' } });
    expect(only('imports', '進口').state).toBe('ok');
    expect(only('imports', '入口')).toMatchObject({ state: 'not-preferred', fix: { to: '進口' } });
  });

  it('missing with a deny fix', () => {
    const c = only('positive statement', '這是實證陳述');
    expect(c).toMatchObject({ state: 'missing', severity: 'warn', found: { text: '實證陳述', rank: 0 } });
    expect(c.fix).toEqual({ start: 2, end: 6, to: '實證性陳述', kind: 'deny', denyKind: 'wrong' });
    expect(only('terms of trade', '貿易條件').fix?.to).toBe('貿易比率');
    expect(only('elastic demand', '富彈性需求').fix?.to).toBe('彈性需求');
  });

  it('near on a close rendering', () => {
    expect(only('free rider', '搭便車問題')).toMatchObject({ state: 'near', severity: 'note' });
    expect(only('free rider', '免費得益者').state).toBe('ok');
  });

  it('"elastic demand" → 低彈性需求 is a conflict, not a pass', () => {
    const c = only('elastic demand', '低彈性需求');
    expect(c).toMatchObject({ state: 'missing', severity: 'warn', conflict: { form: '低彈性需求', meansEn: 'inelastic demand' } });
    expect(c.fix).toBeUndefined();
  });

  it('"elastic demand" → 缺乏彈性需求 is a reversal conflict', () => {
    const c = only('elastic demand', '缺乏彈性需求');
    expect(c).toMatchObject({ state: 'missing', severity: 'warn', conflict: { form: '缺乏彈性', meansEn: 'inelastic demand' } });
    expect(c.fix).toBeUndefined();
  });

  it('flags nothing on HK phrasing of a predicate (entry-scoped deny rows)', () => {
    expect(g.checkEnToZh('Demand is inelastic.', '需求缺乏彈性。').filter((c) => c.severity !== 'none')).toEqual([]);
    expect(g.checkEnToZh('Demand for its bread is unitary elastic.', '其麵包的需求彈性等於一。')).toEqual([
      expect.objectContaining({ en: 'demand', state: 'ok' }),
    ]);
  });

  it('accepts a sub-term inside a longer term the source also has', () => {
    expect(only('the price elasticity of demand', '需求價格彈性').state).toBe('ok');
  });

  it('keeps generic words at info', () => {
    expect(only('a share', '部分')).toMatchObject({ severity: 'info' });
    expect(only('the firm', '公司')).toMatchObject({ state: 'ok', severity: 'info', senseAmbiguous: true });
  });

  it('grades a plain miss by term length', () => {
    expect(only('tariff', '這是一種稅')).toMatchObject({ state: 'missing', severity: 'note' });
    expect(only('opportunity cost', '代價')).toMatchObject({ state: 'missing', severity: 'warn' });
  });

  it('reports the outer term once', () => {
    expect(g.checkEnToZh('price elasticity of demand', '需求價格彈性').map((c) => c.en)).toEqual(['price elasticity of demand']);
  });

  it('flags the frozen corpus pair as a variant deny, and never rewrites the corpus', () => {
    const path = join(__dirname, '..', 'test', 'corpus', 'v1-published.json');
    const before = readFileSync(path, 'utf8');
    expect(before).toContain('定義稅項歸宿。');
    const c = only('Define tax incidence.', '定義稅項歸宿。');
    expect(c).toMatchObject({ state: 'missing', severity: 'warn', fix: { to: '稅收承擔', kind: 'deny', denyKind: 'variant' } });
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
});

describe('checkZhToEn', () => {
  it('passes a term whose key appears in the output', () => {
    expect(g.checkZhToEn('物價水平上升', 'The price level rises.')).toEqual([
      expect.objectContaining({ en: 'price level', state: 'ok', severity: 'none', source: { text: '物價水平', start: 0, end: 4 } }),
    ]);
  });

  it('warns only when no key of the term appears', () => {
    expect(g.checkZhToEn('物價水平上升', 'Prices rise.')).toEqual([
      expect.objectContaining({ state: 'missing', severity: 'warn', expected: 'price level' }),
    ]);
  });

  it('keeps a term with several keys at info', () => {
    const [c] = g.checkZhToEn('廠商的總收入', "The firm's total revenue");
    expect(c).toMatchObject({ en: 'total revenue', state: 'info', severity: 'info', expected: 'aggregate income / total revenue' });
  });

  it('skips generic words and one-character terms', () => {
    expect(g.checkZhToEn('稅', 'duty')).toEqual([]);
    expect(g.checkZhToEn('價格', 'cost')).toEqual([]);
  });
});

describe('autoFix', () => {
  it('replaces non-reversal deny forms of source terms, longest first', () => {
    const { runs, fixes } = g.autoFix('Market failure; aggregate supply', [{ text: '市場失靈，總供給' }]);
    expect(runs).toEqual([{ text: '市場失效，總供應' }]);
    expect(fixes.map((f) => [f.from, f.to])).toEqual([
      ['市場失靈', '市場失效'],
      ['總供給', '總供應'],
    ]);
  });

  it('keeps the replaced span its own formatting', () => {
    const zh: RichText = [{ text: '這是' }, { text: '市場失靈', bold: true }, { text: '。' }];
    expect(g.autoFix('market failure', zh).runs).toEqual([{ text: '這是' }, { text: '市場失效', bold: true }, { text: '。' }]);
    const inRun: RichText = [{ text: '這是市場失靈。', italic: true }];
    expect(g.autoFix('market failure', inRun).runs).toEqual([{ text: '這是市場失效。', italic: true }]);
  });

  it('fixes variant rows too: new AI text follows the glossary', () => {
    expect(g.autoFix('tax incidence', [{ text: '稅項歸宿' }]).runs).toEqual([{ text: '稅收承擔' }]);
  });

  it('never edits inside a sub/superscript run', () => {
    const zh: RichText = [{ text: '供給', vertAlign: 'subscript' }];
    expect(g.autoFix('supply', zh)).toEqual({ runs: zh, fixes: [] });
  });

  it('leaves reversals, unrelated entries and unchanged text alone, by identity', () => {
    const reversal: RichText = [{ text: '缺乏彈性需求' }];
    expect(g.autoFix('elastic demand', reversal).runs).toBe(reversal);
    const unrelated: RichText = [{ text: '需求缺乏彈性' }];
    expect(g.autoFix('Demand is inelastic', unrelated).runs).toBe(unrelated);
    const fine: RichText = [{ text: '市場失效' }];
    expect(g.autoFix('market failure', fine).runs).toBe(fine);
  });
});
