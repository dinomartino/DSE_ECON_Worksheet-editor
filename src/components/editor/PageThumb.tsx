'use client';

import { useEffect, useRef } from 'react';

/**
 * A live thumbnail of one real sheet: a **clone of the rendered sheet** from
 * `#print-root` (no third render pass, no second code path to drift through).
 * Deliberately inert — `cloneNode` copies markup, the wrapper is
 * `pointer-events-none` and `aria-hidden`, so the card underneath keeps click, drag
 * and delete.
 */
export function PageThumb({
  pageIndex,
  width,
  height,
  /**
   * Bumped by the rail whenever the preview's DOM settles. A plain number rather than
   * the composition itself: this component only needs to know *that* something
   * changed, and comparing rendered page content by value would cost more than the
   * re-clone it is trying to avoid.
   */
  revision,
}: {
  pageIndex: number;
  width: number;
  height: number;
  revision: number;
}) {
  const hostRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const sheet = document.querySelector<HTMLElement>(
      `#print-root [data-page-index="${pageIndex}"] .paper`,
    );
    // Nothing to clone yet — leave the placeholder showing rather than blanking the
    // card. The preview mounts and measures before any sheet exists, which is a real
    // interval on first paint.
    if (!sheet) return;

    const copy = sheet.cloneNode(true) as HTMLElement;

    // Strip editing chrome the preview draws on the page. These are affordances for a
    // surface you can click; at thumbnail scale they are noise, and the drag grips in
    // particular would print a column of pills down the side of every card.
    copy
      .querySelectorAll('[data-print-hide], [contenteditable], textarea')
      .forEach((node) => node.remove());
    // Selection styling belongs to the live page's state, not to what is printed — a
    // violet-tinted question in the thumbnail reads as content, since the rail is far
    // from the selection that explains it. The selected element is found by
    // `aria-current` rather than by its class string: the classes are literal hex
    // (§UI tokens vs the paper) and would have to be restated here to be stripped,
    // giving the highlight two places to change instead of one.
    copy.querySelectorAll<HTMLElement>('[aria-current="true"]').forEach((node) => {
      node.className = node.className
        .split(' ')
        .filter((c) => !/^(bg-\[|ring|before:)/.test(c))
        .join(' ');
    });

    /*
     * Lay the clone out at the sheet's real pixel size, then shrink it with a
     * transform.
     *
     * The width has to be pinned explicitly. Dropped into an 88px card the `.paper`
     * shrink-wraps to its container, and a band row's zones are sized by *percentage*
     * flex-basis (§ColumnsNode: `at` is a fraction of the row's width) — against a
     * collapsed row those resolve to 0, so the left / centre / right fields all
     * bunched into the middle and every header printed as one centred clump. Pinning
     * the box makes the row resolve its thirds exactly as the page does; the
     * transform then scales the finished layout, which changes no widths at all.
     *
     * The height is pinned for the same reason: a sheet is a fixed box that clips, so
     * a thumbnail that grew to its content would show a page longer than the one that
     * prints.
     */
    copy.style.width = `${sheet.offsetWidth}px`;
    copy.style.height = `${sheet.offsetHeight}px`;
    copy.style.flex = 'none';
    copy.style.margin = '0';
    // A cloned `.paper` keeps its own drop shadow and rounding, which stack on top of
    // the card's border and read as a double edge at this size.
    copy.style.boxShadow = 'none';
    copy.style.borderRadius = '0';
    // The clone's ancestor chain differs from the sheet's in one way that *inherits*:
    // the card is a <button>, and the UA stylesheet gives buttons `text-align:
    // center`. The sheet inherits the document's `start`, so in the clone every node
    // without its own textAlign — body text, section headings, MCQ options — quietly
    // re-centred. Restating the sheet's computed value pins what the page actually
    // resolved rather than hard-coding `left` here.
    copy.style.textAlign = getComputedStyle(sheet).textAlign;

    copy.style.transform = `scale(${width / sheet.offsetWidth})`;
    copy.style.transformOrigin = 'top left';

    host.replaceChildren(copy);

    return () => host.replaceChildren();
  }, [pageIndex, width, height, revision]);

  return (
    <>
      {/* The placeholder sits *under* the clone rather than being swapped out for it.
          A cloned `.paper` is opaque white and fills the card, so it covers this on
          its own — which means the "has it cloned yet" question needs no state, and
          the effect stays free of the synchronous setState that would cascade a
          render on every mutation of the page. */}
      <span aria-hidden className="absolute inset-0 flex flex-col gap-[3px] bg-white p-1.5">
        <span className="h-1 w-2/3 self-center rounded-full bg-ink-subtle/30" />
        <span className="h-[3px] w-1/2 self-center rounded-full bg-ink-subtle/20" />
      </span>
      <span
        ref={hostRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      />
    </>
  );
}
