import { presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type ConnectionTest, type ModelInfo, type ProviderConfig, type ProviderId } from '@/ai/types';
import type { SecretAccount, SecretError, SecretRead, SecretStore, SecretWrite } from '@/platform/secrets';
import { AI_SETTINGS, providerChoice, type AiConfigResult, type AiSettings } from '@/settings/aiSettings';
import type { SettingsEnv } from '@/settings/types';
import {
  aiSetupReducer,
  cardState,
  draftOf,
  shouldSaveAfterTest,
  testStateOf,
  type AiSetupEvent,
  type AiSetupState,
} from './aiSetup';

/**
 * The AI section's side effects over the pure `aiSetupReducer`, every dependency injected.
 * Each flow takes its provider before its first await; if the shown card changed by the
 * time it resumes, the result is dropped and no key is saved or committed for another card.
 */

export interface AiSetupDeps {
  env: SettingsEnv;
  testConnection(config: ProviderConfig, signal: AbortSignal): Promise<ConnectionTest>;
  listModels(config: ProviderConfig, signal: AbortSignal): Promise<ModelInfo[]>;
  readSecret(account: SecretAccount): Promise<SecretRead>;
  writeSecret(account: SecretAccount, value: string, opts: { remember: boolean }): Promise<SecretWrite>;
  deleteSecret(account: SecretAccount): Promise<void>;
  peekSecret(account: SecretAccount): { store: SecretStore; last4: string } | null;
  /** A provider's saved config (`resolveAiConfig`): its saved key, model and address. */
  resolveConfig(provider: ProviderId): Promise<AiConfigResult>;
  /** The latest settings: flows await, so never a render's copy. */
  readSettings(): AiSettings;
  writeSettings(patch: Partial<AiSettings>): void;
}

export type AiSetupRunner = ReturnType<typeof createAiSetupRunner>;

const account = (p: ProviderId): SecretAccount => `ai:${p}`;

/** Why a saved key couldn't be tested, as a test failure. */
function unresolved(result: Extract<AiConfigResult, { ok: false }>): ConnectionTest {
  const message =
    result.reason === 'secretError'
      ? result.error.message
      : result.reason === 'noKey'
        ? 'No key is saved for this provider.'
        : result.reason === 'noModel'
          ? 'Choose a model first.'
          : 'Enter the server address first.';
  return { ok: false, error: { kind: 'notConfigured', provider: result.provider, message, fatal: true, actions: [] } };
}

function withFlag(flags: AiSettings['keychainSaved'], p: ProviderId, on: boolean): AiSettings['keychainSaved'] {
  const { [p]: _old, ...rest } = flags;
  void _old;
  return on ? { ...rest, [p]: true } : rest;
}

export function createAiSetupRunner(deps: AiSetupDeps, initial: AiSetupState) {
  let state = initial;
  const listeners = new Set<() => void>();
  let testing: AbortController | null = null;
  let listing: AbortController | null = null;
  const savedTesting = new Map<ProviderId, AbortController>();

  const current = () => state;
  const send = (event: AiSetupEvent): AiSetupState => {
    const next = aiSetupReducer(state, event);
    if (next !== state) {
      state = next;
      for (const listener of [...listeners]) listener();
    }
    return state;
  };
  const shown = (p: ProviderId) => state.provider === p;
  const patch = (fn: (s: AiSettings) => Partial<AiSettings>) => deps.writeSettings(fn(deps.readSettings()));
  const baseUrlFor = (s: AiSetupState) => s.baseUrl ?? providerChoice(deps.readSettings(), s.provider).baseUrl;
  const report = (p: ProviderId, error: SecretError) => {
    if (error.kind !== 'invalid' && shown(p)) send({ type: 'keychainError', kind: error.kind });
  };

  /** Saves the key under `p`, and commits `p` if its card is still shown. True when both. */
  const persistKey = async (p: ProviderId, key: string, remember: boolean): Promise<boolean> => {
    const written = await deps.writeSecret(account(p), key, { remember });
    if (!written.ok) {
      report(p, written.error);
      return false;
    }
    const commit = shown(p);
    patch((s) => ({
      keychainSaved: withFlag(s.keychainSaved, p, written.store === 'keychain'),
      ...(commit ? { provider: p } : {}),
    }));
    if (commit) send({ type: 'saved', store: written.store, last4: key.slice(-4) });
    // A new key: its status is this card's test, if it just ran; otherwise untested.
    const tested = commit && (state.test.kind === 'ok' || state.test.kind === 'error');
    send({ type: 'savedTest', provider: p, test: tested ? state.test : { kind: 'idle' } });
    return commit;
  };

  /** Remember toggled: move an already-saved key to the matching store. */
  const moveSavedKey = async (p: ProviderId, remember: boolean): Promise<void> => {
    if (!deps.peekSecret(account(p)) && !deps.readSettings().keychainSaved[p]) return;
    const read = await deps.readSecret(account(p));
    if (!read.ok) return report(p, read.error);
    if (!read.value) return;
    const written = await deps.writeSecret(account(p), read.value, { remember });
    if (!written.ok) return report(p, written.error);
    patch((s) => ({ keychainSaved: withFlag(s.keychainSaved, p, written.store === 'keychain') }));
    if (shown(p)) send({ type: 'saved', store: written.store, last4: read.value.slice(-4) });
  };

  /**
   * Save & test. Resolves true when the key (or a keyless provider) is now in use.
   * `requireOk` (the menu's SetupCard): a failed test saves and commits nothing.
   */
  const saveAndTest = async (anyway = false, opts: { requireOk?: boolean } = {}): Promise<boolean> => {
    const next = send(anyway ? { type: 'testAnyway' } : { type: 'saveAndTest' });
    if (next.test.kind !== 'testing') return false;
    const p = next.provider;
    const key = draftOf(next);
    testing?.abort();
    const abort = (testing = new AbortController());
    const config = { provider: p, apiKey: key || null, model: next.model, baseUrl: baseUrlFor(next) };
    const result = await deps.testConnection(config, abort.signal);
    if (abort.signal.aborted || !shown(p)) return false;
    testing = null;
    send({ type: 'testFinished', result });
    if (!shouldSaveAfterTest(result) || (opts.requireOk && !result.ok)) return false;
    if (key) return persistKey(p, key, state.remember);
    patch(() => ({ provider: p }));
    return result.ok;
  };

  /** Tests `p`'s saved key with its saved model and address; the shown card and provider stay. */
  const testSaved = async (p: ProviderId): Promise<boolean> => {
    savedTesting.get(p)?.abort();
    const abort = new AbortController();
    savedTesting.set(p, abort);
    send({ type: 'savedTest', provider: p, test: { kind: 'testing' } });
    const resolved = await deps.resolveConfig(p);
    if (abort.signal.aborted) return false;
    const result = resolved.ok ? await deps.testConnection(resolved.config, abort.signal) : unresolved(resolved);
    if (abort.signal.aborted) return false;
    savedTesting.delete(p);
    send({ type: 'savedTest', provider: p, test: testStateOf(result) });
    return result.ok;
  };
  const stopSavedTest = (p: ProviderId) => {
    savedTesting.get(p)?.abort();
    savedTesting.delete(p);
  };

  return {
    current,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    saveAndTest,
    testSaved,
    /**
     * A card click opens and commits it (`commit: false` only shows it, as the SetupCard's
     * radios do); a test still running for the old card is dropped.
     */
    selectProvider(id: ProviderId, commit = true): void {
      if (!shown(id)) {
        testing?.abort();
        testing = null;
      }
      send({ type: 'selectProvider', id, ...cardState(deps.readSettings(), deps.env, id, deps.peekSecret(account(id))) });
      if (commit) deps.writeSettings({ provider: id });
    },
    draft: (value: string) => void send({ type: 'draft', value }),
    saveWithoutTesting(): Promise<boolean> {
      const { provider: p, remember } = state;
      const key = draftOf(state);
      if (key) return persistKey(p, key, remember);
      patch(() => ({ provider: p }));
      return Promise.resolve(true);
    },
    useForSession(): Promise<boolean> {
      send({ type: 'useForSession' });
      const key = draftOf(state);
      return key ? persistKey(state.provider, key, false) : Promise.resolve(false);
    },
    /** Tries the keychain again: the typed key, or the saved key being moved. */
    retryKeychain(): Promise<unknown> {
      const { provider: p, remember } = state;
      const key = draftOf(state);
      return key ? persistKey(p, key, remember) : moveSavedKey(p, remember);
    },
    remember(value: boolean): Promise<void> {
      send({ type: 'remember', value });
      deps.writeSettings({ rememberKey: value });
      return moveSavedKey(state.provider, value);
    },
    forgetAsked: (which: ProviderId | 'all') => void send({ type: 'forgetAsked', which }),
    cancelForget: () => void send({ type: 'cancelForget' }),
    /** Forgets the key (or every key) awaiting confirmation. */
    async forget(): Promise<void> {
      const which = state.confirmForget;
      if (!which) return;
      const gone = which === 'all' ? PROVIDER_IDS : [which];
      gone.forEach(stopSavedTest);
      await Promise.all(gone.map((id) => deps.deleteSecret(account(id))));
      patch((s) => ({ keychainSaved: which === 'all' ? {} : withFlag(s.keychainSaved, which, false) }));
      send({ type: 'forgotten', which });
    },
    model(id: string): void {
      const p = state.provider;
      if (!AI_SETTINGS.fields.models({ [p]: id })?.[p]) return;
      send({ type: 'model', id });
      patch((s) => ({ models: { ...s.models, [p]: id } }));
    },
    /** Null, or a refused URL, blocks Save & test until a usable address is chosen. */
    baseUrl(url: string | null): boolean {
      const p = state.provider;
      const valid = url !== null && AI_SETTINGS.fields.baseUrls({ [p]: url })?.[p] !== undefined;
      send({ type: 'baseUrl', url: valid ? url : null });
      if (valid) patch((s) => ({ baseUrls: { ...s.baseUrls, [p]: url } }));
      return valid;
    },
    workspace: (value: string) => void send({ type: 'workspace', value }),
    /** Past the same shape check as Save & test; null when nothing was sent. */
    async listModels(): Promise<{ provider: ProviderId; models: ModelInfo[] } | null> {
      const asked = send({ type: 'listAsked' });
      if ((asked.key.kind === 'editing' && asked.key.shape) || asked.baseUrl === null) return null;
      const p = asked.provider;
      const typed = draftOf(asked);
      const read = typed ? null : await deps.readSecret(account(p));
      const apiKey = typed || (read?.ok ? read.value : null);
      if ((presetFor(p).keyRequired && !apiKey) || !shown(p)) return null;
      listing?.abort();
      const abort = (listing = new AbortController());
      const models = await deps.listModels({ provider: p, apiKey, model: asked.model, baseUrl: baseUrlFor(asked) }, abort.signal);
      return abort.signal.aborted ? null : { provider: p, models };
    },
    /** Unmount: drop whatever is in flight. */
    dispose(): void {
      testing?.abort();
      listing?.abort();
      testing = listing = null;
      [...savedTesting.keys()].forEach(stopSavedTest);
    },
  };
}
