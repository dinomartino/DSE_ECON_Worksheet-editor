/**
 * An AI key lives in the secrets store and nowhere else: not in a document, a backup,
 * the .json export or settings. "Clear saved documents" leaves it (and settings) alone.
 */
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteSecret, peekSecret, readSecret, resetSecretsForTest, writeSecret } from '@/platform/secrets';
import { initialAiSetup } from '@/components/settings/sections/aiSection/aiSetup';
import { createAiSetupRunner, type AiSetupDeps } from '@/components/settings/sections/aiSection/aiSetupRunner';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { createSettingsStore } from '@/settings/store';
import { buildBackup } from '@/storage/backup';
import { downloadWorksheetFile, LocalStorageWorksheetStore, stringifyWorksheet } from '@/storage';
import { buildAcceptanceWorksheet } from './fixtures';

const KEYS = {
  gemini: 'AIzaSyNEVERLEAVEgemini000000007Qx4',
  deepseek: 'sk-neverleave-deepseek-1234567890',
  qwen: 'sk-neverleave-qwen-memory-12345678',
  openrouter: 'sk-or-neverleave-keychain-12345678',
};

const downloads: string[] = [];
vi.mock('@/storage/download', () => ({
  triggerDownload: async (blob: Blob) => void downloads.push(await blob.text()),
}));
const keychain = new Map<string, string>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: { account: string; secret?: string }) => {
    if (command === 'secret_set') keychain.set(args.account, String(args.secret));
    return null;
  },
}));

/** Items are own properties, as on a real Storage, so `Object.keys` lists them. */
class FakeStorage {
  [key: string]: unknown;
  getItem(key: string) {
    return Object.prototype.hasOwnProperty.call(this, key) ? String(this[key]) : null;
  }
  setItem(key: string, value: string) {
    this[key] = String(value);
  }
  removeItem(key: string) {
    delete this[key];
  }
}
class RefusingStorage extends FakeStorage {
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

let local: FakeStorage;
let session: FakeStorage;
const window = (extra: object = {}) => ({ localStorage: local, sessionStorage: session, ...extra });
const everyKey = Object.values(KEYS);
const expectClean = (text: string, where: string) => {
  for (const key of everyKey) expect(text.includes(key), `${where} holds a key`).toBe(false);
};

beforeEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  downloads.length = 0;
  keychain.clear();
  resetSecretsForTest();
});
afterEach(() => vi.unstubAllGlobals());

describe('an AI key never leaves the secrets store', () => {
  it('is in no document, backup, .json export or settings value', async () => {
    vi.stubGlobal('window', window());
    await writeSecret('ai:gemini', KEYS.gemini, { remember: true });
    await writeSecret('ai:deepseek', KEYS.deepseek, { remember: false });
    vi.stubGlobal('window', window({ sessionStorage: new RefusingStorage(), localStorage: new RefusingStorage() }));
    await writeSecret('ai:qwen', KEYS.qwen, { remember: false });

    // The AI section's own flows, over the real secrets module and a settings store.
    const settings = createSettingsStore(() => local, { desktop: false });
    const deps: AiSetupDeps = {
      env: { desktop: true },
      testConnection: async () => ({ ok: true, ms: 1, model: 'm', sample: '物價水平', followedGlossary: true }),
      listModels: async () => [],
      readSecret,
      writeSecret,
      deleteSecret,
      peekSecret,
      resolveConfig: async (provider) => ({ ok: false, provider, reason: 'noKey' }),
      readSettings: () => settings.read(AI_SETTINGS),
      writeSettings: (patch) => void settings.write(AI_SETTINGS, patch),
    };
    const pane = createAiSetupRunner(deps, initialAiSetup(settings.read(AI_SETTINGS), deps.env, undefined, () => null));
    vi.stubGlobal('window', window({ __TAURI_INTERNALS__: {} }));
    pane.selectProvider('openrouter');
    await pane.remember(true);
    pane.draft(KEYS.openrouter);
    await expect(pane.saveAndTest()).resolves.toBe(true);
    expect(keychain.get('ai:openrouter')).toBe(KEYS.openrouter);
    vi.stubGlobal('window', window());
    pane.selectProvider('deepseek');
    pane.model(KEYS.gemini); // pasted into the wrong field: refused
    pane.model(KEYS.deepseek);
    expect(settings.read(AI_SETTINGS).models.deepseek).toBeUndefined();
    pane.model('deepseek-flash');
    await pane.listModels();
    pane.draft(KEYS.deepseek);
    await expect(pane.saveAndTest()).resolves.toBe(true);
    settings.write(AI_SETTINGS, { includeTeacherText: false });
    expect(settings.read(AI_SETTINGS)).toMatchObject({ provider: 'deepseek', keychainSaved: { openrouter: true } });

    const worksheet = buildAcceptanceWorksheet();
    const store = new LocalStorageWorksheetStore();
    await store.save(worksheet);
    expectClean(stringifyWorksheet(worksheet), 'the document');

    const zip = await JSZip.loadAsync(await buildBackup([worksheet]));
    for (const file of Object.values(zip.files)) expectClean(await file.async('string'), `backup ${file.name}`);

    await downloadWorksheetFile(worksheet);
    await vi.waitFor(() => expect(downloads).toHaveLength(1));
    expectClean(downloads[0], 'the .json export');

    for (const name of Object.keys(local)) {
      if (!name.startsWith('econgen.secret.')) expectClean(String(local[name]), name);
      if (name.startsWith('econgen.settings.')) expect(String(local[name])).not.toMatch(/"(sk-|AIza)/);
    }
    expect(Object.keys(local).some((name) => name.startsWith('econgen.settings.'))).toBe(true);
  });

  it('a key already stored as a model id is dropped on read', () => {
    local = new FakeStorage();
    local.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider: 'gemini', models: { gemini: KEYS.gemini, deepseek: 'deepseek-flash' } }));
    const settings = createSettingsStore(() => local, { desktop: false });
    expect(settings.read(AI_SETTINGS).models).toEqual({ deepseek: 'deepseek-flash' });
  });

  it('survives "Clear saved documents", with settings', async () => {
    vi.stubGlobal('window', window());
    await writeSecret('ai:gemini', KEYS.gemini, { remember: true });
    createSettingsStore(() => local, { desktop: false }).write(AI_SETTINGS, { provider: 'qwen' });
    const store = new LocalStorageWorksheetStore();
    await store.save(buildAcceptanceWorksheet());
    await store.clear();
    expect(local.getItem('econgen.secret.ai:gemini')).toBe(KEYS.gemini);
    expect(local.getItem('econgen.settings.ai')).toContain('qwen');
    expect(Object.keys(local).filter((k) => k.startsWith('econ-worksheet'))).toEqual([]);
  });
});
