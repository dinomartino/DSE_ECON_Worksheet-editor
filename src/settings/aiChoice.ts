import { presetFor } from '@/ai/providers';
import { PROVIDER_IDS, type ProviderId } from '@/ai/types';
import type { AiSettings } from './aiSettings';

/**
 * Mentor credits or my own key (k-0527, u-ypm9). A teacher signed in to DSEcon Mentor who also
 * has an own API key saved picks which one the AI uses. The choice is Settings' `provider`
 * itself ('mentor', or the own provider), so it is remembered like any setting, every request
 * goes where it says (`resolveAiConfig` reads only `provider`) and nothing can charge the
 * other one. `ownProvider` remembers which own key "My own key" means while Mentor is chosen.
 * Pure: the account and the keys come in as arguments.
 */

export type AiChoice = 'mentor' | 'own';

/** An own (not hosted) provider. */
export const isOwnProvider = (p: ProviderId): boolean => presetFor(p).group !== 'hosted';

/**
 * The own provider "My own key" means, or null when there is none: the one in use when it is
 * ready (a saved key, or keyless like Ollama), else the remembered one, else the first saved key.
 */
export function ownKeyProvider(settings: Pick<AiSettings, 'provider' | 'ownProvider'>, saved: (p: ProviderId) => boolean): ProviderId | null {
  const ready = (p: ProviderId | undefined): p is ProviderId => p !== undefined && isOwnProvider(p) && (saved(p) || !presetFor(p).keyRequired);
  if (ready(settings.provider)) return settings.provider;
  if (settings.ownProvider && isOwnProvider(settings.ownProvider) && saved(settings.ownProvider)) return settings.ownProvider;
  return PROVIDER_IDS.find((p) => isOwnProvider(p) && saved(p)) ?? null;
}

/** Shown only when both exist: signed in AND an own key saved. Null otherwise. */
export function aiChoiceState(
  settings: Pick<AiSettings, 'provider' | 'ownProvider'>,
  signedIn: boolean,
  saved: (p: ProviderId) => boolean,
): { using: AiChoice; own: ProviderId } | null {
  if (!signedIn) return null;
  const own = ownKeyProvider(settings, saved);
  if (!own) return null;
  return { using: settings.provider === 'mentor' ? 'mentor' : 'own', own };
}

/** The settings patch for a choice; null when that side doesn't exist (no own key saved). */
export function choicePatch(
  settings: Pick<AiSettings, 'provider' | 'ownProvider'>,
  choice: AiChoice,
  saved: (p: ProviderId) => boolean,
): Partial<AiSettings> | null {
  const own = ownKeyProvider(settings, saved);
  if (choice === 'own') return own ? { provider: own, ownProvider: own } : null;
  return { provider: 'mentor', ...(own ? { ownProvider: own } : {}) };
}

/**
 * After keys are forgotten: the provider in use lost its key and the teacher is signed in to
 * Mentor, so the account takes over (k-0527). Null = leave `provider` as it is.
 */
export function providerAfterForget(
  settings: Pick<AiSettings, 'provider'>,
  gone: readonly ProviderId[],
  signedIn: boolean,
): ProviderId | null {
  if (!signedIn || settings.provider === 'mentor' || !gone.includes(settings.provider)) return null;
  return presetFor(settings.provider).keyRequired ? 'mentor' : null;
}
