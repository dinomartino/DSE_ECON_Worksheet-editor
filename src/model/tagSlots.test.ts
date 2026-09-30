import { describe, expect, it } from 'vitest';
import { choiceQuestion, partedQuestion } from '@/library/testKit';
import { createParagraphBlock, createStructuredQuestion } from './factories';
import { editTargetKey } from './edits';
import {
  collapseTagState,
  derivedTags,
  effectiveSlotTags,
  matchSlots,
  normalizeTagState,
  questionTagSlots,
  sameShape,
  slotAtTarget,
  slotHighlightIds,
  slotRef,
  findSlot,
  stateFor,
  tagStateOf,
  withTagState,
  type TagState,
} from './tagSlots';
import type { StructuredQuestion } from './types';

const own = (state: TagState) => state.slots.map((slot) => slot.own);

describe('where a question carries topics', () => {
  it('has no slots for a multiple-choice question or a structured question without parts', () => {
    expect(questionTagSlots(choiceQuestion('Stem', '', ['C']))).toEqual([]);
    expect(questionTagSlots({ ...createStructuredQuestion(), parts: [] })).toEqual([]);
    expect(questionTagSlots({ ...createStructuredQuestion(), type: 'later-type' } as unknown as StructuredQuestion)).toEqual([]);
  });

  it('lists every part, then its sub-parts, in print order, keyed by root', () => {
    const question = partedQuestion([{ tags: ['C.ped'] }, { subs: [undefined, ['D.structure']] }]);
    question.parts[0].rootId = 'root-a';
    const slots = questionTagSlots(question);
    const [a, b] = question.parts;
    expect(slots.map(({ key, path, label, parent, leaf, own: list }) => ({ key, path, label, parent, leaf, own: list }))).toEqual([
      { key: 'root-a', path: '0', label: '(a)', parent: undefined, leaf: true, own: ['C.ped'] },
      { key: b.id, path: '1', label: '(b)', parent: undefined, leaf: false, own: undefined },
      { key: b.subParts![0].id, path: '1.0', label: '(b)(i)', parent: b.id, leaf: true, own: undefined },
      { key: b.subParts![1].id, path: '1.1', label: '(b)(ii)', parent: b.id, leaf: true, own: ['D.structure'] },
    ]);
    expect(slots[0].blockIds).toEqual([a.blocks[0].id]);
    expect(slots[0].answerIds).toEqual([a.id]);
  });

  it('keeps keys unique when a stored root repeats', () => {
    const question = partedQuestion([{}, {}]);
    question.parts[0].rootId = 'same';
    question.parts[1].rootId = 'same';
    expect(questionTagSlots(question).map((slot) => slot.key)).toEqual(['same', question.parts[1].id]);
  });
});

describe('the tag rules', () => {
  it('a sub-part’s own list replaces its part’s; the rest inherit', () => {
    const question = partedQuestion([{ tags: ['C.ped'], subs: [undefined, ['D.structure']] }, { tags: ['C.intervention'] }]);
    const effective = [...effectiveSlotTags(tagStateOf(question)).values()];
    expect(effective).toEqual([['C.ped'], ['C.ped'], ['D.structure'], ['C.intervention']]);
  });

  it('derives the question’s tags: every leaf’s topics in print order, then free tags; a list no leaf takes does not count', () => {
    const question = partedQuestion(
      [{ tags: ['C.ped', 'C.ped::Calculate PED'] }, { tags: ['J.trade'], subs: [['E.equity'], ['C.ped']] }],
      ['mock 2025', '@later'],
    );
    expect(derivedTags(question)).toEqual(['C.ped', 'C.ped::Calculate PED', 'E.equity', 'mock 2025', '@later']);
  });

  it('reads older whole-question topics as every untagged part’s, without writing', () => {
    const question = partedQuestion([{}, { tags: ['D'] }, { subs: [undefined] }], ['C.equilibrium', 'mock']);
    const before = structuredClone(question);
    const state = tagStateOf(question);
    expect(derivedTags(state)).toEqual(['C.equilibrium', 'D', 'mock']);
    expect(question).toEqual(before);
    // Moved down on a write: each part with no list of its own takes them; the question keeps its free tags.
    const moved = normalizeTagState(state);
    expect(moved.tags).toEqual(['mock']);
    expect(own(moved)).toEqual([['C.equilibrium'], ['D'], ['C.equilibrium'], undefined]);
    expect(derivedTags(moved)).toEqual(derivedTags(state));
    expect(normalizeTagState(moved)).toBe(moved);
  });

  it('a question without slots keeps its list as stored, order and all', () => {
    expect(derivedTags(choiceQuestion('Stem', '', ['mock', 'C', 'mock']))).toEqual(['mock', 'C', 'mock']);
  });

  it('stores an empty list as absent, and a sub-part list equal to its part’s as absent', () => {
    const state = tagStateOf(partedQuestion([{ tags: ['C'], subs: [['C'], ['D']] }, {}]));
    state.slots[3].own = [];
    const collapsed = collapseTagState(state);
    expect(own(collapsed)).toEqual([['C'], undefined, ['D'], undefined]);
  });
});

describe('writing a state back', () => {
  it('writes each list, keeps entries it cannot read, and is the same object when nothing changes', () => {
    const question = partedQuestion([{ tags: ['C', 7 as unknown as string] }, {}], ['mock']);
    expect(withTagState(question, tagStateOf(question))).toBe(question);
    const state = tagStateOf(question);
    state.slots[0].own = ['D'];
    state.slots[1].own = ['E'];
    state.tags = [];
    const next = withTagState(question, state);
    expect(next.parts.map((part) => part.tags)).toEqual([['D', 7], ['E']]);
    expect('tags' in next).toBe(false);
    expect(question.parts[0].tags).toEqual(['C', 7]); // untouched input
    const cleared = withTagState(next, { tags: [], slots: state.slots.map((slot) => ({ ...slot, own: undefined })) });
    expect(cleared.parts[0].tags).toEqual([7]);
    expect('tags' in cleared.parts[1]).toBe(false);
  });

  it('leaves slots the state does not name alone', () => {
    const question = partedQuestion([{ tags: ['C'] }, { tags: ['D'] }]);
    const next = withTagState(question, { tags: [], slots: [{ ...tagStateOf(question).slots[0], own: ['E'] }] });
    expect(next.parts.map((part) => part.tags)).toEqual([['E'], ['D']]);
  });
});

describe('copies agree on a part', () => {
  const slots = (keys: string[], paths = keys.map((_, i) => String(i))) => keys.map((key, i) => ({ key, path: paths[i] }));

  it('pairs by key, so a reordered copy pairs right', () => {
    expect([...matchSlots(slots(['a', 'b']), slots(['b', 'a']))]).toEqual([
      ['a', 'a'],
      ['b', 'b'],
    ]);
  });

  it('pairs leftovers by position only between copies of the same shape', () => {
    expect([...matchSlots(slots(['x', 'y']), slots(['a', 'b']))]).toEqual([
      ['x', 'a'],
      ['y', 'b'],
    ]);
    expect([...matchSlots(slots(['x', 'y']), slots(['a', 'b', 'c']))]).toEqual([]);
    expect(sameShape(slots(['a', 'b'], ['0', '0.0']), slots(['a', 'b'], ['0', '1']))).toBe(false);
  });

  it('finds a slot from a reference: by key, else by position in a copy shaped alike', () => {
    const here = slots(['a', 'b']);
    const ref = slotRef(here, 'b')!;
    expect(findSlot(slots(['b', 'a']), ref)?.key).toBe('b');
    expect(findSlot(slots(['p', 'q']), ref)?.key).toBe('q');
    expect(findSlot(slots(['p', 'q', 'r']), ref)).toBeUndefined();
  });

  it('shows a copy the winner’s state slot by slot; an extra part keeps its own', () => {
    const copy: TagState = {
      tags: [],
      slots: [
        { key: 'b', path: '0', label: '(a)', leaf: true, own: ['X'] },
        { key: 'a', path: '1', label: '(b)', leaf: true },
        { key: 'new', path: '2', label: '(c)', leaf: true, own: ['N'] },
      ],
    };
    const winner: TagState = {
      tags: ['mock'],
      slots: [
        { key: 'a', path: '0', label: '(a)', leaf: true, own: ['A'] },
        { key: 'b', path: '1', label: '(b)', leaf: true },
      ],
    };
    expect(stateFor(copy, winner)).toEqual({
      tags: ['mock'],
      slots: [
        { key: 'b', path: '0', label: '(a)', leaf: true },
        { key: 'a', path: '1', label: '(b)', leaf: true, own: ['A'] },
        { key: 'new', path: '2', label: '(c)', leaf: true, own: ['N'] },
      ],
    });
    // A copy without parts takes the derived list; a winner without parts tags the copy as a whole.
    expect(stateFor({ tags: [], slots: [] }, winner)).toEqual({ tags: ['A', 'mock'], slots: [] });
    expect(stateFor(copy, { tags: ['C'], slots: [] }).slots.every((slot) => !slot.own)).toBe(true);
  });
});

describe('the part a page selection names', () => {
  const question = partedQuestion([{ subs: [undefined] }, {}]);
  question.parts[1].blocksBefore = [createParagraphBlock()];
  const slots = questionTagSlots(question);
  const [a, b] = question.parts;
  const sub = a.subParts![0];

  it('finds the finest slot: a sub-part before its part, by block, lead-in or answer', () => {
    expect(slotAtTarget(slots, editTargetKey({ kind: 'blockText', blockId: sub.blocks[0].id }))?.label).toBe('(a)(i)');
    expect(slotAtTarget(slots, editTargetKey({ kind: 'blockText', blockId: a.blocks[0].id }))?.label).toBe('(a)');
    expect(slotAtTarget(slots, editTargetKey({ kind: 'blockText', blockId: b.blocksBefore![0].id }))?.label).toBe('(b)');
    expect(slotAtTarget(slots, editTargetKey({ kind: 'subPartAnswer', questionId: question.id, partId: a.id, subPartId: sub.id }))?.label).toBe('(a)(i)');
    expect(slotAtTarget(slots, editTargetKey({ kind: 'partAnswer', questionId: question.id, partId: b.id }))?.label).toBe('(b)');
    expect(slotAtTarget(slots, editTargetKey({ kind: 'blockText', blockId: question.blocks[0].id }))).toBeUndefined();
    expect(slotAtTarget(slots, undefined)).toBeUndefined();
  });

  it('highlights a part’s blocks and answers with its sub-parts, never its lead-in', () => {
    const ids = slotHighlightIds(slots, [a.id]);
    expect(ids).toEqual(new Set([a.blocks[0].id, a.id, sub.blocks[0].id, sub.id]));
    expect(slotHighlightIds(slots, [b.id]).has(b.blocksBefore![0].id)).toBe(false);
  });
});
