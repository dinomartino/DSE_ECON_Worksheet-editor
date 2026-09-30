import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { plain } from '@/model/text';
import type { TranslationWrite } from '@/model/textSlots';
import type { Question, StructuredQuestion, Worksheet } from '@/model/types';
import { contentKey } from './contentKey';
import { rowsOf } from './indexer';
import { identicalCopies, questionSlots, restoreCopies, SKIP_REASON, writeIntoCopies, writesForCopy } from './sameCopies';
import { choiceQuestion, docWith, partedQuestion } from './testKit';

const NOW = '2026-09-30T10:00:00.000Z';

function memoryStore(docs: Worksheet[], trashed: string[] = []) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  const writes: string[] = [];
  return {
    saved,
    writes,
    list: async () => [...saved.keys()].filter((id) => !trashed.includes(id)).map((id) => ({ id, title: id, updatedAt: '' })),
    load: async (id: string) => saved.get(id),
    save: async (worksheet: Worksheet) => {
      writes.push(worksheet.id);
      saved.set(worksheet.id, worksheet);
    },
  };
}

/** Fill every 中文 gap of `question` in `doc` with "譯：<English>". */
function fillWrites(doc: Worksheet, questionId: string): TranslationWrite[] {
  return questionSlots(doc, questionId)
    .filter((slot) => plain(slot.text.zh) === '' && plain(slot.text.en) !== '')
    .map((slot) => ({ path: slot.path, side: 'zh', sourceSnapshot: slot.text.en, targetSnapshot: slot.text.zh, next: [{ text: `譯：${plain(slot.text.en)}` }] }));
}

const zhOf = (question: Question | undefined): string => {
  const block = question?.blocks[0];
  return block?.kind === 'paragraph' ? plain(block.text.zh) : '';
};

/** One English question copied into three papers, the third copy edited. */
function scene() {
  const original = choiceQuestion('Which is a free good?', '', ['A.scarcity']);
  const a = docWith([original], { id: 'a' } as Partial<Worksheet>);
  const b = docWith([copyQuestion(original, 'a')], { id: 'b' } as Partial<Worksheet>);
  const edited = copyQuestion(original, 'a');
  edited.blocks = [{ ...edited.blocks[0], text: { en: [{ text: 'Which is a free good? Explain.' }], zh: [] } } as Question['blocks'][number]];
  const c = docWith([edited], { id: 'c' } as Partial<Worksheet>);
  const rows = [a, b, c].flatMap((doc) => rowsOf(doc));
  return { original, a, b, c, rows, shown: rows[0] };
}

describe('identicalCopies', () => {
  it('lists every copy of the same question saying the same thing, the shown one first', () => {
    const { a, b, rows, shown } = scene();
    expect(identicalCopies(rows, shown)).toEqual([
      { docId: a.id, questionId: a.questions[0].id },
      { docId: b.id, questionId: b.questions[0].id },
    ]);
  });

  it('leaves out another question with the same words, and never lists a copy twice', () => {
    const { rows, shown } = scene();
    const lookalike = choiceQuestion('Which is a free good?');
    const other = rowsOf(docWith([lookalike], { id: 'd' } as Partial<Worksheet>));
    expect(other[0].contentKey).toBe(shown.contentKey); // same words, but not a copy
    expect(identicalCopies([...rows, ...other, ...rows], shown)).toHaveLength(2);
  });
});

describe('writesForCopy', () => {
  it('re-aims writes at the same texts of a copy (fresh ids, fresh paths)', () => {
    const { a, b } = scene();
    const writes = fillWrites(a, a.questions[0].id);
    const mapped = writesForCopy(questionSlots(a, a.questions[0].id), questionSlots(b, b.questions[0].id), writes)!;
    expect(mapped).toHaveLength(writes.length);
    expect(mapped.every((write) => write.path.startsWith(`q:${b.questions[0].id}/`))).toBe(true);
    expect(mapped.map((w) => w.next)).toEqual(writes.map((w) => w.next));
  });

  it('refuses a copy whose texts no longer line up', () => {
    const { a, c } = scene();
    const writes = fillWrites(a, a.questions[0].id);
    expect(writesForCopy(questionSlots(a, a.questions[0].id), questionSlots(c, c.questions[0].id), writes)).toBeNull();
  });
});

describe('writeIntoCopies and restoreCopies', () => {
  it('writes every identical copy, one save per document, and leaves an edited copy alone', async () => {
    const { a, b, c, rows, shown } = scene();
    const store = memoryStore([a, b, c]);
    const copies = identicalCopies(rows, rows[0]);
    const result = await writeIntoCopies(
      store,
      { sourceSlots: questionSlots(a, a.questions[0].id), writes: fillWrites(a, a.questions[0].id), copies, expectedKey: shown.contentKey },
      NOW,
    );
    expect(store.writes).toEqual(['a', 'b']);
    expect(result.skipped).toEqual([]);
    expect(result.written.map((r) => r.docId)).toEqual(['a', 'b']);
    const [qa] = store.saved.get('a')!.questions;
    const [qb] = store.saved.get('b')!.questions;
    expect(zhOf(qa)).toBe('譯：Which is a free good?');
    // Still one version: the copies agree after the write, as before it.
    expect(contentKey(qa)).toBe(contentKey(qb));
    expect(contentKey(qa)).not.toBe(shown.contentKey);
    expect(store.saved.get('a')!.updatedAt).toBe(NOW);
    expect(store.saved.get('c')).toBe(c);
    // Tags, stamp and lineage are not the write's business.
    expect(qb.tags).toEqual(b.questions[0].tags);
    expect(qb.lineage).toEqual(b.questions[0].lineage);
  });

  it('skips a copy changed underneath, and says so', async () => {
    const { a, b, rows, shown } = scene();
    const store = memoryStore([a, b]);
    const copies = identicalCopies(rows, shown);
    // Another tab edited b's copy after the bank read it.
    const q = b.questions[0] as Question & { blocks: Question['blocks'] };
    store.saved.set('b', { ...b, questions: [{ ...q, blocks: [{ ...q.blocks[0], text: { en: [{ text: 'Changed.' }], zh: [] } } as Question['blocks'][number]] } as Question] });
    const result = await writeIntoCopies(store, { sourceSlots: questionSlots(a, a.questions[0].id), writes: fillWrites(a, a.questions[0].id), copies, expectedKey: shown.contentKey }, NOW);
    expect(store.writes).toEqual(['a']);
    expect(result.skipped).toEqual([{ docId: 'b', questionId: b.questions[0].id, reason: SKIP_REASON.changed }]);
  });

  it('never writes a trashed, hidden or newer-build document', async () => {
    const { a, b, rows, shown } = scene();
    const hidden = docWith([copyQuestion(a.questions[0], 'a')], { id: 'h', bankHidden: true } as Partial<Worksheet>);
    const newer = docWith([copyQuestion(a.questions[0], 'a')], { id: 'n', schemaVersion: CURRENT_SCHEMA_VERSION + 1 } as Partial<Worksheet>);
    const store = memoryStore([a, b, hidden, newer], ['b']);
    const copies = [...identicalCopies(rows, shown), { docId: 'h', questionId: hidden.questions[0].id }, { docId: 'n', questionId: newer.questions[0].id }];
    const result = await writeIntoCopies(store, { sourceSlots: questionSlots(a, a.questions[0].id), writes: fillWrites(a, a.questions[0].id), copies, expectedKey: shown.contentKey }, NOW);
    expect(store.writes).toEqual(['a']);
    expect(result.skipped.map((s) => [s.docId, s.reason])).toEqual([
      ['b', SKIP_REASON.trash],
      ['h', SKIP_REASON.hidden],
      ['n', SKIP_REASON.newer],
    ]);
  });

  it('Undo all restores only the copies still holding what was written, keeping a later topic edit', async () => {
    const { a, b, rows, shown } = scene();
    const store = memoryStore([a, b]);
    const written = await writeIntoCopies(
      store,
      { sourceSlots: questionSlots(a, a.questions[0].id), writes: fillWrites(a, a.questions[0].id), copies: identicalCopies(rows, shown), expectedKey: shown.contentKey },
      NOW,
    );
    // a: someone re-tagged it (content untouched). b: someone edited the new 中文.
    const qa = store.saved.get('a')!.questions[0];
    store.saved.set('a', { ...store.saved.get('a')!, questions: [{ ...qa, tags: ['B'], tagsAt: NOW }] });
    const qb = store.saved.get('b')!.questions[0] as Question & { blocks: Question['blocks'] };
    const editedB = { ...qb, blocks: [{ ...qb.blocks[0], text: { en: qb.blocks[0].kind === 'paragraph' ? qb.blocks[0].text.en : [], zh: [{ text: '老師改過' }] } }] } as Question;
    store.saved.set('b', { ...store.saved.get('b')!, questions: [editedB] });
    store.writes.length = 0;

    const undone = await restoreCopies(store, written.written, NOW);
    expect(undone.restored).toEqual([{ docId: 'a', questionId: a.questions[0].id }]);
    expect(undone.skipped).toEqual([{ docId: 'b', questionId: b.questions[0].id, reason: SKIP_REASON.changed }]);
    expect(store.writes).toEqual(['a']);
    const back = store.saved.get('a')!.questions[0];
    expect(contentKey(back)).toBe(shown.contentKey);
    expect(back.tags).toEqual(['B']); // the topic edit made meanwhile stays
    expect(zhOf(store.saved.get('b')!.questions[0])).toBe('老師改過');
  });
});

describe('copies tagged per part', () => {
  it('are identical whatever their part topics and part roots, written together, and undone keeping a later part topic edit', async () => {
    const original = partedQuestion([{ tags: ['C.ped'] }, { subs: [['D'], undefined] }]);
    const a = docWith([original], { id: 'a' } as Partial<Worksheet>);
    const copy = copyQuestion(original, 'a');
    expect(copy.parts[0].rootId).toBe(original.parts[0].id);
    copy.parts[0].tags = ['C.pes']; // a stale copy's topics differ; its words do not
    const b = docWith([copy], { id: 'b' } as Partial<Worksheet>);
    const rows = [a, b].flatMap((doc) => rowsOf(doc));
    expect(rows[1].contentKey).toBe(rows[0].contentKey);
    const copies = identicalCopies(rows, rows[0]);
    expect(copies.map((ref) => ref.docId)).toEqual(['a', 'b']);

    const store = memoryStore([a, b]);
    const written = await writeIntoCopies(
      store,
      { sourceSlots: questionSlots(a, original.id), writes: fillWrites(a, original.id), copies, expectedKey: rows[0].contentKey },
      NOW,
    );
    expect(written.written.map((r) => r.docId)).toEqual(['a', 'b']);
    const qb = store.saved.get('b')!.questions[0] as StructuredQuestion;
    expect(qb.parts[0]).toMatchObject({ tags: ['C.pes'], rootId: original.parts[0].id });

    // A topic edit on b's (b)(i) after the write: Undo all still restores b and keeps it.
    const retagged = structuredClone(qb);
    retagged.parts[1].subParts![0].tags = ['E.equity'];
    store.saved.set('b', { ...store.saved.get('b')!, questions: [{ ...retagged, tagsAt: NOW }] });
    const undone = await restoreCopies(store, written.written, NOW);
    expect(undone.skipped).toEqual([]);
    const back = store.saved.get('b')!.questions[0] as StructuredQuestion;
    expect(contentKey(back)).toBe(rows[0].contentKey);
    expect(back.parts[1].subParts![0].tags).toEqual(['E.equity']);
    expect(back.parts[0]).toMatchObject({ tags: ['C.pes'], rootId: original.parts[0].id });
    expect(back.tagsAt).toBe(NOW);
  });
});
