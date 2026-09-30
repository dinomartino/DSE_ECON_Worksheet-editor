import { describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import type { BankRunDeps, BankUnit } from '@/assist/bankRun';
import { loadGlossary } from '@/glossary/load';
import { contentKey } from '@/library/contentKey';
import { rowsOf } from '@/library/indexer';
import { identicalCopies } from '@/library/sameCopies';
import { choiceQuestion, docWith } from '@/library/testKit';
import type { BankRow } from '@/library/types';
import { createParagraphBlock, createStructuredQuestion } from '@/model/factories';
import { copyQuestion } from '@/model/lineage';
import { plain } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { payloadOf, reply, scriptedClient } from '@/translate/testKit';
import type { RunDepsResult } from '@/translate/types';
import { CONFIRM_OVER, confirmLine, createBankAi, needsConfirm, roughTime } from './bankAi';

function memoryStore(docs: Worksheet[]) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  return {
    saved,
    list: async () => [...saved.keys()].map((id) => ({ id, title: id, updatedAt: '' })),
    load: async (id: string) => saved.get(id),
    save: async (worksheet: Worksheet) => void saved.set(worksheet.id, worksheet),
  };
}

const client = scriptedClient([(req) => reply(payloadOf(req).groups.flatMap((g) => g.items).map((item) => [item.key, `譯：${item.text}`]))]);

function deps(store: ReturnType<typeof memoryStore>): BankRunDeps {
  return {
    store,
    createRunDeps: async (): Promise<RunDepsResult> => ({
      ok: true,
      deps: { client, preset: { ...presetFor('deepseek'), concurrency: 1 }, model: 'deepseek-chat', glossary: null },
      config: {} as never,
    }),
    loadGlossary,
    desktop: () => false,
  };
}

const hooks = () => ({ onWritten: vi.fn(), onSkipped: vi.fn(), onNotice: vi.fn() });
const unitOf = (row: BankRow): BankUnit => ({ docId: row.docId, questionId: row.questionId, rootId: row.rootId, contentKey: row.contentKey, label: row.docTitle });
const stemZh = (q: Question | undefined): string => {
  const block = q?.blocks[0];
  return block?.kind === 'paragraph' ? plain(block.text.zh) : '';
};

describe('the confirm threshold', () => {
  it('runs up to 20 questions on click and asks over 20, with a rough time', () => {
    expect(CONFIRM_OVER).toBe(20);
    expect(needsConfirm(20)).toBe(false);
    expect(needsConfirm(21)).toBe(true);
    expect(roughTime(5)).toBe('under a minute');
    expect(roughTime(40)).toBe('about 4 minutes');
    expect(confirmLine(40)).toBe('Translate 40 questions? This takes about 4 minutes. You can stop at any time.');
  });
});

describe('the bank ✦ run', () => {
  it('fills, reviews, then Undo all puts every copy back', async () => {
    const original = choiceQuestion('Which is a free good?');
    const a = docWith([original], { id: 'a' } as Partial<Worksheet>);
    const b = docWith([copyQuestion(original, 'a')], { id: 'b' } as Partial<Worksheet>);
    const rows = [a, b].flatMap((doc) => rowsOf(doc));
    const store = memoryStore([a, b]);
    const run = createBankAi(deps(store));
    const heard = hooks();
    await run.getState().start({ verb: 'fill', side: 'zh', includeTeacher: false, units: [unitOf(rows[0])], copiesOf: () => identicalCopies(rows, rows[0]) }, heard);
    const phase = run.getState().phase;
    expect(phase).toMatchObject({ kind: 'review', verb: 'fill', summary: 'Filled 中文 in 1 question', undoable: true });
    expect(heard.onWritten).toHaveBeenCalled();
    expect(stemZh(store.saved.get('b')!.questions[0])).toBe('譯：Which is a free good?');

    await run.getState().undoAll();
    expect(run.getState().phase).toEqual({ kind: 'idle' });
    expect(contentKey(store.saved.get('a')!.questions[0])).toBe(rows[0].contentKey);
    expect(contentKey(store.saved.get('b')!.questions[0])).toBe(rows[0].contentKey);
    expect(heard.onNotice).toHaveBeenCalledWith('Put back 1 question as it was.');
  });

  it('Check terms: one finding replaced, then Undo all takes the replacement back', async () => {
    const original = createStructuredQuestion();
    original.blocks = [{ ...createParagraphBlock(), text: { en: [{ text: 'Supply falls, so the price rises.' }], zh: [{ text: '供給減少，因此價格上升。' }] } }];
    const a = docWith([original], { id: 'a' } as Partial<Worksheet>);
    const b = docWith([copyQuestion(original, 'a')], { id: 'b' } as Partial<Worksheet>);
    const rows = [a, b].flatMap((doc) => rowsOf(doc));
    const store = memoryStore([a, b]);
    const run = createBankAi(deps(store));
    await run.getState().start({ verb: 'terms', units: [unitOf(rows[0])], copiesOf: () => identicalCopies(rows, rows[0]) }, hooks());
    const found = run.getState().phase;
    if (found.kind !== 'review') throw new Error(found.kind);
    const index = found.items.findIndex((item) => item.fix?.label === 'Replace with 供應');
    expect(index).toBeGreaterThanOrEqual(0);
    expect(found.undoable).toBe(false);

    await run.getState().applyItem(index);
    const after = run.getState().phase;
    expect(after).toMatchObject({ kind: 'review', undoable: true });
    expect(stemZh(store.saved.get('b')!.questions[0])).toContain('供應');

    await run.getState().undoAll();
    expect(stemZh(store.saved.get('a')!.questions[0])).toBe('供給減少，因此價格上升。');
    expect(stemZh(store.saved.get('b')!.questions[0])).toBe('供給減少，因此價格上升。');
  });

  it('settle() stops a running batch and waits for its last write', async () => {
    const questions = [1, 2, 3].map((n) => choiceQuestion(`Question ${n} about cost?`));
    const doc = docWith(questions, { id: 'p' } as Partial<Worksheet>);
    const rows = rowsOf(doc);
    const store = memoryStore([doc]);
    const run = createBankAi(deps(store));
    const started = run.getState().start({ verb: 'fill', side: 'zh', includeTeacher: false, units: rows.map(unitOf), copiesOf: (u) => [u] }, hooks());
    await run.getState().settle();
    await started;
    expect(run.getState().phase.kind).not.toBe('running');
  });
});
