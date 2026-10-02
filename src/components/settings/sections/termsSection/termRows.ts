import type { ChoosableTerm, CustomTerm, TermOption, TermOptionGroup, TermPreferences } from '@/glossary/types';
import { cleanAbbreviation, cleanCustomTerm, cleanEnglish, cleanRendering, MAX_RENDERINGS, newTermId } from '@/settings/termData';

/**
 * Settings → Translation terms, pure: which rows show, what a chip shows as chosen, and the
 * preferences a click writes. A choice picks a rendering the EDB lists or the teacher added;
 * one choice per term. The teacher's own renderings and terms are data: only an explicit
 * delete removes them, never Reset.
 */

export type TermFilter = 'choices' | 'all' | 'mine';

/** Preferences with every part present. */
export interface Prefs {
  choices: Readonly<Record<string, string>>;
  related: Readonly<Record<string, true>>;
  own: Readonly<Record<string, readonly string[]>>;
  terms: Readonly<Record<string, CustomTerm>>;
}

export const EMPTY_PREFERENCES: Prefs = { choices: {}, related: {}, own: {}, terms: {} };

export const full = (p: TermPreferences): Prefs => ({
  choices: p.choices,
  related: p.related,
  own: p.own ?? {},
  terms: p.terms ?? {},
});

const hasOption = (group: TermOptionGroup, display: string) => group.options.some((o) => o.display === display);
const without = <V>(r: Readonly<Record<string, V>>, key: string): Record<string, V> => {
  const out = { ...r };
  delete out[key];
  return out;
};
const allOptions = (term: ChoosableTerm) => term.groups.flatMap((g) => g.options);

/** The renderings shown as chosen in one group: the teacher's choice, else the defaults. */
export function selectedIn(group: TermOptionGroup, choice: string | undefined): readonly string[] {
  return choice !== undefined && hasOption(group, choice) ? [choice] : group.defaults;
}

/** An EDB row with the teacher's own renderings (as stored now) in its preferred group. */
export function withOwn(row: ChoosableTerm, own: readonly string[] = []): ChoosableTerm {
  const listed = row.groups.map((g) => ({ ...g, options: g.options.filter((o) => !o.own) }));
  if (!own.length) return row.groups.some((g) => g.options.some((o) => o.own)) ? { ...row, groups: listed } : row;
  const at = Math.max(0, listed.findIndex((g) => g.options.some((o) => o.rank === 1 && g.defaults.includes(o.display))));
  const sense = listed[at]?.options[0]?.sense ?? 0;
  const mine: TermOption[] = own.map((display) => ({ display, sense, rank: 0, own: true }));
  return { ...row, groups: listed.map((g, i) => (i === at ? { ...g, options: [...g.options, ...mine] } : g)) };
}

/** A teacher's term as a row: its renderings in order, the first preferred. */
export function customRow(id: string, term: CustomTerm): ChoosableTerm {
  return {
    entryId: -1,
    en: term.en,
    groups: [{ sense: 0, options: term.zh.map((display, i) => ({ display, sense: 0, rank: i + 1 })), defaults: [term.zh[0]] }],
    common: false,
    custom: { id, ...(term.abbreviation ? { abbreviation: term.abbreviation } : {}), ...(term.forms?.length ? { forms: term.forms } : {}) },
  };
}

/** Only rows the data can honour: a choice of a listed or added rendering, related with a choice. */
export function cleanPreferences(prefs: Prefs, rows: ReadonlyMap<string, ChoosableTerm>): Prefs {
  const choices: Record<string, string> = {};
  for (const [key, display] of Object.entries(prefs.choices)) {
    if (rows.get(key)?.groups.some((g) => hasOption(g, display))) choices[key] = display;
  }
  const related: Record<string, true> = {};
  for (const key of Object.keys(prefs.related)) if (key in choices) related[key] = true;
  return { ...prefs, choices, related };
}

/** Choosing `display` for an EDB term. The sole default of its group clears the choice instead. */
export function pick(prefs: Prefs, term: ChoosableTerm, display: string): Prefs {
  if (term.custom) return preferCustom(prefs, term.custom.id, display);
  const group = term.groups.find((g) => hasOption(g, display));
  if (!group) return prefs;
  if (group.defaults.length === 1 && group.defaults[0] === display) return resetTerm(prefs, term.en);
  return { ...prefs, choices: { ...prefs.choices, [term.en]: display } };
}

/** Clears the choice (and its related terms); the teacher's own renderings stay. */
export function resetTerm(prefs: Prefs, key: string): Prefs {
  if (!(key in prefs.choices) && !(key in prefs.related)) return prefs;
  return { ...prefs, choices: without(prefs.choices, key), related: without(prefs.related, key) };
}

/** Reset all: every choice and related follow-through; own renderings and terms are kept. */
export const resetChoices = (prefs: Prefs): Prefs => ({ ...prefs, choices: {}, related: {} });

export function setRelated(prefs: Prefs, key: string, on: boolean): Prefs {
  const related = without(prefs.related, key);
  if (on && key in prefs.choices) related[key] = true;
  return { ...prefs, related };
}

export type RenderingError = 'invalid' | 'duplicate' | 'tooMany';

/** A rendering the teacher typed for `term`, cleaned, or why not. */
export function checkRendering(term: ChoosableTerm, text: string, replacing?: string): { value: string } | { error: RenderingError } {
  const value = cleanRendering(text);
  if (!value) return { error: 'invalid' };
  if (allOptions(term).some((o) => o.display === value && o.display !== replacing)) return { error: 'duplicate' };
  if (!replacing && allOptions(term).filter((o) => o.own).length >= MAX_RENDERINGS) return { error: 'tooMany' };
  return { value };
}

/** Adds the teacher's own rendering to an EDB term and chooses it. */
export function addOwn(prefs: Prefs, term: ChoosableTerm, text: string): Prefs | { error: RenderingError } {
  const checked = checkRendering(term, text);
  if ('error' in checked) return checked;
  const own = [...(prefs.own[term.en] ?? []), checked.value];
  return { ...prefs, own: { ...prefs.own, [term.en]: own }, choices: { ...prefs.choices, [term.en]: checked.value } };
}

/** Replaces one of the teacher's renderings; a choice of it moves with it. */
export function editOwn(prefs: Prefs, term: ChoosableTerm, old: string, text: string): Prefs | { error: RenderingError } {
  const checked = checkRendering(term, text, old);
  if ('error' in checked) return checked;
  const own = (prefs.own[term.en] ?? []).map((d) => (d === old ? checked.value : d));
  const choices = prefs.choices[term.en] === old ? { ...prefs.choices, [term.en]: checked.value } : prefs.choices;
  return { ...prefs, own: { ...prefs.own, [term.en]: own }, choices };
}

/** Deletes one of the teacher's renderings; when it was the choice, the default returns. */
export function deleteOwn(prefs: Prefs, key: string, display: string): Prefs {
  const rest = (prefs.own[key] ?? []).filter((d) => d !== display);
  const own = rest.length ? { ...prefs.own, [key]: rest } : without(prefs.own, key);
  const next = { ...prefs, own };
  return prefs.choices[key] === display ? resetTerm(next, key) : next;
}

/** A term form as typed: English, other forms and renderings as text. */
export interface TermDraft {
  en: string;
  /** Comma-separated. */
  forms: string;
  abbreviation: string;
  /** Separated by "/" or line breaks; the first is preferred. */
  zh: string;
}

export const emptyDraft = (): TermDraft => ({ en: '', forms: '', abbreviation: '', zh: '' });

export const draftOf = (term: CustomTerm): TermDraft => ({
  en: term.en,
  forms: (term.forms ?? []).join(', '),
  abbreviation: term.abbreviation ?? '',
  zh: term.zh.join(' / '),
});

export type TermError =
  | { field: 'en'; kind: 'invalid' }
  | { field: 'en' | 'forms' | 'abbreviation'; kind: 'edb'; key: string }
  | { field: 'en' | 'forms' | 'abbreviation'; kind: 'taken'; other: string }
  | { field: 'abbreviation'; kind: 'invalid' }
  | { field: 'zh'; kind: 'invalid' };

const splitList = (text: string, by: RegExp) => text.split(by).map((s) => s.trim()).filter(Boolean);

/**
 * Saves a teacher's term (new, or `id` edited), or says what is wrong. English the EDB
 * glossary already has is refused with its key, so the teacher adds their wording there.
 */
export function saveTerm(
  prefs: Prefs,
  draft: TermDraft,
  edbKeyFor: (english: string) => string | undefined,
  id?: string,
): { prefs: Prefs; id: string } | { error: TermError } {
  const en = cleanEnglish(draft.en);
  if (!en) return { error: { field: 'en', kind: 'invalid' } };
  const abbreviationText = draft.abbreviation.trim();
  const abbreviation = abbreviationText ? cleanAbbreviation(abbreviationText) : undefined;
  if (abbreviationText && !abbreviation) return { error: { field: 'abbreviation', kind: 'invalid' } };
  const zh = splitList(draft.zh, /[/／\n]/);
  const term = cleanCustomTerm({ en, forms: splitList(draft.forms, /[,\n]/), abbreviation, zh });
  if (!term || term.zh.length !== new Set(zh.map((z) => z.normalize('NFC'))).size) return { error: { field: 'zh', kind: 'invalid' } };
  const names: Array<['en' | 'forms' | 'abbreviation', string]> = [
    ['en', term.en],
    ...(term.forms ?? []).map((f): ['forms', string] => ['forms', f]),
    ...(term.abbreviation ? [['abbreviation', term.abbreviation] as ['abbreviation', string]] : []),
  ];
  for (const [field, name] of names) {
    const key = edbKeyFor(name);
    if (key) return { error: { field, kind: 'edb', key } };
  }
  for (const [otherId, other] of Object.entries(prefs.terms)) {
    if (otherId === id) continue;
    const taken = new Set([other.en, ...(other.forms ?? []), ...(other.abbreviation ? [other.abbreviation] : [])].map((n) => n.toLowerCase()));
    const clash = names.find(([, n]) => taken.has(n.toLowerCase()));
    if (clash) return { error: { field: clash[0], kind: 'taken', other: other.en } };
  }
  const key = id ?? newTermId((x) => x in prefs.terms);
  return { prefs: { ...prefs, terms: { ...prefs.terms, [key]: term } }, id: key };
}

export const deleteTerm = (prefs: Prefs, id: string): Prefs => ({ ...prefs, terms: without(prefs.terms, id) });

/** Makes `display` the preferred (first) rendering of a teacher's term. */
export function preferCustom(prefs: Prefs, id: string, display: string): Prefs {
  const term = prefs.terms[id];
  if (!term || term.zh[0] === display || !term.zh.includes(display)) return prefs;
  return { ...prefs, terms: { ...prefs.terms, [id]: { ...term, zh: [display, ...term.zh.filter((d) => d !== display)] } } };
}

/** Anything the teacher chose, added, or follows related terms for. */
export const isMine = (term: ChoosableTerm, prefs: Prefs) =>
  !!term.custom || term.en in prefs.choices || term.en in prefs.own || term.en in prefs.related;

/** English (any case), other forms, abbreviation or any rendering contains the query. */
export function matches(term: ChoosableTerm, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const lower = q.toLowerCase();
  const names = [term.en, ...(term.custom?.forms ?? []), term.custom?.abbreviation ?? ''];
  if (names.some((n) => n.toLowerCase().includes(lower))) return true;
  return allOptions(term).some((o) => o.display.includes(q));
}

/**
 * The rows to show: the common choices first, then the rest in glossary order, then the
 * teacher's terms. "With choices" holds rows offering more than one rendering; a search
 * there looks through every term, so any entry can be found and given a wording.
 */
export function visibleTerms(
  terms: readonly ChoosableTerm[],
  prefs: Prefs,
  filter: TermFilter,
  query: string,
): { common: ChoosableTerm[]; rest: ChoosableTerm[] } {
  const inFilter = (t: ChoosableTerm) => {
    if (filter === 'mine') return isMine(t, prefs);
    if (filter === 'all' || query.trim()) return true;
    return !t.custom && allOptions(t).length > 1;
  };
  const shown = terms.filter((t) => inFilter(t) && matches(t, query));
  // The GDP family (one group across its senses) leads, then the import family.
  const spansSenses = (t: ChoosableTerm) => (t.groups[0]?.sense === undefined ? 0 : 1);
  const common = shown.filter((t) => t.common).sort((a, b) => spansSenses(a) - spansSenses(b));
  return { common, rest: shown.filter((t) => !t.common) };
}

/** How many rows each filter holds (the counts on its labels). */
export function filterCounts(terms: readonly ChoosableTerm[], prefs: Prefs): Record<TermFilter, number> {
  let choices = 0;
  let mine = 0;
  for (const t of terms) {
    if (!t.custom && allOptions(t).length > 1) choices++;
    if (isMine(t, prefs)) mine++;
  }
  return { choices, all: terms.length, mine };
}
