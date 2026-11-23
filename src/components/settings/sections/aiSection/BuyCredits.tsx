'use client';

import { useId, useState } from 'react';
import { cleanBuyHkd, creditsForPayment, studioQuestions } from '@/ai/credits';
import { buyUrlFor, type MentorBuy } from '@/ai/mentor';
import { Button } from '@/components/ui';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { formatCredits } from './MentorAccountCard';
import { AI_SECTION_MESSAGES } from './messages';

/**
 * Buy credits for any whole HK$ amount (CONTRACT v1.4, u-1zca): Mentor's quick picks fill the
 * amount box, the box takes any whole amount from `minHkd` to `maxHkd`, a live line says about
 * how many credits (Mentor's own formula, `creditsForPayment`) and studio questions it gives,
 * and Buy opens Mentor's Account page with the amount filled in. Nothing is sent to Mentor's
 * API or to Stripe from here. Every limit and figure comes from `/ai/credits`.
 */
export function BuyCredits({ buy, primary, onBuy }: { buy: MentorBuy; primary: boolean; onBuy(url: string): void }) {
  const m = useMessages(AI_SECTION_MESSAGES);
  const lang = useUiLanguage();
  const id = useId();
  const [text, setText] = useState(() => String(buy.quickPicks[0]?.hkd ?? buy.minHkd));
  const hkd = cleanBuyHkd(text, buy);
  const credits = hkd !== null && buy.terms ? creditsForPayment(hkd, buy.terms) : null;
  const questions = credits !== null && buy.studioWorksheet ? studioQuestions(credits, buy.studioWorksheet) : null;
  const n = (x: number) => formatCredits(x, lang);
  const invalid = hkd === null;
  const go = () => {
    if (hkd !== null) onBuy(buyUrlFor(buy, hkd));
  };

  return (
    <div data-mentor-buy className="space-y-1.5">
      {buy.quickPicks.length > 0 && (
        <div role="group" aria-label={m.buyQuickPicks} className="flex flex-wrap gap-1.5">
          {buy.quickPicks.map((pick) => (
            <Button
              key={pick.hkd}
              size="sm"
              variant={hkd === pick.hkd ? 'ghostAccent' : 'default'}
              aria-pressed={hkd === pick.hkd}
              data-buy-pick={pick.hkd}
              onClick={() => setText(String(pick.hkd))}
            >
              {m.mentorPack(n(pick.hkd), n(pick.credits))}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={id} className="text-xs text-ink-muted">
          {m.buyAmount}
        </label>
        <span className="flex h-8 items-center rounded-lg border border-line bg-surface pl-2 text-xs text-ink focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25">
          HK$
          <input
            id={id}
            data-buy-amount
            inputMode="numeric"
            autoComplete="off"
            value={text}
            aria-invalid={invalid}
            aria-describedby={`${id}-line`}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') go();
            }}
            className="h-full w-20 min-w-0 bg-transparent px-1 tabular-nums outline-none"
          />
        </span>
        <Button variant={primary ? 'primary' : 'default'} size="sm" disabled={invalid} onClick={go}>
          {m.mentorBuy}
        </Button>
      </div>
      <p id={`${id}-line`} aria-live="polite" data-buy-line className={`text-xs tabular-nums ${invalid ? 'text-danger-ink' : 'text-ink-muted'}`}>
        {invalid
          ? m.buyRange(n(buy.minHkd), n(buy.maxHkd))
          : credits === null
            ? null
            : questions === null
              ? m.buyCredits(n(credits))
              : m.buyPreview(n(credits), n(questions))}
      </p>
    </div>
  );
}
