'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { LanguageMode, Worksheet } from '@/model/types';
import type { PastPaperItem } from '@/pastpapers/pack';
import { pastPaperPreviewHtml } from './pastPaperPreview';

/** The smallest the paper is drawn; narrower cards reflow instead (as the 題庫 preview). */
const MIN_SCALE = 0.72;

/** The white paper's side padding (each side), compact or not. */
const padX = (compact: boolean) => (compact ? 14 : 28);

/**
 * The widest the sheet is worth drawing: the printed page's text column plus its padding.
 * Wider, the paper never grows (it keeps the page's line breaks), so a card capped here has
 * no empty band on the right (k-0546); narrower, it scales down, then reflows.
 */
export function pastPaperSheetWidth(doc: Worksheet, compact = false): number {
  return Math.ceil(contentWidth(pageSetupOf(doc)) / 15) + 2 * padX(compact);
}

/**
 * One past-paper question on white paper, drawn only once its card nears the viewport (a
 * topic holds up to ~70 questions, many with pictures). Laid out in a shadow root so the
 * app's reset never reaches the paper's typography. On-paper colours are literal hex.
 */
export function PastPaperSheet({
  item,
  doc,
  language,
  compact = false,
  eager = false,
}: {
  item: PastPaperItem;
  doc: Worksheet;
  language: LanguageMode;
  /** The editor tab's narrow cards: less padding. */
  compact?: boolean;
  /** Draw at once: the caller already mounts the sheet only near the screen. */
  eager?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  // Without IntersectionObserver (old engines, tests) every card draws at once.
  const [near, setNear] = useState(() => eager || typeof IntersectionObserver === 'undefined');
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || eager) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNear(true);
        observer.disconnect();
      }
    }, { rootMargin: '600px 0px' });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [eager]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setWidth(entries[entries.length - 1]?.contentRect.width ?? 0));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const preview = useMemo(() => {
    if (!near) return undefined;
    try {
      return pastPaperPreviewHtml(item, doc, language);
    } catch {
      return undefined;
    }
  }, [near, item, doc, language]);

  const scale = preview && width > 0 ? Math.min(1, Math.max(MIN_SCALE, width / preview.widthPx)) : 0;
  const layoutWidth = preview && scale > 0 ? Math.min(preview.widthPx, width / scale) : 0;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      // innerHTML never runs scripts, and the clipboard HTML carries none.
      root.innerHTML = preview ? preview.html.replace(`width:${preview.widthPx}px;`, `width:${layoutWidth}px;`) : '';
      const sheet = root.querySelector<HTMLElement>('.sheet');
      if (!sheet || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => setHeight(sheet.offsetHeight));
      observer.observe(sheet);
      return () => observer.disconnect();
    } catch {
      // No shadow DOM: the sheet stays blank.
    }
  }, [preview, layoutWidth]);

  return (
    <div
      className="relative w-full"
      style={{
        background: '#ffffff',
        boxShadow: '0 1px 4px rgba(40, 36, 30, 0.16), 0 0 0 1px rgba(40, 36, 30, 0.06)',
        padding: compact ? `12px ${padX(true)}px` : `20px ${padX(false)}px`,
      }}
    >
      <div ref={frameRef} style={{ height: preview ? height * scale : 96, position: 'relative' }}>
        <div
          ref={hostRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: layoutWidth,
            transform: `scale(${scale})`,
            transformOrigin: '0 0',
            visibility: scale > 0 ? 'visible' : 'hidden',
          }}
        />
      </div>
    </div>
  );
}
