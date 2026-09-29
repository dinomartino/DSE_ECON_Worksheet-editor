import { describe, expect, it } from 'vitest';
import type { WorksheetStore } from '@/storage';
import { copyQuestion } from '@/model/lineage';
import { bi } from '@/model/text';
import { createParagraphBlock } from '@/model/factories';
import type { Question, Worksheet } from '@/model/types';
import { bankCopyDiffers, copyToBank, createBank, updateBankCopy } from './bankDocs';
import { choiceQuestion, docWith } from './testKit';

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
    const bank = await copyToBank([q], source.id, undefined, { store, openDocId: source.id });
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
    const next = await copyToBank([choiceQuestion('New')], 'paper', bank.id, { store, openDocId: 'paper' });
    expect(next.questions[0]).toEqual(existing);
    expect(next.questions).toHaveLength(2);
    expect(next.flow).toHaveLength(2);
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
    const saved = await copyToBank(map.get('p')!.questions, 'p', undefined, { store, openDocId: 'p' });
    expect(saved.layout).toEqual([]);
    expect(saved.flow.map((entry) => entry.type)).toEqual(['question']);
  });
});
