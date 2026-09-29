'use client';

import { useEffect, useRef } from 'react';
import { useAiRun } from '@/assist/runStore';
import { BarButton } from '@/components/ai/AiBar';
import { useWorksheetStore } from '@/store/worksheetStore';
import { useBankSession } from './bankSession';

/**
 * What 題庫 just inserted, reviewed the way ✦ AI's inserts are: the copies highlighted on
 * the page, and a bar floating over the page column with ‹ › through them, Undo (while the
 * insert is still the latest edit) and Done. No confirm step before, so the review is after.
 */

export const NEW_ATTR = 'data-bank-new';
export const CURRENT_ATTR = 'data-bank-current';

const questionSelector = (id: string) => `#print-root [data-question-id="${CSS.escape(id)}"]`;

function clearMarks(): void {
  for (const el of document.querySelectorAll(`[${NEW_ATTR}]`)) {
    el.removeAttribute(NEW_ATTR);
    el.removeAttribute(CURRENT_ATTR);
  }
}

/** Marks the copies (every slice of a question split across sheets) while `ids` is set. */
function useQuestionMarks(ids: readonly string[] | undefined, current: string | undefined): void {
  useEffect(() => {
    if (!ids?.length) return;
    let frame = 0;
    const paint = () => {
      frame = 0;
      clearMarks();
      for (const id of ids) {
        for (const el of document.querySelectorAll(questionSelector(id))) {
          el.setAttribute(NEW_ATTR, '');
          if (id === current) el.setAttribute(CURRENT_ATTR, '');
        }
      }
    };
    paint();
    // Attributes are not observed, so painting never re-triggers itself.
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(paint);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      clearMarks();
    };
  }, [ids, current]);
}

function reveal(id: string | undefined): void {
  if (id) document.querySelector(questionSelector(id))?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function BankReviewBar() {
  const review = useBankSession((s) => s.review);
  // Re-render on every edit: Undo hides once its commit is no longer the latest.
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const live = review?.undo.live() ?? false;

  // A review belongs to the document it inserted into.
  const docId = useRef(worksheet.id);
  useEffect(() => {
    if (docId.current === worksheet.id) return;
    docId.current = worksheet.id;
    useBankSession.getState().dismiss();
  }, [worksheet.id]);

  // One review bar at a time: a finished ✦ AI review gives way to this one.
  useEffect(() => {
    if (review && useAiRun.getState().phase.kind === 'review') useAiRun.getState().dismiss();
  }, [review]);

  // Undone from anywhere (⌘Z, the toolbar): the copies are gone, so is their review.
  const present = review ? review.questionIds.filter((id) => worksheet.questions.some((q) => q.id === id)) : [];
  const gone = review !== null && present.length === 0;
  useEffect(() => {
    if (gone) useBankSession.getState().dismiss();
  }, [gone]);

  const current = review?.questionIds[review.index];
  useQuestionMarks(review?.questionIds, current);

  if (!review || gone) return null;
  const count = review.questionIds.length;
  const session = useBankSession.getState();
  const step = (by: 1 | -1) => {
    session.walk(by);
    const next = useBankSession.getState().review;
    reveal(next?.questionIds[next.index]);
  };

  return (
    <div data-print-hide className="pointer-events-none fixed bottom-16 left-[76px] right-[400px] z-[45] flex justify-center px-4">
      <div
        role="status"
        aria-label="題庫"
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.stopPropagation();
          session.dismiss();
        }}
        className="pointer-events-auto flex max-w-full animate-slide-up-in flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-cta py-1.5 pl-3.5 pr-1.5 text-[13px] text-on-cta shadow-2xl"
      >
        <span className="min-w-0 max-w-[28rem] truncate" title={review.summary}>
          {review.summary}
        </span>
        {count > 1 && (
          <span className="flex shrink-0 items-center">
            <BarButton aria-label="Previous" onClick={() => step(-1)}>
              ‹
            </BarButton>
            <span className="text-[11px] tabular-nums text-on-cta/70">
              {review.index + 1} / {count}
            </span>
            <BarButton aria-label="Next" onClick={() => step(1)}>
              ›
            </BarButton>
          </span>
        )}
        {live && <BarButton onClick={session.undo}>Undo</BarButton>}
        <BarButton primary onClick={session.dismiss}>
          Done
        </BarButton>
      </div>
    </div>
  );
}
