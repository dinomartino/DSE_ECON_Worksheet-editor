'use client';

import { useEffect, useRef } from 'react';
import { useMessages } from '@/i18n/language';
import type { LanguageMode } from '@/model/types';
import { usePastPaperBank } from '@/pastpapers/bank';
import { packName, sourceLabel } from '@/pastpapers/pack';
import { PAST_PAPER_MESSAGES } from './messages';
import type { BrowseEntry } from './usePastPaperBrowse';

/** The words shown before the question is drawn, cut to about three lines. */
const EXCERPT = 260;

/**
 * A question found by the search index (k-0444) whose topic is not downloaded yet: its source
 * and its words from the index, shown at once; its topic is downloaded when the card comes
 * near the viewport, and the drawn question takes the card's place. So a search across the
 * bank downloads only the topics of the questions the teacher scrolls to.
 */
export function PastPaperIndexCard({
  entry,
  topicName,
  language,
}: {
  entry: BrowseEntry;
  topicName: string;
  language: LanguageMode;
}) {
  const m = useMessages(PAST_PAPER_MESSAGES);
  const ref = useRef<HTMLElement>(null);
  const state = usePastPaperBank((s) => s.topics[entry.topicId]);
  const row = entry.row;

  useEffect(() => {
    const element = ref.current;
    const load = () => void usePastPaperBank.getState().topic(entry.topicId);
    if (!element || typeof IntersectionObserver === 'undefined') {
      load();
      return;
    }
    const observer = new IntersectionObserver((seen) => {
      if (seen.some((s) => s.isIntersecting)) {
        load();
        observer.disconnect();
      }
    }, { rootMargin: '400px 0px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [entry.topicId]);

  if (!row) return null;
  const label = packName(sourceLabel(row.source), language);
  const text = packName(row, language);
  const words = text.slice(0, EXCERPT);
  const cut = text.length > EXCERPT;

  return (
    <article ref={ref} className="rounded-xl border border-line bg-surface p-3" data-pastpaper-index-card>
      <div className="mb-2 flex items-center gap-2.5 px-1">
        <input type="checkbox" disabled aria-label={m.pickTitle(label)} className="h-4 w-4" />
        <span className="truncate text-[12.5px] font-medium text-ink">{label}</span>
        <span className="truncate text-[11.5px] text-ink-subtle">{m.inTopic(topicName)}</span>
        <span className="flex-1" />
        {row.pictures > 0 && <span className="shrink-0 text-[11.5px] text-ink-subtle">{m.pictures(row.pictures)}</span>}
      </div>
      <div className="rounded-md bg-surface-sunken px-4 py-3 text-[13px] leading-relaxed text-ink-muted">
        <p>
          {words}
          {cut ? '…' : ''}
        </p>
        <p className="mt-2 text-[11.5px] text-ink-subtle" role="status">
          {state?.state === 'error' ? (
            <>
              {m.topicError}{' '}
              <button type="button" className="cursor-pointer text-accent hover:underline" onClick={() => void usePastPaperBank.getState().topic(entry.topicId)}>
                {m.retry}
              </button>
            </>
          ) : state?.state === 'ready' ? (
            m.notInTopic
          ) : (
            m.showsSoon
          )}
        </p>
      </div>
    </article>
  );
}
