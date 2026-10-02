/**
 * Builds the `Glossary` from the raw JSON: parse, index, and bind the check, pins and
 * auto-fix to that index. Reached only through `load.ts`'s dynamic import, with the data.
 * The parse and the English index are made once per data; term preferences only re-make
 * the entries they change and the Chinese index.
 */
import type { ChoosableTerm, Glossary, GlossaryEntry, GlossaryMatchEn, TermPreferences } from './types';
import { DENY, type DenyRow } from './deny';
import { parseGlossary, type RawGlossary } from './parse';
import { buildEnMatcher, type EnMatcher } from './matchEn';
import { buildZhMatcher, type ZhMatcher } from './matchZh';
import { autoFix, checkEnToZh, checkZhToEn, indexVariants, type GlossaryIndex } from './check';
import { pin } from './pin';
import { foldZh, unfoldSpan } from './fold';
import {
  choosableTerms,
  NO_PREFERENCES,
  relatedFor,
  resolveChoices,
  sanitizePreferences,
  withChoice,
  type ChoiceContext,
} from './choices';

interface Prepared {
  raw: RawGlossary;
  entries: readonly GlossaryEntry[];
  deny: ReadonlyMap<number, DenyRow[]>;
  en: EnMatcher;
  zh: ZhMatcher;
  choosable: readonly ChoosableTerm[];
  ctx: ChoiceContext;
}

function prepare(raw: RawGlossary, denyRows: readonly DenyRow[]): Prepared {
  const entries = parseGlossary(raw);
  const byKey = new Map(entries.map((e) => [e.en, e]));
  const deny = new Map<number, DenyRow[]>();
  for (const row of denyRows) {
    const entry = byKey.get(row.en);
    if (!entry) continue;
    deny.set(entry.id, [...(deny.get(entry.id) ?? []), row]);
  }
  const en = buildEnMatcher(entries);
  const zh = buildZhMatcher(entries);
  const choosable = choosableTerms(entries);
  // Parent → the entries whose own English contains it (GDP → real GDP, per capita GDP).
  const containing = new Map<number, number[]>();
  for (const entry of entries) {
    const inside = new Set(entry.enForms.flatMap((form) => en.matchEnAll(form).map((h) => h.entryId)));
    for (const id of inside) if (id !== entry.id) containing.set(id, [...(containing.get(id) ?? []), entry.id]);
  }
  const renderings = new Map<string, number[]>();
  for (const entry of entries) {
    for (const v of new Set(entry.senses.flatMap((s) => s.ranks.flat()))) renderings.set(v, [...(renderings.get(v) ?? []), entry.id]);
  }
  const ctx: ChoiceContext = {
    entries,
    byKey,
    choosable: new Map(choosable.map((t) => [t.entryId, t])),
    containing,
    denyForms: [...new Set(denyRows.flatMap((r) => r.forms))],
    renderingOf: (text) => renderings.get(text) ?? [],
  };
  return { raw, entries, deny, en, zh, choosable, ctx };
}

const prepared = new WeakMap<RawGlossary, Prepared>();

export function createGlossary(
  raw: RawGlossary,
  denyRows: readonly DenyRow[] = DENY,
  preferences: TermPreferences = NO_PREFERENCES,
): Glossary {
  let base = denyRows === DENY ? prepared.get(raw) : undefined;
  if (!base) {
    base = prepare(raw, denyRows);
    if (denyRows === DENY) prepared.set(raw, base);
  }
  const prefs = sanitizePreferences(base.ctx, preferences);
  const choices = resolveChoices(base.ctx, prefs);
  const entries = choices.size ? base.entries.map((e) => (choices.has(e.id) ? withChoice(e, choices.get(e.id)!) : e)) : base.entries;
  const derived = [...choices.values()].some((c) => c.derived.length);
  const en = base.en;
  const zh = derived ? buildZhMatcher(entries) : base.zh;
  const index: GlossaryIndex = {
    entries,
    en,
    zh,
    variants: new Map(entries.map((e) => [e.id, indexVariants(e)])),
    deny: base.deny,
  };
  const ctx = base.ctx;
  const strip = ({ entryId, start, end, viaAbbreviation }: GlossaryMatchEn) => ({ entryId, start, end, viaAbbreviation });
  return {
    meta: {
      source: raw.meta.source,
      publisher: raw.meta.publisher,
      year: raw.meta.year,
      entries: raw.meta.total_entries,
    },
    entries,
    matchEn: (text) => en.matchEn(text).map(strip),
    matchEnAll: (text) => en.matchEnAll(text).map(strip),
    matchZh(text) {
      const folded = foldZh(text);
      return zh.matchFolded(folded.folded).map((h) => ({ entryIds: h.entryIds, ...unfoldSpan(folded, h.from, h.to) }));
    },
    checkEnToZh: (sourceEn, outputZh) => checkEnToZh(index, sourceEn, outputZh),
    checkZhToEn: (sourceZh, outputEn) => checkZhToEn(index, sourceZh, outputEn),
    pin: (texts, direction, opts) => pin(index, texts, direction, opts),
    autoFix: (sourceEn, zhRuns) => autoFix(index, sourceEn, zhRuns),
    preferences: prefs,
    choosable: base.choosable,
    related(key, display) {
      const entry = ctx.byKey.get(key);
      if (!entry) return [];
      const chosen = new Set(Object.keys(prefs.choices).filter((k) => k !== key).map((k) => ctx.byKey.get(k)!.id));
      return relatedFor(ctx, entry, display, chosen);
    },
  };
}
