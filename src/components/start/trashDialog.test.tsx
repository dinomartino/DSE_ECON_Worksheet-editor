/**
 * Moving a worksheet to Trash can keep its questions in the 題庫: the dialog asks only
 * when some are saved nowhere else, Keep is the default, and a failed keep leaves the
 * worksheet live.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { copyQuestion } from '@/model/lineage';
import type { Worksheet } from '@/model/types';
import { LocalStorageWorksheetStore } from '@/storage';
import type { WorksheetSummary } from '@/storage/types';
import { installLocalStorage } from '@/library/bankTestKit';
import { groupRows } from '@/library/group';
import { rowsOf } from '@/library/indexer';
import { questionsLeavingBank } from '@/library/leavingBank';
import { choiceQuestion, docWith } from '@/library/testKit';
import { KeepFailedError, TrashDialog, trashKeeping, type KeepChoice } from './TrashDialog';

const summary = { id: 'paper', title: 'Unit 3 quiz', updatedAt: '2026-10-01T00:00:00.000Z' };
const bankSummary = { id: 'bank', title: '題庫', updatedAt: '2026-10-01T00:00:00.000Z', kind: 'bank' as const };
const dialog = (leaving: number | undefined, choice: KeepChoice = 'keep', of: WorksheetSummary = summary) =>
  renderToStaticMarkup(
    <TrashDialog summary={of} days={30} leaving={leaving} choice={choice} onChoice={() => {}} onClose={() => {}} onConfirm={() => {}} />,
  );
const radios = (markup: string) => [...markup.matchAll(/<input type="radio"[^>]*>/g)].map((m) => m[0]);

describe('the Move to Trash dialog', () => {
  it('offers to keep questions saved nowhere else, Keep chosen', () => {
    const markup = dialog(8);
    expect(markup).toContain('8 questions in this worksheet are not saved anywhere else.');
    expect(markup).toContain('Keep its 8 questions in the 題庫');
    expect(markup).toContain('Move them to Trash with the worksheet');
    const [keep, trash] = radios(markup);
    expect(keep).toMatch(/checked/);
    expect(trash).not.toMatch(/checked/);
    expect(markup).toContain('role="radiogroup"');
    expect(markup).not.toContain('in this bank');
  });

  it('is today’s dialog when nothing would leave the 題庫', () => {
    const markup = dialog(0);
    expect(radios(markup)).toEqual([]);
    expect(markup).toContain('You can restore it from the Trash for 30 days.');
    expect(markup).not.toMatch(/<button[^>]* disabled=""[^>]*>Move to Trash/);
  });

  it('waits to move while it works out what would leave', () => {
    expect(dialog(undefined)).toMatch(/<button[^>]* disabled=""[^>]*>Move to Trash/);
    expect(radios(dialog(undefined))).toEqual([]);
  });

  it('says one question in the singular', () => {
    const markup = dialog(1);
    expect(markup).toContain('1 question in this worksheet is not saved anywhere else.');
    expect(markup).toContain('Keep the question in the 題庫');
    expect(markup).toContain('Move it to Trash with the worksheet');
  });
});

describe('the Move to Trash dialog for a bank', () => {
  it('warns how many questions leave the 題庫, with nothing to choose', () => {
    const markup = dialog(12, 'keep', bankSummary);
    expect(markup).toContain('12 questions in this bank are not saved anywhere else. They will leave the 題庫 until you restore it.');
    expect(radios(markup)).toEqual([]);
    expect(markup).not.toContain('role="radiogroup"');
    expect(markup).not.toContain('Keep');
    expect(markup).toMatch(/<button[^>]*>Move to Trash/);
    expect(markup).not.toMatch(/<button[^>]* disabled=""[^>]*>Move to Trash/);
  });

  it('says one question in the singular', () => {
    expect(dialog(1, 'keep', bankSummary)).toContain(
      '1 question in this bank is not saved anywhere else. It will leave the 題庫 until you restore it.',
    );
  });

  it('is today’s dialog when every question lives elsewhere', () => {
    const markup = dialog(0, 'keep', bankSummary);
    expect(markup).not.toContain('not saved anywhere else');
    expect(radios(markup)).toEqual([]);
    expect(markup).toContain('You can restore it from the Trash for 30 days.');
  });

  it('waits to move while it counts', () => {
    expect(dialog(undefined, 'keep', bankSummary)).toMatch(/<button[^>]* disabled=""[^>]*>Move to Trash/);
  });
});

describe('trashKeeping', () => {
  let store: LocalStorageWorksheetStore;
  beforeEach(() => {
    installLocalStorage();
    store = new LocalStorageWorksheetStore();
  });

  const a = choiceQuestion('Opportunity cost');
  const b = choiceQuestion('Division of labour');
  const live = async () => (await store.list()).map((row) => row.id).sort();

  it('Keep: copies into the one bank first, then trashes the worksheet', async () => {
    await store.save(docWith([a, b], { id: 'paper' }));
    await store.save(docWith([copyQuestion(a, 'paper')], { id: 'other' }));
    const leaving = await questionsLeavingBank('paper', store);
    expect(leaving.map((q) => q.id)).toEqual([b.id]);

    expect(await trashKeeping(store, 'paper', leaving)).toBe(1);
    const ids = await live();
    expect(ids).not.toContain('paper');
    const bankId = ids.find((id) => id !== 'other')!;
    const bank = (await store.load(bankId))!;
    expect(bank.kind).toBe('bank');
    expect(bank.questions.map((q) => q.lineage?.rootId)).toEqual([b.id]);
    expect((await store.listTrash()).map((row) => row.id)).toEqual(['paper']);
    // Nothing more would leave now.
    expect(await questionsLeavingBank('other', store)).toHaveLength(1);
  });

  it('Keep goes into the most recent bank there is', async () => {
    await store.save(docWith([a], { id: 'paper' }));
    await store.save(docWith([], { id: 'old-bank', kind: 'bank', updatedAt: '2026-01-01T00:00:00.000Z' }));
    await store.save(docWith([], { id: 'new-bank', kind: 'bank', updatedAt: '2026-10-01T00:00:00.000Z' }));
    await trashKeeping(store, 'paper', [a]);
    expect((await store.load('new-bank'))!.questions).toHaveLength(1);
    expect((await store.load('old-bank'))!.questions).toHaveLength(0);
  });

  it('Move them to Trash: exactly the plain move, no bank written', async () => {
    await store.save(docWith([a, b], { id: 'paper' }));
    expect(await trashKeeping(store, 'paper', [])).toBe(0);
    expect(await live()).toEqual([]);
  });

  it('a failed keep leaves the worksheet live', async () => {
    await store.save(docWith([a], { id: 'paper' }));
    const failing = Object.assign(Object.create(store) as LocalStorageWorksheetStore, {
      save: async () => {
        throw new Error('disk full');
      },
    });
    await expect(trashKeeping(failing, 'paper', [a])).rejects.toBeInstanceOf(KeepFailedError);
    expect(await live()).toEqual(['paper']);
    expect(await store.listTrash()).toEqual([]);
  });

  it('restoring the worksheet later shows each question once in the 題庫', async () => {
    await store.save(docWith([a, b], { id: 'paper' }));
    await trashKeeping(store, 'paper', await questionsLeavingBank('paper', store));
    expect(await store.restore('paper')).toBe('paper');
    const docs = (await Promise.all((await store.list()).map((row) => store.load(row.id)))) as Worksheet[];
    const groups = groupRows(docs.flatMap((doc) => rowsOf(doc)));
    expect(groups.map((group) => group.rootId).sort()).toEqual([a.id, b.id].sort());
    expect(groups.map((group) => [group.rows.length, group.versions])).toEqual([
      [2, 1],
      [2, 1],
    ]);
  });
});
