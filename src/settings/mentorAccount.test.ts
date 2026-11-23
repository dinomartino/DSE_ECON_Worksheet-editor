import { describe, expect, it } from 'vitest';
import { fakeMentor, type FakeMentorOptions } from '@/ai/fakeMentor';
import { MENTOR_BUY_URL, createMentorRelay } from '@/ai/mentor';
import type { ProviderId } from '@/ai/types';
import { AI_SETTINGS, type AiSettings } from './aiSettings';
import { createMentorSession, ownProviderAfterSignOut, type MentorDeps } from './mentorAccount';

/** The DSEcon Mentor account's sign-in, credits and sign-out (k-0519), against the fake relay. */

function harness(opts: FakeMentorOptions & { storedToken?: string; keychain?: 'keychain' | 'other' | null; ownKeys?: ProviderId[]; settings?: Partial<AiSettings> } = {}) {
  const server = fakeMentor(opts);
  let settings: AiSettings = { ...AI_SETTINGS.defaults({ desktop: true }), ...opts.settings };
  let token: string | null = opts.storedToken ?? null;
  const opened: string[] = [];
  const sleeps: number[] = [];
  const writes: Array<{ tabOnly: boolean }> = [];
  let clock = 0;
  const deps: MentorDeps = {
    relay: () => createMentorRelay({ deps: server.deps }),
    device: () => ({ platform: 'desktop', deviceLabel: 'Econ Studio on Mac', appVersion: '0.10.0' }),
    open: async (url) => void opened.push(url),
    readToken: async () => token,
    writeToken: async (t, how) => {
      writes.push(how);
      const store = opts.keychain === undefined ? 'keychain' : opts.keychain;
      if (store) token = t;
      return store;
    },
    deleteToken: async () => void (token = null),
    hasToken: () => token !== null,
    hasOwnKey: (p) => (opts.ownKeys ?? []).includes(p),
    readSettings: () => settings,
    writeSettings: (patch) => void (settings = { ...settings, ...patch }),
    sleep: async (ms, signal) => {
      sleeps.push(ms);
      clock += ms;
      await new Promise((r) => setTimeout(r, 0));
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    },
    now: () => clock,
  };
  const session = createMentorSession(deps);
  return { server, session, opened, sleeps, writes, deps, settings: () => settings, token: () => token };
}

describe('Sign in with DSEcon Mentor', () => {
  it('opens the Allow page, polls until allowed, keeps the token and makes the account the AI in use', async () => {
    const h = harness({ pendingPolls: 2 });
    const states: string[] = [];
    h.session.subscribe(() => states.push(h.session.current().kind));
    await h.session.signIn();
    expect(h.opened).toEqual(['https://dseconmentor.com/link?code=BCDF-GHJK']);
    expect(h.sleeps).toEqual([3000, 3000, 3000]);
    expect(h.token()).toBe(h.server.token);
    expect(h.settings().provider).toBe('mentor');
    expect(h.settings().keychainSaved.mentor).toBe(true);
    expect(h.session.current()).toMatchObject({ kind: 'signedIn', loading: false, account: { credits: 900, status: 'on' } });
    expect(states[0]).toBe('linking');
  });

  it('shows the code while it waits', async () => {
    const h = harness({ pendingPolls: 1 });
    const codes: Array<string | null> = [];
    h.session.subscribe(() => {
      const s = h.session.current();
      if (s.kind === 'linking') codes.push(s.code);
    });
    await h.session.signIn();
    expect(codes).toEqual([null, 'BCDF-GHJK']);
  });

  it('a denied or expired sign-in says so and changes nothing', async () => {
    for (const outcome of ['denied', 'expired'] as const) {
      const h = harness({ pendingPolls: 0, outcome });
      await h.session.signIn();
      expect(h.session.current()).toEqual({ kind: 'signedOut', reason: outcome });
      expect(h.settings().provider).toBe('gemini');
      expect(h.token()).toBeNull();
    }
  });

  it('a keychain that will not keep the token: signed out, said why', async () => {
    const h = harness({ pendingPolls: 0, keychain: null });
    await h.session.signIn();
    expect(h.session.current()).toEqual({ kind: 'signedOut', reason: 'keychain' });
    expect(h.settings().provider).toBe('gemini');
  });

  it('a session-only token (no keychain) still signs in, without the keychain flag', async () => {
    const h = harness({ pendingPolls: 0, keychain: 'other' });
    await h.session.signIn();
    expect(h.session.current().kind).toBe('signedIn');
    expect(h.settings().keychainSaved.mentor).toBeUndefined();
  });

  it('Cancel stops the waiting', async () => {
    const h = harness({ pendingPolls: 1000 });
    const run = h.session.signIn();
    await new Promise((r) => setTimeout(r, 5));
    h.session.cancel();
    await run;
    expect(h.session.current()).toEqual({ kind: 'signedOut' });
    expect(h.token()).toBeNull();
  });

  it('no connection: signed out with the network error', async () => {
    const h = harness();
    h.server.state.revoked = false;
    const offline = createMentorSession({
      ...({} as MentorDeps),
      relay: () => createMentorRelay({ deps: { fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch, now: () => 0, sleep: async () => undefined } }),
      device: () => ({ platform: 'web', deviceLabel: 'x', appVersion: '1' }),
      hasToken: () => false,
    });
    await offline.signIn();
    expect(offline.current()).toMatchObject({ kind: 'signedOut', error: { kind: 'network' } });
  });
});

describe('Signed in', () => {
  it('starts signed in when a token is kept, and reads the credits on refresh', async () => {
    const h = harness({ storedToken: 'dsm_test_token_0123456789abcdef', credits: 42 });
    expect(h.session.current()).toEqual({ kind: 'signedIn', account: null, loading: false });
    await h.session.refresh();
    expect(h.session.current()).toMatchObject({ kind: 'signedIn', account: { credits: 42 } });
  });

  it('a token Mentor no longer accepts signs out here too, back to the own key', async () => {
    const h = harness({ storedToken: 'dsm_revoked_0123456789', ownKeys: ['deepseek'], settings: { provider: 'mentor', keychainSaved: { mentor: true, deepseek: true } } });
    await h.session.refresh();
    expect(h.session.current()).toMatchObject({ kind: 'signedOut', error: { kind: 'signedOut' } });
    expect(h.token()).toBeNull();
    expect(h.settings().provider).toBe('deepseek');
    expect(h.settings().keychainSaved).toEqual({ deepseek: true });
  });

  it('Sign out tells Mentor, forgets the token and goes back to an own key (else Gemini)', async () => {
    const h = harness({ storedToken: 'dsm_test_token_0123456789abcdef', settings: { provider: 'mentor', keychainSaved: { mentor: true } } });
    await h.session.signOut();
    expect(h.server.requests.some((r) => r.path === '/auth/logout')).toBe(true);
    expect(h.server.state.revoked).toBe(true);
    expect(h.token()).toBeNull();
    expect(h.settings().provider).toBe('gemini');
    expect(h.session.current()).toEqual({ kind: 'signedOut' });
  });

  it('Sign out forgets the token before Mentor answers (k-0521 F9)', async () => {
    const h = harness({ storedToken: 'dsm_test_token_0123456789abcdef', settings: { provider: 'mentor', keychainSaved: { mentor: true } } });
    let tokenWhenAsked: string | null | undefined;
    const relay = h.deps.relay;
    h.deps.relay = () => ({ ...relay(), signOut: async () => ((tokenWhenAsked = h.token()), 'revoked' as const) });
    await createMentorSession(h.deps).signOut();
    expect(tokenWhenAsked).toBeNull();
  });

  it('Sign out Mentor could not confirm: signed out here all the same, and says where to end it', async () => {
    for (const logout of ['network', 500] as const) {
      const h = harness({ logout, storedToken: 'dsm_test_token_0123456789abcdef', settings: { provider: 'mentor', keychainSaved: { mentor: true } } });
      await h.session.refresh();
      await h.session.signOut();
      expect(h.token(), String(logout)).toBeNull();
      expect(h.settings().provider).toBe('gemini');
      expect(h.settings().keychainSaved.mentor).toBeUndefined();
      expect(h.session.current()).toEqual({ kind: 'signedOut', revokeFailed: { accountUrl: 'https://dseconmentor.com/account#ai-credits' } });
    }
    // Even a relay that throws outright cannot keep the sign-in.
    const h = harness({ storedToken: 'dsm_test_token_0123456789abcdef' });
    const relay = h.deps.relay;
    h.deps.relay = () => ({ ...relay(), signOut: () => Promise.reject(new Error('boom')) });
    const session = createMentorSession(h.deps);
    await session.signOut();
    expect(h.token()).toBeNull();
    expect(session.current()).toEqual({ kind: 'signedOut', revokeFailed: { accountUrl: MENTOR_BUY_URL } });
  });

  it('signing in again clears the warning', async () => {
    const h = harness({ logout: 'network', storedToken: 'dsm_test_token_0123456789abcdef' });
    await h.session.signOut();
    expect(h.session.current()).toMatchObject({ revokeFailed: {} });
    await h.session.signIn();
    expect(h.session.current().kind).toBe('signedIn');
  });

  it('"Shared computer" keeps the sign-in to this tab (k-0521 F15)', async () => {
    const h = harness();
    await h.session.signIn({ tabOnly: true });
    await h.session.signOut();
    await h.session.signIn();
    expect(h.writes).toEqual([{ tabOnly: true }, { tabOnly: false }]);
  });

  it('Use my account switches back from an own key', async () => {
    const h = harness({ storedToken: 'dsm_test_token_0123456789abcdef', settings: { provider: 'qwen' } });
    h.session.use();
    expect(h.settings().provider).toBe('mentor');
  });

  it('a failed credits read keeps the sign-in and shows the error', async () => {
    const h = harness({ storedToken: 'dsm_test_token_0123456789abcdef' });
    const broken = createMentorSession({
      ...({} as MentorDeps),
      relay: () => createMentorRelay({ deps: { fetch: (async () => new Response('{"error":"hosted_ai_off"}', { status: 503 })) as typeof fetch, now: () => 0, sleep: async () => undefined } }),
      readToken: async () => h.token(),
      hasToken: () => true,
    });
    await broken.refresh();
    expect(broken.current()).toMatchObject({ kind: 'signedIn', loading: false, error: { kind: 'serviceDown' } });
  });
});

describe('ownProviderAfterSignOut', () => {
  const base = AI_SETTINGS.defaults({ desktop: false });
  it('keeps an own provider in use; else the first with a saved key; else Gemini', () => {
    expect(ownProviderAfterSignOut({ ...base, provider: 'qwen' }, () => false)).toBe('qwen');
    expect(ownProviderAfterSignOut({ ...base, provider: 'mentor' }, (p) => p === 'openai')).toBe('openai');
    expect(ownProviderAfterSignOut({ ...base, provider: 'mentor' }, (p) => p === 'mentor')).toBe('gemini');
  });
});
