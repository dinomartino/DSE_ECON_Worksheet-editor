import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { termNotes } from '@/assist/termRules';
import type { RichText } from '@/model/types';
import type { TermRow } from '@/translate/types';
import raw from './data/edb-economics-2020.json';
import { DENY } from './deny';
import { createGlossary } from './glossary';
import type { RawGlossary } from './parse';
import type { Glossary, TermPreferences } from './types';

const data = raw as RawGlossary;
const GDP = 'Gross Domestic Product (GDP)';
const REAL_GDP = 'real Gross Domestic Product (GDP)';
const glossary = (prefs?: Partial<TermPreferences>) =>
  createGlossary(data, DENY, { choices: {}, related: {}, ...prefs });
const entry = (g: Glossary, key: string) => g.entries.find((e) => e.en === key)!;
const runs = (text: string) => [{ text }] as RichText;

/**
 * Every pin, check and fix over the whole glossary: each entry's first form against each of
 * its renderings both ways, and every deny form. The digest was taken from the base commit
 * (e737806), before preferences existed: with none, nothing a teacher sees may change.
 */
function digest(g: Glossary): string {
  const parts: string[] = [];
  const push = (x: unknown) => parts.push(JSON.stringify(x));
  for (const e of g.entries) {
    const form = e.enForms[0];
    push([e.en, e.preferred]);
    push(g.pin([form], 'toZh', { denyHints: true }));
    for (const v of new Set(e.senses.flatMap((s) => s.ranks.flat()))) {
      push(g.checkEnToZh(form, `這是${v}。`));
      push(g.pin([v], 'toEn'));
      push(g.checkZhToEn(v, form));
    }
    push(g.checkEnToZh(form, '無關的文字'));
  }
  for (const row of DENY) {
    const form = entry(g, row.en).enForms[0];
    for (const f of row.forms) {
      push(g.checkEnToZh(form, `${f}上升`));
      push(g.autoFix(form, runs(`${f}上升`)));
    }
  }
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}
const BEFORE_PREFERENCES = '05422bc51578847b7b7869c3d765a840196afc95b1275c52c95a6fee01de1a98';

describe('no preferences: the glossary is exactly what it was', () => {
  it('pins, checks and fixes match the base commit', () => {
    expect(digest(createGlossary(data))).toBe(BEFORE_PREFERENCES);
  });

  it('stale or malformed stored rows change nothing and never throw', () => {
    const junk = [
      { choices: { 'no such term': '甲', [GDP]: '不存在', capital: '資金', import: '進口', credit: '貸方' }, related: { [GDP]: true, nothing: true } },
      { choices: { [GDP]: 42, import: null }, related: { [GDP]: 'yes' } },
      { choices: [], related: null },
      null,
      'garbage',
      { choices: { __proto__: '國內生產總值' } },
    ];
    for (const prefs of junk) {
      const g = createGlossary(data, DENY, prefs as unknown as TermPreferences);
      expect(g.preferences).toEqual({ choices: {}, related: {} });
      expect(entry(g, GDP).preferred).toBe('本地生產總值');
    }
    expect(digest(glossary({ choices: { capital: '資金', import: '進口' }, related: { import: true } }))).toBe(BEFORE_PREFERENCES);
  });
});

describe('the choosable terms', () => {
  const g = createGlossary(data);
  const byKey = new Map(g.choosable.map((t) => [t.en, t]));

  it('are the 343 entries with alternatives inside a sense, plus the GDP family across its senses', () => {
    expect(g.choosable).toHaveLength(347);
    const family = g.choosable.filter((t) => t.groups.some((gr) => gr.sense === undefined)).map((t) => t.en);
    expect(family.sort()).toEqual([
      'Gross Domestic Income (GDI)',
      GDP,
      'Gross National Income (GNI)',
      'Gross National Product (GNP)',
    ]);
    expect(byKey.get(GDP)!.groups).toEqual([
      { options: [{ display: '本地生產總值', sense: 0, rank: 1 }, { display: '國內生產總值', sense: 1, rank: 1 }], defaults: ['本地生產總值'] },
    ]);
  });

  it('offer no choice between different meanings: capital, credit and discount', () => {
    expect(byKey.has('capital')).toBe(false);
    expect(byKey.has('discount')).toBe(false);
    // credit (1)信貸；信用 (2)貸方: only inside meaning (1).
    expect(byKey.get('credit')!.groups.map((gr) => [gr.sense, gr.options.map((o) => o.display)])).toEqual([[0, ['信貸', '信用']]]);
    expect(glossary({ choices: { credit: '貸方', capital: '資金' } }).preferences.choices).toEqual({});
  });

  it('mark the code defaults and the common choices', () => {
    expect(byKey.get('import')!.groups[0].defaults).toEqual(['進口']);
    expect(g.choosable.filter((t) => t.common)).toHaveLength(10);
    // Rank-1 equals are all the default until the teacher picks one.
    expect(byKey.get('aggregate expenditure')!.groups[0].defaults).toEqual(['總支出', '總開支']);
  });
});

describe('choosing 國內生產總值 for GDP', () => {
  const g = glossary({ choices: { [GDP]: '國內生產總值' } });

  it('prefers it everywhere preferred matters', () => {
    expect(entry(g, GDP).preferred).toBe('國內生產總值');
    const [ok] = g.checkEnToZh('Gross Domestic Product rose.', '國內生產總值上升。');
    expect(ok).toMatchObject({ state: 'ok', severity: 'none', expected: '國內生產總值' });
  });

  it('still passes 本地生產總值, as not preferred, and suggests the choice', () => {
    const [check] = g.checkEnToZh('Gross Domestic Product rose.', '本地生產總值上升。');
    expect(check).toMatchObject({ state: 'not-preferred', severity: 'note', expected: '國內生產總值' });
    expect(check.fix).toEqual({ start: 0, end: 6, to: '國內生產總值', kind: 'lowerRank' });
    // Check terms says it is the teacher's choice, not the EDB's first.
    expect(check.chosen).toBe(true);
    expect(termNotes({ path: 'p', zh: runs('本地生產總值上升。') } as unknown as TermRow, check)).toEqual([
      'Gross Domestic Product (GDP): 本地生產總值 (your choice: 國內生產總值)',
    ]);
    expect(glossary({ choices: { import: '入口' } }).checkEnToZh('import', '入口')[0].chosen).toBe(true);
    expect(glossary().checkEnToZh('import', '入口')[0].chosen).toBeUndefined();
  });

  it('pins it in the prompt', () => {
    expect(g.pin(['GDP rose.'], 'toZh').map((p) => p.line)).toEqual(['GDP → 國內生產總值']);
    expect(glossary().pin(['GDP rose.'], 'toZh').map((p) => p.line)).toEqual(['GDP → 本地生產總值']);
  });

  it('leaves real GDP alone until the teacher asks', () => {
    expect(entry(g, REAL_GDP).preferred).toBe('實質本地生產總值');
    expect(g.autoFix('real GDP', runs('實際本地生產總值')).fixes[0].to).toBe('實質本地生產總值');
  });
});

describe('related terms', () => {
  it('offers the GDP compounds, derived where the EDB data has no such form', () => {
    const related = glossary().related(GDP, '國內生產總值');
    expect(related.map((r) => r.en)).toContain(REAL_GDP);
    const real = related.find((r) => r.en === REAL_GDP)!;
    expect(real).toMatchObject({ from: ['實質本地生產總值'], to: ['實質國內生產總值'], derived: ['實質國內生產總值'] });
    // The GDP family's own senses are curated: domestic product never reaches GDP.
    expect(glossary().related('domestic product', '境內生產').map((r) => r.en)).not.toContain(GDP);
  });

  it('carries the choice into real GDP: check, pins, Chinese matching and autoFix', () => {
    const g = glossary({ choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } });
    expect(g.preferences.related).toEqual({ [GDP]: true });
    expect(entry(g, REAL_GDP).choice).toMatchObject({ source: 'related', follows: GDP, derived: ['實質國內生產總值'] });
    expect(g.checkEnToZh('Real GDP rose.', '實質國內生產總值上升。')[0]).toMatchObject({ state: 'ok', expected: '實質國內生產總值' });
    const [old] = g.checkEnToZh('Real GDP rose.', '實質本地生產總值上升。');
    expect(old).toMatchObject({ state: 'not-preferred', fix: { to: '實質國內生產總值' } });
    expect(g.pin(['Real GDP rose.'], 'toZh').map((p) => p.line)).toEqual(['real GDP → 實質國內生產總值']);
    expect(g.matchZh('實質國內生產總值').map((h) => h.entryIds)).toEqual([[entry(g, REAL_GDP).id]]);
    const fixed = g.autoFix('real GDP', runs('實際本地生產總值上升'));
    expect(fixed.fixes).toEqual([{ from: '實際本地生產總值', to: '實質國內生產總值', entryId: entry(g, REAL_GDP).id }]);
    // Equal renderings follow too: 人均本地生產總值 → 人均國內生產總值 passes.
    const perCapita = 'per capita Gross Domestic Product (GDP)';
    expect(entry(g, perCapita).choice?.displays).toEqual(['按人口平均計算的國內生產總值', '人均國內生產總值']);
    expect(g.checkEnToZh('per capita GDP', '人均國內生產總值')[0].state).toBe('ok');
  });

  it('lands on listed renderings for the 支出 / 開支 family, with nothing derived', () => {
    const related = glossary().related('expenditure', '開支');
    const aggregate = related.find((r) => r.en === 'aggregate expenditure')!;
    expect(aggregate).toMatchObject({ from: ['總支出', '總開支'], to: ['總開支'], derived: [] });
    expect(related.every((r) => r.derived.length === 0)).toBe(true);
    const g = glossary({ choices: { expenditure: '開支' }, related: { expenditure: true } });
    expect(g.checkEnToZh('aggregate expenditure', '總支出')[0]).toMatchObject({ state: 'not-preferred', fix: { to: '總開支' } });
  });

  it('never follows into a term the teacher chose for, and never derives from a generic word', () => {
    const g = glossary({
      choices: { expenditure: '開支', 'aggregate expenditure': '總支出' },
      related: { expenditure: true },
    });
    expect(entry(g, 'aggregate expenditure').choice).toMatchObject({ source: 'teacher', displays: ['總支出'] });
    // cost → 代價 would coin 平均代價: a generic word only lands on listed renderings.
    expect(glossary().related('cost', '代價').every((r) => r.derived.length === 0)).toBe(true);
  });

  it('import → 入口 replaces the code default and reaches the import family', () => {
    const g = glossary({ choices: { import: '入口' }, related: { import: true } });
    expect(g.checkEnToZh('import', '進口')[0]).toMatchObject({ state: 'not-preferred', fix: { to: '入口' } });
    expect(entry(g, 'import quota').choice).toMatchObject({ displays: ['入口配額'], derived: [] });
    expect(g.pin(['import quota'], 'toZh')[0].line).toBe('import quota → 入口配額');
  });
});

describe('a choice inside one meaning of a numbered entry', () => {
  it('keeps the other meanings as they are', () => {
    const g = glossary({ choices: { benefit: '福利金' } });
    expect(entry(g, 'benefit').preferred).toBe('利益');
    expect(g.pin(['benefit'], 'toZh')[0].line).toBe('[only if economic sense] benefit → (1) 利益 (2) 福利金 — choose by meaning');
    expect(glossary().pin(['benefit'], 'toZh')[0].line).toBe('[only if economic sense] benefit → (1) 利益 (2) 福利 — choose by meaning');
  });
});

describe('counts', () => {
  it('how many choices reach related terms', () => {
    const g = createGlossary(data);
    let parents = 0;
    let pairs = 0;
    let derived = 0;
    for (const t of g.choosable) {
      let any = false;
      for (const o of t.groups.flatMap((gr) => gr.options)) {
        const related = g.related(t.en, o.display);
        if (related.length) any = true;
        pairs += related.length;
        derived += related.filter((r) => r.derived.length).length;
      }
      if (any) parents++;
    }
    // Pinned so a rule change is a visible decision (reported with the feature).
    expect({ parents, pairs, derived }).toMatchInlineSnapshot(`
      {
        "derived": 63,
        "pairs": 144,
        "parents": 37,
      }
    `);
  });
});
