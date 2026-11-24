'use client';

import { useMemo, useState } from 'react';
import { PastPaperSheet } from '@/components/pastpapers/PastPaperSheet';
import { ChatIcon, RefreshIcon, WarningIcon } from '@/components/ui/icons';
import type { Messages } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { createWorksheet } from '@/model/factories';
import type { LanguageMode } from '@/model/types';
import { CHECK_IDS, type Finding } from '@/questionStudio/types';
import { CheckLine } from '../CheckLine';
import { findingText } from '../findings';
import { STUDIO_FINDING_MESSAGES } from '../findings.messages';
import { QUESTION_STUDIO_MESSAGES } from '../messages';
import { CHECK_LABEL, Chip, StateGlyph, toneOf } from '../parts';
import { draftItem, explanationLines, letterOf } from '../studioView';
import { STUDIO_CHAT_MESSAGES } from './chat.messages';
import type { ChatDraft } from './chatTypes';

/** The frame every preview is drawn in (its page and fonts); the words are the draft's. */
const FRAME = createWorksheet();

const small =
  'cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';

/**
 * One AI-made draft on the paper, drawn as it prints (the Past paper card's own preview, so
 * an AI-made diagram shows exactly as it will print). Accept / Reject on its head; the key and
 * why under it; a chip per check that opens what was checked; Harder, Easier, Another and
 * "Ask about this" at its foot; v2 · v1 when it was changed.
 */
export function ChatDraftCard({
  draft,
  language,
  busy,
  working,
  highlight,
  drawing = false,
  onAccept,
  onReject,
  onChange,
  onAsk,
  onRestore,
}: {
  draft: ChatDraft;
  language: LanguageMode;
  busy: boolean;
  working: boolean;
  highlight: boolean;
  /** The AI is drawing this draft's diagram. */
  drawing?: boolean;
  onAccept: () => void;
  onReject: () => void;
  onChange: (how: 'harder' | 'easier' | 'another') => void;
  onAsk: () => void;
  onRestore: (index: number) => void;
}) {
  const m = useMessages(STUDIO_CHAT_MESSAGES);
  const q = useMessages(QUESTION_STUDIO_MESSAGES);
  const f = useMessages(STUDIO_FINDING_MESSAGES);
  const [details, setDetails] = useState(false);
  const { entry, state } = draft;
  const studio = entry.draft;
  const item = useMemo(() => draftItem(entry), [entry]);
  const why = explanationLines(studio.draft, entry.request.sides);
  // A failed check (near-copy, format) is a warning on the card, never a reason to hide it (k-0531).
  const warnings = studio.checks.filter((c) => c.state === 'fail').flatMap((c) => c.findings);
  const warned = warnings.length > 0;
  const accepted = state === 'accepted';
  const rejected = state === 'rejected';
  const added = state === 'added';
  const version = draft.older.length + 1;
  const words = (finding: Finding) => findingText(finding, f);

  return (
    <article
      id={`draft-${draft.id}`}
      data-chat-draft={draft.no}
      data-state={state}
      data-status={studio.status}
      data-warned={warned || undefined}
      aria-busy={working}
      className={`relative scroll-mt-4 overflow-hidden rounded-xl border bg-surface shadow-sm transition-[border-color,box-shadow,opacity] duration-200 ${
        accepted ? 'border-ok-line ring-2 ring-ok-soft' : highlight ? 'border-accent ring-2 ring-accent/30' : 'border-line'
      } ${rejected || added ? 'opacity-60' : ''}`}
    >
      <header className={`flex flex-wrap items-center gap-2 border-b border-line px-3 py-2 ${accepted ? 'bg-ok-soft' : ''}`}>
        <span className="text-[12.5px] font-semibold text-ink">{q.draftN(draft.no)}</span>
        {draft.older.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-line px-1.5 py-0.5 text-[11px] text-ink-muted" aria-label={m.versionsLabel}>
            {m.version(version)}
            {draft.older.map((_, i) => (
              <button key={i} type="button" title={m.backTo(i + 1)} onClick={() => onRestore(i)} disabled={busy} className="cursor-pointer text-accent underline underline-offset-2 disabled:opacity-50">
                {m.version(i + 1)}
              </button>
            ))}
          </span>
        )}
        <Chip tone="ai" title={q.aiMadeTitle}>
          ✦ {q.aiMade}
        </Chip>
        {drawing && <Chip tone="ai">✦ {m.drawing}</Chip>}
        {studio.diagram?.status === 'look' && (
          <span title={studio.diagram.issues.map((i) => i.text).join('\n')}>
            <Chip tone="look">{m.diagramLook}</Chip>
          </span>
        )}
        {warned ? (
          <Chip tone="fail">
            <WarningIcon size={12} /> {warnLabel(warnings, m, f)}
          </Chip>
        ) : (
          <Chip tone={studio.status === 'look' ? 'look' : 'ok'}>{studio.status === 'look' ? q.statusLook : q.statusOk}</Chip>
        )}
        <span className="flex-1" />
        <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink">{q.key(letterOf(studio.draft.answerIndex))}</span>
        {!added && !(busy && draft.id.startsWith('live-')) && (
          <>
            <button
              type="button"
              onClick={onAccept}
              aria-pressed={accepted}
              disabled={busy && working}
              data-accept
              className={`cursor-pointer rounded-lg px-2.5 py-1 text-[12px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                accepted ? 'bg-ok text-white' : 'border border-ok-line bg-surface text-ok hover:bg-ok-soft'
              }`}
            >
              ✓ {accepted ? m.accepted : m.accept}
            </button>
            <button type="button" onClick={onReject} aria-pressed={rejected} data-reject className={small}>
              {rejected ? m.bringBack : `✕ ${m.reject}`}
            </button>
          </>
        )}
        {added && <Chip tone="ok">{m.added}</Chip>}
      </header>

      {!rejected && (
        <>
          {warned && (
            <div role="note" className="mx-3 mt-2.5 rounded-lg border border-danger/40 bg-danger-soft px-3 py-2 text-[12.5px] leading-snug text-danger-ink" data-draft-warning>
              <p className="flex items-center gap-1.5 font-semibold">
                <WarningIcon size={14} /> {m.warnTitle}
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {warnings.map((finding, i) => (
                  <li key={i}>{words(finding)}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="bg-white px-2 pt-1">
            {item ? <PastPaperSheet item={item} doc={FRAME} language={language} compact /> : <p className="px-3 py-3 text-[12.5px] text-ink-muted">{q.noPreview}</p>}
          </div>
          {why.length > 0 && (
            <div className="space-y-0.5 bg-white px-4 pb-3 text-[12.5px] leading-relaxed text-ink-muted">
              {why.map((line, i) => (
                <p key={i}>
                  {i === 0 && <span className="mr-1.5 font-medium text-ink">{q.key(letterOf(studio.draft.answerIndex))}.</span>}
                  {line}
                </p>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5 border-t border-line px-3 py-2" role="group" aria-label={q.checks}>
            {CHECK_IDS.map((id) => {
              const row = studio.checks.find((c) => c.id === id);
              if (!row) return null;
              return (
                <button key={id} type="button" onClick={() => setDetails((v) => !v)} aria-expanded={details} data-check={id} data-state={row.state} className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
                  <Chip tone={toneOf(row.state)}>
                    <StateGlyph state={row.state} />
                    {q[CHECK_LABEL[id]]}
                    {row.value !== undefined && <span className="tabular-nums">{row.value}%</span>}
                  </Chip>
                </button>
              );
            })}
          </div>
          {details && (
            <ul className="mx-3 mb-2 flex flex-col divide-y divide-line rounded-lg border border-line bg-surface-sunken px-3 text-[12.5px]" aria-label={m.checkDetails}>
              {CHECK_IDS.map((id) => {
                const row = studio.checks.find((c) => c.id === id);
                return row ? <CheckLine key={id} row={row} solve={id === 'key' ? studio.solve : undefined} words={words} /> : null;
              })}
            </ul>
          )}
          {!added && (
            <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2.5 pt-0.5">
              <button type="button" className={`${small} inline-flex items-center gap-1`} disabled={busy} title={q.anotherTitle} onClick={() => onChange('another')}>
                <RefreshIcon size={13} /> {q.another}
              </button>
              <button type="button" className={small} disabled={busy} onClick={() => onChange('harder')}>
                {q.harder}
              </button>
              <button type="button" className={small} disabled={busy} onClick={() => onChange('easier')}>
                {q.easier}
              </button>
              <span className="flex-1" />
              <button type="button" className={`${small} inline-flex items-center gap-1`} disabled={busy} title={m.askAboutTitle} onClick={onAsk} data-ask>
                <ChatIcon size={13} /> {m.askAbout}
              </button>
            </div>
          )}
        </>
      )}
      {working && (
        <div role="status" className="absolute inset-0 flex items-center justify-center bg-surface/80 text-[13px] font-medium text-ink">
          {q.working}
        </div>
      )}
    </article>
  );
}

/** The red chip's words: the first failed check, in a few words ("Very close to a past paper question"). */
function warnLabel(warnings: readonly Finding[], m: Messages<typeof STUDIO_CHAT_MESSAGES>, f: Messages<typeof STUDIO_FINDING_MESSAGES>): string {
  const copy = warnings.find((w) => w.id === 'copy.close');
  if (copy) {
    const kind = ({ bank: f.copyKindBank, mine: f.copyKindMine, paper: f.copyKindPaper, example: f.copyKindExample, draft: f.copyKindDraft } as Record<string, string>)[String(copy.params?.with ?? 'bank')] ?? f.copyKindBank;
    return m.warnCopy(kind);
  }
  return m.warnShape;
}
