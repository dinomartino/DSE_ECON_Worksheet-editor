import type { ChoosableTerm, TermOptionGroup, TermPreferences } from '@/glossary/types';

/**
 * Settings → Translation terms, pure: which rows show, what a chip shows as chosen, and
 * the preferences a click writes. A choice is a pick from the renderings the data lists,
 * never free text; one choice per term.
 */

export type TermFilter = 'all' | 'changed';

export const EMPTY_PREFERENCES: TermPreferences = { choices: {}, related: {} };

const hasOption = (group: TermOptionGroup, display: string) => group.options.some((o) => o.display === display);

/** The renderings shown as chosen in one group: the teacher's choice, else the defaults. */
export function selectedIn(group: TermOptionGroup, choice: string | undefined): readonly string[] {
  return choice !== undefined && hasOption(group, choice) ? [choice] : group.defaults;
}

/** Only rows this glossary can honour: a listed rendering of a choosable term. */
export function cleanPreferences(prefs: TermPreferences, terms: ReadonlyMap<string, ChoosableTerm>): TermPreferences {
  const choices: Record<string, string> = {};
  for (const [key, display] of Object.entries(prefs.choices)) {
    if (terms.get(key)?.groups.some((g) => hasOption(g, display))) choices[key] = display;
  }
  const related: Record<string, true> = {};
  for (const key of Object.keys(prefs.related)) if (key in choices) related[key] = true;
  return { choices, related };
}

/** Choosing `display` for `term`. The sole default of its group clears the choice instead. */
export function pick(prefs: TermPreferences, term: ChoosableTerm, display: string): TermPreferences {
  const group = term.groups.find((g) => hasOption(g, display));
  if (!group) return prefs;
  if (group.defaults.length === 1 && group.defaults[0] === display) return resetTerm(prefs, term.en);
  return { choices: { ...prefs.choices, [term.en]: display }, related: prefs.related };
}

export function resetTerm(prefs: TermPreferences, key: string): TermPreferences {
  if (!(key in prefs.choices) && !(key in prefs.related)) return prefs;
  const choices = { ...prefs.choices };
  const related = { ...prefs.related };
  delete choices[key];
  delete related[key];
  return { choices, related };
}

export function setRelated(prefs: TermPreferences, key: string, on: boolean): TermPreferences {
  const related = { ...prefs.related };
  if (on && key in prefs.choices) related[key] = true;
  else delete related[key];
  return { choices: prefs.choices, related };
}

/** English (any case) or any listed rendering contains the query. */
export function matches(term: ChoosableTerm, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  if (term.en.toLowerCase().includes(q.toLowerCase())) return true;
  return term.groups.some((g) => g.options.some((o) => o.display.includes(q)));
}

/** The rows to show: the common choices first, then the rest in glossary order. */
export function visibleTerms(
  terms: readonly ChoosableTerm[],
  prefs: TermPreferences,
  filter: TermFilter,
  query: string,
): { common: ChoosableTerm[]; rest: ChoosableTerm[] } {
  const shown = terms.filter((t) => (filter === 'all' || t.en in prefs.choices) && matches(t, query));
  // The GDP family (one group across its senses) leads, then the import family.
  const spansSenses = (t: ChoosableTerm) => (t.groups[0]?.sense === undefined ? 0 : 1);
  const common = shown.filter((t) => t.common).sort((a, b) => spansSenses(a) - spansSenses(b));
  return { common, rest: shown.filter((t) => !t.common) };
}
