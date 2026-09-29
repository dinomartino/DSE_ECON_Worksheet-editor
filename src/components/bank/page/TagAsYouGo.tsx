'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui';
import { sourceLabel } from '@/components/bank/BankRow';
import type { BankRow } from '@/library/types';
import { topicLabel } from '@/model/topics';
import type { LanguageMode } from '@/model/types';
import { suggestionLabel } from './bankScreen';
import { PaperPreview, SHEET_MAX_WIDTH } from './PaperPreview';
import { shownLanguage } from './ReviewPage';
import { useOwningDocument } from './useOwningDocument';

/**
 * Level 3: the untagged questions one at a time. The question large, then up to five
 * suggested topics and "… All topics" as six numbered keys; Enter saves and the next
 * question appears. Saving writes the owning documents directly, which is safe only
 * because no editor is mounted on this screen (`src/library/tagWrites.ts`).
 */
export function TagAsYouGo({
  row,
  position,
  left,
  suggestions,
  chosen,
  language,
  busy,
  onToggle,
  onAllTopics,
  onSave,
  onStep,
  onDone,
  onOpen,
}: {
  /** The question on screen; absent when none are left. */
  row: BankRow | undefined;
  /** Its index in the untagged list. */
  position: number;
  left: number;
  suggestions: string[];
  chosen: ReadonlySet<string>;
  language: LanguageMode;
  busy: boolean;
  onToggle: (code: string) => void;
  onAllTopics: () => void;
  onSave: () => void;
  onStep: (delta: number) => void;
  onDone: () => void;
  /** Open the question where it sits in its worksheet. */
  onOpen: () => void;
}) {
  const { worksheet, failed } = useOwningDocument(row);
  const scrollRef = useRef<HTMLDivElement>(null);
  const key = row ? `${row.docId}/${row.questionId}` : '';
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [key]);

  if (!row) {
    return (
      <div className="flex min-h-0 flex-1 items-start justify-center bg-surface px-8 py-20">
        <div className="max-w-md text-center">
          <p className="font-display text-[26px] font-normal leading-tight text-ink">Every question has a topic.</p>
          <p className="mt-2 text-[13px] text-ink-muted">New questions you write appear here until they are tagged.</p>
          <Button className="mt-5" onClick={onDone}>
            Back to topics
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-[var(--chrome-sunken)]">
      <div className="px-4 pt-[22px]">
        <div className="mx-auto flex items-start justify-center gap-3" style={{ maxWidth: SHEET_MAX_WIDTH + 2 * 46 }}>
          <Nav label="Previous question (skip back)" disabled={position <= 0} onClick={() => onStep(-1)}>
            ‹
          </Nav>
          <div className="min-w-0 flex-1" style={{ maxWidth: SHEET_MAX_WIDTH }}>
            <PaperPreview
              worksheet={worksheet}
              questionId={row.questionId}
              language={shownLanguage(row, language)}
              version="teacher"
              failed={failed}
            />
          </div>
          <Nav label="Next question (skip)" disabled={position >= left - 1} onClick={() => onStep(1)}>
            ›
          </Nav>
        </div>
      </div>

      <div className="mx-auto grid gap-3 px-[22px] pb-8 pt-4" style={{ maxWidth: SHEET_MAX_WIDTH + 44 }}>
        <div className="flex min-w-0 items-center gap-3">
          <p className="min-w-0 truncate text-[12.5px] tabular-nums text-ink-muted" title={sourceLabel(row)}>
            <span className="text-ink-subtle">Lives in</span> {sourceLabel(row)}
          </p>
          <Button size="sm" onClick={onOpen} title="Open this question in its worksheet (O)" className="shrink-0">
            Open in worksheet
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="group" aria-label="Topics for this question">
          {suggestions.map((code, index) => {
            const { code: coarse, name } = suggestionLabel(code);
            const on = chosen.has(code);
            return (
              <button
                key={code}
                type="button"
                data-tag-key
                aria-pressed={on}
                title={`${code} · ${topicLabel(code, 'en')} ${topicLabel(code, 'zh')}`}
                onClick={() => onToggle(code)}
                className={`relative grid min-w-0 cursor-pointer content-start rounded-[7px] border px-2 py-1.5 text-left text-[12px] transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  on ? 'border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]' : 'border-line-strong bg-surface-raised hover:border-ink-subtle'
                }`}
              >
                <span className="absolute right-1.5 top-1 text-[10.5px] tabular-nums text-ink-subtle">{index + 1}</span>
                <b className="text-[13px] font-semibold text-ink">{coarse}</b>
                <small className="line-clamp-2 text-[12px] leading-snug text-ink-muted">{name}</small>
              </button>
            );
          })}
          <button
            type="button"
            onClick={onAllTopics}
            className="relative grid min-w-0 cursor-pointer content-start rounded-[7px] border border-line-strong bg-surface-raised px-2 py-1.5 text-left text-[12px] transition-colors duration-150 ease-out-soft hover:border-ink-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <span className="absolute right-1.5 top-1 text-[10.5px] tabular-nums text-ink-subtle">{suggestions.length + 1}</span>
            <b className="text-[13px] font-semibold text-ink">…</b>
            <small className="text-[12px] leading-snug text-ink-muted">All topics</small>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-[12.5px] text-ink-muted">
            {suggestions.length > 0
              ? `Suggestions come from topics used on the same worksheet, then your most used. Press 1 to ${suggestions.length + 1} or click; Enter saves and moves on.`
              : 'Nothing to suggest yet: choose from All topics. Enter saves and moves on.'}
          </p>
          <Button variant="primary" size="sm" disabled={busy || chosen.size === 0} onClick={onSave} data-tag-save>
            Save and next
          </Button>
        </div>
      </div>
    </div>
  );
}

function Nav({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="sticky top-[120px] mt-[40px] grid h-[30px] w-[30px] shrink-0 cursor-pointer place-items-center rounded-full border border-line-strong bg-surface text-[15px] leading-none text-ink transition-[background-color,opacity] duration-150 ease-out-soft hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-35"
    >
      {children}
    </button>
  );
}
