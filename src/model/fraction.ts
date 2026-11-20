/**
 * Stacked fractions in run text (GitHub #8, k-0479): ΔQ over Q, (Q₂ − Q₁) over Q₁.
 *
 * A fraction is not a new block or a new kind of run. It is ordinary runs carrying the
 * optional `InlineRun.fraction` mark:
 *
 *   [ …text… ][ fraction: 'num' runs… ][ fraction: 'den' runs, the first starting "⁄" ][ …text… ]
 *
 * - The numerator is a stretch of adjacent `num` runs; the denominator the stretch of `den`
 *   runs right after it. Each part is plain runs, so Q₁ inside a fraction is the same
 *   subscript run it is anywhere else, and bold/italic/underline work as they do outside.
 * - The denominator's text starts with U+2044 FRACTION SLASH, which every renderer hides.
 *   It is real text: offsets, `plain()`, search and the character counts all see
 *   "ΔQ⁄Q". It is also what keeps the words readable where the mark is not understood:
 *   a build from before k-0479 keeps unknown run keys and prints the runs inline, so it
 *   shows "ΔQ⁄Q", never "ΔQQ" (no schema bump, see SYSTEM_ARCHITECTURE § Schema evolution).
 * - Reading is tolerant (`textSegments`): a `den` stretch with no numerator before it, or
 *   one not starting with the slash, or a numerator with no denominator, prints as plain
 *   text. A translation or an older build that mangles the marks loses the stacking,
 *   never the words.
 */

import type { InlineRun, RichText } from './types';

/** U+2044, the character between numerator and denominator in run text. */
export const FRACTION_SLASH = '⁄';

export type FractionPart = 'num' | 'den';

/** One piece of a field's runs as the renderers draw it. */
export type TextSegment =
  | { kind: 'runs'; runs: RichText; start: number }
  | {
      kind: 'fraction';
      /** The numerator's runs, without the `fraction` mark. */
      num: RichText;
      /** The denominator's runs, without the `fraction` mark or the leading slash. */
      den: RichText;
      /** Offset of the fraction's first character in the field's text. */
      start: number;
      /** Offset just past its last character. */
      end: number;
    };

/** A run without its fraction mark: what a part's runs look like to a renderer. */
export function unmarked(run: InlineRun): InlineRun {
  if (run.fraction === undefined) return run;
  const rest = { ...run };
  delete rest.fraction;
  return rest;
}

/** Whether any run carries a well-formed fraction (cheap check before segmenting). */
export function hasFraction(runs: RichText | undefined): boolean {
  return Boolean(runs?.some((run) => run.fraction === 'den' && run.text.startsWith(FRACTION_SLASH)));
}

/**
 * The runs split into plain stretches and fractions, in order, tolerant of any damage
 * (module comment). Plain stretches keep their runs as stored, except that a stray
 * `fraction` mark is dropped so no renderer has to know about it.
 */
export function textSegments(runs: RichText | undefined): TextSegment[] {
  const source = runs ?? [];
  const out: TextSegment[] = [];
  let pending: RichText = [];
  let pendingStart = 0;
  let offset = 0;
  const flush = () => {
    if (pending.length > 0) out.push({ kind: 'runs', runs: pending, start: pendingStart });
    pending = [];
  };
  const keep = (run: InlineRun, at: number) => {
    if (pending.length === 0) pendingStart = at;
    pending.push(unmarked(run));
  };

  let index = 0;
  while (index < source.length) {
    const run = source[index];
    if (run.fraction !== 'num') {
      keep(run, offset);
      offset += run.text.length;
      index += 1;
      continue;
    }
    // A numerator stretch, then (if well-formed) its denominator stretch.
    let cursor = index;
    let numLength = 0;
    while (cursor < source.length && source[cursor].fraction === 'num') {
      numLength += source[cursor].text.length;
      cursor += 1;
    }
    const denFrom = cursor;
    let denLength = 0;
    while (cursor < source.length && source[cursor].fraction === 'den') {
      denLength += source[cursor].text.length;
      cursor += 1;
    }
    const wellFormed = denFrom < cursor && source[denFrom].text.startsWith(FRACTION_SLASH);
    if (!wellFormed) {
      // Not a fraction: the numerator's runs print as text; any `den` runs after it are
      // handled by the loop (as text, since they are not `num`).
      for (let at = index; at < denFrom; at += 1) {
        keep(source[at], offset);
        offset += source[at].text.length;
      }
      index = denFrom;
      continue;
    }
    flush();
    const num = source.slice(index, denFrom).map(unmarked);
    const den = source.slice(denFrom, cursor).map(unmarked);
    den[0] = { ...den[0], text: den[0].text.slice(FRACTION_SLASH.length) };
    out.push({
      kind: 'fraction',
      num: num.filter((part) => part.text.length > 0),
      den: den.filter((part) => part.text.length > 0),
      start: offset,
      end: offset + numLength + denLength,
    });
    offset += numLength + denLength;
    index = cursor;
  }
  flush();
  return out;
}

/** The runs that store a fraction of `num` over `den` (both plain runs, any marks dropped). */
export function fractionRuns(num: RichText, den: RichText): RichText {
  const clean = (runs: RichText) => runs.map(unmarked).filter((run) => run.text.length > 0);
  const top = clean(num);
  const bottom = clean(den);
  const numRuns: RichText = (top.length > 0 ? top : [{ text: ' ' }]).map((run) => ({ ...run, fraction: 'num' as const }));
  const denRuns: RichText = bottom.map((run) => ({ ...run, fraction: 'den' as const }));
  // The slash takes the formatting of the denominator's first run, so no new run is made.
  if (denRuns.length === 0) denRuns.push({ text: FRACTION_SLASH, fraction: 'den' });
  else denRuns[0] = { ...denRuns[0], text: FRACTION_SLASH + denRuns[0].text };
  return [...numRuns, ...denRuns];
}

/** The fraction covering `offset` (start ≤ offset < end), if any. */
export function fractionAt(runs: RichText | undefined, offset: number): Extract<TextSegment, { kind: 'fraction' }> | undefined {
  for (const segment of textSegments(runs)) {
    if (segment.kind === 'fraction' && segment.start <= offset && offset < segment.end) return segment;
  }
  return undefined;
}

/**
 * The fraction's text as one line, for places that cannot stack: "(ΔQ)/(Q)" with brackets
 * only where a part has more than one term. Used for plain-text output.
 */
export function linearFraction(num: string, den: string): string {
  const wrap = (part: string) => (/^[\p{L}\p{N}.%₀-₉⁰-⁹]+$/u.test(part.trim()) ? part.trim() : `(${part.trim()})`);
  return `${wrap(num)}/${wrap(den)}`;
}
