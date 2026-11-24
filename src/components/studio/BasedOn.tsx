'use client';

import { useMessages } from '@/i18n/language';
import type { StudioRequest } from '@/questionStudio/types';
import { REFERENCE_PICKER_MESSAGES } from './picker.messages';

/** The references the teacher picked for a request, by name (the studio's own style examples left out). */
export const basedOnLabels = (request: Pick<StudioRequest, 'examples'>): string[] => request.examples.filter((e) => !e.auto).map((e) => e.label);

/**
 * "Based on Mock 2026 · Q4" on a draft (k-0529): which picked question (a past paper or the
 * teacher's own) it was written like. Nothing when the request had no picked reference.
 */
export function BasedOn({ request }: { request: Pick<StudioRequest, 'examples'> }) {
  const m = useMessages(REFERENCE_PICKER_MESSAGES);
  const labels = basedOnLabels(request);
  if (labels.length === 0) return null;
  const text = m.basedOn(labels.join(', '));
  return (
    <span title={text} className="inline-flex min-w-0 max-w-full items-center truncate rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-muted" data-draft-based-on>
      {text}
    </span>
  );
}
