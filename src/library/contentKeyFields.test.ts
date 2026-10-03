import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { migrate } from '@/model/migrations';
import type { Question, QuestionPart, QuestionSubPart } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { IGNORED, IGNORED_PART } from './contentKey';
import { partedQuestion } from './testKit';

/**
 * Every field a question can carry, classified for `contentKey`:
 *  - `content`: what the question says or how it prints; an edit makes a new version.
 *  - `metadata`: where a copy sits, where it came from, how it is filed; never a version.
 *
 * A new question field must be added here, or typecheck fails (the record must name every
 * key of every question type) and so does the runtime check below. Deciding here is the
 * point: a metadata field left out of `IGNORED` splits identical copies into false
 * "versions"; a content field put in it merges real edits.
 */
type AnyQuestionKey = Question extends infer Q ? (Q extends unknown ? keyof Q : never) : never;

const QUESTION_FIELDS: Record<AnyQuestionKey, 'content' | 'metadata'> = {
  id: 'content', // blanked by contentKey with every other id, so copies compare equal
  type: 'content',
  blocks: 'content',
  marks: 'content',
  gapBefore: 'metadata',
  lineage: 'metadata',
  tags: 'metadata',
  tagsAt: 'metadata',
  statements: 'content',
  options: 'content',
  answerIndex: 'content',
  explanation: 'content',
  optionLayout: 'content',
  provenance: 'content',
  parts: 'content',
  answerSpace: 'content',
  answerGraph: 'content',
  answerDiagram: 'content',
  answer: 'content',
  scheme: 'content',
  showTotalMarks: 'content',
};

/** The same for every field of a part and a sub-part (`contentKey` drops `IGNORED_PART` on each). */
const PART_FIELDS: Record<keyof QuestionPart, 'content' | 'metadata'> = {
  id: 'content',
  blocksBefore: 'content',
  blocks: 'content',
  marks: 'content',
  subParts: 'content',
  answer: 'content',
  scheme: 'content',
  answerSpace: 'content',
  answerGraph: 'content',
  answerDiagram: 'content',
  tags: 'metadata',
  rootId: 'metadata',
};

const SUB_PART_FIELDS: Record<keyof QuestionSubPart, 'content' | 'metadata'> = {
  id: 'content',
  blocks: 'content',
  marks: 'content',
  answer: 'content',
  scheme: 'content',
  answerSpace: 'content',
  answerGraph: 'content',
  answerDiagram: 'content',
  tags: 'metadata',
  rootId: 'metadata',
};

const metadataOf = (fields: Record<string, 'content' | 'metadata'>) =>
  Object.entries(fields)
    .filter(([, kind]) => kind === 'metadata')
    .map(([key]) => key)
    .sort();

describe('every part and sub-part field is classified for contentKey', () => {
  it('ignores exactly the metadata fields, on parts and sub-parts alike', () => {
    expect([...IGNORED_PART].sort()).toEqual(metadataOf(PART_FIELDS));
    expect([...IGNORED_PART].sort()).toEqual(metadataOf(SUB_PART_FIELDS));
  });

  it('knows every key a real part or sub-part carries', () => {
    const questions: Question[] = [
      ...migrate(structuredClone(v1Corpus)).questions,
      ...buildAcceptanceWorksheet().questions,
      ...listQuestionTypes().map((type) => type.create() as Question),
      partedQuestion([{ tags: ['C'], subs: [['D']] }]),
    ];
    const parts = questions.flatMap((question) => (question as { parts?: QuestionPart[] }).parts ?? []);
    const subs = parts.flatMap((part) => part.subParts ?? []);
    expect(parts.length).toBeGreaterThan(0);
    expect(subs.length).toBeGreaterThan(0);
    const unknownParts = new Set(parts.flatMap((part) => Object.keys(part)).filter((key) => !(key in PART_FIELDS)));
    const unknownSubs = new Set(subs.flatMap((sub) => Object.keys(sub)).filter((key) => !(key in SUB_PART_FIELDS)));
    expect([...unknownParts], 'classify these in PART_FIELDS and keep IGNORED_PART in step').toEqual([]);
    expect([...unknownSubs], 'classify these in SUB_PART_FIELDS and keep IGNORED_PART in step').toEqual([]);
  });
});

describe('every question field is classified for contentKey', () => {
  it('ignores exactly the metadata fields', () => {
    const metadata = Object.entries(QUESTION_FIELDS)
      .filter(([, kind]) => kind === 'metadata')
      .map(([key]) => key)
      .sort();
    expect([...IGNORED].sort()).toEqual(metadata);
  });

  it('knows every key a real question carries', () => {
    const questions: Question[] = [
      ...migrate(structuredClone(v1Corpus)).questions,
      ...buildAcceptanceWorksheet().questions,
      ...listQuestionTypes().map((type) => type.create() as Question),
    ];
    const unknown = new Set(questions.flatMap((question) => Object.keys(question)).filter((key) => !(key in QUESTION_FIELDS)));
    expect([...unknown], 'classify these in QUESTION_FIELDS (content or metadata) and keep IGNORED in step').toEqual([]);
  });
});
