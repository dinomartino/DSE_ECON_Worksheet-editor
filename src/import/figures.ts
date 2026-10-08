/**
 * Figures: where a paste lost a picture, and where the teacher put one back.
 *
 * A Word paste drops text boxes and clip images, a PDF copy never has pictures, so a
 * caption ("Figure 1", 圖一) or a reference ("the diagram below", 下圖) with no picture
 * after it marks a gap. Gaps become figure slots in the outline (`missing`); image pins
 * become image blocks right after their line's content. Both are placed after the walk.
 */
import type { Flag, OutBlock, OutQuestion, OutStimulus, Outline, Pin, Role, SourceLine } from './types';

type Kind = 'figure' | 'table' | 'source';

const CAPTION_EN =
  /^(figure|fig\.?|diagram|graph|chart|picture|photo|cartoon|table|source|exhibit)\s*(?:\d{1,2}|[A-Z]|[IVX]{1,4})(?:\s*[:：.\-–—]\s*[^?？]{0,80})?$/i;
const CAPTION_ZH = /^(圖表|附圖|圖|表|資料)\s*[（(]?(?:[一二三四五六七八九十]{1,2}|\d{1,2}|[０-９]{1,2}|[A-ZＡ-Ｚ])[）)]?(?:\s*[:：]\s*.{0,40})?$/;
const REF_FIGURE =
  /\b(?:figure|diagram|graph|chart|picture|photo|cartoon)s?\s+below\b|\bfollowing\s+(?:figure|diagram|graph|chart|picture|photo|cartoon)s?\b|下圖|(?:以下|下列)的?(?:圖|漫畫)/i;
const REF_TABLE = /\btables?\s+below\b|\bfollowing\s+tables?\b|下表|(?:以下|下列)的?表/i;

const STOP: ReadonlySet<Role> = new Set(['question', 'part', 'subpart', 'option', 'statement', 'heading', 'answerKey']);
const SKIP: ReadonlySet<Role> = new Set(['ignore', 'noise', 'marks', 'answerSpace']);
const CAPTION_ROLES: ReadonlySet<Role> = new Set(['stem', 'source']);
const REFERENCE_ROLES: ReadonlySet<Role> = new Set(['stem', 'source', 'question', 'part', 'subpart']);

function captionKind(text: string): Kind | undefined {
  const en = CAPTION_EN.exec(text);
  if (en) {
    const word = en[1].toLowerCase();
    return word === 'table' ? 'table' : word === 'source' || word === 'exhibit' ? 'source' : 'figure';
  }
  const zh = CAPTION_ZH.exec(text);
  if (zh) return zh[1] === '表' ? 'table' : zh[1] === '資料' ? 'source' : 'figure';
  return undefined;
}

/**
 * Lines whose caption or reference has no picture. A caption counts as answered by a
 * picture (or, for a table or source, any content) right before or after it; a
 * reference by a picture before the next structural line, or defers to a caption there.
 */
export function missingFigures(lines: readonly SourceLine[], roles: readonly Role[]): number[] {
  const skip = (k: number) => lines[k].blank || SKIP.has(roles[k]);
  const neighbour = (from: number, step: 1 | -1) => {
    for (let k = from + step; k >= 0 && k < lines.length; k += step) if (!skip(k)) return k;
    return undefined;
  };
  const isContent = (k: number | undefined) =>
    k !== undefined && !STOP.has(roles[k]) && roles[k] !== 'source' && !captionKind(lines[k].text) && Boolean(lines[k].image || lines[k].cells || lines[k].text);
  const out: number[] = [];
  for (const line of lines) {
    const k = line.i;
    if (line.image || !line.text) continue;
    const kind = CAPTION_ROLES.has(roles[k]) ? captionKind(line.text) : undefined;
    if (kind) {
      const next = neighbour(k, 1);
      const prev = neighbour(k, -1);
      const picture = (j: number | undefined) => j !== undefined && Boolean(lines[j].image);
      const answered =
        picture(next) ||
        picture(prev) ||
        (kind === 'table' && (next !== undefined && (lines[next].cells || roles[next] === 'table') || (prev !== undefined && roles[prev] === 'table'))) ||
        (kind === 'source' && isContent(next));
      if (!answered) out.push(k);
      continue;
    }
    if (!REFERENCE_ROLES.has(roles[k])) continue;
    const table = REF_TABLE.test(line.text);
    if (!table && !REF_FIGURE.test(line.text)) continue;
    let answered = false;
    for (let j = k + 1; j < lines.length && !answered; j++) {
      if (skip(j)) continue;
      // "Which of the following diagrams…": the pictures are the options, so look past them.
      if (roles[j] === 'option') continue;
      if (STOP.has(roles[j])) break;
      answered = Boolean(lines[j].image) || Boolean(captionKind(lines[j].text)) || (table && Boolean(lines[j].cells || lines[j].text));
    }
    if (!answered) out.push(k);
  }
  return out;
}

// ---- MC questions that ask about pictures ----

/** "Which (of the following) diagram…", 哪一個圖: the answer is a picture. */
const ASKS_PICTURE =
  /\bwhich\s+(?:one\s+)?(?:of\s+(?:the\s+)?(?:following\s+|above\s+|below\s+)?)?(?:diagram|graph|figure|chart|picture|cartoon|photo)s?\b|哪(?:一)?(?:個|幅|張|項)?圖|哪一?幅/i;
/** "Which curve…", 哪一個表: a picture only when the options are bare names. */
const ASKS_CURVE = /\bwhich\s+(?:one\s+)?(?:of\s+(?:the\s+)?(?:following\s+|above\s+|below\s+)?)?(?:curve|table)s?\b|哪(?:一)?(?:個|幅|張|項|條)?(?:表(?![示明達現態])|曲線)/i;
/** Options that can only be names of pictures: "Figure 2", "Diagram B", 圖甲, 圖一, "(3)". */
const PICTURE_NAME = [
  /^(?:figure|fig\.?|diagram|graph|chart|picture)\s*(?:\d{1,2}|[A-Z]|[IVX]{1,4})$/i,
  /^(?:圖表|圖)\s*[（(]?(?:[一二三四五六七八九十]|[甲乙丙丁戊己]|\d{1,2}|[A-ZＡ-Ｚ])[）)]?$/,
  /^[（(](?:\d{1,2}|[一二三四五六]|[ivx]{1,4})[）)]$/i,
];
/** Options that are bare letters: the names of pictures, or of points on one picture. */
const LETTER_NAME = /^(?:[A-Z]|[甲乙丙丁戊])$/;

type Names = 'pictures' | 'letters' | 'empty' | undefined;

function optionNames(texts: readonly string[]): Names {
  const bare = texts.map((t) => t.trim().replace(/[.。]$/, ''));
  if (bare.length < 2) return undefined;
  if (bare.every((t) => t === '')) return 'empty';
  if (new Set(bare).size !== bare.length) return undefined;
  if (bare.every((t) => PICTURE_NAME.some((re) => re.test(t)))) return 'pictures';
  if (bare.every((t) => LETTER_NAME.test(t))) return 'letters';
  return undefined;
}

const hasImage = (blocks: readonly OutBlock[] | undefined): boolean =>
  (blocks ?? []).some((b) => b.kind === 'image' || (b.kind === 'source' && hasImage(b.blocks)));
const hasTable = (blocks: readonly OutBlock[]): boolean => blocks.some((b) => b.kind === 'table' || (b.kind === 'source' && hasTable(b.blocks)));
const plain = (runs: readonly { text: string }[]) => runs.map((r) => r.text).join('');
const stemText = (blocks: readonly OutBlock[]): string =>
  blocks.map((b) => (b.kind === 'paragraph' ? plain(b.runs) : b.kind === 'source' ? `${plain(b.label)} ${stemText(b.blocks)}` : '')).join(' ');

/**
 * MC questions whose pictures the paste lost: one that asks "which diagram…" (哪一個圖), or
 * whose options are only picture names (圖甲, "Figure 2", "(3)") or nothing at all. Bare
 * picture names get a slot under each option; a question that only asks, or whose options
 * are bare letters (points on one diagram), gets one slot after its stem. A question that
 * already has a picture, or a slot from a caption or reference, gets none; so does one
 * whose letters are named in its text or table ("firm W", a table of W X Y Z).
 */
export function askedFigures(outline: Outline, missing: ReadonlySet<number>): { add: number[]; drop: number[] } {
  const out: number[] = [];
  const drop: number[] = [];
  for (const q of outline.questions) {
    if (q.kind !== 'mc' || q.options.length < 2) continue;
    if (hasImage(q.stem) || q.options.some((o) => hasImage(o.blocks))) continue;
    const own = [...q.stem.flatMap((b) => b.lines), ...q.options.flatMap((o) => o.lines), ...q.statements.flatMap((s) => s.lines)].filter((l) => missing.has(l));
    const text = stemText(q.stem);
    const asks = ASKS_PICTURE.test(text);
    const names = optionNames(q.options.map((o) => plain(o.runs)));
    const named = names === 'pictures' || names === 'empty';
    const lettered = names === 'letters' && (asks || (ASKS_CURVE.test(text) && !own.length));
    if ((named || lettered) && q.options.every((o) => o.lines.length > 0)) {
      // The options name the pictures: one under each, in place of a slot for "the following figures".
      drop.push(...own);
      out.push(...q.options.map((o) => o.lines[0]));
      continue;
    }
    if (own.length) continue;
    const lettersUnexplained =
      names === 'letters' && !hasTable(q.stem) && !q.options.some((o) => new RegExp(`(?:^|[^A-Za-z])${plain(o.runs).trim()}(?:[^A-Za-z]|$)`).test(text));
    if (asks || lettersUnexplained) {
      const stemLines = q.stem.filter((b) => b.kind === 'paragraph' || b.kind === 'source').flatMap((b) => b.lines);
      out.push(stemLines.length ? Math.max(...stemLines) : q.start);
    }
  }
  return { add: out, drop };
}

// ---- placement ----

/** A place a block can go: after `after` in `list` (or first), for lines from `line` on. */
interface Anchor {
  list: () => OutBlock[];
  after: OutBlock | null;
  line: number;
}

const lastLine = (block: OutBlock): number =>
  Math.max(...block.lines, ...(block.kind === 'source' ? block.blocks.map(lastLine) : []));

function listAnchors(out: Anchor[], blocks: OutBlock[], start: number) {
  out.push({ list: () => blocks, after: null, line: start });
  for (const block of blocks) {
    if (block.kind === 'source') {
      // Into the panel from its label on; after the panel only past its last line.
      listAnchors(out, block.blocks, block.lines[0]);
      out.push({ list: () => blocks, after: block, line: lastLine(block) + 0.5 });
    } else out.push({ list: () => blocks, after: block, line: lastLine(block) });
  }
}

function questionAnchors(q: OutQuestion): Anchor[] {
  const out: Anchor[] = [];
  listAnchors(out, q.stem, q.start);
  for (const part of q.parts) {
    if (part.before.length) listAnchors(out, part.before, Math.min(...part.before.flatMap((b) => b.lines)));
    listAnchors(out, part.blocks, part.start);
    for (const sub of part.subParts) listAnchors(out, sub.blocks, sub.start);
  }
  for (const option of q.options) out.push({ list: () => (option.blocks ??= []), after: null, line: Math.max(...option.lines) });
  return out;
}

const stimulusAnchors = (stim: OutStimulus): Anchor[] => {
  const out: Anchor[] = [];
  listAnchors(out, stim.blocks, stim.start);
  return out;
};

const inBlocks = (blocks: readonly OutBlock[], line: number): boolean =>
  blocks.some((b) => b.lines.includes(line) || (b.kind === 'source' && inBlocks(b.blocks, line)));

/** The anchor for `line`: the last one at or before it, in reading order. */
function anchorFor(anchors: readonly Anchor[], line: number): Anchor | undefined {
  let best: Anchor | undefined;
  for (const anchor of anchors) if (anchor.line <= line && (!best || anchor.line >= best.line)) best = anchor;
  return best ?? anchors[0];
}

export interface PlacedFigures {
  /** `figureMissing` flags for captions and references still without a picture. */
  flags: Flag[];
  /** Lines whose gap is settled: a picture was added there, or the slot was dismissed. */
  settled: Set<number>;
}

/**
 * Put image pins and figure slots into the outline, in line order. A lost picture keeps
 * its place and becomes a slot; a caption's slot goes right after the caption.
 */
export function placeFigures(
  outline: Outline,
  lines: readonly SourceLine[],
  roles: readonly Role[],
  owner: ReadonlyArray<number | undefined>,
  pins: readonly Pin[],
): PlacedFigures {
  const settled = new Set<number>();
  for (const pin of pins) if ((pin.kind === 'image' || pin.kind === 'noPicture') && lines[pin.line]) settled.add(pin.line);

  // Every anchor is taken before anything is inserted, so placed blocks never become anchors.
  const questionAt = outline.questions.map(questionAnchors);
  const stimulusAt = outline.stimuli.map(stimulusAnchors);
  const container = (line: number): { anchors: Anchor[]; question?: number } | undefined => {
    const q = owner[line];
    if (q !== undefined && questionAt[q]) return { anchors: questionAt[q], question: q };
    const s = outline.stimuli.findIndex((x) => x.start === line || inBlocks(x.blocks, line));
    if (s < 0) return undefined;
    const before = outline.stimuli[s].before;
    return { anchors: stimulusAt[s], ...(before > 0 ? { question: before } : {}) };
  };

  // Lost pictures already sit where they were; unsettled ones show as slots.
  const markLost = (blocks: readonly OutBlock[]) => {
    for (const b of blocks) {
      if (b.kind === 'source') markLost(b.blocks);
      else if (b.kind === 'image' && !/^data:image\//.test(b.image.src) && !b.lines.some((l) => settled.has(l))) b.missing = true;
    }
  };
  for (const q of outline.questions) {
    markLost(q.stem);
    for (const o of q.options) if (o.blocks) markLost(o.blocks);
    for (const p of q.parts) [p.before, p.blocks, ...p.subParts.map((s) => s.blocks)].forEach(markLost);
  }
  for (const s of outline.stimuli) markLost(s.blocks);

  const placed = new WeakSet<OutBlock>();
  const insert = (anchor: Anchor, block: OutBlock) => {
    const list = anchor.list();
    let at = anchor.after ? list.indexOf(anchor.after) + 1 : 0;
    while (list[at] && placed.has(list[at])) at++;
    list.splice(at, 0, block);
    placed.add(block);
  };

  const flags: Flag[] = [];
  const entries: Array<{ line: number; block: OutBlock }> = [];
  const missing = missingFigures(lines, roles);
  const asked = askedFigures(outline, new Set(missing));
  const gaps: Array<[number, 'figureMissing' | 'figureAsked']> = [
    ...missing.filter((k) => !asked.drop.includes(k)).map((k): [number, 'figureMissing'] => [k, 'figureMissing']),
    ...asked.add.map((k): [number, 'figureAsked'] => [k, 'figureAsked']),
  ];
  for (const [k, kind] of gaps) {
    const where = settled.has(k) ? undefined : container(k);
    if (!where) continue;
    flags.push({ kind, line: k, ...(where.question !== undefined ? { question: where.question } : {}) });
    entries.push({ line: k, block: { kind: 'image', lines: [k], image: { src: '' }, missing: true } });
  }
  for (const pin of pins) {
    if (pin.kind !== 'image' || !lines[pin.line]) continue;
    entries.push({ line: pin.line, block: { kind: 'image', lines: [pin.line], image: pin.image, pin: pin.id } });
  }
  entries.sort((a, b) => a.line - b.line);
  for (const { line, block } of entries) {
    const where = container(line) ?? fallback(outline, line);
    const anchor = where && anchorFor(where.anchors, line);
    if (anchor) insert(anchor, block);
  }
  return { flags, settled };
}

/**
 * A line outside every question (a heading, a page footer): its picture opens the next
 * question (or the shared stimulus printed before it). With no question after the line
 * there is nowhere for it; the dialog refuses such a picture (`pictureHome`).
 */
function fallback(outline: Outline, line: number): { anchors: Anchor[] } | undefined {
  const at = outline.questions.findIndex((x) => x.start > line);
  if (at < 0) return undefined;
  const stim = outline.stimuli.find((s) => s.before === at && s.start > line);
  const list = stim ? stim.blocks : outline.questions[at].stem;
  return { anchors: [{ list: () => list, after: null, line: -1 }] };
}

/**
 * The question a picture added after `line` goes into: the line's own question, the one a
 * shared stimulus line introduces, or, for a line outside every question, the next one.
 * Undefined when there is none (a line after the last question).
 */
export function pictureHome(outline: Outline, roles: ReadonlyArray<{ question?: number }>, line: number): number | undefined {
  const own = roles[line]?.question;
  if (own !== undefined) return own;
  const stim = outline.stimuli.find((s) => s.start === line || inBlocks(s.blocks, line));
  if (stim) return stim.before >= 0 ? stim.before : undefined;
  const next = outline.questions.findIndex((x) => x.start > line);
  return next < 0 ? undefined : next;
}
