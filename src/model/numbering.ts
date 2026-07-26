import type { Question, Worksheet } from './types';

/**
 * Derived numbering (§4). Numbers are never stored in the document; this module is
 * the single source of truth for both the preview and the exporters, so the two can
 * never disagree.
 */

export interface NumberedQuestion {
  question: Question;
  sectionIndex: number;
  /** Index of the question within its section. */
  indexInSection: number;
  /** Display number, honouring per-section restart (1-based). */
  number: number;
}

export interface NumberingPlan {
  questions: NumberedQuestion[];
  byQuestionId: Map<string, NumberedQuestion>;
}

/**
 * Walk the worksheet and assign question numbers. Numbering runs continuously
 * across sections unless a section sets `restartNumbering`.
 */
export function computeNumbering(worksheet: Worksheet): NumberingPlan {
  const questions: NumberedQuestion[] = [];
  let counter = 0;

  worksheet.sections.forEach((section, sectionIndex) => {
    if (section.restartNumbering) counter = 0;
    section.questions.forEach((question, indexInSection) => {
      counter += 1;
      questions.push({ question, sectionIndex, indexInSection, number: counter });
    });
  });

  const byQuestionId = new Map(questions.map((entry) => [entry.question.id, entry]));
  return { questions, byQuestionId };
}

const ROMAN: Array<[number, string]> = [
  [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
  [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
  [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
];

/** 1 -> "i", 2 -> "ii", 4 -> "iv" (sub-part labels). */
export function toLowerRoman(value: number): string {
  let remaining = value;
  let out = '';
  for (const [amount, numeral] of ROMAN) {
    while (remaining >= amount) {
      out += numeral;
      remaining -= amount;
    }
  }
  return out;
}

/** 0 -> "a", 25 -> "z", 26 -> "aa" (part labels, 0-based index). */
export function toLowerLetter(index: number): string {
  let out = '';
  let n = index;
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** 0 -> "A" (MCQ option labels, 0-based index). */
export function toUpperLetter(index: number): string {
  return toLowerLetter(index).toUpperCase();
}

export const partLabel = (index: number) => `(${toLowerLetter(index)})`;
export const subPartLabel = (index: number) => `(${toLowerRoman(index + 1)})`;
export const statementLabel = (index: number) => `(${index + 1})`;
export const optionLabel = (index: number) => `${toUpperLetter(index)}.`;
