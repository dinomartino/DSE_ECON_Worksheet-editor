import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { aiErrorInfo } from '@/ai/errors';
import type { ConnectionTest, ProviderConfig } from '@/ai/types';
import type { AiSetupDeps } from '@/components/settings/sections/aiSection/aiSetupRunner';
import { createAiSetupRunner } from '@/components/settings/sections/aiSection/aiSetupRunner';
import type { AiSetupState } from '@/components/settings/sections/aiSection/aiSetup';
import { createSetupCardFlow, initialSetupCard, type SetupCardFlow } from '@/components/settings/sections/aiSection/setupCardFlow';
import { AI_SETTINGS, type AiSettings } from '@/settings/aiSettings';
import { createSettingsStore } from '@/settings/store';
import { SetupCardView } from './SetupCard';

const web = { desktop: false };
const desk = { desktop: true };
const GEMINI_KEY = 'AIzaSyTESTKEY000000000000007Qx4';
const passed: ConnectionTest = { ok: true, ms: 900, model: 'm', sample: '物價水平', followedGlossary: true };
const failed = (kind: 'badKey' | 'region'): ConnectionTest => ({ ok: false, error: aiErrorInfo(kind, 'gemini') });

const noop = async () => {};
const flow: SetupCardFlow = { pick: () => {}, draft: () => {}, submit: noop, testAnyway: noop, useForSession: noop, retryKeychain: noop, remember: () => {} };

function view(patch: Partial<AiSetupState> = {}, env = web, platform: 'mac' | 'windows' | 'web' = 'web', settings: Partial<AiSettings> = {}) {
  const state = { ...initialSetupCard({ ...AI_SETTINGS.defaults(env), ...settings }, env, () => null), ...patch };
  return renderToStaticMarkup(
    createElement(SetupCardView, {
      verbLabel: 'Fill missing 中文', state, desktop: env.desktop, platform, flow, onCancel: () => {}, onMore: () => {}, onGetKey: () => {},
    }),
  );
}
const rowOf = (html: string, id: string) => html.split(`data-provider="${id}"`)[1]?.split('</button>')[0] ?? '';
const editing = (draft: string, shape?: { message: string }): AiSetupState['key'] => ({ kind: 'editing', draft, ...(shape ? { shape } : {}) });

describe('the setup card', () => {
  it('names the verb, needs a key, and keeps Gemini first and Recommended', () => {
    const html = view();
    expect(html).toContain('Fill missing 中文');
    expect(html).toContain('needs a key');
    expect(html).toContain('Your key stays on this computer, in this browser.');
    expect([...html.matchAll(/data-provider="(\w+)"/g)].map((m) => m[1])).toEqual(['gemini', 'deepseek', 'qwen']);
    expect(html).toMatch(/aria-checked="true" data-provider="gemini"/);
    expect(rowOf(html, 'gemini')).toContain('Recommended');
    for (const id of ['deepseek', 'qwen']) expect(rowOf(html, id)).toContain('Available in Hong Kong');
    expect(html).toMatch(/text-warn-ink">⚠ In Hong Kong, turn on a VPN before you open the Gemini key page, and keep it on while you use Gemini\.</);
    expect(html).toMatch(/Get a Gemini key ↗<\/button><span[^>]*> · Turn on your VPN first\.</);
    expect(view({ provider: 'deepseek' })).not.toContain('VPN');
    expect(html).toContain('More providers…');
  });

  it('idle: Save & continue waits for a key; Remember is off on the web', () => {
    const html = view();
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save &amp; continue/);
    expect(html).toMatch(/<input type="checkbox"(?![^>]*checked)[^>]*>(?:(?!<\/label>).)*Remember on this computer/);
    expect(view({ key: editing(GEMINI_KEY) })).not.toMatch(/disabled=""[^>]*>Save &amp; continue/);
  });

  it('keeps the key field out of password managers', () => {
    const input = /<input[^>]*aria-label="Google Gemini API key"[^>]*>/.exec(view())?.[0] ?? '';
    expect(input).toContain('type="password"');
    expect(input).toContain('data-1p-ignore=""');
    expect(input).not.toMatch(/\sname=/);
  });

  it('desktop: the Keychain, and no Remember box', () => {
    const mac = view({}, desk, 'mac');
    expect(mac).toContain('Your key stays on this computer, in your Keychain.');
    expect(mac).not.toContain('Remember on this computer');
    expect(view({}, desk, 'windows')).toContain('in Windows Credential Manager.');
  });

  it('testing, error, region, key shape and keychain states', () => {
    expect(view({ key: editing(GEMINI_KEY), test: { kind: 'testing' } })).toMatch(/Testing your key…[\s\S]*disabled=""[^>]*>Testing…/);
    const bad = aiErrorInfo('badKey', 'gemini');
    expect(view({ key: editing(GEMINI_KEY), test: { kind: 'error', error: bad } })).toContain(`role="alert"`);
    const region = view({ test: { kind: 'error', error: aiErrorInfo('region', 'gemini') }, regionRefusedBy: 'gemini' });
    expect(region).toMatch(/Gemini can&#x27;t be reached from your location\. Turn on a VPN and try again\.[\s\S]*Try again[\s\S]*Use DeepSeek[\s\S]*Use Qwen/);
    expect(view({ key: editing('sk-x', { message: 'That looks like a DeepSeek key.' }) })).toMatch(/That looks like a DeepSeek key\.[\s\S]*Test anyway/);
    expect(view({ keychainError: 'denied' }, desk, 'mac')).toMatch(/macOS didn’t allow access to your Keychain\.[\s\S]*Use for this session/);
  });
});

/** The card's flow over the real runner and fakes: controllable tests, in-memory secrets and settings. */
function setup(opts: { env?: { desktop: boolean }; write?: AiSetupDeps['writeSecret']; provider?: 'openrouter' } = {}) {
  const env = opts.env ?? web;
  const data = new Map<string, string>();
  const store = createSettingsStore(() => ({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }), env);
  if (opts.provider) store.write(AI_SETTINGS, { provider: opts.provider });
  const secrets = new Map<string, string>();
  const tests: Array<{ config: ProviderConfig; done: (r: ConnectionTest) => void }> = [];
  const deps: AiSetupDeps = {
    env,
    testConnection: (config) => new Promise((done) => tests.push({ config, done })),
    listModels: async () => [],
    readSecret: async (a) => ({ ok: true, value: secrets.get(a) ?? null, store: null }),
    writeSecret: opts.write ?? (async (a, value) => (secrets.set(a, value), { ok: true, store: 'session' })),
    deleteSecret: async (a) => void secrets.delete(a),
    peekSecret: (a) => (secrets.has(a) ? { store: 'session', last4: secrets.get(a)!.slice(-4) } : null),
    resolveConfig: async (provider) => ({ ok: false, provider, reason: 'noKey' }),
    readSettings: () => store.read(AI_SETTINGS),
    writeSettings: (patch) => void store.write(AI_SETTINGS, patch),
  };
  const runner = createAiSetupRunner(deps, initialSetupCard(store.read(AI_SETTINGS), env, (p) => deps.peekSecret(`ai:${p}`)));
  const onReady = vi.fn();
  const card = createSetupCardFlow(runner, onReady);
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { runner, card, onReady, tests, secrets, settings: () => store.read(AI_SETTINGS), settle };
}

describe('the setup card flow', () => {
  it('sends nothing before Save & continue; a radio shows a provider without committing it', () => {
    const { card, tests, runner, settings } = setup();
    card.pick('deepseek');
    card.draft('sk-deepseek-1234567890');
    expect(tests).toHaveLength(0);
    expect(runner.current().provider).toBe('deepseek');
    expect(settings().provider).toBe('gemini');
  });

  it('save → test passes → key saved, provider committed, onReady once', async () => {
    const { card, tests, secrets, settings, onReady } = setup();
    card.pick('qwen');
    card.draft('sk-qwen-1234567890');
    const saving = card.submit();
    expect(tests[0].config).toMatchObject({ provider: 'qwen', apiKey: 'sk-qwen-1234567890' });
    tests[0].done(passed);
    await saving;
    expect([...secrets]).toEqual([['ai:qwen', 'sk-qwen-1234567890']]);
    expect(settings().provider).toBe('qwen');
    expect(onReady).toHaveBeenCalledTimes(1);
    await card.useForSession();
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('a bad key: error shown, nothing saved or committed, no onReady', async () => {
    const { card, tests, secrets, settings, onReady, runner } = setup();
    card.pick('deepseek');
    card.draft('sk-wrong-1234567890');
    const saving = card.submit();
    tests[0].done(failed('badKey'));
    await saving;
    expect(runner.current().test.kind).toBe('error');
    expect(secrets.size).toBe(0);
    expect(settings().provider).toBe('gemini');
    expect(onReady).not.toHaveBeenCalled();
  });

  it('a region refusal saves nothing; Use DeepSeek switches the radio', async () => {
    const { card, tests, secrets, settings, onReady, runner } = setup();
    card.draft(GEMINI_KEY);
    const saving = card.submit();
    tests[0].done(failed('region'));
    await saving;
    expect(runner.current()).toMatchObject({ regionRefusedBy: 'gemini', test: { kind: 'error' } });
    expect(secrets.size).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
    card.pick('deepseek');
    expect(runner.current()).toMatchObject({ provider: 'deepseek', test: { kind: 'idle' }, key: { kind: 'none' } });
    expect(settings().provider).toBe('gemini');
  });

  it('a key shaped like another provider’s waits for Test anyway', async () => {
    const { card, tests, onReady, runner } = setup();
    card.draft('sk-deepseek-1234567890');
    await card.submit();
    expect(tests).toHaveLength(0);
    expect(runner.current().key).toMatchObject({ shape: { message: "This isn't a Google key. Which provider is it from?" } });
    const saving = card.testAnyway();
    tests[0].done(passed);
    await saving;
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('desktop: a refused Keychain offers this session, which then runs the verb', async () => {
    const write: AiSetupDeps['writeSecret'] = async (_a, _v, o) =>
      o.remember ? { ok: false, error: { kind: 'denied', message: 'denied' } } : { ok: true, store: 'memory' };
    const { card, tests, onReady, runner, settings } = setup({ env: desk, write });
    expect(runner.current().remember).toBe(true);
    card.draft(GEMINI_KEY);
    const saving = card.submit();
    tests[0].done(passed);
    await saving;
    expect(runner.current().keychainError).toBe('denied');
    expect(onReady).not.toHaveBeenCalled();
    await card.useForSession();
    expect(settings().provider).toBe('gemini');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('web Remember is off by default; a More provider opens the card on Gemini', () => {
    expect(setup().runner.current().remember).toBe(false);
    expect(setup({ provider: 'openrouter' }).runner.current().provider).toBe('gemini');
  });
});
