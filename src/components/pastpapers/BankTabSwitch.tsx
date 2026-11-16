'use client';

import { useState, type ReactNode } from 'react';
import { useMessages } from '@/i18n/language';
import { PAST_PAPER_SETTINGS, sourceUrl } from '@/pastpapers/config';
import { useSettings } from '@/settings/store';
import { PAST_PAPER_MESSAGES } from './messages';
import { PastPaperTab } from './PastPaperTab';

const KEY = 'econ-bank-tab-source';

function readChoice(): 'mine' | 'past' {
  try {
    return globalThis.sessionStorage?.getItem(KEY) === 'past' ? 'past' : 'mine';
  } catch {
    return 'mine';
  }
}

/**
 * The top of the editor's 題庫 tab (k-0443): which bank it shows. My bank is the teacher's
 * own 題庫 as before; Past papers is the read-only Past paper bank, a separate list that
 * never mixes with it. Without the past paper bank (switched off, or not in this build) the
 * switch is not drawn and the tab is exactly the old one.
 */
export function BankTabSwitch({ mine }: { mine: ReactNode }) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const [settings] = useSettings(PAST_PAPER_SETTINGS);
  const [choice, setChoice] = useState(readChoice);
  if (!sourceUrl(settings)) return <>{mine}</>;
  const choose = (next: 'mine' | 'past') => {
    setChoice(next);
    try {
      globalThis.sessionStorage?.setItem(KEY, next);
    } catch {
      // Not remembered in private mode.
    }
  };
  const options: { id: 'mine' | 'past'; label: string }[] = [
    { id: 'mine', label: m.myBank },
    { id: 'past', label: m.titleShort },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-3">
        <div role="radiogroup" aria-label={m.bankSwitch} className="flex rounded-lg bg-surface-sunken p-0.5">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={choice === option.id}
              onClick={() => choose(option.id)}
              className={`flex-1 cursor-pointer rounded-md px-3 py-1 text-[12.5px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                choice === option.id ? 'bg-surface font-medium text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div key={choice} className="flex min-h-0 flex-1 flex-col">
        {choice === 'past' ? <PastPaperTab /> : mine}
      </div>
    </div>
  );
}
