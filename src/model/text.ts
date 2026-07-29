import type { BiText, InlineRun, RichText, RunFormat, RunFormatPatch } from './types';

/** Build a single-run RichText from a plain string. */
export function rt(text: string, attrs: Omit<InlineRun, 'text'> = {}): RichText {
  if (!text) return [];
  return [{ text, ...attrs }];
}

/** Build a BiText from two plain strings. */
export function bi(en: string, zh: string): BiText {
  return { en: rt(en), zh: rt(zh) };
}

export function emptyBiText(): BiText {
  return { en: [], zh: [] };
}

/** Flatten a RichText to plain text (previews, alt text, filenames, search). */
export function plain(text: RichText | undefined): string {
  if (!text) return '';
  return text.map((r) => r.text).join('');
}

export function isRichTextEmpty(text: RichText | undefined): boolean {
  return plain(text).trim().length === 0;
}

export function isBiTextEmpty(text: BiText | undefined): boolean {
  if (!text) return true;
  return isRichTextEmpty(text.en) && isRichTextEmpty(text.zh);
}

/**
 * Parse a lightweight markup string into runs. The editor stores runs, but plain
 * <textarea> inputs are far easier for teachers than a full rich-text surface, so
 * inline markers round-trip through `serializeRuns`/`parseRuns`.
 *
 *   **bold**  *italic*  __underline__  ^{sup}  _{sub}
 */
export function parseRuns(source: string): RichText {
  const runs: RichText = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|\^\{[^}]*\}|_\{[^}]*\})/g;
  let cursor = 0;
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) runs.push({ text: source.slice(cursor, start) });
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('__')) {
      runs.push({ text: token.slice(2, -2), underline: true });
    } else if (token.startsWith('^{')) {
      runs.push({ text: token.slice(2, -1), vertAlign: 'superscript' });
    } else if (token.startsWith('_{')) {
      runs.push({ text: token.slice(2, -1), vertAlign: 'subscript' });
    } else {
      runs.push({ text: token.slice(1, -1), italic: true });
    }
    cursor = start + token.length;
  }
  if (cursor < source.length) runs.push({ text: source.slice(cursor) });
  return runs.filter((r) => r.text.length > 0);
}

/**
 * Split one run's text into its lines, so a backend can put its own break between them.
 *
 * A **hard line break inside a paragraph** (Shift+Enter) is stored as a plain `\n` in
 * the run's own text rather than as a distinct run kind. That keeps the stored shape
 * unchanged — `parseRuns` already preserved the character, every saved document is
 * still valid, and no migration is needed — while making the break explicit at exactly
 * the point where it has to become markup.
 *
 * It has to become markup because a raw newline renders as a *space* in all three
 * backends: `<w:t>` collapses it, and so does HTML. That was the bug — the editor
 * accepted Shift+Enter and appeared to work, the model stored it faithfully, and then
 * every renderer silently flattened it.
 *
 * A break is deliberately not a paragraph. Splitting into two paragraphs would consume
 * a second list number, so "1." followed by a second line would print as "1." and "2."
 * — the identical reason bilingual stacking uses a soft break inside one paragraph
 * rather than two paragraphs (§ Bilingual Text Handling).
 */
export function runLines(text: string): string[] {
  // \r\n and a lone \r both normalise, so text pasted from Word or a Windows file
  // does not arrive as a break the renderers cannot see.
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/** Does this rich text contain a hard line break? */
export function hasLineBreak(runs: RichText | undefined): boolean {
  return Boolean(runs?.some((run) => /[\n\r]/.test(run.text)));
}

/**
 * Map an offset in the *serialized* marker string to an offset in the plain text.
 *
 * The in-place editor is a textarea holding `serializeRuns()` output, so a selection in
 * it is measured in a string that contains `**` and `^{}` markers the model does not.
 * Formatting a range therefore has to translate: "characters 7..10 of the source" is
 * "characters 5..8 of the text" once the markers are discounted.
 *
 * Walks the same token grammar `parseRuns` does, so the two cannot drift about what
 * counts as a marker.
 */
export function sourceOffsetToText(source: string, offset: number): number {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|\^\{[^}]*\}|_\{[^}]*\})/g;
  const limit = Math.max(0, Math.min(offset, source.length));

  /*
   * Build the marker positions once, then count. Doing it by walking rather than by
   * arithmetic on token lengths is deliberate: the arithmetic version got the *closing*
   * marker wrong, so a selection made after a bolded word landed one character to the
   * left and split the next word mid-way — which showed up only as a strange run split
   * in the exported .docx.
   */
  const isMarker = new Array<boolean>(source.length).fill(false);
  for (const match of source.matchAll(pattern)) {
    const start = match.index ?? 0;
    const token = match[0];
    const open = token.startsWith('**') || token.startsWith('__') ? 2 : token.startsWith('*') ? 1 : 2;
    const close = token.startsWith('^{') || token.startsWith('_{') ? 1 : open;
    for (let i = 0; i < open; i++) isMarker[start + i] = true;
    for (let i = 0; i < close; i++) isMarker[start + token.length - 1 - i] = true;
  }

  let text = 0;
  for (let i = 0; i < limit; i++) if (!isMarker[i]) text += 1;
  return text;
}

/**
 * A toolbar `TextFormat` patch, translated for a run.
 *
 * The format toolbar edits elements and runs with the same controls, but the two carry
 * different vocabularies: alignment and paragraph spacing belong to a paragraph, and a
 * selection of three words inside one cannot have its own. Those are dropped.
 *
 * An explicitly `undefined` value from the bar means "clear this override". For a run
 * that has to become `null`, because a patch is spread over an existing run and
 * `{ bold: undefined }` is indistinguishable from a patch that never mentioned bold.
 */
export function toRunPatch(patch: {
  fontSize?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  fonts?: InlineRun['fonts'];
}): RunFormatPatch {
  const out: RunFormatPatch = {};
  const carry = ['fontSize', 'color', 'bold', 'italic', 'underline', 'fonts'] as const;
  for (const key of carry) {
    if (key in patch) {
      const value = patch[key];
      (out as Record<string, unknown>)[key] = value === undefined ? null : value;
    }
  }
  return out;
}

/** The attributes of a run, without its text. */
function runAttrs(run: InlineRun): RunFormat {
  const { text: _text, ...attrs } = run;
  return attrs;
}

/** Total character length of a rich text. Offsets everywhere below are into this. */
export function richTextLength(runs: RichText | undefined): number {
  return runs?.reduce((total, run) => total + run.text.length, 0) ?? 0;
}

/**
 * Do two runs carry identical formatting? Used to merge neighbours back together.
 *
 * Compared field by field over the union of both key sets, so a run with an explicit
 * `undefined` and one that omits the key entirely count as the same — they render
 * identically, and leaving them unmerged would fragment the runs a little more with
 * every edit until a single sentence was fifty runs.
 */
function sameAttrs(a: InlineRun, b: InlineRun): boolean {
  const left = runAttrs(a);
  const right = runAttrs(b);
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    const l = left[key as keyof RunFormat];
    const r = right[key as keyof RunFormat];
    if (key === 'fonts') {
      const lf = l as InlineRun['fonts'];
      const rf = r as InlineRun['fonts'];
      if (lf?.latin !== rf?.latin || lf?.eastAsia !== rf?.eastAsia) return false;
      continue;
    }
    if (l !== r) return false;
  }
  return true;
}

/**
 * Drop empty runs and merge adjacent ones that format identically.
 *
 * Every range operation below ends with this. Without it the runs only ever fragment:
 * bolding a word and unbolding it leaves three runs where there was one, and the split
 * points accumulate invisibly until serialization or an export diff shows them.
 */
export function normalizeRuns(runs: RichText): RichText {
  const out: RichText = [];
  for (const run of runs) {
    if (!run.text) continue;
    const previous = out[out.length - 1];
    if (previous && sameAttrs(previous, run)) {
      out[out.length - 1] = { ...previous, text: previous.text + run.text };
      continue;
    }
    out.push(run);
  }
  return out;
}

/**
 * Split the run array so that `offset` falls on a run boundary.
 *
 * Returns the runs; a split inside a run replaces it with two carrying the same
 * attributes. This is the primitive both `applyRunFormat` and `sliceRichText` stand on:
 * once both ends of a range are boundaries, a range operation is a plain array slice.
 */
function splitAt(runs: RichText, offset: number): RichText {
  const out: RichText = [];
  let seen = 0;
  for (const run of runs) {
    const end = seen + run.text.length;
    if (offset > seen && offset < end) {
      const cut = offset - seen;
      out.push({ ...run, text: run.text.slice(0, cut) });
      out.push({ ...run, text: run.text.slice(cut) });
    } else {
      out.push(run);
    }
    seen = end;
  }
  return out;
}

/**
 * Apply a run-level format to the characters in `[start, end)`.
 *
 * This is what makes formatting per-text rather than per-element: the toolbar hands in
 * the selection's offsets and only those characters change, so one paragraph can hold a
 * 14pt bold phrase inside ordinary body text.
 *
 * A `null` in the patch **clears** that attribute back to inherited, which `undefined`
 * cannot express — spread over an existing run, `{ bold: undefined }` is
 * indistinguishable from a patch that never mentioned bold.
 *
 * An empty or reversed range is returned unchanged rather than treated as "all", so a
 * toolbar click with only a caret (no selection) is a no-op instead of silently
 * reformatting the whole element.
 */
export function applyRunFormat(
  runs: RichText | undefined,
  start: number,
  end: number,
  patch: RunFormatPatch,
): RichText {
  const source = runs ?? [];
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(richTextLength(source), Math.max(start, end));
  if (from >= to) return source;

  const split = splitAt(splitAt(source, from), to);

  const out: RichText = [];
  let seen = 0;
  for (const run of split) {
    const runEnd = seen + run.text.length;
    if (seen >= from && runEnd <= to) {
      const next = { ...run } as InlineRun & Record<string, unknown>;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete next[key];
        else if (value !== undefined) next[key] = value;
      }
      out.push(next);
    } else {
      out.push(run);
    }
    seen = runEnd;
  }
  return normalizeRuns(out);
}

/**
 * Replace the characters in `[start, end)` with `insert`, keeping formatting.
 *
 * This is what typing does in the on-page editor. The editor renders the runs
 * themselves — bold looks bold, 14pt looks 14pt — so an edit can no longer be
 * expressed as "re-parse the whole marker string"; it has to be a *range* operation
 * that leaves every attribute the edit did not touch exactly where it was.
 *
 * The inserted characters take the formatting of the run they land inside, which is
 * what makes typing in the middle of a bold phrase continue in bold, and typing at a
 * boundary continue the run on the **left** — the same rule Word follows, and the
 * reason the caret's "current format" is read from the character before it.
 *
 * `at === 0` on empty text has no run to inherit from, so `fallback` supplies one;
 * that is how the toolbar's pending format ("turn bold on, then type") reaches the
 * first character.
 */
export function replaceRichTextRange(
  runs: RichText | undefined,
  start: number,
  end: number,
  insert: string,
  fallback?: RunFormat,
): RichText {
  const source = runs ?? [];
  const length = richTextLength(source);
  const from = Math.max(0, Math.min(start, end, length));
  const to = Math.min(length, Math.max(start, end));

  const split = splitAt(splitAt(source, from), to);

  const before: RichText = [];
  const after: RichText = [];
  let seen = 0;
  for (const run of split) {
    const runEnd = seen + run.text.length;
    if (runEnd <= from) before.push(run);
    else if (seen >= to) after.push(run);
    seen = runEnd;
  }

  const out = [...before];
  if (insert) {
    // Inherit from the run to the left of the caret, then the one to the right, then
    // the caller's fallback. Left-first is what continues a bold phrase you are typing
    // inside; falling to the right covers inserting at offset 0.
    const attrs = before.length
      ? runAttrs(before[before.length - 1])
      : after.length
        ? runAttrs(after[0])
        : (fallback ?? {});
    out.push({ ...attrs, text: insert });
  }
  out.push(...after);
  return normalizeRuns(out);
}

/** The runs covering `[start, end)`, split at both ends. */
export function sliceRichText(
  runs: RichText | undefined,
  start: number,
  end: number,
): RichText {
  const source = runs ?? [];
  const from = Math.max(0, Math.min(start, end));
  const to = Math.min(richTextLength(source), Math.max(start, end));
  if (from >= to) return [];

  const split = splitAt(splitAt(source, from), to);
  const out: RichText = [];
  let seen = 0;
  for (const run of split) {
    const runEnd = seen + run.text.length;
    if (seen >= from && runEnd <= to) out.push(run);
    seen = runEnd;
  }
  return out;
}

/**
 * The formatting shared by every run in `[start, end)`, for reporting toolbar state.
 *
 * An attribute appears only when *all* the covered runs agree on it, so a mixed
 * selection reports it as absent rather than picking the first run's value — a toolbar
 * that showed "14pt" for a selection spanning 14pt and 11pt text would be lying about
 * what a click is going to do.
 */
export function commonRunFormat(
  runs: RichText | undefined,
  start: number,
  end: number,
): RunFormat {
  const covered = sliceRichText(runs, start, end);
  if (covered.length === 0) return {};

  const [first, ...rest] = covered;
  const common: RunFormat = runAttrs(first);
  for (const run of rest) {
    for (const key of Object.keys(common) as (keyof RunFormat)[]) {
      const mine = common[key];
      const theirs = run[key];
      const equal =
        key === 'fonts'
          ? (mine as InlineRun['fonts'])?.latin === (theirs as InlineRun['fonts'])?.latin &&
            (mine as InlineRun['fonts'])?.eastAsia === (theirs as InlineRun['fonts'])?.eastAsia
          : mine === theirs;
      if (!equal) delete common[key];
    }
  }
  return common;
}

export function serializeRuns(runs: RichText | undefined): string {
  if (!runs) return '';
  return runs
    .map((run) => {
      let out = run.text;
      if (run.vertAlign === 'superscript') return `^{${out}}`;
      if (run.vertAlign === 'subscript') return `_{${out}}`;
      if (run.bold) out = `**${out}**`;
      if (run.italic) out = `*${out}*`;
      if (run.underline) out = `__${out}__`;
      return out;
    })
    .join('');
}
