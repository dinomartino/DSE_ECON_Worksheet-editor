import { describe, expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import { settingsSections } from '@/settings/sections';
import { cleanPreferences, EMPTY_PREFERENCES, matches, pick, resetTerm, selectedIn, setRelated, visibleTerms } from './termRows';

const GDP = 'Gross Domestic Product (GDP)';

describe('Translation terms rows', async () => {
  const glossary = await loadGlossary(EMPTY_PREFERENCES);
  const terms = glossary.choosable;
  const byKey = new Map(terms.map((t) => [t.en, t]));
  const term = (key: string) => byKey.get(key)!;

  it('registers after AI, before Appearance, and loads its pane on demand', async () => {
    await import('../index');
    expect(settingsSections({ desktop: false }).map((s) => s.id)).toEqual(['ai', 'terms', 'appearance', 'language']);
    const terms = settingsSections({ desktop: true })[1];
    expect(terms).toMatchObject({ label: { en: 'Translation terms', zh: '翻譯用語' } });
    expect(typeof (await terms.load()).default).toBe('function');
  });

  it('picks a listed rendering; picking the sole default clears the row', () => {
    const chosen = pick(EMPTY_PREFERENCES, term(GDP), '國內生產總值');
    expect(chosen.choices).toEqual({ [GDP]: '國內生產總值' });
    expect(pick(chosen, term(GDP), '本地生產總值')).toEqual({ choices: {}, related: {} });
    // Narrowing two equal defaults is a choice.
    expect(pick(EMPTY_PREFERENCES, term('aggregate expenditure'), '總支出').choices).toEqual({ 'aggregate expenditure': '總支出' });
    expect(pick(EMPTY_PREFERENCES, term(GDP), 'free text')).toBe(EMPTY_PREFERENCES);
  });

  it('shows the defaults as selected until a pick, then only the pick', () => {
    const group = term('aggregate expenditure').groups[0];
    expect(selectedIn(group, undefined)).toEqual(['總支出', '總開支']);
    expect(selectedIn(group, '總開支')).toEqual(['總開支']);
  });

  it('follows related terms only while the row has a choice, and resets both', () => {
    const on = setRelated(pick(EMPTY_PREFERENCES, term(GDP), '國內生產總值'), GDP, true);
    expect(on.related).toEqual({ [GDP]: true });
    expect(setRelated(EMPTY_PREFERENCES, GDP, true).related).toEqual({});
    expect(resetTerm(on, GDP)).toEqual({ choices: {}, related: {} });
  });

  it('drops stored rows the glossary cannot honour', () => {
    const stored = { choices: { [GDP]: '國內生產總值', capital: '資金', 'no such term': '甲', import: '不存在' }, related: { capital: true as const, [GDP]: true as const } };
    expect(cleanPreferences(stored, byKey)).toEqual({ choices: { [GDP]: '國內生產總值' }, related: { [GDP]: true } });
  });

  it('searches English and Chinese, filters to the changed rows, and puts the GDP family first', () => {
    expect(matches(term(GDP), 'gdp')).toBe(true);
    expect(matches(term(GDP), '國內')).toBe(true);
    expect(matches(term('import'), 'GDP')).toBe(false);
    const all = visibleTerms(terms, EMPTY_PREFERENCES, 'all', '');
    expect(all.common.slice(0, 4).every((t) => t.groups[0].sense === undefined)).toBe(true);
    expect(all.common).toHaveLength(10);
    expect(all.common.length + all.rest.length).toBe(347);
    const prefs = pick(EMPTY_PREFERENCES, term('expenditure'), '開支');
    expect(visibleTerms(terms, prefs, 'changed', '')).toEqual({ common: [], rest: [term('expenditure')] });
    expect(visibleTerms(terms, EMPTY_PREFERENCES, 'all', 'GDP').common.map((t) => t.en)).toContain(GDP);
  });
});
