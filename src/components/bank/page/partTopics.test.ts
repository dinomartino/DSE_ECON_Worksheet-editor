import { describe, expect, it } from 'vitest';
import { summarize } from '@/storage/document';
import { rowsOf } from '@/library/indexer';
import { patternWrites, renamePatternEdit } from '@/library/patterns';
import { stateOfRow, withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith, partedQuestion } from '@/library/testKit';
import { bulkTopicEdit, copyWrites, everywhere, removeTopics, retagQuestion, thenState, writeTags, type StateEdit } from '@/library/tagWrites';
import { copyQuestion } from '@/model/lineage';
import { derivedTags, tagStateOf, type TagState } from '@/model/tagSlots';
import type { Question, StructuredQuestion, Worksheet } from '@/model/types';
import {
  applyDraft,
  changeAt,
  draftOf,
  everyCode,
  hasTopic,
  partLines,
  patternAt,
  patternEditAt,
  sameAsPart,
  savedByPart,
  targetName,
  ticksAt,
  toggleAt,
  whereTested,
  type PartTarget,
} from './partTopics';

const NOW = '2026-09-30T00:00:00.000Z';

/** (a) with (i) (ii), then (b): untagged. */
const untagged = () => partedQuestion([{ subs: [undefined, undefined] }, {}]);
const keysOf = (state: TagState) => Object.fromEntries(state.slots.map((slot) => [slot.label, slot.key]));
const parts = (question: Question) => {
  const q = question as StructuredQuestion;
  return q.parts.map((part) => ({ tags: part.tags, subs: part.subParts?.map((sub) => sub.tags) }));
};

/** A teacher's picks, each made on the draft as it stood, as the screens make them. */
function pick(state: TagState, steps: ((draft: TagState) => StateEdit)[]) {
  const edits: StateEdit[] = [];
  let draft = state;
  for (const step of steps) {
    const edit = step(draft);
    edits.push(edit);
    draft = applyDraft(draft, edit);
  }
  return { draft, edit: thenState(...edits) };
}

describe('tagging a question part by part (Edit topics, tag as you go)', () => {
  const question = untagged();
  const start = draftOf(tagStateOf(question));
  const key = keysOf(start);

  it('tags the whole question, then refines a part and a sub-part', () => {
    const { draft, edit } = pick(start, [
      (d) => toggleAt(d, undefined, 'C', true),
      (d) => toggleAt(d, key['(b)'], 'C', false),
      (d) => toggleAt(d, key['(b)'], 'I', true),
      (d) => toggleAt(d, key['(a)(ii)'], 'C.ped', true),
      (d) => toggleAt(d, key['(a)(ii)'], 'C', false),
    ]);
    const saved = retagQuestion(question, edit, NOW);
    // (a) holds C; (i) keeps it; (ii) has its own, in place of (a)'s; (b) its own.
    expect(parts(saved)).toEqual([{ tags: ['C'], subs: [undefined, ['C.ped']] }, { tags: ['I'], subs: undefined }]);
    expect(tagStateOf(saved)).toEqual(draft);
    expect(derivedTags(saved)).toEqual(['C', 'C.ped', 'I']);
    expect(saved.tagsAt).toBe(NOW);
  });

  it('shows the whole question’s ticks: on every part, or on some (where)', () => {
    const { draft } = pick(start, [
      (d) => toggleAt(d, undefined, 'C', true),
      (d) => toggleAt(d, key['(b)'], 'I', true),
      (d) => toggleAt(d, key['(a)(ii)'], 'C.ped', true),
    ]);
    const whole = ticksAt(draft, undefined);
    expect([...whole.ticked]).toEqual(['C']);
    expect(Object.fromEntries(whole.partial)).toEqual({ 'C.ped': ['(a)(ii)'], I: ['(b)'] });
    expect([...ticksAt(draft, key['(a)(i)']).ticked]).toEqual(['C']);
    expect([...ticksAt(draft, key['(b)']).ticked]).toEqual(['C', 'I']);
    // A part whose every sub-part tests a topic reads as the part.
    expect(whereTested(draft, 'C')).toEqual(['(a)', '(b)']);
    // Ticking a half-ticked topic on the whole question puts it on every part.
    const all = applyDraft(draft, toggleAt(draft, undefined, 'I', true));
    expect(ticksAt(all, undefined).ticked.has('I')).toBe(true);
  });

  it('reads each part for the column, and a sub-part back to its part’s (Same as (a))', () => {
    const { draft } = pick(start, [(d) => toggleAt(d, undefined, 'C', true), (d) => toggleAt(d, key['(a)(ii)'], 'D', true)]);
    expect(partLines(draft).map(({ short, sub, inherits, codes }) => [short, sub, inherits, codes])).toEqual([
      ['(a)', false, false, ['C']],
      ['(i)', true, true, ['C']],
      ['(ii)', true, false, ['C', 'D']],
      ['(b)', false, false, ['C']],
    ]);
    const back = applyDraft(draft, sameAsPart(draft, key['(a)(ii)']));
    expect(partLines(back)[2].inherits).toBe(true);
    expect(targetName(draft, key['(a)(ii)'])).toBe('sub-part (a)(ii)');
    expect(targetName(draft, key['(b)'])).toBe('part (b)');
    expect(targetName(draft, undefined)).toBe('the whole question');
  });

  it('sets a 題型 only where its sub-topic is, and reads a mix as none', () => {
    const { draft } = pick(start, [
      (d) => toggleAt(d, key['(a)'], 'C.ped', true),
      (d) => toggleAt(d, key['(b)'], 'I', true),
      (d) => patternEditAt(d, undefined, 'C.ped', 'Calculate PED'),
    ]);
    expect(partLines(draft).map((line) => line.label)).toEqual(['(a)', '(a)(i)', '(a)(ii)', '(b)']);
    expect(draft.slots.find((slot) => slot.label === '(b)')?.own).toEqual(['I']);
    expect(patternAt(draft, undefined, 'C.ped')).toEqual({ name: 'Calculate PED', mixed: false });
    const mixed = applyDraft(draft, patternEditAt(draft, key['(a)(ii)'], 'C.ped', 'Factors'));
    expect(patternAt(mixed, undefined, 'C.ped')).toEqual({ mixed: true });
    expect(patternAt(mixed, key['(a)(ii)'], 'C.ped')).toEqual({ name: 'Factors', mixed: false });
  });

  it('All topics changes only what was ticked or unticked on the target', () => {
    const { draft } = pick(start, [(d) => toggleAt(d, key['(a)'], 'C', true), (d) => toggleAt(d, key['(b)'], 'I', true)]);
    // On the whole question nothing is on every part; ticking D there leaves (a) and (b) their own.
    const next = applyDraft(draft, changeAt(draft, undefined, [], ['D']));
    expect(partLines(next).map((line) => line.codes)).toEqual([['C', 'D'], ['C', 'D'], ['C', 'D'], ['I', 'D']]);
  });

  it('a save replays on another copy by part, even reordered, and Undo takes every part’s topics off', () => {
    const copy = copyQuestion(question) as StructuredQuestion;
    const reordered = { ...copy, parts: [copy.parts[1], copy.parts[0]] };
    const { draft, edit } = pick(start, [
      (d) => toggleAt(d, undefined, 'C', true),
      (d) => toggleAt(d, key['(b)'], 'C', false),
      (d) => toggleAt(d, key['(b)'], 'I', true),
    ]);
    const other = retagQuestion(reordered, edit, NOW, draftOf(tagStateOf(question)));
    expect(parts(other)).toEqual([{ tags: ['I'], subs: undefined }, { tags: ['C'], subs: [undefined, undefined] }]);
    expect(hasTopic(draft)).toBe(true);
    expect(everyCode(draft)).toEqual(['C', 'I']);
    expect(savedByPart(draft)).toEqual([
      { label: '(a)', codes: ['C'] },
      { label: '(b)', codes: ['I'] },
    ]);
    // What every part has is said once, then each part's others.
    const both = applyDraft(draft, toggleAt(draft, undefined, 'J', true));
    expect(savedByPart(both)).toEqual([
      { codes: ['J'] },
      { label: '(a)', codes: ['C'] },
      { label: '(b)', codes: ['I'] },
    ]);
    const undone = retagQuestion(retagQuestion(question, edit, NOW), everywhere(removeTopics(everyCode(draft))), NOW);
    expect(hasTopic(tagStateOf(undone))).toBe(false);
    expect(parts(undone)).toEqual(parts(question));
  });

  it('a question without parts is one list, as before', () => {
    const mcq = choiceQuestion('Along a demand curve…', '', ['mock']);
    const state = draftOf(tagStateOf(mcq));
    const { draft, edit } = pick(state, [(d) => toggleAt(d, undefined as PartTarget, 'C', true)]);
    expect(retagQuestion(mcq, edit, NOW).tags).toEqual(['mock', 'C']);
    expect(savedByPart(draft)).toEqual([{ codes: ['C'] }]);
    expect(ticksAt(draft, undefined).partial.size).toBe(0);
  });
});

describe('the bank’s whole-question writes reach every part', () => {
  function memoryStore(docs: Worksheet[]) {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    return { saved, list: async () => [...saved.values()].map(summarize), load: async (id: string) => saved.get(id), save: async (doc: Worksheet) => void saved.set(doc.id, doc) };
  }

  it('bulk Set topic (Add) on two questions with parts tags every part of every copy', async () => {
    const one = partedQuestion([{ subs: [undefined, ['C.ped']] }, {}]);
    const two = partedQuestion([{}, {}], undefined, 'A market for tea.');
    const docA = docWith([one, two]);
    const docB = docWith([copyQuestion(one, docA.id)]);
    const store = memoryStore([docA, docB]);
    const rows = [...rowsOf(docA), ...rowsOf(docB)];
    const roots = new Set(rows.map((r) => r.rootId));
    await writeTags(store, copyWrites(rows, roots), bulkTopicEdit('add', ['D']), undefined, NOW);
    const [a1, a2] = store.saved.get(docA.id)!.questions;
    expect(parts(a1)).toEqual([{ tags: ['D'], subs: [undefined, ['C.ped', 'D']] }, { tags: ['D'], subs: undefined }]);
    expect(parts(a2)).toEqual([
      { tags: ['D'], subs: undefined },
      { tags: ['D'], subs: undefined },
    ]);
    expect(parts(store.saved.get(docB.id)!.questions[0])).toEqual(parts(a1));
  });

  it('a 題型 rename reaches a part list, in every copy', async () => {
    const one = partedQuestion([{ tags: ['C.ped', 'C.ped::Old'] }, { tags: ['I'] }]);
    const docA = docWith([one]);
    const docB = docWith([copyQuestion(one, docA.id)]);
    const store = memoryStore([docA, docB]);
    const rows = [...rowsOf(docA), ...rowsOf(docB)];
    const list = patternWrites(rows, { topic: 'C.ped', typeId: one.type, name: 'old' });
    expect(list).toHaveLength(2);
    await writeTags(store, list, renamePatternEdit('C.ped', 'Old', 'New'), undefined, NOW);
    for (const doc of [docA, docB]) {
      expect(parts(store.saved.get(doc.id)!.questions[0])).toEqual([
        { tags: ['C.ped', 'C.ped::New'], subs: undefined },
        { tags: ['I'], subs: undefined },
      ]);
    }
    // The bank reads the new name from the rows it would show.
    const shown = withSharedTags([...rowsOf(store.saved.get(docA.id)!), ...rowsOf(store.saved.get(docB.id)!)]);
    expect(stateOfRow(shown[0]).slots[0].own).toEqual(['C.ped', 'C.ped::New']);
  });
});
