import { describe, expect, it } from 'vitest';
import { createDiagramBlock, createTableBlock } from '@/model/factories';
import { copyQuestion, freshIds } from '@/model/lineage';
import { bi } from '@/model/text';
import type { ContentBlock, McqQuestion } from '@/model/types';
import { contentKey } from './contentKey';
import { choiceQuestion, partsQuestion } from './testKit';

describe('contentKey', () => {
  it('is equal for fresh-id copies at every level', () => {
    const question = choiceQuestion('Which is a free good?', '以下哪項是免費物品？');
    question.blocks.push(createTableBlock(2, 2) as ContentBlock, createDiagramBlock() as ContentBlock);
    expect(contentKey(freshIds(question))).toBe(contentKey(question));
    expect(contentKey(copyQuestion(question, 'other-doc'))).toBe(contentKey(question));
    const structured = partsQuestion('A city plans a garden.');
    expect(contentKey(freshIds(structured))).toBe(contentKey(structured));
  });

  it('ignores lineage, tags, the gap above and key order', () => {
    const question = choiceQuestion('Stem');
    const key = contentKey(question);
    expect(contentKey({ ...question, tags: ['C.ped'], tagsAt: '2026-09-30T00:00:00.000Z', gapBefore: 3 })).toBe(key);
    const reordered = Object.fromEntries(Object.entries(question).reverse()) as typeof question;
    expect(contentKey(reordered)).toBe(key);
  });

  it('changes on any text or answer edit', () => {
    const question = choiceQuestion('Stem', '題幹') as McqQuestion;
    const key = contentKey(question);
    expect(contentKey({ ...question, blocks: [{ ...question.blocks[0], text: bi('Stem.', '題幹') } as ContentBlock] })).not.toBe(key);
    expect(contentKey({ ...question, blocks: [{ ...question.blocks[0], text: bi('Stem', '題') } as ContentBlock] })).not.toBe(key);
    const options = question.options.map((o, i) => (i === 2 ? { ...o, text: bi('Changed', '改') } : o));
    expect(contentKey({ ...question, options })).not.toBe(key);
    expect(contentKey({ ...question, answerIndex: 2 })).not.toBe(key);
    expect(contentKey({ ...question, marks: 2 })).not.toBe(key);
  });

  it('never mutates the question', () => {
    const question = choiceQuestion('Stem', '', ['C']);
    const before = structuredClone(question);
    contentKey(question);
    expect(question).toEqual(before);
  });
});
