'use client';

import { useEffect } from 'react';
import { Button, IconButton } from '@/components/ui';
import { CloseIcon } from '@/components/ui/icons';
import { isModalLayerOpen } from '@/components/ui/modalLayer';
import { useMessages } from '@/i18n/language';
import { useWorksheetStore } from '@/store/worksheetStore';
import {
  acceptPasteOffer,
  clearPasteOffer,
  clipboardPicture,
  isPasteOfferStale,
  offerPastedQuestions,
  pastePicture,
  usePasteOffer,
} from './pasteActions';
import { PASTE_OFFER_MESSAGES } from './PasteOfferBar.messages';

/**
 * "This looks like 3 questions · Make these into questions" over the foot of the page, after a
 * paste that reads as questions (k-0201, `pasteActions`). Like Word's Paste Options button it
 * goes with the next edit; ✕ keeps the paste as text.
 *
 * Also the page's paste with no text open: a picture is inserted into the selected question,
 * and words that read as questions are offered as questions. A table cell's own paste and the
 * page's question clip (⌘C on selected questions) keep theirs.
 */
export function PasteOfferBar() {
  const m = useMessages(PASTE_OFFER_MESSAGES);
  const offer = usePasteOffer((s) => s.offer);
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const stale = offer !== undefined && isPasteOfferStale(offer, worksheet);

  // The next edit withdraws the offer, as Word's Paste Options button goes.
  useEffect(() => {
    if (stale) clearPasteOffer();
  }, [stale]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isModalLayerOpen() || !event.clipboardData) return;
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      )
        return;
      const state = useWorksheetStore.getState();
      if (state.readOnly || state.printPreview || state.activeCell) return;
      const text = event.clipboardData.getData('text/plain');
      const html = event.clipboardData.getData('text/html');
      const picture = text.trim() ? undefined : clipboardPicture(event.clipboardData);
      if (picture) {
        event.preventDefault();
        void pastePicture(picture);
        return;
      }
      if (!text.trim() && !html.trim()) return;
      event.preventDefault();
      offerPastedQuestions({ html, text });
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);

  if (!offer || stale) return null;
  const count = offer.batch.builds.length;
  return (
    // Over the foot of the page, above the edit hint and the zoom (`EditHint`'s two layouts),
    // where the format bar at the top of an open text cannot cover it.
    <div
      data-print-hide
      className="@container pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[118px] @min-[30rem]:pb-[60px]"
    >
      <div
        role="status"
        data-paste-offer
        className="pointer-events-auto flex max-w-full animate-slide-up-in flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-surface-raised py-1.5 pl-3.5 pr-1.5 text-[12.5px] text-ink shadow-md"
      >
        <span>{m.found(count)}</span>
        <span className="flex items-center gap-1">
          <Button
            variant="primary"
            size="sm"
            onClick={() => acceptPasteOffer(offer)}
          >
            {m.make(count)}
          </Button>
          <IconButton label={m.keepText} onClick={clearPasteOffer}>
            <CloseIcon size={14} />
          </IconButton>
        </span>
      </div>
    </div>
  );
}
