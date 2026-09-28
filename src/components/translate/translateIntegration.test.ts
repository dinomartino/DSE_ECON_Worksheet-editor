import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { migrate } from '@/model/migrations';
import { collectTexts, mapWorksheetTexts } from '@/model/textWalk';
import type { ApplyReport, TextPath, TranslationWrite } from '@/model/textSlots';
import type { OutputMode, RichText, Worksheet } from '@/model/types';
import { peekSecret, writeSecret } from '@/platform/secrets';
import { AI_SETTINGS, readAiStatus } from '@/settings/aiSettings';
import { appSettings } from '@/settings/store';
import { useAppDialogs, type TranslateRequest } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { createRunDeps } from '@/translate/deps';
import { planTranslation } from '@/translate/plan';
import { runTranslation, writesFor } from '@/translate/run';
import { buildTermCheck, termFixWrites } from '@/translate/termCheck';
import { oneSided, readCorpus, referenceClient } from '@/translate/testKit';
import type { TermRow } from '@/translate/types';
import { filledFlash, replacedTermsFlash } from './copy';
import { glossaryTermCount, scopeChoices, setupState, type TranslateView } from './SetupPanel';
import { createTranslateController, type ControllerDeps } from './translateController';
import { acceptedKeys, createSessionStore, hostAction, insertCount, probeOptions, termKey } from './translateSession';

/**
 * The dialog's controller over the real producers: planTranslation, runTranslation,
 * writesFor, createRunDeps (real Settings, secrets and glossary), termFixWrites,
 * buildTermCheck and worksheetStore.applyTranslations. Only the AiClient is a fake,
 * injected into the deps createRunDeps resolved.
 */

class FakeStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

beforeAll(async () => {
  const local = new FakeStorage();
  local.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider: 'deepseek' }));
  vi.stubGlobal('window', {
    localStorage: local,
    sessionStorage: new FakeStorage(),
    addEventListener: () => {},
    removeEventListener: () => {},
  });
  await writeSecret('ai:deepseek', 'sk-deepseek-12345678', { remember: false });
});
afterAll(() => vi.unstubAllGlobals());

const store = () => useWorksheetStore.getState();

function load(worksheet: Worksheet) {
  useWorksheetStore.setState({ worksheet, past: [], future: [], dirty: false, readOnly: false });
}

/** Rewrites the 中文 of `paths` in the open document without an undo entry (a teacher's edit). */
function editZh(paths: ReadonlySet<TextPath>, zh: RichText = [{ text: '老師自己寫的。' }]) {
  const worksheet = mapWorksheetTexts(store().worksheet, (slot) => (paths.has(slot.path) ? { ...slot.text, zh } : slot.text));
  useWorksheetStore.setState({ worksheet });
}

const aiSettings = () => appSettings.read(AI_SETTINGS);

/** The controller bound as TranslateHost binds it; only the AiClient and the flash are fakes. */
function harness(client = referenceClient(buildAcceptanceWorksheet()), mode: OutputMode = { language: 'bilingual', version: 'student' }, over: Partial<ControllerDeps> = {}) {
  const session = createSessionStore();
  const writes: TranslationWrite[][] = [];
  const reports: ApplyReport[] = [];
  const notify = vi.fn();
  const closeDialog = vi.fn();
  let glossaryLoaded = false;
  const controller = createTranslateController({
    store: session,
    getWorksheet: () => store().worksheet,
    getMode: () => mode,
    readStatus: readAiStatus,
    includeTeacherText: () => aiSettings().includeTeacherText,
    rememberIncludeTeacher: (on) => appSettings.write(AI_SETTINGS, { includeTeacherText: on }),
    desktop: () => false,
    plan: planTranslation,
    createRunDeps: async (opts) => {
      const resolved = await createRunDeps(opts);
      if (!resolved.ok) return resolved;
      glossaryLoaded = (resolved.deps.glossary?.entries.length ?? 0) > 0;
      return { ...resolved, deps: { ...resolved.deps, client } };
    },
    run: runTranslation,
    writesFor,
    termFixWrites,
    apply: (batch, opts) => {
      writes.push([...batch]);
      const report = store().applyTranslations(batch, opts);
      reports.push(report);
      return report;
    },
    closeDialog,
    openSettings: vi.fn(),
    notify,
    undo: () => store().undo(),
    showSide: vi.fn(),
    keySaved: (provider) => peekSecret(`ai:${provider}`) !== null || aiSettings().keychainSaved[provider] === true,
    setProvider: vi.fn(),
    setModel: vi.fn(),
    openExternal: vi.fn(),
    showOnPage: vi.fn(),
    ...over,
  });
  const request = (mode: TranslateRequest['mode']): TranslateRequest => ({ worksheetId: store().worksheet.id, mode, scope: { kind: 'paper' } });
  return { controller, session: () => session.getState().session, writes, reports, notify, closeDialog, client, request, glossary: () => glossaryLoaded };
}

/** Opens the English-only acceptance paper and runs it to Review. */
async function translatedToReview() {
  load(oneSided(buildAcceptanceWorksheet(), 'en'));
  const t = harness();
  t.controller.open(t.request('translate'));
  expect(t.session()).toMatchObject({ mode: 'translate', phase: 'setup' });
  t.controller.translate();
  await vi.waitFor(() => expect(t.session().phase).toBe('review'), { timeout: 5000 });
  return t;
}

describe('Translate over the real engine and store', () => {
  it('plan → run → review → insert: every job answered, one commit, one ⌘Z restores the paper', async () => {
    const t = await translatedToReview();
    const before = JSON.stringify(store().worksheet);
    const run = t.session().run!;
    expect(t.glossary()).toBe(true);
    expect(t.client.requests.length).toBeGreaterThan(0);
    expect(run.results.size).toBe(run.plan.jobs.size);
    const count = insertCount(t.session());
    expect(count).toBeGreaterThan(0);

    t.controller.insert();
    expect(t.writes).toHaveLength(1);
    expect(t.reports[0]).toMatchObject({ skipped: [] });
    expect(t.reports[0].applied).toBe(t.writes[0].length);
    expect(store().past).toHaveLength(1);
    expect(store().dirty).toBe(true);
    expect(t.closeDialog).toHaveBeenCalledTimes(1);
    expect(t.notify).toHaveBeenCalledWith(filledFlash(count, 0), expect.objectContaining({ label: 'Undo' }));

    // Every write landed: the slot's 中文 is what the write carried.
    const zh = new Map(collectTexts(store().worksheet).map((slot) => [slot.path, JSON.stringify(slot.text.zh)]));
    for (const write of t.writes[0]) expect(zh.get(write.path)).toBe(JSON.stringify(write.next));

    t.notify.mock.calls[0][1].run();
    expect(JSON.stringify(store().worksheet)).toBe(before);
    expect(store().past).toHaveLength(0);
  });

  it('a text edited while translating is skipped by the path writesFor gave it; the flash counts rows', async () => {
    const t = await translatedToReview();
    const run = t.session().run!;
    const accepted = [...acceptedKeys(t.session())].map((key) => run.plan.jobs.get(key)!);
    const shared = accepted.find((job) => job.slots.length > 1)!;
    const single = accepted.find((job) => job.slots.length === 1)!;
    expect(shared && single).toBeTruthy();
    // One slot of a ×n row (still filled) and the only slot of another row (skipped).
    const stale = new Set([shared.slots[0].path, single.slots[0].path]);
    editZh(stale);
    const count = insertCount(t.session());

    t.controller.insert();
    const report = t.reports[0];
    const written = new Set(t.writes[0].map((w) => w.path));
    expect(report.skipped.map((s) => s.path).sort()).toEqual([...stale].sort());
    for (const skip of report.skipped) {
      expect(written.has(skip.path)).toBe(true);
      expect(skip.reason).toBe('targetChanged');
    }
    expect(report.applied).toBe(t.writes[0].length - stale.size);
    expect(store().past).toHaveLength(1);
    expect(t.notify).toHaveBeenCalledWith(filledFlash(count - 1, 1), expect.anything());
  });

  it('a batch that is all stale inserts nothing: no undo entry, the dialog stays with its message', async () => {
    const t = await translatedToReview();
    const run = t.session().run!;
    editZh(new Set([...acceptedKeys(t.session())].flatMap((key) => run.plan.jobs.get(key)!.slots.map((s) => s.path))));
    const worksheet = store().worksheet;

    t.controller.insert();
    expect(t.reports[0].applied).toBe(0);
    expect(store().worksheet).toBe(worksheet);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
    expect(t.session().nothingInserted).toBe(true);
    expect(t.closeDialog).not.toHaveBeenCalled();
    expect(t.notify).not.toHaveBeenCalled();
  });
});

/** One question, a paragraph per `[en, zh]` pair. */
function paperOf(pairs: Array<[string, string]>): Worksheet {
  const para = ([en, zh]: [string, string]) => ({ ...createParagraphBlock(), text: { en: [{ text: en }], zh: [{ text: zh }] } });
  return { ...createWorksheet(), questions: [{ ...createStructuredQuestion(), blocks: pairs.map(para) }] };
}

/** One entry's old form twice, and one it cannot fix (a space inside it) beside a fixable one. */
const priceLevelPaper = () => paperOf([
  ['The price level rises and the price level falls.', '價格水平上升，價格水平下降。'],
  ['The price level rises; total revenue falls.', '價格 水平上升；總收益下降。'],
]);

/** Opens Check terms and returns the rows the host computes (buildTermCheck, real glossary). */
async function checking(worksheet: Worksheet) {
  load(worksheet);
  const t = harness();
  t.controller.open(t.request('check'));
  expect(t.session().mode).toBe('check');
  const rows = buildTermCheck(store().worksheet, await loadGlossary(), t.session().scope);
  const tickFixes = (only?: (row: TermRow) => boolean) => {
    for (const row of rows.filter(only ?? (() => true))) {
      row.checks.forEach((check, i) => check.fix && t.controller.toggleTerm(termKey(row.path, i), true));
    }
  };
  return { t, rows, tickFixes };
}

describe('Check terms over the real glossary and store', () => {
  it('replaces several fixes in one entry, leaves a fixless check alone, one commit and one ⌘Z', async () => {
    const { t, rows, tickFixes } = await checking(priceLevelPaper());
    const before = JSON.stringify(store().worksheet);
    expect(rows.map((r) => r.checks.length)).toEqual([2, 2]);
    expect(rows[1].checks.filter((c) => !c.fix)).toHaveLength(1);
    tickFixes();

    t.controller.replaceTerms(rows);
    expect(t.writes).toHaveLength(1);
    expect(store().past).toHaveLength(1);
    expect(t.notify).toHaveBeenCalledWith(replacedTermsFlash(3), expect.objectContaining({ label: 'Undo' }));
    const zh = new Map(collectTexts(store().worksheet).map((slot) => [slot.path, slot.text.zh]));
    expect(zh.get(rows[0].path)).toEqual([{ text: '物價水平上升，物價水平下降。' }]);
    expect(zh.get(rows[1].path)).toEqual([{ text: '價格 水平上升；總收入下降。' }]);

    t.notify.mock.calls[0][1].run();
    expect(JSON.stringify(store().worksheet)).toBe(before);
  });

  it('on the v1 corpus, every ticked fix lands at the path the check read', async () => {
    const { t, rows, tickFixes } = await checking({ ...migrate(structuredClone(readCorpus())), id: 'corpus' });
    expect(rows.some((r) => r.checks.some((c) => c.fix?.to === '稅收承擔'))).toBe(true);
    tickFixes();

    t.controller.replaceTerms(rows);
    const report = t.reports[0];
    expect(report.skipped).toEqual([]);
    expect(report.applied).toBe(t.writes[0].length);
    expect(store().past).toHaveLength(1);
    const zh = new Map(collectTexts(store().worksheet).map((slot) => [slot.path, JSON.stringify(slot.text.zh)]));
    for (const write of t.writes[0]) expect(zh.get(write.path)).toBe(JSON.stringify(write.next));
  });

  it('default ticks replace an old form only: a textbook variant and a lower rank stay offered', async () => {
    const { t, rows } = await checking(paperOf([
      ['Explain market failure.', '解釋市場失靈。'],
      ['The tax incidence falls on buyers.', '稅項歸宿落在買方。'],
      ['Explain the deadweight loss.', '解釋無謂損失。'],
    ]));
    expect(rows.map((r) => r.checks.map((c) => c.fix?.denyKind ?? c.fix?.kind))).toEqual([['wrong'], ['variant'], ['lowerRank']]);
    t.controller.replaceTerms(rows);
    expect(t.writes[0].map((w) => w.path)).toEqual([rows[0].path]);
    expect(t.notify).toHaveBeenCalledWith(replacedTermsFlash(1), expect.anything());
    const zh = new Map(collectTexts(store().worksheet).map((slot) => [slot.path, slot.text.zh]));
    expect(rows.map((r) => zh.get(r.path))).toEqual([[{ text: '解釋市場失效。' }], rows[1].zh, rows[2].zh]);
  });

  it('a text edited since the check is not replaced: no undo entry, the check says so', async () => {
    const { t, rows, tickFixes } = await checking(priceLevelPaper());
    tickFixes();
    editZh(new Set(rows.map((r) => r.path)));

    t.controller.replaceTerms(rows);
    expect(t.reports[0].skipped.map((s) => [s.path, s.reason])).toEqual(rows.map((r) => [r.path, 'targetChanged']));
    expect(store().past).toHaveLength(0);
    expect(t.session().nothingInserted).toBe(true);
    expect(t.closeDialog).not.toHaveBeenCalled();
    expect(t.notify).not.toHaveBeenCalled();
  });
});

/** Setup's view as TranslateRoot computes it, from the open session. */
function setupView(t: ReturnType<typeof harness>): TranslateView {
  const { scope, options } = t.session();
  const ws = store().worksheet;
  return {
    status: readAiStatus(), desktop: false, glossary: null, glossaryFailed: false, scopeChoices: [], slotWhere: new Map(),
    plan: planTranslation(ws, scope, options!), probe: planTranslation(ws, scope, probeOptions(options!)),
  };
}

describe('Setup over the real plan, glossary and settings', () => {
  // A price with no 中文 is a symbol gap; the other line is complete.
  const symbolsOnly = () => paperOf([['Explain market failure.', '解釋市場失效。'], ['$14 000', '']]);

  it('EN+中: a symbol-only gap is nothing to fill, so the dialog opens on Check terms', () => {
    load(symbolsOnly());
    const t = harness();
    t.controller.open(t.request('translate'));
    expect(t.session().mode).toBe('check');
    expect(setupState(setupView(t))).toBe('nothing');
  });

  it('中文 edition: the same gap is one copy, written to 中文 only, one commit', () => {
    load(symbolsOnly());
    const t = harness(undefined, { language: 'zh', version: 'student' });
    t.controller.open(t.request('translate'));
    expect(t.session().mode).toBe('translate');
    expect(setupState(setupView(t))).toBe('onlySymbols');
    t.controller.copySymbols();
    expect(t.writes[0].map((w) => w.side)).toEqual(['zh']);
    expect(store().past).toHaveLength(1);
    expect(t.notify).toHaveBeenCalledWith(filledFlash(1, 0), expect.objectContaining({ label: 'Undo' }));
    const priced = collectTexts(store().worksheet).find((slot) => slot.path === t.writes[0][0].path)!;
    expect(priced.text.zh).toEqual([{ text: '$14 000' }]);
  });

  it('counts glossary terms both ways, and labels the selected question from the walker', async () => {
    const glossary = await loadGlossary();
    const options = { directions: { toZh: true, toEn: true }, includeTeacher: true, includeDiagramLabels: true, copySymbols: { toZh: false, toEn: false } };
    for (const keep of ['en', 'zh'] as const) {
      const plan = planTranslation(oneSided(buildAcceptanceWorksheet(), keep), { kind: 'paper' }, options);
      expect(glossaryTermCount(plan, glossary)).toBeGreaterThan(3);
    }
    const ws = buildAcceptanceWorksheet();
    const slots = collectTexts(ws);
    const third = ws.questions[2].id;
    const choices = scopeChoices({ kind: 'paper' }, slots, { questionId: third });
    expect(choices[1]).toEqual({ scope: { kind: 'questions', ids: [third] }, label: slots.find((s) => s.questionId === third)!.group.label });
    expect(choices[1].label).toMatch(/3/);
  });

  it('reads the saved key and remembers the teacher-text box', () => {
    load(symbolsOnly());
    expect(readAiStatus()).toMatchObject({ provider: 'deepseek', configured: true, keyLast4: '5678' });
    const t = harness();
    t.controller.open(t.request('check'));
    t.controller.setMode('translate');
    expect(t.session().options?.includeTeacher).toBe(true);
    t.controller.setOptions({ includeTeacher: false });
    expect(aiSettings().includeTeacherText).toBe(false);
    const next = harness();
    next.controller.open({ ...next.request('translate'), scope: { kind: 'questions', ids: [store().worksheet.questions[0].id] } });
    expect(next.session().options?.includeTeacher).toBe(false);
    appSettings.write(AI_SETTINGS, { includeTeacherText: true });
  });
});

describe('the Settings round trip through the real app-dialog store', () => {
  /** TranslateHost's effect: what it does whenever the app dialog changes. */
  function hosted(t: ReturnType<typeof harness>) {
    const effect = () => {
      const open = useAppDialogs.getState().open;
      const action = hostAction(open, t.session(), { worksheetId: store().worksheet.id, readOnly: false });
      if (action === 'open' && open?.kind === 'translate') t.controller.open(open.request);
      else if (action === 'reset') t.controller.reset();
      return action;
    };
    return effect;
  }
  const bound = (): Partial<ControllerDeps> => ({
    closeDialog: () => useAppDialogs.getState().close(),
    openSettings: (request, returnTo) => useAppDialogs.getState().openSettings(request, returnTo),
  });

  it('Set up → Continue to Translate resumes Setup with the options as the teacher left them', () => {
    load(oneSided(buildAcceptanceWorksheet(), 'en'));
    const t = harness(undefined, undefined, bound());
    const effect = hosted(t);
    useAppDialogs.getState().openTranslate(t.request('translate'));
    expect(effect()).toBe('open');
    t.controller.setOptions({ includeDiagramLabels: false });
    t.controller.setUp('gemini');
    expect(useAppDialogs.getState().open).toMatchObject({ kind: 'settings', request: { section: 'ai', params: { provider: 'gemini' } } });
    expect(effect()).toBe('keep');
    expect(t.session().options?.includeDiagramLabels).toBe(false);

    useAppDialogs.getState().close({ resume: true });
    expect(effect()).toBe('open');
    expect(t.session()).toMatchObject({ phase: 'setup', mode: 'translate', options: { includeDiagramLabels: false } });
  });

  it('closing Settings without resuming drops the session', () => {
    load(oneSided(buildAcceptanceWorksheet(), 'en'));
    const t = harness(undefined, undefined, bound());
    const effect = hosted(t);
    useAppDialogs.getState().openTranslate(t.request('translate'));
    effect();
    t.controller.openSettings('model');
    expect(effect()).toBe('keep');
    useAppDialogs.getState().close();
    expect(effect()).toBe('reset');
    expect(t.session().request).toBeNull();
  });
});
