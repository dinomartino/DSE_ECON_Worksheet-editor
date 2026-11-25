import { beforeEach, describe, expect, it } from 'vitest';
import { useBankSession } from '@/components/bank/bankSession';
import { copyToBank } from '@/library/bankDocs';
import { contentKey } from '@/library/contentKey';
import { rowsOf } from '@/library/indexer';
import { questionsOnlyIn } from '@/library/leavingBank';
import { adaptedFrom, isUnchangedPastPaperCopy, pastPaperOriginOf, showsInBank } from '@/library/pastPaperCopies';
import { createMcqQuestion } from '@/model/factories';
import { copyQuestion, rootIdOf } from '@/model/lineage';
import { migrate } from '@/model/migrations';
import { bi } from '@/model/text';
import type { McqQuestion, Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { copyIntoMyBank, emptyPaperFor, insertIntoOpen } from './actions';
import { cleanUpOldCopies, findOldCopies, nudged, recordOldCopies, scanOldCopies, topicsFor, type BankReader } from './oldCopies';
import { sourceOf, type PastPaperItem } from './pack';

/**
 * A past-paper question copied into a paper is not the teacher's question until they change
 * it (k-0559, user u-rkoi): the 題庫 leaves an unchanged copy out, shows an edited one as
 * their own (adapted from its source), and copies made before this build can be found and
 * taken out without changing a paper.
 */

function pastMcq(tag: string): McqQuestion {
  const question = createMcqQuestion();
  question.id = `pp-${tag.replaceAll('/', '_')}`;
  question.blocks = [{ kind: 'paragraph', id: `${question.id}-stem`, text: bi(`Stem ${tag}`, `題幹 ${tag}`) }];
  question.options = ['w', 'x', 'y', 'z'].map((text, index) => ({ id: `${question.id}-${index}`, text: bi(text, text) }));
  question.answerIndex = 1;
  question.tags = ['C.ped', tag];
  question.provenance = bi(`HKDSE ${tag}`, `香港中學文憑 ${tag}`);
  question.lineage = { rootId: `pp:${tag}` };
  return question;
}

const item = (question: McqQuestion): PastPaperItem => ({
  topicId: 'elasticity',
  docId: 'pp-bank-elasticity',
  question,
  source: sourceOf(question),
  provenance: { en: String(question.tags?.[1]), zh: String(question.tags?.[1]) },
  excerpt: { en: '', zh: '' },
  searchText: '',
});

const Q38 = pastMcq('DSE2024/P1/Q38');
const Q5 = pastMcq('DSE2023/P1/Q5');

function memoryStore(docs: Worksheet[] = []) {
  const map = new Map(docs.map((doc) => [doc.id, structuredClone(doc)]));
  const store = {
    list: async () => [...map.values()].map((d) => ({ id: d.id, title: d.name ?? 'Paper', updatedAt: d.updatedAt, kind: d.kind })),
    load: async (id: string) => structuredClone(map.get(id)),
    save: async (w: Worksheet) => void map.set(w.id, structuredClone(w)),
  } as unknown as WorksheetStore;
  return { map, store };
}

const open = () => useWorksheetStore.getState().worksheet;
const bankRows = (doc: Worksheet) => rowsOf(doc).map((row) => row.questionId);

/** What an earlier build's insert made: the same copy, with no recorded origin. */
const oldCopy = (question: Question): Question => {
  const copy = copyQuestion(question, 'pp-bank-elasticity');
  const { pastPaper: _drop, ...lineage } = copy.lineage as NonNullable<Question['lineage']>;
  void _drop;
  return { ...copy, lineage };
};

beforeEach(() => {
  useWorksheetStore.getState().replaceWorksheet(emptyPaperFor('classroom', 'Elasticity'));
  useBankSession.setState({ review: null });
});

describe('a past-paper copy in a paper', () => {
  it('records its source tag and what it said, and stays out of the 題庫 while unchanged', () => {
    insertIntoOpen([item(Q38), item(Q5)], (n) => `${n} added`);
    const paper = open();
    expect(paper.questions).toHaveLength(2);
    const [first] = paper.questions;
    expect(pastPaperOriginOf(first)).toEqual({ tag: 'DSE2024/P1/Q38', key: contentKey(Q38) });
    expect(rootIdOf(first)).toBe('pp:DSE2024/P1/Q38');
    expect(first.lineage?.fromDocId).toBe('pp-bank-elasticity');
    expect(isUnchangedPastPaperCopy(first)).toBe(true);
    expect(bankRows(paper)).toEqual([]);
  });

  it('survives a save and a reload unchanged', () => {
    insertIntoOpen([item(Q38)], (n) => `${n} added`);
    const reopened = migrate(JSON.parse(JSON.stringify(open())));
    expect(isUnchangedPastPaperCopy(reopened.questions[0])).toBe(true);
    expect(bankRows(reopened)).toEqual([]);
  });

  it('is still the past paper after its topics, gap, page breaks, number or Show source change', () => {
    insertIntoOpen([item(Q5), item(Q38)], (n) => `${n} added`);
    const [a, b] = open().questions;
    const store = useWorksheetStore.getState();
    store.updateQuestion(a.id, { tags: ['C.ped', 'my-own-tag'], tagsAt: new Date().toISOString(), gapBefore: 400, keepOnOnePage: true });
    store.updateWorksheet({ showQuestionSources: true, questionSourceFormat: 'short' });
    const reordered = { ...open(), flow: [...open().flow].reverse() };
    expect(bankRows(reordered)).toEqual([]);
    expect(isUnchangedPastPaperCopy(open().questions.find((q) => q.id === b.id)!)).toBe(true);
  });

  it('joins the 題庫 as the teacher’s own once edited, adapted from its source', () => {
    insertIntoOpen([item(Q38), item(Q5)], (n) => `${n} added`);
    const [first, second] = open().questions;
    useWorksheetStore.getState().updateQuestion(first.id, {
      blocks: [{ kind: 'paragraph', id: 'new-stem', text: bi('My own stem', '我的題幹') }],
    } as Partial<Question>);
    const edited = open().questions[0];
    expect(isUnchangedPastPaperCopy(edited)).toBe(false);
    expect(adaptedFrom(edited)).toBe('DSE2024/P1/Q38');
    expect((edited as McqQuestion).provenance).toEqual(Q38.provenance);
    expect(bankRows(open())).toEqual([first.id]);
    // The answer, an option, a picture: any change to what it says counts.
    useWorksheetStore.getState().updateQuestion(second.id, { answerIndex: 2 } as Partial<Question>);
    expect(bankRows(open())).toEqual([first.id, second.id]);
  });

  it('leaves the 題庫 again when the edit is undone back to the exact words', () => {
    insertIntoOpen([item(Q38)], (n) => `${n} added`);
    const id = open().questions[0].id;
    useWorksheetStore.getState().updateQuestion(id, { answerIndex: 3 } as Partial<Question>);
    expect(bankRows(open())).toEqual([id]);
    useWorksheetStore.getState().undo();
    expect(bankRows(open())).toEqual([]);
  });

  it('keeps its record through a further copy, so an unchanged copy of a copy is still the past paper', () => {
    insertIntoOpen([item(Q38)], (n) => `${n} added`);
    const again = copyQuestion(open().questions[0], open().id);
    expect(pastPaperOriginOf(again)?.tag).toBe('DSE2024/P1/Q38');
    expect(isUnchangedPastPaperCopy(again)).toBe(true);
  });

  it('is shown in a bank document: Copy to bank and Copy to my question bank still put it in the 題庫', async () => {
    insertIntoOpen([item(Q38)], (n) => `${n} added`);
    const { map, store } = memoryStore();
    const done = await copyToBank([open().questions[0]], open().id, {}, { store, openDocId: open().id });
    expect(done.copied).toBe(1);
    expect(bankRows(done.bank)).toEqual([done.bank.questions[0].id]);
    expect(showsInBank(done.bank.questions[0], done.bank)).toBe(true);

    map.clear();
    const mine = await copyIntoMyBank([item(Q5)], { store });
    expect(mine.copied).toBe(1);
    const bank = [...map.values()][0];
    expect(bank.kind).toBe('bank');
    expect(bankRows(bank)).toHaveLength(1);
  });

  it('takes nothing out of the 題庫 when its paper goes to Trash, and holds nothing for another', () => {
    insertIntoOpen([item(Q38), item(Q5)], (n) => `${n} added`);
    const paper = open();
    const id = paper.questions[0].id;
    expect(questionsOnlyIn(paper, [])).toEqual([]);
    useWorksheetStore.getState().updateQuestion(id, { answerIndex: 0 } as Partial<Question>);
    expect(questionsOnlyIn(open(), []).map((q) => q.id)).toEqual([id]);
    // A paper holding the edited words keeps them; an unchanged copy elsewhere keeps nothing.
    const other = { ...open(), id: 'other', questions: [copyQuestion(open().questions[0], open().id)] };
    expect(questionsOnlyIn(open(), [other])).toEqual([]);
    const plain = { ...paper, id: 'plain', questions: [oldCopy(Q5)] };
    expect(questionsOnlyIn(plain, [paper]).map((q) => q.id)).toEqual([plain.questions[0].id]);
  });

  it('a question with no record (any other question) is shown as before', () => {
    const own = createMcqQuestion();
    expect(isUnchangedPastPaperCopy(own)).toBe(false);
    expect(adaptedFrom(own)).toBeUndefined();
    expect(pastPaperOriginOf({ lineage: { rootId: 'x', pastPaper: 'odd' } as never })).toBeUndefined();
  });
});

describe('copies made before this build', () => {
  const paperOf = (id: string, questions: Question[], updatedAt = '2026-10-01T08:00:00.000Z'): Worksheet => ({
    ...emptyPaperFor('classroom', id),
    id,
    name: id,
    questions,
    flow: questions.map((q) => ({ type: 'question' as const, id: q.id })),
    updatedAt,
  });
  const bankByRoot = new Map<string, Question>([
    [rootIdOf(Q38), Q38],
    [rootIdOf(Q5), Q5],
  ]);

  it('finds unchanged copies, and leaves edited ones, ones the bank no longer has, and banks', () => {
    const unchanged = oldCopy(Q38);
    const edited = { ...oldCopy(Q5), answerIndex: 3 } as Question;
    const gone = oldCopy(pastMcq('CE1999/P2/Q1'));
    const own = createMcqQuestion();
    const paper = paperOf('p1', [own, unchanged, edited, gone]);
    const bank = { ...paperOf('bank', [oldCopy(Q5)]), kind: 'bank' as const };
    const scan = findOldCopies([paper, bank], bankByRoot);
    expect(scan.copies).toEqual([{ docId: 'p1', docTitle: expect.any(String), questionId: unchanged.id, number: 2, tag: 'DSE2024/P1/Q38', key: contentKey(Q38) }]);
    expect(scan.changed).toBe(1);
    expect(scan.notInBank).toBe(1);
    expect(bankRows(paper)).toHaveLength(4);
    const recorded = recordOldCopies(paper, scan.copies);
    expect(bankRows(recorded)).toEqual([own.id, edited.id, gone.id]);
    expect(recordOldCopies(recorded, scan.copies)).toBe(recorded);
  });

  it('reads only the bank topics the papers name', () => {
    const manifest = {
      topics: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never,
      search: [
        { topicId: 'a', source: sourceOf(Q38) },
        { topicId: 'c', source: sourceOf(Q5) },
      ] as never,
    };
    expect(topicsFor([oldCopy(Q38)], manifest)).toEqual(['a']);
    expect(topicsFor([oldCopy(Q38)], { topics: manifest.topics })).toEqual(['a', 'b', 'c']);
  });

  it('cleans up: one save per paper, nothing printed changes, the open paper adopts it too', async () => {
    const p1 = paperOf('p1', [oldCopy(Q38), oldCopy(Q5)]);
    const p2 = paperOf('p2', [oldCopy(Q5)], '2026-10-02T08:00:00.000Z');
    const { map, store } = memoryStore([p1, p2]);
    const reader: BankReader = {
      manifest: async () => ({ topics: [{ id: 'elasticity' }] as never }),
      topic: async () => [Q38, Q5],
    };
    const outcome = await scanOldCopies(store, reader);
    expect(outcome.ok && outcome.scan.copies.map((c) => `${c.docId} ${c.tag}`)).toEqual(['p2 DSE2023/P1/Q5', 'p1 DSE2024/P1/Q38', 'p1 DSE2023/P1/Q5']);
    if (!outcome.ok) throw new Error('scan failed');

    useWorksheetStore.getState().replaceWorksheet(structuredClone(p1));
    // Typed in the open paper before the clean-up: an edited copy is no longer the past paper's.
    useWorksheetStore.getState().updateQuestion(p1.questions[1].id, { answerIndex: 0 } as Partial<Question>);
    const done = await cleanUpOldCopies(outcome.scan.copies, store, { id: 'p1', adopt: useWorksheetStore.getState().adoptSavedElsewhere });
    expect(done).toEqual({ recorded: 3, skipped: 0 });
    for (const doc of map.values()) expect(bankRows(doc)).toEqual([]);
    expect(map.get('p1')!.updatedAt).toBe(nudged(p1.updatedAt));
    expect(map.get('p1')!.questions.map(contentKey)).toEqual(p1.questions.map(contentKey));
    // The open paper: the unchanged copy recorded in memory, the edited one left to the 題庫.
    expect(bankRows(open())).toEqual([p1.questions[1].id]);
    expect(isUnchangedPastPaperCopy(open().questions[0])).toBe(true);

    const again = await scanOldCopies(store, reader);
    expect(again.ok && again.scan.copies).toEqual([]);
  });

  it('skips a copy changed since it was found', async () => {
    const p1 = paperOf('p1', [oldCopy(Q38)]);
    const { map, store } = memoryStore([p1]);
    const [found] = findOldCopies([p1], bankByRoot).copies;
    map.set('p1', { ...p1, questions: [{ ...p1.questions[0], answerIndex: 0 } as Question] });
    expect(await cleanUpOldCopies([found], store)).toEqual({ recorded: 0, skipped: 1 });
    expect(map.get('p1')!.updatedAt).toBe(p1.updatedAt);
  });

  it('says why when the bank is off or cannot be read, and needs no bank when nothing could be a copy', async () => {
    const { store } = memoryStore([paperOf('p1', [oldCopy(Q38)])]);
    expect(await scanOldCopies(store, { manifest: async () => 'off', topic: async () => [] })).toEqual({ ok: false, reason: 'bankOff' });
    expect(await scanOldCopies(store, { manifest: async () => undefined, topic: async () => [] })).toEqual({ ok: false, reason: 'bankUnavailable' });
    expect(await scanOldCopies(store, { manifest: async () => ({ topics: [{ id: 'a' }] as never }), topic: async () => undefined })).toEqual({ ok: false, reason: 'bankUnavailable' });
    const empty = memoryStore([paperOf('p1', [createMcqQuestion()])]);
    expect(await scanOldCopies(empty.store, { manifest: async () => 'off', topic: async () => [] })).toEqual({ ok: true, scan: { copies: [], changed: 0, notInBank: 0 }, papers: 1 });
  });
});
