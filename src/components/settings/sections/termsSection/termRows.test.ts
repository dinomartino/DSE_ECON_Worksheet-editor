import { describe, expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import { settingsSections } from '@/settings/sections';
import {
  addOwn,
  cleanPreferences,
  customRow,
  deleteOwn,
  deleteTerm,
  editOwn,
  EMPTY_PREFERENCES,
  filterCounts,
  matches,
  pick,
  preferCustom,
  resetChoices,
  resetTerm,
  saveTerm,
  selectedIn,
  setRelated,
  visibleTerms,
  withOwn,
  type Prefs,
} from './termRows';

const GDP = 'Gross Domestic Product (GDP)';
const prefsOf = (p: Partial<Prefs>): Prefs => ({ ...EMPTY_PREFERENCES, ...p });

describe('Translation terms rows', async () => {
  const glossary = await loadGlossary(EMPTY_PREFERENCES);
  const terms = glossary.terms;
  const byKey = new Map(terms.map((t) => [t.en, t]));
  const term = (key: string) => byKey.get(key)!;
  const edbKeyFor = glossary.edbKeyFor;

  it('registers after AI, before Appearance, and loads its pane on demand', async () => {
    await import('../index');
    expect(settingsSections({ desktop: false }).map((s) => s.id)).toEqual(['ai', 'terms', 'appearance', 'language']);
    const section = settingsSections({ desktop: true })[1];
    expect(section).toMatchObject({ label: { en: 'Translation terms', zh: '翻譯用語' } });
    expect(typeof (await section.load()).default).toBe('function');
  });

  it('has a row for every one of the 1350 EDB entries', () => {
    expect(terms).toHaveLength(1350);
    expect(filterCounts(terms, EMPTY_PREFERENCES)).toEqual({ choices: 347, all: 1350, mine: 0 });
  });

  it('picks a listed rendering; picking the sole default clears the row', () => {
    const chosen = pick(EMPTY_PREFERENCES, term(GDP), '國內生產總值');
    expect(chosen.choices).toEqual({ [GDP]: '國內生產總值' });
    expect(pick(chosen, term(GDP), '本地生產總值')).toEqual(EMPTY_PREFERENCES);
    // Narrowing two equal defaults is a choice.
    expect(pick(EMPTY_PREFERENCES, term('aggregate expenditure'), '總支出').choices).toEqual({ 'aggregate expenditure': '總支出' });
    expect(pick(EMPTY_PREFERENCES, term(GDP), 'free text')).toBe(EMPTY_PREFERENCES);
  });

  it('shows the defaults as selected until a pick, then only the pick', () => {
    const group = term('aggregate expenditure').groups[0];
    expect(selectedIn(group, undefined)).toEqual(['總支出', '總開支']);
    expect(selectedIn(group, '總開支')).toEqual(['總開支']);
  });

  it('follows related terms only while the row has a choice; Reset keeps what the teacher added', () => {
    const on = setRelated(pick(EMPTY_PREFERENCES, term(GDP), '國內生產總值'), GDP, true);
    expect(on.related).toEqual({ [GDP]: true });
    expect(setRelated(EMPTY_PREFERENCES, GDP, true).related).toEqual({});
    expect(resetTerm(on, GDP)).toEqual(EMPTY_PREFERENCES);
    const mine = prefsOf({ choices: { [GDP]: '港產總值' }, related: { [GDP]: true }, own: { [GDP]: ['港產總值'] }, terms: { t: { en: 'carbon tax', zh: ['碳稅'] } } });
    expect(resetChoices(mine)).toEqual({ ...mine, choices: {}, related: {} });
  });

  it('drops stored rows the glossary cannot honour', () => {
    const stored = prefsOf({ choices: { [GDP]: '國內生產總值', capital: '資金', 'no such term': '甲', import: '不存在' }, related: { capital: true, [GDP]: true } });
    expect(cleanPreferences(stored, byKey)).toEqual(prefsOf({ choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } }));
  });

  it('adds, edits and deletes the teacher’s own wording', () => {
    const row = term('aggregate expenditure');
    const added = addOwn(EMPTY_PREFERENCES, row, '  總開銷 ') as Prefs;
    expect(added).toMatchObject({ own: { 'aggregate expenditure': ['總開銷'] }, choices: { 'aggregate expenditure': '總開銷' } });
    const shown = withOwn(row, added.own['aggregate expenditure']);
    expect(shown.groups[0].options.at(-1)).toEqual({ display: '總開銷', sense: 0, rank: 0, own: true });
    expect(selectedIn(shown.groups[0], added.choices['aggregate expenditure'])).toEqual(['總開銷']);
    expect(addOwn(added, shown, '總開銷')).toEqual({ error: 'duplicate' });
    expect(addOwn(added, shown, '總支出')).toEqual({ error: 'duplicate' });
    expect(addOwn(added, shown, 'spending')).toEqual({ error: 'invalid' });
    expect(addOwn(added, shown, '總/開支')).toEqual({ error: 'invalid' });
    expect(addOwn(added, shown, '經'.repeat(41))).toEqual({ error: 'invalid' });
    const edited = editOwn(added, shown, '總開銷', '總花費') as Prefs;
    expect(edited).toMatchObject({ own: { 'aggregate expenditure': ['總花費'] }, choices: { 'aggregate expenditure': '總花費' } });
    // Deleting the chosen one falls back to the default.
    expect(deleteOwn(edited, 'aggregate expenditure', '總花費')).toEqual(EMPTY_PREFERENCES);
    // On a term with one rendering.
    expect((addOwn(EMPTY_PREFERENCES, term('capital'), '本錢') as Prefs).choices).toEqual({ capital: '本錢' });
  });

  it('saves a new term, refuses one the EDB has (with its key), and repeats', () => {
    const draft = { en: 'carbon tax', forms: 'carbon taxes, CO2 tax', abbreviation: '', zh: '碳稅 / 碳排放稅' };
    const saved = saveTerm(EMPTY_PREFERENCES, draft, edbKeyFor);
    expect('prefs' in saved && saved.prefs.terms[saved.id]).toEqual({ en: 'carbon tax', forms: ['carbon taxes', 'CO2 tax'], zh: ['碳稅', '碳排放稅'] });
    const prefs = (saved as { prefs: Prefs }).prefs;
    expect(saveTerm(prefs, { ...draft, en: 'gross domestic product' }, edbKeyFor)).toEqual({ error: { field: 'en', kind: 'edb', key: GDP } });
    expect(saveTerm(prefs, { ...draft, en: 'green tax', abbreviation: 'GDP', forms: '' }, edbKeyFor)).toEqual({ error: { field: 'abbreviation', kind: 'edb', key: GDP } });
    expect(saveTerm(prefs, { ...draft, en: 'Carbon Tax', forms: '' }, edbKeyFor)).toEqual({ error: { field: 'en', kind: 'taken', other: 'carbon tax' } });
    expect(saveTerm(prefs, { ...draft, en: '' }, edbKeyFor)).toEqual({ error: { field: 'en', kind: 'invalid' } });
    expect(saveTerm(prefs, { ...draft, en: 'x tax', forms: '', abbreviation: 'esg' }, edbKeyFor)).toEqual({ error: { field: 'abbreviation', kind: 'invalid' } });
    expect(saveTerm(prefs, { ...draft, en: 'x tax', forms: '', zh: '稅 / spending' }, edbKeyFor)).toEqual({ error: { field: 'zh', kind: 'invalid' } });
    // Editing keeps its id; its own names are not a clash.
    const id = (saved as { id: string }).id;
    const edited = saveTerm(prefs, { ...draft, zh: '碳排放稅 / 碳稅' }, edbKeyFor, id);
    expect('prefs' in edited && edited.prefs.terms[id].zh).toEqual(['碳排放稅', '碳稅']);
    expect(preferCustom(prefs, id, '碳排放稅').terms[id].zh).toEqual(['碳排放稅', '碳稅']);
    expect(deleteTerm(prefs, id)).toEqual(EMPTY_PREFERENCES);
  });

  it('searches every term (forms too), filters to mine, and puts the GDP family first', () => {
    expect(matches(term(GDP), 'gdp')).toBe(true);
    expect(matches(term(GDP), '國內')).toBe(true);
    expect(matches(term('import'), 'GDP')).toBe(false);
    const choices = visibleTerms(terms, EMPTY_PREFERENCES, 'choices', '');
    expect(choices.common.slice(0, 4).every((t) => t.groups[0].sense === undefined)).toBe(true);
    expect(choices.common).toHaveLength(10);
    expect(choices.common.length + choices.rest.length).toBe(347);
    // A search under "With choices" reaches every entry: capital has one rendering.
    expect(visibleTerms(terms, EMPTY_PREFERENCES, 'choices', 'capital').rest.map((t) => t.en)).toContain('capital');
    const custom = customRow('t', { en: 'carbon tax', forms: ['CO2 tax'], abbreviation: 'CT', zh: ['碳稅'] });
    expect(matches(custom, 'co2')).toBe(true);
    const prefs = prefsOf({ ...pick(EMPTY_PREFERENCES, term('expenditure'), '開支'), own: { capital: ['本錢'] }, terms: { t: { en: 'carbon tax', zh: ['碳稅'] } } });
    const rows = [...terms, custom];
    expect(visibleTerms(rows, prefs, 'mine', '').rest.map((t) => t.en)).toEqual(['capital', 'expenditure', 'carbon tax']);
    expect(filterCounts(rows, prefs).mine).toBe(3);
  });
});
