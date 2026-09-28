import { describe, expect, it, vi } from 'vitest';
import type { AiErrorInfo, AiErrorKind, ConnectionTest } from '@/ai/types';
import { AI_SETTINGS, type AiSettings } from '@/settings/aiSettings';
import {
  aiSetupReducer,
  canTest,
  cardState,
  initialAiSetup,
  needsCloseGuard,
  qwenWorkspaceUrl,
  resumeReady,
  shouldSaveAfterTest,
  type AiSetupEvent,
  type AiSetupState,
} from './aiSetup';

// P-AI's key-shape check, faked: a Gemini field holding an `sk-` key.
vi.mock('@/ai/keyShape', () => ({
  keyShapeProblem: (provider: string, key: string) =>
    provider === 'gemini' && key.startsWith('sk-') ? { likely: 'deepseek', message: 'This looks like a DeepSeek key.' } : null,
}));

const web = { desktop: false };
const settings = (patch: Partial<AiSettings> = {}): AiSettings => ({ ...AI_SETTINGS.defaults(web), ...patch });
const noPeek = () => null;
const start = (patch: Partial<AiSettings> = {}, params?: Record<string, string>) =>
  initialAiSetup(settings(patch), web, params, noPeek);
const run = (state: AiSetupState, ...events: AiSetupEvent[]) => events.reduce(aiSetupReducer, state);
const error = (kind: AiErrorKind): AiErrorInfo => ({ kind, provider: 'gemini', message: kind, fatal: true, actions: [] });
const failed = (kind: AiErrorKind): ConnectionTest => ({ ok: false, error: error(kind) });
const passed: ConnectionTest = { ok: true, ms: 900, model: 'gemini-3.5-flash-lite', sample: '物價水平', followedGlossary: true };

describe('the AI section state', () => {
  it('opens the committed provider with its model and saved key', () => {
    const state = initialAiSetup(settings({ provider: 'deepseek' }), web, undefined, () => ({ store: 'browser', last4: 'abcd' }));
    expect(state).toMatchObject({ provider: 'deepseek', model: 'deepseek-flash', key: { kind: 'saved', store: 'browser', last4: 'abcd' } });
  });

  it('reads a desktop Keychain key from the presence flag alone', () => {
    const state = initialAiSetup(settings({ keychainSaved: { gemini: true } }), { desktop: true }, undefined, noPeek);
    expect(state.key).toEqual({ kind: 'saved', store: 'keychain' });
  });

  it('sends nothing past a shape warning until "test anyway"', () => {
    const warned = run(start(), { type: 'draft', value: 'sk-1234567890abcdef' }, { type: 'saveAndTest' });
    expect(warned.test.kind).toBe('idle');
    expect(warned.key).toMatchObject({ kind: 'editing', shape: { likely: 'deepseek' } });
    expect(run(warned, { type: 'testAnyway' }).test.kind).toBe('testing');
  });

  it('tests a plausible key, then records it as saved', () => {
    const testing = run(start(), { type: 'draft', value: 'AIzaSyTESTKEY0000' }, { type: 'saveAndTest' });
    expect(testing.test.kind).toBe('testing');
    const done = run(testing, { type: 'testFinished', result: passed }, { type: 'saved', store: 'session', last4: '0000' });
    expect(done.test).toEqual({ kind: 'ok', sample: '物價水平', ms: 900, followedGlossary: true });
    expect(done.key).toEqual({ kind: 'saved', store: 'session', last4: '0000' });
    expect(needsCloseGuard(done)).toBe(false);
  });

  it('never tests an empty field for a provider that needs a key', () => {
    expect(run(start(), { type: 'saveAndTest' }).test.kind).toBe('idle');
    expect(run(start({ provider: 'ollama' }), { type: 'saveAndTest' }).test.kind).toBe('testing');
  });

  it('saves after every failure except a rejected key', () => {
    expect(shouldSaveAfterTest(passed)).toBe(true);
    expect(shouldSaveAfterTest(failed('badKey'))).toBe(false);
    expect(shouldSaveAfterTest(failed('keyBlocked'))).toBe(false);
    for (const kind of ['quota', 'timeout', 'region', 'network', 'server'] as const) {
      expect(shouldSaveAfterTest(failed(kind)), kind).toBe(true);
    }
  });

  it('remembers which provider refused the location, after a region error or a region deep link', () => {
    const tested = run(start(), { type: 'draft', value: 'AIzaSyTESTKEY0000' }, { type: 'saveAndTest' });
    expect(run(tested, { type: 'testFinished', result: failed('quota') }).regionRefusedBy).toBeNull();
    expect(run(tested, { type: 'testFinished', result: failed('region') }).regionRefusedBy).toBe('gemini');
    expect(start({}, { provider: 'deepseek', reason: 'region' })).toMatchObject({ provider: 'deepseek', regionRefusedBy: 'gemini' });
  });

  it('still names the refusing provider after switching to a Hong Kong one', () => {
    const refused = run(
      start(),
      { type: 'draft', value: 'AIzaSyTESTKEY0000' },
      { type: 'saveAndTest' },
      { type: 'testFinished', result: failed('region') },
    );
    const s = settings({ provider: 'deepseek' });
    const switched = run(refused, { type: 'selectProvider', id: 'deepseek', ...cardState(s, web, 'deepseek', null) });
    expect(switched).toMatchObject({ provider: 'deepseek', regionRefusedBy: 'gemini' });
  });

  it('lists models only past the same shape check as Save & test', () => {
    const typed = run(start(), { type: 'draft', value: 'sk-1234567890abcdef' });
    expect(run(typed, { type: 'listAsked' }).key).toMatchObject({ kind: 'editing', shape: { likely: 'deepseek' } });
    const plausible = run(start(), { type: 'draft', value: 'AIzaSyTESTKEY0000' });
    expect(run(plausible, { type: 'listAsked' })).toBe(plausible);
  });

  it('blocks Save & test while a workspace region has no valid workspace', () => {
    const qwen = start({ provider: 'qwen' });
    expect(canTest(run(qwen, { type: 'draft', value: 'sk-1234567890' }))).toBe(true);
    const pending = run(qwen, { type: 'draft', value: 'sk-1234567890' }, { type: 'baseUrl', url: null });
    expect(canTest(pending)).toBe(false);
    expect(run(pending, { type: 'saveAndTest' }).test.kind).toBe('idle');
    const hk = 'https://llm-abc.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1';
    expect(canTest(run(pending, { type: 'baseUrl', url: hk }))).toBe(true);
  });

  it('offers session-only use after a Keychain refusal', () => {
    const denied = run(start(), { type: 'draft', value: 'AIzaSyTESTKEY0000' }, { type: 'keychainError', kind: 'denied' });
    expect(denied.keychainError).toBe('denied');
    const session = run(denied, { type: 'useForSession' }, { type: 'saved', store: 'memory', last4: '0000' });
    expect(session).toMatchObject({ keychainError: null, key: { kind: 'saved', store: 'memory' } });
  });

  it('confirms before forgetting one key or all of them', () => {
    const saved = run(start(), { type: 'saved', store: 'browser', last4: 'abcd' });
    expect(run(saved, { type: 'forgetAsked', which: 'one' }).confirmForget).toBe('one');
    expect(run(saved, { type: 'forgetAsked', which: 'all' }, { type: 'cancelForget' })).toMatchObject({
      confirmForget: null,
      key: { kind: 'saved' },
    });
    expect(run(saved, { type: 'forgetAsked', which: 'all' }, { type: 'forgotten' })).toMatchObject({
      confirmForget: null,
      key: { kind: 'none' },
    });
  });

  it('keeps model and base URL per provider', () => {
    const s = settings({ models: { gemini: 'gemini-3.8-flash', custom: 'mine' }, baseUrls: { custom: 'https://ai.example.org/v1' } });
    let state = initialAiSetup(s, web, undefined, noPeek);
    expect(state.model).toBe('gemini-3.8-flash');
    state = run(state, { type: 'selectProvider', id: 'custom', ...cardState(s, web, 'custom', null) });
    expect(state).toMatchObject({ provider: 'custom', model: 'mine', baseUrl: 'https://ai.example.org/v1' });
    state = run(state, { type: 'selectProvider', id: 'gemini', ...cardState(s, web, 'gemini', null) });
    expect(state).toMatchObject({ provider: 'gemini', model: 'gemini-3.8-flash', baseUrl: undefined });
    expect(run(state, { type: 'model', id: 'x' }, { type: 'baseUrl', url: 'https://y' })).toMatchObject({ model: 'x', baseUrl: 'https://y' });
  });

  it('opens a deep-linked card without committing it; Continue waits for the committed one', () => {
    const state = start({ provider: 'gemini' }, { provider: 'deepseek' });
    expect(state.provider).toBe('deepseek');
    expect(resumeReady(state, 'gemini', true)).toBe(false);
    expect(resumeReady(state, 'deepseek', false)).toBe(false);
    expect(resumeReady(state, 'deepseek', true)).toBe(true);
  });

  it('asks before closing over a typed key, and stops asking once it is saved or cleared', () => {
    const typed = run(start(), { type: 'draft', value: 'AIzaSyTESTKEY0000' });
    expect(needsCloseGuard(typed)).toBe(true);
    expect(needsCloseGuard(run(typed, { type: 'draft', value: '  ' }))).toBe(false);
    expect(needsCloseGuard(run(typed, { type: 'saved', store: 'session' }))).toBe(false);
  });

  it('returns to the saved key when the replacement draft is cleared', () => {
    const saved = run(start(), { type: 'saved', store: 'browser', last4: 'abcd' });
    const cleared = run(saved, { type: 'draft', value: 'new' }, { type: 'draft', value: '' });
    expect(cleared.key).toEqual({ kind: 'saved', store: 'browser', last4: 'abcd' });
  });
});

describe('the Qwen workspace URL', () => {
  const hk = 'https://{WorkspaceId}.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1';
  const built = 'https://llm-abc123.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1';

  it('builds the same URL from a pasted API Host and a bare id', () => {
    expect(qwenWorkspaceUrl(hk, 'llm-abc123')).toBe(built);
    expect(qwenWorkspaceUrl(hk, 'llm-abc123.cn-hongkong.maas.aliyuncs.com')).toBe(built);
    expect(qwenWorkspaceUrl(hk, ' https://llm-abc123.cn-hongkong.maas.aliyuncs.com/compatible-mode/v1 ')).toBe(built);
  });

  it('refuses a host from another region and anything else', () => {
    expect(qwenWorkspaceUrl(hk, 'llm-abc123.ap-southeast-1.maas.aliyuncs.com')).toBeNull();
    expect(qwenWorkspaceUrl(hk, 'evil.example.com')).toBeNull();
    expect(qwenWorkspaceUrl(hk, 'ab')).toBeNull();
    expect(qwenWorkspaceUrl(hk, 'has space')).toBeNull();
    expect(qwenWorkspaceUrl('https://dashscope-intl.aliyuncs.com/compatible-mode/v1', 'llm-abc123')).toBeNull();
  });
});
