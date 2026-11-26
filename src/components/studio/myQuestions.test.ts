import '@/registry';
import { describe, expect, it } from 'vitest';
import { fakeLocalStorage } from '@/library/bankTestKit';
import { groupRows } from '@/library/group';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partsQuestion } from '@/library/testKit';
import { createImageBlock, createParagraphBlock } from '@/model/factories';
import { bi } from '@/model/text';
import type { McqQuestion, Question, Worksheet } from '@/model/types';
import { groupTopics, OTHER_PART } from '@/pastpapers/groups';
import { examplePayload } from '@/questionStudio/brief';
import { inWhen, mineReference, mineSourceId, generalTopic, inTopic, myQuestionList, myTopicEntries, NO_TOPIC, noteRecent, NO_FILTER, parseMineId, readRecent, RECENT_KEY } from './myQuestions';

const NOW = Date.parse('2026-11-24T00:00:00Z');

function mcq(en: string, tags: string[], extra: Partial<McqQuestion> = {}): McqQuestion {
  return { ...(choiceQuestion(en, `${en}（中）`, tags) as McqQuestion), answerIndex: 2, ...extra };
}

function paper(id: string, title: string, satOn: string, questions: Question[], extra: Partial<Worksheet> = {}): Worksheet {
  return { ...docWith(questions, extra), id, title: bi(title, title), satOn, createdAt: satOn, updatedAt: satOn };
}

const elasticity = mcq('Price elasticity of demand for rice', ['C.ped']);
const scarcity = mcq('Which good is scarce?', ['A']);
const lq = partsQuestion('Explain the law of demand.');
const old = mcq('An old question about tariffs', ['F']);
// The same question copied into a second, newer paper: one entry, found by either title.
const copy: McqQuestion = { ...structuredClone(elasticity), id: 'copy-of-elasticity', lineage: { rootId: elasticity.id } };

const docs = [
  paper('p1', 'Mock 2026', '2026-11-01', [elasticity, scarcity, lq]),
  paper('p2', 'Uniform test', '2026-11-20', [copy]),
  paper('p3', 'Quiz 2024', '2024-03-01', [old]),
];
const rows = docs.flatMap((d) => rowsOf(d));
const groups = groupRows(rows);

describe('My questions list (k-0529)', () => {
  it('lists every multiple-choice question once, counts the rest, newest first', () => {
    const list = myQuestionList(groups, NO_FILTER, {}, NOW);
    expect(list.total).toBe(3);
    expect(list.otherTypes).toBe(1);
    expect(list.entries.map((e) => e.group.rootId)).toEqual([elasticity.id, scarcity.id, old.id]);
    // The copy shown is the newest use.
    expect(list.entries[0].row.docId).toBe('p2');
  });

  it('searches every copy and the papers’ titles', () => {
    expect(myQuestionList(groups, { ...NO_FILTER, words: 'mock' }, {}, NOW).entries.map((e) => e.group.rootId)).toEqual([elasticity.id, scarcity.id]);
    expect(myQuestionList(groups, { ...NO_FILTER, words: 'RICE elasticity' }, {}, NOW).entries.map((e) => e.group.rootId)).toEqual([elasticity.id]);
    expect(myQuestionList(groups, { ...NO_FILTER, words: 'nothing-like-this' }, {}, NOW).entries).toEqual([]);
  });

  it('filters by topic (a coarse code takes its sub-topics) and by date', () => {
    expect(myQuestionList(groups, { ...NO_FILTER, topic: 'C' }, {}, NOW).entries.map((e) => e.group.rootId)).toEqual([elasticity.id]);
    expect(myQuestionList(groups, { ...NO_FILTER, when: 'month' }, {}, NOW).entries.map((e) => e.group.rootId)).toEqual([elasticity.id, scarcity.id]);
    expect(myQuestionList(groups, { ...NO_FILTER, when: 'older' }, {}, NOW).entries.map((e) => e.group.rootId)).toEqual([old.id]);
    expect(inWhen('not a date', 'any', NOW)).toBe(true);
    expect(inWhen('not a date', 'year', NOW)).toBe(false);
  });

  it('puts recently used references first, newest first', () => {
    const recent = { [old.id]: NOW - 1000, [scarcity.id]: NOW - 10 };
    const list = myQuestionList(groups, NO_FILTER, recent, NOW);
    expect(list.entries.map((e) => e.group.rootId)).toEqual([scarcity.id, old.id, elasticity.id]);
    expect(list.entries[0].recentAt).toBe(NOW - 10);
  });

  const NAMES = { general: { en: 'General', zh: '一般' }, none: { en: 'No topic', zh: '未有課題' } };

  it('lists the MCQ topics with counts, grouped like the Past paper bank (k-0578), MC only', () => {
    const { topics, parts } = myTopicEntries(groups, NAMES);
    // C.ped is the MCQ topic Elasticity; 'A' and 'F' alone are "General" in their section.
    expect(topics.map((t) => [t.id, t.questions])).toEqual([
      [generalTopic('A'), 1],
      ['@mcq:elasticity', 1],
      [generalTopic('F'), 1],
    ]);
    expect(topics[1].title).toEqual({ en: 'Elasticity', zh: expect.any(String) });
    expect(groupTopics(topics)?.map((g) => [g.code, g.topics.length])).toEqual([['A', 1], ['C', 1], ['F', 1]]);
    expect(Object.fromEntries(parts)).toEqual({ A: 1, C: 1, F: 1 });
    // Each entry filters to exactly its questions; a section letter still takes everything in it.
    for (const t of topics) expect(myQuestionList(groups, { ...NO_FILTER, topic: t.id }, {}, NOW).entries).toHaveLength(1);
    expect(myQuestionList(groups, { ...NO_FILTER, topic: 'C' }, {}, NOW).entries).toHaveLength(1);
    // The teacher's MCQ topics' sections (k-0569): Circular Flow sits in F, as on DSEcon Mentor.
    const flow = groupRows(rowsOf(paper('cf', 'Flow', '2026-01-01', [mcq('Circular flow', ['A.circular-flow'])])));
    expect(myTopicEntries(flow, NAMES).topics.map((t) => t.id)).toEqual(['@mcq:circular-flow']);
    expect(groupTopics(myTopicEntries(flow, NAMES).topics)?.map((g) => g.code)).toEqual(['F']);
    expect(myQuestionList(flow, { ...NO_FILTER, topic: 'F' }, {}, NOW).entries).toHaveLength(1);
    expect(myQuestionList(flow, { ...NO_FILTER, topic: '@mcq:circular-flow' }, {}, NOW).entries).toHaveLength(1);
  });

  it('a question under two topics counts in each, its section once; General after the topics; untagged last', () => {
    const two = mcq('Tax and elasticity', ['C.ped', 'I.fiscal']);
    const both = mcq('Elasticity, and something in C', ['C.ped', 'C.intervention', '@mcq:quota']);
    const general = mcq('Somewhere in C', ['C']);
    const bare = mcq('No tags at all', []);
    const g = groupRows(rowsOf(paper('m', 'Mixed', '2026-11-01', [two, both, general, bare])));
    const { topics, parts } = myTopicEntries(g, NAMES);
    expect(topics.map((t) => [t.id, t.questions])).toEqual([
      ['@mcq:elasticity', 2],
      ['@mcq:quota', 1],
      [generalTopic('C'), 1],
      ['I.fiscal', 1], // several MCQ topics fit, none chosen: listed by its EDB name
      [NO_TOPIC, 1],
    ]);
    expect(parts.get('C')).toBe(3);
    expect(topics.at(-1)?.title).toEqual(NAMES.none);
    expect(groupTopics(topics)?.map((group) => group.code)).toEqual(['C', 'I', OTHER_PART]);
    expect(inTopic(general.tags, generalTopic('C'))).toBe(true);
    expect(inTopic(both.tags, generalTopic('C'))).toBe(false);
    expect(inTopic(bare.tags, NO_TOPIC)).toBe(true);
    expect(myQuestionList(g, { ...NO_FILTER, topic: NO_TOPIC }, {}, NOW).entries.map((e) => e.group.rootId)).toEqual([bare.id]);
    expect(myQuestionList(g, { ...NO_FILTER, topic: '@mcq:elasticity' }, {}, NOW).entries).toHaveLength(2);
  });

  it('stays quick on a large bank', () => {
    const many = Array.from({ length: 4000 }, (_, i) => paper(`d${i}`, `Paper ${i}`, '2026-01-01', [mcq(`Question ${i} on demand`, ['C.ped'])]));
    const big = groupRows(many.flatMap((d) => rowsOf(d)));
    const started = performance.now();
    const list = myQuestionList(big, { ...NO_FILTER, words: 'demand 39' }, {}, NOW);
    expect(list.entries.length).toBeGreaterThan(0);
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('a picked question of my own', () => {
  it('becomes the same reference a past paper does, with its explanation and passage', () => {
    const withAll = mcq('Refer to the table.', ['C.ped'], {
      explanation: bi('Demand is elastic here.', '這裏需求具彈性。'),
      blocks: [createParagraphBlock(bi('Refer to the table.', '參閱下表。')), createImageBlock('data:image/png;base64,AAAA', 10, 10)],
    });
    const doc = paper('p9', 'Mock 2026', '2026-11-01', [withAll]);
    const before = JSON.stringify(doc);
    const ref = mineReference(doc, withAll.id, 'Mock 2026 · Q1', 1)!;
    expect(ref.source.id).toBe(mineSourceId('p9', withAll.id));
    expect(ref.source.label).toBe('Mock 2026 · Q1');
    expect(ref.source.answerIndex).toBe(2);
    expect(ref.source.options).toHaveLength(4);
    expect(ref.source.explanation).toEqual({ en: 'Demand is elastic here.', zh: '這裏需求具彈性。' });
    expect(ref.source.hasFigure).toBe(true);
    expect(ref.source.figureBlocks?.length).toBe(1);
    expect(ref.keyPoint).toBe('C.ped');
    expect(ref.item.question.id).toBe(withAll.id);
    expect(ref.item.source.number).toBe(1);
    // The explanation reaches the AI with the example.
    expect(examplePayload(ref.source, ['en'])).toMatchObject({ key: 'C', explanation: { en: 'Demand is elastic here.' } });
    // Read only: the teacher's document is never touched, and the reference is a copy.
    (ref.item.question as McqQuestion).options[0].text = bi('changed', 'changed');
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('gives nothing for a question that is gone or is not MC', () => {
    const doc = paper('p9', 'Mock', '2026-11-01', [lq]);
    expect(mineReference(doc, lq.id, 'x')).toBeUndefined();
    expect(mineReference(doc, 'missing', 'x')).toBeUndefined();
  });

  it('reads its id back', () => {
    expect(parseMineId(mineSourceId('doc-1', 'q/2'))).toEqual({ docId: 'doc-1', questionId: 'q/2' });
    expect(parseMineId('DSE2019/P1/Q15')).toBeUndefined();
  });
});

describe('recently used', () => {
  it('is kept on this computer, newest first, capped, and survives bad data', () => {
    const store = fakeLocalStorage();
    expect(readRecent(store)).toEqual({});
    noteRecent('a', 1, store);
    noteRecent('b', 2, store);
    expect(readRecent(store)).toEqual({ a: 1, b: 2 });
    for (let i = 0; i < 100; i++) noteRecent(`r${i}`, 10 + i, store);
    const kept = readRecent(store);
    expect(Object.keys(kept)).toHaveLength(60);
    expect(kept.r99).toBe(109);
    expect(kept.a).toBeUndefined();
    store.setItem(RECENT_KEY, '{"x": "not a number", "y": 5}');
    expect(readRecent(store)).toEqual({ y: 5 });
    store.setItem(RECENT_KEY, 'not json');
    expect(readRecent(store)).toEqual({});
  });
});
