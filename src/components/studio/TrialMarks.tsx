'use client';

import { useMessages } from '@/i18n/language';
import { useTrialLog } from '@/questionStudio/live';
import type { KeyMark, TrialDraft, UseMark } from '@/questionStudio/trialLog';
import { STUDIO_TRIAL_MESSAGES } from './trial.messages';

const pill = (on: boolean) =>
  `cursor-pointer rounded-md border px-2.5 py-1 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    on ? 'border-accent bg-accent-soft font-medium text-accent-ink' : 'border-line bg-surface text-ink hover:border-line-strong'
  }`;

/**
 * The two marks the trial asks for on every draft shown (k-0499, decision 7a): is the key
 * defensible (exactly one option the teacher would defend), and would they use the question
 * as it stands, after one edit, or not at all. A second press on a mark takes it back. Kept in
 * the trial's record (`trialLog.ts`), on this computer only; nothing here changes the draft.
 */
export function TrialMarks({ entry }: { entry: TrialDraft }) {
  const m = useMessages(STUDIO_TRIAL_MESSAGES);
  const { mark } = useTrialLog.getState();
  const key = (value: KeyMark) => mark(entry.id, { key: entry.key === value ? null : value });
  const use = (value: UseMark) => mark(entry.id, { use: entry.use === value ? null : value });

  return (
    <div role="group" aria-label={m.marksLabel} data-trial-marks={entry.id} className="mt-3 flex flex-col gap-2 rounded-lg bg-surface-sunken px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[112px] text-[12px] font-medium text-ink" title={m.keyHint}>
          {m.keyQuestion}
        </span>
        <button type="button" aria-pressed={entry.key === 'ok'} data-mark="key-ok" onClick={() => key('ok')} className={pill(entry.key === 'ok')}>
          {m.keyYes}
        </button>
        <button type="button" aria-pressed={entry.key === 'bad'} data-mark="key-bad" onClick={() => key('bad')} className={pill(entry.key === 'bad')}>
          {m.keyNo}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-[112px] text-[12px] font-medium text-ink">{m.useQuestion}</span>
        <button type="button" aria-pressed={entry.use === 'asis'} data-mark="use-asis" onClick={() => use('asis')} className={pill(entry.use === 'asis')}>
          {m.useAsis}
        </button>
        <button type="button" aria-pressed={entry.use === 'edit'} data-mark="use-edit" onClick={() => use('edit')} className={pill(entry.use === 'edit')}>
          {m.useEdit}
        </button>
        <button type="button" aria-pressed={entry.use === 'reject'} data-mark="use-reject" onClick={() => use('reject')} className={pill(entry.use === 'reject')}>
          {m.useReject}
        </button>
      </div>
    </div>
  );
}
