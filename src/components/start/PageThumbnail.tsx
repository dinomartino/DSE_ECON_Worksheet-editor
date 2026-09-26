'use client';

import { useEffect, useRef, useState } from 'react';
import { worksheetStore } from '@/storage';
import { loadThumbnail, settleThumbnail, type Thumbnail } from './thumbnail';

/**
 * A read-only picture of a saved document's first page, for a start-screen card.
 *
 * Loaded only once the card nears the viewport, built by `loadThumbnail` (cached per
 * saved version, two at a time), and laid out at true page size inside a shadow root —
 * so the app's Tailwind reset cannot reach the paper's typography — then scaled down to
 * the card's width. The paper is on-paper content: literal hex, never theme tokens.
 *
 * Inert by construction: `aria-hidden`, `inert`, no pointer events. The card is the button.
 */

/** A4 portrait at 96dpi — the shape shown before the document says otherwise. */
const A4 = { widthPx: 11906 / 15, heightPx: 16838 / 15 };

type Loaded = { key: string; thumbnail?: Thumbnail };

export function PageThumbnail({
  id,
  updatedAt,
  className,
}: {
  id: string;
  updatedAt: string;
  className?: string;
}) {
  const key = `${id}:${updatedAt}`;
  const frameRef = useRef<HTMLSpanElement>(null);
  const hostRef = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [loaded, setLoaded] = useState<Loaded>();
  const [width, setWidth] = useState(0);

  // Only a result for *this* version counts; a stale one reads as still loading.
  const current = loaded?.key === key ? loaded : undefined;
  const thumbnail = current?.thumbnail;
  const page = thumbnail?.page ?? A4;

  useEffect(() => {
    const frame = frameRef.current;
    if (visible || !frame || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      // A screen ahead, so a card scrolled into view is usually already drawn.
      { rootMargin: '100% 0px' },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let live = true;
    loadThumbnail(id, updatedAt, (docId) => worksheetStore.load(docId)).then(
      (result) => live && setLoaded({ key: `${id}:${updatedAt}`, thumbnail: result }),
      // A failure is a blank sheet, never an error in the list.
      () => live && setLoaded({ key: `${id}:${updatedAt}` }),
    );
    return () => {
      live = false;
    };
  }, [visible, id, updatedAt]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    if (typeof ResizeObserver === 'undefined') {
      const raf = requestAnimationFrame(() => setWidth(frame.clientWidth));
      return () => cancelAnimationFrame(raf);
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    try {
      const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      // innerHTML never runs scripts, and the HTML carries none (§ thumbnailHtml).
      root.innerHTML = thumbnail?.html ?? '';
      if (!thumbnail || thumbnail.showsCover) return;

      /*
       * Page 1 ends where its content reaches the bottom margin. A question is one
       * element here, and the paginator never splits one, so everything from the first
       * child that crosses the margin is on a later page: dropped, so the margin stays
       * clean and the cache keeps only what shows. The first child always stays — an
       * item taller than a page still starts on page 1.
       */
      const content = root.querySelector<HTMLElement>('.content');
      if (!content) return;
      const limit = thumbnail.page.heightPx - thumbnail.page.marginPx.bottom;
      const children = Array.from(content.children) as HTMLElement[];
      const firstOver = children.findIndex(
        (child) => child.offsetTop + child.offsetHeight > limit + 0.5,
      );
      if (firstOver < 1) return;
      for (const child of children.slice(firstOver)) child.remove();
      settleThumbnail(id, updatedAt, { ...thumbnail, html: root.innerHTML });
    } catch {
      // No shadow DOM (or a parse failure): the card keeps its blank sheet.
    }
  }, [thumbnail, id, updatedAt]);

  const scale = width > 0 ? width / page.widthPx : 0;
  const ready = Boolean(thumbnail) && scale > 0;

  return (
    <span
      ref={frameRef}
      aria-hidden
      inert
      className={`relative block w-full overflow-hidden select-none ${className ?? ''}`}
      style={{
        aspectRatio: `${page.widthPx} / ${page.heightPx}`,
        background: '#ffffff',
        pointerEvents: 'none',
      }}
    >
      <span
        ref={hostRef}
        className="absolute left-0 top-0 block"
        style={{
          width: page.widthPx,
          height: page.heightPx,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
          visibility: ready ? 'visible' : 'hidden',
          // The page fades up over the skeleton's white rather than popping in. Opacity
          // only: the scale follows the card's width and must never animate.
          opacity: ready ? 1 : 0,
          transition: 'opacity 180ms var(--ease-out-soft)',
        }}
      />
      {!current && <Skeleton />}
      {/* The sheet's hairline edge, above the content so a full page cannot paint over it. */}
      <span
        className="absolute inset-0 block"
        style={{ boxShadow: 'inset 0 0 0 1px #e5e1d8' }}
      />
    </span>
  );
}

/** A quiet sketch of a page — a title and a few lines — while the real one loads. */
function Skeleton() {
  const bar = (top: number, left: number, width: number, height = 1.1) => (
    <span
      className="absolute block rounded-[1px]"
      style={{
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        background: '#efece6',
      }}
    />
  );
  return (
    <span className="absolute inset-0 block motion-safe:animate-pulse">
      {bar(9, 32, 36, 1.6)}
      {bar(14, 12, 44)}
      {bar(20, 12, 76)}
      {bar(24, 12, 70)}
      {bar(28, 12, 58)}
      {bar(35, 12, 76)}
      {bar(39, 12, 64)}
    </span>
  );
}
