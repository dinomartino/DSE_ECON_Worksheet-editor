import { describe, expect, it } from 'vitest';
import v1Corpus from '@/test/corpus/v1-published.json';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { migrate } from '@/model/migrations';
import type { Question } from '@/model/types';
import { listQuestionTypes } from '@/registry';
import { IGNORED } from './contentKey';

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
  showTotalMarks: 'content',
};

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
