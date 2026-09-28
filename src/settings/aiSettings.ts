import { useSyncExternalStore } from 'react';
import { looksLikeKey } from '@/ai/keyShape';
import { presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type ProviderConfig, type ProviderId, type ProviderPreset } from '@/ai/types';
import { isDesktop } from '@/platform';
import { peekSecret, readSecret, subscribeSecrets, type SecretError, type SecretStore } from '@/platform/secrets';
import { appSettings } from './store';
import type { SettingsSchema } from './types';
import { baseUrl, bool, oneOf, recordOf, text, trueFlag } from './validators';

/**
 * The AI & translation section's settings and status. It lives here, not in `src/ai/`,
 * because it is React- and platform-aware; `src/ai/` stays pure transport.
 */

export interface AiSettings {
  /** Default 'gemini'. */
  provider: ProviderId;
  /** Absent → preset.models[0]. */
  models: Partial<Record<ProviderId, string>>;
  /** Qwen region, custom, ollama. */
  baseUrls: Partial<Record<ProviderId, string>>;
  /** Default: desktop true (Keychain), web false. */
  rememberKey: boolean;
  /** Desktop presence flags only — never key material. */
  keychainSaved: Partial<Record<ProviderId, true>>;
  /** Default true. */
  includeTeacherText: boolean;
}

const modelId = text(128, /^[A-Za-z0-9._:/@-]+$/);

export const AI_SETTINGS: SettingsSchema<AiSettings> = {
  section: 'ai',
  version: 1,
  storageKey: 'econgen.settings.ai',
  defaults: (env) => ({
    provider: 'gemini',
    models: {},
    baseUrls: {},
    rememberKey: env.desktop,
    keychainSaved: {},
    includeTeacherText: true,
  }),
  fields: {
    provider: oneOf(PROVIDER_IDS),
    // A key pasted into the model field is refused, and dropped on read if one was stored.
    models: recordOf(PROVIDER_IDS, (raw) => {
      const id = modelId(raw);
      return id === undefined || looksLikeKey(id) ? undefined : id;
    }),
    baseUrls: recordOf(PROVIDER_IDS, baseUrl),
    rememberKey: bool,
    keychainSaved: recordOf(PROVIDER_IDS, trueFlag),
    includeTeacherText: bool,
  },
};

export interface AiStatus {
  provider: ProviderId;
  preset: ProviderPreset;
  model: string;
  baseUrl: string;
  /** Keyless provider, or peekSecret() finds a key, or (desktop) keychainSaved[provider]; and
   *  a model and base URL are set. Never reads the keychain. */
  configured: boolean;
  keyStore: SecretStore | null;
  /** Only from memory or web storage. */
  keyLast4?: string;
}

export type AiConfigResult =
  | { ok: true; config: ProviderConfig; preset: ProviderPreset }
  | { ok: false; provider: ProviderId; reason: 'noKey' | 'noModel' | 'noBaseUrl' }
  | { ok: false; provider: ProviderId; reason: 'secretError'; error: SecretError };

/** The model and base URL in effect for `provider`: the saved choice, else the preset's. */
export function providerChoice(settings: AiSettings, provider: ProviderId): { model: string; baseUrl: string } {
  const preset = presetFor(provider);
  return {
    model: settings.models[provider] ?? preset.models[0]?.id ?? '',
    baseUrl: settings.baseUrls[provider] ?? preset.baseUrl,
  };
}

let memo: { inputs: unknown[]; status: AiStatus } | null = null;

/** Synchronous. */
export function readAiStatus(): AiStatus {
  const settings = appSettings.read(AI_SETTINGS);
  const desktop = isDesktop();
  const provider = settings.provider;
  const peek = peekSecret(`ai:${provider}`);
  const inputs = [settings, desktop, peek?.store, peek?.last4];
  if (memo && memo.inputs.every((value, i) => value === inputs[i])) return memo.status;

  const preset = presetFor(provider);
  const { model, baseUrl } = providerChoice(settings, provider);
  const inKeychain = desktop && settings.keychainSaved[provider] === true;
  const hasKey = !preset.keyRequired || peek !== null || inKeychain;
  const status: AiStatus = {
    provider,
    preset,
    model,
    baseUrl,
    configured: hasKey && model !== '' && baseUrl !== '',
    keyStore: peek?.store ?? (inKeychain ? 'keychain' : null),
    ...(peek ? { keyLast4: peek.last4 } : {}),
  };
  memo = { inputs, status };
  return status;
}

function subscribeStatus(listener: () => void): () => void {
  const offSettings = appSettings.subscribe(AI_SETTINGS, listener);
  const offSecrets = subscribeSecrets(listener);
  // A key remembered or forgotten in another tab.
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith('econgen.secret.')) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    offSettings();
    offSecrets();
    window.removeEventListener('storage', onStorage);
  };
}

let serverStatus: AiStatus | null = null;
function readServerStatus(): AiStatus {
  if (!serverStatus) {
    const preset = presetFor('gemini');
    const { model, baseUrl } = providerChoice(AI_SETTINGS.defaults({ desktop: false }), 'gemini');
    serverStatus = { provider: 'gemini', preset, model, baseUrl, configured: false, keyStore: null };
  }
  return serverStatus;
}

/** Re-renders on settings and secrets changes. */
export function useAiStatus(): AiStatus {
  return useSyncExternalStore(subscribeStatus, readAiStatus, readServerStatus);
}

/** Reads the secret (one keychain read per session, then cached in memory). A missing
 *  keychain item clears keychainSaved. */
export async function resolveAiConfig(provider?: ProviderId): Promise<AiConfigResult> {
  const settings = appSettings.read(AI_SETTINGS);
  const id = provider ?? settings.provider;
  const preset = presetFor(id);
  const { model, baseUrl } = providerChoice(settings, id);
  if (!model) return { ok: false, provider: id, reason: 'noModel' };
  if (!baseUrl) return { ok: false, provider: id, reason: 'noBaseUrl' };

  const saved = settings.keychainSaved[id] === true;
  // A keyless provider never prompts the keychain for a key it may not have.
  const read = preset.keyRequired || saved || peekSecret(`ai:${id}`) ? await readSecret(`ai:${id}`) : null;
  if (read && !read.ok) return { ok: false, provider: id, reason: 'secretError', error: read.error };
  const apiKey = read?.value ?? null;
  if (apiKey === null && saved && isDesktop()) {
    const { [id]: _gone, ...rest } = settings.keychainSaved;
    void _gone;
    appSettings.write(AI_SETTINGS, { keychainSaved: rest });
  }
  if (apiKey === null && preset.keyRequired) return { ok: false, provider: id, reason: 'noKey' };
  return { ok: true, config: { provider: id, apiKey, model, baseUrl }, preset };
}

