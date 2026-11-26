import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import { worksheetClipboardHtml } from '@/export/clipboard';
import { exportDocxBuffer } from '@/export/docx';
import { renderWorksheet } from '@/render/worksheet';
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
import type { McqQuestion, OutputMode, Question, Worksheet } from '@/model/types';
import type { WorksheetStore } from '@/storage/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { copyIntoMyBank, emptyPaperFor, insertIntoOpen } from './actions';
import { sourceOf, type PastPaperItem } from './pack';

/**
 * A past-paper question copied into a paper is not the teacher's question until they change
 * it (k-0559, user u-rkoi): the 題庫 leaves an unchanged copy out, shows an edited one as
 * their own (adapted from its source, shown on its 題庫 row only).
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

describe('"Adapted from" on the 題庫 row (k-0559, u-sqrx)', () => {
  const editStem = (id: string) =>
    useWorksheetStore.getState().updateQuestion(id, { blocks: [{ kind: 'paragraph', id: 'new-stem', text: bi('My own stem', '我的題幹') }] } as Partial<Question>);

  it('an edited copy’s row names its source; an unchanged one, in a bank document, does not', async () => {
    insertIntoOpen([item(Q38), item(Q5)], (n) => `${n} added`);
    const [first] = open().questions;
    editStem(first.id);
    expect(rowsOf(open()).map((row) => [row.questionId, row.adaptedFrom])).toEqual([[first.id, 'DSE2024/P1/Q38']]);
    // Copy to bank keeps the record: the edited one still says where it came from, the unchanged one nothing.
    const { store } = memoryStore();
    const done = await copyToBank(open().questions, open().id, {}, { store, openDocId: open().id });
    expect(rowsOf(done.bank).map((row) => row.adaptedFrom)).toEqual(['DSE2024/P1/Q38', undefined]);
    expect('adaptedFrom' in rowsOf(done.bank)[1]).toBe(false);
  });

  it('goes again when the edit is undone back to the exact words (the row leaves with it)', () => {
    insertIntoOpen([item(Q38)], (n) => `${n} added`);
    editStem(open().questions[0].id);
    expect(rowsOf(open())[0].adaptedFrom).toBe('DSE2024/P1/Q38');
    useWorksheetStore.getState().undo();
    expect(rowsOf(open())).toEqual([]);
  });

  it('never reaches the page, the .docx or the clipboard: the paper prints as if it had no record', async () => {
    insertIntoOpen([item(Q38)], (n) => `${n} added`);
    editStem(open().questions[0].id);
    const adapted = open();
    const unrecorded = (question: Question): Question => {
      const { pastPaper: _drop, ...lineage } = question.lineage as NonNullable<Question['lineage']>;
      void _drop;
      return { ...question, lineage };
    };
    const stripped: Worksheet = { ...adapted, questions: adapted.questions.map(unrecorded) };
    expect(rowsOf(stripped)[0].adaptedFrom).toBeUndefined();
    const modes: OutputMode[] = [
      { language: 'bilingual', version: 'teacher' },
      { language: 'en', version: 'student' },
      { language: 'zh', version: 'student' },
    ];
    for (const showQuestionSources of [false, true]) {
      const [a, b] = [adapted, stripped].map((doc) => ({ ...doc, showQuestionSources }));
      for (const mode of modes) {
        const ir = JSON.stringify(renderWorksheet(a, mode));
        expect(ir).toBe(JSON.stringify(renderWorksheet(b, mode)));
        const html = worksheetClipboardHtml(a, mode);
        expect(html).toBe(worksheetClipboardHtml(b, mode));
        const xml = async (doc: Worksheet) => (await JSZip.loadAsync(await exportDocxBuffer(doc, mode))).file('word/document.xml')!.async('string');
        const docx = await xml(a);
        expect(docx).toBe(await xml(b));
        for (const out of [ir, html, docx]) {
          expect(out).not.toMatch(/Adapted from|改編自/);
          // The tag itself prints only as the question's own source: Show source, or the key's Source line.
          if (!showQuestionSources && mode.version === 'student') expect(out).not.toContain('DSE2024/P1/Q38');
        }
      }
    }
  });
});
