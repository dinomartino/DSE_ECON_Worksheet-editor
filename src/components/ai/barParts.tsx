'use client';

import type { AiErrorInfo } from '@/ai/types';
import { COPY_MESSAGES } from '@/components/translate/messages';
import { useMessages } from '@/i18n/language';
import { localizedErrorMessage } from './errorCopy';
import { AI_UI_MESSAGES } from './messages';
import { errorActions, errorNote, runErrorAction, type RunControl } from './errorActions';

/**
 * The run bar's pieces, shared by the editor's `AiBar` and the question bank's
 * `BankAiBar`: the buttons, the ✦, the running line with its progress and Stop, and an
 * error with exactly the actions it names. Neither bar owns them.
 */

export function BarButton({ primary = false, className = '', ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  const look = primary ? 'bg-on-cta text-cta hover:opacity-90' : 'text-on-cta/80 hover:bg-cta-hover hover:text-on-cta';
  return (
    <button
      type="button"
      className={`shrink-0 cursor-pointer rounded-md px-2 py-1 text-[12px] font-medium transition-[background-color,color,opacity,scale] duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:scale-[0.97] ${look} ${className}`}
      {...rest}
    />
  );
}

export const Sparkle = () => (
  <span aria-hidden className="shrink-0 text-[13px]">
    ✦
  </span>
);

/** "Translating into 中文 ━━━ 3 of 12 Stop". */
export function RunningBody({ label, done, total, onStop }: { label: string; done: number; total: number; onStop(): void }) {
  const m = useMessages(AI_UI_MESSAGES);
  const copy = useMessages(COPY_MESSAGES);
  const share = total > 0 ? Math.min(1, done / total) : 0;
  return (
    <>
      <Sparkle />
      <span className="min-w-0 truncate">{label}</span>
      {total > 0 && (
        <>
          <span className="h-1 w-24 shrink-0 overflow-hidden rounded-full bg-on-cta/20" aria-hidden>
            <span className="block h-full rounded-full bg-on-cta transition-[width] duration-300 ease-out-soft" style={{ width: `${share * 100}%` }} />
          </span>
          <span className="shrink-0 tabular-nums text-on-cta/70">
            {m.progress(done, total)}
          </span>
        </>
      )}
      <BarButton onClick={onStop}>{copy.stop}</BarButton>
    </>
  );
}

/** The error's message, its note and technical detail, then its actions and Close. */
export function ErrorBody({ error, onClose, run }: { error: AiErrorInfo; onClose(): void; run?: RunControl }) {
  const note = errorNote(error);
  const copy = useMessages(COPY_MESSAGES);
  return (
    <>
      <Sparkle />
      <span className="min-w-0 flex-1">
        <span className="font-medium">{localizedErrorMessage(error)}</span>
        {note && <span className="block text-[11px] text-on-cta/70">{note}</span>}
        {error.detail && (
          <details className="text-[11px] text-on-cta/70">
            <summary className="cursor-pointer select-none">{copy.technicalDetail}</summary>
            <span className="mt-0.5 block max-w-[32rem] break-words font-mono">{error.detail.slice(0, 300)}</span>
          </details>
        )}
      </span>
      {errorActions(error).map((action) => (
        <BarButton key={`${action.kind}:${action.label}`} primary={action.kind === 'retry'} onClick={() => runErrorAction(action, error, run)}>
          {action.label}
        </BarButton>
      ))}
      <BarButton onClick={onClose}>{copy.close}</BarButton>
    </>
  );
}
