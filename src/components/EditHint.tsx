'use client';

import { IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { useMessages, useUiLanguage } from '@/i18n/language';
import { EDITOR_APP_MESSAGES } from './EditorApp.messages';

/**
 * The hint's two layouts, by the canvas column's width (a container query, so an open page
 * rail or Split View counts, not the window). From `HINT_SIDE_BY_SIDE` up it shares the zoom
 * control's line (`Preview`, floating 16px inside the column's bottom-right): it centres while
 * it fits, else sits left of the zoom, and the last column keeps the zoom's width clear;
 * `pb-[13px]` puts it on the zoom's centre line. Below that (an iPad in portrait leaves the page
 * about 190px) the two cannot share a line, so the hint stands right-aligned just above the
 * zoom — 16px from the bottom, the zoom's 38px, then 8px — one phrase per line. A phrase is
 * never broken: where the column is narrower than the pill (Split View can leave it 50px) the
 * pill runs left over the page rail rather than standing as a one-word tower.
 */
export function EditHint({ onDismiss }: { onDismiss: () => void }) {
  const m = useMessages(EDITOR_APP_MESSAGES);
  const bilingual = useUiLanguage() === 'en';
  return (
    <div data-print-hide className="@container pointer-events-none absolute inset-x-0 bottom-0 z-30">
      <div className="flex justify-end px-4 pb-[62px] @min-[30rem]:grid @min-[30rem]:grid-cols-[minmax(0,1fr)_auto_minmax(136px,1fr)] @min-[30rem]:items-center @min-[30rem]:pb-[13px]">
        <div
          data-edit-hint
          className="pointer-events-auto col-start-2 flex min-w-0 shrink-0 animate-slide-up-in items-center gap-2 rounded-lg border border-line bg-surface-raised py-1.5 pl-3.5 pr-1.5 text-[12px] text-ink-muted shadow-md"
        >
          {/* One phrase per language, each unbreakable: on the zoom's line, at most two lines
              even beside an open page rail at 1024 wide (a 228px pill), one line where there
              is room; above the zoom, always one phrase per line. */}
          <span className="flex flex-col @min-[30rem]:flex-row @min-[30rem]:flex-wrap @min-[30rem]:gap-x-2">
            <span className="whitespace-nowrap">{m.hint}</span>
            {bilingual && <span className="whitespace-nowrap text-ink-subtle">{EDITOR_APP_MESSAGES.hint.zh}</span>}
          </span>
          <IconButton label={m.dismissHint} onClick={onDismiss}>
            <CloseIcon size={14} />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
