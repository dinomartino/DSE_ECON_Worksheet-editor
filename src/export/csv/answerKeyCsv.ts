import { resolveFlow } from '@/model/flow';
import { computeNumbering, statementLabel } from '@/model/numbering';
import { fileTitle, plain } from '@/model/text';
import type { BiText, ContentBlock, LanguageMode, Worksheet } from '@/model/types';
import { requireQuestionType } from '@/registry';
import type { QuizItem } from '@/registry/types';

/**
 * The MCQ key and the MCQs themselves, for apps that are not Word: a bubble-sheet
 * scanner's key, or a quiz game's question set. Pure — the dialog shows `warnings`
 * before export, and never truncates to make a limit fit.
 */

export type AppFormat = 'zipgrade' | 'keyCsv' | 'kahoot' | 'blooket';

export interface AppExport {
  fileName: string;
  /** CSV text, or the sheet's rows for `.xlsx` (row index = sheet row − 1). */
  data: { kind: 'csv'; text: string } | { kind: 'xlsx'; rows: Array<Array<string | number>> };
  warnings: string[];
  /** Nothing to export: no lettered-choice questions. */
  empty: boolean;
}

// ─── CSV (RFC 4180) ────────────────────────────────────────────────────────────

export const BOM = '﻿';

/** Quote a field only when it must be: a comma, quote, CR or LF inside. */
export function csvField(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows joined with CRLF, the RFC's line break, and one after the last row. */
export function toCsv(rows: Array<Array<string | number>>, options: { bom?: boolean } = {}): string {
  const body = rows.map((row) => row.map(csvField).join(',')).join('\r\n') + '\r\n';
  return options.bom ? BOM + body : body;
}

// ─── The key ───────────────────────────────────────────────────────────────────

export interface KeyRow {
  /** The number the paper prints. */
  number: number;
  /** Absent = no key set. */
  letter?: string;
  /** The section heading the question falls under, if any. */
  section?: BiText;
  /** Flat marks; absent = unmarked. */
  marks?: number;
}

/** One row per lettered-choice question, in paper order, numbered as printed. */
export function answerKeyRows(worksheet: Worksheet): KeyRow[] {
  const numbering = computeNumbering(worksheet);
  const rows: KeyRow[] = [];
  let section: BiText | undefined;
  for (const item of resolveFlow(worksheet)) {
    if (item.type === 'layout') {
      if (item.element.kind === 'section') section = item.element.text;
      continue;
    }
    const number = numbering.byQuestionId.get(item.question.id)?.number ?? 0;
    const entry = requireQuestionType(item.question).answerKey?.(item.question, { questionNumber: number });
    if (entry?.kind !== 'choice') continue;
    rows.push({
      number,
      ...(entry.letter ? { letter: entry.letter } : {}),
      ...(section ? { section } : {}),
      ...(item.question.marks !== undefined ? { marks: item.question.marks } : {}),
    });
  }
  return rows;
}

function hasRepeats(rows: KeyRow[]): boolean {
  return new Set(rows.map((row) => row.number)).size !== rows.length;
}

function numberList(numbers: number[]): string {
  const shown = numbers.slice(0, 8).map((n) => `Q${n}`).join(', ');
  return numbers.length > 8 ? `${shown} and ${numbers.length - 8} more` : shown;
}

function unkeyedWarning(rows: Array<{ number: number; keyed: boolean }>, consequence: string): string[] {
  const unkeyed = rows.filter((row) => !row.keyed).map((row) => row.number);
  return unkeyed.length === 0 ? [] : [`${numberList(unkeyed)}: no key set — ${consequence}.`];
}

/**
 * ZipGrade's key import: `Key Letter, Question Number, Response/Mapping, Point Value`
 * (support.zipgrade.com, "CSV Answer Key Import File Requirements"). The header's first
 * field must start with "Key", so no BOM — the content is ASCII anyway. Key version "A"
 * is the primary key; a blank response is allowed. Point value is the question's marks,
 * else ZipGrade's default of 1. A bubble sheet numbers once, so a paper whose numbering
 * restarts per section is keyed 1–N in paper order.
 */
export function zipGradeCsv(rows: KeyRow[]): { text: string; warnings: string[] } {
  const sequential = hasRepeats(rows);
  const lines: Array<Array<string | number>> = [['Key Letter', 'Question Number', 'Response/Mapping', 'Point Value']];
  rows.forEach((row, index) => {
    const points = row.marks !== undefined && row.marks > 0 ? row.marks : 1;
    lines.push(['A', sequential ? index + 1 : row.number, row.letter ?? '', points]);
  });
  const warnings = unkeyedWarning(
    rows.map((row) => ({ number: row.number, keyed: row.letter !== undefined })),
    'its response is left blank',
  );
  if (sequential) {
    warnings.push(`Numbering restarts across sections; the key numbers them 1–${rows.length} in paper order.`);
  }
  return { text: toCsv(lines), warnings };
}

/**
 * The plain key, for Excel or any scanner without its own format (Gradescope keys are
 * typed into its own page, not imported): `Question, Answer`, an unkeyed question
 * blank. A `Section` column leads when printed numbers repeat. BOM so Excel reads
 * the 中文 section headings as UTF-8.
 */
export function keyCsv(rows: KeyRow[], language: LanguageMode): { text: string; warnings: string[] } {
  const sectioned = hasRepeats(rows);
  const header = sectioned ? ['Section', 'Question', 'Answer'] : ['Question', 'Answer'];
  const lines: Array<Array<string | number>> = [header];
  for (const row of rows) {
    const cells: Array<string | number> = [row.number, row.letter ?? ''];
    lines.push(sectioned ? [row.section ? textOf(row.section, language) : '', ...cells] : cells);
  }
  const warnings = unkeyedWarning(
    rows.map((row) => ({ number: row.number, keyed: row.letter !== undefined })),
    'its answer is left blank',
  );
  return { text: toCsv(lines, { bom: true }), warnings };
}

// ─── Quiz tools ────────────────────────────────────────────────────────────────

/** One side, or both joined with " / "; whitespace (and Shift+Enter breaks) collapsed. */
export function textOf(text: BiText, language: LanguageMode): string {
  const side = (lang: 'en' | 'zh') => plain(text[lang]).replace(/\s+/g, ' ').trim();
  if (language !== 'bilingual') return side(language);
  return [side('en'), side('zh')].filter(Boolean).join(' / ');
}

/** Paragraph text, sources read through; `figure` when a table or picture had to be left out. */
function blocksText(blocks: ContentBlock[], language: LanguageMode): { text: string; figure: boolean } {
  const parts: string[] = [];
  let figure = false;
  const walk = (list: ContentBlock[]) => {
    for (const block of list) {
      if (block.kind === 'paragraph') parts.push(textOf(block.text, language));
      else if (block.kind === 'source') {
        if (block.label) parts.push(textOf(block.label, language));
        walk(block.blocks);
      } else figure = true;
    }
  };
  walk(blocks);
  return { text: parts.filter(Boolean).join(' '), figure };
}

export interface QuizQuestion {
  number: number;
  question: string;
  answers: string[];
  /** 1-based, as the tools count; absent = no key set. */
  correct?: number;
  /** A table, picture or option figure could not travel. */
  figure: boolean;
}

/** Every lettered-choice question as quiz text, in paper order. */
export function quizQuestions(worksheet: Worksheet, language: LanguageMode): QuizQuestion[] {
  const numbering = computeNumbering(worksheet);
  const out: QuizQuestion[] = [];
  for (const { question, number } of numbering.questions) {
    const item: QuizItem | undefined = requireQuestionType(question).quizItem?.(question);
    if (!item) continue;
    const stem = blocksText(item.stem, language);
    const statements = item.statements
      .map((statement, index) => `${statementLabel(index)} ${textOf(statement, language)}`);
    out.push({
      number,
      question: [stem.text, ...statements].filter(Boolean).join(' '),
      answers: item.options.map((option) => textOf(option.text, language)),
      ...(item.answerIndex !== undefined ? { correct: item.answerIndex + 1 } : {}),
      figure: stem.figure || item.options.some((option) => option.figure),
    });
  }
  return out;
}

/** Both tools take two to four answers. */
const QUIZ_MAX_ANSWERS = 4;
/** Seconds per question: a stem to read, not a flash card. Both tools accept it. */
export const QUIZ_TIME_LIMIT = 30;

export const KAHOOT_LIMITS = { question: 120, answer: 75 } as const;

/** Characters as a person counts them: a 中文 glyph or an emoji is one. */
const length = (text: string) => [...text].length;

function quizWarnings(
  questions: QuizQuestion[],
  tool: string,
  limits?: { question: number; answer: number },
): { kept: QuizQuestion[]; warnings: string[] } {
  const warnings: string[] = [];
  const tooMany = questions.filter((q) => q.answers.length > QUIZ_MAX_ANSWERS);
  const kept = questions.filter((q) => q.answers.length <= QUIZ_MAX_ANSWERS);
  if (tooMany.length > 0) {
    warnings.push(`${numberList(tooMany.map((q) => q.number))}: more than ${QUIZ_MAX_ANSWERS} options — left out; ${tool} takes ${QUIZ_MAX_ANSWERS}.`);
  }
  warnings.push(...unkeyedWarning(
    kept.map((q) => ({ number: q.number, keyed: q.correct !== undefined })),
    `${tool} needs a correct answer`,
  ));
  const figures = kept.filter((q) => q.figure).map((q) => q.number);
  if (figures.length > 0) {
    warnings.push(`${numberList(figures)}: a table or figure is left out — ${tool} gets the text only.`);
  }
  if (limits) {
    for (const q of kept) {
      if (length(q.question) > limits.question) {
        warnings.push(`Q${q.number}: question is ${length(q.question)} characters; ${tool} allows ${limits.question}.`);
      }
      q.answers.forEach((answer, index) => {
        if (length(answer) > limits.answer) {
          warnings.push(
            `Q${q.number}: option ${String.fromCharCode(65 + index)} is ${length(answer)} characters; ${tool} allows ${limits.answer}.`,
          );
        }
      });
    }
  }
  return { kept, warnings };
}

/**
 * Kahoot's spreadsheet template (Kahoot! Help Centre, "import questions from a
 * spreadsheet"): headers on row 8 from column B, one question per row from row 9, the
 * question number in column A. `.xlsx` only — Kahoot has no CSV import. Header wording
 * follows the current template's 120/75 limits.
 */
export function kahootRows(questions: QuizQuestion[]): { rows: Array<Array<string | number>>; warnings: string[] } {
  const { kept, warnings } = quizWarnings(questions, 'Kahoot', KAHOOT_LIMITS);
  const rows: Array<Array<string | number>> = Array.from({ length: 7 }, () => []);
  rows.push([
    '',
    `Question - max ${KAHOOT_LIMITS.question} characters`,
    ...[1, 2, 3, 4].map((n) => `Answer ${n} - max ${KAHOOT_LIMITS.answer} characters`),
    'Time limit (sec) – 5, 10, 20, 30, 60, 90, 120, or 240 secs',
    'Correct answer(s) - choose at least one',
  ]);
  kept.forEach((q, index) => {
    rows.push([index + 1, q.question, ...padAnswers(q.answers), QUIZ_TIME_LIMIT, q.correct ?? '']);
  });
  return { rows, warnings };
}

/**
 * Blooket's CSV template: a title row of eight fields (Blooket sniffs the delimiter
 * from it), the header row, then one question per row. CRLF and no BOM, as the
 * template ships — its title row is what the importer reads first.
 */
export function blooketCsv(questions: QuizQuestion[]): { text: string; warnings: string[] } {
  const { kept, warnings } = quizWarnings(questions, 'Blooket');
  const rows: Array<Array<string | number>> = [
    ['Blooket Import Template', '', '', '', '', '', '', ''],
    [
      'Question #',
      'Question Text',
      'Answer 1',
      'Answer 2',
      'Answer 3 (Optional)',
      'Answer 4 (Optional)',
      'Time Limit (sec) (Max: 300 seconds)',
      'Correct Answer(s) (Only include Answer #)',
    ],
  ];
  kept.forEach((q, index) => {
    rows.push([index + 1, q.question, ...padAnswers(q.answers), QUIZ_TIME_LIMIT, q.correct ?? '']);
  });
  return { text: toCsv(rows), warnings };
}

function padAnswers(answers: string[]): string[] {
  return Array.from({ length: QUIZ_MAX_ANSWERS }, (_, index) => answers[index] ?? '');
}

// ─── The one entry point ───────────────────────────────────────────────────────

export const APP_FORMAT_EXTENSION: Record<AppFormat, 'csv' | 'xlsx'> = {
  zipgrade: 'csv',
  keyCsv: 'csv',
  kahoot: 'xlsx',
  blooket: 'csv',
};

const FILE_TAG: Record<AppFormat, string> = {
  zipgrade: 'ZipGrade key',
  keyCsv: 'Answer key',
  kahoot: 'Kahoot',
  blooket: 'Blooket',
};

/** `<name> (<ZipGrade key|Answer key|Kahoot|Blooket>).<csv|xlsx>`. */
export function appFileName(worksheet: Worksheet, format: AppFormat): string {
  return `${fileTitle(worksheet)} (${FILE_TAG[format]}).${APP_FORMAT_EXTENSION[format]}`;
}

/** Build one format's file content and what the teacher should know before importing it. */
export function buildAppExport(worksheet: Worksheet, format: AppFormat, language: LanguageMode): AppExport {
  const fileName = appFileName(worksheet, format);
  if (format === 'zipgrade' || format === 'keyCsv') {
    const rows = answerKeyRows(worksheet);
    const { text, warnings } = format === 'zipgrade' ? zipGradeCsv(rows) : keyCsv(rows, language);
    return { fileName, data: { kind: 'csv', text }, warnings, empty: rows.length === 0 };
  }
  const questions = quizQuestions(worksheet, language);
  if (format === 'kahoot') {
    const { rows, warnings } = kahootRows(questions);
    return { fileName, data: { kind: 'xlsx', rows }, warnings, empty: questions.length === 0 };
  }
  const { text, warnings } = blooketCsv(questions);
  return { fileName, data: { kind: 'csv', text }, warnings, empty: questions.length === 0 };
}
