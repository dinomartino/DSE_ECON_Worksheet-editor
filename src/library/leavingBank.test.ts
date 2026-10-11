import { beforeEach, describe, expect, it } from 'vitest';
import { createParagraphBlock } from '@/model/factories';
import { copyQuestion } from '@/model/lineage';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { LocalStorageWorksheetStore } from '@/storage';
import { installLocalStorage } from './bankTestKit';
import { rowsOf } from './indexer';
import { questionsLeavingBank, questionsOnlyIn } from './leavingBank';
import { choiceQuestion, docWith } from './testKit';

const edit = (q: Question, en: string): Question => ({ ...q, blocks: [createParagraphBlock(bi(en, ''))] }) as Question;
const ids = (questions: readonly Question[]) => questions.map((q) => q.id);

describe('questionsOnlyIn: what the 題庫 loses with a paper', () => {
  const a = choiceQuestion('Price ceiling');
  const b = choiceQuestion('Price floor');
  const paper = docWith([a, b], { id: 'paper' });

  it('counts every question no other document holds', () => {
    expect(ids(questionsOnlyIn(paper, []))).toEqual([a.id, b.id]);
  });

  it('does not count a question another paper or a bank holds a copy of', () => {
    const other = docWith([copyQuestion(a, 'paper')], { id: 'other' });
    expect(ids(questionsOnlyIn(paper, [other]))).toEqual([b.id]);
    const bank = docWith([copyQuestion(b, 'paper')], { id: 'bank', kind: 'bank' });
    expect(ids(questionsOnlyIn(paper, [other, bank]))).toEqual([]);
  });

  it('counts a question another document holds only an edited version of: these words would be lost', () => {
    const other = docWith([edit(copyQuestion(a, 'paper'), 'Price ceiling, reworded')], { id: 'other' });
    expect(ids(questionsOnlyIn(paper, [other]))).toEqual([a.id, b.id]);
  });

  it('does not count a question another document says word for word under another root', () => {
    const other = docWith([choiceQuestion('Price ceiling')], { id: 'other' });
    expect(ids(questionsOnlyIn(paper, [other]))).toEqual([b.id]);
  });

  it('ignores hidden, newer-build and unknown-kind documents, and the paper itself', () => {
    const holds = [copyQuestion(a, 'paper'), copyQuestion(b, 'paper')];
    const hidden = docWith(holds, { id: 'hidden', bankHidden: true });
    const newer = docWith(holds, { id: 'newer', schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const notes = { ...docWith(holds, { id: 'notes' }), kind: 'notes' } as unknown as Worksheet;
    expect(ids(questionsOnlyIn(paper, [hidden, newer, notes, paper]))).toEqual([a.id, b.id]);
  });

  it('counts two identical questions in the paper once', () => {
    const twice = docWith([a, copyQuestion(a, 'paper')], { id: 'twice' });
    expect(ids(questionsOnlyIn(twice, []))).toEqual([a.id]);
  });
});

describe('questionsLeavingBank: read from the store', () => {
  let store: LocalStorageWorksheetStore;
  beforeEach(() => {
    installLocalStorage();
    store = new LocalStorageWorksheetStore();
  });

  const a = choiceQuestion('Opportunity cost');
  const b = choiceQuestion('Division of labour');

  it('ignores a trashed document that holds a copy', async () => {
    await store.save(docWith([a, b], { id: 'paper' }));
    await store.save(docWith([copyQuestion(a, 'paper')], { id: 'old' }));
    expect(ids(await questionsLeavingBank('paper', store))).toEqual([b.id]);
    await store.trash('old');
    expect(ids(await questionsLeavingBank('paper', store))).toEqual([a.id, b.id]);
  });

  it('asks nothing of a hidden document or a newer build’s', async () => {
    await store.save(docWith([a], { id: 'bank', kind: 'bank' }));
    await store.save(docWith([a], { id: 'hidden', bankHidden: true }));
    await store.save(docWith([a], { id: 'hidden-bank', kind: 'bank', bankHidden: true }));
    await store.save(docWith([a], { id: 'newer', schemaVersion: CURRENT_SCHEMA_VERSION + 1 }));
    await store.save(docWith([a], { id: 'plain' }));
    expect(ids(await questionsLeavingBank('plain', store))).toEqual([]);
    await store.trash('bank');
    expect(ids(await questionsLeavingBank('plain', store))).toEqual([a.id]);
    expect(await questionsLeavingBank('newer', store)).toEqual([]);
    expect(await questionsLeavingBank('hidden', store)).toEqual([]);
    expect(await questionsLeavingBank('hidden-bank', store)).toEqual([]);
    expect(await questionsLeavingBank('missing', store)).toEqual([]);
  });

  it('counts a bank’s questions no paper or other bank holds; the bank itself is no holder', async () => {
    const c = choiceQuestion('Economies of scale');
    const bank = docWith([a, b, c], { id: 'bank', kind: 'bank' });
    await store.save(bank);
    expect(ids(await questionsLeavingBank('bank', store))).toEqual([a.id, b.id, c.id]);
    await store.save(docWith([copyQuestion(a, 'bank')], { id: 'paper' }));
    await store.save(docWith([copyQuestion(b, 'bank')], { id: 'other-bank', kind: 'bank' }));
    expect(ids(await questionsLeavingBank('bank', store))).toEqual([c.id]);
    expect(ids(await questionsLeavingBank('bank', store, [...rowsOf(bank), ...rowsOf((await store.load('paper'))!)]))).toEqual([b.id, c.id]);
  });

  it('counts nothing for a bank whose questions all live elsewhere', async () => {
    await store.save(docWith([a, b], { id: 'bank', kind: 'bank' }));
    await store.save(docWith([copyQuestion(a, 'bank'), copyQuestion(b, 'bank')], { id: 'paper' }));
    expect(await questionsLeavingBank('bank', store)).toEqual([]);
  });

  it('narrows to the documents the index names, and still checks each one', async () => {
    const paper = docWith([a, b], { id: 'paper' });
    const other = docWith([copyQuestion(a, 'paper')], { id: 'other' });
    await store.save(paper);
    await store.save(other);
    const rows = [...rowsOf(paper), ...rowsOf(other)];
    expect(ids(await questionsLeavingBank('paper', store, rows))).toEqual([b.id]);
    // A stale row: `other` no longer says it. Loaded and checked, so `a` counts.
    await store.save({ ...other, questions: [edit(other.questions[0], 'Changed since')] });
    expect(ids(await questionsLeavingBank('paper', store, rows))).toEqual([a.id, b.id]);
    // An index that misses a holder only makes a question count, never hides one.
    expect(ids(await questionsLeavingBank('paper', store, []))).toEqual([a.id, b.id]);
  });
});
