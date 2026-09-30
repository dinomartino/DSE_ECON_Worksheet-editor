import { describe, expect, it } from 'vitest';
import { partedQuestion } from '@/library/testKit';
import { editTargetKey } from '@/model/edits';
import { questionTagSlots, tagStateOf } from '@/model/tagSlots';
import { onlyTopic } from './TopicRow';
import { outlineTagLine, partsDiffer, partTopicLines, topicMode, topicsWithPatterns, untaggedParts } from './partTopicView';

describe('which list the Topic row edits', () => {
  const question = partedQuestion([{ subs: [undefined, undefined] }, {}]);
  const slots = questionTagSlots(question);
  const [a, b] = question.parts;
  const ii = a.subParts![1];

  it('is the whole question with nothing on the page naming a part', () => {
    expect(topicMode(slots, undefined)).toEqual({ kind: 'question' });
    expect(topicMode(slots, editTargetKey({ kind: 'blockText', blockId: question.blocks[0].id }))).toEqual({ kind: 'question' });
  });

  it('is the part, or the sub-part, the page’s click is in (the finest wins)', () => {
    expect(topicMode(slots, editTargetKey({ kind: 'blockText', blockId: b.blocks[0].id }))).toEqual({ kind: 'part', key: b.id });
    expect(topicMode(slots, editTargetKey({ kind: 'partAnswer', questionId: question.id, partId: a.id }))).toEqual({ kind: 'part', key: a.id });
    expect(topicMode(slots, editTargetKey({ kind: 'blockText', blockId: ii.blocks[0].id }))).toEqual({ kind: 'subPart', key: ii.id, parent: a.id });
  });

  it('follows a part picked in the row, or the whole question, over the page', () => {
    const inB = editTargetKey({ kind: 'blockText', blockId: b.blocks[0].id });
    expect(topicMode(slots, inB, 'question')).toEqual({ kind: 'question' });
    expect(topicMode(slots, inB, { key: ii.id })).toEqual({ kind: 'subPart', key: ii.id, parent: a.id });
    // A part since deleted: the whole question, never a dead part.
    expect(topicMode(slots, inB, { key: 'gone' })).toEqual({ kind: 'question' });
  });
});

describe('the whole-question view', () => {
  it('lists every part with what it tests, and a sub-part only when it has its own', () => {
    const question = partedQuestion([{ tags: ['C.law-of-demand'], subs: [undefined, ['C.ped']] }, { tags: ['E.efficiency'] }, {}]);
    const state = tagStateOf(question);
    expect(partTopicLines(state).map(({ label, fullLabel, depth, tags, from }) => ({ label, fullLabel, depth, tags, from }))).toEqual([
      { label: '(a)', fullLabel: '(a)', depth: 0, tags: ['C.law-of-demand'], from: 'own' },
      { label: '(ii)', fullLabel: '(a)(ii)', depth: 1, tags: ['C.ped'], from: 'own' },
      { label: '(b)', fullLabel: '(b)', depth: 0, tags: ['E.efficiency'], from: 'own' },
      { label: '(c)', fullLabel: '(c)', depth: 0, tags: [], from: 'none' },
    ]);
    expect(untaggedParts(state)).toEqual(['(c)']);
    expect(partsDiffer(state)).toBe(true);
  });

  it('shows older whole-question topics on every part, as from the whole question', () => {
    const state = tagStateOf(partedQuestion([{}, {}], ['C.ped', 'mock 2025']));
    expect(partTopicLines(state).map((line) => [line.label, line.tags, line.from])).toEqual([
      ['(a)', ['C.ped'], 'question'],
      ['(b)', ['C.ped'], 'question'],
    ]);
    expect(untaggedParts(state)).toEqual([]);
    expect(partsDiffer(state)).toBe(false);
  });

  it('pairs each topic with its 題型', () => {
    expect(topicsWithPatterns(['C.ped', 'E.efficiency', 'C.ped::Price ceiling'])).toEqual([
      { topic: 'C.ped', pattern: 'Price ceiling' },
      { topic: 'E.efficiency' },
    ]);
  });
});

describe('the Outline’s tag line', () => {
  it('reads by part, with labels, when the parts differ; the tooltip names every part', () => {
    const line = outlineTagLine(tagStateOf(partedQuestion([{ tags: ['C.law-of-demand'] }, { tags: ['E.efficiency'] }, {}], ['mock'])));
    expect(line).toEqual({
      text: '(a) Law of demand (b) Efficiency mock',
      title: '(a) Law of demand\n(b) Efficiency\n(c) No topic yet\nTags: mock',
      byPart: true,
    });
  });

  it('reads as the names alone when every part tests the same', () => {
    const line = outlineTagLine(tagStateOf(partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.ped'] }])));
    expect(line?.text).toBe('Price elasticity of demand');
    expect(line?.byPart).toBe(false);
  });

  it('is nothing for a question with no topic and no tag', () => {
    expect(outlineTagLine(tagStateOf(partedQuestion([{}, {}])))).toBeUndefined();
  });
});

describe('Enter in a picker that takes topics only', () => {
  it('takes the one topic the text names, and nothing when it names several or none', () => {
    expect(onlyTopic('C.ped')).toBe('C.ped');
    expect(onlyTopic('Law of demand')).toBe('C.law-of-demand');
    expect(onlyTopic('demand')).toBeUndefined();
    expect(onlyTopic('mock 2025')).toBeUndefined();
    expect(onlyTopic('  ')).toBeUndefined();
  });
});
