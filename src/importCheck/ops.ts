import { newId } from '@/model/factories';
import { normalizeRuns, plain, replaceRichTextRange } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, ContentBlock, ImageBlock, McqOption, McqQuestion, Question, StructuredQuestion, TableBlock } from '@/model/types';
import {
  answerSpaceOf,
  withAnswerSpace,
  blockKey,
  lineText,
  listOf,
  ownerMarks,
  resolveQuestion,
  withLine,
  withList,
  withOwnerMarks,
  type LineTarget,
  type ListPath,
  type OwnerPath,
  type QRef,
} from './address';

/**
 * The import check's fixes (k-0494): a closed set of edits, each a pure
 * `Question[] → Question[]` that keeps every question's id and the number of questions.
 * A fix finds its block again by `blockKey`; when the paper moved on (the text was edited,
 * the block went) it no longer applies and `applyOp` returns null, so nothing is written
 * that the teacher did not see. The AI's proposals become these too (`./ai.ts`), checked
 * the same way before they can be offered.
 */

/** A block inside one list, found by `blockKey`; a source panel's inner blocks are searched too. */
export interface BlockAt {
  q: QRef;
  list: ListPath;
  key: string;
}

export type CheckOp =
  /** Replace `from` with `to` on one side of a paragraph (`to: ''` removes it). A paragraph left empty goes. */
  | { op: 'editText'; at: BlockAt; side: Side; from: string; to: string }
  /** The same on an option's line or a statement. */
  | { op: 'editLine'; q: QRef; target: LineTarget; side: Side; from: string; to: string }
  | { op: 'removeBlock'; at: BlockAt }
  /** `expect`: the marks it had when found (null: none), so a teacher's own value is never overwritten. */
  | { op: 'setMarks'; q: QRef; owner: OwnerPath; marks: number; expect: number | null }
  /** Every text of the question from one side to the other (a Chinese question put on the English side). */
  | { op: 'moveSide'; q: QRef; from: Side; to: Side }
  /** One option's line holds the next ones too ("A. … B. …"): it becomes `texts`, the options after it shift. */
  | { op: 'splitOption'; q: QRef; option: number; side: Side; expect: string; texts: string[] }
  /** A picture taken out of one place and put in another (`after`: the block it follows; absent = end of the list). */
  | { op: 'moveBlock'; from: BlockAt; to: { q: QRef; list: ListPath; after?: string } }
  | { op: 'resizeImage'; at: BlockAt; widthPx: number; heightPx: number }
  /** Blocks from the file put back (`after`: the block they follow; absent = start of the list). */
  | { op: 'insertBlocks'; q: QRef; list: ListPath; after?: string; blocks: ContentBlock[] }
  /** A block rebuilt from the file (a table): the new block keeps the old one's id. */
  | { op: 'replaceBlock'; at: BlockAt; block: ContentBlock }
  /** The same as `editText`, in one cell of a table. */
  | { op: 'editCell'; at: BlockAt; row: number; cell: number; side: Side; from: string; to: string }
  /** A paragraph and the one after it (`next`) made one, a space between. */
  | { op: 'joinParagraphs'; at: BlockAt; next: string }
  /** A written question with no parts made an MC with four empty options (its stem kept). */
  | { op: 'makeMc'; q: QRef; expect: string }
  /** Dotted answer lines after a part (or a whole-question essay); `expect` as `setMarks`. */
  | { op: 'setAnswerSpace'; q: QRef; owner: OwnerPath; lines: number; expect: number | null }
  /** Several ops as one fix: all of them, or none. */
  | { op: 'batch'; ops: CheckOp[] };

type Located = { blocks: ContentBlock[]; index: number; path: number[] };

/** The block with `key` in `blocks` (or inside a source panel there), first match. */
function locate(blocks: readonly ContentBlock[], key: string, path: number[] = []): Located | undefined {
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (blockKey(block) === key) return { blocks: blocks as ContentBlock[], index: i, path: [...path, i] };
    if (block.kind === 'source') {
      const inner = locate(block.blocks, key, [...path, i]);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** `blocks` with the block at `path` replaced by `next` (none: removed). */
function replaceAt(blocks: readonly ContentBlock[], path: readonly number[], next: ContentBlock[]): ContentBlock[] {
  const [head, ...rest] = path;
  if (!rest.length) return [...blocks.slice(0, head), ...next, ...blocks.slice(head + 1)];
  return blocks.map((block, i) => (i === head && block.kind === 'source' ? { ...block, blocks: replaceAt(block.blocks, rest, next) } : block));
}

function editRuns(text: BiText, side: Side, from: string, to: string): BiText | null {
  const flat = plain(text[side]);
  const at = flat.indexOf(from);
  if (!from || at === -1) return null;
  const runs = replaceRichTextRange(text[side], at, at + from.length, to);
  // Removing words leaves the spaces around them: two become one, none at either end.
  return { ...text, [side]: normalizeRuns(to ? runs : tidy(runs)) };
}

/** Double spaces to one (across runs too) and the ends trimmed, formatting kept. */
function tidy(runs: BiText['en']): BiText['en'] {
  const out: BiText['en'] = [];
  let space = true; // at the start, a space is dropped
  for (const run of runs) {
    let text = run.text.replace(/[ \t]{2,}/g, ' ');
    if (space) text = text.replace(/^[ \t]+/, '');
    if (!text) continue;
    space = /[ \t]$/.test(text);
    out.push({ ...run, text });
  }
  if (out.length) {
    const last = out.length - 1;
    out[last] = { ...out[last], text: out[last].text.replace(/[ \t]+$/, '') };
  }
  return out.filter((r) => r.text !== '');
}

const empty = (text: BiText) => plain(text.en).trim() === '' && plain(text.zh).trim() === '';

function swapSide(text: BiText | undefined, from: Side, to: Side): BiText | undefined {
  if (!text || !text[from].length) return text;
  return { ...text, [to]: [...text[to], ...text[from]], [from]: [] };
}

function swapBlocks(blocks: readonly ContentBlock[], from: Side, to: Side): ContentBlock[] {
  return blocks.map((block): ContentBlock => {
    switch (block.kind) {
      case 'paragraph':
        return { ...block, text: swapSide(block.text, from, to)! };
      case 'table':
        return {
          ...block,
          ...(block.caption ? { caption: swapSide(block.caption, from, to) } : {}),
          rows: block.rows.map((row) => ({ ...row, cells: row.cells.map((c) => ({ ...c, text: swapSide(c.text, from, to)! })) })),
        };
      case 'source':
        return {
          ...block,
          ...(block.label ? { label: swapSide(block.label, from, to) } : {}),
          ...(block.footnote ? { footnote: swapSide(block.footnote, from, to) } : {}),
          blocks: swapBlocks(block.blocks, from, to),
        };
      default:
        return block;
    }
  });
}

function moveSide(question: Question, from: Side, to: Side): Question {
  const blocks = swapBlocks(question.blocks, from, to);
  if (question.type === 'mcq') {
    const q = question as McqQuestion;
    return {
      ...q,
      blocks,
      options: q.options.map((o) => ({ ...o, text: swapSide(o.text, from, to)!, ...(o.blocks ? { blocks: swapBlocks(o.blocks, from, to) } : {}) })),
      ...(q.statements ? { statements: q.statements.map((s) => swapSide(s, from, to)!) } : {}),
    };
  }
  const q = question as StructuredQuestion;
  return {
    ...q,
    blocks,
    parts: q.parts.map((p) => ({
      ...p,
      blocks: swapBlocks(p.blocks, from, to),
      ...(p.blocksBefore ? { blocksBefore: swapBlocks(p.blocksBefore, from, to) } : {}),
      ...(p.subParts ? { subParts: p.subParts.map((s) => ({ ...s, blocks: swapBlocks(s.blocks, from, to) })) } : {}),
    })),
  };
}

/** A block put in a new place gets a fresh id (the same block may still be in the review's other build). */
const fresh = (block: ContentBlock): ContentBlock => ({ ...block, id: newId() });

/**
 * `questions` with `op` applied, or null when it no longer applies (the question, block or
 * words it was found on are gone or changed). Never changes the number of questions.
 */
export function applyOp(questions: readonly Question[], op: CheckOp, renamed?: ReadonlyMap<string, string>): Question[] | null {
  const set = (k: number, next: Question | null): Question[] | null => (next ? questions.map((q, i) => (i === k ? next : q)) : null);
  const find = (at: BlockAt) => {
    const k = resolveQuestion(questions, at.q);
    const list = k === -1 ? undefined : listOf(questions[k], at.list);
    const hit = list && (locate(list, at.key) ?? locate(list, follow(at.key, renamed)));
    return hit && list ? { k, list, hit } : undefined;
  };
  switch (op.op) {
    case 'editText': {
      const found = find(op.at);
      if (!found) return null;
      const block = found.hit.blocks[found.hit.index];
      if (block.kind !== 'paragraph') return null;
      const text = editRuns(block.text, op.side, op.from, op.to);
      if (!text) return null;
      const next = empty(text) ? [] : [{ ...block, text }];
      return set(found.k, withList(questions[found.k], op.at.list, replaceAt(found.list, found.hit.path, next)));
    }
    case 'editLine': {
      const k = resolveQuestion(questions, op.q);
      const text = k === -1 ? undefined : lineText(questions[k], op.target);
      const next = text && editRuns(text, op.side, op.from, op.to);
      return next ? set(k, withLine(questions[k], op.target, next)) : null;
    }
    case 'removeBlock': {
      const found = find(op.at);
      if (!found) return null;
      return set(found.k, withList(questions[found.k], op.at.list, replaceAt(found.list, found.hit.path, [])));
    }
    case 'setMarks': {
      const k = resolveQuestion(questions, op.q);
      if (k === -1 || !Number.isInteger(op.marks) || op.marks < 0 || op.marks > 100) return null;
      const now = ownerMarks(questions[k], op.owner);
      if (now === op.marks) return [...questions]; // already so (another fix set it): nothing to do, nothing wrong
      if (now === null || (now ?? null) !== op.expect) return null;
      return set(k, withOwnerMarks(questions[k], op.owner, op.marks));
    }
    case 'moveSide': {
      const k = resolveQuestion(questions, op.q);
      return k === -1 || op.from === op.to ? null : set(k, moveSide(questions[k], op.from, op.to));
    }
    case 'splitOption': {
      const k = resolveQuestion(questions, op.q);
      if (k === -1 || questions[k].type !== 'mcq') return null;
      const q = questions[k] as McqQuestion;
      const option = q.options[op.option];
      if (!option || plain(option.text[op.side]) !== op.expect || op.texts.length < 2) return null;
      const made: McqOption[] = op.texts.map((t, n) => ({
        ...(n === 0 ? option : { id: newId() }),
        text: { en: op.side === 'en' ? [{ text: t }] : [], zh: op.side === 'zh' ? [{ text: t }] : [] },
      }));
      const options = [...q.options.slice(0, op.option), ...made, ...q.options.slice(op.option + 1)].filter(
        // An empty option the split now fills is dropped: the split's options take its place.
        (o, n, all) => !(n > op.option + made.length - 1 && empty(o.text) && !o.blocks?.length && all.length > 4),
      );
      return set(k, { ...q, options });
    }
    case 'moveBlock': {
      const found = find(op.from);
      if (!found) return null;
      const block = found.hit.blocks[found.hit.index];
      const removed = set(found.k, withList(questions[found.k], op.from.list, replaceAt(found.list, found.hit.path, [])));
      if (!removed) return null;
      return insert(removed, op.to.q, op.to.list, op.to.after, [fresh(block)], 'end');
    }
    case 'resizeImage': {
      const found = find(op.at);
      if (!found) return null;
      const block = found.hit.blocks[found.hit.index];
      if (block.kind !== 'image' || op.widthPx < 16 || op.heightPx < 16) return null;
      const next: ImageBlock = { ...block, widthPx: Math.round(op.widthPx), heightPx: Math.round(op.heightPx) };
      return set(found.k, withList(questions[found.k], op.at.list, replaceAt(found.list, found.hit.path, [next])));
    }
    case 'insertBlocks':
      return op.blocks.length ? insert(questions, op.q, op.list, op.after, op.blocks.map(fresh), 'start') : null;
    case 'replaceBlock': {
      const found = find(op.at);
      if (!found) return null;
      const old = found.hit.blocks[found.hit.index];
      if (old.kind !== op.block.kind) return null;
      const next = { ...op.block, id: old.id } as ContentBlock;
      return set(found.k, withList(questions[found.k], op.at.list, replaceAt(found.list, found.hit.path, [next])));
    }
    case 'editCell': {
      const found = find(op.at);
      if (!found) return null;
      const block = found.hit.blocks[found.hit.index];
      const cell = block.kind === 'table' ? block.rows[op.row]?.cells[op.cell] : undefined;
      if (block.kind !== 'table' || !cell) return null;
      const text = editRuns(cell.text, op.side, op.from, op.to);
      if (!text) return null;
      const next: TableBlock = {
        ...block,
        rows: block.rows.map((r, i) => (i === op.row ? { ...r, cells: r.cells.map((c, j) => (j === op.cell ? { ...c, text } : c)) } : r)),
      };
      return set(found.k, withList(questions[found.k], op.at.list, replaceAt(found.list, found.hit.path, [next])));
    }
    case 'joinParagraphs': {
      const found = find(op.at);
      if (!found) return null;
      const first = found.hit.blocks[found.hit.index];
      const second = found.hit.blocks[found.hit.index + 1];
      if (first.kind !== 'paragraph' || second?.kind !== 'paragraph' || blockKey(second) !== op.next) return null;
      const join = (a: BiText['en'], b: BiText['en']) => (a.length && b.length ? normalizeRuns([...tidy(a), { text: ' ' }, ...tidy(b)]) : [...a, ...b]);
      const merged = { ...first, text: { en: join(first.text.en, second.text.en), zh: join(first.text.zh, second.text.zh) } };
      const path = found.hit.path;
      const joined = replaceAt(replaceAt(found.list, path, [merged]), [...path.slice(0, -1), path[path.length - 1] + 1], []);
      return set(found.k, withList(questions[found.k], op.at.list, joined));
    }
    case 'setAnswerSpace': {
      const k = resolveQuestion(questions, op.q);
      if (k === -1 || !Number.isInteger(op.lines) || op.lines < 1 || op.lines > 120) return null;
      const now = answerSpaceOf(questions[k], op.owner);
      if (now === null || (now ?? null) !== op.expect) return null;
      return set(k, withAnswerSpace(questions[k], op.owner, op.lines));
    }
    case 'batch': {
      let current: Question[] | null = [...questions];
      for (const inner of op.ops) {
        current = current && applyOp(current, inner, renamed);
        if (!current) return null;
      }
      return current;
    }
    case 'makeMc': {
      const k = resolveQuestion(questions, op.q);
      const q = k === -1 ? undefined : questions[k];
      if (!q || q.type !== 'structured' || (q as StructuredQuestion).parts.length || blockKeys(q.blocks) !== op.expect) return null;
      const mc: McqQuestion = {
        id: q.id,
        type: 'mcq',
        blocks: q.blocks,
        options: Array.from({ length: 4 }, () => ({ id: newId(), text: { en: [], zh: [] } })),
        answerIndex: 0,
        ...(q.tags ? { tags: q.tags } : {}),
      };
      return set(k, mc);
    }
  }
}

/** A list's blocks as one key: what `makeMc` checks the stem against. */
export const blockKeys = (blocks: readonly ContentBlock[]): string => blocks.map(blockKey).join('|');

function follow(key: string, renamed: ReadonlyMap<string, string> | undefined): string {
  let at = key;
  for (let n = 0; renamed?.has(at) && n < 50; n++) at = renamed.get(at)!;
  return at;
}

/** The block keys an op changes, before and after: later ops of the same run find their block again. */
function renames(before: readonly Question[], after: readonly Question[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  before.forEach((q, i) => {
    if (after[i] === q) return;
    const ids = new Map<string, string>();
    const walk = (blocks: readonly ContentBlock[] | undefined, into: Map<string, string>) => {
      for (const b of blocks ?? []) {
        into.set(b.id, blockKey(b));
        if (b.kind === 'source') walk(b.blocks, into);
      }
    };
    const all = (x: Question, into: Map<string, string>) => {
      walk(x.blocks, into);
      if (x.type === 'mcq') (x as McqQuestion).options.forEach((o) => walk(o.blocks, into));
      else (x as StructuredQuestion).parts.forEach((p) => [p.blocksBefore, p.blocks, ...(p.subParts ?? []).map((s) => s.blocks)].forEach((l) => walk(l, into)));
    };
    all(q, ids);
    const next = new Map<string, string>();
    all(after[i], next);
    for (const [id, key] of ids) {
      const now = next.get(id);
      if (now && now !== key) out.push([key, now]);
    }
  });
  return out;
}

function insert(questions: readonly Question[], q: QRef, path: ListPath, after: string | undefined, blocks: ContentBlock[], fallback: 'start' | 'end'): Question[] | null {
  const k = resolveQuestion(questions, q);
  const list = k === -1 ? undefined : listOf(questions[k], path);
  if (!list) return null;
  let at = fallback === 'start' ? 0 : list.length;
  if (after !== undefined) {
    const i = list.findIndex((b) => blockKey(b) === after);
    if (i === -1) return null;
    at = i + 1;
  }
  // Into a stem that is only the editor's empty starting paragraph: that paragraph goes.
  const base = list.length === 1 && list[0].kind === 'paragraph' && empty(list[0].text) ? [] : list;
  const next = base === list ? [...list.slice(0, at), ...blocks, ...list.slice(at)] : blocks;
  return questions.map((x, i) => (i === k ? withList(x, path, next) : x));
}

/** Every op that still applies, in order; the ones that do not are counted. */
export function applyOps(questions: readonly Question[], ops: readonly CheckOp[]): { questions: Question[]; applied: number; stale: number } {
  let current = [...questions];
  let applied = 0;
  const renamed = new Map<string, string>();
  for (const op of ops) {
    const next = applyOp(current, op, renamed);
    if (next) {
      for (const [from, to] of renames(current, next)) renamed.set(from, to);
      current = next;
      applied++;
    }
  }
  return { questions: current, applied, stale: ops.length - applied };
}

export const isTable = (block: ContentBlock): block is TableBlock => block.kind === 'table';
