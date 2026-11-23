import { useSyncExternalStore } from 'react';
import { createMentorRelay, type LinkDevice, type MentorAccount, type MentorRelay } from '@/ai/mentor';
import { mapThrown } from '@/ai/errors';
import { presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type AiErrorInfo, type ProviderId } from '@/ai/types';
import { isDesktop, openExternal } from '@/platform';
import { deleteSecret, peekSecret, readSecret, subscribeSecrets, writeSecret } from '@/platform/secrets';
import pkg from '../../package.json';
import { AI_SETTINGS, type AiSettings } from './aiSettings';
import { appSettings } from './store';

/**
 * The DSEcon Mentor account in the editor (k-0519): sign in by link code, the token in the
 * keychain (desktop) or this browser (web) as secret `ai:mentor`, the credits left, sign out.
 * Signing in makes the account the AI in use; signing out goes back to a saved own key.
 * Nothing here runs until the teacher presses Sign in, or opens Settings → AI while signed in.
 */

export type MentorState =
  | { kind: 'signedOut'; reason?: 'denied' | 'expired' | 'keychain'; error?: AiErrorInfo }
  /** `code` is null until Mentor has answered the start. */
  | { kind: 'linking'; code: string | null; verifyUrl: string | null }
  | { kind: 'signedIn'; account: MentorAccount | null; loading: boolean; error?: AiErrorInfo };

export interface MentorDeps {
  relay: () => MentorRelay;
  device: () => LinkDevice;
  open(url: string): Promise<void>;
  readToken(): Promise<string | null>;
  /** The store it went to, or null when it could not be kept. */
  writeToken(token: string): Promise<'keychain' | 'other' | null>;
  deleteToken(): Promise<void>;
  /** Without reading the keychain. */
  hasToken(): boolean;
  /** Whether an own key is saved for `provider` (where sign-out goes back to). */
  hasOwnKey(provider: ProviderId): boolean;
  readSettings(): AiSettings;
  writeSettings(patch: Partial<AiSettings>): void;
  sleep(ms: number, signal: AbortSignal): Promise<void>;
  now(): number;
}

export interface MentorSession {
  subscribe(listener: () => void): () => void;
  current(): MentorState;
  signIn(): Promise<void>;
  /** Stops a sign-in that is waiting for the browser. */
  cancel(): void;
  signOut(): Promise<void>;
  /** Re-reads the credits (Settings open, after a run). */
  refresh(): Promise<void>;
  /** Makes the account the AI in use again (after the teacher picked an own key). */
  use(): void;
}

/** The provider to fall back to on sign-out: the one in use if it is not the account, else the first with a saved key. */
export function ownProviderAfterSignOut(settings: AiSettings, saved: (p: ProviderId) => boolean): ProviderId {
  if (settings.provider !== 'mentor') return settings.provider;
  return PROVIDER_IDS.find((p) => presetFor(p).group !== 'hosted' && saved(p)) ?? 'gemini';
}

export function createMentorSession(deps: MentorDeps): MentorSession {
  const listeners = new Set<() => void>();
  let state: MentorState = deps.hasToken() ? { kind: 'signedIn', account: null, loading: false } : { kind: 'signedOut' };
  let linking: AbortController | null = null;
  let reading: AbortController | null = null;

  const set = (next: MentorState) => {
    state = next;
    for (const l of [...listeners]) l();
  };

  /** A sign-in token Mentor refused: forget it here too. */
  const forget = async (error?: AiErrorInfo) => {
    await deps.deleteToken();
    const settings = deps.readSettings();
    const { mentor: _gone, ...rest } = settings.keychainSaved;
    void _gone;
    deps.writeSettings({ keychainSaved: rest, provider: ownProviderAfterSignOut(settings, deps.hasOwnKey) });
    set({ kind: 'signedOut', ...(error ? { error } : {}) });
  };

  async function refresh() {
    if (state.kind === 'linking') return;
    reading?.abort();
    const controller = new AbortController();
    reading = controller;
    const token = await deps.readToken().catch(() => null);
    if (!token) {
      if (state.kind === 'signedIn') set({ kind: 'signedOut' });
      return;
    }
    const before = state.kind === 'signedIn' ? state.account : null;
    set({ kind: 'signedIn', account: before, loading: true });
    try {
      const account = await deps.relay().account(token, controller.signal);
      if (reading === controller) set({ kind: 'signedIn', account, loading: false });
    } catch (error) {
      if (reading !== controller) return;
      const info = mapThrown('mentor', error, null);
      if (info.kind === 'signedOut') return forget(info);
      set({ kind: 'signedIn', account: before, loading: false, error: info });
    }
  }

  async function signIn() {
    linking?.abort();
    const controller = new AbortController();
    linking = controller;
    const { signal } = controller;
    set({ kind: 'linking', code: null, verifyUrl: null });
    try {
      const relay = deps.relay();
      const start = await relay.startLink(deps.device(), signal);
      set({ kind: 'linking', code: start.code, verifyUrl: start.verifyUrl });
      await deps.open(start.verifyUrl).catch(() => undefined);
      for (;;) {
        if (deps.now() >= start.expiresAt) return set({ kind: 'signedOut', reason: 'expired' });
        await deps.sleep(start.intervalMs, signal);
        const poll = await relay.pollLink(start.pollToken, signal);
        if (poll.status === 'pending') {
          if (poll.retryAfterMs) await deps.sleep(poll.retryAfterMs, signal);
          continue;
        }
        if (poll.status !== 'approved') return set({ kind: 'signedOut', reason: poll.status });
        const store = await deps.writeToken(poll.token);
        if (!store) return set({ kind: 'signedOut', reason: 'keychain' });
        const settings = deps.readSettings();
        deps.writeSettings({
          provider: 'mentor',
          keychainSaved: store === 'keychain' ? { ...settings.keychainSaved, mentor: true } : settings.keychainSaved,
        });
        linking = null;
        set({ kind: 'signedIn', account: null, loading: true });
        return void (await refresh());
      }
    } catch (error) {
      if (signal.aborted) return;
      set({ kind: 'signedOut', error: mapThrown('mentor', error, null) });
    } finally {
      if (linking === controller) linking = null;
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    current: () => state,
    signIn,
    cancel() {
      linking?.abort();
      linking = null;
      if (state.kind === 'linking') set({ kind: 'signedOut' });
    },
    async signOut() {
      reading?.abort();
      const token = await deps.readToken().catch(() => null);
      if (token) await deps.relay().signOut(token, new AbortController().signal);
      await forget();
    },
    refresh,
    use() {
      if (state.kind === 'signedIn') deps.writeSettings({ provider: 'mentor' });
    },
  };
}

// ── Live wiring ──────────────────────────────────────────────────────────

function deviceLabel(): string {
  if (!isDesktop()) return 'Econ Studio (web)';
  const ua = typeof navigator === 'undefined' ? '' : `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /Win/i.test(ua) ? 'Econ Studio on Windows' : /Mac/i.test(ua) ? 'Econ Studio on Mac' : 'Econ Studio';
}

function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

const relayBase = () => appSettings.read(AI_SETTINGS).baseUrls.mentor ?? presetFor('mentor').baseUrl;

export function liveMentorDeps(): MentorDeps {
  const readSettings = () => appSettings.read(AI_SETTINGS);
  return {
    relay: () => createMentorRelay({ relayBase: relayBase() }),
    device: () => ({ platform: isDesktop() ? 'desktop' : 'web', deviceLabel: deviceLabel(), appVersion: pkg.version }),
    open: (url) => openExternal(url),
    async readToken() {
      const read = await readSecret('ai:mentor');
      return read.ok ? read.value : null;
    },
    async writeToken(token) {
      // Always remembered: a sign-in that vanished on restart would mean signing in daily.
      const kept = await writeSecret('ai:mentor', token, { remember: true });
      if (kept.ok) return kept.store === 'keychain' ? 'keychain' : 'other';
      // Keychain refused (desktop): this session only, said in Settings.
      const session = await writeSecret('ai:mentor', token, { remember: false });
      return session.ok ? 'other' : null;
    },
    deleteToken: () => deleteSecret('ai:mentor'),
    hasToken: () => peekSecret('ai:mentor') !== null || (isDesktop() && readSettings().keychainSaved.mentor === true),
    hasOwnKey: (p) => peekSecret(`ai:${p}`) !== null || readSettings().keychainSaved[p] === true,
    readSettings,
    writeSettings: (patch) => appSettings.write(AI_SETTINGS, patch),
    sleep: abortableSleep,
    now: () => Date.now(),
  };
}

let live: MentorSession | null = null;

/** The app's one account session (created on first use, in the browser only). */
export function mentorSession(): MentorSession {
  if (!live) {
    live = createMentorSession(liveMentorDeps());
    // A token forgotten in another tab, or by Settings' Forget, signs this one out.
    subscribeSecrets(() => {
      const s = live?.current();
      if (s?.kind === 'signedIn' && peekSecret('ai:mentor') === null && !(isDesktop() && appSettings.read(AI_SETTINGS).keychainSaved.mentor)) {
        void live?.refresh();
      }
    });
  }
  return live;
}

/** For tests. */
export function resetMentorSessionForTest(): void {
  live = null;
}

const SIGNED_OUT: MentorState = { kind: 'signedOut' };

/** Re-renders on every change of the account's state. */
export function useMentorAccount(): MentorState {
  return useSyncExternalStore(
    (l) => mentorSession().subscribe(l),
    () => mentorSession().current(),
    () => SIGNED_OUT,
  );
}
