import { describe, expect, it } from 'vitest';
import { rowsOf } from './indexer';
import { slotsMatching } from './slotMatch';
import { choiceQuestion, docWith, partedQuestion } from './testKit';

describe('slotsMatching: which part tests it', () => {
  const question = partedQuestion([
    { tags: ['C.ped', 'C.ped::Calculate PED'] },
    { tags: ['C.intervention'], subs: [undefined, ['D.structure']] },
  ]);
  const [lq] = rowsOf(docWith([question]));

  it('names the leaves whose topics match, a coarse topic taking its sub-topics', () => {
    expect(slotsMatching(lq, { topic: 'C.ped' }).map((slot) => slot.label)).toEqual(['(a)']);
    expect(slotsMatching(lq, { topic: 'C.intervention' }).map((slot) => slot.label)).toEqual(['(b)(i)']);
    expect(slotsMatching(lq, { topic: 'C' }).map((slot) => slot.label)).toEqual(['(a)', '(b)(i)']);
    expect(slotsMatching(lq, { topic: 'D' }).map((slot) => slot.label)).toEqual(['(b)(ii)']);
  });

  it('matches a 題型 by its type and name, ignoring case', () => {
    const pattern = { topic: 'C.ped', typeId: lq.typeId, name: 'calculate ped' };
    expect(slotsMatching(lq, { pattern }).map((slot) => slot.label)).toEqual(['(a)']);
    expect(slotsMatching(lq, { pattern: { ...pattern, typeId: 'other' } })).toEqual([]);
  });

  it('says nothing when every part matches, none does, or the question is tagged as a whole', () => {
    const [every] = rowsOf(docWith([partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.ped'] }])]));
    expect(slotsMatching(every, { topic: 'C' })).toEqual([]);
    expect(slotsMatching(lq, { topic: 'J' })).toEqual([]);
    const [mcq] = rowsOf(docWith([choiceQuestion('Stem', '', ['C.ped'])]));
    expect(slotsMatching(mcq, { topic: 'C.ped' })).toEqual([]);
  });
});
