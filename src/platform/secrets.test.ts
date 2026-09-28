import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteSecret,
  peekSecret,
  readSecret,
  resetSecretsForTest,
  secretStoreLabel,
  subscribeSecrets,
  writeSecret,
  type SecretAccount,
} from './secrets';

const KEY = 'AIzaSyTESTKEY0000000000000007Qx4';

class FakeStorage {
  data = new Map<string, string>();
  fail = false;
  getItem(key: string) {
    if (this.fail) throw new Error('SecurityError');
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.fail) throw new Error('QuotaExceededError');
    this.data.set(key, value);
  }
  removeItem(key: string) {
    if (this.fail) throw new Error('SecurityError');
    this.data.delete(key);
  }
}

const keychain = {
  items: new Map<string, string>(),
  calls: [] as Array<{ command: string; args: Record<string, unknown> }>,
  fail: undefined as string | undefined,
};

vi.mock('@tauri-apps/api/core', () => ({
  invoke: async (command: string, args: Record<string, unknown>) => {
    keychain.calls.push({ command, args });
    if (keychain.fail) throw keychain.fail;
    const account = String(args.account);
    if (command === 'secret_get') return keychain.items.get(account) ?? null;
    if (command === 'secret_set') keychain.items.set(account, String(args.secret));
    if (command === 'secret_delete') keychain.items.delete(account);
    return null;
  },
}));

let local: FakeStorage;
let session: FakeStorage;

function stubWindow(desktop = false) {
  vi.stubGlobal('window', {
    localStorage: local,
    sessionStorage: session,
    ...(desktop ? { __TAURI_INTERNALS__: {} } : {}),
  });
}

beforeEach(() => {
  local = new FakeStorage();
  session = new FakeStorage();
  keychain.items.clear();
  keychain.calls.length = 0;
  keychain.fail = undefined;
  resetSecretsForTest();
});
afterEach(() => vi.unstubAllGlobals());

describe('secrets on the web', () => {
  beforeEach(() => stubWindow());

  it('keeps a key for the tab unless Remember is ticked', async () => {
    expect(await writeSecret('ai:gemini', KEY, { remember: false })).toEqual({ ok: true, store: 'session' });
    expect(session.data.get('econgen.secret.ai:gemini')).toBe(KEY);
    expect(local.data.size).toBe(0);
    expect(await readSecret('ai:gemini')).toEqual({ ok: true, value: KEY, store: 'session' });
  });

  it('moves the key to localStorage when remembered, removing the other copy', async () => {
    await writeSecret('ai:gemini', KEY, { remember: false });
    expect(await writeSecret('ai:gemini', KEY, { remember: true })).toEqual({ ok: true, store: 'browser' });
    expect(local.data.get('econgen.secret.ai:gemini')).toBe(KEY);
    expect(session.data.has('econgen.secret.ai:gemini')).toBe(false);
    await writeSecret('ai:gemini', KEY, { remember: false });
    expect(local.data.has('econgen.secret.ai:gemini')).toBe(false);
  });

  it('never stores under the document prefix', async () => {
    await writeSecret('ai:deepseek', 'sk-abcdefgh12345678', { remember: true });
    for (const key of local.data.keys()) expect(key.startsWith('econ-worksheet')).toBe(false);
  });

  it('falls back to memory when storage throws', async () => {
    local.fail = true;
    session.fail = true;
    expect(await writeSecret('ai:gemini', KEY, { remember: true })).toEqual({ ok: true, store: 'memory' });
    expect(await readSecret('ai:gemini')).toEqual({ ok: true, value: KEY, store: 'memory' });
    expect(peekSecret('ai:gemini')).toEqual({ store: 'memory', last4: '7Qx4' });
  });

  it('deletes from every store', async () => {
    await writeSecret('ai:gemini', KEY, { remember: true });
    session.setItem('econgen.secret.ai:gemini', KEY);
    await deleteSecret('ai:gemini');
    expect(local.data.size + session.data.size).toBe(0);
    expect(await readSecret('ai:gemini')).toEqual({ ok: true, value: null, store: null });
    expect(peekSecret('ai:gemini')).toBeNull();
  });

  it('peeks the store and the last 4 characters, never the value', async () => {
    await writeSecret('ai:gemini', `  ${KEY}\n`, { remember: true });
    const peek = peekSecret('ai:gemini');
    expect(peek).toEqual({ store: 'browser', last4: '7Qx4' });
    expect(JSON.stringify(peek)).not.toContain(KEY.slice(0, 8));
  });

  it('refuses bad accounts and bad keys', async () => {
    const bad = 'ai:Gemini' as SecretAccount;
    expect(await readSecret(bad)).toMatchObject({ ok: false, error: { kind: 'invalid' } });
    expect(await writeSecret(bad, KEY, { remember: true })).toMatchObject({ ok: false, error: { kind: 'invalid' } });
    for (const key of ['short', 'has space inside key', 'line\nbreak12345', 'x'.repeat(513)]) {
      expect(await writeSecret('ai:gemini', key, { remember: true })).toMatchObject({ ok: false });
    }
    expect(local.data.size + session.data.size).toBe(0);
  });

  it('notifies after a write or delete', async () => {
    const listener = vi.fn();
    const off = subscribeSecrets(listener);
    await writeSecret('ai:gemini', KEY, { remember: false });
    await deleteSecret('ai:gemini');
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    await deleteSecret('ai:gemini');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('never calls the keychain', async () => {
    await writeSecret('ai:gemini', KEY, { remember: true });
    await readSecret('ai:gemini');
    await deleteSecret('ai:gemini');
    expect(keychain.calls).toEqual([]);
  });
});

describe('secrets on desktop', () => {
  beforeEach(() => stubWindow(true));

  it('saves a remembered key in the keychain and nowhere on disk in plain text', async () => {
    expect(await writeSecret('ai:gemini', KEY, { remember: true })).toEqual({ ok: true, store: 'keychain' });
    expect(keychain.calls).toEqual([{ command: 'secret_set', args: { account: 'ai:gemini', secret: KEY } }]);
    expect(local.data.size + session.data.size).toBe(0);
  });

  it('reads the keychain once per session', async () => {
    keychain.items.set('ai:deepseek', 'sk-deepseek-12345678');
    expect(peekSecret('ai:deepseek')).toBeNull();
    expect(await readSecret('ai:deepseek')).toEqual({ ok: true, value: 'sk-deepseek-12345678', store: 'keychain' });
    await readSecret('ai:deepseek');
    expect(keychain.calls).toEqual([{ command: 'secret_get', args: { account: 'ai:deepseek' } }]);
    expect(peekSecret('ai:deepseek')).toEqual({ store: 'keychain', last4: '5678' });
  });

  it('reports a missing item as no key', async () => {
    expect(await readSecret('ai:qwen')).toEqual({ ok: true, value: null, store: null });
  });

  it('reports a keychain refusal as denied and never falls back to plain text', async () => {
    keychain.fail = 'Platform secure storage failure: User canceled the operation.';
    expect(await writeSecret('ai:gemini', KEY, { remember: true })).toMatchObject({
      ok: false,
      error: { kind: 'denied' },
    });
    expect(await readSecret('ai:gemini')).toMatchObject({ ok: false, error: { kind: 'denied' } });
    expect(local.data.size + session.data.size).toBe(0);
    expect(peekSecret('ai:gemini')).toBeNull();
  });

  it('tells a refusal from an unreachable keychain and from any other failure', async () => {
    const kindFor = async (fail: string) => {
      keychain.fail = fail;
      const written = await writeSecret('ai:gemini', KEY, { remember: true });
      return written.ok ? 'ok' : written.error.kind;
    };
    expect(await kindFor('Platform secure storage failure: The user name or passphrase you entered is not correct.')).toBe('denied');
    expect(await kindFor('Platform secure storage failure: Access is denied. (os error 5)')).toBe('denied');
    expect(await kindFor("Couldn't access platform secure storage: The specified keychain could not be found.")).toBe('unavailable');
    expect(await kindFor('secret_set not allowed. Command not found')).toBe('unavailable');
    expect(await kindFor('Command secret_set not found')).toBe('unavailable');
    expect(await kindFor('Platform secure storage failure: The item already exists in the keychain.')).toBe('failed');
    expect(await kindFor('bad secret')).toBe('invalid');
    expect(local.data.size + session.data.size).toBe(0);
  });

  it('keeps a key for this session only when not remembered, and clears the keychain copy', async () => {
    keychain.items.set('ai:gemini', 'old-key-12345678');
    expect(await writeSecret('ai:gemini', KEY, { remember: false })).toEqual({ ok: true, store: 'memory' });
    expect(keychain.items.has('ai:gemini')).toBe(false);
    expect(await readSecret('ai:gemini')).toEqual({ ok: true, value: KEY, store: 'memory' });
    expect(local.data.size + session.data.size).toBe(0);
  });

  it('deletes from the keychain and memory', async () => {
    await writeSecret('ai:gemini', KEY, { remember: true });
    await deleteSecret('ai:gemini');
    expect(keychain.items.size).toBe(0);
    expect(peekSecret('ai:gemini')).toBeNull();
    expect(keychain.calls.at(-1)).toEqual({ command: 'secret_delete', args: { account: 'ai:gemini' } });
  });

  it('labels each store for the teacher', () => {
    expect(secretStoreLabel('keychain', 'mac')).toBe('your Keychain');
    expect(secretStoreLabel('keychain', 'windows')).toBe('Windows Credential Manager');
    expect(secretStoreLabel('browser', 'web')).toBe('this browser');
    expect(secretStoreLabel('session', 'web')).toBe('this tab only');
  });
});
