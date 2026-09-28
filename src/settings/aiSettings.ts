import { presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type ProviderConfig, type ProviderId, type ProviderPreset } from '@/ai/types';
import type { SecretError, SecretStore } from '@/platform/secrets';
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
    models: recordOf(PROVIDER_IDS, text(128, /^[A-Za-z0-9._:/@-]+$/)),
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
  /** Keyless provider, or peekSecret() finds a key, or (desktop) keychainSaved[provider]. Never reads the keychain. */
  configured: boolean;
  keyStore: SecretStore | null;
  /** Only from memory or web storage. */
  keyLast4?: string;
}

export type AiConfigResult =
  | { ok: true; config: ProviderConfig; preset: ProviderPreset }
  | { ok: false; provider: ProviderId; reason: 'noKey' | 'noModel' | 'noBaseUrl' }
  | { ok: false; provider: ProviderId; reason: 'secretError'; error: SecretError };

function unconfigured(): AiStatus {
  const preset = presetFor('gemini');
  return {
    provider: 'gemini',
    preset,
    model: preset.models[0]?.id ?? '',
    baseUrl: preset.baseUrl,
    configured: false,
    keyStore: null,
  };
}
const UNCONFIGURED = unconfigured();

/** Synchronous. */
export function readAiStatus(): AiStatus {
  // P-SETTINGS replaces this body
  return UNCONFIGURED;
}

/** Re-renders on settings and secrets changes. */
export function useAiStatus(): AiStatus {
  // P-SETTINGS replaces this body
  return UNCONFIGURED;
}

/** Reads the secret (one keychain read per session, then cached in memory). A missing
 *  keychain item clears keychainSaved. */
export function resolveAiConfig(provider?: ProviderId): Promise<AiConfigResult> {
  // P-SETTINGS replaces this body
  return Promise.resolve({ ok: false, provider: provider ?? 'gemini', reason: 'noKey' });
}
