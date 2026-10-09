'use client';

import {
  Fragment,
  forwardRef,
  useCallback,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { ZONES, type ZoneName } from '@/model/bands';
import type { BandSegmentContext } from '@/model/bandSegments';
import { zonePrints } from '@/model/headerMarks';
import type { Band, LanguageMode } from '@/model/types';

/**
 * One printed band row, laid out as the Word paragraph it exports as (§ Bands and zones):
 * the zones flow as inline text, and each `w:tab` the `.docx` writes is an inline spacer
 * whose width `layoutBandRow` sets the way Word resolves that tab. Every band surface (the
 * idle and engaged header, the masthead editor, the IR's `ColumnsNode`) draws this frame.
 */

/** Which paragraph a row exports as: a header/footer part's, or a masthead body row's. */
export type BandRowKind = 'header' | 'masthead';

export interface BandTabStop {
  align: 'center' | 'right';
  /** Fraction of the row's width. */
  at: number;
}

/** The stops a row's paragraph carries, and how many tabs precede each zone. */
export interface BandTabPlan {
  stops: BandTabStop[];
  tabsBefore: Record<ZoneName, number>;
}

/**
 * The tab stops and tab runs the `.docx` writes for a row with these zones printing.
 *
 * - **header** (`headerFooterParagraph`): a centre stop at 0.5 and a right stop at 1, the
 *   centre one left out of a left + right row; a right zone after an empty centre takes
 *   two tabs unless the row is left + right.
 * - **masthead** (`bandStops`/`bandCellRuns`): a stop per occupied centre or right zone,
 *   one tab before each.
 */
export function bandTabPlan(occupied: Record<ZoneName, boolean>, kind: BandRowKind): BandTabPlan {
  const { left, center, right } = occupied;
  if (kind === 'header') {
    const leftRight = left && right && !center;
    return {
      stops: [...(leftRight ? [] : [{ align: 'center' as const, at: 0.5 }]), { align: 'right' as const, at: 1 }],
      tabsBefore: { left: 0, center: center ? 1 : 0, right: right ? (center || leftRight ? 1 : 2) : 0 },
    };
  }
  return {
    stops: [
      ...(center ? [{ align: 'center' as const, at: 0.5 }] : []),
      ...(right ? [{ align: 'right' as const, at: 1 }] : []),
    ],
    tabsBefore: { left: 0, center: center ? 1 : 0, right: right ? 1 : 0 },
  };
}

/**
 * Which zones of a header/footer row the `.docx` writes text into: the ones that print in
 * `language` (`headerFooterLayout`), plus the one the Teacher version's marker joins.
 */
export function headerZonesPrinting(
  band: Band,
  context: BandSegmentContext,
  language: LanguageMode,
  trail?: { zone: ZoneName },
): Record<ZoneName, boolean> {
  const prints = (zone: ZoneName) => trail?.zone === zone || zonePrints(band, zone, context, language);
  return { left: prints('left'), center: prints('center'), right: prints('right') };
}

/**
 * Where the text after a tab starts, as Word resolves it, or `undefined` when no stop is
 * left on the line (the tab then moves to the next line and resolves from its start).
 *
 * `x` is where the tab begins; `portion` the width of the text after it that stays on this
 * line. Word takes the first stop past `x` whichever zone it was meant for, centres or
 * right-aligns the portion on it, and never draws it back over the text before the tab.
 */
export function resolveTab(
  x: number,
  width: number,
  stops: BandTabStop[],
  portion: number,
): number | undefined {
  const stop = stops.find((candidate) => candidate.at * width > x + 0.5);
  if (!stop) return undefined;
  const pos = stop.at * width;
  return Math.max(x, stop.align === 'center' ? pos - portion / 2 : pos - portion);
}

/** Fields sharing a zone print one space apart (the .docx joins them with a space run). */
export const BAND_FIELD_SEPARATOR = ' ';

/** Zones are inline text, as in the Word paragraph; alignment comes from the tabs. */
export const BAND_ZONE_CLASS = 'inline';

// Below the pixel a rounded width can push the last word onto the next line by.
const TAB_SLACK = 0.25;

/**
 * The right edge of the zone's last visible character on the line holding `baseline`, if
 * it has any there. Word aligns on the text, not on a space left hanging where the line
 * wrapped (WebKit, and Chromium in print, count that space in an element's box), so this
 * measures the words themselves; editing chrome inside the zone is not text.
 */
function lineEndOn(zone: Element, baseline: number): number | undefined {
  let end: number | undefined;
  const walker = document.createTreeWalker(zone, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.parentElement?.closest('button, [data-print-hide]')) continue;
    for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      for (const rect of Array.from(range.getClientRects())) {
        if (rect.width > 0 && rect.top - 1 <= baseline && baseline <= rect.bottom + 1) {
          end = Math.max(end ?? rect.right, rect.right);
        }
      }
    }
  }
  return end;
}

/**
 * Size every tab spacer of `row` as Word resolves its tab (`resolveTab`), left to right,
 * since each one moves the text after it. Text the line cannot hold wraps as Word wraps
 * it: the browser breaks the inline flow at the same margin.
 *
 * Then marks each editable field with the room beside it (`data-room-before`/`-after`,
 * `data-remove`), so hover chrome sits outside a field without crossing the margin or another field.
 *
 * jsdom has no layout; there every width stays 0.
 */
export function layoutBandRow(row: HTMLElement): void {
  const tabs = Array.from(row.querySelectorAll<HTMLElement>(':scope > [data-band-tab]'));
  for (const tab of tabs) {
    tab.style.width = '0px';
    const brk = tab.previousElementSibling as HTMLElement | null;
    if (brk?.hasAttribute('data-band-tab-break')) brk.style.display = 'none';
  }
  const box = row.getBoundingClientRect();
  if (row.offsetWidth === 0 || box.width === 0) return;
  const scale = box.width / row.offsetWidth;
  const style = getComputedStyle(row);
  const padLeft = parseFloat(style.paddingLeft) || 0;
  const width = row.clientWidth - padLeft - (parseFloat(style.paddingRight) || 0);
  const left = box.left + (row.clientLeft + padLeft) * scale;
  const stops: BandTabStop[] = JSON.parse(row.dataset.bandStops ?? '[]');

  for (const tab of tabs) {
    const zone = tab.nextElementSibling?.hasAttribute('data-band-zone') ? tab.nextElementSibling : null;
    const brk = tab.previousElementSibling as HTMLElement | null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const at = tab.getBoundingClientRect();
      const x = (at.left - left) / scale;
      const end = zone ? lineEndOn(zone, at.top) : undefined;
      const portion = end !== undefined ? (end - at.left) / scale : 0;
      const start = resolveTab(x, width, stops, portion);
      // No stop left, or not even the first word fits after the tab: Word moves the tab
      // to the next line and resolves it from there.
      if (start === undefined || (zone && end === undefined)) {
        if (attempt === 0 && brk?.hasAttribute('data-band-tab-break') && x > 0.5) {
          brk.style.display = '';
          continue;
        }
        break;
      }
      tab.style.width = `${Math.max(0, start - x - TAB_SLACK)}px`;
      break;
    }
  }
  markFieldRoom(row, scale);
}

/** Room a hover control needs beside a field, in CSS px. */
const CHROME_ROOM = 14;

function markFieldRoom(row: HTMLElement, scale: number): void {
  const fields = Array.from(row.querySelectorAll<HTMLElement>('[data-field-id]'));
  if (fields.length === 0) return;
  const box = row.getBoundingClientRect();
  const rects = fields.map((field) => Array.from(field.getClientRects()).filter((rect) => rect.width > 0));
  fields.forEach((field, index) => {
    const own = rects[index];
    if (own.length === 0) return;
    const first = own[0];
    const last = own[own.length - 1];
    const others = rects.flatMap((list, other) => (other === index ? [] : list));
    const sameLine = (a: DOMRect, b: DOMRect) => a.top < b.bottom - 1 && b.top < a.bottom - 1;
    const before = Math.min(
      first.left - box.left,
      ...others.filter((rect) => sameLine(rect, first) && rect.right <= first.left + 1).map((rect) => first.left - rect.right),
    );
    const after = Math.min(
      box.right - last.right,
      ...others.filter((rect) => sameLine(rect, last) && rect.left >= last.right - 1).map((rect) => rect.left - last.right),
    );
    // An affix `+` keeps its side (it says where the wording goes); the ✕ goes wherever
    // there is room for it beyond that side's `+`.
    const plusBefore = Boolean(field.querySelector('[data-affix-plus="prefix"]'));
    const plusAfter = Boolean(field.querySelector('[data-affix-plus="suffix"]'));
    const roomBefore = before / scale;
    const roomAfter = after / scale;
    field.dataset.roomBefore = roomBefore >= CHROME_ROOM ? 'out' : 'in';
    field.dataset.roomAfter = roomAfter >= CHROME_ROOM ? 'out' : 'in';
    field.dataset.remove =
      roomAfter >= CHROME_ROOM * (plusAfter ? 2 : 1)
        ? plusAfter ? 'after-plus' : 'after'
        : roomBefore >= CHROME_ROOM * (plusBefore ? 2 : 1)
          ? plusBefore ? 'before-plus' : 'before'
          : 'in';
  });
}

/**
 * Keep `row` laid out. After every render (an edit changes the text after a tab), on a
 * size change (a font loading, the page width), and on typing, which reports itself
 * through `input` before React hears of it.
 */
function useBandRowLayout() {
  const ref = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const row = ref.current;
    if (row) layoutBandRow(row);
  });
  useLayoutEffect(() => {
    const row = ref.current;
    if (!row) return;
    const layout = () => layoutBandRow(row);
    row.addEventListener('input', layout);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      let width = row.offsetWidth;
      observer = new ResizeObserver(() => {
        // Only a width change moves a stop; a height change is this layout's own result.
        if (row.offsetWidth === width) return;
        width = row.offsetWidth;
        layout();
      });
      observer.observe(row);
    }
    let live = true;
    document.fonts?.ready.then(() => live && layout());
    return () => {
      live = false;
      row.removeEventListener('input', layout);
      observer?.disconnect();
    };
  }, []);
  return ref;
}

interface FrameProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  kind: BandRowKind;
  /** Which zones print, which decides the paragraph's stops and tabs (`bandTabPlan`). */
  occupied: Record<ZoneName, boolean>;
  /** The three zones, each a `BandZone`. */
  zones: Record<ZoneName, ReactNode>;
  /** Positioned editing chrome, outside the text flow. */
  chrome?: ReactNode;
}

/** The row frame: the zones in order, each after the tab spacers its paragraph puts before it. */
export const BandRowFrame = forwardRef<HTMLDivElement, FrameProps>(function BandRowFrame(
  { kind, occupied, zones, chrome, className, ...rest },
  forwarded,
) {
  const ref = useBandRowLayout();
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      ref.current = node;
      if (typeof forwarded === 'function') forwarded(node);
      else if (forwarded) forwarded.current = node;
    },
    [ref, forwarded],
  );
  const plan = bandTabPlan(occupied, kind);
  return (
    <div
      ref={setRef}
      data-band-row=""
      data-band-stops={JSON.stringify(plan.stops)}
      className={`relative text-left ${className ?? ''}`}
      {...rest}
    >
      {chrome}
      {ZONES.map((zone) => (
        <Fragment key={zone}>
          {Array.from({ length: plan.tabsBefore[zone] }, (_, index) => (
            <Fragment key={index}>
              {/* Shown by `layoutBandRow` when the tab moves to the next line. */}
              <br data-band-tab-break="" style={{ display: 'none' }} />
              <span data-band-tab="" aria-hidden className="inline-block" />
            </Fragment>
          ))}
          {zones[zone]}
        </Fragment>
      ))}
    </div>
  );
});
