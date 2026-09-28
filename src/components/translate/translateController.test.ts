import { describe, expect, it, vi } from 'vitest';
import { presetFor } from '@/ai/providers';
import { createWorksheet } from '@/model/factories';
import { rt } from '@/model/text';
import type { ApplyReport, TranslationWrite } from '@/model/textSlots';
import type { OutputMode } from '@/model/types';
import type { AiStatus } from '@/settings/aiSettings';
import type { TranslateRequest } from '@/store/appDialogs';
import type { JobResult, RunDeps, RunOutcome, RunProgress, TermRow, TranslateOptions, TranslationPlan } from '@/translate/types';
import { createTranslateController, type ControllerDeps } from './translateController';
import { PAPER_REQUEST, WS_ID, counts, fakePlan, job, result } from './sessionFixtures';
import { createSessionStore, pendingKeys } from './translateSession';

const JOBS = [job('t1', 'Supply falls.'), job('t2', 'Price rises.'), job('t3', 'Demand is elastic.')];
const status = (configured: boolean): AiStatus => {
  const preset = presetFor('gemini');
  return { provider: 'gemini', preset, model: preset.models[0].id, baseUrl: preset.baseUrl, configured, keyStore: null };
};

/** A run that answers t1 and t2 at once and holds t3 until released or aborted. */
function scriptedRun() {
  let release: (() => void) | null = null;
  const calls: TranslationPlan[] = [];
  const run = (plan: TranslationPlan, _deps: RunDeps, signal: AbortSignal, onProgress: (p: RunProgress) => void) => {
    calls.push(plan);
    onProgress({ phase: 'translating', requestsDone: 0, requestsTotal: 1 });
    const results = new Map<string, JobResult>(
      [...plan.jobs.keys()].filter((k) => k !== 't3').map((k) => [k, result(k, `中${k}`)]),
    );
    return new Promise<RunOutcome>((resolve) => {
      const done = (stopped: boolean, all: boolean) => {
        if (all && plan.jobs.has('t3')) results.set('t3', result('t3', '中t3'));
        resolve({ results, stopped, model: 'gemini-3.5-flash-lite', ms: 900 });
      };
      signal.addEventListener('abort', () => done(true, false));
      release = () => done(false, true);
    });
  };
  return { run, calls, release: () => release?.() };
}

function setup(over: Partial<ControllerDeps> = {}, mode: OutputMode = { language: 'bilingual', version: 'student' }) {
  const store = createSessionStore();
  const scripted = scriptedRun();
  const applied: TranslationWrite[][] = [];
  const deps: ControllerDeps = {
    store,
    getWorksheet: () => ({ ...createWorksheet(), id: WS_ID }),
    getMode: () => mode,
    readStatus: () => status(true),
    includeTeacherText: () => true,
    rememberIncludeTeacher: vi.fn(),
    desktop: () => false,
    plan: vi.fn(() => fakePlan(JOBS)),
    createRunDeps: vi.fn(async () => ({
      ok: true as const,
      deps: {} as RunDeps,
      config: { provider: 'gemini' as const, apiKey: 'k', model: 'm', baseUrl: '' },
    })),
    run: scripted.run,
    writesFor: (plan, _outcome, accepted) =>
      [...accepted].flatMap((key) =>
        plan.jobs.get(key)!.slots.map((s) => ({ path: s.path, side: s.side, sourceSnapshot: s.sourceSnapshot, targetSnapshot: s.targetSnapshot, next: [] })),
      ),
    termFixWrites: (rows, accepted) =>
      rows.filter((r) => accepted.has(r.path)).map((r) => ({ path: r.path, side: 'zh', sourceSnapshot: r.en, targetSnapshot: r.zh, next: [] })),
    apply: vi.fn((writes: readonly TranslationWrite[]): ApplyReport => {
      applied.push([...writes]);
      return { applied: writes.length, skipped: [], resized: 0 };
    }),
    closeDialog: vi.fn(),
    openSettings: vi.fn(),
    notify: vi.fn(),
    undo: vi.fn(),
    showSide: vi.fn(),
    keySaved: vi.fn(() => false),
    setProvider: vi.fn(),
    setModel: vi.fn(),
    openExternal: vi.fn(),
    showOnPage: vi.fn(),
    ...over,
  };
  const controller = createTranslateController(deps);
  return { controller, deps, store, scripted, applied, session: () => store.getState().session };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('translateController', () => {
  it('plan → run → review → insert is one apply call, then a flash with Undo', async () => {
    const t = setup();
    t.controller.open(PAPER_REQUEST);
    expect(t.session().phase).toBe('setup');
    t.controller.translate();
    await flush();
    expect(t.session().phase).toBe('running');
    expect(t.session().progress?.phase).toBe('translating');
    t.scripted.release();
    await flush();
    expect(t.session().phase).toBe('review');
    t.controller.insert();
    expect(t.deps.apply).toHaveBeenCalledTimes(1);
    expect(t.deps.apply).toHaveBeenCalledWith(expect.any(Array), { worksheetId: WS_ID });
    expect(t.applied[0].map((w) => w.path)).toEqual(['q:Q3/t1', 'q:Q3/t2', 'q:Q3/t3']);
    expect(t.deps.closeDialog).toHaveBeenCalledTimes(1);
    expect(t.deps.notify).toHaveBeenCalledWith('Filled 3 texts', expect.objectContaining({ label: 'Undo' }));
    expect(t.session().request).toBeNull();
  });

  it('offers View 中文 when the filled side is hidden in the editor', async () => {
    const t = setup({}, { language: 'en', version: 'student' });
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    t.scripted.release();
    await flush();
    t.controller.insert();
    const action = vi.mocked(t.deps.notify).mock.calls[0][1]!;
    expect(action.label).toBe('View 中文');
    action.run();
    expect(t.deps.showSide).toHaveBeenCalledWith('zh');
  });

  it('one close while running only asks; the second stops and keeps finished rows', async () => {
    const t = setup();
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    t.controller.requestClose();
    await flush();
    expect(t.session().phase).toBe('running');
    expect(t.session().confirm).toEqual({ kind: 'stop' });
    t.controller.keepGoing();
    expect(t.session().confirm).toBeNull();
    t.controller.requestClose();
    t.controller.requestClose();
    await flush();
    expect(t.session().phase).toBe('review');
    expect(t.session().run?.stopped).toBe(true);
    expect(pendingKeys(t.session().run!)).toEqual(['t3']);
    expect(t.deps.closeDialog).not.toHaveBeenCalled();
    // Retry sends only the unfinished job.
    t.controller.retry();
    await flush();
    t.scripted.release();
    await flush();
    expect([...t.scripted.calls[1].jobs.keys()]).toEqual(['t3']);
    expect(t.session().run?.results.size).toBe(3);
  });

  it('closing Review asks before discarding paid work', async () => {
    const t = setup();
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    t.scripted.release();
    await flush();
    t.controller.requestClose();
    expect(t.session().confirm).toEqual({ kind: 'discard', then: 'close' });
    expect(t.deps.closeDialog).not.toHaveBeenCalled();
    t.controller.requestClose();
    expect(t.deps.closeDialog).toHaveBeenCalledTimes(1);
    expect(t.deps.apply).not.toHaveBeenCalled();
  });

  it('Stop before anything finished goes back to Setup', async () => {
    const t = setup({ run: (_p, _d, signal) => new Promise((resolve) => signal.addEventListener('abort', () => resolve({ results: new Map(), stopped: true, model: '', ms: 0 }))) });
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    t.controller.stop();
    await flush();
    expect(t.session().phase).toBe('setup');
    expect(t.session().run).toBeNull();
  });

  it('all writes stale: the dialog stays open on "Nothing inserted"', async () => {
    const t = setup({ apply: vi.fn((w: readonly TranslationWrite[]) => ({ applied: 0, skipped: w.map((x) => ({ path: x.path, reason: 'sourceChanged' as const })), resized: 0 })) });
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    t.scripted.release();
    await flush();
    t.controller.insert();
    expect(t.session().nothingInserted).toBe(true);
    expect(t.deps.closeDialog).not.toHaveBeenCalled();
    expect(t.deps.notify).not.toHaveBeenCalled();
    t.controller.requestClose();
    expect(t.deps.closeDialog).toHaveBeenCalledTimes(1);
  });

  it('a refused apply (read-only, other document) just closes', async () => {
    const t = setup({ apply: vi.fn(() => ({ applied: 0, skipped: [], resized: 0, refused: 'readOnly' as const })) });
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    t.scripted.release();
    await flush();
    t.controller.insert();
    expect(t.deps.closeDialog).toHaveBeenCalledTimes(1);
    expect(t.deps.notify).not.toHaveBeenCalled();
  });

  it('auto-starts a page fill of ≤ 3 texts only when a provider is set up', async () => {
    const request: TranslateRequest = { ...PAPER_REQUEST, scope: { kind: 'paths', paths: ['q:Q3/t1'] }, autoStart: true };
    const small = () => ({ ...fakePlan(JOBS), counts: { ...fakePlan(JOBS).counts, toZh: 1 } });
    const ready = setup({ plan: vi.fn(small) });
    ready.controller.open(request);
    await flush();
    expect(ready.session().phase).toBe('running');
    const unset = setup({ plan: vi.fn(small), readStatus: () => status(false) });
    unset.controller.open(request);
    expect(unset.session().phase).toBe('setup');
  });

  it('opens on Check terms when asked, or when nothing needs filling', () => {
    const check = setup();
    check.controller.open({ ...PAPER_REQUEST, mode: 'check' });
    expect(check.session().mode).toBe('check');
    const nothing = setup({ plan: vi.fn(() => fakePlan([])) });
    nothing.controller.open(PAPER_REQUEST);
    expect(nothing.session().mode).toBe('check');
    const fill = setup();
    fill.controller.open(PAPER_REQUEST);
    expect(fill.session().mode).toBe('translate');
  });

  it('symbol gaps: EN+中 copies none and opens on Check terms; 中文 copies only into 中文', () => {
    const copy = (side: 'zh' | 'en'): TranslationWrite => ({ path: `c-${side}`, side, sourceSnapshot: rt('E₀'), targetSnapshot: [], next: rt('E₀') });
    // Only symbol gaps, one per side; the plan copies what the options ask for.
    const plan = vi.fn((_ws: unknown, _scope: unknown, options: TranslateOptions) => {
      const copies = [...(options.copySymbols.toZh ? [copy('zh')] : []), ...(options.copySymbols.toEn ? [copy('en')] : [])];
      return { ...fakePlan([], copies), counts: counts({ symbols: { toZh: 1, toEn: 1 }, copied: copies.length }) };
    });
    const bilingual = setup({ plan });
    bilingual.controller.open(PAPER_REQUEST);
    expect(bilingual.session().mode).toBe('check');
    const zh = setup({ plan }, { language: 'zh', version: 'student' });
    zh.controller.open(PAPER_REQUEST);
    expect(zh.session().mode).toBe('translate');
    zh.controller.copySymbols();
    expect(zh.applied[0].map((w) => w.path)).toEqual(['c-zh']);
    expect(zh.deps.notify).toHaveBeenCalledWith('Filled 1 text', expect.anything());
  });

  it('the teacher-text box is remembered; other options are not', () => {
    const t = setup();
    t.controller.open(PAPER_REQUEST);
    t.controller.setOptions({ includeTeacher: false });
    expect(t.deps.rememberIncludeTeacher).toHaveBeenCalledWith(false);
    expect(t.session().options?.includeTeacher).toBe(false);
    t.controller.setOptions({ includeDiagramLabels: false });
    expect(t.deps.rememberIncludeTeacher).toHaveBeenCalledTimes(1);
  });

  it('a run that cannot start shows the setup error, not a crash', async () => {
    const t = setup({ createRunDeps: vi.fn(async () => ({ ok: false as const, provider: 'deepseek' as const, reason: 'noKey' as const })) });
    t.controller.open(PAPER_REQUEST);
    t.controller.translate();
    await flush();
    expect(t.session().phase).toBe('error');
    expect(t.session().error).toMatchObject({ kind: 'notConfigured', message: 'No key for DeepSeek is saved on this browser.' });
  });

  it('Use DeepSeek: switches and retries with a saved key, else deep-links with returnTo', async () => {
    const without = setup();
    without.controller.open(PAPER_REQUEST);
    without.controller.useProvider('deepseek');
    expect(without.deps.openSettings).toHaveBeenCalledWith(
      { section: 'ai', focus: 'key', params: { provider: 'deepseek', reason: 'region' } },
      PAPER_REQUEST,
    );
    const saved = setup({ keySaved: vi.fn(() => true) });
    saved.controller.open(PAPER_REQUEST);
    saved.controller.translate();
    await flush();
    saved.scripted.release();
    await flush();
    saved.controller.useProvider('deepseek');
    expect(saved.deps.setProvider).toHaveBeenCalledWith('deepseek');
    expect(saved.session().phase).toBe('running');
  });

  it('Replace terms writes only the ticked fixes and flashes the term count', () => {
    const t = setup();
    t.controller.open({ ...PAPER_REQUEST, mode: 'check' });
    const check = (denyKind: 'wrong' | 'variant'): TermRow['checks'][number] => ({
      entryId: 1,
      en: 'supply',
      source: { text: 'supply', start: 0, end: 6 },
      state: 'missing',
      severity: 'warn',
      expected: '供應',
      fix: { start: 0, end: 2, to: '供應', kind: 'deny', denyKind },
    });
    const rows: TermRow[] = [
      { path: 'a', slot: {} as TermRow['slot'], en: [], zh: [], checks: [check('wrong')] },
      { path: 'b', slot: {} as TermRow['slot'], en: [], zh: [], checks: [check('variant')] },
    ];
    t.controller.replaceTerms(rows);
    expect(t.applied[0].map((w) => w.path)).toEqual(['a']);
    expect(t.deps.notify).toHaveBeenCalledWith('Replaced 1 term', expect.objectContaining({ label: 'Undo' }));
  });
});
