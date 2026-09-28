/**
 * An AI key lives in the secrets store and nowhere else: not in a document, a backup,
 * the .json export or settings. "Clear saved documents" leaves it (and settings) alone.
 */
import JSZip from 'jszip';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { writeSecret, resetSecretsForTest } from '@/platform/secrets';
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
    vi.stubGlobal('window', window({ __TAURI_INTERNALS__: {} }));
    await writeSecret('ai:openrouter', KEYS.openrouter, { remember: true });
    expect(keychain.get('ai:openrouter')).toBe(KEYS.openrouter);
    vi.stubGlobal('window', window());

    // The AI section's settings flows, written as the pane writes them.
    const settings = createSettingsStore(() => local, { desktop: false });
    settings.write(AI_SETTINGS, { provider: 'deepseek', rememberKey: true, keychainSaved: { openrouter: true } });
    settings.write(AI_SETTINGS, { models: { deepseek: 'deepseek-flash' }, includeTeacherText: false });

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
