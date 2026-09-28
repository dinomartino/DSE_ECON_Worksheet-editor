import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_SETTINGS, readAiStatus, resolveAiConfig } from './aiSettings';

describe('AI_SETTINGS', () => {
  it('defaults to Gemini, remembers keys on desktop only, and includes teacher text', () => {
    expect(AI_SETTINGS.defaults({ desktop: false })).toMatchObject({
      provider: 'gemini',
      rememberKey: false,
      includeTeacherText: true,
    });
    expect(AI_SETTINGS.defaults({ desktop: true }).rememberKey).toBe(true);
  });

  it('accepts its own defaults field by field', () => {
    for (const env of [{ desktop: false }, { desktop: true }]) {
      const defaults = AI_SETTINGS.defaults(env);
      for (const [name, validate] of Object.entries(AI_SETTINGS.fields)) {
        expect(validate(defaults[name as keyof typeof defaults]), name).toEqual(defaults[name as keyof typeof defaults]);
      }
    }
  });

  it('holds no field that could carry key material', () => {
    const names = Object.keys(AI_SETTINGS.fields).filter((n) => n !== 'rememberKey' && n !== 'keychainSaved');
    for (const name of names) expect(name).not.toMatch(/key|token|secret|password/i);
  });

  it('drops a bad model id or base URL without losing the others', () => {
    expect(AI_SETTINGS.fields.models({ gemini: 'gemini-3.5-flash-lite', qwen: 'bad id!' })).toEqual({
      gemini: 'gemini-3.5-flash-lite',
    });
    expect(AI_SETTINGS.fields.baseUrls({ custom: 'http://example.com', ollama: 'http://localhost:11434/v1' })).toEqual({
      ollama: 'http://localhost:11434/v1',
    });
    expect(AI_SETTINGS.fields.provider('someday')).toBeUndefined();
  });
});

describe('the AI status before a provider is set up', () => {
  it('reads as unconfigured Gemini with its default model', () => {
    const status = readAiStatus();
    expect(status).toMatchObject({ provider: 'gemini', configured: false, keyStore: null });
    expect(status.model).toBe(status.preset.models[0].id);
    expect(readAiStatus()).toBe(status);
  });

  it('resolves to no key, never throwing', async () => {
    await expect(resolveAiConfig()).resolves.toMatchObject({ ok: false, reason: 'noKey' });
  });
});

// ---- With a browser or the desktop shell -------------------------------------------
// appSettings and the secrets cache are module state, so each case imports them fresh.

const invoked: Array<{ command: string; args: Record<string, unknown> }> = [];
const keychainItems = new Map<string, string>();
vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Record<string, unknown>) => {
    invoked.push({ command, args });
    if (command === 'secret_get') return keychainItems.get(String(args.account)) ?? null;
    return null;
  },
}));

class FakeStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

async function fresh(desktop: boolean, settings?: object) {
  vi.resetModules();
  invoked.length = 0;
  keychainItems.clear();
  const local = new FakeStorage();
  if (settings) local.setItem('econgen.settings.ai', JSON.stringify({ v: 1, ...settings }));
  vi.stubGlobal('window', {
    localStorage: local,
    sessionStorage: new FakeStorage(),
    addEventListener: () => {},
    removeEventListener: () => {},
    ...(desktop ? { __TAURI_INTERNALS__: {} } : {}),
  });
  const ai = await import('./aiSettings');
  const secrets = await import('@/platform/secrets');
  const { appSettings } = await import('./store');
  return { ...ai, ...secrets, appSettings, local };
}

afterEach(() => vi.unstubAllGlobals());

describe('the AI status in a browser', () => {
  it('is configured once a key is in this tab or this browser', async () => {
    const m = await fresh(false);
    expect(m.readAiStatus().configured).toBe(false);
    await m.writeSecret('ai:gemini', 'AIzaSyTESTKEY000000000000007Qx4', { remember: false });
    expect(m.readAiStatus()).toMatchObject({ configured: true, keyStore: 'session', keyLast4: '7Qx4' });
  });

  it('follows the saved provider, model and base URL', async () => {
    const m = await fresh(false, { provider: 'qwen', models: { qwen: 'qwen3.8-max' } });
    const status = m.readAiStatus();
    expect(status).toMatchObject({ provider: 'qwen', model: 'qwen3.8-max', configured: false });
    expect(status.baseUrl).toBe(status.preset.baseUrl);
  });

  it('counts a keyless provider as configured only with a model', async () => {
    expect((await fresh(false, { provider: 'ollama' })).readAiStatus().configured).toBe(false);
    const m = await fresh(false, { provider: 'ollama', models: { ollama: 'qwen3:8b' } });
    expect(m.readAiStatus().configured).toBe(true);
    await expect(m.resolveAiConfig()).resolves.toMatchObject({ ok: true, config: { apiKey: null, model: 'qwen3:8b' } });
  });

  it('needs a base URL for Custom', async () => {
    const m = await fresh(false, { provider: 'custom', models: { custom: 'my-model' } });
    await expect(m.resolveAiConfig()).resolves.toMatchObject({ ok: false, reason: 'noBaseUrl' });
  });

  it('resolves a saved key into a provider config', async () => {
    const m = await fresh(false, { provider: 'deepseek' });
    await m.writeSecret('ai:deepseek', 'sk-deepseek-12345678', { remember: true });
    await expect(m.resolveAiConfig()).resolves.toEqual({
      ok: true,
      preset: m.readAiStatus().preset,
      config: { provider: 'deepseek', apiKey: 'sk-deepseek-12345678', model: 'deepseek-flash', baseUrl: 'https://api.deepseek.com' },
    });
  });
});

describe('the AI status on desktop', () => {
  it('reads configured from the presence flag and never calls secret_get', async () => {
    const m = await fresh(true, { keychainSaved: { gemini: true } });
    expect(m.readAiStatus()).toMatchObject({ configured: true, keyStore: 'keychain' });
    expect(m.readAiStatus().keyLast4).toBeUndefined();
    expect(invoked).toEqual([]);
  });

  it('reads the keychain once per session', async () => {
    const m = await fresh(true, { keychainSaved: { gemini: true } });
    keychainItems.set('ai:gemini', 'AIzaSyTESTKEY000000000000007Qx4');
    await expect(m.resolveAiConfig()).resolves.toMatchObject({ ok: true, config: { apiKey: 'AIzaSyTESTKEY000000000000007Qx4' } });
    await m.resolveAiConfig();
    expect(invoked.filter((c) => c.command === 'secret_get')).toHaveLength(1);
  });

  it('clears keychainSaved when the keychain item is gone', async () => {
    const m = await fresh(true, { keychainSaved: { gemini: true, deepseek: true } });
    await expect(m.resolveAiConfig()).resolves.toMatchObject({ ok: false, reason: 'noKey' });
    expect(m.appSettings.read(m.AI_SETTINGS).keychainSaved).toEqual({ deepseek: true });
    expect(m.readAiStatus().configured).toBe(false);
  });
});
