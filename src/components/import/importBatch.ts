import {
  analyseLines,
  buildImport,
  classifyImport,
  matchAnswers,
  readAnswerSheet,
  splitAnswers,
  suggestPairs,
  type AnswerMatch,
  type AnswerMatchResult,
  type AnswerSheet,
  type ClassifyReason,
  type FileClass,
  type FileRole,
  type Pin,
  type ReadPaste,
} from '@/import';
import { numberRuns } from '@/import/matchAnswers';
import type { TextKey } from '@/i18n/catalogue';
import type { FileOutcome } from './fileImport';
import type { IMPORT_MESSAGES } from './messages';
import { review, type Language, type Review } from './pasteSession';

/**
 * Several files at once (`docs/design/paste-import.md` § 11): which are papers and which
 * answers, which answers go with which paper, and each paper's review with the answer
 * file's pins applied before the teacher's. Pure, so it is tested without a DOM.
 */

type Key = TextKey<typeof IMPORT_MESSAGES>;

/** A chosen file once read: what it holds, and how a paper is cut from its answers. */
export interface BatchFile {
  id: string;
  name: string;
  outcome: FileOutcome;
  /** The engine's guess; a scan or a file that would not open is guessed by name alone. */
  guess: FileClass;
  /** A paper followed by its own answers ("-- End of Paper --", "Answers:"). */
  split?: ReturnType<typeof splitAnswers>;
}

const NO_TEXT: ReadPaste = { lines: [], source: 'pdf' };

export function examineFile(id: string, name: string, outcome: FileOutcome): BatchFile {
  if (outcome.kind !== 'ok') return { id, name, outcome, guess: classifyImport(NO_TEXT, name) };
  const split = splitAnswers(outcome.read);
  return { id, name, outcome, guess: classifyImport(outcome.read, name), ...(split.answers ? { split } : {}) };
}

/** `none`, `own` (the answers after the paper in the same file), or an answers file's id. */
export type AnswerChoice = string;
export const NO_ANSWERS = 'none';
export const OWN_ANSWERS = 'own';

/** The teacher's choices on the link screen. */
export interface Links {
  /** Roles changed from the guess, by file id. */
  roles: Record<string, FileRole>;
  /** Answers picked for a paper, by its file id; absent follows the suggestion. */
  answers: Record<string, AnswerChoice>;
  removed: string[];
}

export const NO_LINKS: Links = { roles: {}, answers: {}, removed: [] };

export const roleOf = (file: BatchFile, links: Links): FileRole => links.roles[file.id] ?? file.guess.role;
export const kept = (files: readonly BatchFile[], links: Links) => files.filter((f) => !links.removed.includes(f.id));
const readable = (file: BatchFile) => file.outcome.kind === 'ok';

/** The files that become papers, in the order chosen. */
export function papersOf(files: readonly BatchFile[], links: Links): BatchFile[] {
  return kept(files, links).filter((f) => readable(f) && roleOf(f, links) !== 'answers');
}

/** Answer files that can be read (a scan links nothing until text recognition). */
export function answerFilesOf(files: readonly BatchFile[], links: Links): BatchFile[] {
  return kept(files, links).filter((f) => readable(f) && roleOf(f, links) === 'answers');
}

/** A paper's own answers can be chosen when it holds them, or the teacher says it does. */
export const hasOwnAnswers = (file: BatchFile, links: Links) => Boolean(file.split?.answers) || roleOf(file, links) === 'both';

/** The choices in a paper's "Answers from" picker. */
export function answerChoices(paper: BatchFile, files: readonly BatchFile[], links: Links): AnswerChoice[] {
  return [NO_ANSWERS, ...(hasOwnAnswers(paper, links) ? [OWN_ANSWERS] : []), ...answerFilesOf(files, links).map((f) => f.id)];
}

/** Each paper's answers: the teacher's pick where it still applies, else `suggestPairs`. */
export function linkedAnswers(files: readonly BatchFile[], links: Links): Record<string, AnswerChoice> {
  const usable = kept(files, links).filter(readable);
  const suggested = new Map(suggestPairs(usable.map((f) => ({ id: f.id, name: f.name, role: roleOf(f, links) }))).map((p) => [p.questions, p.answers]));
  const out: Record<string, AnswerChoice> = {};
  for (const paper of papersOf(files, links)) {
    const choices = answerChoices(paper, files, links);
    const picked = links.answers[paper.id];
    if (picked !== undefined && choices.includes(picked)) {
      out[paper.id] = picked;
      continue;
    }
    const guess = suggested.get(paper.id);
    out[paper.id] = guess === undefined ? NO_ANSWERS : guess === paper.id ? (hasOwnAnswers(paper, links) ? OWN_ANSWERS : NO_ANSWERS) : guess;
  }
  return out;
}

/** The questions to review: a paper cut from its answers loses them. */
export function paperRead(file: BatchFile): ReadPaste {
  if (file.outcome.kind !== 'ok') return NO_TEXT;
  return file.split?.answers ? file.split.questions : file.outcome.read;
}

/** Each answer file is read once, however often the review re-solves. */
const sheets = new WeakMap<object, AnswerSheet>();
const sheetOf = (key: object, read: ReadPaste & { pages?: number }) => {
  let sheet = sheets.get(key);
  if (!sheet) sheets.set(key, (sheet = readAnswerSheet(read)));
  return sheet;
};

/** The answer sheet a choice reads, and the name to credit it to. Undefined for none. */
export function answerSource(paper: BatchFile, choice: AnswerChoice, files: readonly BatchFile[]): { sheet: AnswerSheet; name: string } | undefined {
  if (choice === NO_ANSWERS) return undefined;
  if (choice === OWN_ANSWERS) return paper.split?.answers ? { sheet: sheetOf(paper.split.answers, paper.split.answers), name: paper.name } : undefined;
  const file = files.find((f) => f.id === choice);
  if (!file || file.outcome.kind !== 'ok') return undefined;
  const { read, pages } = file.outcome;
  return { sheet: sheetOf(file.outcome, pages ? { ...read, pages } : read), name: file.name };
}

// ---- one paper's review ----

/** A paper's review state: the teacher's fixes, and the answer-file pins taken back. */
export interface PaperState {
  pins: Pin[];
  language: Language;
  /** `sheetPinKey`s of answer-file pins removed by the teacher. */
  dropped: string[];
  /** What ⌘Z takes back next: a fix, or a removed answer-file pin. */
  undo: Array<'pin' | 'drop'>;
}

export const paperState = (language: Language): PaperState => ({ pins: [], language, dropped: [], undo: [] });

export const sheetPinKey = (pin: Pin) =>
  pin.kind === 'scheme' ? `scheme:${pin.line}:${pin.part ?? ''}:${pin.subPart ?? ''}` : pin.kind === 'answer' ? `answer:${pin.line}` : '';

export interface PaperReview extends Review {
  /** The answer file matched against the paper, before the teacher's answer clicks. */
  match?: AnswerMatchResult;
  /** The answer-file pins in force (matched, not removed). */
  sheetPins: Pin[];
}

/**
 * One solve of a paper with its answers: match the sheet on the paper as the teacher fixed
 * it (answer clicks aside, so a conflict is still reported), then solve with the sheet's
 * pins first so a teacher's click wins over them.
 */
export function paperReview(read: ReadPaste, state: PaperState, sheet?: AnswerSheet): PaperReview {
  if (!sheet) return { ...review(read, state.pins, state.language), sheetPins: [] };
  const structural = state.pins.filter((p) => p.kind !== 'answer');
  const match = matchAnswers(analyseLines(read, { pins: structural, language: state.language }), sheet);
  const sheetPins = match.pins.filter((p) => !state.dropped.includes(sheetPinKey(p)));
  const analysis = analyseLines(read, { pins: [...sheetPins, ...state.pins], language: state.language });
  return { analysis, batch: buildImport(analysis), preview: buildImport(analysis, { preview: true }), match, sheetPins };
}

// ---- the answers summary ----

export type AnswerRowKind =
  | 'missing'
  | 'missingPart'
  | 'conflict'
  | 'outOfRange'
  | 'noLetter'
  | 'notWritten'
  | 'needsPart'
  | 'noSuchQuestion'
  | 'noSuchPart'
  | 'duplicate'
  | 'several'
  | 'marks';

/** One thing to check about the answers, with where it is. */
export interface AnswerRow {
  kind: AnswerRowKind;
  /** "Q4", "Q3(b)(ii)", with "(Part B)" when the paper's numbering restarts. */
  where: { question: number | string; part?: string; section?: string };
  /** The question's index and first line, when it is in the paper. */
  question?: number;
  line?: number;
  /** The part and sub-part it is about (0-based), for the order within a question. */
  at?: [number, number];
  letters?: string[];
  paperLetter?: string;
  sheetLetter?: string;
  options?: number;
  marks?: { sheet: number; paper: number };
}

export interface AnswerSummary {
  mcSet: number;
  mc: number;
  schemes: number;
  rows: AnswerRow[];
}

const letter = (n: number) => String.fromCharCode(65 + n);
const bare = (label: string | undefined) => (label ?? '').replace(/[()（）.\s]/g, '');

/** What the answers did to a paper, and the rows to check, in paper order. */
export function answerSummary(result: PaperReview, sheet: AnswerSheet): AnswerSummary {
  const { analysis, match } = result;
  const questions = analysis.outline.questions;
  const mc = questions.filter((q) => q.kind === 'mc');
  const out: AnswerSummary = {
    mc: mc.length,
    mcSet: mc.filter((q) => q.answer?.from === 'sheet').length,
    schemes: questions.reduce(
      (n, q) => n + (q.kind === 'written' ? [q, ...q.parts, ...q.parts.flatMap((p) => p.subParts)].filter((x) => x.scheme).length : 0),
      0,
    ),
    rows: [],
  };
  if (!match) return out;

  const runs = numberRuns(analysis);
  const runOf = new Map(runs.flatMap((r, n) => r.questions.map((k) => [k, n] as const)));
  const section = (k: number) => {
    if (runs.length < 2) return undefined;
    const n = runOf.get(k) ?? 0;
    return [...runs[n].keys].find((key) => !key.startsWith('P')) ?? letter(n);
  };
  const at = (k: number, part?: number, subPart?: number) => {
    const q = questions[k];
    const p = part !== undefined ? q.parts[part] : undefined;
    const s = p && subPart !== undefined ? p.subParts[subPart] : undefined;
    const label = [p && `(${bare(p.label) || letter(part!).toLowerCase()})`, s && `(${bare(s.label) || String(subPart! + 1)})`].filter(Boolean).join('');
    const sec = section(k);
    return { question: q.number ?? k + 1, ...(label ? { part: label } : {}), ...(sec ? { section: sec } : {}) };
  };
  // A question the teacher answered by clicking is settled.
  const clicked = new Set(
    result.analysis.outline.questions.flatMap((q, k) => (q.answer?.from === 'pin' ? [k] : [])),
  );
  const row = (r: AnswerMatch): AnswerRow[] => {
    const k = r.question;
    const base = k !== undefined ? { question: k, line: questions[k].start } : {};
    const entry = sheet.entries[r.entries[0]];
    const sheetWhere = () => {
      const fromPaper = k !== undefined ? at(k) : undefined;
      return {
        question: entry?.question ?? '?',
        ...(entry?.part ? { part: `(${entry.part})${entry.subPart ? `(${entry.subPart})` : ''}` } : {}),
        ...(fromPaper?.section ? { section: fromPaper.section } : {}),
      };
    };
    if (k !== undefined && clicked.has(k) && questions[k].kind === 'mc' && r.status !== 'extra') return [];
    switch (r.status) {
      case 'missing':
        return [{ kind: 'missing', where: at(k!), ...base }];
      case 'conflict':
        return [{ kind: 'conflict', where: at(k!), ...base, paperLetter: letter(r.paperAnswer!), sheetLetter: letter(r.sheetAnswer!) }];
      case 'extra':
        return [{ kind: r.detail === 'duplicate' ? 'duplicate' : r.detail === 'noSuchPart' ? 'noSuchPart' : 'noSuchQuestion', where: sheetWhere(), ...base }];
      case 'mismatch': {
        const kind: AnswerRowKind =
          r.detail === 'letterOutOfRange' ? 'outOfRange' : r.detail === 'notWritten' ? 'notWritten' : r.detail === 'needsPart' ? 'needsPart' : 'noLetter';
        return [{ kind, where: at(k!), ...base, ...(r.sheetAnswer !== undefined ? { sheetLetter: letter(r.sheetAnswer) } : {}), options: questions[k!].options.length }];
      }
      case 'matched': {
        const rows: AnswerRow[] = [];
        if (r.detail === 'severalAnswers' && r.letters) rows.push({ kind: 'several', where: at(k!), ...base, letters: r.letters.map(letter) });
        for (const p of r.missingParts ?? []) rows.push({ kind: 'missingPart', where: at(k!, p.part), ...base, at: [p.part, -1] });
        for (const d of r.marks ?? []) rows.push({ kind: 'marks', where: at(k!, d.part, d.subPart), ...base, at: [d.part ?? -1, d.subPart ?? -1], marks: { sheet: d.sheet, paper: d.paper } });
        return rows;
      }
    }
  };
  // `conflict` rows carry part notes too.
  const partRows = (r: AnswerMatch): AnswerRow[] =>
    r.status === 'conflict' || r.status === 'mismatch'
      ? [
          ...(r.missingParts ?? []).map((p) => ({ kind: 'missingPart' as const, where: at(r.question!, p.part), question: r.question, line: questions[r.question!].start, at: [p.part, -1] as [number, number] })),
          ...(r.marks ?? []).map((d) => ({ kind: 'marks' as const, where: at(r.question!, d.part, d.subPart), question: r.question, line: questions[r.question!].start, at: [d.part ?? -1, d.subPart ?? -1] as [number, number], marks: { sheet: d.sheet, paper: d.paper } })),
        ]
      : [];
  const rows = match.report.flatMap((r) => [...row(r), ...partRows(r)]);
  // Paper order, parts in order within a question; rows about the sheet alone (no question) last.
  const key = (r: AnswerRow) => [r.line ?? Infinity, r.at?.[0] ?? -1, r.at?.[1] ?? -1];
  out.rows = rows
    .map((r, n) => ({ r, n, k: key(r) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.n - b.n)
    .map(({ r }) => r);
  return out;
}

/** The row after the one at `index` (wrapping), for "Next to check". */
export const nextRow = (rows: readonly AnswerRow[], index: number | undefined) => (rows.length ? ((index ?? -1) + 1) % rows.length : undefined);

// ---- words ----

/** The plain-words reasons the link screen shows for a guess (the uninformative left out). */
export const REASON_TEXT: Partial<Record<ClassifyReason, Key>> = {
  nameSaysAnswers: 'reasonName',
  keyEntries: 'reasonKey',
  schemeEntries: 'reasonScheme',
  mcQuestions: 'reasonMc',
  writtenQuestions: 'reasonWritten',
  answersInPaper: 'reasonAnswersInPaper',
  noText: 'reasonNoText',
};

/** Whether the batch needs the link screen: several files, or one that holds only answers. */
export function needsLinking(files: readonly BatchFile[]): boolean {
  return files.length > 1 || (files.length === 1 && files[0].outcome.kind === 'ok' && files[0].guess.role === 'answers');
}

/** The rows about each question, for its card in the preview. */
export function rowsByQuestion(rows: readonly AnswerRow[]): Map<number, AnswerRow[]> {
  const out = new Map<number, AnswerRow[]>();
  for (const r of rows) if (r.question !== undefined) out.set(r.question, [...(out.get(r.question) ?? []), r]);
  return out;
}
