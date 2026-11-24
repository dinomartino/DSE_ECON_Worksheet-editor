import { peekSecret } from '@/platform/secrets';
import type { ProviderId } from '@/ai/types';
import { aiChoiceState, choicePatch, type AiChoice } from './aiChoice';
import { AI_SETTINGS, useAiStatus } from './aiSettings';
import { useMentorAccount } from './mentorAccount';
import { appSettings } from './store';

/** The live wiring of `aiChoice.ts` (k-0527): this computer's keys and Settings. */

/** A key is saved for `p` (memory, this browser, or the keychain's flag). Never reads the keychain. */
export function ownKeySaved(p: ProviderId): boolean {
  return peekSecret(`ai:${p}`) !== null || appSettings.read(AI_SETTINGS).keychainSaved[p] === true;
}

/** Switches the AI to Mentor credits or my own key. False when that side doesn't exist. */
export function setAiChoice(choice: AiChoice): boolean {
  const patch = choicePatch(appSettings.read(AI_SETTINGS), choice, ownKeySaved);
  if (!patch) return false;
  appSettings.write(AI_SETTINGS, patch);
  return true;
}

/** The choice to show (signed in AND an own key saved), or null; re-renders on settings, keys and the account. */
export function useAiChoice(): { using: AiChoice; own: ProviderId } | null {
  // useAiStatus subscribes to settings and secrets; the account has its own store.
  useAiStatus();
  const mentor = useMentorAccount();
  return aiChoiceState(appSettings.read(AI_SETTINGS), mentor.kind === 'signedIn', ownKeySaved);
}
