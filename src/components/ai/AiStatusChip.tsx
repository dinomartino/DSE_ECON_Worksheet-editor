'use client';

import { useEffect } from 'react';
import { MENTOR } from '@/ai/mentorOrigin';
import { formatCredits } from '@/components/settings/sections/aiSection/MentorAccountCard';
import { AI_SECTION_MESSAGES } from '@/components/settings/sections/aiSection/messages';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { useAiStatus } from '@/settings/aiSettings';
import { mentorSession, useMentorAccount } from '@/settings/mentorAccount';
import { mentorLive, openBuyCredits } from '@/settings/mentorLive';
import { useAppDialogs } from '@/store/appDialogs';
import { aiChipState, type AiChip } from './aiChip';
import { AI_UI_MESSAGES } from './messages';

/**
 * The AI status chip (k-0524, u-fs5v): "AI credits 9,003" on the DSEcon Mentor account (amber
 * when under one studio run, red with Buy credits at 0 or below), "AI: own key (Gemini)", or
 * "Set up AI". A click opens Settings → AI. Shown in the app's status bar on every screen
 * (`AiStatusBar`), the Question studio's header and beside the cost line before big runs.
 * A develop build pointed at another Mentor says so (amber dot + tooltip, `mentorOrigin.ts`).
 */

type Where = 'bar' | 'header' | 'inline';

const SIZE: Record<Where, string> = {
  bar: 'h-5 px-2 text-[11px]',
  header: 'h-7 px-2.5 text-xs',
  inline: 'h-6 px-2 text-[11px]',
};

const TONE = {
  normal: 'border-line bg-surface text-ink-muted hover:bg-surface-hover hover:text-ink',
  low: 'border-warn-ink/30 bg-warn-soft text-warn-ink hover:brightness-95',
  out: 'border-danger-ink/35 bg-danger-soft text-danger-ink hover:brightness-95',
  setup: 'border-dashed border-line-strong bg-transparent text-ink-muted hover:bg-surface-hover hover:text-ink',
} as const;

export function AiStatusChip({ where = 'inline', className = '' }: { where?: Where; className?: string }) {
  const status = useAiStatus();
  const mentor = useMentorAccount();
  const m = useMessages(AI_UI_MESSAGES);
  const s = useMessages(AI_SECTION_MESSAGES);
  const lang = useUiLanguage();
  const chip = aiChipState(status, mentor);
  const unread = chip.kind === 'credits' && mentor.kind === 'signedIn' && mentor.account === null && !mentor.loading && !mentor.error;
  useEffect(() => {
    if (unread) void mentorSession().refresh();
  }, [unread]);

  const label = chipLabel(chip, m, lang);
  const test = !MENTOR.production && chip.kind === 'credits';
  const title = [chipTitle(chip, m, s, lang), test ? s.mentorTestServer(MENTOR.label) : null].filter(Boolean).join('\n');
  const tone = chip.kind === 'credits' ? chip.tone : chip.kind === 'setup' ? 'setup' : 'normal';
  const open = () => useAppDialogs.getState().openSettings({ section: 'ai', ...(chip.kind === 'ownKey' ? {} : { focus: 'account' }) });

  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 ${className}`} data-ai-chip={chip.kind} data-ai-chip-tone={tone} data-print-hide>
      <button
        type="button"
        onClick={open}
        title={title}
        aria-label={`${label}. ${title}`}
        className={`inline-flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full border font-medium tabular-nums transition-[background-color,color,filter] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${SIZE[where]} ${TONE[tone]}`}
      >
        {test && <span aria-hidden data-ai-chip-test className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn-ink" />}
        {label}
      </button>
      {chip.kind === 'credits' && chip.tone === 'out' && (
        <button
          type="button"
          onClick={() => openBuyCredits()}
          data-ai-chip-buy
          className={`inline-flex cursor-pointer select-none items-center whitespace-nowrap rounded-full border border-transparent bg-danger font-semibold text-on-danger transition-[filter] duration-150 hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${SIZE[where]}`}
        >
          {m.chipBuy}
        </button>
      )}
    </span>
  );
}

type UiMessages = ReturnType<typeof useMessages<typeof AI_UI_MESSAGES>>;

export function chipLabel(chip: AiChip, m: UiMessages, lang: string): string {
  switch (chip.kind) {
    case 'credits':
      return chip.credits === null ? m.chipChecking : m.chipCredits(formatCredits(chip.credits, lang));
    case 'ownKey':
      return chip.local ? m.chipLocal(chip.name) : m.chipOwnKey(chip.name);
    case 'setup':
      return m.chipSetup;
  }
}

function chipTitle(chip: AiChip, m: UiMessages, s: ReturnType<typeof useMessages<typeof AI_SECTION_MESSAGES>>, lang: string): string {
  switch (chip.kind) {
    case 'credits': {
      const lines = [m.chipTitleCredits];
      if (chip.stopped) lines.push(chip.stopped === 'paused' ? s.mentorPaused : s.mentorOff);
      if (chip.tone === 'out') lines.push(m.chipTitleOut);
      else if (chip.credits !== null && chip.credits < chip.low) lines.push(m.chipTitleLow(formatCredits(chip.low, lang)));
      return lines.join('\n');
    }
    case 'ownKey':
      return chip.local ? m.chipTitleLocal(chip.name) : m.chipTitleOwnKey(chip.name);
    case 'setup':
      return m.chipTitleSetup;
  }
}

/**
 * The app's status bar (k-0524): a slim strip under every screen with the AI chip on the right,
 * and the one place the credits are kept current (`mentorLive`). Never printed.
 */
export function AiStatusBar() {
  const m = useMessages(AI_UI_MESSAGES);
  useEffect(() => mentorLive().start(), []);
  return (
    <footer
      aria-label={m.chipBar}
      data-ai-status-bar
      data-print-hide
      className="flex h-7 shrink-0 items-center justify-end gap-2 border-t border-line bg-surface px-3 print:hidden"
    >
      <AiStatusChip where="bar" />
    </footer>
  );
}
