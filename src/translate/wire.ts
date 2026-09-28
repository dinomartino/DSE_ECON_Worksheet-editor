import type { Side, SlotKind } from '@/model/textSlots';
import { normalizeRuns, plain, sliceRichText } from '@/model/text';
import { CAPITAL_WORDS } from '@/model/symbols';
import type { InlineRun, RichText, RunFormat } from '@/model/types';

/**
 * The rich-text wire format: a closed set of inline tags a model carries reliably.
 *   <b> <i> <u> <sub> <sup> <s1>…<s9> (font size / colour / font) <blank/> <br/>
 * Edge newlines and boundary spaces are never sent; the codec restores them.
 */

export type StyleClass = Pick<RunFormat, 'fontSize' | 'color' | 'fonts'>;

export interface WireCodec {
  /** '\n' counts outside the sent text. */
  lead: number;
  trail: number;
  /** Source boundary spaces (ASCII and NBSP). */
  leadSpace: string;
  trailSpace: string;
  /** The stripped edges verbatim (newlines and spaces with their formats). */
  head: RichText;
  tail: RichText;
  styles: StyleClass[];
  /** Space count per blank, in order. */
  blanks: number[];
  /** Interior <br/> count. */
  breaks: number;
  /** Multiset "sub:1", "sup:2" of <sub>/<sup> inner texts. */
  scripts: string[];
  /** Normalised digit groups of the source plain text. */
  numbers: string[];
  /** Symbol tokens in prose: AD, MC, P1. */
  latinSymbols: string[];
  emphasis: { bold: number; italic: number; underline: number; capitals: number };
  /** More than 9 style classes: the rarest were dropped. */
  simplified: boolean;
}

export type DecodeError = { code: 'unbalanced'; detail: string } | { code: 'unknownStyle'; n: number };

/** Short kinds: labels, cells and headings of a figure or table. */
export const SHORT_KINDS: ReadonlySet<SlotKind> = new Set<SlotKind>([
  'axisTitle', 'diagramTitle', 'diagramLabel', 'tickLabel', 'tableCell', 'caption',
  'flowNode', 'labelListCell', 'speaker',
]);

/** CAPITALS that are emphasis (prompt rule 5); all are also `CAPITAL_WORDS`, never symbols. */
export const EMPHASIS_WORDS: ReadonlySet<string> = new Set([
  'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'NOT', 'NO', 'NONE', 'NEVER', 'ALL', 'BEST', 'BOTH',
  'ONLY', 'EACH', 'EXCEPT', 'MOST', 'LEAST',
]);

const CJK = /[⺀-鿿豈-﫿＀-￯]/;
const EDGE_SPACE = /^[  ]$/;
const BLANK_MIN = 4;
const DEFAULT_BLANK = 12;
const MAX_STYLES = 9;

export const isCjk = (ch: string): boolean => CJK.test(ch);

interface Fmt { s: number; b: boolean; i: boolean; u: boolean; v: '' | 'sub' | 'sup' }
type Level = keyof Fmt;
const LEVELS: readonly Level[] = ['s', 'b', 'i', 'u', 'v'];
const NO_FMT: Fmt = { s: 0, b: false, i: false, u: false, v: '' };

interface Cell { ch: string; run: InlineRun }
const cells = (runs: RichText): Cell[] => runs.flatMap((run) => [...run.text].map((ch) => ({ ch, run })));

const styleKey = (run: InlineRun): string =>
  run.fontSize === undefined && !run.color && !run.fonts
    ? ''
    : JSON.stringify([run.fontSize ?? null, run.color ?? null, run.fonts?.latin ?? null, run.fonts?.eastAsia ?? null]);

function styleOf(run: InlineRun): StyleClass {
  const style: StyleClass = {};
  if (run.fontSize !== undefined) style.fontSize = run.fontSize;
  if (run.color) style.color = run.color;
  if (run.fonts) style.fonts = run.fonts;
  return style;
}

/** Maximal stretches where `pred` holds, as [start, end) char offsets. */
function stretches(list: Cell[], pred: (cell: Cell) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let start = -1;
  list.forEach((cell, index) => {
    if (pred(cell)) {
      if (start < 0) start = index;
    } else if (start >= 0) {
      out.push([start, index]);
      start = -1;
    }
  });
  if (start >= 0) out.push([start, list.length]);
  return out;
}

/** Contiguous sub/superscript stretches as "sub:text" / "sup:text". */
export function scriptsOf(runs: RichText): string[] {
  const list = cells(runs);
  const out: string[] = [];
  for (const align of ['subscript', 'superscript'] as const) {
    for (const [from, to] of stretches(list, (c) => c.run.vertAlign === align)) {
      out.push(`${align === 'subscript' ? 'sub' : 'sup'}:${list.slice(from, to).map((c) => c.ch).join('')}`);
    }
  }
  return out.sort();
}

/** Full-width forms → ASCII (digits, letters, brackets, punctuation). */
export function foldWidth(text: string): string {
  return text.replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)).replace(/　/g, ' ');
}

/** Digit groups with thousands separators removed; '%' kept. */
export function digitGroups(text: string): string[] {
  const folded = foldWidth(text).replace(/(\d)[,  ](?=\d{3}(?!\d))/g, '$1');
  return folded.match(/\d+(?:\.\d+)?%?/g) ?? [];
}

/**
 * Symbol tokens in prose (what the `symbols` check compares): a Latin token carrying a
 * sub/superscript (P₁), or 1–5 capitals with optional digits (D, AD, SRAS, E1) — except
 * English words in capitals (`CAPITAL_WORDS`, the list `isSymbolOnly` uses), the pronoun I, a sentence-initial A before a lower-case word, and any
 * token inside a run of two or more all-capital words (END OF PAPER, SECTION A).
 */
export function latinSymbolsOf(runs: RichText): string[] {
  const list = cells(runs);
  const text = list.map((c) => c.ch).join('');
  const words = [...text.matchAll(/[A-Za-z]+[0-9₀-₉]*/g)];
  const lettersOf = (w: string) => w.replace(/[0-9₀-₉]+$/, '');
  const gap = (a: RegExpMatchArray, b: RegExpMatchArray) => text.slice(a.index! + a[0].length, b.index!);
  const capsWord = (m: RegExpMatchArray | undefined) => m !== undefined && /^[A-Z]+[0-9]*$/.test(m[0]);
  const out: string[] = [];
  words.forEach((match, index) => {
    const start = match.index!;
    let end = start + match[0].length;
    let word = match[0];
    // A letter followed by a vertAlign run: the token is the letter plus its script.
    while (end < list.length && list[end].run.vertAlign && /[A-Za-z0-9]/.test(list[end].ch)) {
      word += list[end].ch;
      end += 1;
    }
    const letters = lettersOf(match[0]);
    const scripted = word !== match[0] || /[₀-₉]/.test(word);
    if (!scripted) {
      if (!/^[A-Z]{1,5}$/.test(letters) || CAPITAL_WORDS.has(letters) || letters === 'I') return;
      const next = words[index + 1];
      const prev = words[index - 1];
      if (letters === 'A' && next && /^[a-z]/.test(next[0]) && /^\s+$/.test(gap(match, next))) {
        const before = text.slice(0, start).trimEnd();
        if (!before || /[.!?:]$/.test(before)) return;
      }
      const inRun = (other: RegExpMatchArray | undefined, between: string) =>
        capsWord(other) && /^\s+$/.test(between) && (letters.length > 1 || lettersOf(other![0]).length > 1);
      if (inRun(next, next ? gap(match, next) : '') || inRun(prev, prev ? gap(prev, match) : '')) return;
    }
    out.push(word.replace(/[₀-₉]/g, (d) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(d))));
  });
  return out;
}

/** CAPITALS emphasis words outside bold runs and outside all-capital phrases. */
function capitalsOf(list: Cell[]): number {
  const text = list.map((c) => c.ch).join('');
  const phrases = [...text.matchAll(/[A-Z]{2,}(?:\s+[A-Z]+)+/g)].filter((m) =>
    m[0].split(/\s+/).some((w) => !EMPHASIS_WORDS.has(w)),
  );
  let count = 0;
  for (const match of text.matchAll(/\b[A-Z]{2,}\b/g)) {
    const start = match.index!;
    if (!EMPHASIS_WORDS.has(match[0]) || list[start].run.bold) continue;
    if (phrases.some((p) => start >= p.index! && start < p.index! + p[0].length)) continue;
    count += 1;
  }
  return count;
}

function splitEdges(runs: RichText): { head: RichText; body: RichText; tail: RichText } {
  const list = cells(runs);
  const edge = (c: Cell) => !c.run.underline && (c.ch === '\n' || EDGE_SPACE.test(c.ch));
  let from = 0;
  while (from < list.length && edge(list[from])) from += 1;
  let to = list.length;
  while (to > from && edge(list[to - 1])) to -= 1;
  return {
    head: sliceRichText(runs, 0, from),
    body: sliceRichText(runs, from, to),
    tail: sliceRichText(runs, to, list.length),
  };
}

const spacesIn = (runs: RichText) => plain(runs).replace(/\n/g, '');
const newlinesIn = (runs: RichText) => (plain(runs).match(/\n/g) ?? []).length;
const escapeText = (ch: string) => (ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch);
const openTag = (level: Level, fmt: Fmt) =>
  level === 's' ? `<s${fmt.s}>` : level === 'v' ? `<${fmt.v}>` : `<${level}>`;

type Item = { kind: 'text'; ch: string; fmt: Fmt } | { kind: 'blank'; fmt: Fmt } | { kind: 'br'; fmt: Fmt };

export function encodeRuns(runs: RichText): { wire: string; codec: WireCodec } {
  const { head, body, tail } = splitEdges(normalizeRuns(runs));
  const list = cells(body);

  // Style classes: the nine most used (by characters) keep a tag, numbered by first use.
  const usage = new Map<string, { count: number; first: number; style: StyleClass }>();
  list.forEach((c, index) => {
    const key = styleKey(c.run);
    if (!key) return;
    const entry = usage.get(key) ?? { count: 0, first: index, style: styleOf(c.run) };
    entry.count += 1;
    usage.set(key, entry);
  });
  const kept = [...usage.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].first - b[1].first)
    .slice(0, MAX_STYLES)
    .sort((a, b) => a[1].first - b[1].first);
  const classOf = new Map(kept.map(([key], index) => [key, index + 1]));
  const fmtOf = (run: InlineRun): Fmt => ({
    s: classOf.get(styleKey(run)) ?? 0,
    b: run.bold === true,
    i: run.italic === true,
    u: run.underline === true,
    v: run.vertAlign === 'subscript' ? 'sub' : run.vertAlign === 'superscript' ? 'sup' : '',
  });

  // Blanks: ≥ 4 consecutive underlined spaces, found across merged runs too.
  const blankAt = new Map<number, number>();
  for (const [from, to] of stretches(list, (c) => c.ch === ' ' && c.run.underline === true)) {
    if (to - from >= BLANK_MIN) blankAt.set(from, to - from);
  }
  const items: Item[] = [];
  const blanks: number[] = [];
  for (let index = 0; index < list.length; index += 1) {
    const cell = list[index];
    const width = blankAt.get(index);
    if (width !== undefined) {
      blanks.push(width);
      items.push({ kind: 'blank', fmt: { ...fmtOf(cell.run), u: false, v: '' } });
      index += width - 1;
    } else if (cell.ch === '\n') items.push({ kind: 'br', fmt: fmtOf(cell.run) });
    else items.push({ kind: 'text', ch: cell.ch, fmt: fmtOf(cell.run) });
  }

  // Tags open and close from the first level that differs: minimal churn.
  let wire = '';
  let open: Fmt = NO_FMT;
  const moveTo = (target: Fmt) => {
    const k = LEVELS.findIndex((level) => open[level] !== target[level]);
    if (k < 0) return;
    for (let l = LEVELS.length - 1; l >= k; l -= 1) {
      if (open[LEVELS[l]]) wire += openTag(LEVELS[l], open).replace('<', '</');
    }
    for (let l = k; l < LEVELS.length; l += 1) if (target[LEVELS[l]]) wire += openTag(LEVELS[l], target);
    open = target;
  };
  for (const item of items) {
    moveTo(item.fmt);
    wire += item.kind === 'blank' ? '<blank/>' : item.kind === 'br' ? '<br/>' : escapeText(item.ch);
  }
  moveTo(NO_FMT);

  const bodyText = plain(body);
  const spans = (pred: (c: Cell) => boolean) =>
    stretches(list, pred).filter(([from, to]) => list.slice(from, to).some((c) => c.ch.trim())).length;
  return {
    wire,
    codec: {
      lead: newlinesIn(head),
      trail: newlinesIn(tail),
      leadSpace: spacesIn(head),
      trailSpace: spacesIn(tail),
      head,
      tail,
      styles: kept.map(([, entry]) => entry.style),
      blanks,
      breaks: items.filter((item) => item.kind === 'br').length,
      scripts: scriptsOf(body),
      numbers: digitGroups(bodyText),
      latinSymbols: latinSymbolsOf(body),
      emphasis: {
        bold: spans((c) => c.run.bold === true),
        italic: spans((c) => c.run.italic === true),
        underline: spans((c) => c.run.underline === true),
        capitals: capitalsOf(list),
      },
      simplified: usage.size > MAX_STYLES,
    },
  };
}

// ---- decoding ----

const TAG = /<\s*(\/?)\s*(b|i|u|sub|sup|s[1-9])\s*>|<\s*(br|blank)\s*\/?\s*>/gi;
const HYGIENE = /[​-‍⁠﻿\u0000-\u0009\u000B-\u001F\u007F-\u009F]/g;
const ENTITIES: Record<string, string> = { '&lt;': '<', '&gt;': '>', '&amp;': '&', '&nbsp;': ' ' };

type Frame = { level: Level; value: number | '' | 'sub' | 'sup' | true };
interface Out { ch: string; fmt: Fmt; blank?: true }

/** The model's text back to runs. Lenient on tag spelling, strict on balance. */
export function decodeWire(
  wire: string,
  codec: WireCodec,
  target: Side,
  kind: SlotKind,
  aroundValue?: 'before' | 'after',
): { ok: true; runs: RichText } | { ok: false; error: DecodeError } {
  const text = wire.normalize('NFC').replace(/\r\n?/g, '\n').replace(HYGIENE, '');
  const stack: Frame[] = [];
  const out: Out[] = [];
  const current = (): Fmt => {
    const fmt: Fmt = { ...NO_FMT };
    for (const frame of stack) (fmt as unknown as Record<Level, Frame['value']>)[frame.level] = frame.value;
    return fmt;
  };
  const pushText = (raw: string) => {
    const decoded = raw.replace(/&(?:lt|gt|amp|nbsp);/g, (entity) => ENTITIES[entity]);
    for (const ch of decoded) out.push({ ch, fmt: current() });
  };
  let last = 0;
  for (const match of text.matchAll(TAG)) {
    pushText(text.slice(last, match.index));
    last = match.index! + match[0].length;
    const [, slash, name, empty] = match;
    if (empty) {
      if (empty.toLowerCase() === 'br') out.push({ ch: '\n', fmt: current() });
      else out.push({ ch: ' ', fmt: current(), blank: true });
      continue;
    }
    const lower = name.toLowerCase();
    const frame: Frame =
      lower === 'sub' || lower === 'sup'
        ? { level: 'v', value: lower }
        : lower.startsWith('s')
          ? { level: 's', value: Number(lower.slice(1)) }
          : { level: lower as Level, value: true };
    if (frame.level === 's' && (frame.value as number) > codec.styles.length) {
      return { ok: false, error: { code: 'unknownStyle', n: frame.value as number } };
    }
    if (!slash) {
      stack.push(frame);
      continue;
    }
    // Crossed nesting is tolerated: attributes come from the set of open tags.
    const at = stack.map((f) => f.level === frame.level && f.value === frame.value).lastIndexOf(true);
    if (at < 0) return { ok: false, error: { code: 'unbalanced', detail: `unmatched ${match[0]}` } };
    stack.splice(at, 1);
  }
  pushText(text.slice(last));
  if (stack.length > 0) {
    return { ok: false, error: { code: 'unbalanced', detail: `unclosed ${openTag(stack[0].level, current())}` } };
  }
  return { ok: true, runs: restore(tidy(out, target), codec, target, kind, aroundValue) };
}

/** Chinese: spaces between two CJK characters go. Edge whitespace (not a blank or
 *  underline) goes. */
function tidy(out: Out[], target: Side): Out[] {
  const kept = out.filter((item, index) => {
    if (target !== 'zh' || item.ch !== ' ' || item.blank) return true;
    let before = index - 1;
    while (before >= 0 && out[before].ch === ' ' && !out[before].blank) before -= 1;
    let after = index + 1;
    while (after < out.length && out[after].ch === ' ' && !out[after].blank) after += 1;
    return !(before >= 0 && after < out.length && isCjk(out[before].ch) && isCjk(out[after].ch));
  });
  const edge = (item: Out) => !item.blank && !item.fmt.u && /^[\n  ]$/.test(item.ch);
  let from = 0;
  while (from < kept.length && edge(kept[from])) from += 1;
  let to = kept.length;
  while (to > from && edge(kept[to - 1])) to -= 1;
  return kept.slice(from, to);
}

function runFor(fmt: Fmt, codec: WireCodec, text: string): InlineRun {
  const run: InlineRun = { ...(fmt.s ? codec.styles[fmt.s - 1] : {}), text };
  if (fmt.b) run.bold = true;
  if (fmt.i) run.italic = true;
  if (fmt.u) run.underline = true;
  if (fmt.v) run.vertAlign = fmt.v === 'sub' ? 'subscript' : 'superscript';
  return run;
}

const withoutSpaces = (runs: RichText): RichText =>
  normalizeRuns(runs.map((run) => ({ ...run, text: run.text.replace(/[  ]/g, '') })));

/** Boundary spaces by target language and kind: none in Chinese; English wording around
 *  a derived value gets exactly one space on the value's side; otherwise the source's. */
function edges(body: RichText, codec: WireCodec, target: Side, kind: SlotKind, around?: 'before' | 'after') {
  if (target === 'zh') return { head: withoutSpaces(codec.head), tail: withoutSpaces(codec.tail) };
  const text = plain(body);
  if (kind === 'wording' && around === 'before') {
    const bare = /[($-]$/.test(text) || (text.endsWith(':') && !codec.trailSpace);
    return { head: codec.head, tail: [...(bare ? [] : [{ text: ' ' }]), ...withoutSpaces(codec.tail)] };
  }
  if (kind === 'wording' && around === 'after') {
    const bare = /^[.,;:)!?]/.test(text);
    return { head: [...withoutSpaces(codec.head), ...(bare ? [] : [{ text: ' ' }])], tail: codec.tail };
  }
  return { head: codec.head, tail: codec.tail };
}

function restore(items: Out[], codec: WireCodec, target: Side, kind: SlotKind, around?: 'before' | 'after'): RichText {
  const body: RichText = [];
  let blank = 0;
  for (const item of items) {
    if (item.blank) {
      const width = codec.blanks[blank] ?? DEFAULT_BLANK;
      blank += 1;
      body.push(runFor({ ...item.fmt, u: true, v: '' }, codec, ' '.repeat(width)));
    } else body.push(runFor(item.fmt, codec, item.ch));
  }
  const merged = normalizeRuns(body);
  const { head, tail } = edges(merged, codec, target, kind, around);
  return normalizeRuns([...head, ...merged, ...tail]);
}

