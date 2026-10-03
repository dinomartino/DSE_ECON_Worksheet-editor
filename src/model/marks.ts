import { resolveFlow, type FlowDoc } from './flow';
import type { LayoutElement, Question, QuestionPart, StructuredQuestion, Worksheet } from './types';

type SectionElement = Extract<LayoutElement, { kind: 'section' }>;

/**
 * A part's marks: its own value, or the sum of its sub-parts (§3.5).
 *
 * Sub-parts win when any of them is separately marked, so re-marking a sub-part still
 * moves the question total without anyone maintaining a second copy of the sum.
 *
 * When **no** sub-part carries marks, the part's own value is the total. That is the
 * shared-label shape real papers use — DSE 2019 P2 Q13(b) prints one "(5 marks)" for
 * (i) and (ii) together — where the sub-parts genuinely have no individual value to add
 * up. Summing them anyway would report 0 marks for a part plainly worth 5, silently
 * understating the question, the section and the paper.
 */
export function partMarks(part: QuestionPart): number {
  const subParts = part.subParts ?? [];
  if (subParts.some((sub) => sub.marks !== undefined)) {
    return subParts.reduce((sum, sub) => sum + (sub.marks || 0), 0);
  }
  return part.marks || 0;
}

/**
 * Total marks for any question. Structured questions sum their parts; every other
 * type falls back to its flat `marks`, so new types need no change here (§9).
 */
export function questionMarks(question: Question): number {
  if (question.type === 'structured') {
    const structured = question as StructuredQuestion;
    // A question with no parts is marked as a whole — a booklet essay numbered "1."
    // with nothing to split. Summing an empty part list would report 0 for a question
    // plainly worth 8, the same understatement `partMarks` avoids for a shared label.
    if (structured.parts.length === 0) return structured.marks || 0;
    return structured.parts.reduce((sum, part) => sum + partMarks(part), 0);
  }
  return question.marks || 0;
}

/**
 * A section's "answer any n", when it leaves questions out; `undefined` = every question
 * counts. A count of all (or more) is no choice, so it is ignored like a malformed one.
 */
export function answerCountOf(element: SectionElement | undefined, questions: number): number | undefined {
  const n = element?.answerCount;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n < questions ? n : undefined;
}

/** What a run is worth when a candidate answers `count` of it: the best `count` values. */
export function countedTotal(values: number[], count?: number): number {
  const counted = count === undefined ? values : [...values].sort((a, b) => b - a).slice(0, count);
  return counted.reduce((sum, value) => sum + value, 0);
}

/** The questions between one section marker and the next (`sectionId` undefined: before the first). */
export interface SectionRun {
  sectionId?: string;
  element?: SectionElement;
  questions: Question[];
  /** `answerCountOf` for this run. */
  answerCount?: number;
}

/**
 * Every section's questions in flow order, one run per section id; the pre-section run
 * only when it holds a question. A section owns no questions: "its" questions are the
 * ones between its marker and the next, which is what its heading claims on the page.
 */
export function sectionRuns(doc: FlowDoc): SectionRun[] {
  const runs = new Map<string | undefined, SectionRun>();
  let current: SectionRun | undefined;
  for (const item of resolveFlow(doc)) {
    if (item.type === 'layout') {
      if (item.element.kind !== 'section') continue;
      const id = item.element.id;
      current = runs.get(id) ?? { sectionId: id, element: item.element, questions: [] };
      runs.set(id, current);
      continue;
    }
    if (!current) {
      current = { questions: [] };
      runs.set(undefined, current);
    }
    current.questions.push(item.question);
  }
  const list = [...runs.values()];
  for (const run of list) run.answerCount = answerCountOf(run.element, run.questions.length);
  return list;
}

const runMarks = (run: SectionRun): number =>
  countedTotal(run.questions.map(questionMarks), run.answerCount);

/**
 * Marks for the run of questions a `section` element introduces (§3.5): what a
 * `partHeader`'s derived "(19 marks)" suffix totals, so it stays correct when a question
 * inside the run is added, removed or re-marked. An "answer any n" section counts its
 * best n questions.
 *
 * With no `sectionId`, the questions *before* the first section marker are totalled;
 * that is the whole document when it has no sections at all.
 */
export function sectionMarks(doc: FlowDoc, sectionId?: string): number {
  const run = sectionRuns(doc).find((entry) => entry.sectionId === sectionId);
  return run ? runMarks(run) : 0;
}

/**
 * Every section's marks total in one walk, keyed by section id, with the pre-section run
 * under `undefined` exactly as `sectionMarks(doc)` reports it. A section holding no
 * questions reports 0 rather than absent.
 */
export function sectionMarksById(doc: FlowDoc): Map<string | undefined, number> {
  return new Map(sectionRuns(doc).map((run) => [run.sectionId, runMarks(run)]));
}

/** Whether any section leaves questions out ("answer any ONE"). */
export function hasOptionalSection(doc: FlowDoc): boolean {
  return (
    (doc.layout ?? []).some((element) => element.kind === 'section' && element.answerCount !== undefined) &&
    sectionRuns(doc).some((run) => run.answerCount !== undefined)
  );
}

/** The paper's marks: every question, but only the best n of an "answer any n" section. */
export function worksheetMarks(worksheet: Worksheet): number {
  if (hasOptionalSection(worksheet)) {
    return sectionRuns(worksheet).reduce((sum, run) => sum + runMarks(run), 0);
  }
  return worksheet.questions.reduce((sum, q) => sum + questionMarks(q), 0);
}
