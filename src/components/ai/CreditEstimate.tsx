'use client';

import { useEffect } from 'react';
import { creditsFor, roundCredits, type CreditJob } from '@/ai/credits';
import { formatCredits } from '@/components/settings/sections/aiSection/MentorAccountCard';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { useAiStatus } from '@/settings/aiSettings';
import { mentorSession, useMentorAccount } from '@/settings/mentorAccount';
import { AI_UI_MESSAGES } from './messages';

/**
 * "Uses about 40 credits · 3,450 left" before a run, when AI goes through the DSEcon Mentor
 * account (k-0519, E4). Nothing for an own key, a job of null, or an account that hasn't said
 * what a credit is worth. Text only, so it can sit inside a menu item; warn ink when the
 * estimate is more than what is left. Reads the credits once if they aren't known yet.
 */
export function CreditEstimate({
  job,
  className = '',
  showLeft = true,
}: {
  job: CreditJob | null | undefined;
  className?: string;
  /** False beside the AI status chip, which already shows what is left (k-0524). */
  showLeft?: boolean;
}) {
  const status = useAiStatus();
  const mentor = useMentorAccount();
  const m = useMessages(AI_UI_MESSAGES);
  const lang = useUiLanguage();
  const using = status.provider === 'mentor' && mentor.kind === 'signedIn';
  const unread = using && mentor.kind === 'signedIn' && mentor.account === null && !mentor.loading && !mentor.error;
  useEffect(() => {
    if (unread) void mentorSession().refresh();
  }, [unread]);
  if (!using || !job || mentor.kind !== 'signedIn' || !mentor.account) return null;
  const raw = creditsFor(job, mentor.account);
  if (raw === null) return null;
  return <CreditEstimateLine credits={roundCredits(raw)} left={mentor.account.credits} lang={lang} m={m} className={className} showLeft={showLeft} />;
}

export function CreditEstimateLine({
  credits,
  left,
  lang,
  m,
  className = '',
  showLeft = true,
}: {
  credits: number;
  left: number;
  lang: string;
  m: ReturnType<typeof useMessages<typeof AI_UI_MESSAGES>>;
  className?: string;
  showLeft?: boolean;
}) {
  const short = credits > left;
  const tail = short ? m.creditsShort : showLeft ? m.creditsLeft(formatCredits(left, lang)) : null;
  return (
    <span data-credit-estimate={credits} className={`block text-[11px] leading-snug tabular-nums ${short ? 'text-warn-ink' : 'text-ink-muted'} ${className}`}>
      {m.creditsAbout(formatCredits(credits, lang), credits === 1)}
      {tail && ` · ${tail}`}
    </span>
  );
}
