'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { ReviewItem } from '@/assist/types';
import { Button, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { useMessages } from '@/i18n/language';
import { AI_UI_MESSAGES } from './messages';
import { pageTextFor } from './pageMarks';

const TONE_LABEL = {
  inserted: 'toneInserted',
  look: 'toneLook',
  failed: 'toneFailed',
  finding: 'toneFinding',
} as const;
const TONE_CLASS: Record<ReviewItem['tone'], string> = {
  inserted: 'text-accent-ink',
  look: 'text-warn-ink',
  failed: 'text-danger-ink',
  finding: 'text-warn-ink',
};

const GAP = 8;
/** Space the run bar keeps at the bottom of the viewport. */
const BAR_CLEARANCE = 96;

/** Below the marked text, or above it near the bottom; above the bar when there is none.
 *  Positioned imperatively: it follows every scroll without a re-render. */
function useAnchor(targetKey: string | undefined, card: React.RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const place = () => {
      const node = card.current;
      if (!node) return;
      const el = targetKey ? pageTextFor(targetKey) : null;
      if (!el) {
        Object.assign(node.style, { left: '50%', top: '', bottom: `${BAR_CLEARANCE - GAP}px`, transform: 'translateX(-50%)' });
        return;
      }
      // Layout size: the pop-in's scale would shrink a client rect.
      const box = { width: node.offsetWidth, height: node.offsetHeight };
      const rect = el.getBoundingClientRect();
      const below = rect.bottom + GAP;
      const top = below + box.height > window.innerHeight - BAR_CLEARANCE ? rect.top - GAP - box.height : below;
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - box.width - 8);
      Object.assign(node.style, { left: `${left}px`, top: `${Math.max(8, top)}px`, bottom: '', transform: '' });
    };
    place();
    // The page may still be switching language or scrolling to the text.
    const frame = requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [targetKey, card]);
}

/**
 * One reviewed item, next to its text on the page: where, the source, the notes, its one
 * action (which commits once) and ‹ ›. With no text to sit by, it sits above the bar.
 */
export function ItemCard({
  item,
  position,
  onPrev,
  onNext,
  onClose,
}: {
  item: ReviewItem;
  /** "3 / 12"; absent with a single item. */
  position?: string;
  onPrev(): void;
  onNext(): void;
  onClose(): void;
}) {
  const m = useMessages(AI_UI_MESSAGES);
  const ref = useRef<HTMLDivElement>(null);
  useAnchor(item.targetKey, ref);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const acted = done.has(item.id);
  return (
    <div
      ref={ref}
      data-print-hide
      role="dialog"
      aria-label={item.where || m[TONE_LABEL[item.tone]]}
      className="fixed z-[45] w-72 animate-pop-in rounded-xl border border-line bg-surface-raised p-3 text-[13px] text-ink shadow-xl"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className={`text-[11px] font-semibold uppercase tracking-wide ${TONE_CLASS[item.tone]}`}>{m[TONE_LABEL[item.tone]]}</div>
          {item.where && <div className="truncate font-medium">{item.where}</div>}
        </div>
        <IconButton label={m.close} onClick={onClose}>
          <CloseIcon size={14} />
        </IconButton>
      </div>
      {item.source && <p className="mt-1.5 line-clamp-3 text-xs text-ink-muted">{item.source}</p>}
      {item.notes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5">
          {item.notes.map((note, i) => (
            <li key={i} className="text-xs text-ink" lang="zh-HK">
              {note}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2.5 flex items-center gap-1">
        {item.action && (
          <Button
            size="sm"
            disabled={acted}
            onClick={() => {
              item.action?.run();
              setDone((prev) => new Set(prev).add(item.id));
            }}
          >
            {acted ? m.done : item.action.label}
          </Button>
        )}
        <span className="flex-1" />
        {position && (
          <>
            <IconButton label={m.previous} onClick={onPrev}>‹</IconButton>
            <span className="text-xs tabular-nums text-ink-subtle">{position}</span>
            <IconButton label={m.next} onClick={onNext}>›</IconButton>
          </>
        )}
      </div>
    </div>
  );
}
