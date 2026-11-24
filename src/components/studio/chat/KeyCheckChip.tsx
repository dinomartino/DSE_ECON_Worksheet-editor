'use client';

import type { Messages } from '@/i18n/catalogue';
import type { KeyCheck } from '@/questionStudio/keyCheck';
import type { Tone } from '../parts';
import { Chip } from '../parts';
import type { STUDIO_CHAT_MESSAGES } from './chat.messages';

type ChatMessages = Messages<typeof STUDIO_CHAT_MESSAGES>;

/** The words and tone of a key-against-diagram result (k-0540). */
export function keyCheckWords(k: KeyCheck, m: ChatMessages): { tone: Tone; label: string; title: string } {
  if (k.state === 'ok') return { tone: 'ok', label: `✓ ${m.keyMatches}`, title: m.keyMatchesTitle };
  if (k.state === 'differs') return { tone: 'fail', label: `✕ ${m.keyDiffers(k.gives)}`, title: m.keyDiffersTitle(k.gives) };
  return { tone: 'look', label: `! ${m.keyAgain}`, title: m.keyAgainTitle };
}

/** The result as a chip. `quiet` leaves out a pass: only a mismatch or an unchecked key speaks. */
export function KeyCheckChip({ check, m, quiet = false }: { check: KeyCheck | null; m: ChatMessages; quiet?: boolean }) {
  if (!check || (quiet && check.state === 'ok')) return null;
  const w = keyCheckWords(check, m);
  return (
    <span data-key-check={check.state}>
      <Chip tone={w.tone} title={w.title}>
        {w.label}
      </Chip>
    </span>
  );
}
