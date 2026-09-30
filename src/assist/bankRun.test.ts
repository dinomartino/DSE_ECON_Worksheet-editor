import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError, type AiClient } from '@/ai/types';
import { loadGlossary } from '@/glossary/load';
import { contentKey } from '@/library/contentKey';
import { rowsOf } from '@/library/indexer';
import { identicalCopies } from '@/library/sameCopies';
import { choiceQuestion, docWith } from '@/library/testKit';
import { createParagraphBlock, createStructuredQuestion } from '@/model/factories';
import { copyQuestion } from '@/model/lineage';
import { plain } from '@/model/text';
import { collectTexts } from '@/model/textWalk';
import type { Question, Worksheet } from '@/model/types';
import type { BankRow } from '@/library/types';
import { payloadOf, reply, scriptedClient } from '@/translate/testKit';
import type { RunDepsResult } from '@/translate/types';
import { replaceTerms, runBankFill, runBankTerms, safeFixes, type BankRunDeps, type BankUnit } from './bankRun';

/**
 * The bank's runs over an in-memory store and a scripted provider: only the AiClient is a
 * fake; plan, run, validate, the glossary and the copy writes are the real ones.
 */

const NOW = '2026-09-30T10:00:00.000Z';

function memoryStore(docs: Worksheet[]) {
  const saved = new Map(docs.map((doc) => [doc.id, doc]));
  const writes: string[] = [];
  return {
    saved,
    writes,
    list: async () => [...saved.keys()].map((id) => ({ id, title: id, updatedAt: '' })),
    load: async (id: string) => saved.get(id),
    save: async (worksheet: Worksheet) => {
      writes.push(worksheet.id);
      saved.set(worksheet.id, worksheet);
    },
  };
}

/** Answers every item "譯：<source>" (tags kept), or runs `each` first. */
const echoClient = (each?: (n: number) => void): AiClient & { requests: unknown[] } => {
  let n = 0;
  return scriptedClient([
    (req) => {
      n += 1;
      each?.(n);
      // A real client's request is cancelled by Stop.
      if (req.signal.aborted) throw new AiError({ kind: 'cancelled', provider: 'deepseek', message: 'Stopped.', fatal: true, actions: [] });
      const items = payloadOf(req).groups.flatMap((g) => g.items);
      return reply(items.map((item) => [item.key, `譯：${item.text}`]));
    },
  ]);
};

function depsFor(store: ReturnType<typeof memoryStore>, client: AiClient): BankRunDeps {
  return {
    store,
    createRunDeps: async (): Promise<RunDepsResult> => ({
      ok: true,
      deps: { client, preset: { ...presetFor('deepseek'), concurrency: 1 }, model: 'deepseek-chat', glossary: null },
      config: {} as never,
    }),
    loadGlossary,
    desktop: () => false,
    now: () => NOW,
  };
}

const unitOf = (row: BankRow): BankUnit => ({ docId: row.docId, questionId: row.questionId, rootId: row.rootId, contentKey: row.contentKey, label: row.docTitle });
const stemZh = (q: Question | undefined): string => {
  const block = q?.blocks[0];
  return block?.kind === 'paragraph' ? plain(block.text.zh) : '';
};

/** One English question in papers a and b (identical copies) and c (edited); plus a second question. */
function scene() {
  const original = choiceQuestion('Which is a free good?');
  const second = choiceQuestion('Which is a public good?');
  const a = docWith([original, second], { id: 'a' } as Partial<Worksheet>);
  const b = docWith([copyQuestion(original, 'a')], { id: 'b' } as Partial<Worksheet>);
  const edited = copyQuestion(original, 'a');
  edited.blocks = [{ ...createParagraphBlock(), text: { en: [{ text: 'Which is a free good? Explain.' }], zh: [] } }];
  const c = docWith([edited], { id: 'c' } as Partial<Worksheet>);
  const rows = [a, b, c].flatMap((doc) => rowsOf(doc));
  return { a, b, c, rows };
}

describe('runBankFill', () => {
  it('fills the shown question and every identical copy; the edited copy is left alone', async () => {
    const { a, b, c, rows } = scene();
    const store = memoryStore([a, b, c]);
    const client = echoClient();
    const outcome = await runBankFill(
      { units: [unitOf(rows[0])], side: 'zh', includeTeacher: false, copiesOf: (unit) => identicalCopies(rows, rows.find((r) => r.questionId === unit.questionId)!) },
      depsFor(store, client),
      new AbortController().signal,
      () => {},
    );
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(client.requests).toHaveLength(1);
    expect(outcome.summary).toBe('Filled 中文 in 1 question');
    expect(outcome.records.map((r) => r.docId)).toEqual(['a', 'b']);
    expect(store.writes).toEqual(['a', 'b']);
    const qa = store.saved.get('a')!.questions[0];
    const qb = store.saved.get('b')!.questions[0];
    expect(stemZh(qa)).toBe('譯：Which is a free good?');
    expect(contentKey(qa)).toBe(contentKey(qb));
    expect(store.saved.get('c')).toBe(c);
    // The next question in paper a was not in the batch.
    expect(stemZh(store.saved.get('a')!.questions[1])).toBe('');
    expect(outcome.items[0]).toMatchObject({ tone: 'inserted', unit: { docId: 'a' } });
    expect(outcome.items[0].marks.map((m) => m.text)).toContain('譯：Which is a free good?');
  });

  it('skips a question missing nothing without a word, and says when nothing was filled', async () => {
    const both = choiceQuestion('Which is a free good?', '以下哪項是免費物品？');
    const doc = docWith([both], { id: 'd' } as Partial<Worksheet>);
    const rows = rowsOf(doc);
    const store = memoryStore([doc]);
    const client = echoClient();
    const outcome = await runBankFill(
      { units: rows.map(unitOf), side: 'zh', includeTeacher: false, copiesOf: (unit) => [unit] },
      depsFor(store, client),
      new AbortController().signal,
      () => {},
    );
    expect(outcome).toMatchObject({ kind: 'done', items: [], records: [], filled: 0 });
    expect(client.requests).toHaveLength(0);
  });

  it('Stop keeps every question already done: "Stopped. 2 of 4 done."', async () => {
    const questions = [1, 2, 3, 4].map((n) => choiceQuestion(`Question number ${n} about scarcity?`));
    const doc = docWith(questions, { id: 'p' } as Partial<Worksheet>);
    const rows = rowsOf(doc);
    const store = memoryStore([doc]);
    const controller = new AbortController();
    // Stop pressed while the third question is being sent.
    const client = echoClient((n) => n === 3 && controller.abort());
    const progress: number[] = [];
    const outcome = await runBankFill(
      { units: rows.map(unitOf), side: 'zh', includeTeacher: false, copiesOf: (unit) => [unit] },
      depsFor(store, client),
      controller.signal,
      (done) => progress.push(done),
    );
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(outcome.stopped).toBe(true);
    expect(outcome.summary).toBe('Stopped. 2 of 4 done.');
    const saved = store.saved.get('p')!.questions;
    expect(saved.map(stemZh)).toEqual(['譯：Question number 1 about scarcity?', '譯：Question number 2 about scarcity?', '', '']);
    expect(outcome.records).toHaveLength(2);
    expect(progress).toContain(2);
  });

  it('never writes a hard failure (a lost blank)', async () => {
    const q = createStructuredQuestion();
    q.blocks = [{ ...createParagraphBlock(), text: { en: [{ text: 'Price falls by ' }, { text: ' '.repeat(12), underline: true }, { text: '.' }], zh: [] } }];
    const doc = docWith([q], { id: 'f' } as Partial<Worksheet>);
    const rows = rowsOf(doc);
    const store = memoryStore([doc]);
    // Always drops the blank, first pass and repair.
    const client = scriptedClient([
      (req) => reply(payloadOf(req).groups.flatMap((g) => g.items).map((item) => [item.key, item.text.replaceAll('<blank/>', '')])),
    ]);
    const outcome = await runBankFill(
      { units: rows.map(unitOf), side: 'zh', includeTeacher: true, copiesOf: (unit) => [unit] },
      depsFor(store, client),
      new AbortController().signal,
      () => {},
    );
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    const stem = collectTexts(store.saved.get('f')!).find((slot) => plain(slot.text.en).startsWith('Price falls'));
    expect(plain(stem!.text.zh)).toBe('');
    expect(outcome.items.some((item) => item.tone === 'failed')).toBe(true);
  });

  it('reports a question changed since the bank read it, and leaves it', async () => {
    const { a, b, c, rows } = scene();
    const store = memoryStore([a, b, c]);
    const stale = { ...unitOf(rows[0]), contentKey: 'old' };
    const client = echoClient();
    const outcome = await runBankFill(
      { units: [stale], side: 'zh', includeTeacher: false, copiesOf: () => [] },
      depsFor(store, client),
      new AbortController().signal,
      () => {},
    );
    if (outcome.kind !== 'done') throw new Error(outcome.kind);
    expect(client.requests).toHaveLength(0);
    expect(outcome.items[0]).toMatchObject({ tone: 'failed' });
    expect(store.writes).toEqual([]);
  });

  it('a run that cannot start is an error with the setup actions', async () => {
    const { a, rows } = scene();
    const store = memoryStore([a]);
    const deps = { ...depsFor(store, echoClient()), createRunDeps: async (): Promise<RunDepsResult> => ({ ok: false, provider: 'gemini', reason: 'noKey' }) };
    const outcome = await runBankFill({ units: [unitOf(rows[0])], side: 'zh', includeTeacher: false, copiesOf: () => [] }, deps, new AbortController().signal, () => {});
    expect(outcome).toMatchObject({ kind: 'error', error: { kind: 'notConfigured', actions: ['openSettings'] } });
  });
});

describe('Check terms in the bank', () => {
  it('finds a mainland form and Replace fixes it in every identical copy', async () => {
    const original = createStructuredQuestion();
    original.blocks = [{ ...createParagraphBlock(), text: { en: [{ text: 'Supply falls, so the price rises.' }], zh: [{ text: '供給減少，因此價格上升。' }] } }];
    const a = docWith([original], { id: 'a' } as Partial<Worksheet>);
    const b = docWith([copyQuestion(original, 'a')], { id: 'b' } as Partial<Worksheet>);
    const rows = [a, b].flatMap((doc) => rowsOf(doc));
    const store = memoryStore([a, b]);
    const deps = depsFor(store, echoClient());
    const checked = await runBankTerms({ units: [unitOf(rows[0])], copiesOf: () => identicalCopies(rows, rows[0]) }, deps, new AbortController().signal, () => {});
    if (checked.kind !== 'checked') throw new Error(checked.kind);
    expect(checked.findings).toHaveLength(1);
    const [fixes] = safeFixes(checked.findings);
    expect(fixes).toBeDefined();
    const result = await replaceTerms(fixes.unit, fixes.accepted, checked.glossary, deps);
    expect(result.terms).toBeGreaterThan(0);
    expect(store.writes).toEqual(['a', 'b']);
    expect(stemZh(store.saved.get('a')!.questions[0])).toContain('供應');
    expect(contentKey(store.saved.get('a')!.questions[0])).toBe(contentKey(store.saved.get('b')!.questions[0]));
    // Re-checked as written: the fixed form is gone from the findings.
    expect(result.next.rows.flatMap((row) => row.checks).filter((check) => check.fix?.to === '供應')).toEqual([]);
    expect(result.next.copies.map((ref) => ref.docId)).toEqual(['a', 'b']);
  });
});
