import type { ProviderId } from '@/ai/types';
import { isDesktop } from './index';
import { platformMessages } from './text';

/**
 * The only holder of AI provider keys. Never in a document, a backup, settings, a log or
 * a URL. Web: sessionStorage, or localStorage when "Remember" is ticked (keys under
 * `econgen.secret.`, never `econ-worksheet:`). Desktop: the OS keychain through the
 * shell's `secret_*` commands, loaded with `await import()` behind `isDesktop()`.
 */

export type SecretAccount = `ai:${ProviderId}`;
export type SecretStore = 'keychain' | 'browser' | 'session' | 'memory';
export interface SecretError { kind: 'denied' | 'unavailable' | 'invalid' | 'failed'; message: string }
export type SecretRead = { ok: true; value: string | null; store: SecretStore | null } | { ok: false; error: SecretError };
export type SecretWrite = { ok: true; store: SecretStore } | { ok: false; error: SecretError };

const ACCOUNT = /^ai:[a-z]{2,16}$/;
// Any whitespace or control character: a pasted key with a line break is refused, not trimmed inside.
const BAD_CHAR = /[\s\p{Cc}]/u;
const PREFIX = 'econgen.secret.';

/**
 * This session's copy. Desktop: the key read from (or saved to) the keychain, so the
 * keychain is read once per session, or a session-only key. Web: used only when storage throws.
 */
const memory = new Map<string, { value: string; store: SecretStore }>();
const listeners = new Set<() => void>();

const invalid = (message: string): { ok: false; error: SecretError } => ({ ok: false, error: { kind: 'invalid', message } });

function checkAccount(account: string): { ok: false; error: SecretError } | null {
  return ACCOUNT.test(account) ? null : invalid(platformMessages().notKeyAccount);
}

function webStorage(kind: 'local' | 'session'): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return (kind === 'local' ? window.localStorage : window.sessionStorage) ?? null;
  } catch {
    return null;
  }
}

function getWeb(kind: 'local' | 'session', account: string): string | null {
  try {
    return webStorage(kind)?.getItem(PREFIX + account) ?? null;
  } catch {
    return null;
  }
}

/** False when that storage is missing or refuses. */
function setWeb(kind: 'local' | 'session', account: string, value: string | null): boolean {
  try {
    const storage = webStorage(kind);
    if (!storage) return false;
    if (value === null) storage.removeItem(PREFIX + account);
    else storage.setItem(PREFIX + account, value);
    return true;
  } catch {
    return false;
  }
}

function notify() {
  for (const listener of [...listeners]) listener();
}

/** Thrown when the shell's API itself would not load. */
class ShellUnavailable extends Error {}

/**
 * keyring's message says which: "Couldn't access platform secure storage" is a missing or
 * locked keychain; a platform failure naming a cancel or refusal is the teacher's "Deny".
 * Anything else that is not keyring's (a missing command or capability) is unavailable.
 */
function keychainError(error: unknown): SecretError {
  if (error instanceof ShellUnavailable) return { kind: 'unavailable', message: platformMessages().keychainUnreachable };
  const text = typeof error === 'string' ? error : error instanceof Error ? error.message : '';
  if (/^bad (account|secret)$/.test(text)) return { kind: 'invalid', message: platformMessages().keyRefused };
  if (text.startsWith("Couldn't access platform secure storage")) {
    return { kind: 'unavailable', message: platformMessages().keychainUnreachable };
  }
  if (text.startsWith('Platform secure storage failure')) {
    return /cancel|denied|not allowed|passphrase|interaction|authori[sz]/i.test(text)
      ? { kind: 'denied', message: platformMessages().keychainDenied }
      : { kind: 'failed', message: platformMessages().keychainFailed };
  }
  return { kind: 'unavailable', message: platformMessages().keychainUnreachable };
}

async function invokeKeychain<T>(command: string, args: Record<string, unknown>): Promise<T> {
  let invoke: typeof import('@tauri-apps/api/core').invoke;
  try {
    ({ invoke } = await import('@tauri-apps/api/core'));
  } catch {
    throw new ShellUnavailable();
  }
  return invoke<T>(command, args);
}

export async function readSecret(account: SecretAccount): Promise<SecretRead> {
  const bad = checkAccount(account);
  if (bad) return bad;
  const held = memory.get(account);
  if (held) return { ok: true, value: held.value, store: held.store };
  if (isDesktop()) {
    try {
      const value = await invokeKeychain<string | null>('secret_get', { account });
      if (value === null) return { ok: true, value: null, store: null };
      memory.set(account, { value, store: 'keychain' });
      return { ok: true, value, store: 'keychain' };
    } catch (error) {
      return { ok: false, error: keychainError(error) };
    }
  }
  const session = getWeb('session', account);
  if (session !== null) return { ok: true, value: session, store: 'session' };
  const local = getWeb('local', account);
  if (local !== null) return { ok: true, value: local, store: 'browser' };
  return { ok: true, value: null, store: null };
}

/** Trimmed; 8–512 characters with no whitespace or control characters. */
export async function writeSecret(account: SecretAccount, value: string, opts: { remember: boolean }): Promise<SecretWrite> {
  const bad = checkAccount(account);
  if (bad) return bad;
  const key = value.trim();
  if (key.length < 8 || key.length > 512 || BAD_CHAR.test(key)) return invalid(platformMessages().notAKey);
  const result = isDesktop() ? await writeDesktop(account, key, opts.remember) : writeWeb(account, key, opts.remember);
  if (result.ok) notify();
  return result;
}

async function writeDesktop(account: string, key: string, remember: boolean): Promise<SecretWrite> {
  if (!remember) {
    memory.set(account, { value: key, store: 'memory' });
    // Best effort: an older remembered key must not come back next session.
    await invokeKeychain('secret_delete', { account }).catch(() => {});
    return { ok: true, store: 'memory' };
  }
  try {
    await invokeKeychain('secret_set', { account, secret: key });
  } catch (error) {
    // Never a silent plaintext fallback: the section offers "Use for this session".
    return { ok: false, error: keychainError(error) };
  }
  memory.set(account, { value: key, store: 'keychain' });
  return { ok: true, store: 'keychain' };
}

function writeWeb(account: string, key: string, remember: boolean): SecretWrite {
  const [into, other] = remember ? (['local', 'session'] as const) : (['session', 'local'] as const);
  if (setWeb(into, account, key)) {
    setWeb(other, account, null);
    memory.delete(account);
    return { ok: true, store: remember ? 'browser' : 'session' };
  }
  setWeb(other, account, null);
  memory.set(account, { value: key, store: 'memory' });
  return { ok: true, store: 'memory' };
}

/** Removes the key from every store. */
export async function deleteSecret(account: SecretAccount): Promise<void> {
  if (checkAccount(account)) return;
  memory.delete(account);
  setWeb('session', account, null);
  setWeb('local', account, null);
  if (isDesktop()) await invokeKeychain('secret_delete', { account }).catch(() => {});
  notify();
}

/** Synchronous presence check of memory / session / local only. NEVER touches the keychain.
 *  Returns the store and the last 4 characters, never the value. */
export function peekSecret(account: SecretAccount): { store: SecretStore; last4: string } | null {
  if (checkAccount(account)) return null;
  const held = memory.get(account);
  if (held) return { store: held.store, last4: held.value.slice(-4) };
  const session = getWeb('session', account);
  if (session) return { store: 'session', last4: session.slice(-4) };
  const local = getWeb('local', account);
  if (local) return { store: 'browser', last4: local.slice(-4) };
  return null;
}

/** Fires after a write or delete. Returns the unsubscribe. */
export function subscribeSecrets(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** "your Keychain" · "Windows Credential Manager" · "this browser" · "this tab only". */
export function secretStoreLabel(store: SecretStore, platform: 'mac' | 'windows' | 'web'): string {
  const m = platformMessages();
  switch (store) {
    case 'keychain':
      return platform === 'windows' ? m.storeCredentialManager : m.storeKeychain;
    case 'browser':
      return m.storeBrowser;
    case 'session':
      return m.storeTab;
    case 'memory':
      return platform === 'web' ? m.storeTab : m.storeSession;
  }
}

/** Test seam: forget this session's copies. */
export function resetSecretsForTest(): void {
  memory.clear();
}
