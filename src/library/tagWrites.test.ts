import { describe, expect, it } from 'vitest';
import { summarize } from '@/storage/document';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partedQuestion, partsQuestion, row } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import { bi } from '@/model/text';
import { derivedTags, slotRef, tagStateOf } from '@/model/tagSlots';
import type { Question, StructuredQuestion, Worksheet } from '@/model/types';
import { renamePatternEdit } from './patterns';
import { withSharedTags } from './sharedTags';
import {
  addTopics,
  adoptNewerTags,
  REVISION_BUSY,
  atSlot,
  bulkTopicEdit,
  copyWrites,
  everywhere,
  freeTags,
  inheritAtSlot,
  isStateEdit,
  removeTopics,
  replaceTopics,
  retagQuestion,
  thenState,
  wholeQuestion,
  withQuestionTags,
  writeTags,
} from './tagWrites';

const NOW = '2026-09-29T00:00:00.000Z';

describe('withQuestionTags', () => {
  const target = choiceQuestion('Along a straight-line demand curve…', '', ['C', 'mock 2025']);
  const other = partsQuestion('Explain a bumper harvest.');
  const doc = docWith([target, other], { classes: ['5A'], updatedAt: '2026-01-01T00:00:00.000Z' });

  it('changes only the target question’s tags and preserves everything else', () => {
    const next = withQuestionTags(doc, [target.id], replaceTopics(['C.ped', 'C.equilibrium']), NOW);
    const { questions: before, updatedAt: _b, ...restBefore } = doc;
    const { questions: after, updatedAt, ...restAfter } = next;
    void _b;
    expect(updatedAt).toBe(NOW);
    expect(restAfter).toEqual(restBefore);
    expect(after[1]).toBe(before[1]); // the other question is the same object
    expect(after[0]).toEqual({ ...target, tags: ['C.ped', 'C.equilibrium', 'mock 2025'], tagsAt: NOW });
    expect(doc.questions[0].tags).toEqual(['C', 'mock 2025']); // the input is untouched
  });

  it('adds without removing, drops an emptied key, and is a no-op when nothing changes', () => {
    const added = withQuestionTags(doc, [target.id, other.id], addTopics(['D']), NOW);
    expect(added.questions[0].tags).toEqual(['C', 'mock 2025', 'D']);
    // A question with parts is tagged per part: a whole-question add reaches every part.
    expect(added.questions[1].tags).toBeUndefined();
    expect((added.questions[1] as StructuredQuestion).parts.map((part) => part.tags)).toEqual([['D']]);

    const cleared = withQuestionTags(doc, [target.id], () => [], NOW);
    expect('tags' in cleared.questions[0]).toBe(false);
    // A removal is a tag write too: stamped, so a later build can tell it is the newest.
    expect(cleared.questions[0].tagsAt).toBe(NOW);
    expect(added.questions[1].tagsAt).toBe(NOW);

    expect(withQuestionTags(doc, [target.id], addTopics(['C']), NOW)).toBe(doc);
    expect(withQuestionTags(doc, ['missing'], addTopics(['C']), NOW)).toBe(doc);
  });
});

describe('writeTags', () => {
  function memoryStore(docs: Worksheet[]) {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    const writes: string[] = [];
    return {
      saved,
      writes,
      list: async () => [...saved.values()].map(summarize), load: async (id: string) => saved.get(id),
      save: async (worksheet: Worksheet) => {
        writes.push(worksheet.id);
        saved.set(worksheet.id, worksheet);
      },
    };
  }

  it('loads and saves each owning document once, whatever the number of questions', async () => {
    const a1 = choiceQuestion('one');
    const a2 = choiceQuestion('two');
    const b1 = choiceQuestion('three');
    const docA = docWith([a1, a2]);
    const docB = docWith([b1]);
    const store = memoryStore([docA, docB]);
    const report = await writeTags(
      store,
      [
        { docId: docA.id, questionId: a1.id },
        { docId: docB.id, questionId: b1.id },
        { docId: docA.id, questionId: a2.id },
      ],
      addTopics(['H']),
    );
    expect(store.writes).toEqual([docA.id, docB.id]);
    expect(report).toEqual({ saved: [docA.id, docB.id], failed: [] });
    expect(store.saved.get(docA.id)!.questions.map((q) => q.tags)).toEqual([['H'], ['H']]);
  });

  it('reports a missing document and never rewrites one from a newer build', async () => {
    const q = choiceQuestion('newer');
    const newer = { ...docWith([q]), schemaVersion: 999 };
    const store = memoryStore([newer]);
    const report = await writeTags(
      store,
      [
        { docId: newer.id, questionId: q.id },
        { docId: 'gone', questionId: 'x' },
      ],
      addTopics(['A']),
    );
    expect(store.writes).toEqual([]);
    expect(report.failed.map((f) => f.docId)).toEqual([newer.id, 'gone']);
  });

  it('never writes a trashed or hidden document from a stale row', async () => {
    const q1 = choiceQuestion('trashed');
    const q2 = choiceQuestion('hidden');
    const trashed = docWith([q1]);
    const hidden = docWith([q2], { bankHidden: true });
    const store = memoryStore([trashed, hidden]);
    // Trash keeps the document but takes it off the list.
    const listed = { ...store, list: async () => [summarize(hidden)] };
    const report = await writeTags(
      listed,
      [
        { docId: trashed.id, questionId: q1.id },
        { docId: hidden.id, questionId: q2.id },
      ],
      addTopics(['A']),
    );
    expect(store.writes).toEqual([]);
    expect(report.failed).toEqual([
      { docId: trashed.id, reason: 'it is in Trash' },
      { docId: hidden.id, reason: 'it is hidden from the question bank' },
    ]);
  });
});

describe('bulk topic edits', () => {
  it('removes only the named codes, and replaces codes while keeping free tags', () => {
    const tags = ['C', 'C.ped', 'mock 2025'];
    expect(bulkTopicEdit('remove', ['C', 'J'])(tags)).toEqual(['C.ped', 'mock 2025']);
    expect(removeTopics(['C.ped'])(tags)).toEqual(['C', 'mock 2025']);
    expect(bulkTopicEdit('replace', ['A'])(tags)).toEqual(['A', 'mock 2025']);
    expect(bulkTopicEdit('replace', [])(tags)).toEqual(['mock 2025']);
    expect(bulkTopicEdit('add', ['A', 'C'])(tags)).toEqual(['C', 'C.ped', 'mock 2025', 'A']);
  });
});

describe('copyWrites', () => {
  it('lists every copy of each named question once, and nothing else', () => {
    const rows = [
      row({ rootId: 'r', docId: 'd1', questionId: 'a' }),
      row({ rootId: 'x', docId: 'd1', questionId: 'b' }),
      row({ rootId: 'r', docId: 'd2', questionId: 'c' }),
      row({ rootId: 'r', docId: 'd2', questionId: 'c' }),
    ];
    expect(copyWrites(rows, ['r'])).toEqual([
      { docId: 'd1', questionId: 'a', shared: { tags: [], slots: [] } },
      { docId: 'd2', questionId: 'c', shared: { tags: [], slots: [] } },
    ]);
    expect(copyWrites(rows, new Set(['r', 'x']))).toHaveLength(3);
    expect(copyWrites(rows, [])).toEqual([]);
  });

  it('passes on the shared set a row shows, and nothing when the row has no tags field', () => {
    expect(copyWrites([row({ rootId: 'r', docId: 'd', questionId: 'a', tags: ['C'] })], ['r'])).toEqual([{ docId: 'd', questionId: 'a', shared: { tags: ['C'], slots: [] } }]);
    expect(copyWrites([{ rootId: 'r', docId: 'd', questionId: 'a' }], ['r'])).toEqual([{ docId: 'd', questionId: 'a' }]);
  });
});

describe('an edit applied to the shared set (newest change wins)', () => {
  const T1 = '2026-09-01T00:00:00.000Z';

  it('makes the copy adopt the edited shared set, not its own stale tags, and keeps a non-string tag', () => {
    const stale = { ...choiceQuestion('Along a straight-line demand curve…', '', ['C', 'C.ped', 7 as unknown as string]), tagsAt: T1 };
    const doc = docWith([stale]);
    const next = withQuestionTags(doc, [stale.id], removeTopics(['D']), NOW, new Map([[stale.id, { tags: ['C', 'D'], slots: [] }]]));
    expect(next.questions[0].tags).toEqual(['C', 7]);
    expect(next.questions[0].tagsAt).toBe(NOW);
  });

  it('stamps a copy that already held the result when the edit changed the shared set', () => {
    // This copy already lacks D; a copy the write cannot reach still has it and was stamped later.
    const current = { ...choiceQuestion('Along a straight-line demand curve…', '', ['C']), tagsAt: T1 };
    const doc = docWith([current]);
    const next = withQuestionTags(doc, [current.id], removeTopics(['D']), NOW, new Map([[current.id, { tags: ['C', 'D'], slots: [] }]]));
    expect(next.questions[0].tags).toEqual(['C']);
    expect(next.questions[0].tagsAt).toBe(NOW);
  });

  it('leaves a copy alone when the edit changes nothing and it already holds the set', () => {
    const held = { ...choiceQuestion('Along a straight-line demand curve…', '', ['D', 'C']), tagsAt: T1 };
    const doc = docWith([held]);
    expect(withQuestionTags(doc, [held.id], addTopics(['C']), NOW, new Map([[held.id, { tags: ['C', 'D'], slots: [] }]]))).toBe(doc);
  });

  it('writes every copy under one stamp', async () => {
    const original = choiceQuestion('A price ceiling below equilibrium', '', ['C']);
    const copy = copyQuestion(original, 'bank');
    const docA = docWith([original]);
    const docB = docWith([copy]);
    const saved = new Map([docA, docB].map((doc) => [doc.id, doc]));
    const store = { list: async () => [...saved.values()].map(summarize), load: async (id: string) => saved.get(id), save: async (w: Worksheet) => void saved.set(w.id, w) };
    const rows = [docA, docB].flatMap((doc) => rowsOf(doc));
    await writeTags(store, copyWrites(rows, [original.id]), addTopics(['D']), undefined, NOW);
    expect(saved.get(docA.id)!.questions[0].tagsAt).toBe(NOW);
    expect(saved.get(docB.id)!.questions[0].tagsAt).toBe(NOW);
  });
});

describe('an edit from the bank reaches every copy', () => {
  function memoryStore(docs: Worksheet[]) {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    return { saved, list: async () => [...saved.values()].map(summarize), load: async (id: string) => saved.get(id), save: async (w: Worksheet) => void saved.set(w.id, w) };
  }

  it('gives every writable copy the same topics and reports a copy from a newer build', async () => {
    const original = choiceQuestion('A price ceiling below equilibrium', '', ['C', 'mock']);
    const copy = { ...copyQuestion(original, 'bank'), tags: ['J'] };
    const third = copyQuestion(original, 'bank');
    const docA = docWith([original]);
    const docB = docWith([copy, choiceQuestion('Unrelated', '', ['A'])]);
    const newer = { ...docWith([third]), schemaVersion: 999 };
    const store = memoryStore([docA, docB, newer]);
    const rows = [docA, docB, newer].flatMap((doc) => rowsOf(doc));

    const report = await writeTags(store, copyWrites(rows, [original.id]), replaceTopics(['C.intervention']));

    expect(report.saved).toEqual([docA.id, docB.id]);
    expect(report.failed).toEqual([{ docId: newer.id, reason: 'it was saved by a newer version of the app' }]);
    expect(store.saved.get(docA.id)!.questions[0].tags).toEqual(['C.intervention', 'mock']);
    expect(store.saved.get(docB.id)!.questions.map((q) => q.tags)).toEqual([['C.intervention'], ['A']]);
    expect(store.saved.get(newer.id)).toBe(newer);
  });

  it('bulk remove takes a topic off every copy of every picked question', async () => {
    const q = choiceQuestion('Explain a bumper harvest', '', ['C', 'C.ped']);
    const copy = { ...copyQuestion(q, 'bank'), tags: ['C.ped', 'G'] };
    const docA = docWith([q]);
    const docB = docWith([copy]);
    const store = memoryStore([docA, docB]);
    const rows = [docA, docB].flatMap((doc) => rowsOf(doc));
    await writeTags(store, copyWrites(rows, [q.id]), bulkTopicEdit('remove', ['C.ped']));
    expect(store.saved.get(docA.id)!.questions[0].tags).toEqual(['C']);
    expect(store.saved.get(docB.id)!.questions[0].tags).toEqual(['G']);
  });
});

describe('a tag this build cannot read', () => {
  // A newer build's tag shape, or a hand-edited file: every edit keeps it where it was.
  const odd = [{ code: 'C' }, 7] as unknown as string[];
  it.each([
    ['replace', replaceTopics(['C.ped'])],
    ['add', addTopics(['C.ped'])],
    ['remove', removeTopics(['C'])],
  ])('survives %s without throwing', (_label, edit) => {
    const next = edit(['C', ...odd, 'mock']);
    expect(next).toEqual(expect.arrayContaining(odd));
  });
});

describe('writes to a question tagged per part', () => {
  const T1 = '2026-09-01T00:00:00.000Z';
  const partTags = (question: Question) => (question as StructuredQuestion).parts.map((part) => part.tags);
  const subTags = (question: Question) => (question as StructuredQuestion).parts.map((part) => part.subParts?.map((sub) => sub.tags));
  const store = (docs: Worksheet[]) => {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    const writes: string[] = [];
    return {
      saved,
      writes,
      list: async () => [...saved.values()].map(summarize), load: async (id: string) => saved.get(id),
      save: async (w: Worksheet) => {
        writes.push(w.id);
        saved.set(w.id, w);
      },
    };
  };

  it('a whole-question edit tags every part, keeps free tags on the question, and leaves inheriting sub-parts inheriting', () => {
    const question = partedQuestion([{}, { subs: [undefined, ['E.equity']] }], ['mock']);
    const doc = docWith([question]);
    const next = withQuestionTags(doc, [question.id], addTopics(['C.ped']), NOW).questions[0];
    expect(next.tags).toEqual(['mock']);
    expect(partTags(next)).toEqual([['C.ped'], ['C.ped']]);
    expect(subTags(next)).toEqual([undefined, [undefined, ['E.equity', 'C.ped']]]);
    expect(next.tagsAt).toBe(NOW);
    // Replace makes every part say exactly that; a sub-part's list equal to its part's goes.
    const replaced = withQuestionTags(docWith([next]), [next.id], replaceTopics(['D']), NOW).questions[0];
    expect(partTags(replaced)).toEqual([['D'], ['D']]);
    expect(subTags(replaced)).toEqual([undefined, [undefined, undefined]]);
    expect(replaced.tags).toEqual(['mock']);
  });

  it('atSlot changes one part only; a sub-part’s own list replaces its part’s', () => {
    const question = partedQuestion([{ tags: ['C.ped'], subs: [undefined, undefined] }, { tags: ['C.intervention'] }]);
    const state = tagStateOf(question);
    const sub = slotRef(state.slots, state.slots[2].key)!;
    const next = retagQuestion(question, atSlot(sub, addTopics(['D.structure'])), NOW);
    expect(subTags(next)).toEqual([[undefined, ['C.ped', 'D.structure']], undefined]);
    expect(partTags(next)).toEqual([['C.ped'], ['C.intervention']]);
    expect(derivedTags(next)).toEqual(['C.ped', 'D.structure', 'C.intervention']);
    // Back to "Same as (a)": the list goes, the sub-part takes its part's again.
    const back = retagQuestion(next, inheritAtSlot(sub), NOW);
    expect(subTags(back)).toEqual([[undefined, undefined], undefined]);
    // Free tags go on the question only.
    const free = retagQuestion(back, freeTags(addTopics(['mock 2025'])), NOW);
    expect(free.tags).toEqual(['mock 2025']);
    expect(partTags(free)).toEqual([['C.ped'], ['C.intervention']]);
  });

  it('lands a part edit on the right part of a reordered copy, and skips a copy without that part', async () => {
    const original = partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]);
    const reordered = copyQuestion(original, 'bank');
    reordered.parts.reverse();
    const reshaped = partedQuestion([{}, {}, {}]); // an unrooted copy of another shape
    const lineage = { rootId: original.id };
    const docs = [docWith([original]), docWith([reordered]), docWith([{ ...reshaped, lineage }])];
    const s = store(docs);
    const rows = withSharedTags(docs.flatMap((doc) => rowsOf(doc)));
    const state = tagStateOf(original);
    const b = slotRef(state.slots, state.slots[1].key)!;
    const report = await writeTags(s, copyWrites(rows, [original.id]), atSlot(b, addTopics(['E.policy'])), undefined, NOW);
    expect(partTags(s.saved.get(docs[0].id)!.questions[0])).toEqual([['C.ped'], ['C.intervention', 'E.policy']]);
    // The reordered copy prints (b) first: that is where it lands.
    expect(partTags(s.saved.get(docs[1].id)!.questions[0])).toEqual([['C.intervention', 'E.policy'], ['C.ped']]);
    // No such part there (another shape, no roots): left alone, not even stamped.
    expect(s.saved.get(docs[2].id)).toBe(docs[2]);
    expect(report.saved).toEqual([docs[0].id, docs[1].id]);
    expect(s.writes).toEqual([docs[0].id, docs[1].id]);
  });

  it('matches an unrooted copy of the same shape by position', async () => {
    const original = partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]);
    const twin = { ...partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]), lineage: { rootId: original.id } };
    const docs = [docWith([original]), docWith([twin])];
    const s = store(docs);
    const rows = withSharedTags(docs.flatMap((doc) => rowsOf(doc)));
    const state = tagStateOf(original);
    await writeTags(s, copyWrites(rows, [original.id]), atSlot(slotRef(state.slots, state.slots[0].key)!, removeTopics(['C.ped'])), undefined, NOW);
    expect(partTags(s.saved.get(docs[1].id)!.questions[0])).toEqual([undefined, ['C.intervention']]);
  });

  it('a rename reaches a part list no leaf inherits (everywhere)', () => {
    const question = partedQuestion([{ tags: ['C.ped', 'C.ped::Old'], subs: [['D'], ['E.equity']] }]);
    const next = retagQuestion(question, everywhere(renamePatternEdit('C.ped', 'Old', 'New')), NOW);
    expect(partTags(next)).toEqual([['C.ped', 'C.ped::New']]);
    expect(subTags(next)).toEqual([[['D'], ['E.equity']]]);
    // The whole-question reading of the same list edit reaches it too.
    expect(retagQuestion(question, renamePatternEdit('C.ped', 'Old', 'New'), NOW)).toEqual(next);
  });

  it('moves older whole-question topics down in the same save as the edit, never on its own', async () => {
    const legacy = { ...partedQuestion([{}, { tags: ['D'] }]), tags: ['C.equilibrium', 'mock'], tagsAt: T1 };
    const doc = docWith([legacy]);
    // No change: no write, the develop-era shape kept.
    expect(withQuestionTags(doc, [legacy.id], removeTopics(['J']), NOW)).toBe(doc);
    const s = store([doc]);
    await writeTags(s, [{ docId: doc.id, questionId: legacy.id }], thenState(atSlot(slotRef(tagStateOf(legacy).slots, tagStateOf(legacy).slots[0].key)!, addTopics(['C.ped']))));
    const written = s.saved.get(doc.id)!.questions[0];
    expect(written.tags).toEqual(['mock']);
    expect(partTags(written)).toEqual([['C.equilibrium', 'C.ped'], ['D']]);
    expect(s.writes).toEqual([doc.id]);
  });

  it('bulk remove takes a topic off every part and sub-part list', () => {
    const question = partedQuestion([{ tags: ['C.ped', 'C'], subs: [['C.ped'], undefined] }, { tags: ['C.ped'] }]);
    const next = retagQuestion(question, bulkTopicEdit('remove', ['C.ped']), NOW);
    expect(partTags(next)).toEqual([['C'], undefined]);
    expect(subTags(next)).toEqual([[undefined, undefined], undefined]);
    expect(derivedTags(next)).toEqual(['C']);
  });

  it('a list edit and its whole-question state edit are the same write', () => {
    const question = partedQuestion([{}, {}], ['mock']);
    const doc = docWith([question]);
    expect(withQuestionTags(doc, [question.id], addTopics(['C']), NOW)).toEqual(
      withQuestionTags(doc, [question.id], wholeQuestion(addTopics(['C'])), NOW),
    );
    expect(isStateEdit(addTopics(['C']))).toBe(false);
    expect(isStateEdit(wholeQuestion(addTopics(['C'])))).toBe(true);
  });
});

describe('a second tab holding the same paper (S4)', () => {
  const T1 = '2026-01-01T00:00:00.000Z';
  const T2 = '2026-01-02T00:00:00.000Z';
  const T3 = '2026-01-03T00:00:00.000Z';

  /** A store another tab saves into between this tab's reads (`between` runs before each load). */
  function racingStore(docs: Worksheet[], between: (saved: Map<string, Worksheet>, loads: number) => void) {
    const saved = new Map(docs.map((doc) => [doc.id, doc]));
    let loads = 0;
    const writes: Worksheet[] = [];
    return {
      saved,
      writes,
      list: async () => [...saved.values()].map(summarize),
      load: async (id: string) => {
        loads += 1;
        between(saved, loads);
        return saved.get(id);
      },
      save: async (worksheet: Worksheet) => {
        writes.push(worksheet);
        saved.set(worksheet.id, worksheet);
      },
    };
  }

  it('a save made elsewhere after the read is kept: the edit is made again on top of it', async () => {
    const q = choiceQuestion('one', '', ['C']);
    const doc = docWith([q]);
    // The other tab saves a content edit right after this tab first reads the paper.
    const store = racingStore([doc], (saved, loads) => {
      if (loads !== 2) return;
      const current = saved.get(doc.id)!;
      saved.set(doc.id, { ...current, title: bi('Edited in the other tab', ''), updatedAt: T3 });
    });
    const report = await writeTags(store, [{ docId: doc.id, questionId: q.id }], addTopics(['D']), undefined, NOW);
    expect(report.saved).toEqual([doc.id]);
    const after = store.saved.get(doc.id)!;
    expect(after.title).toEqual(bi('Edited in the other tab', ''));
    expect(after.questions[0].tags).toEqual(['C', 'D']);
  });

  it('gives up, and says so, when the paper changes on every try', async () => {
    const q = choiceQuestion('one', '', ['C']);
    const doc = docWith([q]);
    const store = racingStore([doc], (saved, loads) => {
      const current = saved.get(doc.id)!;
      saved.set(doc.id, { ...current, updatedAt: `2026-02-${String(loads).padStart(2, '0')}T00:00:00.000Z` });
    });
    const report = await writeTags(store, [{ docId: doc.id, questionId: q.id }], addTopics(['D']), undefined, NOW);
    expect(report).toEqual({ saved: [], failed: [{ docId: doc.id, reason: REVISION_BUSY }] });
    expect(store.writes).toEqual([]);
  });

  it('a copy tagged after the bank read its rows keeps that change: the edit applies to its own tags', async () => {
    // The bank row said C (stamped T1); the other tab has since tagged this copy C + E at T2.
    const q = { ...choiceQuestion('one', '', ['C', 'E']), tagsAt: T2 };
    const doc = docWith([q]);
    const store = racingStore([doc], () => {});
    const [write] = copyWrites([row({ docId: doc.id, questionId: q.id, rootId: q.id, tags: ['C'], tagsAt: T1 })], [q.id]);
    expect(write.sharedAt).toBe(T1);
    await writeTags(store, [write], addTopics(['D']), undefined, NOW);
    expect(store.saved.get(doc.id)!.questions[0].tags).toEqual(['C', 'E', 'D']);
  });

  it('an older copy still adopts the shared state the bank showed', async () => {
    const q = { ...choiceQuestion('one', '', ['C', 'X']), tagsAt: T1 };
    const doc = docWith([q]);
    const store = racingStore([doc], () => {});
    const [write] = copyWrites([row({ docId: doc.id, questionId: q.id, rootId: q.id, tags: ['C'], tagsAt: T2 })], [q.id]);
    await writeTags(store, [write], addTopics(['D']), undefined, NOW);
    expect(store.saved.get(doc.id)!.questions[0].tags).toEqual(['C', 'D']);
  });

  it('adoptNewerTags: the open editor takes newer tags only, keeping its own content', () => {
    const q1 = { ...choiceQuestion('mine, edited', '', ['C']), tagsAt: T1 };
    const q2 = { ...choiceQuestion('two', '', ['F']), tagsAt: T3 };
    const open = docWith([q1, q2]);
    const savedElsewhere: Worksheet = {
      ...open,
      questions: [
        { ...choiceQuestion('older text'), id: q1.id, tags: ['C', 'D'], tagsAt: T2 },
        { ...q2, tags: ['G'], tagsAt: T2 },
      ],
    };
    const next = adoptNewerTags(open, savedElsewhere);
    expect(next.questions[0]).toEqual({ ...q1, tags: ['C', 'D'], tagsAt: T2 });
    // Our own newer change wins over theirs.
    expect(next.questions[1]).toBe(q2);
    expect(adoptNewerTags(next, savedElsewhere)).toBe(next);
    expect(adoptNewerTags(open, { ...savedElsewhere, id: 'another' })).toBe(open);
  });
});
