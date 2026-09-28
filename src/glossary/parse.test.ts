import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import raw from './data/edb-economics-2020.json';
import { parseGlossary, parseSenses, type RawGlossary } from './parse';
import { foldZh } from './fold';

const DATA = join(__dirname, 'data', 'edb-economics-2020.json');
const entries = parseGlossary(raw as RawGlossary);
const byKey = new Map(entries.map((e) => [e.en, e]));
const entry = (key: string) => byKey.get(key)!;

describe('the bundled EDB data', () => {
  // Evidence, like the frozen corpus: corrections go in overrides.ts, never into the JSON.
  it('is the verbatim file', () => {
    const bytes = readFileSync(DATA);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      'ac3af2bb1ee24392a27a85c8ac9c574c184d8192f02be944ed8941c9a135114d',
    );
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    expect(blob).toBe('1bca73d0ac32ffb332697a515be219dcc4e74823');
  });

  it('keeps its meta', () => {
    expect((raw as RawGlossary).meta).toEqual({
      source: 'An English-Chinese Glossary of Terms Commonly Used in the Teaching of Economics in Secondary Schools',
      publisher: 'Curriculum Development Institute, Education Bureau, HKSAR',
      year: 2020,
      subject: 'Economics',
      total_entries: 1350,
    });
  });
});

describe('parseGlossary', () => {
  it('parses every entry, sense and variant', () => {
    const variants = entries.flatMap((e) => e.senses.flatMap((s) => s.ranks.flat()));
    expect(entries).toHaveLength(1350);
    expect(entries.reduce((n, e) => n + e.senses.length, 0)).toBe(1408);
    expect(variants).toHaveLength(1798);
    expect(new Set(variants.map((v) => foldZh(v).folded)).size).toBe(1728);
    expect(entries.filter((e) => e.senses.length > 1)).toHaveLength(51);
    // 22 values hold two '；', but benefit and foreclosure spread them over two senses.
    expect(entries.filter((e) => e.senses.some((s) => s.ranks.length === 3))).toHaveLength(20);
  });

  it('leaves no stray punctuation, space or digit in a rendering', () => {
    const stray = entries.filter((e) => e.senses.some((s) => s.ranks.flat().some((v) => /[\s()（）；，/0-9]/.test(v))));
    expect(stray.map((e) => e.en).sort()).toEqual([
      'Bank of China (Hong Kong) Limited',
      'Standard Chartered Bank (Hong Kong) Limited',
      'big market, small government',
    ]);
  });

  it('keeps ranks in the order the glossary prefers them', () => {
    expect(entry('deadweight loss').senses).toEqual([{ ranks: [['效率損失'], ['淨損失'], ['無謂損失']] }]);
    expect(entry('terms of trade').senses).toEqual([{ ranks: [['貿易價格比率', '貿易比率']] }]);
    expect(entry('external cost').senses[0].ranks).toEqual([
      ['界外成本', '界外代價'],
      ['外部成本', '外部代價'],
    ]);
  });

  it('splits numbered senses only at (n), whatever the spacing', () => {
    expect(entry('exchange').senses.map((s) => s.ranks)).toEqual([[['交換', '交易']], [['匯兌']], [['交易所']]]);
    expect(entry('big market, small government').senses).toEqual([{ ranks: [['大市場，小政府']] }]);
  });

  it('lifts usage qualifiers into notes', () => {
    expect(entry('appreciation').senses).toEqual([{ ranks: [['增值']] }, { ranks: [['升值']], note: 'floatingRate' }]);
    expect(entry('revaluation').senses[0]).toEqual({ ranks: [['升值'], ['匯價調升']], note: 'fixedRate' });
    expect(entry('import').senses).toEqual([{ ranks: [['入口'], ['進口']], note: 'quantityOrValue' }]);
  });

  it('reads a full-width short form as an equal variant of the same rank', () => {
    expect(entry('inflationary gap').senses[0].ranks).toEqual([
      ['通貨膨脹差距', '通脹差距'],
      ['通貨膨脹缺口', '通脹缺口'],
    ]);
    expect(entry('sleeping partner').senses[0].ranks).toEqual([['不活躍合夥人'], ['不參與業務的合夥人'], ['隱名合夥人']]);
  });

  it('applies the hand overrides', () => {
    expect(entry('industry capture').senses[0].ranks[0]).toEqual(['企業管制俘虜', '企業俘虜']);
    expect(entry('Faster Payment System (FPS)').senses[0].ranks).toEqual([['快速支付系統', '轉數快']]);
    expect(parseSenses('Lorenz curve', raw.entries['Lorenz curve'])).toEqual([{ ranks: [['洛倫茨曲線']] }]);
  });

  it('shows household as 住戶 and keeps the source verbatim in raw', () => {
    expect(entry('household').preferred).toBe('住戶');
    expect(entry('household').raw).toBe('住户');
  });

  it('pins the Hong Kong sense of the GDP family', () => {
    expect(entry('Gross Domestic Product (GDP)')).toMatchObject({ pinSenses: [0], preferred: '本地生產總值', abbreviation: 'GDP' });
    expect(entry('Gross National Product (GNP)').pinSenses).toEqual([0]);
  });

  it('prefers 進口 for the import family and rank 1 elsewhere', () => {
    expect(entry('import').preferred).toBe('進口');
    expect(entry('import quota').preferred).toBe('進口配額');
    expect(entry('deadweight loss').preferred).toBe('效率損失');
    expect(entry('firm').preferred).toBe('廠商');
  });

  it('derives the English forms teachers write', () => {
    expect(entry('real Gross Domestic Product (GDP)').enForms).toEqual(['real Gross Domestic Product', 'real GDP']);
    expect(entry('Gross Domestic Product (GDP) deflator').enForms).toContain('GDP deflator');
    expect(entry('per capita real Gross Domestic Product (GDP)').enForms).toContain('per capita real GDP');
    expect(entry('Competition Policy Advisory Group (COMPAG)').enForms).toContain('COMPAG');
    expect(entry('the First Conduct Rule').enForms).toEqual(['First Conduct Rule']);
    expect(entry('producers’ co-operative').enForms).toEqual(["producers' co-operative"]);
    expect(entry('optimum / optimal scale').enForms).toEqual(['optimum scale', 'optimal scale']);
    expect(entry('line of perfect equality').enForms).toContain('line of equality');
  });

  it('assigns tiers', () => {
    expect(entry('share').tier).toBe('generic');
    expect(entry('supply').tier).toBe('core');
    expect(entry('tax').tier).toBe('core');
  });
});
