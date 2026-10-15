'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui';
import type { Messages } from '@/i18n/catalogue';
import { formatSize, SCREENSHOT_ACCEPT, type KeyboardOs, type Screenshot } from '@/feedback/screenshot';
import { FEEDBACK_MESSAGES } from './messages';

/**
 * The feedback dialog's optional screenshot: paste (anywhere in the dialog), drop, or
 * choose a file; one image, shown as a thumbnail with Copy and Remove. The dialog owns
 * the paste and drop listeners and the image itself; this only draws it.
 */
export function ScreenshotField({
  m,
  os,
  screenshot,
  reading,
  dragging,
  onChoose,
  onCopy,
  onRemove,
}: {
  m: Messages<typeof FEEDBACK_MESSAGES>;
  os: KeyboardOs;
  screenshot: Screenshot | undefined;
  reading: boolean;
  /** A file is being dragged over the dialog. */
  dragging: boolean;
  onChoose: (file: File) => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const hint = os === 'mac' ? m.screenshotHintMac : os === 'windows' ? m.screenshotHintWindows : m.screenshotHintOther;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink">
        {m.screenshot} <span className="font-normal text-ink-muted">{m.screenshotOptional}</span>
      </span>

      {screenshot ? (
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- an object URL, not a static asset */}
          <img
            src={screenshot.url}
            alt={m.screenshotAlt}
            className="h-14 w-24 shrink-0 rounded border border-line object-cover object-top"
          />
          <span className="min-w-0 flex-1 truncate text-[12px] text-ink-muted">
            {m.screenshotSize(screenshot.width, screenshot.height, formatSize(screenshot.png.size))}
          </span>
          <Button size="sm" onClick={onCopy}>
            {m.copyScreenshot}
          </Button>
          <Button size="sm" variant="subtle" aria-label={m.removeScreenshotLabel} title={m.removeScreenshotLabel} onClick={onRemove}>
            {m.removeScreenshot}
          </Button>
        </div>
      ) : (
        <div
          className={`flex min-h-14 items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2 transition-colors duration-150 ease-out-soft ${
            dragging ? 'border-accent bg-accent/5' : 'border-line-strong bg-surface-sunken'
          }`}
        >
          <span className="text-[13px] text-ink-muted">
            {reading ? m.screenshotReading : dragging ? m.screenshotDropping : m.screenshotZone}
          </span>
          <Button size="sm" disabled={reading} onClick={() => input.current?.click()}>
            {m.chooseImage}
          </Button>
          <input
            ref={input}
            type="file"
            accept={SCREENSHOT_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onChoose(file);
            }}
          />
        </div>
      )}

      <div className="space-y-0.5 text-[11px] leading-relaxed text-ink-subtle">
        {!screenshot && <p>{hint}</p>}
        <p>{m.screenshotPrivacy}</p>
      </div>
    </div>
  );
}
