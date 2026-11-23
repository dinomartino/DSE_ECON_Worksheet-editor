'use client';

import type { ReactNode } from 'react';
import { useMessages } from '@/i18n/language';
import type { CheckId, CheckState } from '@/questionStudio/types';
import { QUESTION_STUDIO_MESSAGES } from './messages';

/** Small pieces the studio's columns share. */

export type Tone = 'ok' | 'look' | 'fail' | 'idle' | 'ai';

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  look: 'bg-warn-soft text-warn-ink',
  fail: 'bg-danger-soft text-danger-ink',
  idle: 'bg-surface-sunken text-ink-muted',
  ai: 'bg-accent-soft text-ink',
};

export function Chip({ tone, title, children }: { tone: Tone; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${TONE[tone]}`}>
      {children}
    </span>
  );
}

export const toneOf = (state: CheckState): Tone => (state === 'pass' ? 'ok' : state === 'look' ? 'look' : state === 'fail' ? 'fail' : 'idle');

const GLYPH: Record<CheckState, string> = { pass: '✓', look: '!', fail: '✕', skipped: '–' };

/** The check's own name, as a catalogue key. */
export const CHECK_LABEL = {
  shape: 'checkShape',
  key: 'checkKey',
  numbers: 'checkNumbers',
  terms: 'checkTerms',
  syllabus: 'checkSyllabus',
  lint: 'checkLint',
  copy: 'checkCopy',
} as const satisfies Record<CheckId, keyof ReturnType<typeof useStates>>;

/** The state words and check names, read once per render. */
export function useStates() {
  return useMessages(QUESTION_STUDIO_MESSAGES);
}

export function stateWord(m: ReturnType<typeof useStates>, state: CheckState): string {
  return state === 'pass' ? m.statePass : state === 'look' ? m.stateLook : state === 'fail' ? m.stateFail : m.stateSkipped;
}

/** ✓ ! ✕ – beside a check's name: the glyph repeats the colour, so it never carries it alone. */
export function StateGlyph({ state }: { state: CheckState }) {
  return (
    <span aria-hidden className="w-3 text-center">
      {GLYPH[state]}
    </span>
  );
}
