/**
 * Prompt pins: one line per glossary term in a chunk's sources, first occurrence first.
 * EN→ZH shows only the preferred rendering (rank 1, the import family's 進口, or the
 * teacher's choice from Settings → Translation terms): showing
 * lower ranks invites them. The check still accepts every listed variant.
 */
import type { Direction } from '@/translate/types';
import type { GlossaryEntry, GlossarySense, PinnedTerm } from './types';
import { pinsOf, preferredIn } from './choices';
import { foldZh, unfoldSpan } from './fold';
import { variantForms } from './matchZh';
import { pinnableZh, type GlossaryIndex } from './check';

const PIN_LIMIT = 200;

const NOTE_EN: Readonly<Record<NonNullable<GlossarySense['note']>, string>> = {
  floatingRate: 'floating exchange rate',
  fixedRate: 'fixed exchange rate',
  quantityOrValue: 'quantity or value',
};
const NOTE_ZH_TO_EN: Readonly<Partial<Record<NonNullable<GlossarySense['note']>, string>>> = {
  floatingRate: 'floating rate',
  fixedRate: 'fixed rate',
};

function senseRendering(entry: GlossaryEntry, s: number): string {
  const sense = entry.senses[s];
  const text = preferredIn(entry, s).join(' / ');
  return sense.note ? `${text} [${NOTE_EN[sense.note]}]` : text;
}

function lineToZh(index: GlossaryIndex, entry: GlossaryEntry, form: string, denyHints: boolean): string {
  const shown = pinsOf(entry) ?? entry.senses.map((_, i) => i);
  const renderings = shown.map((i) => senseRendering(entry, i));
  let line =
    renderings.length === 1
      ? `${form} → ${renderings[0]}`
      : `${form} → ${renderings.map((r, i) => `(${i + 1}) ${r}`).join(' ')} — choose by meaning`;
  if (denyHints) {
    const not = (index.deny.get(entry.id) ?? []).filter((r) => !r.reversal).flatMap((r) => r.forms).slice(0, 2);
    if (not.length) line += ` (not ${not.join(', ')})`;
  }
  return entry.tier === 'generic' ? `[only if economic sense] ${line}` : line;
}

/** "appreciation (floating rate)": the key, plus the regime of the sense that matched. */
function keyToEn(entry: GlossaryEntry, folded: string): string {
  const sense = entry.senses.find((s) => s.ranks.flat().some((v) => variantForms(v).includes(folded)));
  const note = sense?.note && NOTE_ZH_TO_EN[sense.note];
  return note ? `${entry.en} (${note})` : entry.en;
}

export function pin(
  index: GlossaryIndex,
  texts: readonly string[],
  direction: Direction,
  opts: { denyHints?: boolean; limit?: number } = {},
): PinnedTerm[] {
  const limit = opts.limit ?? PIN_LIMIT;
  const pins: PinnedTerm[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (direction === 'toZh') {
      for (const hit of index.en.matchEn(text)) {
        if (pins.length >= limit) return pins;
        if (seen.has(String(hit.entryId))) continue;
        seen.add(String(hit.entryId));
        const entry = index.entries[hit.entryId];
        pins.push({ entryId: entry.id, line: lineToZh(index, entry, hit.form, !!opts.denyHints), tier: entry.tier });
      }
      continue;
    }
    const src = foldZh(text);
    for (const seg of index.zh.matchFolded(src.folded)) {
      if (pins.length >= limit) return pins;
      const candidates = pinnableZh(index, seg, src.folded);
      const key = candidates?.map((e) => e.id).join(',');
      if (!candidates || !key || seen.has(key)) continue;
      seen.add(key);
      const { start, end } = unfoldSpan(src, seg.from, seg.to);
      const folded = src.folded.slice(seg.from, seg.to);
      const keys = candidates.map((e) => keyToEn(e, folded));
      const line = `${text.slice(start, end)} → ${keys.join(' / ')}${keys.length > 1 ? ' — choose by context' : ''}`;
      pins.push({ entryId: candidates[0].id, line, tier: 'core' });
    }
  }
  return pins;
}
