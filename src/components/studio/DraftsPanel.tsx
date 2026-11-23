'use client';

import { useMemo, useState } from 'react';
import { PastPaperSheet } from '@/components/pastpapers/PastPaperSheet';
import { useMessages } from '@/i18n/language';
import { createWorksheet } from '@/model/factories';
import type { LanguageMode } from '@/model/types';
import type { Refinement } from '@/questionStudio/types';
import type { SheetDraft } from '@/questionStudio/session';
import { useStudio } from '@/questionStudio/live';
import { QUESTION_STUDIO_MESSAGES } from './messages';
import { CHECK_LABEL, Chip, StateGlyph, stateWord, toneOf } from './parts';
import { draftItem, explanationLines, letterOf, partition, stemLines } from './studioView';
import { CHECK_IDS } from '@/questionStudio/types';

/** The frame every preview is drawn in: its page, fonts and size (the question's own words are the draft's). */
const FRAME = createWorksheet();

const ghost =
  'cursor-pointer rounded-md border border-line bg-surface px-2.5 py-1 text-[12px] text-ink hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The middle column: the drafts as they print, newest batch first. Each card carries the
 * key and why, a chip per check (clicking one shows its words in the checks column) and the
 * changes the teacher can ask: Another, Harder, Easier, Change…, Discard. A draft that
 * failed a hard check is set apart below with the reason, and can never be ticked.
 */
export function DraftsPanel({ language }: { language: LanguageMode }) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const entries = useStudio((s) => s.entries);
  const picked = useStudio((s) => s.picked);
  const focus = useStudio((s) => s.focus);
  const phase = useStudio((s) => s.phase);
  const { toggle, setFocus, refine, discard, clearDrafts } = useStudio.getState();
  const { standing, leftOut } = useMemo(() => partition(entries), [entries]);
  const busy = phase.kind === 'running';
  const target = phase.kind === 'running' ? phase.target : undefined;

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-[520px] px-6 py-16 text-center text-[13px] leading-relaxed text-ink-muted" data-studio-empty>
        {m.draftsEmpty}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[860px] flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-[15px] font-semibold text-ink">{m.drafts}</h2>
        <span className="text-[12px] tabular-nums text-ink-subtle" role="status">
          {m.draftCount(standing.length)}
        </span>
        <span className="flex-1" />
        <button type="button" onClick={clearDrafts} disabled={busy} className="cursor-pointer text-[12.5px] text-ink-muted hover:text-ink hover:underline disabled:opacity-50">
          {m.clearDrafts}
        </button>
      </div>

      {standing.map((entry, index) => (
        <DraftCard
          key={entry.draft.id}
          entry={entry}
          number={index + 1}
          picked={picked.includes(entry.draft.id)}
          focused={focus === entry.draft.id}
          busy={busy}
          working={target === entry.draft.id}
          language={language}
          onToggle={() => toggle(entry.draft.id)}
          onFocus={() => setFocus(entry.draft.id)}
          onRefine={(refinement) => void refine(entry.draft.id, refinement)}
          onDiscard={() => discard(entry.draft.id)}
        />
      ))}

      {leftOut.length > 0 && (
        <details className="rounded-xl border border-line bg-surface px-4 py-3" data-studio-left-out>
          <summary className="cursor-pointer select-none text-[13px] font-medium text-ink">{m.leftOut(leftOut.length)}</summary>
          <p className="mt-2 text-[12px] text-ink-muted">{m.leftOutNote}</p>
          <ul className="mt-3 flex flex-col gap-3">
            {leftOut.map((entry) => (
              <LeftOut key={entry.draft.id} entry={entry} onDiscard={() => discard(entry.draft.id)} onFocus={() => setFocus(entry.draft.id)} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function DraftCard({
  entry,
  number,
  picked,
  focused,
  busy,
  working,
  language,
  onToggle,
  onFocus,
  onRefine,
  onDiscard,
}: {
  entry: SheetDraft;
  number: number;
  picked: boolean;
  focused: boolean;
  busy: boolean;
  working: boolean;
  language: LanguageMode;
  onToggle: () => void;
  onFocus: () => void;
  onRefine: (refinement: Refinement) => void;
  onDiscard: () => void;
}) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const { draft } = entry;
  const [changing, setChanging] = useState(false);
  const [text, setText] = useState('');
  const item = useMemo(() => draftItem(entry), [entry]);
  const why = explanationLines(draft.draft, entry.request.sides);
  const look = draft.status === 'look';

  return (
    <article
      data-studio-draft={draft.id}
      aria-busy={working}
      className={`relative rounded-xl border bg-surface p-3 transition-colors duration-150 ${
        picked ? 'border-accent ring-2 ring-accent/25' : focused ? 'border-line-strong' : 'border-line'
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <label className="flex cursor-pointer items-center gap-2.5">
          <input type="checkbox" checked={picked} onChange={onToggle} aria-label={m.pickDraft(number)} className="h-4 w-4 accent-[var(--color-accent)]" />
          <span className="text-[12.5px] font-medium text-ink">{m.draftN(number)}</span>
        </label>
        <Chip tone="ai" title={m.aiMadeTitle}>
          {m.aiMade}
        </Chip>
        <Chip tone={look ? 'look' : 'ok'}>{look ? m.statusLook : m.statusOk}</Chip>
        <span className="flex-1" />
        <span className="shrink-0 rounded-md bg-surface-sunken px-2 py-0.5 text-[11.5px] font-medium text-ink">{m.key(letterOf(draft.draft.answerIndex))}</span>
      </div>

      <div className="cursor-pointer" onClick={onFocus}>
        {item ? <PastPaperSheet item={item} doc={FRAME} language={language} compact /> : <p className="px-1 py-3 text-[12.5px] text-ink-muted">{m.noPreview}</p>}
      </div>

      {why.length > 0 && (
        <div className="mt-2.5 space-y-0.5 px-1 text-[12.5px] leading-relaxed text-ink-muted">
          {why.map((line, i) => (
            <p key={i}>
              {i === 0 && <span className="mr-1.5 font-medium text-ink">{m.why}</span>}
              {line}
            </p>
          ))}
        </div>
      )}
      {draft.angle && <p className="mt-1 px-1 text-[11.5px] text-ink-subtle">{m.angle(draft.angle)}</p>}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-1" role="group" aria-label={m.checks}>
        {CHECK_IDS.map((id) => {
          const row = draft.checks.find((c) => c.id === id);
          if (!row) return null;
          const label = m[CHECK_LABEL[id]];
          return (
            <button
              key={id}
              type="button"
              onClick={onFocus}
              title={`${label}: ${stateWord(m, row.state)}`}
              data-check={id}
              data-state={row.state}
              className="cursor-pointer rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Chip tone={toneOf(row.state)}>
                <StateGlyph state={row.state} />
                {label}
                {row.value !== undefined && <span className="tabular-nums">{row.value}%</span>}
              </Chip>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 px-1">
        <button type="button" className={ghost} disabled={busy} title={m.anotherTitle} onClick={() => onRefine({ kind: 'another' })}>
          {m.another}
        </button>
        <button type="button" className={ghost} disabled={busy} onClick={() => onRefine({ kind: 'harder' })}>
          {m.harder}
        </button>
        <button type="button" className={ghost} disabled={busy} onClick={() => onRefine({ kind: 'easier' })}>
          {m.easier}
        </button>
        <button type="button" className={ghost} disabled={busy} aria-expanded={changing} onClick={() => setChanging((open) => !open)}>
          {m.change}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onDiscard} disabled={busy} className="cursor-pointer text-[12px] text-ink-muted hover:text-ink hover:underline disabled:opacity-50">
          {m.discard}
        </button>
      </div>

      {changing && (
        <form
          className="mt-2 flex items-center gap-2 px-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim() || busy) return;
            onRefine({ kind: 'change', text });
            setText('');
            setChanging(false);
          }}
        >
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={400}
            aria-label={m.changeLabel}
            placeholder={m.changePlaceholder}
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 text-[12.5px] text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <button type="submit" disabled={busy || !text.trim()} className="cursor-pointer rounded-lg bg-cta px-3 py-1.5 text-[12.5px] font-medium text-on-cta hover:bg-cta-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50">
            {m.changeApply}
          </button>
        </form>
      )}

      {working && (
        <div role="status" className="absolute inset-0 flex items-center justify-center rounded-xl bg-surface/80 text-[13px] font-medium text-ink">
          {m.working}
        </div>
      )}
    </article>
  );
}

function LeftOut({ entry, onDiscard, onFocus }: { entry: SheetDraft; onDiscard: () => void; onFocus: () => void }) {
  const m = useMessages(QUESTION_STUDIO_MESSAGES);
  const lines = stemLines(entry.draft.draft, entry.request.sides);
  return (
    <li className="rounded-lg border border-line bg-surface-sunken px-3 py-2.5" data-studio-draft={entry.draft.id} data-left-out>
      <p className="text-[12.5px] text-ink">{lines[0] ?? ''}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <button type="button" onClick={onFocus} className="cursor-pointer text-[12px] text-accent hover:underline">
          {m.checks}
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onDiscard} className="cursor-pointer text-[12px] text-ink-muted hover:text-ink hover:underline">
          {m.discard}
        </button>
      </div>
    </li>
  );
}
