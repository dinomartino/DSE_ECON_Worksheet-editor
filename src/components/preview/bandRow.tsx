'use client';

import { forwardRef, useCallback, useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import type { ZoneName } from '@/model/bands';

/**
 * One printed band row, laid out the way Word lays out the tab-stop paragraph it exports
 * as (§ Bands and zones): every band surface — the idle and engaged header, the
 * masthead editor, and the IR's `ColumnsNode` — draws its three zones in this frame.
 *
 * - **Fits on one line** (`fit`): the sides are `minmax(max-content, 1fr)`, so the centre
 *   zone sits on the row's middle (Word's centre stop) and is pushed aside only by a side
 *   too long to leave it there; nothing wraps, and a lone field may use the whole row.
 * - **Does not fit** (`data-band-overflow`): plain `auto` tracks, so every zone keeps
 *   its longest word and the row is shared out; only now does text wrap.
 *
 * CSS cannot tell the two apart, so `useBandRowFit` measures once per size change.
 */
export const BAND_ROW_CLASS =
  'grid items-baseline grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] data-[band-overflow]:grid-cols-[auto_auto_auto]';

/** How each zone sits in its track: the alignment its Word tab stop gives it. */
export const BAND_ZONE_CLASS: Record<ZoneName, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

/** Fields sharing a zone print one space apart (the .docx joins them with a space run). */
export const BAND_FIELD_SEPARATOR = ' ';

/**
 * Switch `row` between the two layouts: the one-line layout unless its zones overflow
 * the row. Exported for the contract test; jsdom has no layout, so there it is a no-op.
 */
export function fitBandRow(row: HTMLElement): void {
  row.removeAttribute('data-band-overflow');
  // The zones' own boxes, not `scrollWidth`: editing chrome hanging past a field (an
  // empty side's `+`) overflows the row without the row's text doing so.
  const edge = row.getBoundingClientRect().right;
  const overflows = Array.from(row.children).some(
    (zone) =>
      getComputedStyle(zone).position !== 'absolute' &&
      zone.getBoundingClientRect().right > edge + 1,
  );
  if (overflows) row.setAttribute('data-band-overflow', '');
}

/**
 * Keep `row` in the right layout. Not keyed on content: only a size change of the row or
 * a zone (an edit, a font size, the page width) can change the answer, and typing into a
 * field reports itself through `input` before React hears of it. The zones are the row's
 * three children for its whole life, so observing them once is enough.
 */
function useBandRowFit() {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const fit = () => fitBandRow(row);
    fit();
    row.addEventListener('input', fit);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(fit);
      observer.observe(row);
      for (const zone of Array.from(row.children)) observer.observe(zone);
    }
    return () => {
      row.removeEventListener('input', fit);
      observer?.disconnect();
    };
  }, []);
  return ref;
}

/** The row frame. Children are the three zones, in order left, centre, right. */
export const BandRowFrame = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function BandRowFrame({ className, children, ...rest }, forwarded) {
    const ref = useBandRowFit();
    const setRef = useCallback(
      (node: HTMLDivElement | null) => {
        ref.current = node;
        if (typeof forwarded === 'function') forwarded(node);
        else if (forwarded) forwarded.current = node;
      },
      [ref, forwarded],
    );
    return (
      <div ref={setRef} data-band-row="" className={`${BAND_ROW_CLASS} ${className ?? ''}`} {...rest}>
        {children}
      </div>
    );
  },
);
