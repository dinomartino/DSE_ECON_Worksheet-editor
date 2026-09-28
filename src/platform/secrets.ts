import type { ProviderId } from '@/ai/types';

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

export function readSecret(account: SecretAccount): Promise<SecretRead> {
  // P-SETTINGS replaces this body
  void account;
  return Promise.resolve({ ok: true, value: null, store: null });
}

export function writeSecret(account: SecretAccount, value: string, opts: { remember: boolean }): Promise<SecretWrite> {
  // P-SETTINGS replaces this body
  void account;
  void value;
  void opts;
  return Promise.resolve({ ok: false, error: { kind: 'unavailable', message: 'Saving keys is not available yet.' } });
}

/** Removes the key from every store. */
export function deleteSecret(account: SecretAccount): Promise<void> {
  // P-SETTINGS replaces this body
  void account;
  return Promise.resolve();
}

/** Synchronous presence check of memory / session / local only. NEVER touches the keychain.
 *  Returns the store and the last 4 characters, never the value. */
export function peekSecret(account: SecretAccount): { store: SecretStore; last4: string } | null {
  // P-SETTINGS replaces this body
  void account;
  return null;
}

/** Fires after a write or delete. Returns the unsubscribe. */
export function subscribeSecrets(listener: () => void): () => void {
  // P-SETTINGS replaces this body
  void listener;
  return () => {};
}

/** "your Keychain" · "Windows Credential Manager" · "this browser" · "this tab only". */
export function secretStoreLabel(store: SecretStore, platform: 'mac' | 'windows' | 'web'): string {
  switch (store) {
    case 'keychain':
      return platform === 'windows' ? 'Windows Credential Manager' : 'your Keychain';
    case 'browser':
      return 'this browser';
    case 'session':
      return 'this tab only';
    case 'memory':
      return platform === 'web' ? 'this tab only' : 'this session only';
  }
}
