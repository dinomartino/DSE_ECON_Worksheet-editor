'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BankMark } from '@/assist/bankRun';
import type { LanguageMode, VersionMode, Worksheet } from '@/model/types';
import { useMessages } from '@/i18n/language';
import { PAPER_PREVIEW_MESSAGES } from './PaperPreview.messages';
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
  highlight,
}: {
  /** ✦ review: texts to highlight (what a fill wrote, the term a finding is about). */
  marks?: readonly BankMark[];
  /** Parts to mark (tag slot keys): the part that tests what is being browsed. Screen only. */
  highlight?: readonly string[];
  /** The owning document, once loaded. */
  worksheet: Worksheet | undefined;
  questionId: string;
  language: LanguageMode;
  version: VersionMode;
  failed: boolean;
}) {
  const m = useMessages(PAPER_PREVIEW_MESSAGES);
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [height, setHeight] = useState(0);
  const highlightKey = highlight?.join('\u0000') ?? '';
  const preview = useMemo(() => {
    if (!worksheet) return undefined;
    try {
      return questionPreviewHtml(worksheet, questionId, language, version, highlightKey ? highlightKey.split('\u0000') : []);
    } catch {
      return undefined;
    }
  }, [worksheet, questionId, language, version, highlightKey]);

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
          aria-label={m.label(version === 'teacher')}
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
          {failed ? m.failed : m.loading}
        </p>
      )}
    </div>
  );
}

/** The widest the sheet is drawn: an A4 text column at print size plus the sheet's margins. */
export const SHEET_MAX_WIDTH = 760;

/** Most spans a review marks on one paper: a guard, not a limit anyone meets. */
const MARK_BUDGET = 80;

/** One piece of a match: `texts[index]` from `start` to `end`. */
export interface MatchSpan {
  index: number;
  start: number;
  end: number;
}

/**
 * Every occurrence of `needle` in `texts` read as one string (one line's text nodes, in
 * order), each as the pieces of the texts it covers: a sentence with a bold word inside is
 * still one match. Non-overlapping, left to right.
 */
export function findAcross(texts: readonly string[], needle: string): MatchSpan[][] {
  if (needle.length === 0) return [];
  const joined = texts.join('');
  const starts: number[] = [];
  let offset = 0;
  for (const text of texts) {
    starts.push(offset);
    offset += text.length;
  }
  const out: MatchSpan[][] = [];
  for (let at = joined.indexOf(needle); at >= 0; at = joined.indexOf(needle, at + needle.length)) {
    const end = at + needle.length;
    const spans: MatchSpan[] = [];
    texts.forEach((text, index) => {
      const from = Math.max(at, starts[index]);
      const to = Math.min(end, starts[index] + text.length);
      if (from < to) spans.push({ index, start: from - starts[index], end: to - starts[index] });
    });
    out.push(spans);
  }
  return out;
}

const BLOCK = 'p,div,li,td,th,h1,h2,h3,h4,h5,h6,table';

/** The sheet's unmarked text nodes as lines: consecutive nodes in one block, broken at `<br>` and at a mark. */
function textLines(sheet: HTMLElement): Text[][] {
  const walker = sheet.ownerDocument.createTreeWalker(sheet, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  const lines: Text[][] = [];
  let line: Text[] = [];
  let block: Element | null = null;
  const end = () => {
    if (line.length > 0) lines.push(line);
    line = [];
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType !== Node.TEXT_NODE) {
      if ((node as Element).tagName === 'BR') end();
      continue;
    }
    const parent = node.parentElement;
    if (!parent || parent.closest('[data-ai-mark]')) {
      end();
      continue;
    }
    const own = parent.closest(BLOCK);
    if (own !== block) end();
    block = own;
    line.push(node as Text);
  }
  end();
  return lines;
}

/**
 * Wraps each occurrence of the marked texts in `data-ai-mark` spans, longest first, so a
 * sentence claims its words before a term inside it. A text the paper splits across runs
 * (a bold word inside it) is found across them: one span per run it covers.
 */
export function markTexts(sheet: HTMLElement, marks: readonly BankMark[]): void {
  const pieces = marks
    .flatMap((mark) => mark.text.split('\n').map((text) => ({ text: text.trim(), tone: mark.tone })))
    .filter((piece) => piece.text.length > 0)
    .sort((a, b) => b.text.length - a.text.length);
  let budget = MARK_BUDGET;
  const doc = sheet.ownerDocument;
  for (const piece of pieces) {
    for (const line of textLines(sheet)) {
      if (budget <= 0) return;
      const matches = findAcross(
        line.map((text) => text.data),
        piece.text,
      ).slice(0, budget);
      budget -= matches.length;
      // Last first: each split leaves the earlier offsets where they were.
      for (const span of matches.flat().reverse()) {
        const node = line[span.index];
        node.splitText(span.end);
        const match = node.splitText(span.start);
        const wrap = doc.createElement('span');
        wrap.setAttribute('data-ai-mark', piece.tone);
        match.replaceWith(wrap);
        wrap.appendChild(match);
      }
    }
  }
}
