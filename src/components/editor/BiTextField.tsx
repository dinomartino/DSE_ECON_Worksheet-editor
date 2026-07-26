'use client';

import { useId, useLayoutEffect, useRef } from 'react';
import { parseRuns, serializeRuns } from '@/model/text';
import type { BiText } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * Bilingual input (§5.2).
 *
 * Which boxes are visible follows the selected language mode: English-only shows
 * just the EN box, 中文-only just the 中文 box, bilingual shows both. Switching mode
 * only changes visibility — the hidden language's content is never cleared, because
 * the value object is always patched rather than replaced.
 *
 * In bilingual mode each box carries a small EN/中文 tag. Without it the two
 * side-by-side textareas are indistinguishable when both happen to be empty, which
 * was a real source of "which box am I in?" confusion.
 */

interface Props {
  label?: string;
  value: BiText;
  onChange: (value: BiText) => void;
  rows?: number;
  placeholderEn?: string;
  placeholderZh?: string;
}

const INPUT_CLASS =
 'block w-full resize-none overflow-hidden rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-1 focus:ring-accent';

/**
 * Grow the textarea to fit its content.
 *
 * The fixed `rows` the fields used before clipped anything longer than a line or
 * two — a stem would show "Study the table below. GDP平減物" and hide the rest,
 * which is unusable for exactly the long bilingual text this app is for.
 */
function useAutoSize(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // The value is fully controlled, so re-measuring whenever it changes covers
  // typing, undo/redo and switching to a different question alike.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return ref;
}

export function BiTextField({
  label,
  value,
  onChange,
  rows = 2,
  placeholderEn = 'English…',
  placeholderZh = '中文…',
}: Props) {
  const id = useId();
  const language = useWorksheetStore((s) => s.mode.language);

  const enText = serializeRuns(value.en);
  const zhText = serializeRuns(value.zh);

  const enRef = useAutoSize(enText);
  const zhRef = useAutoSize(zhText);

  const showEn = language === 'en' || language === 'bilingual';
  const showZh = language === 'zh' || language === 'bilingual';
  const bothVisible = showEn && showZh;
  const halfTranslated = bothVisible && Boolean(enText.trim()) !== Boolean(zhText.trim());

  const tag = (text: string) => (
    <span className="pointer-events-none absolute right-1.5 top-1 select-none text-[9px] font-medium uppercase tracking-wide text-ink-subtle ">
      {text}
    </span>
  );

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center gap-1.5">
          <label
            htmlFor={`${id}-${showEn ? 'en' : 'zh'}`}
            className="text-[11px] font-medium text-ink-muted "
          >
            {label}
          </label>
          {halfTranslated && (
            <span
              className="rounded bg-warn-soft px-1 py-px text-[9px] font-medium text-warn-ink"
              title="One language is missing"
            >
              needs translation
            </span>
          )}
        </div>
      )}
      <div className={bothVisible ? 'grid grid-cols-2 gap-1.5' : ''}>
        {showEn && (
          <div className="relative">
            <textarea
              id={`${id}-en`}
              ref={enRef}
              className={INPUT_CLASS}
              rows={rows}
              lang="en"
              value={enText}
              placeholder={placeholderEn}
              aria-label={label ? `${label} (English)` : 'English'}
              // Patching keeps the hidden language's runs intact (§5.2).
              onChange={(event) => onChange({ ...value, en: parseRuns(event.target.value) })}
            />
            {bothVisible && tag('en')}
          </div>
        )}
        {showZh && (
          <div className="relative">
            <textarea
              id={`${id}-zh`}
              ref={zhRef}
              className={INPUT_CLASS}
              rows={rows}
              lang="zh-HK"
              value={zhText}
              placeholder={placeholderZh}
              aria-label={label ? `${label} (中文)` : '中文'}
              onChange={(event) => onChange({ ...value, zh: parseRuns(event.target.value) })}
            />
            {bothVisible && tag('中')}
          </div>
        )}
      </div>
    </div>
  );
}
