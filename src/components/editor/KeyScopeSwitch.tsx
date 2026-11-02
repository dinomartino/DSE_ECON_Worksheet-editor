'use client';

import { Segmented } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { worksheetTitle } from '@/storage';
import { KEY_SCOPE_MESSAGES } from './KeyScope.messages';
import { isWholeSet, useSetMembers, useSetPapers } from './setMembers';

/**
 * This paper / Whole set, over the Marking scheme view's sheets, when the open paper is in a
 * set with another paper that has questions (k-0299 step C). Chrome: `data-print-hide`.
 */
export function KeyScopeSwitch() {
  const m = useMessages(KEY_SCOPE_MESSAGES);
  const set = useSetPapers();
  const scope = useSetMembers((s) => s.keyScope);
  const setScope = useSetMembers((s) => s.setKeyScope);
  if (!isWholeSet(set) || !set) return null;
  const whole = scope === 'set';
  return (
    <div data-print-hide data-key-scope className="mx-auto mb-4 flex w-fit max-w-full flex-col items-center gap-1">
      <div className="rounded-lg bg-surface px-1 shadow-sm ring-1 ring-line">
        <Segmented
          label={m.label}
          value={scope}
          onChange={setScope}
          options={[
            { value: 'paper', label: m.thisPaper, title: m.thisPaperTitle },
            { value: 'set', label: m.wholeSet, title: m.wholeSetTitle(set.name) },
          ]}
        />
      </div>
      {whole && <p className="text-center text-[11.5px] text-ink-subtle">{m.readOnly}</p>}
      {whole && set.blank.length > 0 && (
        <p className="text-center text-[11.5px] text-ink-subtle">{m.leftOut(set.blank.map(worksheetTitle).join(', '))}</p>
      )}
    </div>
  );
}

/** The papers the Whole set key shows, or `undefined` when the view shows this paper's. */
export function useWholeSetKey() {
  const set = useSetPapers();
  const scope = useSetMembers((s) => s.keyScope);
  return scope === 'set' && isWholeSet(set) ? set : undefined;
}
