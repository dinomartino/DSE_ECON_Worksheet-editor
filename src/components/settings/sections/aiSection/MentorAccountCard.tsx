'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { Button, Pill } from '@/components/ui';
import { useMessages, useUiLanguage } from '@/i18n/language';
import type { MentorState } from '@/settings/mentorAccount';
import { AI_SECTION_MESSAGES } from './messages';

/**
 * Settings → AI's first card (k-0519): the DSEcon Mentor account. Signed out: what it is and
 * Sign in. Signing in: the link code and Open the page again. Signed in: credits left (and a
 * pause or switch-off), Buy credits, Sign out, and whether AI uses the account or an own key.
 * Web (k-0521 F15): a "shared computer" choice before Sign in, and how long the browser keeps
 * the sign-in. After a sign-out Mentor did not confirm (F9): where to end it. Props only.
 */

export interface MentorCardActions {
  signIn(opts: { tabOnly: boolean }): void;
  cancel(): void;
  reopen(url: string): void;
  signOut(): void;
  refresh(): void;
  use(): void;
  buy(url: string): void;
  /** Mentor's account page (where its Econ Studio sign-ins can be signed out). */
  openAccount(url: string): void;
  prices(url: string): void;
}

export function formatCredits(n: number, lang: string): string {
  if (n > 0 && n < 1) return '<1';
  return new Intl.NumberFormat(lang.startsWith('zh') ? 'zh-HK' : 'en-HK', { maximumFractionDigits: 0 }).format(Math.floor(n));
}

export function MentorAccountCard({
  state,
  inUse,
  focus,
  web,
  actions,
}: {
  state: MentorState;
  /** Settings' provider is the account. */
  inUse: boolean;
  focus?: boolean;
  /** The web build: where the sign-in is kept in this browser (absent on desktop: the keychain). */
  web?: { kept: 'browser' | 'tab' | null };
  actions: MentorCardActions;
}) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const lang = useUiLanguage();
  const ref = useRef<HTMLElement>(null);
  const tabOnlyId = useId();
  const [tabOnly, setTabOnly] = useState(false);
  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: 'center' });
  }, [focus]);

  return (
    <section
      ref={ref}
      aria-label={m.mentorTitle}
      data-mentor-account={state.kind}
      className={`space-y-2 rounded-xl border px-3 py-2.5 ${state.kind === 'signedIn' && inUse ? 'border-accent/40 bg-surface-raised' : 'border-line'}`}
    >
      <div className="flex items-center gap-2">
        <h4 className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">{m.mentorTitle}</h4>
        {state.kind === 'signedIn' && <Pill tone={inUse ? 'accent' : 'neutral'}>{m.mentorSignedIn}</Pill>}
      </div>

      {state.kind === 'signedOut' && (
        <>
          <p className="text-xs text-ink-muted">{m.mentorBlurb}</p>
          {state.reason && (
            <p role="status" className="text-xs text-warn-ink">
              {state.reason === 'denied' ? m.mentorDenied : state.reason === 'expired' ? m.mentorExpired : m.mentorKeychain}
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-xs text-danger-ink">
              {localizedErrorMessage(state.error, lang)}
            </p>
          )}
          {state.revokeFailed && (
            <div role="alert" data-mentor-revoke-failed className="space-y-1.5 rounded-lg bg-warn-soft px-2.5 py-2">
              <p className="text-xs text-warn-ink">{m.mentorRevokeFailed}</p>
              <Button size="sm" onClick={() => actions.openAccount(state.revokeFailed?.accountUrl ?? '')}>
                {m.mentorOpenAccount}
              </Button>
            </div>
          )}
          {web && (
            <label htmlFor={tabOnlyId} className="flex items-center gap-2 text-xs text-ink-muted">
              <input id={tabOnlyId} type="checkbox" data-mentor-tab-only checked={tabOnly} onChange={(e) => setTabOnly(e.target.checked)} />
              {m.mentorTabOnly}
            </label>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="md" autoFocus={focus} onClick={() => actions.signIn({ tabOnly: Boolean(web) && tabOnly })}>
              {m.mentorSignIn}
            </Button>
            <Button variant="subtle" size="md" onClick={() => actions.prices('')}>
              {m.mentorPrices}
            </Button>
          </div>
          <p className="text-[11px] text-ink-subtle">{m.mentorPrivacy}</p>
        </>
      )}

      {state.kind === 'linking' && (
        <>
          <p role="status" aria-live="polite" className="text-xs text-ink">
            {state.code ? m.mentorWaiting(state.code) : m.mentorStarting}
          </p>
          {state.code && (
            <p className="font-mono text-base font-semibold tracking-widest text-ink" aria-hidden>
              {state.code}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {state.verifyUrl && (
              <Button size="sm" onClick={() => actions.reopen(state.verifyUrl as string)}>
                {m.mentorOpenAgain}
              </Button>
            )}
            <Button variant="subtle" size="sm" onClick={actions.cancel}>
              {m.cancel}
            </Button>
          </div>
        </>
      )}

      {state.kind === 'signedIn' && (
        <>
          <p className="text-[13px] text-ink" aria-live="polite">
            {state.account ? (
              <span className="font-semibold tabular-nums">{m.mentorCredits(formatCredits(state.account.credits, lang))}</span>
            ) : state.loading ? (
              <span className="text-ink-muted">{m.mentorChecking}</span>
            ) : null}
          </p>
          {state.account && state.account.status !== 'on' && (
            <p role="status" className="text-xs text-warn-ink">
              {state.account.status === 'paused' ? m.mentorPaused : m.mentorOff}
            </p>
          )}
          {state.error && (
            <p role="alert" className="text-xs text-danger-ink">
              {localizedErrorMessage(state.error, lang)}
            </p>
          )}
          <p className={`text-xs ${inUse ? 'text-ink' : 'text-ink-muted'}`}>{inUse ? m.mentorInUse : m.mentorNotInUse}</p>
          {state.account?.packs && (
            <p data-mentor-packs className="text-xs tabular-nums text-ink-muted">
              {m.mentorPacks} {state.account.packs.map((pack) => m.mentorPack(formatCredits(pack.priceHkd, lang), formatCredits(pack.credits, lang))).join(' / ')}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {!inUse && (
              <Button variant="primary" size="sm" onClick={actions.use}>
                {m.mentorUse}
              </Button>
            )}
            <Button variant={inUse ? 'primary' : 'default'} size="sm" onClick={() => actions.buy(state.account?.buyUrl ?? '')}>
              {m.mentorBuy}
            </Button>
            {state.error && (
              <Button variant="subtle" size="sm" onClick={actions.refresh}>
                {m.mentorRefresh}
              </Button>
            )}
            <Button variant="subtle" size="sm" onClick={actions.signOut}>
              {m.mentorSignOut}
            </Button>
          </div>
          {web?.kept && (
            <p data-mentor-kept={web.kept} className="text-[11px] text-ink-subtle">
              {web.kept === 'tab' ? m.mentorKeptTab : m.mentorKeptBrowser}
            </p>
          )}
          <p className="text-[11px] text-ink-subtle">{m.mentorPrivacy}</p>
        </>
      )}
    </section>
  );
}
