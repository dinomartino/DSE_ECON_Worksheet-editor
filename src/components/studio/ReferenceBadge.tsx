'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CloseIcon, PastPaperIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import type { SourceQuestion } from '@/questionStudio/types';
import { useDismiss } from './dismiss';
import { REFERENCE_PICKER_MESSAGES } from './picker.messages';
import { usePrintedReference } from './referenceItem';
import { ReferenceSheet } from './ReferenceSheet';

const GAP = 6;
const EDGE = 12;
const WIDTH = 460;

/** Where the preview sits: above the badge when there is more room there (the composer), else below. */
export function previewPlacement(rect: Pick<DOMRect, 'top' | 'bottom' | 'left'>, view: { width: number; height: number }): CSSProperties {
  const width = Math.min(WIDTH, view.width - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(rect.left, view.width - width - EDGE));
  const above = rect.top > view.height - rect.bottom;
  return above
    ? { position: 'fixed', left, width, bottom: view.height - rect.top + GAP, maxHeight: rect.top - GAP - EDGE }
    : { position: 'fixed', left, width, top: rect.bottom + GAP, maxHeight: view.height - rect.bottom - GAP - EDGE };
}

/**
 * A reference's badge (k-0533, u-9uf8): its name is a button that opens a preview of the
 * question (stem, options, answer when known, diagram or table, its source) in the picker's
 * own card, so a teacher who forgot what they picked can look. Closes on a press outside, Esc
 * (focus back to the badge) or focus leaving (`useDismiss`, k-0528). `onRemove` adds the ✕.
 * Used by the composer's chips and by the reference lines of past requests.
 */
export function ReferenceBadge({ source, language, onRemove, removeLabel, tone = 'chip' }: { source: SourceQuestion; language: LanguageMode; onRemove?: () => void; removeLabel?: string; tone?: 'chip' | 'quiet' }) {
  const m = useMessages(REFERENCE_PICKER_MESSAGES);
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>();
  useDismiss(open, () => setOpen(false), [pop, button], button);
  const printed = usePrintedReference(source, open);

  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const place = () => button.current && setStyle(previewPlacement(button.current.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight }));
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  const chip = tone === 'chip';
  return (
    <span
      className={
        chip
          ? 'inline-flex max-w-full items-center gap-0.5 rounded-md border border-accent/40 bg-accent-soft/60 py-0.5 pl-1 pr-0.5 text-[11.5px] text-ink hover:border-accent'
          : 'inline-flex max-w-full items-center text-[11.5px] text-ink-muted'
      }
      data-ref-chip={chip ? source.id : undefined}
      data-ref-line={chip ? undefined : source.id}
    >
      <button
        ref={button}
        type="button"
        title={m.viewQuestion}
        aria-label={m.viewQuestionOf(source.label)}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex min-w-0 cursor-pointer items-center gap-1 rounded px-0.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${chip ? 'hover:text-accent-ink' : 'underline decoration-dotted underline-offset-2 hover:text-ink'}`}
        data-ref-view={source.id}
      >
        <PastPaperIcon size={12} />
        <span className="truncate">{source.label}</span>
        {chip && source.hasFigure && <span className="shrink-0 text-ink-muted"> · {m.withDiagram}</span>}
      </button>
      {onRemove && (
        <button type="button" aria-label={removeLabel} onClick={onRemove} className="inline-flex cursor-pointer items-center rounded px-0.5 text-ink-subtle hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          <CloseIcon size={12} />
        </button>
      )}
      {open && style && (
        <div
          ref={pop}
          role="dialog"
          aria-label={m.cardLabel(source.label)}
          style={style}
          className="z-50 flex flex-col overflow-hidden rounded-xl border border-line bg-surface text-ink shadow-2xl"
          data-print-hide
          data-reference-preview={source.id}
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink-muted">{m.yourReference}</span>
            <button type="button" aria-label={m.close} onClick={() => setOpen(false)} className="inline-flex h-6 w-6 cursor-pointer items-center justify-center rounded text-ink-muted hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <CloseIcon size={14} />
            </button>
          </div>
          <div className="scroll-slim min-h-0 overflow-y-auto bg-desk p-3">
            {printed === undefined ? (
              <p className="text-[12.5px] text-ink-muted" role="status">
                {m.previewLoading}
              </p>
            ) : (
              <ReferenceSheet reference={source} item={printed?.item} doc={printed?.doc} language={language} />
            )}
          </div>
        </div>
      )}
    </span>
  );
}
