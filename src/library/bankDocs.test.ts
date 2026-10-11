import { beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageWorksheetStore, type WorksheetStore } from '@/storage';
import { CURRENT_SCHEMA_VERSION } from '@/model/migrations';
import { copyQuestion, rootIdOf } from '@/model/lineage';
import { bi } from '@/model/text';
import { createImageBlock, createParagraphBlock } from '@/model/factories';
import { questionTagSlots } from '@/model/tagSlots';
import type { Question, StructuredQuestion, Worksheet } from '@/model/types';
import { contentKey as contentKeyOf } from './contentKey';
import {
  addToOneBank,
  bankCopyDiffers,
  bankHolds,
  copyBankOf,
  copyToBank,
  copyToOneBank,
  createBank,
  keepInBank,
  nextBankName,
  oneBank,
  oneBankOf,
  updateBankCopy,
} from './bankDocs';
import { installLocalStorage } from './bankTestKit';
import { choiceQuestion, docWith, partedQuestion } from './testKit';

/** An in-memory store: only the calls bankDocs makes. */
function memoryStore(...docs: Worksheet[]) {
  const map = new Map(docs.map((d) => [d.id, structuredClone(d)]));
  const saves: string[] = [];
  const store = {
    load: async (id: string) => map.get(id),
    save: async (w: Worksheet) => {
      saves.push(w.id);
      map.set(w.id, structuredClone(w));
    },
  } as unknown as WorksheetStore;
  return { store, map, saves };
}

const edit = (q: Question, en: string): Question =>
  ({ ...q, blocks: [createParagraphBlock(bi(en, ''))] }) as Question;

describe('copyToBank', () => {
  it('creates a new bank with a copy and leaves the source alone', async () => {
    const q = choiceQuestion('Stem');
    const source = docWith([q]);
    const before = structuredClone(source);
    const { store, map } = memoryStore(source);
    const { bank } = await copyToBank([q], source.id, undefined, { store, openDocId: source.id });
    expect(bank.kind).toBe('bank');
    expect(bank.title.en.map((r) => r.text).join('')).toBe('Question bank');
    expect(bank.questions).toHaveLength(1);
    expect(bank.questions[0].id).not.toBe(q.id);
    expect(bank.questions[0].lineage).toMatchObject({ rootId: q.id, fromDocId: source.id });
    expect(bank.flow.at(-1)).toEqual({ type: 'question', id: bank.questions[0].id });
    expect(map.get(bank.id)).toBeDefined();
    expect(source).toEqual(before);
  });

  it('appends to an existing bank without touching its other questions', async () => {
    const existing = choiceQuestion('Old');
    const bank = { ...docWith([existing]), kind: 'bank' as const };
    const { store } = memoryStore(bank);
    const { bank: next } = await copyToBank([choiceQuestion('New')], 'paper', bank.id, { store, openDocId: 'paper' });
    expect(next.questions[0]).toEqual(existing);
    expect(next.questions).toHaveLength(2);
    expect(next.flow).toHaveLength(2);
  });

  it('never copies a question into a bank that already holds it', async () => {
    const q = choiceQuestion('Stem');
    const paper = docWith([q], { id: 'paper' });
    const { store, map, saves } = memoryStore(paper);
    const { bank: made } = await copyToBank([q], 'paper', { name: 'Macro MCQ' }, { store, openDocId: 'paper' });
    expect(saves).toHaveLength(1);

    // The same question again: nothing copied, nothing saved.
    const again = await copyToBank([q], 'paper', made.id, { store, openDocId: 'paper' });
    expect(again).toMatchObject({ copied: 0, already: [q] });
    expect(saves).toHaveLength(1);
    expect(map.get(made.id)!.questions).toHaveLength(1);

    // An edited copy of it (same root, new words) is the same question: Update bank copy, not a copy.
    const edited = edit(copyQuestion(q, 'paper'), 'Better stem');
    const third = await copyToBank([edited, choiceQuestion('New one')], 'other', made.id, { store, openDocId: 'other' });
    expect(third.copied).toBe(1);
    expect(third.already).toEqual([edited]);
    expect(map.get(made.id)!.questions).toHaveLength(2);
  });

  it('copies a question picked twice once', async () => {
    const q = choiceQuestion('Stem');
    const { store } = memoryStore();
    const { bank, copied } = await copyToBank([q, copyQuestion(q, 'x')], 'paper', undefined, { store, openDocId: 'paper' });
    expect(copied).toBe(1);
    expect(bank.questions).toHaveLength(1);
  });

  it('names a new bank as asked; the printed title stays Question bank 題庫', async () => {
    const { store } = memoryStore();
    const { bank } = await copyToBank([choiceQuestion('Stem')], 'paper', { name: '  Macro MCQ  ' }, { store, openDocId: 'paper' });
    expect(bank.name).toBe('Macro MCQ');
    expect(bank.title.en.map((r) => r.text).join('')).toBe('Question bank');
    expect(createBank('').name).toBeUndefined();
  });

  it('refuses a paper as the target and the open document', async () => {
    const paper = docWith([]);
    const a = memoryStore(paper);
    await expect(copyToBank([], 'x', paper.id, { store: a.store, openDocId: 'x' })).rejects.toThrow();
    const bank = { ...docWith([]), kind: 'bank' as const };
    const b = memoryStore(bank);
    await expect(copyToBank([], 'x', bank.id, { store: b.store, openDocId: bank.id })).rejects.toThrow();
  });
});

describe('bankCopyDiffers / updateBankCopy', () => {
  const setup = () => {
    const q = choiceQuestion('Stem');
    const bankQ = copyQuestion(q, 'paper');
    const otherBankQ = copyQuestion(choiceQuestion('Other'), 'paper');
    const bank = { ...docWith([otherBankQ, bankQ]), kind: 'bank' as const };
    return { q, bankQ, otherBankQ, bank };
  };

  it('says whether the bank holds the question, as it is or in another version', () => {
    const { q, bank } = setup();
    expect(bankHolds(q, bank)).toBe('same');
    expect(bankHolds(copyQuestion(q, 'another paper'), bank)).toBe('same');
    expect(bankHolds(edit(q, 'Better stem'), bank)).toBe('differs');
    expect(bankHolds(choiceQuestion('Stem'), bank)).toBe('none'); // same words, another question
  });

  it('is false for an identical copy or an unknown question, true once edited', () => {
    const { q, bank } = setup();
    expect(bankCopyDiffers(q, bank)).toBe(false);
    expect(bankCopyDiffers(choiceQuestion('Unrelated'), bank)).toBe(false);
    expect(bankCopyDiffers(edit(q, 'Better stem'), bank)).toBe(true);
  });

  it('replaces content, keeps the bank id and lineage, changes nothing else', async () => {
    const { q, bankQ, otherBankQ, bank } = setup();
    const { store, map, saves } = memoryStore(bank);
    const improved = edit(q, 'Better stem');
    expect(await updateBankCopy(improved, bank.id, { store, openDocId: 'paper' })).toBe(true);
    expect(saves).toEqual([bank.id]);
    const saved = map.get(bank.id)!;
    expect(saved.questions[0]).toEqual(otherBankQ);
    expect(saved.questions[1].id).toBe(bankQ.id);
    expect(saved.questions[1].lineage).toEqual(bankQ.lineage);
    expect(saved.flow).toEqual(bank.flow);
    expect(bankCopyDiffers(improved, saved)).toBe(false);
    const blockId = (x: Question) => (x as unknown as { blocks: { id: string }[] }).blocks[0].id;
    expect(blockId(saved.questions[1])).not.toBe(blockId(improved));
  });

  it('keeps the paper copy’s part roots, which name the bank’s parts, so part keys stay stable', async () => {
    const bankQ = partedQuestion([{ tags: ['C.ped'] }, { subs: [undefined] }]);
    const bank = { ...docWith([bankQ]), kind: 'bank' as const };
    const paperQ = copyQuestion(bankQ, bank.id);
    paperQ.blocks = [createParagraphBlock(bi('A better stem.', ''))];
    const { store, map } = memoryStore(bank);
    expect(await updateBankCopy(paperQ, bank.id, { store, openDocId: 'paper' })).toBe(true);
    const saved = map.get(bank.id)!.questions[0];
    expect(saved.id).toBe(bankQ.id);
    expect(questionTagSlots(saved).map((slot) => slot.key)).toEqual(questionTagSlots(bankQ).map((slot) => slot.key));
    expect((saved as StructuredQuestion).parts[0].id).not.toBe(paperQ.parts[0].id);
  });

  it('from the original paper, the bank’s parts keep their keys too', async () => {
    const paperQ = partedQuestion([{ tags: ['C.ped'] }, {}]);
    const bankQ = copyQuestion(paperQ, 'paper');
    const bank = { ...docWith([bankQ]), kind: 'bank' as const };
    const { store, map } = memoryStore(bank);
    const improved = { ...paperQ, blocks: [createParagraphBlock(bi('A better stem.', ''))] };
    expect(await updateBankCopy(improved, bank.id, { store, openDocId: 'paper' })).toBe(true);
    const saved = map.get(bank.id)!.questions[0];
    expect(questionTagSlots(saved).map((slot) => slot.key)).toEqual(questionTagSlots(bankQ).map((slot) => slot.key));
  });

  it('keeps a newer bank tag change (another tab) instead of moving it back', async () => {
    const paperQ = { ...partedQuestion([{ tags: ['C.ped'] }, {}]), tagsAt: '2026-01-01T00:00:00.000Z' };
    const bankQ = copyQuestion(paperQ, 'paper') as StructuredQuestion;
    bankQ.parts[1] = { ...bankQ.parts[1], tags: ['C.pes'] };
    const newer = { ...bankQ, tags: ['mock'], tagsAt: '2026-02-01T00:00:00.000Z' };
    const bank = { ...docWith([newer]), kind: 'bank' as const };
    const { store, map } = memoryStore(bank);
    const improved = { ...paperQ, blocks: [createParagraphBlock(bi('A better stem.', ''))] };
    expect(await updateBankCopy(improved, bank.id, { store, openDocId: 'paper' })).toBe(true);
    const saved = map.get(bank.id)!.questions[0] as StructuredQuestion;
    expect(saved.tagsAt).toBe('2026-02-01T00:00:00.000Z');
    expect(saved.tags).toEqual(['mock']);
    expect(saved.parts.map((part) => part.tags)).toEqual([['C.ped'], ['C.pes']]);
    expect(contentKeyOf(saved)).toBe(contentKeyOf(improved));
  });

  it('takes the paper’s tags when the paper was tagged later, or the bank copy never was', async () => {
    const paperQ = { ...choiceQuestion('Stem', '', ['C.ped']), tagsAt: '2026-03-01T00:00:00.000Z' };
    const older = { ...copyQuestion(paperQ, 'paper'), tags: ['C.pes'], tagsAt: '2026-02-01T00:00:00.000Z' };
    const unstamped = { ...copyQuestion(paperQ, 'paper'), tags: ['C.pes'] };
    delete (unstamped as Partial<Question>).tagsAt;
    for (const bankQ of [older, unstamped]) {
      const bank = { ...docWith([bankQ]), kind: 'bank' as const };
      const { store, map } = memoryStore(bank);
      expect(await updateBankCopy(edit(paperQ, 'Better'), bank.id, { store, openDocId: 'paper' })).toBe(true);
      const saved = map.get(bank.id)!.questions[0];
      expect([saved.tags, saved.tagsAt]).toEqual([['C.ped'], '2026-03-01T00:00:00.000Z']);
    }
  });

  it('never writes the open document and refuses non-banks', async () => {
    const { q, bank } = setup();
    const { store, saves } = memoryStore(bank, docWith([]));
    await expect(updateBankCopy(q, bank.id, { store, openDocId: bank.id })).rejects.toThrow();
    expect(await updateBankCopy(q, 'missing', { store, openDocId: 'p' })).toBe(false);
    expect(saves).toEqual([]);
  });

  it('createBank makes an empty kind:bank document', () => {
    expect(createBank().kind).toBe('bank');
  });

  it('a new bank holds only its questions: no section headings, no instructions', async () => {
    const bank = createBank();
    expect(bank.layout).toEqual([]);
    expect(bank.flow).toEqual([]);
    expect(bank.instructions).toBeUndefined();
    const { store, map } = memoryStore(docWith([choiceQuestion('Stem')], { id: 'p' }));
    const { bank: saved } = await copyToBank(map.get('p')!.questions, 'p', undefined, { store, openDocId: 'p' });
    expect(saved.layout).toEqual([]);
    expect(saved.flow.map((entry) => entry.type)).toEqual(['question']);
  });
});

describe('naming banks', () => {
  it('suggests a name no bank has yet', () => {
    expect(nextBankName([])).toBe('Question bank');
    expect(nextBankName(['Macro MCQ'])).toBe('Question bank');
    expect(nextBankName(['question bank ', 'Question bank 2'])).toBe('Question bank 3');
  });
});

describe('keepInBank: a paper’s questions kept before it goes to Trash', () => {
  it('copies each with its root, topics and pictures, and leaves the paper alone', async () => {
    const q = { ...choiceQuestion('Stem', '題幹', ['A.scarcity']), tagsAt: '2026-10-01T00:00:00.000Z' } as Question;
    q.blocks = [...q.blocks, createImageBlock('data:image/png;base64,AAAA', 120, 80)];
    const paper = docWith([q], { id: 'paper' });
    const before = structuredClone(paper);
    const bank = { ...docWith([]), kind: 'bank' as const };
    const { store, map } = memoryStore(paper, bank);
    const { copied, already } = await keepInBank([q], 'paper', bank.id, { store, openDocId: '' });
    expect([copied, already]).toEqual([1, []]);
    const kept = map.get(bank.id)!.questions[0];
    expect(kept.id).not.toBe(q.id);
    expect(kept.lineage).toMatchObject({ rootId: q.id, fromDocId: 'paper' });
    expect(kept.tags).toEqual(['A.scarcity']);
    expect(kept.tagsAt).toBe(q.tagsAt);
    expect(kept.blocks.at(-1)).toMatchObject({ kind: 'image', src: 'data:image/png;base64,AAAA' });
    expect(contentKeyOf(kept)).toBe(contentKeyOf(q));
    expect(map.get('paper')).toEqual(before);
  });

  it('adds the paper’s version beside an older one of the same question, never over it', async () => {
    const original = choiceQuestion('First wording');
    const bankCopy = copyQuestion(original, 'p0');
    const bank = { ...docWith([bankCopy]), kind: 'bank' as const };
    const edited = edit(copyQuestion(original, bank.id), 'Second wording');
    const { store, map } = memoryStore(bank);
    const { copied } = await keepInBank([edited], 'paper', bank.id, { store, openDocId: '' });
    expect(copied).toBe(1);
    const saved = map.get(bank.id)!;
    expect(saved.questions[0]).toEqual(bankCopy);
    expect(saved.questions.map(rootIdOf)).toEqual([original.id, original.id]);
    expect(contentKeyOf(saved.questions[1])).toBe(contentKeyOf(edited));
  });

  it('skips what the bank already says, and saves nothing then', async () => {
    const q = choiceQuestion('Stem');
    const bank = { ...docWith([copyQuestion(q, 'x')]), kind: 'bank' as const };
    const { store, saves } = memoryStore(bank);
    expect(await keepInBank([q], 'paper', bank.id, { store, openDocId: '' })).toMatchObject({ copied: 0, already: [q] });
    expect(saves).toEqual([]);
  });

  it('makes the bank when there is none', async () => {
    const { store, map } = memoryStore();
    const { bank } = await keepInBank([choiceQuestion('Stem')], 'paper', { name: 'Question bank' }, { store, openDocId: '' });
    expect(map.get(bank.id)).toMatchObject({ kind: 'bank', name: 'Question bank' });
  });
});

describe('the one bank', () => {
  const bank = (id: string, updatedAt: string, extra: Partial<Worksheet> = {}): Worksheet =>
    ({ ...docWith([], { id, kind: 'bank', updatedAt, ...extra }) }) as Worksheet;

  it('is the most recently saved bank this build may write', () => {
    const older = bank('older', '2026-09-01T00:00:00.000Z');
    const newer = bank('newer', '2026-10-01T00:00:00.000Z');
    expect(oneBankOf([older, newer])?.id).toBe('newer');
    const hidden = bank('hidden', '2026-10-05T00:00:00.000Z', { bankHidden: true });
    const future = bank('future', '2026-10-06T00:00:00.000Z', { schemaVersion: CURRENT_SCHEMA_VERSION + 1 });
    const paper = docWith([], { id: 'paper', updatedAt: '2026-10-07T00:00:00.000Z' });
    expect(oneBankOf([older, hidden, future, paper, newer])?.id).toBe('newer');
    expect(oneBankOf([hidden, paper])).toBeUndefined();
  });

  describe('read from the store', () => {
    let store: LocalStorageWorksheetStore;
    beforeEach(() => {
      installLocalStorage();
      store = new LocalStorageWorksheetStore();
    });

    it('names a new one when there is no bank, without saving anything', async () => {
      await store.save(docWith([], { id: 'paper' }));
      expect(await oneBank({ store, openDocId: '' })).toEqual({ name: 'Question bank' });
      expect((await store.list()).map((s) => s.id)).toEqual(['paper']);
    });

    it('picks the most recent of several, never a trashed, hidden or open one', async () => {
      await store.save(bank('a', '2026-09-01T00:00:00.000Z'));
      await store.save(bank('b', '2026-09-02T00:00:00.000Z'));
      await store.save(bank('c', '2026-09-03T00:00:00.000Z', { bankHidden: true }));
      await store.save(bank('d', '2026-09-04T00:00:00.000Z'));
      expect(await oneBank({ store, openDocId: '' })).toBe('d');
      await store.trash('d');
      expect(await oneBank({ store, openDocId: '' })).toBe('b');
      expect(await oneBank({ store, openDocId: 'b' })).toBe('a');
    });

    it('names a new bank apart from the hidden ones', async () => {
      await store.save(bank('c', '2026-09-03T00:00:00.000Z', { bankHidden: true, name: 'Question bank' }));
      expect(await oneBank({ store, openDocId: '' })).toEqual({ name: 'Question bank 2' });
    });
  });
});

describe('import: 題庫 only goes to the one bank', () => {
  let store: LocalStorageWorksheetStore;
  const bank = (id: string, updatedAt: string): Worksheet => ({ ...docWith([], { id, kind: 'bank', updatedAt }) }) as Worksheet;
  const banks = async () => (await store.list()).filter((s) => s.kind === 'bank').map((s) => s.id).sort();
  beforeEach(() => {
    installLocalStorage();
    store = new LocalStorageWorksheetStore();
  });

  it('with no bank, makes one quietly', async () => {
    const { bank: made, copied } = await addToOneBank([choiceQuestion('A'), choiceQuestion('B')], { store, openDocId: '' });
    expect(copied).toBe(2);
    expect(await banks()).toEqual([made.id]);
    expect((await store.load(made.id))?.name).toBe('Question bank');
  });

  it('with one bank, adds to it and makes no other', async () => {
    await store.save(bank('only', '2026-09-01T00:00:00.000Z'));
    const { bank: into } = await addToOneBank([choiceQuestion('A')], { store, openDocId: '' });
    expect(into.id).toBe('only');
    expect(await banks()).toEqual(['only']);
    expect((await store.load('only'))?.questions).toHaveLength(1);
  });

  it('with three banks, adds to the most recent and leaves the others alone', async () => {
    await store.save(bank('a', '2026-09-01T00:00:00.000Z'));
    await store.save(bank('b', '2026-09-03T00:00:00.000Z'));
    await store.save(bank('c', '2026-09-02T00:00:00.000Z'));
    const { bank: into } = await addToOneBank([choiceQuestion('A')], { store, openDocId: '' });
    expect(into.id).toBe('b');
    expect(await banks()).toEqual(['a', 'b', 'c']);
    expect((await store.load('a'))?.questions).toHaveLength(0);
    expect((await store.load('c'))?.questions).toHaveLength(0);
  });
});

describe('Copy to bank: no picker, the root follows its bank', () => {
  const bank = (id: string, updatedAt: string, questions: Question[] = [], extra: Partial<Worksheet> = {}): Worksheet =>
    ({ ...docWith(questions, { id, kind: 'bank', updatedAt, ...extra }) }) as Worksheet;

  it('copyBankOf: a bank holding the root wins over a more recent one', () => {
    const q = choiceQuestion('Stem');
    const holder = bank('holder', '2026-09-01T00:00:00.000Z', [copyQuestion(q, 'paper')]);
    const recent = bank('recent', '2026-10-01T00:00:00.000Z');
    expect(copyBankOf(rootIdOf(q), [recent, holder])?.id).toBe('holder');
    // Two hold it: the more recent of those.
    const later = bank('later', '2026-09-15T00:00:00.000Z', [copyQuestion(q, 'paper')]);
    expect(copyBankOf(rootIdOf(q), [holder, recent, later])?.id).toBe('later');
    // Held only by a bank this build may not write: the one bank.
    const hidden = bank('hidden', '2026-09-01T00:00:00.000Z', [copyQuestion(q, 'paper')], { bankHidden: true });
    expect(copyBankOf(rootIdOf(q), [hidden, recent])?.id).toBe('recent');
    expect(copyBankOf(rootIdOf(q), [])).toBeUndefined();
  });

  describe('copyToOneBank', () => {
    let store: LocalStorageWorksheetStore;
    const io = () => ({ store, openDocId: 'paper' });
    const bankIds = async () => (await store.list()).filter((s) => s.kind === 'bank').map((s) => s.id);
    beforeEach(() => {
      installLocalStorage();
      store = new LocalStorageWorksheetStore();
    });

    it('with no bank, makes one and copies, asking nothing', async () => {
      const q = choiceQuestion('Stem');
      const out = await copyToOneBank(q, 'paper', io());
      expect(out.kind).toBe('copied');
      expect(await bankIds()).toEqual([out.bank.id]);
      expect((await store.load(out.bank.id))?.questions.map(rootIdOf)).toEqual([q.id]);
    });

    it('with several banks, copies into the most recent', async () => {
      await store.save(bank('a', '2026-09-01T00:00:00.000Z'));
      await store.save(bank('b', '2026-09-03T00:00:00.000Z'));
      await store.save(bank('c', '2026-09-02T00:00:00.000Z'));
      const out = await copyToOneBank(choiceQuestion('Stem'), 'paper', io());
      expect(out).toMatchObject({ kind: 'copied', bank: { id: 'b' } });
      expect((await store.load('a'))?.questions).toHaveLength(0);
      expect((await bankIds()).sort()).toEqual(['a', 'b', 'c']);
    });

    it('a question whose root an older bank holds goes there, not into the one bank', async () => {
      const original = choiceQuestion('Stem');
      await store.save(bank('older', '2026-09-01T00:00:00.000Z', [copyQuestion(original, 'x'), choiceQuestion('Other')]));
      await store.save(bank('recent', '2026-10-01T00:00:00.000Z'));
      // Same content: already there, nothing written.
      expect(await copyToOneBank(original, 'paper', io())).toMatchObject({ kind: 'already', bank: { id: 'older' } });
      // Edited here: another version, the teacher chooses; still nothing written.
      const edited = edit(original, 'Stem, edited');
      expect(await copyToOneBank(edited, 'paper', io())).toMatchObject({ kind: 'differs', bank: { id: 'older' } });
      expect((await store.load('older'))?.questions).toHaveLength(2);
      expect((await store.load('recent'))?.questions).toHaveLength(0);
    });

    it('weighs the open bank: a question in it is already there, and it is never written', async () => {
      const q = choiceQuestion('Stem');
      const open = bank('open', '2026-10-05T00:00:00.000Z', [q]);
      await store.save(open);
      await store.save(bank('other', '2026-09-01T00:00:00.000Z'));
      const out = await copyToOneBank(q, 'open', { store, openDocId: 'open' }, open);
      expect(out).toMatchObject({ kind: 'already', bank: { id: 'open' } });
      expect((await store.load('other'))?.questions).toHaveLength(0);
    });
  });
});
