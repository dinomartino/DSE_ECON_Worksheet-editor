import { resolveFlow, type FlowDoc } from './flow';
import type { Question, QuestionPart, StructuredQuestion, Worksheet } from './types';

/** A part's marks: its own value, or the sum of its sub-parts (§3.5). */
export function partMarks(part: QuestionPart): number {
  if (part.subParts && part.subParts.length > 0) {
    return part.subParts.reduce((sum, sub) => sum + (sub.marks || 0), 0);
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
    return structured.parts.reduce((sum, part) => sum + partMarks(part), 0);
  }
  return question.marks || 0;
}

/**
 * Marks for the run of questions a `section` element introduces (§3.5).
 *
 * A section owns no questions, so "its" marks are the ones between its own marker and
 * the next — which is exactly what the heading claims on the page. This is what a
 * `partHeader`'s derived "(19 marks)" suffix totals, so it stays correct when a question
 * inside the run is added, removed or re-marked.
 *
 * With no `sectionId`, the questions *before* the first section marker are totalled;
 * that is the whole document when it has no sections at all.
 */
export function sectionMarks(doc: FlowDoc, sectionId?: string): number {
  let inScope = sectionId === undefined;
  let total = 0;

  for (const item of resolveFlow(doc)) {
    if (item.type === 'layout') {
      if (item.element.kind !== 'section') continue;
      // Entering the named section starts the count; the next marker ends it.
      if (inScope) break;
      inScope = item.element.id === sectionId;
      continue;
    }
    if (inScope) total += questionMarks(item.question);
  }

  return total;
}

export function worksheetMarks(worksheet: Worksheet): number {
  return worksheet.questions.reduce((sum, q) => sum + questionMarks(q), 0);
}
