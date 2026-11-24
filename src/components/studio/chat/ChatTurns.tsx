'use client';

import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { localizedErrorMessage } from '@/components/ai/errorCopy';
import { ReferenceBadge } from '../ReferenceBadge';
import { referenceByLabel } from '../referenceItem';
import { RunErrorNotice } from '../StudioError';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import type { AiTurn, Chat, Note, Step } from './chatTypes';
import { keyPointName, PickLine } from './PickLine';

type M = ReturnType<typeof useMessages<typeof STUDIO_CHAT_MESSAGES>>;

/** The chat's log: the teacher's requests on the right, the AI's replies as steps, then what it says. */
export function ChatTurns({
  chat,
  runningTurn,
  language,
  onJump,
  onRetry,
  onDismiss,
  onChangePick,
  onAnswer,
}: {
  chat: Chat;
  runningTurn?: string;
  language: LanguageMode;
  onJump: (draftId: string) => void;
  onRetry: (turnId: string) => void;
  onDismiss: (turnId: string) => void;
  onChangePick: (code: string) => void;
  onAnswer: (turnId: string, answer: 'rewrite' | 'keep') => void;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  // Only the newest pick can be changed: older ones are history.
  const lastTurn = chat.turns[chat.turns.length - 1]?.id;
  const lastPickTurn = [...chat.turns].reverse().find((t): t is AiTurn => t.role === 'ai' && t.steps.some((s) => s.kind === 'pick' && s.state === 'done'))?.id;
  return (
    <>
      {chat.turns.map((turn) =>
        turn.role === 'user' ? (
          <div key={turn.id} className="max-w-[88%] self-end rounded-2xl rounded-br-md border border-line bg-surface-sunken px-3 py-2 text-[13px] leading-relaxed text-ink" data-chat-user>
            {turn.refs.length > 0 && <TurnRefs labels={turn.refs} chat={chat} language={language} />}
            {turn.draftNo !== undefined && !turn.text && (turn.how === 'harder' ? m.userHarder(turn.draftNo) : turn.how === 'easier' ? m.userEasier(turn.draftNo) : turn.how === 'another' ? m.userAnother(turn.draftNo) : m.aboutDraft(turn.draftNo))}
            {turn.text || (turn.draftNo === undefined ? m.likeThis(chat.settings.count) : '')}
          </div>
        ) : (
          <AiReply
            key={turn.id}
            turn={turn}
            chat={chat}
            m={m}
            running={turn.id === runningTurn}
            latest={turn.id === lastTurn}
            language={language}
            pickEditable={turn.id === lastPickTurn && !runningTurn}
            onJump={onJump}
            onRetry={() => onRetry(turn.id)}
            onDismiss={() => onDismiss(turn.id)}
            onChangePick={onChangePick}
            onAnswer={(answer) => onAnswer(turn.id, answer)}
          />
        ),
      )}
    </>
  );
}

function StepIcon({ state }: { state: Step['state'] }) {
  if (state === 'run') return <span aria-hidden className="mt-[3px] inline-block h-2.5 w-2.5 shrink-0 animate-spin rounded-full border-[1.5px] border-[var(--color-accent)] border-t-transparent" />;
  if (state === 'fail') return <span aria-hidden className="w-3 shrink-0 text-center text-ink-subtle">–</span>;
  return <span aria-hidden className="w-3 shrink-0 text-center font-bold text-ok">✓</span>;
}

function stepWords(step: Step, m: M): string {
  switch (step.kind) {
    case 'read':
      return m.stepRead(step.labels.join(', '));
    case 'refs':
      return step.state === 'run' ? m.stepRefsRun : m.stepRefsDone(step.labels.length, step.labels.join(', '));
    case 'write':
      return step.state === 'run' ? m.stepWriteRun(step.count) : m.stepWriteDone(step.count);
    case 'check':
      return step.state === 'run' ? m.stepCheckRun : m.stepCheckDone;
    case 'diagram':
      return step.state === 'run' ? m.stepDiagramRun : m.stepDiagramDone;
    case 'change':
      return step.state === 'run' ? m.stepChangeRun(step.draftNo, step.how) : m.stepChangeDone(step.draftNo, step.how);
    case 'pick':
      return m.stepPicking;
  }
}

function noteWords(note: Note, m: M, language: LanguageMode): string {
  switch (note.kind) {
    case 'written':
      return m.noteWritten(note.ok, note.look, note.failed);
    case 'changed':
      return m.noteChanged(note.draftNo, note.version);
    case 'another':
      return m.noteAnother(note.draftNo);
    case 'stopped':
      return m.noteStopped;
    case 'noPick':
      return m.noteNoPick;
    case 'pickChanged':
      return m.notePickChanged(keyPointName(note.code, language));
    case 'kept':
      return m.answeredKeep;
  }
}

function AiReply({
  turn,
  chat,
  m,
  running,
  latest,
  language,
  pickEditable,
  onJump,
  onRetry,
  onDismiss,
  onChangePick,
  onAnswer,
}: {
  turn: AiTurn;
  chat: Chat;
  m: M;
  running: boolean;
  latest: boolean;
  language: LanguageMode;
  pickEditable: boolean;
  onJump: (draftId: string) => void;
  onRetry: () => void;
  onDismiss: () => void;
  onChangePick: (code: string) => void;
  onAnswer: (answer: 'rewrite' | 'keep') => void;
}) {
  const made = turn.draftIds.map((id) => chat.drafts.find((d) => d.id === id)).filter((d) => d !== undefined);
  return (
    <div className="self-stretch text-[13px] leading-relaxed" data-chat-ai aria-busy={running}>
      <div className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--color-ai,#6a4fd8)]">✦ {m.studio}</div>
      {turn.steps.length > 0 && (
        <ul className="mb-1.5 flex flex-col gap-1 text-[12px] text-ink-muted" data-chat-steps>
          {turn.steps.map((step, i) => (
            <li key={`${step.kind}:${i}`} className="flex items-start gap-2" data-step={step.kind} data-state={step.state}>
              <StepIcon state={step.kind === 'pick' && step.picks.length > 0 ? 'done' : step.state} />
              {step.kind === 'pick' && step.picks.length > 0 ? (
                <PickLine picks={step.picks} by={step.by} language={language} editable={pickEditable} onChange={onChangePick} />
              ) : (
                <span className="min-w-0">
                  {stepWords(step, m)}
                  
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {turn.notes.map((note, i) => (
        <p key={`${note.kind}:${i}`} className="mt-1 text-ink" data-note={note.kind}>
          {noteWords(note, m, language)}
        </p>
      ))}
      {turn.ask && (
        <div className="mt-1.5" data-chat-ask>
          <p className="text-ink">{m.askRewrite}</p>
          {turn.ask.answer ? (
            <p className="mt-1 text-[12px] text-ink-muted">{turn.ask.answer === 'rewrite' ? m.answeredRewrite : m.answeredKeep}</p>
          ) : (
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" onClick={() => onAnswer('rewrite')} className="cursor-pointer rounded-lg bg-cta px-3 py-1 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                ↻ {m.rewriteThem}
              </button>
              <button type="button" onClick={() => onAnswer('keep')} className="cursor-pointer rounded-lg border border-line bg-surface px-3 py-1 text-[12.5px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                {m.keepThem}
              </button>
            </div>
          )}
        </div>
      )}
      {made.length > 0 && !running && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {made.map((d) => (
            <button
              key={d.id}
              type="button"
              title={m.jumpTitle}
              onClick={() => onJump(d.id)}
              data-jump={d.no}
              className="cursor-pointer rounded-lg border border-line bg-surface px-2 py-0.5 text-[12px] text-ink-muted hover:border-accent hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              → {m.jump(d.no)}
            </button>
          ))}
        </div>
      )}
      {turn.error && (
        <p className="mt-1.5 text-[12.5px] text-danger-ink" data-chat-error>
          {localizedErrorMessage(turn.error)}
          {latest && (
            <button type="button" onClick={onRetry} className="ml-2 cursor-pointer text-accent underline underline-offset-2 hover:text-accent-hover">
              {m.retry}
            </button>
          )}
        </p>
      )}
      {/* The app's notice (with the error's own actions), for the newest reply only. */}
      {latest && <RunErrorNotice error={turn.errorSeen ? undefined : turn.error} onRetry={onRetry} onDismiss={onDismiss} />}
    </div>
  );
}

/** A past request's references (k-0533): each one found in the chat opens its preview; a lost one stays words. */
function TurnRefs({ labels, chat, language }: { labels: readonly string[]; chat: Chat; language: LanguageMode }) {
  return (
    <div className="mb-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-ink-muted">
      {labels.map((label, i) => {
        const source = referenceByLabel(chat, label);
        return (
          <span key={`${label}-${i}`} className="inline-flex min-w-0 items-center">
            {source ? <ReferenceBadge source={source} language={language} tone="quiet" /> : label}
            {i < labels.length - 1 && ','}
          </span>
        );
      })}
    </div>
  );
}
