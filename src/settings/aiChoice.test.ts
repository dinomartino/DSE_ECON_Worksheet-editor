import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderId } from '@/ai/types';
import { aiChoiceState, choicePatch, ownKeyProvider, providerAfterForget } from './aiChoice';
import { AI_SETTINGS, type AiSettings } from './aiSettings';
import { ownProviderAfterSignOut } from './mentorAccount';

/** Mentor credits or my own key (k-0527, u-ypm9). */

const base = (over: Partial<AiSettings> = {}): AiSettings => ({ ...AI_SETTINGS.defaults({ desktop: false }), ...over });
const savedOf = (...ids: ProviderId[]) => (p: ProviderId) => ids.includes(p);

describe('the choice between Mentor credits and my own key', () => {
  it('is shown only when signed in AND an own key is saved', () => {
    expect(aiChoiceState(base({ provider: 'mentor' }), true, savedOf())).toBeNull();
    expect(aiChoiceState(base({ provider: 'gemini' }), false, savedOf('gemini'))).toBeNull();
    expect(aiChoiceState(base({ provider: 'mentor' }), true, savedOf('gemini'))).toEqual({ using: 'mentor', own: 'gemini' });
    expect(aiChoiceState(base({ provider: 'deepseek' }), true, savedOf('gemini', 'deepseek'))).toEqual({ using: 'own', own: 'deepseek' });
  });

  it('existing users keep what they have: the choice IS the saved provider, nothing is rewritten', () => {
    // Signed in after saving a key (sign-in made the account the AI): Mentor stays.
    expect(aiChoiceState(base({ provider: 'mentor' }), true, savedOf('gemini'))?.using).toBe('mentor');
    // Picked an own key under Advanced while signed in: own key stays.
    expect(aiChoiceState(base({ provider: 'gemini' }), true, savedOf('gemini'))?.using).toBe('own');
  });

  it('"My own key" means the remembered own provider, else the first saved key', () => {
    expect(ownKeyProvider(base({ provider: 'mentor', ownProvider: 'qwen' }), savedOf('gemini', 'qwen'))).toBe('qwen');
    expect(ownKeyProvider(base({ provider: 'mentor', ownProvider: 'qwen' }), savedOf('gemini'))).toBe('gemini');
    expect(ownKeyProvider(base({ provider: 'mentor' }), savedOf('deepseek', 'openai'))).toBe('deepseek');
    // A keyless provider in use counts (Ollama on this computer).
    expect(ownKeyProvider(base({ provider: 'ollama' }), savedOf())).toBe('ollama');
    expect(ownKeyProvider(base({ provider: 'mentor' }), savedOf())).toBeNull();
  });

  it('switching writes only provider (and which own key), both ways', () => {
    const s = base({ provider: 'mentor', ownProvider: 'qwen' });
    expect(choicePatch(s, 'own', savedOf('qwen'))).toEqual({ provider: 'qwen', ownProvider: 'qwen' });
    expect(choicePatch(base({ provider: 'gemini' }), 'mentor', savedOf('gemini'))).toEqual({ provider: 'mentor', ownProvider: 'gemini' });
    expect(choicePatch(base({ provider: 'mentor' }), 'own', savedOf())).toBeNull();
  });

  it('signing out of Mentor falls back to the own key "My own key" means', () => {
    expect(ownProviderAfterSignOut(base({ provider: 'mentor', ownProvider: 'qwen' }), savedOf('gemini', 'qwen'))).toBe('qwen');
    expect(ownProviderAfterSignOut(base({ provider: 'mentor' }), savedOf('deepseek'))).toBe('deepseek');
    expect(ownProviderAfterSignOut(base({ provider: 'openai' }), savedOf('deepseek'))).toBe('openai');
  });

  it('forgetting the own key in use while signed in falls back to Mentor; otherwise nothing changes', () => {
    expect(providerAfterForget(base({ provider: 'gemini' }), ['gemini'], true)).toBe('mentor');
    expect(providerAfterForget(base({ provider: 'gemini' }), ['gemini', 'qwen'], true)).toBe('mentor');
    expect(providerAfterForget(base({ provider: 'gemini' }), ['qwen'], true)).toBeNull();
    expect(providerAfterForget(base({ provider: 'gemini' }), ['gemini'], false)).toBeNull();
    expect(providerAfterForget(base({ provider: 'mentor' }), ['gemini'], true)).toBeNull();
  });

  it('keeps the remembered own provider through a reload, and never as "mentor"', () => {
    expect(AI_SETTINGS.fields.ownProvider('qwen')).toBe('qwen');
    expect(AI_SETTINGS.fields.ownProvider('mentor')).toBeUndefined();
    expect(AI_SETTINGS.fields.ownProvider(undefined)).toBeUndefined();
  });
});

// ---- Never charges the side that isn't chosen (a real run's request, both secrets saved) ----

class FakeStorage {
  data = new Map<string, string>();
  getItem = (key: string) => this.data.get(key) ?? null;
  setItem = (key: string, value: string) => void this.data.set(key, value);
  removeItem = (key: string) => void this.data.delete(key);
}

const MENTOR_TOKEN = 'mtok_verify_0123456789abcdef';
const GEMINI_KEY = 'AIzaSyTESTKEY000000000000007Qx4';

/** Both signed in and an own Gemini key saved; returns where one translate request went. */
async function sendOne(provider: 'mentor' | 'gemini', switchTo?: 'mentor' | 'own') {
  vi.resetModules();
  const local = new FakeStorage();
  local.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider }));
  vi.stubGlobal('window', { localStorage: local, sessionStorage: new FakeStorage(), addEventListener: () => {}, removeEventListener: () => {} });
  const calls: Array<{ url: string; auth: string }> = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({ url: String(url), auth: `${headers.get('authorization') ?? ''} ${headers.get('x-goog-api-key') ?? ''} ${String(url).includes('key=') ? 'url-key' : ''}` });
    return new Response(JSON.stringify({ error: { code: 400, message: 'stop here' } }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  });
  const { writeSecret } = await import('@/platform/secrets');
  await writeSecret('ai:mentor', MENTOR_TOKEN, { remember: true });
  await writeSecret('ai:gemini', GEMINI_KEY, { remember: true });
  if (switchTo) (await import('./aiChoiceLive')).setAiChoice(switchTo);
  const { createRunDeps } = await import('@/translate/deps');
  const { ITEMS_SCHEMA } = await import('@/ai/schema');
  const deps = await createRunDeps({ glossary: false });
  if (!deps.ok) throw new Error(`no deps: ${JSON.stringify(deps)}`);
  await deps.deps.client
    .complete({ system: 'S', turns: [{ role: 'user', content: '{"items":[]}' }], schema: ITEMS_SCHEMA, maxOutputTokens: 100, signal: new AbortController().signal })
    .catch(() => undefined);
  return calls;
}

const toMentor = (calls: Array<{ url: string; auth: string }>) => calls.filter((c) => c.url.includes('dseconmentor.com'));
const toGoogle = (calls: Array<{ url: string }>) => calls.filter((c) => c.url.includes('generativelanguage.googleapis.com'));

describe('a run goes only where the choice says (k-0527)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('"My own key" chosen: Google gets the request with the key, Mentor gets nothing (no credits)', async () => {
    const calls = await sendOne('gemini');
    expect(toMentor(calls)).toEqual([]);
    expect(toGoogle(calls).length).toBeGreaterThan(0);
    expect(calls.every((c) => !c.auth.includes(MENTOR_TOKEN))).toBe(true);
  });

  it('"DSEcon Mentor credits" chosen: Mentor gets the request with the sign-in, Google and the key get nothing', async () => {
    const calls = await sendOne('mentor');
    expect(toGoogle(calls)).toEqual([]);
    expect(toMentor(calls).length).toBeGreaterThan(0);
    expect(toMentor(calls).every((c) => c.auth.includes(MENTOR_TOKEN))).toBe(true);
    expect(calls.every((c) => !c.auth.includes(GEMINI_KEY) && !c.url.includes(GEMINI_KEY))).toBe(true);
  });

  it('a switch from the chip or Settings takes effect on the next request, both ways', async () => {
    const own = await sendOne('mentor', 'own');
    expect(toMentor(own)).toEqual([]);
    expect(toGoogle(own).length).toBeGreaterThan(0);
    const mentor = await sendOne('gemini', 'mentor');
    expect(toGoogle(mentor)).toEqual([]);
    expect(toMentor(mentor).length).toBeGreaterThan(0);
  });
});
