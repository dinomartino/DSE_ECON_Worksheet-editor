import { beforeEach, describe, expect, it } from 'vitest';
import { clearDialectCache, createClient, testConnection } from '@/ai/client';
import { fakeFetch, instantDeps, replyOf, type Reply } from '@/ai/fakeFetch';
import { presetFor } from '@/ai/providers';
import type { ProviderId } from '@/ai/types';
import { AI_SETTINGS } from '@/settings/aiSettings';
import { createSettingsStore } from '@/settings/store';
import { initialAiSetup, qwenWorkspaceUrl } from './aiSetup';
import { createAiSetupRunner, type AiSetupDeps } from './aiSetupRunner';

// The runner over P-AI's real testConnection, createClient().listModels, keyShapeProblem
// and PRESETS; only fetch and the secrets store are fakes.

const web = { desktop: false };
const GEMINI_KEY = 'AIzaSyTESTKEY000000000000007Qx4';
const ITEMS = JSON.stringify({ items: [{ key: 't1', text: '物價水平' }] });
const chatOk: Reply = { status: 200, body: { choices: [{ message: { content: ITEMS }, finish_reason: 'stop' }] } };

function setup(provider: ProviderId, replies: Reply[]) {
  const data = new Map<string, string>();
  const store = createSettingsStore(() => ({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }), web);
  store.write(AI_SETTINGS, { provider });
  const secrets = new Map<string, string>();
  const { fetch, calls } = fakeFetch(replies);
  const http = instantDeps(fetch).deps;
  const deps: AiSetupDeps = {
    env: web,
    testConnection: (config, signal) => testConnection(config, signal, http),
    listModels: (config, signal) => createClient(config, http).listModels(signal),
    readSecret: async (a) => ({ ok: true, value: secrets.get(a) ?? null, store: secrets.has(a) ? 'session' : null }),
    writeSecret: async (a, value) => {
      secrets.set(a, value);
      return { ok: true, store: 'session' };
    },
    deleteSecret: async (a) => void secrets.delete(a),
    peekSecret: (a) => (secrets.has(a) ? { store: 'session', last4: secrets.get(a)!.slice(-4) } : null),
    readSettings: () => store.read(AI_SETTINGS),
    writeSettings: (patch) => void store.write(AI_SETTINGS, patch),
  };
  const initial = initialAiSetup(store.read(AI_SETTINGS), web, undefined, (p) => deps.peekSecret(`ai:${p}`));
  return { runner: createAiSetupRunner(deps, initial), calls, secrets, settings: () => store.read(AI_SETTINGS) };
}

beforeEach(() => clearDialectCache());

describe('the AI pane over the real client', () => {
  it('sends a Gemini key to DeepSeek only after "test anyway"', async () => {
    const { runner, calls, secrets } = setup('deepseek', [replyOf('deepseek-401')]);
    runner.draft(GEMINI_KEY);
    await expect(runner.saveAndTest()).resolves.toBe(false);
    await expect(runner.listModels()).resolves.toBeNull();
    expect(calls).toEqual([]);
    expect(runner.current().key).toMatchObject({ kind: 'editing', shape: { likely: 'gemini' } });

    await expect(runner.saveAndTest(true)).resolves.toBe(false);
    expect(calls.map((c) => new URL(c.url).host)).toEqual(['api.deepseek.com']);
    expect(runner.current().test).toMatchObject({ kind: 'error', error: { kind: 'badKey' } });
    expect(secrets.size).toBe(0);
  });

  it('never lists models with an sk- key on the Gemini card', async () => {
    const { runner, calls } = setup('gemini', []);
    runner.draft('sk-1234567890abcdef1234');
    await expect(runner.listModels()).resolves.toBeNull();
    await expect(runner.saveAndTest()).resolves.toBe(false);
    expect(calls).toEqual([]);
  });

  it('fills the Qwen workspace before saving or sending', async () => {
    const { runner, calls, secrets, settings } = setup('qwen', [chatOk, { status: 200, body: { data: [{ id: 'qwen-plus' }] } }]);
    const template = presetFor('qwen').baseUrlChoices!.find((c) => c.url.includes('cn-hongkong'))!.url;
    expect(template).toContain('{WorkspaceId}');
    expect(runner.baseUrl(template)).toBe(false);
    expect(settings().baseUrls.qwen).toBeUndefined();

    const built = qwenWorkspaceUrl(template, 'llm-abc123')!;
    expect(runner.baseUrl(built)).toBe(true);
    runner.draft('sk-qwen-1234567890abcdef');
    await expect(runner.saveAndTest()).resolves.toBe(true);
    expect(calls[0].url.startsWith('https://llm-abc123.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1/')).toBe(true);
    expect(settings()).toMatchObject({ provider: 'qwen', baseUrls: { qwen: built } });
    expect([...secrets.keys()]).toEqual(['ai:qwen']);

    await expect(runner.listModels()).resolves.toEqual({ provider: 'qwen', models: [{ id: 'qwen-plus' }] });
    expect(calls[1].url).toBe(`${built}/models`);
    expect(JSON.stringify(settings())).not.toContain('{WorkspaceId}');
  });
});
