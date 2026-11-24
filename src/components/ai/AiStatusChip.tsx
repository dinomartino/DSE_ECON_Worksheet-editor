'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { MENTOR } from '@/ai/mentorOrigin';
import { formatCredits } from '@/components/settings/sections/aiSection/MentorAccountCard';
import { AI_SECTION_MESSAGES } from '@/components/settings/sections/aiSection/messages';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { useAiStatus } from '@/settings/aiSettings';
import { mentorSession, useMentorAccount } from '@/settings/mentorAccount';
import { openBuyCredits, useMentorLive } from '@/settings/mentorLive';
import { useAppDialogs } from '@/store/appDialogs';
import { setAiChoice, useAiChoice } from '@/settings/aiChoiceLive';
import type { AiChoice } from '@/settings/aiChoice';
import { aiChipState, providerShortName, type AiChip } from './aiChip';
import { AI_UI_MESSAGES } from './messages';

/**
 * The AI status chip (k-0524, u-fs5v): "AI credits 9,003" on the DSEcon Mentor account (amber
 * when under one studio run, red with Buy credits at 0 or below), "AI: own key (Gemini)", or
 * "Set up AI". A click opens Settings → AI; signed in with an own key saved too, it opens a
 * small menu instead: DSEcon Mentor credits / My own key (Gemini) / AI settings… (k-0527). Shown in the Question studio's header and beside
 * the cost line before big runs (the studio's composer, the import's AI check). While one is
 * on screen it keeps the credits current (`useMentorLive`). The bottom status bar that also
 * carried it on every screen is gone (k-0526, u-uw4t: the user didn't want it).
 * A develop build pointed at another Mentor says so (amber dot + tooltip, `mentorOrigin.ts`).
 */

type Where = 'header' | 'inline';

const SIZE: Record<Where, string> = {
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
  useMentorLive();
  const unread = chip.kind === 'credits' && mentor.kind === 'signedIn' && mentor.account === null && !mentor.loading && !mentor.error;
  useEffect(() => {
    if (unread) void mentorSession().refresh();
  }, [unread]);

  const choice = useAiChoice();
  const [menu, setMenu] = useState(false);
  const label = chipLabel(chip, m, lang);
  const test = !MENTOR.production && chip.kind === 'credits';
  const title = [chipTitle(chip, m, s, lang), choice ? m.chipClickChoose : m.chipClickSettings, test ? s.mentorTestServer(MENTOR.label) : null].filter(Boolean).join('\n');
  const tone = chip.kind === 'credits' ? chip.tone : chip.kind === 'setup' ? 'setup' : 'normal';
  const openSettings = () => useAppDialogs.getState().openSettings({ section: 'ai', ...(chip.kind === 'ownKey' ? {} : { focus: 'account' }) });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const click = () => {
    if (!choice) return openSettings();
    setMenu((open) => !open);
  };

  return (
    <span className={`relative inline-flex shrink-0 items-center gap-1.5 ${className}`} data-ai-chip={chip.kind} data-ai-chip-tone={tone} data-ai-chip-choice={choice?.using} data-print-hide>
      <button
        ref={triggerRef}
        type="button"
        onClick={click}
        title={title}
        aria-label={`${label}. ${title}`}
        {...(choice ? { 'aria-haspopup': 'menu' as const, 'aria-expanded': menu } : {})}
        className={`inline-flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap rounded-full border font-medium tabular-nums transition-[background-color,color,filter] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${SIZE[where]} ${TONE[tone]}`}
      >
        {test && <span aria-hidden data-ai-chip-test className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn-ink" />}
        {label}
        {choice && (
          <svg aria-hidden viewBox="0 0 10 10" className={`h-2 w-2 shrink-0 opacity-70 transition-transform duration-150 ${menu ? 'rotate-180' : ''}`}>
            <path d="M1.5 3.5 5 7l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {choice && menu && (
        <ChoiceMenu
          using={choice.using}
          own={providerShortName(choice.own)}
          credits={mentor.kind === 'signedIn' && mentor.account ? formatCredits(mentor.account.credits, lang) : null}
          onChoose={(next) => {
            setMenu(false);
            if (next !== choice.using) setAiChoice(next);
            triggerRef.current?.focus();
          }}
          onSettings={() => {
            setMenu(false);
            openSettings();
          }}
          onClose={(refocus) => {
            setMenu(false);
            if (refocus) triggerRef.current?.focus();
          }}
          trigger={triggerRef}
        />
      )}
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
      const lines: string[] = [m.chipTitleCredits];
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
 * The chip's menu when both exist (k-0527): which one the AI uses, in one click, and the way to
 * Settings → AI. In a portal, fixed-positioned from the chip (k-0541): the chip sits in
 * overflow-clipped columns (the studio's chat sidebar, where an absolutely placed menu was cut
 * off at the sidebar's left edge), so it is placed by `placeChoiceMenu` — under or over the
 * chip, whichever fits, and shifted to stay inside the window. Inside a dialog (the import's AI
 * check) that is still safe: the dialog closes on a click on its scrim, which the menu is not
 * in. Escape stays in the menu.
 */
function ChoiceMenu({
  using,
  own,
  credits,
  onChoose,
  onSettings,
  onClose,
  trigger,
}: {
  using: AiChoice;
  own: string;
  credits: string | null;
  onChoose(choice: AiChoice): void;
  onSettings(): void;
  onClose(refocus: boolean): void;
  trigger: RefObject<HTMLButtonElement | null>;
}) {
  const m = useMessages(AI_UI_MESSAGES);
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  // Placed before paint, and again when the window resizes or anything under the chip scrolls.
  useLayoutEffect(() => {
    const place = () => {
      const popup = ref.current;
      const anchor = trigger.current?.getBoundingClientRect();
      if (!popup || !anchor) return;
      // Layout size, not the pop-in's scaled first frame.
      const at = placeChoiceMenu(anchor, { width: popup.offsetWidth, height: popup.offsetHeight }, { width: window.innerWidth, height: window.innerHeight });
      popup.style.top = `${at.top}px`;
      popup.style.left = `${at.left}px`;
      popup.style.transformOrigin = `${at.align} ${at.side === 'up' ? 'bottom' : 'top'}`;
      popup.style.setProperty('--pop-from-y', at.side === 'up' ? '2px' : '-2px');
      popup.style.visibility = 'visible';
      popup.dataset.side = at.side;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [trigger]);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus({ preventScroll: true });
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current?.contains(target) || trigger.current?.contains(target)) return;
      close.current(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [trigger]);
  const keys = (event: ReactKeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      event.preventDefault();
      return onClose(true);
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(ref.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  };
  const item = 'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-ink transition-colors duration-100 ease-out-soft hover:bg-surface-hover focus-visible:bg-surface-hover focus-visible:outline-none';
  const radio = (on: boolean) => (
    <span aria-hidden className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${on ? 'border-accent' : 'border-line-strong'}`}>
      {on && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
    </span>
  );
  const options: Array<{ value: AiChoice; label: string; hint?: string }> = [
    { value: 'mentor', label: m.choiceMentor, ...(credits ? { hint: credits } : {}) },
    { value: 'own', label: m.choiceOwn(own) },
  ];
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={m.choiceTitle}
      data-ai-choice-menu
      onKeyDown={keys}
      // Above dialogs (z-50); zone-light like the panels it opens from, now that it sits in <body>.
      className="zone-light fixed z-[60] min-w-[15rem] max-w-[calc(100vw-16px)] animate-pop-in rounded-xl border border-line bg-surface-raised p-1 text-left shadow-xl"
      style={{ top: 0, left: 0, visibility: 'hidden' }}
    >
      <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-medium text-ink-subtle">{m.choiceTitle}</p>
      {options.map((option) => (
        <button key={option.value} type="button" role="menuitemradio" aria-checked={using === option.value} data-ai-choice={option.value} className={item} onClick={() => onChoose(option.value)}>
          {radio(using === option.value)}
          <span className="min-w-0 flex-1 truncate">{option.label}</span>
          {option.hint && <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{option.hint}</span>}
        </button>
      ))}
      <div className="my-1 h-px bg-line" />
      <button type="button" role="menuitem" data-ai-choice-settings className={`${item} text-ink-muted`} onClick={onSettings}>
        <span aria-hidden className="w-3.5 shrink-0" />
        {m.choiceSettings}
      </button>
    </div>,
    document.body,
  );
}

const GAP = 6;
const EDGE = 8;

/**
 * Where the chip's menu goes (k-0541), in window coordinates. Under the chip when it fits, else
 * over it (the composer and the import's check sit low), else on whichever side has more room.
 * Its right edge lines up with the chip's (the studio header's chip is at the right) unless that
 * would push it past the window's left edge — then its left edge lines up with the chip's (the
 * chat sidebar's chip is at the left). Either way it is kept EDGE px inside the window.
 */
export function placeChoiceMenu(
  anchor: { top: number; bottom: number; left: number; right: number },
  menu: { width: number; height: number },
  view: { width: number; height: number },
): { top: number; left: number; side: 'up' | 'down'; align: 'left' | 'right' } {
  const below = view.height - EDGE - (anchor.bottom + GAP);
  const above = anchor.top - GAP - EDGE;
  const side = menu.height <= below || (menu.height > above && below >= above) ? 'down' : 'up';
  const rawTop = side === 'down' ? anchor.bottom + GAP : anchor.top - GAP - menu.height;
  const top = Math.max(EDGE, Math.min(rawTop, view.height - EDGE - menu.height));
  const align = anchor.right - menu.width >= EDGE ? 'right' : 'left';
  const rawLeft = align === 'right' ? anchor.right - menu.width : anchor.left;
  const left = Math.max(EDGE, Math.min(rawLeft, view.width - EDGE - menu.width));
  return { top, left, side, align };
}
