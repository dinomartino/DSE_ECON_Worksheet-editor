import { resolveFlow } from './flow';
import type { Question, Worksheet } from './types';

/**
 * Derived numbering (§4). Numbers are never stored in the document; this module is
 * the single source of truth for both the preview and the exporters, so the two can
 * never disagree.
 */

export interface NumberedQuestion {
  question: Question;
  /**
   * The `section` element this question falls under, or undefined before the first one.
   *
   * A question is not *contained* by a section — it simply follows a marker in the flow
   * — so this is derived by the same walk that assigns the number, and is what the
   * exporter keys its Word list stream on.
   */
  sectionId?: string;
  /** Display number, honouring per-section restart (1-based). */
  number: number;
}

export interface NumberingPlan {
  questions: NumberedQuestion[];
  byQuestionId: Map<string, NumberedQuestion>;
}

/**
 * Walk the document flow and assign question numbers.
 *
 * Numbering runs continuously until a `section` element that sets `restartNumbering`,
 * which resets the counter from that point on. Walking the *flow* rather than a nested
 * section list is what makes the restart happen where the heading actually sits: drag a
 * section marker above question 3 and the questions after it renumber, with no container
 * to move anything between.
 */
export function computeNumbering(worksheet: Worksheet): NumberingPlan {
  const questions: NumberedQuestion[] = [];
  let counter = 0;
  let sectionId: string | undefined;

  for (const item of resolveFlow(worksheet)) {
    if (item.type === 'layout') {
      if (item.element.kind !== 'section') continue;
      sectionId = item.element.id;
      if (item.element.restartNumbering) counter = 0;
      continue;
    }
    counter += 1;
    questions.push({ question: item.question, sectionId, number: counter });
  }

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
