'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { PastPaperSheet } from '@/components/pastpapers/PastPaperSheet';
import { useMessages } from '@/i18n/language';
import { createWorksheet } from '@/model/factories';
import { plain } from '@/model/text';
import type { LanguageMode } from '@/model/types';
import { toRuns } from '@/generate/validate';
import type { PastPaperItem } from '@/pastpapers/pack';
import type { SourceQuestion } from '@/questionStudio/types';
import { QUESTION_STUDIO_MESSAGES } from '../messages';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import type { ChatState, RunState } from './chatStore';
import type { Chat, ChatDraft, ChatRef } from './chatTypes';
import { ChatDraftCard } from './ChatDraftCard';
import type { PartialDraft } from './engine';
import { whatChanged, type Change } from './whatChanged';

const FRAME = createWorksheet();
type View = 'paper' | 'compare';

/**
 * The main area: the paper writing itself. In Paper view the drafts sit in one column under a
 * bar naming what they were written like; in Side by side each draft has the reference beside
 * it and a short "What changed from the reference" list (C's idea in A's look, u-fwvn). Drafts
 * being written stream in as their words arrive; nothing here is a worksheet until Add.
 */
export function PaperCanvas({
  chat,
  run,
  items,
  language,
  focus,
  onAccept,
  onReject,
  onChange,
  onAsk,
  onRestore,
  onShowReference,
  footer,
}: {
  chat: Chat;
  run?: RunState;
  items: ChatState['items'];
  language: LanguageMode;
  /** The draft to bring into view (a jump from the chat). */
  focus?: { id: string; at: number };
  onAccept: (d: ChatDraft) => void;
  onReject: (d: ChatDraft) => void;
  onChange: (d: ChatDraft, how: 'harder' | 'easier' | 'another') => void;
  onAsk: (d: ChatDraft) => void;
  onRestore: (d: ChatDraft, index: number) => void;
  onShowReference: () => void;
  footer: ReactNode;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const [view, setView] = useState<View>('paper');
  const mine = chat.refs.filter((r) => r.who === 'you');
  const refs = mine.length ? mine : chat.refs;
  const [refId, setRefId] = useState<string>();
  const ref = refs.find((r) => r.source.id === refId) ?? refs[0];
  const writing = run && run.chatId === chat.id && !run.target ? run : undefined;
  const standing = chat.drafts.filter((d) => d.entry.draft.status !== 'failed');
  const leftOut = chat.drafts.filter((d) => d.entry.draft.status === 'failed');
  const accepted = chat.drafts.filter((d) => d.state === 'accepted').length;
  const busy = Boolean(run);
  const compare = view === 'compare' && ref !== undefined;

  useEffect(() => {
    if (!focus) return;
    const el = document.getElementById(`draft-${focus.id}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // A brief ring says which draft the chat meant (DOM only: nothing to re-render).
    el?.animate?.([{ boxShadow: '0 0 0 4px var(--color-accent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1600, easing: 'ease-out' });
  }, [focus]);

  const card = (d: ChatDraft) => (
    <ChatDraftCard
      key={d.id}
      draft={d}
      language={chat.settings.language}
      busy={busy}
      working={run?.target === d.id}
      highlight={false}
      onAccept={() => onAccept(d)}
      onReject={() => onReject(d)}
      onChange={(how) => onChange(d, how)}
      onAsk={() => onAsk(d)}
      onRestore={(i) => onRestore(d, i)}
    />
  );

  const firstNo = chat.drafts.reduce((max, d) => Math.max(max, d.no), 0) + 1;
  const streaming = writing ? <Streaming run={writing} language={chat.settings.language} firstNo={firstNo} /> : null;
  const empty = chat.drafts.length === 0 && !writing;

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-desk" aria-label={q.drafts} data-chat-canvas data-view={compare ? 'compare' : 'paper'}>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <h2 className="text-[13.5px] font-semibold text-ink">{q.drafts}</h2>
        {standing.length > 0 && (
          <span className="text-[12px] tabular-nums text-ink-subtle" role="status">
            {m.counts(standing.length, accepted)}
          </span>
        )}
        <span className="flex-1" />
        <div className="flex gap-0.5 rounded-lg bg-surface-sunken p-0.5" role="group" aria-label={m.viewLabel}>
          {(['paper', 'compare'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              disabled={v === 'compare' && !ref}
              title={v === 'compare' && !ref ? m.noReference : undefined}
              onClick={() => setView(v)}
              data-view-button={v}
              className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] disabled:cursor-not-allowed disabled:opacity-45 ${view === v ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
            >
              {v === 'paper' ? m.viewPaper : m.viewCompare}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {empty ? (
          <div className="mx-auto max-w-[440px] py-20 text-center text-[13.5px] leading-relaxed text-ink-muted" data-canvas-empty>
            <div aria-hidden className="mb-2 text-[30px] text-ink-subtle">
              ✦
            </div>
            <p>{m.canvasEmpty}</p>
            <p className="mt-1 text-[12.5px] text-ink-subtle">{m.canvasEmptyNote}</p>
          </div>
        ) : compare && ref ? (
          <div className="mx-auto grid max-w-[1280px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-5">
            <div className="sticky top-0 flex flex-col gap-2">
              {refs.length > 1 && (
                <div className="flex flex-wrap gap-1.5" role="group" aria-label={m.referencePick}>
                  {refs.map((r) => (
                    <button
                      key={r.source.id}
                      type="button"
                      aria-pressed={r === ref}
                      onClick={() => setRefId(r.source.id)}
                      className={`cursor-pointer rounded-full border px-2.5 py-0.5 text-[12px] ${r === ref ? 'border-accent bg-accent-soft text-accent-ink' : 'border-line bg-surface text-ink-muted hover:text-ink'}`}
                    >
                      {r.source.label}
                    </button>
                  ))}
                </div>
              )}
              <ReferenceCard reference={ref} item={items[ref.source.id]} language={language} />
            </div>
            <div className="flex flex-col gap-4">
              {standing.map((d) => (
                <div key={d.id} className="flex flex-col gap-2">
                  {card(d)}
                  {d.state !== 'rejected' && <ChangedList changes={whatChanged(ref.source, d.entry.draft, d.entry.request.sides)} />}
                </div>
              ))}
              {streaming}
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-[860px] flex-col gap-4">
            {refs.length > 0 && <RefBar refs={refs} onShow={() => (ref ? setView('compare') : onShowReference())} />}
            {standing.map(card)}
            {streaming}
            {leftOut.length > 0 && (
              <details className="rounded-xl border border-line bg-surface px-4 py-3" data-left-out>
                <summary className="cursor-pointer select-none text-[13px] font-medium text-ink">{q.leftOut(leftOut.length)}</summary>
                <p className="mb-3 mt-1.5 text-[12px] text-ink-muted">{q.leftOutNote}</p>
                <div className="flex flex-col gap-3">{leftOut.map(card)}</div>
              </details>
            )}
          </div>
        )}
      </div>
      {footer}
    </section>
  );
}

/** "Written like": the references the drafts follow, the teacher's or the AI's choice. */
function RefBar({ refs, onShow }: { refs: readonly ChatRef[]; onShow: () => void }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const ai = refs.every((r) => r.who === 'ai');
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 shadow-sm" data-ref-bar>
      <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-[15px] text-ink-muted">
        ▣
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] text-ink-muted">{ai ? m.aiChose : m.writtenLike}</div>
        <div className="truncate text-[13px] font-medium text-ink">{refs.map((r) => r.source.label).join(' · ')}</div>
      </div>
      <button type="button" onClick={onShow} className="cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-line-strong">
        {m.viewCompare}
      </button>
    </div>
  );
}

/** The reference as it prints: with its diagram when the bank question is at hand, else its words. */
function ReferenceCard({ reference, item, language }: { reference: ChatRef; item?: PastPaperItem; language: LanguageMode }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const { source } = reference;
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm" data-compare-reference={source.id}>
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[12.5px] font-semibold text-ink">{reference.who === 'ai' ? m.writtenLike : m.yourReference}</span>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted">{source.label}</span>
        <span className="flex-1" />
        {source.answerIndex >= 0 && <span className="rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink">{q.key('ABCD'[source.answerIndex] ?? '?')}</span>}
      </header>
      <div className="bg-white px-2 pt-1">
        {item ? <PastPaperSheet item={item} doc={FRAME} language={language} compact /> : <SourceWords source={source} language={language} />}
      </div>
      {!item && source.hasFigure && <p className="border-t border-line px-3 py-2 text-[11.5px] text-ink-subtle">{m.referenceWords}</p>}
    </article>
  );
}

const text = (t: { en: string; zh: string }, language: LanguageMode) => plain(toRuns(language === 'zh' ? t.zh || t.en : t.en || t.zh)).trim();

function SourceWords({ source, language }: { source: SourceQuestion; language: LanguageMode }) {
  return (
    <div className="px-5 py-4 font-serif text-[15px] leading-snug text-black">
      <p>{text(source.stem, language)}</p>
      {source.statements.length > 0 && (
        <ol className="mt-2 space-y-0.5">
          {source.statements.map((s, i) => (
            <li key={i}>
              ({i + 1}) {text(s, language)}
            </li>
          ))}
        </ol>
      )}
      <ol className="mt-2 space-y-0.5">
        {source.options.map((o, i) => (
          <li key={i}>
            {'ABCD'[i]}. {text(o, language)}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** "What changed from the reference", in a quiet panel under the draft (editor style). */
function ChangedList({ changes }: { changes: readonly Change[] }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  if (!changes.length) return null;
  const shape = (s: 'plain' | 'combination') => (s === 'plain' ? q.shapePlain : q.shapeCombination);
  const row = (label: string, body: ReactNode, key: string) => (
    <div key={key} className="grid grid-cols-[84px_minmax(0,1fr)] gap-3 py-1.5">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 text-ink">{body}</dd>
    </div>
  );
  const arrow = (from: string, to: string) =>
    from === to ? (
      <span className="text-ink-muted">
        {to} · {m.same}
      </span>
    ) : (
      <span>
        <span className="text-ink-subtle line-through decoration-ink-subtle/60">{from}</span> → {to}
      </span>
    );
  return (
    <section className="rounded-xl border border-line bg-surface px-3.5 py-2 text-[12.5px]" aria-label={m.changedTitle} data-changed>
      <h3 className="text-[12px] font-semibold text-ink">{m.changedTitle}</h3>
      <dl className="mt-1 divide-y divide-line">
        {changes.map((c, i) => {
          switch (c.kind) {
            case 'varies':
              return row(m.changedVaries, c.text, `v${i}`);
            case 'format':
              return row(m.changedFormat, arrow(shape(c.from), shape(c.to)), `f${i}`);
            case 'numbers':
              return row(m.changedNumbers, c.same ? arrow(c.from.join(', '), c.to.join(', ')) : arrow(c.from.join(', ') || m.noNumbers, c.to.join(', ') || m.noNumbers), `n${i}`);
            case 'key':
              return row(m.changedKey, arrow(c.from, c.to), `k${i}`);
          }
        })}
      </dl>
    </section>
  );
}

/** The drafts being written: their words as they arrive (u-2ouc), then the checked draft as it prints, then its diagram. */
function Streaming({ run, language, firstNo }: { run: RunState; language: LanguageMode; firstNo: number }) {
  const slots = Array.from({ length: Math.max(run.count, run.live.drafts.length) }, (_, i) => run.live.drafts.find((d) => d.index === i));
  return (
    <>
      {slots.map((live, i) =>
        live?.draft && run.request ? (
          <ChatDraftCard
            key={i}
            draft={{ id: `live-${i}`, no: firstNo + i, entry: { draft: live.draft, request: run.request }, older: [], state: 'open', turnId: run.turnId }}
            language={language}
            busy
            working={false}
            highlight={false}
            drawing={live.diagram === 'working'}
            onAccept={() => undefined}
            onReject={() => undefined}
            onChange={() => undefined}
            onAsk={() => undefined}
            onRestore={() => undefined}
          />
        ) : (
          <StreamingCard key={i} no={firstNo + i} partial={live?.partial} language={language} />
        ),
      )}
    </>
  );
}

function StreamingCard({ no, partial, language }: { no: number; partial?: PartialDraft; language: LanguageMode }) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const side = (t?: { en: string; zh: string }) => (t ? (language === 'zh' ? t.zh || t.en : t.en || t.zh) : '');
  const caret = <span aria-hidden className="ml-px inline-block h-[1.05em] w-[6px] animate-pulse rounded-sm bg-accent align-[-2px]" />;
  const done = partial?.complete ?? false;
  return (
    <article className="overflow-hidden rounded-xl border border-accent/40 bg-surface shadow-sm ring-2 ring-accent/15" aria-busy data-streaming={no}>
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <span className="text-[12.5px] font-semibold text-ink">{q.draftN(no)}</span>
        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-ink">✦ {done ? m.checking : m.writing}</span>
      </header>
      {partial ? (
        <div className="bg-white px-6 py-4 font-serif text-[15.5px] leading-snug text-black">
          <p>
            {side(partial.stem)}
            {!partial.options.length && !done && caret}
          </p>
          {partial.statements.length > 0 && (
            <ol className="mt-2 space-y-0.5">
              {partial.statements.map((s, i) => (
                <li key={i}>
                  ({i + 1}) {side(s)}
                </li>
              ))}
            </ol>
          )}
          {partial.options.length > 0 && (
            <ol className="mt-2 grid grid-cols-2 gap-x-8 gap-y-0.5">
              {partial.options.map((o, i) => (
                <li key={i}>
                  {'ABCD'[i]}. {side(o)}
                  {i === partial.options.length - 1 && !done && caret}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <div className="space-y-2 bg-white px-6 py-5" data-placeholder>
          <div className="h-3.5 w-[92%] animate-pulse rounded bg-surface-sunken" />
          <div className="h-3.5 w-[78%] animate-pulse rounded bg-surface-sunken" />
          <div className="mx-auto my-3 h-28 w-56 animate-pulse rounded-lg border border-dashed border-line-strong bg-surface-sunken/60" />
          <div className="h-3.5 w-[40%] animate-pulse rounded bg-surface-sunken" />
        </div>
      )}
    </article>
  );
}
