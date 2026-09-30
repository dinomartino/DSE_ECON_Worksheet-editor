import { pageNumberPlaceholder } from './page';
import { emptyBiText, plain } from './text';
import type { BandField, BandFieldSide, BiText, LanguageMode, RichText } from './types';

/**
 * A band field decomposed into **authored text · derived value · authored text** —
 * said once, here, so surfaces and backends walk segments instead of branching on
 * `field.kind`. The derived value stays derived: a `value` segment is computed at
 * render time, never stored.
 */

/** One piece of a field's printed line. */
export type BandSegment =
  /**
   * Authored, editable text. `side` names where to write it back — the same vocabulary
   * `applyBandFieldSide` writes and `bandFieldSideText` reads, so a segment that renders
   * can always be committed.
   */
  | { kind: 'text'; side: BandFieldSide; text: BiText }
  /**
   * A derived value: a marks total, a page number, a fill-in's rule. Printed, never
   * typed into — there is nowhere to write a change back to.
   *
   * `token` is what the .docx backend switches on to emit a native field (`PAGE`,
   * `NUMPAGES`) instead of a literal, so the number stays live in Word.
   */
  | { kind: 'value'; token: 'totalMarks' | 'page' | 'pageCount' | 'rule'; text: BiText };

/** What a computed segment needs to know to print itself. */
export interface BandSegmentContext {
  totalMarks: number;
  /**
   * The sheet being drawn, when one is known.
   *
   * Absent for the .docx backend (Word numbers the pages itself) and for a document not
   * yet paginated, where the placeholder is left standing rather than guessed at.
   */
  page?: { number: number; count: number };
}

const biOf = (en: string, zh: string): BiText => ({ en: [{ text: en }], zh: [{ text: zh }] });
const same = (text: string): BiText => biOf(text, text);

/**
 * The wording each computed kind ships with, as authored text a teacher can retype.
 *
 * These were string literals inside `bandFieldText`; they are defaults now, which is the
 * whole point — a default is a starting value, and the previous spelling was a fixture.
 * Migration copies them onto existing documents so an older worksheet keeps printing
 * exactly what it printed before (§ `migrateFieldWording`).
 */
export const DEFAULT_FIELD_WORDING: Record<
  Exclude<BandField['kind'], 'text'>,
  { prefix: BiText; suffix: BiText }
> = {
  totalMarks: {
    prefix: biOf('Full marks: ', '總分：'),
    suffix: biOf(' marks', '分'),
  },
  fillIn: {
    prefix: biOf('Name:', '姓名：'),
    suffix: { en: [], zh: [] },
  },
  pageNumber: {
    prefix: { en: [], zh: [] },
    suffix: { en: [], zh: [] },
  },
};

/**
 * The authored text on one side of a field, falling back to the deprecated `label`.
 *
 * `label` is read here and only here. A v5 document stores its wording as a plain
 * `label` with the rest of the phrasing hardcoded in the renderer; migration rewrites
 * that into `prefix`/`suffix`, and this fallback covers a document that reaches the model
 * without passing through `migrate()` — a fixture, a paste, a `__unknown` round trip.
 */
export function bandFieldSideText(field: BandField, side: BandFieldSide): BiText {
  if (field.kind === 'text') return side === 'prefix' ? field.text : emptyBiText();

  const stored = field[side];
  if (stored) return stored;

  const defaults = DEFAULT_FIELD_WORDING[field.kind];
  if (side === 'prefix' && 'label' in field && field.label) return field.label;
  return defaults[side];
}

/**
 * Split `field` into the segments that print it, in order.
 *
 * The one decomposition every consumer shares. `BandEditor` renders each `text` segment
 * as its own editable span and each `value` as an inert chip; the .docx backend emits
 * runs for the former and native fields for the latter; `bandFieldText` (below)
 * concatenates the lot for consumers that only want the string.
 *
 * Empty authored segments are kept rather than filtered. An empty prefix is where a
 * teacher clicks to *write* one, so dropping it would make a field that has been cleared
 * permanently uneditable — the same reason `bandsShouldRender` keeps an empty band list
 * alive while editing.
 */
export function bandFieldSegments(
  field: BandField,
  context: BandSegmentContext,
): BandSegment[] {
  if (field.kind === 'text') {
    return [{ kind: 'text', side: 'prefix', text: field.text }];
  }

  const prefix: BandSegment = {
    kind: 'text',
    side: 'prefix',
    text: bandFieldSideText(field, 'prefix'),
  };
  const suffix: BandSegment = {
    kind: 'text',
    side: 'suffix',
    text: bandFieldSideText(field, 'suffix'),
  };

  if (field.kind === 'totalMarks') {
    const total = String(context.totalMarks);
    return [prefix, { kind: 'value', token: 'totalMarks', text: same(total) }, suffix];
  }

  if (field.kind === 'fillIn') {
    // The rule is generated from the width, so it is a value rather than typed
    // underscores — which would not align once the surrounding text changes size.
    const rule = '_'.repeat(Math.max(1, field.widthCh ?? 14));
    return [prefix, { kind: 'value', token: 'rule', text: same(rule) }, suffix];
  }

  /*
   * A page number interleaves: the pattern is the authored wording *between* the numbers,
   * so it is split on its own placeholders rather than concatenated around them. "Page 5
   * of 12" is authored "Page ", the page, authored " of ", the count, authored "".
   *
   * The pattern's literal parts become segments here rather than being stored on the
   * field, so choosing a different pattern still reshapes the line; what the teacher
   * types into `prefix`/`suffix` wraps the whole idiom and survives that change.
   */
  const segments: BandSegment[] = [prefix];
  for (const chunk of pageNumberPlaceholder(field.pattern).split(/(#|N)/)) {
    if (chunk === '#') {
      segments.push({
        kind: 'value',
        token: 'page',
        text: same(context.page ? String(context.page.number) : '#'),
      });
    } else if (chunk === 'N') {
      segments.push({
        kind: 'value',
        token: 'pageCount',
        text: same(context.page ? String(context.page.count) : 'N'),
      });
    } else if (chunk) {
      // Pattern literals are not stored, so they are not writable: there is no field to
      // commit them to. They ride as a `value` with no token of their own.
      segments.push({ kind: 'value', token: 'page', text: same(chunk) });
    }
  }
  segments.push(suffix);
  return segments;
}

/**
 * Which language lines a field prints, in order, under `language`.
 *
 * A single-language export prints its own side, always. Bilingual stacks English over
 * 中文, but only a side that says something the other does not:
 *
 * - **Identical sides print once.** A paper code ("2026-27-ECON 2–") is authored the same
 *   in both, and a derived value (a page number, a total) is the same on both sides by
 *   construction — stacked, the QAB footer printed its code and its page number twice.
 * - **A side with no wording of its own is dropped** when the other side has some: it
 *   would only restate the derived value ("Full marks: 45 marks" over a bare "45").
 *
 * One answer for every band surface — the page, the IR's masthead cells and the .docx
 * header/footer runs all read it, so they cannot disagree about how many lines print.
 */
export function bandFieldPrintSides(
  field: BandField,
  context: BandSegmentContext,
  language: LanguageMode,
): Array<'en' | 'zh'> {
  if (language !== 'bilingual') return [language];
  const segments = bandFieldSegments(field, context);
  const line = (side: 'en' | 'zh') => segments.map((segment) => plain(segment.text[side])).join('');
  const hasWording = (side: 'en' | 'zh') =>
    segments.some((segment) => segment.kind === 'text' && plain(segment.text[side]).length > 0);

  if (line('en') === line('zh')) return ['en'];
  const en = hasWording('en');
  const zh = hasWording('zh');
  if (en && !zh) return ['en'];
  if (zh && !en) return ['zh'];
  return ['en', 'zh'];
}

/**
 * The field's printed text for `language`: `bandFieldSegments` flattened, with any side
 * `bandFieldPrintSides` leaves out emptied — the shape `biTextRuns` and the preview's
 * read-only text already print one side of. A single-language export gets the full text.
 */
export function bandFieldPrintText(
  field: BandField,
  context: BandSegmentContext,
  language: LanguageMode,
): BiText {
  const segments = bandFieldSegments(field, context);
  const sides = bandFieldPrintSides(field, context, language);
  const side = (key: 'en' | 'zh'): RichText =>
    language !== 'bilingual' || sides.includes(key)
      ? segments.flatMap((segment) => segment.text[key])
      : [];
  return { en: side('en'), zh: side('zh') };
}

/**
 * A bilingual edit to wording that reads the same in both languages keeps it so.
 *
 * Bilingual prints such wording once (§ `bandFieldPrintSides`) and the page edits it as
 * its English side. Writing English alone would split the pair, and the untouched
 * Chinese copy would reappear as a second line — so the edit writes both. Empty wording
 * is not "the same": typing into an empty prefix must not fill in the other language.
 */
export function mirrorBilingualEdit(
  before: BiText,
  next: BiText,
  language: LanguageMode,
): BiText {
  if (language !== 'bilingual') return next;
  const en = plain(before.en);
  if (!en || en !== plain(before.zh)) return next;
  return { ...next, zh: next.en };
}

/**
 * Write `text` into one side of a field.
 *
 * Kept beside the decomposition so "which sides exist" and "how a side is stored" are
 * one answer. A `text` field's prefix *is* its whole text, which is what lets the editing
 * surface treat all four kinds identically.
 */
export function applyBandFieldSide(
  field: BandField,
  side: BandFieldSide,
  text: BiText,
): BandField {
  if (field.kind === 'text') {
    return side === 'prefix' ? { ...field, text } : field;
  }
  /*
   * The deprecated `label` is dropped on write, not carried alongside.
   *
   * Leaving it in place would keep a second, now-stale spelling of the same wording in
   * the saved document, and `bandFieldSideText` prefers `prefix` — so the two would
   * silently disagree for anything that read `label` directly.
   */
  const { label: _label, ...rest } = field as typeof field & { label?: BiText };
  return { ...rest, [side]: text } as BandField;
}
