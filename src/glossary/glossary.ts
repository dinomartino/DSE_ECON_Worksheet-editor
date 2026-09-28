/**
 * Builds the `Glossary` from the raw JSON: parse, index, and bind the check, pins and
 * auto-fix to that index. Reached only through `load.ts`'s dynamic import, with the data.
 */
import type { Glossary } from './types';
import { DENY, type DenyRow } from './deny';
import { parseGlossary, type RawGlossary } from './parse';
import { buildEnMatcher } from './matchEn';
import { buildZhMatcher } from './matchZh';
import { autoFix, checkEnToZh, checkZhToEn, indexVariants, type GlossaryIndex } from './check';
import { pin } from './pin';
import { foldZh, unfoldSpan } from './fold';

export function createGlossary(raw: RawGlossary, denyRows: readonly DenyRow[] = DENY): Glossary {
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
  const index: GlossaryIndex = {
    entries,
    en,
    zh,
    variants: new Map(entries.map((e) => [e.id, indexVariants(e)])),
    deny,
  };
  const strip = <T extends { form: string }>({ form: _form, ...hit }: T) => hit;
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
  };
}
