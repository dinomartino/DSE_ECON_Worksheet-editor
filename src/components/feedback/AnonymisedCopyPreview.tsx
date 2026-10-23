'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { Dialog, NoticeInsetSpacer } from '@/components/ui/Dialog';
import { Preview } from '@/components/preview/Preview';
import type { Messages } from '@/i18n/catalogue';
import { formatSize } from '@/feedback/screenshot';
import { GITHUB_FILE_LIMIT, type AnonymisedCopy } from '@/feedback/anonymisedCopy';
import type { OutputMode } from '@/model/types';
import { FEEDBACK_MESSAGES } from './messages';

/**
 * The anonymised copy, page by page, before anything is saved (k-0180): the app's own
 * paginator (`Preview`, measure-only and inert, under `.paper-view`'s print rules), on the
 * document parsed back from the exact text Save writes. Save this copy or Cancel; until
 * then nothing has left memory.
 */
export function AnonymisedCopyPreview({
  m,
  copy,
  mode,
  noticeScope,
  onSave,
  onCancel,
}: {
  m: Messages<typeof FEEDBACK_MESSAGES>;
  copy: AnonymisedCopy;
  /** The editor's language; the teacher's copy, so every answer in the file shows. */
  mode: OutputMode;
  /** The report dialog's notices, so a failed save shows here. */
  noticeScope?: string;
  onSave: () => Promise<void>;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  /*
   * The pages mount once the dialog has finished its entrance. The paginator measures its
   * probe in screen pixels, and a panel still scaling in reads every block a few percent
   * short; a transform ends without a resize, so nothing would ever measure again and the
   * sheets would pack looser than the file prints.
   */
  const frameRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const panel = frameRef.current?.closest<HTMLElement>('[role="dialog"]');
    const running = panel?.getAnimations?.() ?? [];
    let live = true;
    void Promise.allSettled(running.map((animation) => animation.finished)).then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  const tooLarge = copy.bytes > GITHUB_FILE_LIMIT;

  const save = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={m.previewTitle}
      description={m.previewKeeps}
      size="large"
      scrollBody={false}
      noticeScope={noticeScope}
      onClose={onCancel}
      footer={
        <>
          <span className={`mr-auto truncate text-[12px] ${tooLarge ? 'text-warn-ink' : 'text-ink-muted'}`}>
            {m.previewFile(copy.fileName, formatSize(copy.bytes))}
            {tooLarge ? ` ${m.previewTooLarge}` : ''}
          </span>
          <Button variant="subtle" onClick={onCancel}>
            {m.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={saving}>
            {m.saveCopy}
          </Button>
        </>
      }
    >
      <div
        ref={frameRef}
        data-anonymised-preview
        className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-surface-sunken px-4 py-6"
      >
        {ready ? (
          <div className="paper-view" inert>
            <Preview worksheet={copy.worksheet} mode={mode} measureOnly />
          </div>
        ) : (
          <p className="py-10 text-center text-[13px] text-ink-muted">{m.previewLaying}</p>
        )}
        <NoticeInsetSpacer />
      </div>
    </Dialog>
  );
}
