import type {
  BiText,
  InlineRun,
  LanguageMode,
  RichText,
  RunFormat,
  RunFormatPatch,
} from './types';

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

/**
 * What to call a document when something other than the page has to name it.
 *
 * The one definition, because the fallback chain is a decision and three consumers make
 * it: the file list, the toolbar's name, and the `.docx` filename. A second copy is not
 * a tidiness problem — it is a document that renames itself in the list and downloads
 * under its old name, which is exactly what a duplicated chain in `docxFileName` did.
 *
 * `name` leads: it is the answer to *this* question — what the document is called —
 * while `title` is the heading printed on page 1. They coincide on a plain worksheet,
 * which is why one field served both for so long. Falling back to `title` is what keeps
 * every document saved before `name` existed naming itself exactly as it did, and a
 * worksheet titled only in Chinese is *not* untitled, so English-then-Chinese is the
 * order. Only a document with none of the three reads "Untitled".
 *
 * It lives in `model/` because `export/` and `storage/` both need it and neither may
 * depend on the other.
 */
export function documentName(worksheet: {
  name?: string;
  title: BiText;
}): string | undefined {
  return (
    worksheet.name?.trim() ||
    plain(worksheet.title.en) ||
    plain(worksheet.title.zh) ||
    undefined
  );
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
 * Split one run's text into its lines. A hard break (Shift+Enter) is a plain `\n` in
 * run text (no new run kind, no migration); it must become markup at exactly this
 * point, because a raw newline renders as a *space* in `<w:t>` and HTML alike. A
 * break is deliberately not a paragraph — that would consume a second list number.
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
 * How many hard breaks trail the text with nothing after them — the blank lines the
 * marks label must not hang on. Counted here for both backends (they must choose the
 * same line). Only trailing breaks count; whitespace-only lines are empty.
 */
/**
 * Which language side the trailing marks label sits against.
 *
 * In bilingual mode both sides share one paragraph, English then Chinese, so the
 * paragraph's last line belongs to the Chinese side and its trailing breaks are the ones
 * that decide where the marks land. An empty side contributes no lines, so it falls
 * through to the other — otherwise a part with no Chinese would count zero blank lines
 * while the page plainly shows English ones.
 *
 * Shared by the preview and the `.docx` exporter: both must agree which side they are
 * measuring, or the marks land on different lines on screen and on paper.
 */
export function marksAnchorRuns(text: BiText, language: LanguageMode): RichText {
  if (language === 'en') return text.en;
  if (language === 'zh') return text.zh;
  return text.zh.length ? text.zh : text.en;
}

export function trailingBlankLines(runs: RichText | undefined): number {
  if (!runs?.length) return 0;
  // The runs form one continuous string of lines, so a break at the end of one run and
  // text at the start of the next is *not* a trailing break — the lines have to be
  // counted across the whole array, not per run.
  const lines = runLines(runs.map((run) => run.text).join(''));
  let blank = 0;
  for (let i = lines.length - 1; i > 0 && lines[i].trim() === ''; i--) blank++;
  return blank;
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
  vertAlign?: InlineRun['vertAlign'];
}): RunFormatPatch {
  const out: RunFormatPatch = {};
  // `vertAlign` rides here like any other run attribute. It was missing while the model,
  // the storage markers (`_{1}`) and all three renderers already understood it — so
  // "S₁" could be written down and printed but never *applied* from a toolbar, which is
  // the one way anyone would think to reach it.
  const carry = ['fontSize', 'color', 'bold', 'italic', 'underline', 'fonts', 'vertAlign'] as const;
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
 * Apply a run-level format to `[start, end)`. `null` in the patch **clears** back to
 * inherited (`undefined` cannot — spread makes it "not mentioned"). An empty or
 * reversed range is a no-op, never "all".
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
 * Replace `[start, end)` with `insert`, keeping formatting — the edit primitive.
 * Inserted characters inherit from the run left of the caret (Word's rule), then
 * right, then `fallback` (how a pending "bold on, then type" reaches character 1).
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

/**
 * The characters a fill-in blank is made of.
 *
 * Spaces carrying `underline`, not underscores: Word rules a blank the same way, so the
 * exported run is what a teacher would have typed by hand, and the line stays a
 * continuous rule at any font size instead of a row of glyphs with gaps between them.
 * `xml:space="preserve"` on every `w:t` is what keeps them from collapsing (§ per-run
 * formatting).
 *
 * Twelve is the reference paper's common width — "…regarded as ____________ because" —
 * wide enough to write an answer in and narrow enough that two fit on a line.
 */
const BLANK_WIDTH = 12;

/**
 * Insert a fill-in blank at the caret. Deliberately underlined spaces, not a new run
 * kind (already exports/pastes/prints everywhere, no migration). The underline is
 * forced, not inherited — after ordinary prose, inheritance is twelve invisible
 * spaces.
 */
export function insertBlank(
  runs: RichText | undefined,
  start: number,
  end: number,
  width: number = BLANK_WIDTH,
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

  // Only `underline` carries over from the surrounding run; size, colour and font follow
  // the text the blank sits in, so a blank inside a 14pt line rules at 14pt.
  const neighbour = before.length ? before[before.length - 1] : after.length ? after[0] : undefined;
  const attrs = neighbour ? runAttrs(neighbour) : {};
  return normalizeRuns([
    ...before,
    { ...attrs, text: ' '.repeat(Math.max(1, width)), underline: true, vertAlign: undefined },
    ...after,
  ]);
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
