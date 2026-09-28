import { describe, expect, it } from 'vitest';
import { presetFor } from '@/ai/providers';
import { AiError, type CompletionRequest, type CompletionResult } from '@/ai/types';
import { plain } from '@/model/text';
import type { SlotKind } from '@/model/textSlots';
import type { RichText } from '@/model/types';
import { fakeGlossary } from './fakeGlossary';
import { announcedSleep, runTranslation, translateOne, writesFor } from './run';
import { payloadOf, reply, scriptedClient } from './testKit';
import type { Chunk, Direction, RunDeps, RunProgress, TranslationJob, TranslationPlan } from './types';

type Spec = { key: string; source: RichText | string; kind?: SlotKind; slots?: number };

/** A hand-built plan: one chunk per entry of `chunks`, one group each. */
function planOf(chunks: Array<{ direction?: Direction; jobs: Spec[] }>): TranslationPlan {
  const jobs = new Map<string, TranslationJob>();
  const out: Chunk[] = chunks.map((c, n) => {
    const direction = c.direction ?? 'toZh';
    for (const spec of c.jobs) {
      const source = typeof spec.source === 'string' ? [{ text: spec.source }] : spec.source;
      const side = direction === 'toZh' ? 'zh' : 'en';
      jobs.set(spec.key, {
        key: spec.key, direction, kind: spec.kind ?? 'part', groupKey: `q:${n}`, where: `Question ${n + 1}`, source,
        slots: Array.from({ length: spec.slots ?? 1 }, (_, i) => ({ path: `${spec.key}/p${i}`, side, sourceSnapshot: source, targetSnapshot: [] })),
        replacing: false,
      });
    }
    const keys = c.jobs.map((j) => j.key);
    return { id: `c${n}`, direction, groups: [{ groupKey: `q:${n}`, where: `Question ${n + 1}`, context: [], jobKeys: keys }], sourceChars: 10 };
  });
  return {
    worksheetId: 'ws', scope: { kind: 'paper' },
    options: { directions: { toZh: true, toEn: true }, includeTeacher: true, includeDiagramLabels: true, copySymbols: { toZh: false, toEn: false } },
    jobs, copies: [], chunks: out,
    counts: { toZh: 0, toEn: 0, teacher: 0, diagramLabels: 0, symbols: { toZh: 0, toEn: 0 }, copied: 0, replaceable: 0, contextLines: 0, chars: 0, requests: out.length },
  };
}

function depsFor(client: RunDeps['client'], glossary = true): RunDeps {
  return { client, preset: { ...presetFor('deepseek'), concurrency: 1 }, model: 'deepseek-chat', glossary: glossary ? fakeGlossary() : null };
}

const run = (plan: TranslationPlan, deps: RunDeps, signal = new AbortController().signal, progress: RunProgress[] = []) =>
  runTranslation(plan, deps, signal, (p) => progress.push(p));

const keysOf = (req: CompletionRequest) => payloadOf(req).groups.flatMap((g) => g.items.map((i) => i.key));
const done = (text: string, finish: CompletionResult['finish'] = 'stop'): CompletionResult =>
  ({ text, finish, dialect: 'openai-jsonSchema', model: 'fake', ms: 1 });

describe('runTranslation', () => {
  it('translates a chunk in one request when every item passes', async () => {
    const plan = planOf([{ jobs: [
      { key: 't1', source: 'Explain the deadweight loss.' },
      { key: 't2', source: [{ text: 'Give ' }, { text: 'TWO', bold: true }, { text: ' reasons.' }] },
    ] }]);
    const client = scriptedClient([reply([['t1', '解釋效率損失。'], ['t2', '舉出<b>兩個</b>原因。']])]);
    const outcome = await run(plan, depsFor(client));
    expect(client.requests).toHaveLength(1);
    expect(outcome).toMatchObject({ stopped: false, model: 'fake' });
    expect(outcome.fatal).toBeUndefined();
    expect(outcome.results.get('t1')).toMatchObject({ status: 'ready', passes: 1, defaultAccepted: true, runs: [{ text: '解釋效率損失。' }] });
    expect(outcome.results.get('t2')!.runs).toEqual([{ text: '舉出' }, { text: '兩個', bold: true }, { text: '原因。' }]);
  });

  it('auto-fixes a deny form without a second request, and notes it', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Supply falls.' }] }]);
    const client = scriptedClient([reply([['t1', '供給下降。']])]);
    const result = (await run(plan, depsFor(client))).results.get('t1')!;
    expect(client.requests).toHaveLength(1);
    expect(result).toMatchObject({ status: 'ready', runs: [{ text: '供應下降。' }], fixes: [{ from: '供給', to: '供應', how: 'autoFix' }] });
  });

  it('sends a missing multi-word term to the repair pass with the right fix note', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Explain why market failure occurs.' }, { key: 't2', source: 'Explain.' }] }]);
    const client = scriptedClient([
      reply([['t1', '解釋為什麼會出現市場問題。'], ['t2', '解釋。']]),
      reply([['t1', '解釋為什麼會出現市場失效。']]),
    ]);
    const outcome = await run(plan, depsFor(client));
    const repair = payloadOf(client.requests[1]);
    expect(repair.task).toBe('repair');
    expect(repair.groups[0].items).toEqual([expect.objectContaining({
      key: 't1', previous: '解釋為什麼會出現市場問題。', fix: ['Use “市場失效” for “market failure”.'],
    })]);
    expect(client.requests[1].system).toContain('changes only what the fix notes ask');
    expect(outcome.results.get('t1')).toMatchObject({ status: 'ready', passes: 2, runs: [{ text: '解釋為什麼會出現市場失效。' }] });
    expect(outcome.results.get('t2')).toMatchObject({ status: 'ready', passes: 1 });
  });

  it('retries a lost blank once, then fails the row: never applied', async () => {
    const source = [{ text: 'Output falls by ' }, { text: ' '.repeat(12), underline: true }, { text: '.' }];
    const plan = planOf([{ jobs: [{ key: 't1', source }] }]);
    const client = scriptedClient([reply([['t1', '產量下降。']])]);
    const result = (await run(plan, depsFor(client))).results.get('t1')!;
    expect(client.requests).toHaveLength(2);
    expect(payloadOf(client.requests[1]).groups[0].items[0].fix).toEqual(['Keep exactly 1 <blank/> marker; you returned 0.']);
    expect(result).toMatchObject({ status: 'failed', passes: 2, defaultAccepted: false });
    expect(result.runs).toBeUndefined();
    expect(writesFor(plan, { results: new Map([['t1', result]]), stopped: false, model: '', ms: 0 }, new Set(['t1']), false)).toEqual([]);
  });

  it('keeps the better of the two passes', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Explain why market failure occurs.' }] }]);
    // Pass 2 fixes the term but loses a full stop into a derived label: pass 1 stays.
    const client = scriptedClient([reply([['t1', '解釋為什麼會出現市場問題。']]), reply([['t1', '(a)解釋為什麼會出現市場失效。']])]);
    const result = (await run(plan, depsFor(client))).results.get('t1')!;
    expect(result).toMatchObject({ status: 'flagged', passes: 2, runs: [{ text: '解釋為什麼會出現市場問題。' }] });
    expect(result.terms.map((t) => t.state)).toEqual(['missing']);
  });

  it('converts Simplified characters left after pass 2, with a note', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Explain this.' }] }]);
    const client = scriptedClient([reply([['t1', '解释这个。']])]);
    const result = (await run(plan, depsFor(client))).results.get('t1')!;
    expect(payloadOf(client.requests[1]).groups[0].items[0].fix?.[0]).toBe('Use Traditional Chinese (Hong Kong) characters: 釋, not 释; 這, not 这; 個, not 个.');
    expect(result.runs).toEqual([{ text: '解釋這個。' }]);
    expect(result.fixes).toEqual(expect.arrayContaining([
      { from: '这', to: '這', how: 'simplified' }, { from: '释', to: '釋', how: 'simplified' },
    ]));
    expect(result.issues.map((i) => i.code)).not.toContain('simplified');
  });
});

const many = (n: number, from = 1): Spec[] =>
  Array.from({ length: n }, (_, i) => ({ key: `t${from + i}`, source: `Explain reason ${String.fromCharCode(97 + (i % 26))}.` }));
const echo = (req: CompletionRequest) => reply(keysOf(req).map((key) => [key, '解釋這個原因。']));
const fatal = new AiError({ kind: 'region', provider: 'deepseek', message: 'Not in your region.', fatal: true, actions: [] });

describe('whole-response failures', () => {
  it('bisects a truncated reply to depth 3, then fails the rows as truncated', async () => {
    const plan = planOf([{ jobs: many(16) }]);
    const client = scriptedClient([done('', 'length')]);
    const outcome = await run(plan, depsFor(client));
    expect(client.requests.map((r) => keysOf(r).length)).toEqual([16, 8, 4, 2, 2, 4, 2, 2, 8, 4, 2, 2, 4, 2, 2]);
    expect([...outcome.results.values()].every((r) => r.status === 'failed' && r.error?.kind === 'truncated')).toBe(true);
  });

  it('isolates the one item a safety filter blocks', async () => {
    const plan = planOf([{ jobs: many(4) }]);
    const client = scriptedClient([(req) => (keysOf(req).includes('t3') ? done('', 'safety') : echo(req))]);
    const outcome = await run(plan, depsFor(client));
    expect(outcome.results.get('t3')).toMatchObject({ status: 'failed', error: { kind: 'safety' } });
    for (const key of ['t1', 't2', 't4']) expect(outcome.results.get(key)!.status).toBe('ready');
  });

  it('asks once more after an unreadable reply, then fails the row', async () => {
    const retried = scriptedClient(['Sorry, I cannot.', echo]);
    const ok = await run(planOf([{ jobs: many(2) }]), depsFor(retried));
    expect([...ok.results.values()].map((r) => r.status)).toEqual(['ready', 'ready']);
    expect(retried.requests).toHaveLength(2);

    const garbage = scriptedClient(['no json here']);
    const bad = await run(planOf([{ jobs: many(1) }]), depsFor(garbage));
    expect(bad.results.get('t1')).toMatchObject({ status: 'failed', error: { kind: 'badOutput' } });
  });

  it('fails a chunk’s rows on transport trouble and carries on', async () => {
    const plan = planOf([{ jobs: many(1) }, { direction: 'toEn', jobs: [{ key: 't2', source: '解釋結果。' }] }]);
    const server = new AiError({ kind: 'server', provider: 'deepseek', message: 'Server error.', fatal: false, actions: ['retry'] });
    const client = scriptedClient([server, reply([['t2', 'Explain the result.']])]);
    const outcome = await run(plan, depsFor(client));
    expect(outcome.fatal).toBeUndefined();
    expect(outcome.results.get('t1')).toMatchObject({ status: 'failed', error: { kind: 'server' } });
    expect(outcome.results.get('t2')!.status).toBe('ready');
  });

  it('stops at a fatal error, keeping finished chunks and skipping the rest', async () => {
    const plan = planOf([{ jobs: many(2) }, { jobs: many(2, 3) }, { jobs: many(2, 5) }]);
    const client = scriptedClient([echo, fatal]);
    const outcome = await run(plan, depsFor(client));
    expect(client.requests).toHaveLength(2);
    expect(outcome.fatal).toEqual(fatal.info);
    expect([...outcome.results.keys()]).toEqual(['t1', 't2']);
    expect(outcome.stopped).toBe(false);
  });

  it('stops on abort with finished results and no further request', async () => {
    const controller = new AbortController();
    const plan = planOf([{ jobs: many(2) }, { jobs: many(2, 3) }]);
    const client = scriptedClient([(req) => {
      controller.abort();
      return echo(req);
    }]);
    const outcome = await run(plan, depsFor(client), controller.signal);
    expect(client.requests).toHaveLength(1);
    expect(outcome.stopped).toBe(true);
    expect([...outcome.results.keys()]).toEqual(['t1', 't2']);
  });

  it('reports progress in order', async () => {
    const plan = planOf([{ jobs: many(1) }, { jobs: [{ key: 't2', source: 'Explain why market failure occurs.' }] }]);
    const client = scriptedClient([echo, reply([['t2', '解釋市場問題。']]), reply([['t2', '解釋市場失效。']])]);
    const progress: RunProgress[] = [];
    await run(plan, depsFor(client), undefined, progress);
    expect(progress.map((p) => `${p.phase} ${p.requestsDone}/${p.requestsTotal}`)).toEqual([
      'translating 0/2', 'checking 1/2', 'translating 1/2', 'checking 2/2', 'fixing 2/3', 'checking 3/3',
    ]);
  });

  it('shows the client’s rate-limit wait, then carries on', async () => {
    const sleep = announcedSleep(async () => {});
    const base = scriptedClient([echo]);
    const client = { ...base, complete: async (req: CompletionRequest) => (await sleep(12_000, req.signal), base.complete(req)) };
    const progress: RunProgress[] = [];
    await run(planOf([{ jobs: many(1) }]), { ...depsFor(client), sleep }, undefined, progress);
    expect(progress.map((p) => `${p.phase}${p.waitMs ? ` ${p.waitMs}` : ''}`)).toEqual(['translating', 'waiting 12000', 'translating', 'checking']);
    // Outside a run the same sleep announces nothing.
    await sleep(1, new AbortController().signal);
    expect(progress).toHaveLength(4);
  });

  it('ends a rate-limit wait at once on Stop', async () => {
    const controller = new AbortController();
    const waiting = announcedSleep()(60_000, controller.signal);
    controller.abort();
    await expect(waiting).resolves.toBeUndefined();
  });
});

describe('the result', () => {
  it('ticks formatting-only flags by default and leaves content risks unticked', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'State ONE feature.' }, { key: 't2', source: 'Output rose by 3 000 units.' }] }]);
    const client = scriptedClient([reply([['t1', '寫出一項特徵。'], ['t2', '產量增加了若干單位。']])]);
    const outcome = await run(plan, depsFor(client));
    expect(outcome.results.get('t1')).toMatchObject({ status: 'flagged', defaultAccepted: true });
    expect(outcome.results.get('t1')!.issues.map((i) => i.code)).toEqual(['emphasis']);
    expect(outcome.results.get('t2')).toMatchObject({ status: 'flagged', defaultAccepted: false });
    expect(outcome.results.get('t2')!.issues.map((i) => i.code)).toContain('numbers');
  });

  it('leaves a meaning-reversed term unticked', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Explain elastic demand.' }] }]);
    const client = scriptedClient([reply([['t1', '解釋低彈性需求。']])]);
    const result = (await run(plan, depsFor(client))).results.get('t1')!;
    expect(payloadOf(client.requests[1]).groups[0].items[0].fix).toEqual([
      '“低彈性需求” means “inelastic demand”; the English says “elastic demand” → 彈性需求.',
    ]);
    expect(result).toMatchObject({ status: 'flagged', passes: 2, defaultAccepted: false });
    expect(result.terms.map((t) => t.conflict?.meansEn)).toEqual(['inelastic demand']);
  });

  it('runs without a glossary: no pins, chips or auto-fix', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Explain why market failure occurs.' }] }]);
    const client = scriptedClient([reply([['t1', '解釋為什麼會出現市場失靈。']])]);
    const outcome = await run(plan, depsFor(client, false));
    expect(payloadOf(client.requests[0]).glossary).toEqual([]);
    expect(outcome.results.get('t1')).toMatchObject({ status: 'ready', terms: [], fixes: [] });
  });
});

describe('writesFor', () => {
  it('fans accepted jobs out to every slot and adds copies only when accepted', async () => {
    const plan = planOf([{ jobs: [{ key: 't1', source: 'Explain.', slots: 2 }, { key: 't2', source: 'Explain the loss.' }] }]);
    const copy = { path: 'cell', side: 'zh' as const, sourceSnapshot: [{ text: '2024' }], targetSnapshot: [], next: [{ text: '2024' }] };
    plan.copies.push(copy);
    const outcome = await run(plan, depsFor(scriptedClient([reply([['t1', '解釋。'], ['t2', '解釋損失。']])])));
    const writes = writesFor(plan, outcome, new Set(['t1']), true);
    expect(writes.map((w) => [w.path, plain(w.next)])).toEqual([['t1/p0', '解釋。'], ['t1/p1', '解釋。'], ['cell', '2024']]);
    expect(writes[0]).toMatchObject({ side: 'zh', sourceSnapshot: [{ text: 'Explain.' }], targetSnapshot: [] });
    expect(writesFor(plan, outcome, new Set(['t2']), false).map((w) => w.path)).toEqual(['t2/p0']);
  });
});

describe('translateOne', () => {
  it('fills one BiText through the same pipeline, English wording keeping its space', async () => {
    const client = scriptedClient([reply([['t1', 'There are']])]);
    const result = await translateOne({ en: [], zh: [{ text: '本卷共有' }] }, 'toEn', { kind: 'wording', aroundValue: 'before' },
      depsFor(client), new AbortController().signal);
    expect(result.status).toBe('ready');
    expect(plain(result.runs!)).toBe('There are ');
  });

  it('fails without a request when the source side is empty, and reports a fatal error', async () => {
    const none = scriptedClient([]);
    const empty = await translateOne({ en: [], zh: [] }, 'toZh', { kind: 'part' }, depsFor(none), new AbortController().signal);
    expect(empty).toMatchObject({ status: 'failed', defaultAccepted: false });
    expect(none.requests).toHaveLength(0);
    const failing = await translateOne({ en: [{ text: 'Explain.' }], zh: [] }, 'toZh', { kind: 'part' },
      depsFor(scriptedClient([fatal])), new AbortController().signal);
    expect(failing).toMatchObject({ status: 'failed', error: { kind: 'region' } });
  });
});
