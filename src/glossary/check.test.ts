import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RichText } from '@/model/types';
import raw from './data/edb-economics-2020.json';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';
import type { GlossaryEntry, TermCheck } from './types';
import { extendsKey } from './check';

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

  it('a second clause never vouches for a multi-word term', () => {
    const [demand, , elastic] = g.checkEnToZh(
      'If demand is inelastic, buyers bear the tax; with elastic demand sellers bear it.',
      '若需求缺乏彈性，買家承擔稅款；若屬低彈性需求，賣家承擔。',
    );
    expect(demand).toMatchObject({ en: 'demand', state: 'ok' });
    expect(elastic).toMatchObject({ en: 'elastic demand', state: 'missing', severity: 'warn' });
    expect(elastic.conflict).toBeDefined();
    expect(elastic.fix).toBeUndefined();
  });

  it('passes a term inside a longer term that extends its key', () => {
    const cases: Array<[string, string, string]> = [
      ['Demand shifts left.', '需求曲線向左移。', '需求'],
      ['Supply shifts left.', '供應曲線向左移。', '供應'],
      ['The government imposes a tax.', '政府徵稅。', '稅'],
    ];
    for (const [en, zh, found] of cases) {
      expect(only(en, zh), en).toMatchObject({ state: 'ok', severity: 'none', found: { text: found } });
    }
  });

  it('a longer term that only contains the key (in-elastic, non-price) stays a conflict', () => {
    expect(only('elastic demand', '低彈性需求')).toMatchObject({ state: 'missing', severity: 'warn', conflict: { meansEn: 'inelastic demand' } });
    expect(only('elastic demand', '缺乏彈性需求')).toMatchObject({ state: 'missing', severity: 'warn', conflict: { meansEn: 'inelastic demand' } });
    expect(only('The price rose.', '非價格競爭')).toMatchObject({ state: 'missing', conflict: { meansEn: 'non-price competition' } });
  });

  it('extendsKey: every key word equals or starts a word of the longer key', () => {
    const e = (en: string) => ({ en, enForms: [en] }) as unknown as GlossaryEntry;
    expect(extendsKey(e('demand curve'), e('demand'))).toBe(true);
    expect(extendsKey(e('taxation'), e('tax'))).toBe(true);
    expect(extendsKey(e('quantity demanded'), e('demand'))).toBe(true);
    expect(extendsKey(e('supply curves'), e('supply curve'))).toBe(true);
    expect(extendsKey(e('inelastic demand'), e('elastic demand'))).toBe(false);
    expect(extendsKey(e('non-price competition'), e('price'))).toBe(false);
    expect(extendsKey(e('unemployment'), e('employment'))).toBe(false);
    expect(extendsKey(e('public finance'), e('public good'))).toBe(false);
  });

  it('gives each repeated wrong form its own check and fix', () => {
    const checks = g.checkEnToZh('The price level rose twice. The price level fell.', '價格水平上升兩次。價格水平下跌。');
    expect(checks.map((c) => [c.state, c.fix?.start, c.fix?.to])).toEqual([
      ['missing', 0, '物價水平'],
      ['missing', 9, '物價水平'],
    ]);
  });

  it('never offers overlapping fixes: the longer fix covers the nested term', () => {
    const cases: Array<[string, string]> = [
      ['Supply rose, and so did aggregate supply.', '總供給上升。'],
      ['money supply and supply', '貨幣供給'],
      ['Imports fell after the import quota.', '入口配額'],
    ];
    for (const [en, zh] of cases) {
      const fixes = g.checkEnToZh(en, zh).flatMap((c) => (c.fix ? [c.fix] : []));
      expect(fixes, en).toHaveLength(1);
    }
    expect(g.checkEnToZh('Supply rose, and so did aggregate supply.', '總供給上升。')).toEqual([
      expect.objectContaining({ en: 'aggregate supply', fix: expect.objectContaining({ to: '總供應' }) }),
    ]);
  });

  it('never denies a form inside a longer glossary term', () => {
    expect(only('A public good', '公共財產')).toMatchObject({ state: 'missing' });
    expect(only('A public good', '公共財產').fix).toBeUndefined();
    expect(only('A public good', '公共財政').found).toBeUndefined();
  });

  it('reports a wrong form split by a line break or a blank, but offers no fix', () => {
    for (const zh of ['價格\n水平', '價格 水平']) {
      const c = only('price level', zh);
      expect(c).toMatchObject({ state: 'missing', severity: 'warn', found: { rank: 0 } });
      expect(c.fix).toBeUndefined();
    }
  });

  it('fixes 生產可能性曲線 for the frontier as for the curve', () => {
    expect(only('Draw the production possibility frontier (PPF).', '繪畫生產可能性曲線。')).toMatchObject({
      state: 'missing',
      fix: { to: '生產可能曲線', kind: 'deny' },
    });
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

  it('gives a span across two runs the format of its first character', () => {
    const zh: RichText = [{ text: '這是' }, { text: '市場', bold: true }, { text: '失靈。' }];
    expect(g.autoFix('market failure', zh).runs).toEqual([{ text: '這是' }, { text: '市場失效', bold: true }, { text: '。' }]);
  });

  it('never rewrites a deny form inside a longer, correct glossary term', () => {
    const zh: RichText = [{ text: '公園是公共財產，但它們是共用品嗎？' }];
    expect(g.autoFix('Parks are public property, but are they a public good?', zh)).toEqual({ runs: zh, fixes: [] });
    const finance: RichText = [{ text: '公共財政與公共財' }];
    expect(g.autoFix('public finance and a public good', finance).runs).toEqual([{ text: '公共財政與共用品' }]);
  });

  it('never drops a line break or a blank inside a deny form', () => {
    for (const text of ['價格\n水平', '價格 水平']) {
      const zh: RichText = [{ text }];
      expect(g.autoFix('price level', zh)).toEqual({ runs: zh, fixes: [] });
    }
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
