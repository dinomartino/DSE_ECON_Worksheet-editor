import { describe, expect, it } from 'vitest';
import { createDiagramBlock, createTableBlock } from '@/model/factories';
import { copyQuestion, freshIds } from '@/model/lineage';
import { bi } from '@/model/text';
import type { ContentBlock, McqQuestion } from '@/model/types';
import v1Corpus from '@/test/corpus/v1-published.json';
import { migrate } from '@/model/migrations';
import { richStructured } from '@/test/idFixture';
import golden from './rowsGolden.json';
import { contentKey } from './contentKey';
import { choiceQuestion, partedQuestion, partsQuestion } from './testKit';

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

  it('ignores part and sub-part topics and roots: a copy made now still matches its original', () => {
    const original = richStructured();
    const key = contentKey(original);
    const copy = copyQuestion(original, 'other-doc');
    expect(copy.parts[0].rootId).toBe(original.parts[0].id);
    expect(contentKey(copy)).toBe(key);
    const tagged = structuredClone(copy);
    tagged.parts[0].tags = ['C.ped', 'C.ped::Explain PED'];
    tagged.parts[0].subParts![0].tags = ['D'];
    tagged.parts[0].subParts![0].rootId = 'elsewhere';
    expect(contentKey(tagged)).toBe(key);
    const parted = partedQuestion([{ tags: ['C'] }, { subs: [['D']] }]);
    expect(contentKey(parted)).toBe(contentKey(partedQuestion([{}, { subs: [undefined] }])));
  });

  it('gives the frozen corpus and the golden rows the keys they always had', () => {
    // Pinned from the build before part fields existed: no copy regroups after this change.
    expect(migrate(structuredClone(v1Corpus)).questions.map(contentKey)).toEqual(['1qq8s3ssits', '1ce5rxabj44']);
    expect(golden.rows.slice(0, 2).map((row) => row.contentKey)).toEqual(['1q717cu0w3v', '2fbxcvxebx']);
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
