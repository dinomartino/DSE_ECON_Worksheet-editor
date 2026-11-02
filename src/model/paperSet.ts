import { documentShape } from './documentShape';
import type { PaperSet, Worksheet } from './types';

/**
 * Paper sets (k-0299, step A): the exam papers sat together as one mock, test or quiz.
 *
 * A set has no file of its own. Each member stores `{ id, name }` (`Worksheet.paperSet`), and
 * the set is "the papers carrying this id" — the way an exam board ties Paper 1 and Paper 2
 * together by what is printed on each, and a Finder tag lives in the file. So the link survives
 * sync, a `.json` hand-off, a backup and an older build editing the paper (`__unknown` keeps
 * the field there), and nothing can point at a member that is gone.
 *
 * The user's rules (2026-11-02): exam papers only (a Paper 1 or a Paper 2 booklet, never a
 * classroom or LQ worksheet); one set per paper; a duplicated paper leaves the set; the one
 * word for it is "Set" / 套卷.
 */

/** Which exam paper a member is, from its shape: derived, never stored. */
export type SetRole = 'paper1' | 'paper2';

/**
 * A stored `paperSet` value as a set, or `undefined` when it is not one. A malformed value is
 * read as "in no set" but never removed: the field stays as saved, like any data this build
 * cannot read. Keys a later build added are kept.
 */
export function readPaperSet(value: unknown): PaperSet | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const { id, name } = value as Record<string, unknown>;
  if (typeof id !== 'string' || id.trim() === '') return undefined;
  return { ...(value as PaperSet), id, name: typeof name === 'string' ? name : '' };
}

/** The set this paper is in, or `undefined`. */
export function paperSetOf(worksheet: Pick<Worksheet, 'paperSet'>): PaperSet | undefined {
  return readPaperSet(worksheet.paperSet);
}

/**
 * The exam paper this document is, or `undefined` when it cannot be in a set: a classroom or
 * LQ worksheet, or a question bank. A Paper 1 is the MC paper with its cover; a Paper 2 is the
 * long-question booklet (`documentShape`).
 */
export function setRoleOf(worksheet: Worksheet): SetRole | undefined {
  if (worksheet.kind !== undefined) return undefined;
  const shape = documentShape(worksheet);
  if (shape === 'paper1') return 'paper1';
  if (shape === 'lqMock') return 'paper2';
  return undefined;
}

/** `worksheet` in `set`. Joining the set it is already in keeps that copy's other keys. */
export function withPaperSet(worksheet: Worksheet, set: PaperSet): Worksheet {
  const own = paperSetOf(worksheet);
  const next: PaperSet = own && own.id === set.id ? { ...own, name: set.name } : { id: set.id, name: set.name };
  return { ...worksheet, paperSet: next };
}

/** `worksheet` in no set. */
export function withoutPaperSet(worksheet: Worksheet): Worksheet {
  if (worksheet.paperSet === undefined) return worksheet;
  const next = { ...worksheet };
  delete next.paperSet;
  return next;
}

/** The set renamed, on one member: its other keys kept. A paper in another set is left alone. */
export function withSetName(worksheet: Worksheet, setId: string, name: string): Worksheet {
  const own = paperSetOf(worksheet);
  if (!own || own.id !== setId || own.name === name) return worksheet;
  return { ...worksheet, paperSet: { ...own, name } };
}

/** "Paper 1", "paper2", "P.1", "卷一", "試卷二": the paper's number, wherever a name says it. */
const PAPER_NUMBER = /(?:\bpaper\s*[12]\b|\bp\.?\s?[12]\b|試?卷\s*[一二12])/giu;

/**
 * A name for a new set, from its first paper's name: the paper number taken out, so "S6 Mock
 * Paper 1 2026-27" proposes "S6 Mock 2026-27". The teacher edits it before it is used.
 */
export function suggestedSetName(paperName: string): string {
  const stripped = paperName
    .replace(PAPER_NUMBER, ' ')
    .replace(/\s*[–—-]\s*$/u, '')
    .replace(/^\s*[–—-]\s*/u, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || paperName.trim();
}

/**
 * Whether two papers' names look like halves of one exam: equal once the paper numbers are
 * taken out, and the names differ (two copies of one paper are not a pair). Only ever a
 * suggestion: the Make a set dialog ticks such a paper, the teacher decides.
 */
export function looksLikeSameExam(a: string, b: string): boolean {
  const key = (name: string) => suggestedSetName(name).toLocaleLowerCase();
  return a.trim() !== b.trim() && key(a) !== '' && key(a) === key(b);
}
