import { describe, expect, it } from 'vitest';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { row } from './testKit';
import { listPatterns, sortBuckets, sortIntoEdit, sortProgress, sortSections, topicsToSort, unsortEdit } from './patterns';

const MCQ = createMcqQuestion().type;
const LQ = createStructuredQuestion().type;

// C: four PED questions (one sorted, one with two copies), two intervention; D: one; a coarse-only one.
const rows = [
  row({ docId: 'a', rootId: 'q1', typeId: MCQ, marks: 1, tags: ['C.ped', 'C.ped::Calculate PED'] }),
  row({ docId: 'a', rootId: 'q2', typeId: LQ, marks: 6, tags: ['C.ped'], excerpt: { en: 'Explain', zh: '' } }),
  row({ docId: 'b', rootId: 'q2', typeId: LQ, marks: 6, tags: ['C.ped'], excerpt: { en: 'Explain', zh: '' } }),
  row({ docId: 'a', rootId: 'q3', typeId: MCQ, marks: 1, tags: ['C.ped'], excerpt: { en: 'B stem', zh: '' } }),
  row({ docId: 'a', rootId: 'q4', typeId: MCQ, marks: 1, tags: ['C.ped', 'C.intervention'], excerpt: { en: 'A stem', zh: '' } }),
  row({ docId: 'a', rootId: 'q5', typeId: MCQ, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q6', typeId: MCQ, tags: ['D.structure', 'D.structure::Features'] }),
  row({ docId: 'a', rootId: 'q7', typeId: MCQ, tags: ['E'] }),
];

describe('sorting questions into 題型', () => {
  it('counts each question once: sorted when every sub-topic it carries has a 題型', () => {
    const progress = sortProgress(rows);
    expect(progress.questions).toBe(6);
    expect(progress.sorted).toBe(2);
    expect(progress.topics).toEqual([
      { topic: 'C', questions: 5, notSorted: 4 },
      { topic: 'D', questions: 1, notSorted: 0 },
    ]);
    expect(topicsToSort(progress).map((entry) => entry.topic)).toEqual(['C']);
  });

  it('lays a topic out per sub-topic, one card per question, MCQ first, then marks and text', () => {
    const sections = sortSections(rows, 'C');
    expect(sections.map((section) => [section.topic, section.sorted, section.notSorted.map((r) => r.rootId)])).toEqual([
      ['C.ped', 1, ['q4', 'q3', 'q2']],
      ['C.intervention', 0, ['q5', 'q4']],
    ]);
    expect(sortSections(rows, 'Z')).toEqual([]);
  });

  it('a name listed under MCQ and LQ is one bucket', () => {
    const items = listPatterns(rows, {
      patterns: [
        { topic: 'C.ped', typeId: LQ, name: 'calculate ped' },
        { topic: 'C.ped', typeId: LQ, name: 'Explain TR' },
      ],
    });
    expect(sortBuckets(items, 'C.ped')).toEqual([
      { name: 'Calculate PED', typeIds: [MCQ, LQ], count: 1 },
      { name: 'Explain TR', typeIds: [LQ], count: 0 },
    ]);
  });

  it('sets the 題型 only on lists that hold the sub-topic, and takes it back', () => {
    expect(sortIntoEdit('C.ped', 'Calculate PED')(['C', 'C.ped'])).toEqual(['C', 'C.ped', 'C.ped::Calculate PED']);
    expect(sortIntoEdit('C.ped', 'Calculate PED')(['D.structure'])).toEqual(['D.structure']);
    expect(unsortEdit('C.ped')(['C.ped', 'C.ped::Calculate PED', 'x'])).toEqual(['C.ped', 'x']);
  });
});
