import type { Question } from '@/model/types';
import { mcqType } from './mcq';
import { structuredType } from './structured';
import type { AnyQuestionTypeDefinition } from './types';

/**
 * The single registration point (§9). To add a question type: implement its
 * definition and add it to this array. Nothing else in numbering, marks totalling,
 * persistence or export orchestration changes.
 */
const DEFINITIONS: AnyQuestionTypeDefinition[] = [mcqType, structuredType];

const BY_ID = new Map<string, AnyQuestionTypeDefinition>(
  DEFINITIONS.map((definition) => [definition.id, definition]),
);

export function listQuestionTypes(): AnyQuestionTypeDefinition[] {
  return DEFINITIONS;
}

export function getQuestionType(id: string): AnyQuestionTypeDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Look up a question's type definition. Throws on an unknown type so a document
 * from a newer build fails loudly at render time rather than silently dropping a
 * question from an exported paper.
 */
export function requireQuestionType(question: Question): AnyQuestionTypeDefinition {
  const definition = BY_ID.get(question.type);
  if (!definition) throw new Error(`Unknown question type: ${question.type}`);
  return definition;
}

export type { QuestionTypeDefinition, EditorPanelProps } from './types';
