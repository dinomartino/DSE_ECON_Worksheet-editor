import { describe, expect, it, vi } from 'vitest';
import type { ConnectionTest, ModelInfo, ProviderConfig } from '@/ai/types';
import type { SecretAccount, SecretWrite } from '@/platform/secrets';
import { AI_SETTINGS, providerChoice } from '@/settings/aiSettings';
import { createSettingsStore } from '@/settings/store';
import { initialAiSetup } from './aiSetup';
import { createAiSetupRunner, type AiSetupDeps } from './aiSetupRunner';

const web = { desktop: false };
const GEMINI_KEY = 'AIzaSyTESTKEY000000000000007Qx4';
const passed: ConnectionTest = { ok: true, ms: 900, model: 'm', sample: '物價水平', followedGlossary: true };

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

/** The runner over fakes: an in-memory settings store and secrets map, and a controllable test. */
function setup(opts: { provider?: 'gemini' | 'qwen'; params?: Record<string, string>; write?: AiSetupDeps['writeSecret'] } = {}) {
  const data = new Map<string, string>();
  const store = createSettingsStore(() => ({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }), web);
  if (opts.provider) store.write(AI_SETTINGS, { provider: opts.provider });
  const secrets = new Map<string, string>();
  const tests: Array<{ config: ProviderConfig; signal: AbortSignal; done: (r: ConnectionTest) => void }> = [];
  const listed: ProviderConfig[] = [];
  const deps: AiSetupDeps = {
    env: web,
    testConnection: (config, signal) => {
      const d = deferred<ConnectionTest>();
      tests.push({ config, signal, done: d.resolve });
      return d.promise;
    },
    listModels: async (config): Promise<ModelInfo[]> => {
      listed.push(config);
      return [{ id: 'listed-model' }];
    },
    readSecret: async (a) => ({ ok: true, value: secrets.get(a) ?? null, store: secrets.has(a) ? 'session' : null }),
    writeSecret:
      opts.write ??
      (async (a, value) => {
        secrets.set(a, value);
        return { ok: true, store: 'session' };
      }),
    deleteSecret: async (a) => void secrets.delete(a),
    peekSecret: (a) => (secrets.has(a) ? { store: 'session', last4: secrets.get(a)!.slice(-4) } : null),
    resolveConfig: async (provider) => {
      const apiKey = secrets.get(`ai:${provider}`);
      if (!apiKey) return { ok: false, provider, reason: 'noKey' };
      const { model, baseUrl } = providerChoice(store.read(AI_SETTINGS), provider);
      return { ok: true, config: { provider, apiKey, model, baseUrl }, preset: {} as never };
    },
    readSettings: () => store.read(AI_SETTINGS),
    writeSettings: (patch) => void store.write(AI_SETTINGS, patch),
  };
  const initial = initialAiSetup(store.read(AI_SETTINGS), web, opts.params, (p) => deps.peekSecret(`ai:${p}`));
  const runner = createAiSetupRunner(deps, initial);
  const settings = () => store.read(AI_SETTINGS);
  return { runner, secrets, tests, listed, settings };
}

describe('Save & test', () => {
  it('saves the key under the tested provider and commits it', async () => {
    const { runner, secrets, tests, settings } = setup({ params: { provider: 'deepseek' } });
    runner.draft('sk-deepseek-1234567890');
    const saving = runner.saveAndTest();
    expect(tests[0].config).toMatchObject({ provider: 'deepseek', apiKey: 'sk-deepseek-1234567890' });
    expect(settings().provider).toBe('gemini');
    tests[0].done(passed);
    await expect(saving).resolves.toBe(true);
    expect([...secrets]).toEqual([['ai:deepseek', 'sk-deepseek-1234567890']]);
    expect(settings().provider).toBe('deepseek');
    expect(runner.current().key).toEqual({ kind: 'saved', store: 'session', last4: '7890' });
  });

  it('drops a test whose card was switched mid-test: nothing saved, nothing committed', async () => {
    const { runner, secrets, tests, settings } = setup();
    runner.draft(GEMINI_KEY);
    const saving = runner.saveAndTest();
    runner.selectProvider('deepseek');
    expect(tests[0].signal.aborted).toBe(true);
    tests[0].done(passed);
    await expect(saving).resolves.toBe(false);
    expect(secrets.size).toBe(0);
    expect(settings().provider).toBe('deepseek');
    expect(runner.current()).toMatchObject({ provider: 'deepseek', test: { kind: 'idle' }, key: { kind: 'none' } });
  });

  it('keeps a key saved under its own provider when the card switches during the write', async () => {
    const write = deferred<SecretWrite>();
    const accounts: SecretAccount[] = [];
    const { runner, tests, settings } = setup({
      write: (a) => {
        accounts.push(a);
        return write.promise;
      },
    });
    runner.draft(GEMINI_KEY);
    const saving = runner.saveAndTest();
    tests[0].done(passed);
    await vi.waitFor(() => expect(accounts).toEqual(['ai:gemini']));
    runner.selectProvider('qwen');
    write.resolve({ ok: true, store: 'keychain' });
    await expect(saving).resolves.toBe(false);
    expect(settings()).toMatchObject({ provider: 'qwen', keychainSaved: { gemini: true } });
    expect(runner.current()).toMatchObject({ provider: 'qwen', key: { kind: 'none' } });
  });
});

describe('List my models', () => {
  it('sends nothing for a key that looks like another provider\'s', async () => {
    const { runner, listed } = setup();
    runner.draft('sk-1234567890abcdef');
    await expect(runner.listModels()).resolves.toBeNull();
    expect(listed).toEqual([]);
    expect(runner.current().key).toMatchObject({ kind: 'editing', shape: { message: "This isn't a Google key. Which provider is it from?" } });
  });

  it('lists with the typed key, or the saved one, for the shown provider', async () => {
    const { runner, listed, secrets } = setup();
    runner.draft(GEMINI_KEY);
    await expect(runner.listModels()).resolves.toEqual({ provider: 'gemini', models: [{ id: 'listed-model' }] });
    runner.draft('');
    secrets.set('ai:gemini', 'AIzaSySAVED0000000');
    await runner.listModels();
    expect(listed.map((c) => [c.provider, c.apiKey])).toEqual([['gemini', GEMINI_KEY], ['gemini', 'AIzaSySAVED0000000']]);
  });
});

describe('the Qwen workspace', () => {
  const HK = 'https://llm-abc.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1';

  it('tests nothing until the workspace is valid, then tests the address shown', async () => {
    const { runner, tests, settings } = setup({ provider: 'qwen' });
    const stored = settings().baseUrls.qwen;
    runner.draft('sk-qwen-1234567890');
    expect(runner.baseUrl(null)).toBe(false);
    await expect(runner.saveAndTest()).resolves.toBe(false);
    expect(tests).toEqual([]);
    expect(settings().baseUrls.qwen).toBe(stored);
    expect(runner.baseUrl(HK)).toBe(true);
    void runner.saveAndTest();
    expect(tests[0].config.baseUrl).toBe(HK);
    expect(settings().baseUrls.qwen).toBe(HK);
  });
});

describe('the keychain', () => {
  it('reports each failure kind and never marks the key saved', async () => {
    for (const kind of ['denied', 'unavailable', 'failed'] as const) {
      const { runner, settings } = setup({ write: async () => ({ ok: false, error: { kind, message: kind } }) });
      runner.draft(GEMINI_KEY);
      await expect(runner.saveWithoutTesting()).resolves.toBe(false);
      expect(runner.current()).toMatchObject({ keychainError: kind, key: { kind: 'editing' } });
      expect(settings().keychainSaved).toEqual({});
    }
  });

  it('keeps the key for this session only after a refusal', async () => {
    const remembers: boolean[] = [];
    const { runner } = setup({
      write: async (_a, _v, o) => {
        remembers.push(o.remember);
        return o.remember ? { ok: false, error: { kind: 'denied', message: 'denied' } } : { ok: true, store: 'memory' };
      },
    });
    await runner.remember(true);
    runner.draft(GEMINI_KEY);
    await runner.saveWithoutTesting();
    expect(runner.current().keychainError).toBe('denied');
    await expect(runner.useForSession()).resolves.toBe(true);
    expect(remembers).toEqual([true, false]);
    expect(runner.current()).toMatchObject({ keychainError: null, key: { kind: 'saved', store: 'memory' } });
  });
});

describe('Forget', () => {
  it('forgets one provider\'s key, or every key', async () => {
    const { runner, secrets } = setup();
    secrets.set('ai:gemini', 'AIzaSySAVED0000000');
    secrets.set('ai:deepseek', 'sk-deepseek-0000000');
    runner.forgetAsked('gemini');
    await runner.forget();
    expect([...secrets.keys()]).toEqual(['ai:deepseek']);
    runner.forgetAsked('all');
    await runner.forget();
    expect(secrets.size).toBe(0);
    expect(runner.current()).toMatchObject({ confirmForget: null, key: { kind: 'none' } });
  });
});

describe('Test a saved key', () => {
  const DEEPSEEK_KEY = 'sk-deepseek-saved-0000abcd';

  it('tests that provider\'s saved key, and changes neither the provider in use nor the open card', async () => {
    const { runner, secrets, tests, settings } = setup();
    secrets.set('ai:deepseek', DEEPSEEK_KEY);
    const testing = runner.testSaved('deepseek');
    expect(runner.current().savedTests.deepseek).toEqual({ kind: 'testing' });
    await vi.waitFor(() => expect(tests).toHaveLength(1));
    expect(tests[0].config).toMatchObject({ provider: 'deepseek', apiKey: DEEPSEEK_KEY, model: 'deepseek-flash' });
    tests[0].done(passed);
    await expect(testing).resolves.toBe(true);
    expect(runner.current()).toMatchObject({ provider: 'gemini', test: { kind: 'idle' }, savedTests: { deepseek: { kind: 'ok' } } });
    expect(settings().provider).toBe('gemini');
    expect([...secrets]).toEqual([['ai:deepseek', DEEPSEEK_KEY]]);
  });

  it('reports a missing key without sending anything', async () => {
    const { runner, tests } = setup();
    await expect(runner.testSaved('qwen')).resolves.toBe(false);
    expect(tests).toEqual([]);
    expect(runner.current().savedTests.qwen).toMatchObject({ kind: 'error', error: { kind: 'notConfigured' } });
  });

  it('drops a test whose key was forgotten meanwhile', async () => {
    const { runner, secrets, tests } = setup();
    secrets.set('ai:deepseek', DEEPSEEK_KEY);
    const testing = runner.testSaved('deepseek');
    await vi.waitFor(() => expect(tests).toHaveLength(1));
    runner.forgetAsked('deepseek');
    await runner.forget();
    expect(tests[0].signal.aborted).toBe(true);
    tests[0].done(passed);
    await expect(testing).resolves.toBe(false);
    expect(runner.current().savedTests).toEqual({});
  });

  it('marks a newly saved key with the test it just passed, else untested', async () => {
    const { runner, tests } = setup();
    runner.draft(GEMINI_KEY);
    const saving = runner.saveAndTest();
    tests[0].done(passed);
    await saving;
    expect(runner.current().savedTests.gemini).toMatchObject({ kind: 'ok' });
    runner.draft('AIzaSyANOTHERKEY00000000');
    await runner.saveWithoutTesting();
    expect(runner.current().savedTests.gemini).toEqual({ kind: 'idle' });
  });
});
