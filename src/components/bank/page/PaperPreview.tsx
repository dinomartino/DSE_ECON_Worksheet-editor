'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BankMark } from '@/assist/bankRun';
import type { LanguageMode, VersionMode, Worksheet } from '@/model/types';
import { questionPreviewHtml } from './questionPreview';

/** The smallest the paper is drawn: 11pt body reads at ~10.5px. Narrower panes reflow instead. */
const MIN_SCALE = 0.72;
/** The sheet's own margin around the text column, as the mockup's reading page. */
const PAD_X = 40;
const PAD_Y = 30;

/**
 * One question on white paper at reading size: laid out at its document's text-column
 * width in a shadow root (so the app's reset never reaches the paper's typography), drawn
 * at print size when the pane allows and scaled down only as far as `MIN_SCALE`, below
 * which it reflows to a narrower column. On-paper content: literal hex, never tokens.
 */
export function PaperPreview({
  worksheet,
  questionId,
  language,
  version,
  failed,
  marks,
}: {
  /** ✦ review: texts to highlight (what a fill wrote, the term a finding is about). */
  marks?: readonly BankMark[];
  /** The owning document, once loaded. */
  worksheet: Worksheet | undefined;
  questionId: string;
  language: LanguageMode;
  version: VersionMode;
  failed: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const preview = useMemo(() => {
    if (!worksheet) return undefined;
    try {
      return questionPreviewHtml(worksheet, questionId, language, version);
    } catch {
      return undefined;
    }
  }, [worksheet, questionId, language, version]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => setWidth(entries[entries.length - 1]?.contentRect.width ?? 0));
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  const scale = preview && width > 0 ? Math.min(1, Math.max(MIN_SCALE, width / preview.widthPx)) : 0;
  const layoutWidth = preview && scale > 0 ? Math.min(preview.widthPx, width / scale) : 0;

  const markKey = marks && marks.length > 0 ? JSON.stringify(marks) : '';
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      // innerHTML never runs scripts, and the clipboard HTML carries none.
      root.innerHTML = preview ? preview.html.replace(`width:${preview.widthPx}px;`, `width:${layoutWidth}px;`) : '';
      const sheet = root.querySelector<HTMLElement>('.sheet');
      if (sheet && markKey) markTexts(sheet, JSON.parse(markKey) as BankMark[]);
      if (!sheet || typeof ResizeObserver === 'undefined') return;
      // Diagrams are images: the height settles as they decode, so it is observed, not read once.
      const observer = new ResizeObserver(() => setHeight(sheet.offsetHeight));
      observer.observe(sheet);
      return () => observer.disconnect();
    } catch {
      // No shadow DOM: the sheet stays blank.
    }
  }, [preview, layoutWidth, markKey]);

  return (
    <div
      className="relative w-full"
      style={{
        background: '#ffffff',
        boxShadow: '0 2px 10px rgba(40, 36, 30, 0.22), 0 0 0 1px rgba(40, 36, 30, 0.06)',
        padding: `${PAD_Y}px ${PAD_X}px`,
        minHeight: 140,
      }}
    >
      <div ref={frameRef} style={{ height: preview ? height * scale : 0, position: 'relative' }}>
        <div
          ref={hostRef}
          aria-label={`The question as it prints, ${version === 'teacher' ? 'Teacher' : 'Student'} version`}
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
      {!preview && (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-[12.5px]" style={{ color: '#8a857c' }}>
          {failed ? 'This question could not be read.' : 'Loading…'}
        </p>
      )}
    </div>
  );
}

/** The widest the sheet is drawn: an A4 text column at print size plus the sheet's margins. */
export const SHEET_MAX_WIDTH = 760;

/** Most spans a review marks on one paper: a guard, not a limit anyone meets. */
const MARK_BUDGET = 80;

/**
 * Wraps each occurrence of the marked texts in a `data-ai-mark` span, longest first, so a
 * sentence claims its words before a term inside it. A text the paper splits across runs
 * (a bold word inside it) is not found and stays unmarked: marks are a guide, not a record.
 */
export function markTexts(sheet: HTMLElement, marks: readonly BankMark[]): void {
  const pieces = marks
    .flatMap((mark) => mark.text.split('\n').map((text) => ({ text: text.trim(), tone: mark.tone })))
    .filter((piece) => piece.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length);
  let budget = MARK_BUDGET;
  const doc = sheet.ownerDocument;
  for (const piece of pieces) {
    const walker = doc.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    const hits: Text[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node as Text;
      if (!text.parentElement?.closest('[data-ai-mark]') && text.data.includes(piece.text)) hits.push(text);
    }
    for (let rest of hits) {
      let at = rest.data.indexOf(piece.text);
      while (at >= 0 && budget > 0) {
        budget -= 1;
        const match = rest.splitText(at);
        rest = match.splitText(piece.text.length);
        const span = doc.createElement('span');
        span.setAttribute('data-ai-mark', piece.tone);
        match.replaceWith(span);
        span.appendChild(match);
        at = rest.data.indexOf(piece.text);
      }
    }
  }
}
