import { plain } from '@/model/text';
import type { Side } from '@/model/textSlots';
import type { BiText, ContentBlock, McqQuestion, Question, StructuredQuestion } from '@/model/types';

/**
 * Where an import check finding lives and what a fix touches, by content rather than by
 * id or position (k-0494): the review pane's preview carries figure slots the saved batch
 * does not, and an open paper has been edited since, so a block is found again by what it
 * says (`blockKey`) inside the list it belongs to. Pure; nothing here is stored.
 */

/** A question: its index in the checked list (an import's batch) or its id (an open paper). */
export type QRef = number | string;

/** One block list of a question. */
export type ListPath =
  | { list: 'stem' }
  | { list: 'before'; part: number }
  | { list: 'part'; part: number }
  | { list: 'sub'; part: number; sub: number }
  | { list: 'option'; option: number };

/** What carries marks: the question (a leaf or an MC), a part, a sub-part. */
export type OwnerPath = { owner: 'question' } | { owner: 'part'; part: number } | { owner: 'sub'; part: number; sub: number };

/** A text that is not inside a block: an option's line or a (1)(2)(3) statement. */
export type LineTarget = { line: 'option'; option: number } | { line: 'statement'; index: number };

export const norm = (text: string): string => text.replace(/[\s\u200b]+/g, ' ').trim();
/** For comparing a file's text with the paper's: no spaces, no case, full-width folded. */
export const loose = (text: string): string =>
  text
    .normalize('NFKC')
    .replace(/[\s\u200b]+/g, '')
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—−]/g, '-')
    .toLowerCase();

export const biPlain = (text: BiText | undefined): string => norm(`${plain(text?.en)} ${plain(text?.zh)}`);
export const sidePlain = (text: BiText | undefined, side: Side): string => plain(text?.[side]);

/** A picture's identity: its bytes' length and ends (a data: URL is long; ids are not kept). */
export const srcKey = (src: string): string => `${src.length}:${src.slice(0, 48)}:${src.slice(-32)}`;

/** Every word a block prints, both sides, nested blocks and cells included. */
export function blockText(block: ContentBlock): string {
  switch (block.kind) {
    case 'paragraph':
      return biPlain(block.text);
    case 'table':
      return norm([biPlain(block.caption), ...block.rows.flatMap((r) => r.cells.map((c) => biPlain(c.text)))].join(' '));
    case 'image':
      return biPlain(block.caption);
    case 'source':
      return norm([biPlain(block.label), ...block.blocks.map(blockText), biPlain(block.footnote)].join(' '));
    case 'figureRow':
      return norm(`${blockText(block.figure)} ${blockText(block.table)}`);
    default:
      return '';
  }
}

/** How a fix finds a block again: its kind and its words (a picture: its bytes). */
export function blockKey(block: ContentBlock): string {
  if (block.kind === 'image') return `image:${srcKey(block.src)}`;
  return `${block.kind}:${loose(blockText(block))}`;
}

export function listOf(question: Question, path: ListPath): ContentBlock[] | undefined {
  if (path.list === 'stem') return question.blocks;
  if (path.list === 'option') return question.type === 'mcq' ? ((question as McqQuestion).options[path.option]?.blocks ?? []) : undefined;
  if (question.type !== 'structured') return undefined;
  const part = (question as StructuredQuestion).parts[path.part];
  if (!part) return undefined;
  if (path.list === 'before') return part.blocksBefore ?? [];
  if (path.list === 'part') return part.blocks;
  return part.subParts?.[path.sub]?.blocks;
}

/** The question with one block list replaced (the list must exist). */
export function withList(question: Question, path: ListPath, blocks: ContentBlock[]): Question {
  if (path.list === 'stem') return { ...question, blocks };
  if (path.list === 'option') {
    const q = question as McqQuestion;
    return { ...q, options: q.options.map((o, k) => (k === path.option ? { ...o, ...(blocks.length ? { blocks } : { blocks: undefined }) } : o)) };
  }
  const q = question as StructuredQuestion;
  return {
    ...q,
    parts: q.parts.map((part, k) => {
      if (k !== path.part) return part;
      if (path.list === 'before') return { ...part, blocksBefore: blocks.length ? blocks : undefined };
      if (path.list === 'part') return { ...part, blocks };
      return { ...part, subParts: (part.subParts ?? []).map((s, j) => (j === path.sub ? { ...s, blocks } : s)) };
    }),
  };
}

/** Every block list a question has, in print order. */
export function listsOf(question: Question): ListPath[] {
  const out: ListPath[] = [{ list: 'stem' }];
  if (question.type === 'mcq') (question as McqQuestion).options.forEach((o, option) => o.blocks?.length && out.push({ list: 'option', option }));
  if (question.type === 'structured')
    (question as StructuredQuestion).parts.forEach((part, k) => {
      if (part.blocksBefore?.length) out.push({ list: 'before', part: k });
      out.push({ list: 'part', part: k });
      (part.subParts ?? []).forEach((_s, sub) => out.push({ list: 'sub', part: k, sub }));
    });
  return out;
}

export const samePath = (a: ListPath, b: ListPath): boolean => JSON.stringify(a) === JSON.stringify(b);

export function resolveQuestion(questions: readonly Question[], q: QRef): number {
  return typeof q === 'number' ? (q >= 0 && q < questions.length ? q : -1) : questions.findIndex((x) => x.id === q);
}

export function lineText(question: Question, target: LineTarget): BiText | undefined {
  if (question.type !== 'mcq') return undefined;
  const q = question as McqQuestion;
  return target.line === 'option' ? q.options[target.option]?.text : q.statements?.[target.index];
}

export function withLine(question: Question, target: LineTarget, text: BiText): Question {
  const q = question as McqQuestion;
  if (target.line === 'option') return { ...q, options: q.options.map((o, k) => (k === target.option ? { ...o, text } : o)) };
  return { ...q, statements: (q.statements ?? []).map((s, k) => (k === target.index ? text : s)) };
}

export function ownerMarks(question: Question, owner: OwnerPath): number | undefined | null {
  if (owner.owner === 'question') return question.marks;
  if (question.type !== 'structured') return null;
  const part = (question as StructuredQuestion).parts[owner.part];
  if (!part) return null;
  if (owner.owner === 'part') return part.marks;
  const sub = part.subParts?.[owner.sub];
  return sub ? sub.marks : null;
}

export function withOwnerMarks(question: Question, owner: OwnerPath, marks: number): Question {
  if (owner.owner === 'question') return { ...question, marks };
  const q = question as StructuredQuestion;
  return {
    ...q,
    parts: q.parts.map((part, k) => {
      if (k !== owner.part) return part;
      if (owner.owner === 'part') return { ...part, marks };
      return { ...part, subParts: (part.subParts ?? []).map((s, j) => (j === owner.sub ? { ...s, marks } : s)) };
    }),
  };
}

/** "(b)", "(b)(ii)", "Option C" — the place inside a question, for a finding's where. */
export function placeLabel(path: ListPath | OwnerPath | LineTarget | undefined): string {
  if (!path) return '';
  const letter = (n: number) => String.fromCharCode(97 + n);
  const roman = (n: number) => ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x'][n] ?? String(n + 1);
  if ('line' in path) return path.line === 'option' ? String.fromCharCode(65 + path.option) : `(${path.index + 1})`;
  if ('owner' in path) return path.owner === 'question' ? '' : path.owner === 'part' ? `(${letter(path.part)})` : `(${letter(path.part)})(${roman(path.sub)})`;
  if (path.list === 'stem') return '';
  if (path.list === 'option') return String.fromCharCode(65 + path.option);
  if (path.list === 'sub') return `(${letter(path.part)})(${roman(path.sub)})`;
  return `(${letter(path.part)})`;
}

/** The dotted answer lines an owner has (null: it cannot have any — an MC, a missing part). */
export function answerSpaceOf(question: Question, owner: OwnerPath): number | undefined | null {
  if (question.type !== 'structured') return null;
  const q = question as StructuredQuestion;
  if (owner.owner === 'question') return q.parts.length ? null : q.answerSpace;
  const part = q.parts[owner.part];
  if (!part) return null;
  if (owner.owner === 'part') return part.answerSpace;
  const sub = part.subParts?.[owner.sub];
  return sub ? sub.answerSpace : null;
}

export function withAnswerSpace(question: Question, owner: OwnerPath, lines: number): Question {
  const q = question as StructuredQuestion;
  if (owner.owner === 'question') return { ...q, answerSpace: lines };
  return {
    ...q,
    parts: q.parts.map((part, k) => {
      if (k !== owner.part) return part;
      if (owner.owner === 'part') return { ...part, answerSpace: lines };
      return { ...part, subParts: (part.subParts ?? []).map((s, j) => (j === owner.sub ? { ...s, answerSpace: lines } : s)) };
    }),
  };
}
