'use client';

import { AI_UI_MESSAGES } from '@/components/ai/messages';
import { useMessages } from '@/i18n/language';
import type { AiChoice } from '@/settings/aiChoice';

/**
 * Settings → AI's two-way choice (k-0527, u-ypm9), shown only when the teacher is signed in to
 * DSEcon Mentor AND has an own key saved: which one the AI uses. Each side says who pays.
 * Props only; the choice is Settings' `provider` (`aiChoice.ts`), so it outlives a restart.
 */
export function AiChoiceField({
  using,
  own,
  credits,
  onChoose,
}: {
  using: AiChoice;
  /** The own key's provider, short ("Gemini"). */
  own: string;
  /** The credits left, formatted; null until read. */
  credits: string | null;
  onChoose(choice: AiChoice): void;
}) {
  const m = useMessages(AI_UI_MESSAGES);
  const options: Array<{ value: AiChoice; label: string; note: string }> = [
    { value: 'mentor', label: m.choiceMentor, note: credits ? m.choiceMentorNote(credits) : m.choiceMentorNoteUnread },
    { value: 'own', label: m.choiceOwn(own), note: m.choiceOwnNote(own) },
  ];
  return (
    <section aria-label={m.choiceTitle} data-ai-choice-field={using} className="space-y-1.5">
      <h4 className="text-[13px] font-medium text-ink">{m.choiceTitle}</h4>
      <div role="radiogroup" aria-label={m.choiceTitle} className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const on = option.value === using;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-ai-choice={option.value}
              onClick={() => onChoose(option.value)}
              className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                on ? 'border-accent/50 bg-accent-soft' : 'border-line hover:bg-surface-hover'
              }`}
            >
              <span aria-hidden className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? 'border-accent' : 'border-line-strong'}`}>
                {on && <span className="h-2 w-2 rounded-full bg-accent" />}
              </span>
              <span className="min-w-0">
                <span className={`block text-[13px] font-medium ${on ? 'text-ink' : 'text-ink-muted'}`}>{option.label}</span>
                <span className="block text-xs text-ink-muted">{option.note}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
