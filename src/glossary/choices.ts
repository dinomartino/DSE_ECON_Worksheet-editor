/**
 * Settings → Translation terms: which renderings a teacher may choose, what a choice changes
 * in related terms, and the entries a set of preferences produces. Layers, lowest first: the
 * verbatim data (rank 1 preferred), PREFERRED_OVERRIDES, the teacher's choices, then the
 * related terms that follow a choice. The JSON is never edited.
 */
import type {
  ChoosableTerm,
  GlossaryEntry,
  RelatedTerm,
  TermChoice,
  TermOption,
  TermOptionGroup,
  TermPreferences,
} from './types';
import { PREFERRED_OVERRIDES } from './overrides';
import { cleanCustomTerm, cleanRenderings, type CustomTerm } from '@/settings/termData';

export const NO_PREFERENCES: TermPreferences = Object.freeze({
  choices: Object.freeze({}),
  related: Object.freeze({}),
});

const overrideChoices = new WeakMap<GlossaryEntry, TermChoice | null>();

/** The choice in force: the entry's own (teacher or related), else PREFERRED_OVERRIDES. */
export function chosenOf(entry: GlossaryEntry): TermChoice | undefined {
  if (entry.choice) return entry.choice;
  let c = overrideChoices.get(entry);
  if (c === undefined) {
    const display = PREFERRED_OVERRIDES[entry.en];
    const sense = display ? entry.senses.findIndex((s) => s.ranks.flat().includes(display)) : -1;
    c = display ? { displays: [display], sense: Math.max(0, sense), derived: [], source: 'default' } : null;
    overrideChoices.set(entry, c);
  }
  return c ?? undefined;
}

/** The pinned senses, once a GDP-family choice has moved the pin to the chosen sense. */
export function pinsOf(entry: GlossaryEntry): readonly number[] | undefined {
  const c = chosenOf(entry);
  if (c && entry.pinSenses && !entry.pinSenses.includes(c.sense)) return [c.sense];
  return entry.pinSenses;
}

export const isPinned = (entry: GlossaryEntry, sense: number) => {
  const pins = pinsOf(entry);
  return !pins || pins.includes(sense);
};

/** The preferred renderings of one sense: the choice when it is in that sense, else rank 1. */
export function preferredIn(entry: GlossaryEntry, sense: number): readonly string[] {
  const c = chosenOf(entry);
  return c && c.sense === sense ? c.displays : entry.senses[sense].ranks[0];
}

/** Every rendering of one sense, ranks in order. */
const variantsOf = (entry: GlossaryEntry, sense: number) => entry.senses[sense].ranks.flat();

function optionsOf(entry: GlossaryEntry, sense: number): TermOption[] {
  return entry.senses[sense].ranks.flatMap((rank, r) => rank.map((display) => ({ display, sense, rank: r + 1 })));
}

/** One group per sense that offers more than one rendering; the GDP family is one group over its senses. */
function groupsOf(entry: GlossaryEntry): TermOptionGroup[] {
  if (entry.pinSenses) {
    const options = entry.senses.flatMap((_, s) => optionsOf(entry, s));
    if (options.length < 2) return [];
    return [{ options, defaults: [...preferredIn(entry, entry.pinSenses[0] ?? 0)] }];
  }
  return entry.senses.flatMap((_, s) => {
    const options = optionsOf(entry, s);
    return options.length > 1 ? [{ sense: s, options, defaults: [...preferredIn(entry, s)] }] : [];
  });
}

export function choosableTerms(entries: readonly GlossaryEntry[]): ChoosableTerm[] {
  const out: ChoosableTerm[] = [];
  for (const entry of entries) {
    const groups = groupsOf(entry);
    if (groups.length) out.push(rowOf(entry, groups));
  }
  return out;
}

const rowOf = (entry: GlossaryEntry, groups: TermOptionGroup[]): ChoosableTerm => ({
  entryId: entry.id,
  en: entry.en,
  groups,
  common: !!entry.pinSenses || entry.en in PREFERRED_OVERRIDES,
});

/**
 * Any EDB entry as a Settings row, with the teacher's own renderings as options in its
 * preferred sense. An entry with one rendering shows that sense alone, so a teacher can
 * add to it.
 */
export function termRow(entry: GlossaryEntry, own: readonly string[] = []): ChoosableTerm {
  const groups = groupsOf(entry);
  const sense = entry.pinSenses?.[0] ?? 0;
  const ownOptions: TermOption[] = own.map((display) => ({ display, sense, rank: 0, own: true }));
  const at = groups.findIndex((g) => g.sense === undefined || g.sense === sense);
  if (at >= 0) groups[at] = { ...groups[at], options: [...groups[at].options, ...ownOptions] };
  else {
    groups.push({ sense, options: [...optionsOf(entry, sense), ...ownOptions], defaults: [...preferredIn(entry, sense)] });
    groups.sort((a, b) => (a.sense ?? 0) - (b.sense ?? 0));
  }
  return rowOf(entry, groups);
}

/** A teacher's term as a Settings row: its renderings in order, the first preferred. */
export function customRow(entry: GlossaryEntry, term: CustomTerm): ChoosableTerm {
  const options = term.zh.map((display, i) => ({ display, sense: 0, rank: i + 1 }));
  return {
    entryId: entry.id,
    en: entry.en,
    groups: [{ sense: 0, options, defaults: [term.zh[0]] }],
    common: false,
    custom: {
      id: entry.custom!.id,
      ...(term.abbreviation ? { abbreviation: term.abbreviation } : {}),
      ...(term.forms?.length ? { forms: term.forms } : {}),
    },
  };
}

/** A teacher's term as a glossary entry: matched, pinned and checked like an EDB one. */
export function customEntry(id: number, storageId: string, term: CustomTerm): GlossaryEntry {
  const forms = dedupe([term.en, ...(term.forms ?? []), ...(term.abbreviation ? [term.abbreviation] : [])]);
  return {
    id,
    en: term.en,
    enForms: forms,
    ...(term.abbreviation ? { abbreviation: term.abbreviation } : {}),
    senses: [{ ranks: term.zh.map((z) => [z]) }],
    tier: 'core',
    raw: '',
    preferred: term.zh[0],
    custom: { id: storageId },
  };
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dedupe = (xs: readonly string[]) => [...new Set(xs)];

/** Everything the related-term rules read, built once per load from the base entries. */
export interface ChoiceContext {
  entries: readonly GlossaryEntry[];
  byKey: ReadonlyMap<string, GlossaryEntry>;
  choosable: ReadonlyMap<number, ChoosableTerm>;
  /** Parent id → the entries whose English contains the parent's (GDP → real GDP). */
  containing: ReadonlyMap<number, readonly number[]>;
  /** Every deny form, folded as written: a derived rendering never contains one. */
  denyForms: readonly string[];
  /** The entries a whole string is a listed rendering of. */
  renderingOf(text: string): readonly number[];
  /** The EDB entry a whole English phrase names (its key), if any. */
  edbKeyFor(english: string): string | undefined;
  /** The teacher's own renderings of an entry (empty on the base context). */
  ownOf(id: number): readonly string[];
}

/** The option a choice names, or undefined when the data does not list it for that entry. */
export function optionFor(ctx: ChoiceContext, entry: GlossaryEntry, display: string): { group: TermOptionGroup; option: TermOption } | undefined {
  for (const group of ctx.choosable.get(entry.id)?.groups ?? []) {
    const option = group.options.find((o) => o.display === display);
    if (option) return { group, option };
  }
  return undefined;
}

/** A choice that changes something: a listed option that is not already the whole default. */
function teacherChoice(ctx: ChoiceContext, entry: GlossaryEntry, display: unknown): TermChoice | undefined {
  if (typeof display !== 'string') return undefined;
  const found = optionFor(ctx, entry, display);
  if (!found) return undefined;
  const { defaults } = found.group;
  if (defaults.length === 1 && defaults[0] === display) return undefined;
  return { displays: [display], sense: found.option.sense, derived: [], source: 'teacher' };
}

/**
 * The terms that follow `parent`'s choice of `to`: their English contains the parent's, and
 * swapping the parent's default renderings for `to` changes their preferred rendering. A swap
 * that lands on a listed rendering is always offered. One the data does not list (derived) is
 * offered only when a core parent's single default is replaced (GDP 本地 → 國內; not a pick
 * between equals, not a generic word), never into the GDP family, never forming a deny form
 * or another entry's rendering. `chosen` are entries the teacher chose for: they never follow.
 */
export function relatedFor(
  ctx: ChoiceContext,
  parent: GlossaryEntry,
  to: string,
  chosen: ReadonlySet<number> = new Set(),
): RelatedTerm[] {
  const found = optionFor(ctx, parent, to);
  if (!found) return [];
  // Only the defaults are swapped: 勞動 in 勞動人口 is not the 勞工 a teacher replaced.
  const others = dedupe(found.group.defaults.filter((d) => d !== to));
  if (!others.length) return [];
  const pattern = new RegExp(others.sort((a, b) => b.length - a.length).map(escapeRe).join('|'), 'g');
  const swap = (s: string) => s.replace(pattern, to);
  const out: RelatedTerm[] = [];
  for (const id of ctx.containing.get(parent.id) ?? []) {
    const entry = ctx.entries[id];
    if (entry.pinSenses || chosen.has(id)) continue;
    const sense = entry.pinSenses?.[0] ?? 0;
    const from = [...preferredIn(entry, sense)];
    const next = dedupe(from.map(swap));
    if (next.length === from.length && next.every((d, i) => d === from[i])) continue;
    const listed = new Set([...variantsOf(entry, sense), ...ctx.ownOf(id)]);
    const clean = (d: string) =>
      parent.tier === 'core' &&
      found.group.defaults.length === 1 &&
      !ctx.denyForms.some((f) => d.includes(f)) &&
      ctx.renderingOf(d).every((other) => other === id);
    const unlisted = next.filter((d) => !listed.has(d));
    if (unlisted.length && !unlisted.every(clean)) continue;
    // The entry's other renderings follow too, so 人均國內生產總值 passes beside 按人口平均計算的….
    const extra = dedupe(variantsOf(entry, sense).map(swap)).filter((d) => !listed.has(d) && !next.includes(d) && clean(d));
    out.push({ entryId: id, en: entry.en, from, to: next, derived: [...unlisted, ...extra] });
  }
  return out;
}

const objectOf = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {};

/** Preferences validated against the data, and what the build needs from them. */
export interface Sanitized {
  prefs: TermPreferences;
  /** The context with the teacher's renderings as options. */
  ctx: ChoiceContext;
  own: ReadonlyMap<number, readonly string[]>;
  custom: ReadonlyArray<{ id: string; term: CustomTerm }>;
}

/**
 * Stored preferences, validated against the data, row by row (one bad row never costs the
 * rest). Dropped: a choice for a key the glossary lacks, a rendering not listed (or added)
 * for that key, a choice equal to the default; `related` without a kept choice or related
 * terms; an own rendering on an unknown key or equal to a listed one; a teacher's term whose
 * English, a form or its abbreviation names an EDB entry or an earlier term of theirs.
 * Never throws on any input.
 */
export function sanitize(base: ChoiceContext, input: unknown): Sanitized {
  const raw = objectOf(input) as Partial<Record<keyof TermPreferences, unknown>>;

  const ownOut: Record<string, string[]> = {};
  const own = new Map<number, string[]>();
  for (const [key, list] of Object.entries(objectOf(raw.own))) {
    const entry = base.byKey.get(key);
    if (!entry) continue;
    const listed = new Set(entry.senses.flatMap((s) => s.ranks.flat()));
    const kept = cleanRenderings(list).filter((d) => !listed.has(d));
    if (!kept.length) continue;
    ownOut[key] = kept;
    own.set(entry.id, kept);
  }

  const termsOut: Record<string, CustomTerm> = {};
  const custom: Array<{ id: string; term: CustomTerm }> = [];
  const used = new Set<string>();
  for (const [id, row] of Object.entries(objectOf(raw.terms))) {
    const term = cleanCustomTerm(row);
    if (!term) continue;
    const names = [term.en, ...(term.forms ?? []), ...(term.abbreviation ? [term.abbreviation] : [])];
    if (names.some((n) => base.edbKeyFor(n) !== undefined || used.has(n.toLowerCase()))) continue;
    for (const n of names) used.add(n.toLowerCase());
    termsOut[id] = term;
    custom.push({ id, term });
  }

  const rows = new Map(base.choosable);
  for (const [id, list] of own) rows.set(id, termRow(base.entries[id], list));
  const ctx: ChoiceContext = { ...base, choosable: rows, ownOf: (id) => own.get(id) ?? [] };

  const choices: Record<string, string> = {};
  for (const [key, display] of Object.entries(objectOf(raw.choices))) {
    const entry = ctx.byKey.get(key);
    if (entry && teacherChoice(ctx, entry, display)) choices[key] = display as string;
  }
  const chosen = new Set(Object.keys(choices).map((k) => ctx.byKey.get(k)!.id));
  const related: Record<string, true> = {};
  for (const [key, on] of Object.entries(objectOf(raw.related))) {
    if (on !== true || !(key in choices)) continue;
    if (relatedFor(ctx, ctx.byKey.get(key)!, choices[key], chosen).length) related[key] = true;
  }
  const prefs: TermPreferences = {
    choices,
    related,
    ...(Object.keys(ownOut).length ? { own: ownOut } : {}),
    ...(custom.length ? { terms: termsOut } : {}),
  };
  return { prefs, ctx, own, custom };
}

/** The validated preferences alone. */
export const sanitizePreferences = (base: ChoiceContext, prefs: unknown): TermPreferences => sanitize(base, prefs).prefs;

/**
 * The choices a valid set of preferences puts in force, by entry id: the teacher's first,
 * then each followed parent's related terms, in source order (the first parent wins a term
 * two parents reach). Empty for NO_PREFERENCES.
 */
export function resolveChoices(ctx: ChoiceContext, prefs: TermPreferences): Map<number, TermChoice> {
  const out = new Map<number, TermChoice>();
  for (const [key, display] of Object.entries(prefs.choices)) {
    const entry = ctx.byKey.get(key);
    const choice = entry && teacherChoice(ctx, entry, display);
    if (entry && choice) out.set(entry.id, choice);
  }
  const chosen = new Set(out.keys());
  const parents = Object.keys(prefs.related)
    .map((key) => ctx.byKey.get(key))
    .filter((e): e is GlossaryEntry => !!e && chosen.has(e.id))
    .sort((a, b) => a.id - b.id);
  for (const parent of parents) {
    for (const rel of relatedFor(ctx, parent, prefs.choices[parent.en], chosen)) {
      if (out.has(rel.entryId)) continue;
      const sense = ctx.entries[rel.entryId].pinSenses?.[0] ?? 0;
      out.set(rel.entryId, { displays: rel.to, sense, derived: rel.derived, source: 'related', follows: parent.en });
    }
  }
  return out;
}

/** `entry` under `choice`: `preferred` moves when the choice is in the first pinned sense. */
export function withChoice(entry: GlossaryEntry, choice: TermChoice): GlossaryEntry {
  const next: GlossaryEntry = { ...entry, choice };
  const first = pinsOf(next)?.[0] ?? 0;
  if (choice.sense === first) next.preferred = choice.displays[0];
  return next;
}
