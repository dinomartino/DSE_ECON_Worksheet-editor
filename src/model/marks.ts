import { resolveFlow, type FlowDoc } from './flow';
import type { Question, QuestionPart, StructuredQuestion, Worksheet } from './types';

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

/**
 * Every section's marks total, in one walk.
 *
 * `sectionMarks` answers for one section and re-resolves the flow to do it, so asking it
 * per heading is O(sections x document) — a paper with a dozen part headers walked the
 * whole flow a dozen times on every render. This computes the same answers in a single
 * pass, keyed by section id, with the pre-section run under `undefined` exactly as
 * `sectionMarks(doc)` reports it.
 *
 * `sectionMarks` stays the answer for a single section, since a caller that wants one
 * total should not have to build a map to read it.
 */
export function sectionMarksById(doc: FlowDoc): Map<string | undefined, number> {
  const totals = new Map<string | undefined, number>();
  let current: string | undefined;

  for (const item of resolveFlow(doc)) {
    if (item.type === 'layout') {
      if (item.element.kind !== 'section') continue;
      current = item.element.id;
      // Seeded so a section holding no questions still reports 0 rather than absent.
      if (!totals.has(current)) totals.set(current, 0);
      continue;
    }
    totals.set(current, (totals.get(current) ?? 0) + questionMarks(item.question));
  }

  return totals;
}

export function worksheetMarks(worksheet: Worksheet): number {
  return worksheet.questions.reduce((sum, q) => sum + questionMarks(q), 0);
}
