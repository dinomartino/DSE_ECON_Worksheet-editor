import { creditsFor, roundCredits, studioJob } from '@/ai/credits';
import type { MentorAccount } from '@/ai/mentor';
import { presetFor } from '@/ai/providers';
import type { ProviderId, ProviderPreset } from '@/ai/types';
import type { MentorState } from '@/settings/mentorAccount';

/**
 * What the AI status chip says (k-0524, u-fs5v), from Settings' provider and the DSEcon Mentor
 * account: the credits left (amber when low, red at 0 or below), an own key and whose, or that AI
 * isn't set up. Pure, so every state is tested without a browser.
 */

export type ChipTone = 'normal' | 'low' | 'out';

export type AiChip =
  /** `credits` null: not read yet. `stopped`: Mentor paused (today) or switched off the account. */
  | { kind: 'credits'; credits: number | null; tone: ChipTone; low: number; stopped?: 'paused' | 'off' }
  /** `local`: a keyless provider on this computer (Ollama). */
  | { kind: 'ownKey'; provider: ProviderId; name: string; local: boolean }
  | { kind: 'setup' };

/** Short names for the chip ("AI: own key (Gemini)"); the preset's label otherwise. */
const SHORT: Partial<Record<ProviderId, string>> = {
  gemini: 'Gemini',
  qwen: 'Qwen',
  anthropic: 'Claude',
  custom: 'Custom',
};

/** The short name of a provider, as the chip and the AI choice say it ("Gemini"). */
export function providerShortName(p: ProviderId): string {
  return SHORT[p] ?? presetFor(p).label;
}

/** No account figure for a studio run yet: about one 10-question worksheet at Gemini 4 Hydrogen. */
export const LOW_FALLBACK = 300;

/**
 * "Low" = less than one typical Question studio run: Mentor's own figure for a 10-question
 * worksheet (`estimates.studioWorksheet`), else our estimate at its rates, else `LOW_FALLBACK`.
 */
export function lowCreditsLine(account: Pick<MentorAccount, 'rates' | 'models' | 'buy'> | null): number {
  const mentors = account?.buy?.studioWorksheet;
  if (mentors && mentors > 0) return roundCredits(mentors);
  const ours = creditsFor(studioJob({ questions: 10, sides: 1 }), account);
  return ours && ours > 0 ? roundCredits(ours) : LOW_FALLBACK;
}

export function aiChipState(status: { provider: ProviderId; preset: Pick<ProviderPreset, 'label' | 'keyRequired'>; configured: boolean }, mentor: MentorState): AiChip {
  if (status.provider === 'mentor') {
    if (mentor.kind !== 'signedIn') return { kind: 'setup' };
    const account = mentor.account;
    const low = lowCreditsLine(account);
    if (!account) return { kind: 'credits', credits: null, tone: 'normal', low };
    const stopped = account.status === 'on' ? undefined : account.status;
    const tone: ChipTone = account.credits <= 0 ? 'out' : account.credits < low || stopped ? 'low' : 'normal';
    return { kind: 'credits', credits: account.credits, tone, low, ...(stopped ? { stopped } : {}) };
  }
  if (!status.configured) return { kind: 'setup' };
  return { kind: 'ownKey', provider: status.provider, name: SHORT[status.provider] ?? status.preset.label, local: !status.preset.keyRequired };
}
