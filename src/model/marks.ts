import type { Question, QuestionPart, Section, StructuredQuestion, Worksheet } from './types';

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

export function sectionMarks(section: Section): number {
  return section.questions.reduce((sum, q) => sum + questionMarks(q), 0);
}

export function worksheetMarks(worksheet: Worksheet): number {
  return worksheet.sections.reduce((sum, s) => sum + sectionMarks(s), 0);
}
