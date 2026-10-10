import { beforeEach, describe, expect, it } from 'vitest';
import type { Question, Worksheet } from '@/model/types';
import { LocalStorageWorksheetStore } from '@/storage';
import { withChangeFeed } from '@/storage/changes';
import { addedRoots, addToBank, createBank } from '@/library/bankDocs';
import { createBankIndex, type BankIndex } from '@/library/bankIndex';
import { createMemoryBackend } from '@/library/bankBackend';
import { installLocalStorage, localFeed } from '@/library/bankTestKit';
import { groupRows } from '@/library/group';
import { choiceQuestion, docWith } from '@/library/testKit';
import { DEFAULT_FILTERS, filterRows } from './bankPage';
import { firstThese, tagLanding } from './bankReturn';

/**
 * 題庫 only (import): the bank opens on its Untagged questions at the first question the
 * import added, with the added ones listed first in the files' order, whatever else in
 * the library is untagged and however late the index takes the save in.
 */

const noPause = () => Promise.resolve();

function setup() {
  const feed = localFeed();
  const store = withChangeFeed(new LocalStorageWorksheetStore(), feed.emit);
  const index = createBankIndex(store, noPause, { backend: createMemoryBackend(), changes: feed.subscribe });
  return { store, index };
}

/** The tag-as-you-go list as the bank screen builds it. */
function untaggedRoots(index: BankIndex, first?: readonly string[]): string[] {
  const groups = groupRows(filterRows(index.getSnapshot().rows, { ...DEFAULT_FILTERS, topic: 'untagged' }));
  return firstThese(groups, first).map((group) => group.rootId);
}

const ids = (questions: Question[]) => questions.map((q) => q.id);

let library: { store: ReturnType<typeof setup>['store']; index: BankIndex; bank: Worksheet; other: Worksheet };

beforeEach(async () => {
  installLocalStorage();
  const { store, index } = setup();
  // A newer paper with untagged questions sorts ahead of the bank's: the arbitrary landing.
  const other = docWith([choiceQuestion('Elsewhere one'), choiceQuestion('Elsewhere two')], { createdAt: '2026-09-01T00:00:00.000Z' });
  const bank = { ...createBank('Macro'), questions: [choiceQuestion('Already in the bank')], createdAt: '2026-01-01T00:00:00.000Z' };
  bank.flow = bank.questions.map((q) => ({ type: 'question' as const, id: q.id }));
  await store.save(other);
  await store.save(bank);
  await index.refresh();
  await index.settled();
  library = { store, index, bank, other };
});

describe('題庫 only lands on the first question added', () => {
  it('several files into a bank that already has untagged questions: first added selected, added ones first', async () => {
    const { store, index, bank } = library;
    const fileA = [choiceQuestion('File A first'), choiceQuestion('File A second')];
    const fileB = [choiceQuestion('File B first'), choiceQuestion('File A first'), choiceQuestion('Already in the bank')];
    const questions = [...fileA, ...fileB];
    const before = untaggedRoots(index);

    const { copied, already } = await addToBank(questions, bank.id, { store, openDocId: '' });
    const roots = addedRoots(questions, already);
    expect(copied).toBe(3);
    expect(roots).toEqual([...ids(fileA), fileB[0].id]);

    // The list read before the index takes the save in does not hold it: wait, never land elsewhere.
    expect(tagLanding(firstThese(before.map((rootId) => ({ rootId })), roots).map((g) => g.rootId), roots[0], false)).toBeUndefined();

    await index.flush();
    const plain = untaggedRoots(index);
    expect(plain[0]).not.toBe(roots[0]);
    const list = untaggedRoots(index, roots);
    expect(list.slice(0, 3)).toEqual(roots);
    expect(list).toHaveLength(6);
    expect(tagLanding(list, roots[0], true)).toBe(0);
  });

  it('a new bank: the same landing', async () => {
    const { store, index } = library;
    const questions = [choiceQuestion('New bank one'), choiceQuestion('New bank two')];
    const { bank, already } = await addToBank(questions, { name: 'Fresh' }, { store, openDocId: '' });
    expect(bank.kind).toBe('bank');
    const roots = addedRoots(questions, already);
    await index.flush();
    const list = untaggedRoots(index, roots);
    expect(list.slice(0, 2)).toEqual(ids(questions));
    expect(tagLanding(list, roots[0], true)).toBe(0);
  });

  it('every question a duplicate: nothing added, nowhere to land', async () => {
    const { store, bank } = library;
    const questions = [choiceQuestion('Already in the bank')];
    const { copied, already } = await addToBank(questions, bank.id, { store, openDocId: '' });
    expect(copied).toBe(0);
    expect(addedRoots(questions, already)).toEqual([]);
  });

  it('a question gone by the time the index catches up starts at the top', () => {
    expect(tagLanding(['a', 'b'], 'zzz', false)).toBeUndefined();
    expect(tagLanding(['a', 'b'], 'zzz', true)).toBe(0);
    expect(tagLanding(['a', 'b'], 'b', false)).toBe(1);
  });

  it('lists the given roots first in their order and leaves the rest as they were', () => {
    const groups = ['x', 'b', 'y', 'a', 'z'].map((rootId) => ({ rootId }));
    expect(firstThese(groups, ['a', 'b', 'gone']).map((g) => g.rootId)).toEqual(['a', 'b', 'x', 'y', 'z']);
    expect(firstThese(groups, undefined)).toBe(groups);
    expect(firstThese(groups, ['gone'])).toBe(groups);
  });
});
