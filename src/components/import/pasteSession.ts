import {
  analyseLines,
  buildImport,
  readPaste,
  type Analysis,
  type Flag,
  type FlagKind,
  type ImportBatch,
  type PasteInput,
  type Pin,
  type ReadPaste,
  type Role,
} from '@/import';
import type { Side } from '@/model/textSlots';
import type { ImageBlock } from '@/model/types';
import type { RenderNode } from '@/render/ir';
import type { TextKey } from '@/i18n/catalogue';
import type { PASTE_IMPORT_MESSAGES } from './messages';

/**
 * The Paste questions dialog's logic, kept out of React so it can be tested without a
 * DOM: what a paste carries, how a fix becomes a pin, which flags the header counts, and
 * which option a click in the preview landed on. The engine is `src/import/`.
 */

type Key = TextKey<typeof PASTE_IMPORT_MESSAGES>;

/** Both clipboard flavours: the engine reads the HTML when it carries the paper, else the plain text. */
export function pasteInput(data: Pick<DataTransfer, 'getData'>): PasteInput {
  const plain = data.getData('text/plain');
  const html = data.getData('text/html');
  return { plain, ...(html.trim() ? { html } : {}) };
}

export type Language = Side | 'auto';

export interface Review {
  analysis: Analysis;
  /** What Insert and Add to 題庫 write. */
  batch: ImportBatch;
  /** The same for the review pane: figure slots shown, pictures it can find again. */
  preview: ImportBatch;
}

/** One solve of the read paste with the teacher's fixes. Fast (~4 ms for 60 questions). */
export function review(read: ReadPaste, pins: readonly Pin[], language: Language): Review {
  const analysis = analyseLines(read, { pins, language });
  return { analysis, batch: buildImport(analysis), preview: buildImport(analysis, { preview: true }) };
}

export { readPaste };

/**
 * What the paste box does with a paste: review it, or say why not. `scan` has no text
 * to read (an image-only paste); `ocr` is text read from a scan, offered for review with
 * a warning.
 */
export function pasteVerdict({ analysis, batch }: Review): 'ok' | 'empty' | 'scan' | 'ocr' {
  if (analysis.kind === 'empty') return 'empty';
  if (analysis.kind === 'scan') return batch.builds.length > 0 && analysis.lines.some((l) => l.text.trim()) ? 'ocr' : 'scan';
  return 'ok';
}

// ---- fixes (pins) ----

/** The question a line belongs to in this analysis. */
const questionOf = (analysis: Analysis, line: number) => analysis.roles[line]?.question;

/** Two pins that answer the same question about the same thing: the newer replaces the older. */
function sameSubject(a: Pin, b: Pin, analysis: Analysis): boolean {
  if ((a.kind === 'role' && b.kind === 'role') || (a.kind === 'noPicture' && b.kind === 'noPicture')) return a.line === b.line;
  if (a.kind === 'image' && b.kind === 'image') return a.id === b.id;
  // A line starts a new question or joins the one above, never both.
  if ((a.kind === 'newQuestion' || a.kind === 'join') && (b.kind === 'newQuestion' || b.kind === 'join')) return a.line === b.line;
  if ((a.kind === 'answer' && b.kind === 'answer') || (a.kind === 'language' && b.kind === 'language')) {
    const qa = questionOf(analysis, a.line);
    return a.line === b.line || (qa !== undefined && qa === questionOf(analysis, b.line));
  }
  return false;
}

const samePin = (a: Pin, b: Pin) =>
  a.kind === 'image' || b.kind === 'image'
    ? a.kind === 'image' && b.kind === 'image' && a.id === b.id
    : JSON.stringify(a) === JSON.stringify(b);

/**
 * The pins after one fix, newest last (⌘Z takes the last off). A fix replaces an older
 * one on the same subject; repeating a new-question or join fix takes it back.
 */
export function withPin(pins: readonly Pin[], pin: Pin, analysis: Analysis): Pin[] {
  const toggles = (pin.kind === 'newQuestion' || pin.kind === 'join') && pins.some((p) => samePin(p, pin));
  const rest = pins.filter((p) => !sameSubject(p, pin, analysis));
  return toggles ? rest : [...rest, pin];
}

export function withoutPin(pins: readonly Pin[], pin: Pin): Pin[] {
  return pins.filter((p) => p !== pin && !samePin(p, pin));
}

/** The fixes made on one line (role, new question, join, pictures, no picture), for its chip and badges. */
export function pinsOn(pins: readonly Pin[], line: number): Pin[] {
  return pins.filter((p) => p.kind !== 'answer' && p.kind !== 'language' && p.line === line);
}

// ---- pictures ----

/**
 * The image files a paste or drop carries. A screenshot arrives as a file item; a file
 * dragged in arrives in `files` (Chrome lists it in both, so `files` wins when present).
 */
export function imageFiles(data: { files?: FileList | null; items?: DataTransferItemList } | null | undefined): File[] {
  if (!data) return [];
  const isImage = (f: File | null | undefined): f is File => Boolean(f && f.type.startsWith('image/'));
  const files = [...(data.files ?? [])].filter(isImage);
  if (files.length) return files;
  return [...(data.items ?? [])].filter((item) => item.kind === 'file' && item.type.startsWith('image/')).map((item) => item.getAsFile()).filter(isImage);
}

/** Whether a drag carries files (their types are hidden until the drop). */
export const dragHasFiles = (data: Pick<DataTransfer, 'types'> | null | undefined) => Boolean(data && [...data.types].includes('Files'));

/** An image pin from a block `imageBlockFromFile` made: the same bytes and sizes, placed after `line`. */
export function imagePin(line: number, block: ImageBlock, id: string): Extract<Pin, { kind: 'image' }> {
  return {
    kind: 'image',
    id,
    line,
    image: {
      src: block.src,
      widthPx: block.widthPx,
      heightPx: block.heightPx,
      ...(block.naturalWidthPx && block.naturalHeightPx ? { naturalWidthPx: block.naturalWidthPx, naturalHeightPx: block.naturalHeightPx } : {}),
    },
  };
}

/** The roles a teacher can give a line, each with its one-key shortcut (the chip's letter). */
export const PINNABLE: ReadonlyArray<{ role: Role; key: string; name: Key }> = [
  { role: 'question', key: 'Q', name: 'roleQuestion' },
  { role: 'part', key: 'P', name: 'rolePart' },
  { role: 'subpart', key: 'S', name: 'roleSubpart' },
  { role: 'option', key: 'O', name: 'roleOption' },
  { role: 'statement', key: 'T', name: 'roleStatement' },
  { role: 'marks', key: 'M', name: 'roleMarks' },
  { role: 'heading', key: 'H', name: 'roleHeading' },
  { role: 'noise', key: 'N', name: 'roleNoise' },
];

export function roleForKey(key: string): Role | undefined {
  return PINNABLE.find((entry) => entry.key === key.toUpperCase())?.role;
}

/** The chip a role shows in the gutter: a short code (the shortcut letter where there is one) and its name. */
export const CHIP: Record<Role, { code: string; name: Key; tone: ChipTone }> = {
  question: { code: 'Q', name: 'roleQuestion', tone: 'question' },
  part: { code: 'P', name: 'rolePart', tone: 'part' },
  subpart: { code: 'S', name: 'roleSubpart', tone: 'part' },
  option: { code: 'O', name: 'roleOption', tone: 'option' },
  statement: { code: 'T', name: 'roleStatement', tone: 'option' },
  marks: { code: 'M', name: 'roleMarks', tone: 'quiet' },
  heading: { code: 'H', name: 'roleHeading', tone: 'out' },
  noise: { code: 'N', name: 'roleNoise', tone: 'out' },
  answerKey: { code: 'K', name: 'roleAnswerKey', tone: 'out' },
  stem: { code: '·', name: 'roleStem', tone: 'text' },
  table: { code: '▦', name: 'roleTable', tone: 'text' },
  source: { code: '❐', name: 'roleSource', tone: 'question' },
  answerSpace: { code: '_', name: 'roleAnswerSpace', tone: 'quiet' },
  ignore: { code: '', name: 'roleIgnore', tone: 'text' },
};

export type ChipTone = 'question' | 'part' | 'option' | 'quiet' | 'out' | 'text';

// ---- flags ----

export const FLAG_TEXT: Record<FlagKind, Key | 'flagOptionCount'> = {
  sequenceBreak: 'flagSequenceBreak',
  numberRestart: 'flagNumberRestart',
  optionCount: 'flagOptionCount',
  statementCount: 'flagStatementCount',
  noAnswer: 'flagNoAnswer',
  marksMoved: 'flagMarksMoved',
  duplicateMarks: 'flagDuplicateMarks',
  unknownLine: 'flagUnknownLine',
  imageLost: 'flagImageLost',
  figureMissing: 'flagFigureMissing',
  optionsByOrder: 'flagOptionsByOrder',
  textAfterOptions: 'flagTextAfterOptions',
  sharedStemFolded: 'flagSharedStemFolded',
  unlabelledStart: 'flagUnlabelledStart',
  mixedContent: 'flagMixedContent',
};

/** One place the header sends the teacher to: a question (or a line outside any) and its flags. */
export interface CheckPlace {
  line: number;
  question?: number;
  flags: Flag[];
}

/**
 * The flags as places to visit, in paste order: `check` holds the structural ones (the
 * header's "N to check"), `noAnswer` the MC still without an answer, counted apart
 * because a paste without a key has one on every MC.
 */
export function checkPlaces(analysis: Analysis): { check: CheckPlace[]; noAnswer: CheckPlace[] } {
  const group = (flags: Flag[]) => {
    const places = new Map<string, CheckPlace>();
    for (const flag of flags) {
      const key = flag.question !== undefined ? `q${flag.question}` : `l${flag.line}`;
      const place = places.get(key);
      if (place) {
        place.flags.push(flag);
        place.line = Math.min(place.line, flag.line);
      } else places.set(key, { line: flag.line, ...(flag.question !== undefined ? { question: flag.question } : {}), flags: [flag] });
    }
    return [...places.values()].sort((a, b) => a.line - b.line);
  };
  return {
    check: group(analysis.flags.filter((f) => f.kind !== 'noAnswer')),
    noAnswer: group(analysis.flags.filter((f) => f.kind === 'noAnswer')),
  };
}

/** The place after `line` (wrapping), for "Next to check". */
export function nextPlace(places: readonly CheckPlace[], line: number | undefined): CheckPlace | undefined {
  if (places.length === 0) return undefined;
  return places.find((p) => line === undefined || p.line > line) ?? places[0];
}

/** Every flag on each line, for the left pane's marks. */
export function flagsByLine(analysis: Analysis): Map<number, Flag[]> {
  const out = new Map<number, Flag[]>();
  for (const flag of analysis.flags) out.set(flag.line, [...(out.get(flag.line) ?? []), flag]);
  return out;
}

// ---- answers ----

/**
 * The option a click landed on: options are numbered by their first appearance among
 * the question's nodes (a paragraph each, or cells of a row), A = 0. Undefined when the
 * clicked node or cell is not an option.
 */
export function optionIndexAt(nodes: readonly RenderNode[], nodeIndex: number, cellIndex?: number): number | undefined {
  const order: string[] = [];
  const optionId = (node: RenderNode | undefined, cell?: number): string | undefined => {
    if (!node) return undefined;
    if (node.kind === 'text') return node.edit?.kind === 'mcqOption' ? node.edit.optionId : undefined;
    if (node.kind === 'columns' && cell !== undefined) {
      const edit = node.cells[cell]?.edit;
      return edit?.kind === 'mcqOption' ? edit.optionId : undefined;
    }
    return undefined;
  };
  for (const node of nodes) {
    const ids = node.kind === 'columns' ? node.cells.map((_, k) => optionId(node, k)) : [optionId(node)];
    for (const id of ids) if (id !== undefined && !order.includes(id)) order.push(id);
  }
  const clicked = optionId(nodes[nodeIndex], cellIndex);
  return clicked === undefined ? undefined : order.indexOf(clicked);
}

/** Where option `index` prints among the nodes: the node, and the cell in a row of options. */
export function optionPlace(nodes: readonly RenderNode[], index: number): { node: number; cell?: number } | undefined {
  let seen = -1;
  const ids = new Set<string>();
  for (const [n, node] of nodes.entries()) {
    const edits = node.kind === 'columns' ? node.cells.map((c) => c.edit) : node.kind === 'text' ? [node.edit] : [];
    for (const [c, edit] of edits.entries()) {
      if (edit?.kind !== 'mcqOption' || ids.has(edit.optionId)) continue;
      ids.add(edit.optionId);
      seen += 1;
      if (seen === index) return node.kind === 'columns' ? { node: n, cell: c } : { node: n };
    }
  }
  return undefined;
}

export const optionLetter = (index: number) => String.fromCharCode(65 + index);
