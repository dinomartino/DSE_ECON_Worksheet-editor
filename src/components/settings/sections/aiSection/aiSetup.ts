import { PRESETS, presetFor } from '@/ai/providers';
import { keyShapeProblem } from '@/ai/keyShape';
import { PROVIDER_IDS, type AiErrorInfo, type ConnectionTest, type ProviderId } from '@/ai/types';
import type { SecretError, SecretStore } from '@/platform/secrets';
import { providerChoice, type AiSettings } from '@/settings/aiSettings';
import type { SettingsEnv } from '@/settings/types';

/**
 * The AI section's state, pure. The card shown open (`provider`) is not `ai.provider`
 * until committed: a card click or a saved key commits it; a deep link only opens it.
 * Side effects (test, save, forget) are run by the pane from the state this returns.
 */

export type KeyState =
  | { kind: 'none' }
  /** `saved` is what the field replaces: clearing the draft returns to it. */
  | { kind: 'editing'; draft: string; shape?: { likely?: ProviderId; message: string }; saved?: SavedKey }
  | ({ kind: 'saved' } & SavedKey);
export interface SavedKey { store: SecretStore; last4?: string }
export type TestState =
  | { kind: 'idle' }
  | { kind: 'testing' }
  | { kind: 'ok'; sample: string; ms: number; followedGlossary: boolean }
  | { kind: 'error'; error: AiErrorInfo };
export interface AiSetupState {
  provider: ProviderId;
  model: string;
  /** The address Save & test uses. Null while a workspace region has no valid workspace. */
  baseUrl?: string | null;
  workspace?: string;
  remember: boolean;
  key: KeyState;
  test: TestState;
  /** Each saved key's last test this session, by provider. In memory only, never persisted. */
  savedTests: Partial<Record<ProviderId, TestState>>;
  confirmForget: ProviderId | 'all' | null;
  /** Desktop: the keychain refused or failed; the key can still be used for this session. */
  keychainError: KeychainErrorKind | null;
  /** The provider that refused this location: its banner shows, the Hong Kong cards are highlighted. */
  regionRefusedBy: ProviderId | null;
}
export type KeychainErrorKind = Exclude<SecretError['kind'], 'invalid'>;
/** What a card opens with, read from settings and the secrets peek by the pane. */
export interface CardState { model: string; baseUrl?: string; key: KeyState }
export type AiSetupEvent =
  | ({ type: 'selectProvider'; id: ProviderId } & CardState)
  | { type: 'draft'; value: string }
  | { type: 'saveAndTest' }
  /** Past a shape warning. */
  | { type: 'testAnyway' }
  | { type: 'testFinished'; result: ConnectionTest }
  | { type: 'saved'; store: SecretStore; last4?: string }
  /** A saved key's test, for any provider: the shown card is unchanged. */
  | { type: 'savedTest'; provider: ProviderId; test: TestState }
  | { type: 'keychainError'; kind: KeychainErrorKind }
  /** List my models: the same shape check as Save & test, before anything is sent. */
  | { type: 'listAsked' }
  | { type: 'useForSession' }
  | { type: 'forgetAsked'; which: ProviderId | 'all' }
  | { type: 'forgotten'; which: ProviderId | 'all' }
  | { type: 'cancelForget' }
  | { type: 'model'; id: string }
  | { type: 'baseUrl'; url: string | null }
  | { type: 'workspace'; value: string }
  | { type: 'remember'; value: boolean };

/** The first-choice providers, in Settings order (Gemini first, Recommended). */
export const TOP_PROVIDERS: readonly ProviderId[] = PROVIDER_IDS.filter((id) => PRESETS[id].group === 'top');

export const isProviderId = (x: unknown): x is ProviderId =>
  typeof x === 'string' && (PROVIDER_IDS as readonly string[]).includes(x);

/** The key a card shows: a peeked key, or (desktop) the Keychain presence flag. */
export function savedKeyFor(
  settings: AiSettings,
  env: SettingsEnv,
  provider: ProviderId,
  peek: { store: SecretStore; last4: string } | null,
): KeyState {
  if (peek) return { kind: 'saved', store: peek.store, last4: peek.last4 };
  if (env.desktop && settings.keychainSaved[provider]) return { kind: 'saved', store: 'keychain' };
  return { kind: 'none' };
}

export interface SavedKeyRow { provider: ProviderId; store: SecretStore; last4?: string }

/** Every provider with a saved key, in list order: "Your keys". Never key material beyond last4. */
export function savedKeys(
  settings: AiSettings,
  env: SettingsEnv,
  peek: (provider: ProviderId) => { store: SecretStore; last4: string } | null,
): SavedKeyRow[] {
  return PROVIDER_IDS.flatMap((provider) => {
    const key = savedKeyFor(settings, env, provider, peek(provider));
    if (key.kind !== 'saved') return [];
    return [{ provider, store: key.store, ...(key.last4 ? { last4: key.last4 } : {}) }];
  });
}

export function cardState(
  settings: AiSettings,
  env: SettingsEnv,
  provider: ProviderId,
  peek: { store: SecretStore; last4: string } | null,
): CardState {
  const { model } = providerChoice(settings, provider);
  return { model, baseUrl: settings.baseUrls[provider], key: savedKeyFor(settings, env, provider, peek) };
}

export function initialAiSetup(
  settings: AiSettings,
  env: SettingsEnv,
  params: Readonly<Record<string, string>> | undefined,
  peek: (provider: ProviderId) => { store: SecretStore; last4: string } | null,
): AiSetupState {
  const provider = isProviderId(params?.provider) ? params.provider : settings.provider;
  return {
    provider,
    ...cardState(settings, env, provider, peek(provider)),
    remember: settings.rememberKey,
    test: { kind: 'idle' },
    savedTests: {},
    confirmForget: null,
    keychainError: null,
    regionRefusedBy: params?.reason === 'region' ? settings.provider : null,
  };
}

const IDLE: TestState = { kind: 'idle' };

/** The typed key, trimmed; '' when nothing is being typed. */
export function draftOf(state: AiSetupState): string {
  return state.key.kind === 'editing' ? state.key.draft.trim() : '';
}

function savedOf(key: KeyState): SavedKey | undefined {
  if (key.kind === 'saved') return { store: key.store, last4: key.last4 };
  return key.kind === 'editing' ? key.saved : undefined;
}

/** A connection test's result as the state shows it. */
export function testStateOf(result: ConnectionTest): TestState {
  if (!result.ok) return { kind: 'error', error: result.error };
  const { sample, ms, followedGlossary } = result;
  return { kind: 'ok', sample, ms, followedGlossary };
}

/** The test the open card shows: its saved key's, unless a new key is typed or none is needed. */
export function shownTest(state: AiSetupState): TestState {
  return state.key.kind === 'saved' ? (state.savedTests[state.provider] ?? IDLE) : state.test;
}

/** Can the open card test its saved key: one is saved, the field is empty, the address is usable. */
export function canTestSaved(state: AiSetupState): boolean {
  return state.key.kind === 'saved' && state.baseUrl !== null && presetFor(state.provider).keyRequired;
}

/** Can Save & test run: a usable address, and a typed key or a keyless provider. */
export function canTest(state: AiSetupState): boolean {
  if (state.baseUrl === null) return false;
  return draftOf(state) !== '' || !presetFor(state.provider).keyRequired;
}

/** The typed key's shape problem, if any: set on the key so nothing is sent. */
function withShape(state: AiSetupState): AiSetupState | null {
  const draft = draftOf(state);
  const shape = draft ? keyShapeProblem(state.provider, draft) : null;
  return shape && state.key.kind === 'editing' ? { ...state, key: { ...state.key, shape }, test: IDLE } : null;
}

export function aiSetupReducer(state: AiSetupState, event: AiSetupEvent): AiSetupState {
  switch (event.type) {
    case 'selectProvider': {
      if (event.id === state.provider) return state;
      const { type: _type, id, ...card } = event;
      void _type;
      return { ...state, ...card, provider: id, workspace: undefined, test: IDLE, confirmForget: null, keychainError: null };
    }
    case 'draft': {
      const saved = savedOf(state.key);
      const key: KeyState = event.value.trim()
        ? { kind: 'editing', draft: event.value, ...(saved ? { saved } : {}) }
        : saved
          ? { kind: 'saved', ...saved }
          : { kind: 'none' };
      return { ...state, key, test: IDLE, keychainError: null };
    }
    case 'saveAndTest': {
      if (!canTest(state) || state.test.kind === 'testing') return state;
      // A key that looks like another provider's is never sent without "test anyway".
      return withShape(state) ?? { ...state, test: { kind: 'testing' } };
    }
    case 'listAsked':
      return withShape(state) ?? state;
    case 'testAnyway': {
      if (state.key.kind !== 'editing' || state.test.kind === 'testing') return state;
      const { shape: _shape, ...key } = state.key;
      void _shape;
      return { ...state, key, test: { kind: 'testing' } };
    }
    case 'testFinished': {
      const result = event.result;
      if (result.ok) return { ...state, test: testStateOf(result) };
      return {
        ...state,
        test: testStateOf(result),
        regionRefusedBy: result.error.kind === 'region' ? state.provider : state.regionRefusedBy,
      };
    }
    case 'saved':
      return { ...state, key: { kind: 'saved', store: event.store, last4: event.last4 }, keychainError: null };
    case 'savedTest':
      return { ...state, savedTests: { ...state.savedTests, [event.provider]: event.test } };
    case 'keychainError':
      return { ...state, keychainError: event.kind };
    case 'useForSession':
      return { ...state, keychainError: null };
    case 'forgetAsked':
      return { ...state, confirmForget: event.which };
    case 'cancelForget':
      return { ...state, confirmForget: null };
    case 'forgotten': {
      const { [event.which as ProviderId]: _gone, ...kept } = state.savedTests;
      void _gone;
      const savedTests = event.which === 'all' ? {} : kept;
      if (event.which !== 'all' && event.which !== state.provider) return { ...state, savedTests, confirmForget: null };
      return { ...state, key: { kind: 'none' }, test: IDLE, savedTests, confirmForget: null, keychainError: null };
    }
    case 'model':
      return { ...state, model: event.id };
    case 'baseUrl':
      return { ...state, baseUrl: event.url };
    case 'workspace':
      return { ...state, workspace: event.value };
    case 'remember':
      return { ...state, remember: event.value };
  }
}

/** Should the typed key be persisted after this test result? Only a rejected key is not. */
export function shouldSaveAfterTest(result: ConnectionTest): boolean {
  return result.ok || (result.error.kind !== 'badKey' && result.error.kind !== 'keyBlocked');
}

/** A typed, unsaved key: Done, Escape, ✕ and the scrim ask first. */
export function needsCloseGuard(state: AiSetupState): boolean {
  return draftOf(state) !== '';
}

const WORKSPACE_ID = /^[a-z0-9-]{3,63}$/;

/**
 * The Qwen workspace base URL from a pasted API Host (`llm-x.cn-hongkong.maas.aliyuncs.com`,
 * with or without scheme or path) or a bare workspace id. Null for a host from another
 * region or anything else.
 */
export function qwenWorkspaceUrl(template: string, input: string): string | null {
  const suffix = /^https:\/\/\{WorkspaceId\}(\.[a-z0-9.-]+)\//.exec(template)?.[1];
  if (!suffix) return null;
  const text = input.trim().toLowerCase();
  let id = text;
  if (text.includes('.')) {
    const host = text.replace(/^https?:\/\//, '').split(/[/?#]/)[0];
    if (!host.endsWith(suffix)) return null;
    id = host.slice(0, -suffix.length);
  }
  return WORKSPACE_ID.test(id) ? template.replace('{WorkspaceId}', id) : null;
}
