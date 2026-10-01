'use client';

import { useEffect, useRef, useState } from 'react';
import { ProviderFooter } from '@/components/ai/ProviderFooter';
import { SetupCard } from '@/components/ai/SetupCard';
import { Button } from '@/components/ui';
import { SparkleIcon } from '@/components/ui/icons';
import { useModalLayer } from '@/components/ui/modalLayer';
import type { BankRow } from '@/library/types';
import { useAiStatus } from '@/settings/aiSettings';
import { useAppDialogs } from '@/store/appDialogs';
import { useMessages } from '@/i18n/language';
import { confirmLine, needsConfirm } from './bankAi';
import { BANK_AI_MESSAGES } from './BankAi.messages';
import { bankScopes, bankVerbRows, questionCount, sendsLine, type BankScope, type BankScopeKey, type BankVerbId, type BankVerbRow } from './bankAiScopes';

export const BANK_AI_MENU_WIDTH = 360;

/**
 * The bank's ✦ AI door: Fill missing 中文 / English and Check terms, for the question on
 * screen, your list, or every question shown. A fill with no provider opens the SetupCard
 * first; one over 20 questions asks once, with a rough time. While open it owns the
 * keyboard (`useModalLayer`), so Esc closes it rather than leaving the level.
 */
export function BankAiMenu({
  question,
  list,
  shown,
  teacherText,
  disabled,
  onRun,
}: {
  question: BankRow | undefined;
  list: readonly BankRow[];
  shown: readonly BankRow[];
  teacherText: boolean;
  /** A run is going: the door waits for it. */
  disabled: boolean;
  onRun(verb: BankVerbId, rows: BankRow[]): void;
}) {
  const m = useMessages(BANK_AI_MESSAGES);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        title={disabled ? m.doorBusy : m.doorTitle}
        data-bank-ai-door
        className="inline-flex h-8 shrink-0 cursor-pointer select-none items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] font-medium text-ink transition-[background-color,border-color] duration-150 ease-out-soft hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-50"
      >
        <SparkleIcon size={14} className="text-accent" />
        {m.ai}
      </button>
      {open && (
        <Popover
          scopes={bankScopes(question, list, shown)}
          teacherText={teacherText}
          onClose={() => setOpen(false)}
          onRun={(verb, rows) => {
            setOpen(false);
            onRun(verb, rows);
          }}
        />
      )}
    </div>
  );
}

type Step = { kind: 'list' } | { kind: 'setup'; verb: BankVerbRow } | { kind: 'confirm'; verb: BankVerbRow };

function Popover({
  scopes,
  teacherText,
  onClose,
  onRun,
}: {
  scopes: BankScope[];
  teacherText: boolean;
  onClose(): void;
  onRun(verb: BankVerbId, rows: BankRow[]): void;
}) {
  useModalLayer();
  const m = useMessages(BANK_AI_MESSAGES);
  const ref = useRef<HTMLDivElement>(null);
  const status = useAiStatus();
  const [scopeKey, setScopeKey] = useState<BankScopeKey>(scopes[0]?.key ?? 'question');
  const [step, setStep] = useState<Step>({ kind: 'list' });
  const [active, setActive] = useState<BankVerbId | undefined>();
  const scope = scopes.find((s) => s.key === scopeKey) ?? scopes[0];
  const verbs = scope ? bankVerbRows(scope.rows, teacherText) : [];
  const current = verbs.find((verb) => verb.id === active) ?? verbs[0];

  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  }, [step]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      // A sub-step backs out to the list first.
      if (stepRef.current.kind === 'list') onClose();
      else setStep({ kind: 'list' });
    };
    const onDown = (event: PointerEvent) => {
      const panel = ref.current;
      // The door toggles itself; anything else outside closes.
      if (panel && !panel.parentElement?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose]);

  /** Setup first when a fill has no provider, then the one-line confirm for a big batch. */
  const choose = (verb: BankVerbRow, configured = status.configured) => {
    if (verb.needsKey && !configured) return setStep({ kind: 'setup', verb });
    if (verb.needsKey && needsConfirm(verb.rows.length)) return setStep({ kind: 'confirm', verb });
    onRun(verb.id, verb.rows);
  };

  let body: React.ReactNode;
  if (step.kind === 'setup') {
    body = <SetupCard verb={{ id: step.verb.id, label: step.verb.label }} onReady={() => choose(step.verb, true)} onCancel={() => setStep({ kind: 'list' })} />;
  } else if (step.kind === 'confirm') {
    body = (
      <div className="flex flex-col gap-2.5 p-3" data-bank-ai-confirm>
        <p className="text-[13px] leading-snug text-ink">{confirmLine(step.verb.rows.length)}</p>
        <p className="text-[11.5px] leading-snug text-ink-muted">{sendsLine(step.verb.rows.length, status.preset.label)}</p>
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="subtle" onClick={() => setStep({ kind: 'list' })}>
            {m.back}
          </Button>
          <Button size="sm" variant="primary" autoFocus onClick={() => onRun(step.verb.id, step.verb.rows)}>
            {m.translateN(step.verb.rows.length)}
          </Button>
        </div>
      </div>
    );
  } else {
    body = (
      <>
        {scopes.length > 1 && (
          <div role="radiogroup" aria-label={m.whichQuestions} className="flex flex-wrap gap-1 border-b border-line p-1.5">
            {scopes.map((choice) => {
              const on = choice.key === scope?.key;
              return (
                <button
                  key={choice.key}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-bank-ai-scope={choice.key}
                  onClick={() => {
                    setScopeKey(choice.key);
                    setActive(undefined);
                  }}
                  className={`h-7 cursor-pointer rounded-md px-2 text-[12px] font-medium tabular-nums transition-colors duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    on ? 'bg-surface-hover text-ink' : 'text-ink-muted hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        )}
        {verbs.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-ink-muted">{scope?.key === 'question' ? m.nothingQuestion : m.nothingQuestions}</p>
        ) : (
          <div role="menu" aria-label={m.actions} className="p-1">
            {verbs.map((verb) => {
              const on = verb.id === current?.id;
              return (
                <button
                  key={verb.id}
                  type="button"
                  role="menuitem"
                  data-bank-verb={verb.id}
                  onMouseMove={() => verb.id !== current?.id && setActive(verb.id)}
                  onFocus={() => setActive(verb.id)}
                  onClick={() => choose(verb)}
                  className={`block w-full cursor-pointer rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors duration-100 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${on ? 'bg-surface-hover' : ''}`}
                >
                  <span className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{verb.label}</span>
                    {!verb.needsKey && <span className="shrink-0 rounded bg-ok-soft px-1 text-[10px] font-medium text-ok">{m.free}</span>}
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-subtle">{questionCount(verb.rows.length)}</span>
                  </span>
                  {on && verb.needsKey && (
                    <span className="mt-0.5 block text-[11px] leading-snug text-ink-muted">{sendsLine(verb.rows.length, status.preset.label)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        <ProviderFooter
          status={status}
          onSettings={() => {
            onClose();
            useAppDialogs.getState().openSettings({ section: 'ai' });
          }}
        />
      </>
    );
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={m.tools}
      className="absolute right-0 top-[calc(100%+6px)] z-40 flex max-h-[min(34rem,calc(100vh-5rem))] origin-top-right animate-pop-in flex-col overflow-hidden whitespace-normal rounded-xl border border-line bg-surface-raised text-ink shadow-2xl"
      style={{ width: BANK_AI_MENU_WIDTH }}
    >
      {body}
    </div>
  );
}
