import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { migrate } from '@/model/migrations';
import { collectTexts, mapWorksheetTexts } from '@/model/textWalk';
import type { ApplyReport, TextPath, TranslationWrite } from '@/model/textSlots';
import type { RichText, Worksheet } from '@/model/types';
import { writeSecret } from '@/platform/secrets';
import type { TranslateRequest } from '@/store/appDialogs';
import { useWorksheetStore } from '@/store/worksheetStore';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { createRunDeps } from '@/translate/deps';
import { planTranslation } from '@/translate/plan';
import { runTranslation, writesFor } from '@/translate/run';
import { buildTermCheck, termFixWrites } from '@/translate/termCheck';
import { oneSided, readCorpus, referenceClient } from '@/translate/testKit';
import type { TermRow } from '@/translate/types';
import { NOTHING_REPLACED, filledFlash, replacedTermsFlash } from './copy';
import { createTranslateController } from './translateController';
import { acceptedKeys, createSessionStore, insertCount, termKey } from './translateSession';

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

function harness(client = referenceClient(buildAcceptanceWorksheet())) {
  const session = createSessionStore();
  const writes: TranslationWrite[][] = [];
  const reports: ApplyReport[] = [];
  const notify = vi.fn();
  const closeDialog = vi.fn();
  let glossaryLoaded = false;
  const controller = createTranslateController({
    store: session,
    getWorksheet: () => store().worksheet,
    getMode: () => ({ language: 'bilingual', version: 'student' }),
    readStatus: () => { throw new Error('not read outside auto-start and the error panel'); },
    includeTeacherText: () => true,
    rememberIncludeTeacher: () => {},
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
    keySaved: () => true,
    setProvider: vi.fn(),
    setModel: vi.fn(),
    openExternal: vi.fn(),
    showOnPage: vi.fn(),
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
