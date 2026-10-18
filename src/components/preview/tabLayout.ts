import { useLayoutEffect, useRef } from 'react';
import {
  carriesTab,
  cleanTabStops,
  DEFAULT_TAB_STOP_TWIPS,
  nextTabStop,
  tabGap,
  twipsToPx,
  type PlacedStop,
} from '@/model/tabStops';
import type { TabStop } from '@/model/types';

/**
 * Typed tabs on the page, laid out as Word lays them (docs/Tabs vs Word.md).
 *
 * A tab is a `[data-tab]` span holding the `\t` itself (so reading the runs back and
 * counting offsets stay plain text). CSS gives the character no width (`tab-size: 0`);
 * this pass gives the span a `padding-right` as wide as Word's gap (right, so that after a
 * carried line it is on the tab's new line), measured on the laid-out
 * line, since a tab's width depends on where the text before it ended.
 *
 * - **Origin**: the text column's left edge (`[data-tab-origin]`: a sheet's content box,
 *   the measuring probe), or the cell's, as Word measures from the margin or the cell.
 * - **Stops**: the paragraph's own (`[data-tab-stops]`, twips), plus the marks' right stop
 *   at the margin (`[data-tab-marks]`), then the default grid.
 * - **Line end**: the paragraph's right content edge. With no stop left before it, the
 *   tab moves to the next line (`data-wrap`) and resolves again there, as Word's does.
 *
 * jsdom has no layout; there every gap stays 0.
 */

export const TAB_ATTR = 'data-tab';

/** Below the pixel a rounded width can push the next word onto the next line by. */
const TAB_SLACK = 0.25;

const ORIGIN = '[data-tab-origin], td, th';

/** An element's content box in viewport px, and its CSS-to-viewport scale (the zoom). */
function contentBox(element: HTMLElement): { left: number; right: number; scale: number } {
  const box = element.getBoundingClientRect();
  const scale = element.offsetWidth > 0 ? box.width / element.offsetWidth : 1;
  const style = getComputedStyle(element);
  const left = box.left + (element.clientLeft + (parseFloat(style.paddingLeft) || 0)) * scale;
  const right =
    box.left +
    (element.clientLeft + element.clientWidth - (parseFloat(style.paddingRight) || 0)) * scale;
  return { left, right, scale: scale || 1 };
}

/**
 * Where the text column a tab in `host` measures from sits on screen, for the ruler: its
 * viewport left and width, and viewport px per twip at the current zoom.
 */
export function tabColumn(
  host: HTMLElement,
): { left: number; width: number; pxPerTwip: number; widthTwips: number } | undefined {
  const origin = host.closest<HTMLElement>(ORIGIN);
  if (!origin) return undefined;
  const { left, right, scale } = contentBox(origin);
  if (right <= left) return undefined;
  const pxPerTwip = twipsToPx(1) * scale;
  // A sheet states its column in twips (`data-tab-width`), so a stop "at the margin" is
  // at the margin Word has, not one rounded to the pixel; a cell is measured.
  const stated = Number(origin.dataset.tabWidth);
  return {
    left,
    width: right - left,
    pxPerTwip,
    widthTwips: Number.isFinite(stated) && stated > 0 ? stated : Math.round((right - left) / pxPerTwip),
  };
}

/** The nearest ancestor that lays out as a block: the paragraph a tab's line belongs to. */
function blockOf(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element.parentElement;
  while (current) {
    const display = getComputedStyle(current).display;
    if (display !== 'inline' && display !== 'contents') return current;
    current = current.parentElement;
  }
  return element;
}

/** `[data-tab-stops]` on the paragraph, as layout px from the origin. */
function stopsFor(scope: HTMLElement, origin: HTMLElement, columnEnd: number): PlacedStop[] {
  const holder = scope.closest<HTMLElement>('[data-tab-stops], [data-tab-marks]');
  if (!holder || !origin.contains(holder)) return [];
  let raw: TabStop[] = [];
  try {
    raw = JSON.parse(holder.dataset.tabStops ?? '[]');
  } catch {
    raw = [];
  }
  const own = cleanTabStops(raw).map((stop) => ({ ...stop, pos: twipsToPx(stop.pos) }));
  if (!holder.hasAttribute('data-tab-marks')) return own;
  // The marks' right stop at the margin, which wins its position as in `tabsElement`.
  return [...own.filter((stop) => Math.abs(stop.pos - columnEnd) > 1), { pos: columnEnd, align: 'right' as const }].sort(
    (a, b) => a.pos - b.pos,
  );
}

/**
 * The text after `tab`, up to the next tab: where it ends on the tab's line (`line`, the
 * tab's last fragment), where its first full stop starts (for a decimal stop), and how
 * wide its first word is (whether any of it can share the tab's line). Words only, as
 * `layoutBandRow` measures: Word aligns on the text, not on a space left hanging where
 * the line wrapped.
 */
function portionAfter(
  scope: HTMLElement,
  tab: HTMLElement,
  next: HTMLElement | undefined,
  line: DOMRect,
): { end?: number; decimal?: number; first: number } {
  const middle = (line.top + line.bottom) / 2;
  const onLine = (rect: DOMRect) => rect.width > 0 && rect.top - 1 <= middle && middle <= rect.bottom + 1;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let end: number | undefined;
  let decimal: number | undefined;
  let first: number | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!(tab.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    if (tab.contains(node)) continue;
    if (next && (next.contains(node) || next.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)) break;
    // The marks are not part of it: Word sets them behind a tab of their own.
    if (node.parentElement?.closest('button, [data-print-hide], [data-marks-trail]')) continue;
    for (const word of (node.textContent ?? '').matchAll(/\S+/g)) {
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0);
      first ??= rects[0]?.width;
      for (const rect of rects) {
        if (onLine(rect)) end = Math.max(end ?? rect.right, rect.right);
      }
      const dot = word[0].indexOf('.');
      if (decimal === undefined && dot >= 0) {
        // The point starts where the text before it ends.
        range.setEnd(node, word.index + dot);
        const before = Array.from(range.getClientRects()).filter(onLine);
        decimal = before.length ? Math.max(...before.map((rect) => rect.right)) : rects[0]?.left;
      }
    }
  }
  return { end, decimal, first: first ?? 0 };
}

/** Size every tab in `scope`, left to right, since each moves the text after it. */
export function layoutTabs(scope: HTMLElement): void {
  const tabs = Array.from(scope.querySelectorAll<HTMLElement>(`[${TAB_ATTR}]`));
  if (tabs.length === 0) return;
  for (const tab of tabs) {
    tab.style.paddingRight = '0px';
    delete tab.dataset.leader;
    delete tab.dataset.wrap;
  }
  const origin = scope.closest<HTMLElement>(ORIGIN) ?? blockOf(scope);
  const column = contentBox(origin);
  if (column.right <= column.left) return;
  const { scale } = column;
  const lineEnd = (contentBox(blockOf(scope)).right - column.left) / scale;
  const columnEnd = (column.right - column.left) / scale;
  const stops = stopsFor(scope, origin, columnEnd);
  const defaultStop = twipsToPx(DEFAULT_TAB_STOP_TWIPS);

  const lineStart = (contentBox(blockOf(scope)).left - column.left) / scale;
  tabs.forEach((tab, index) => {
    // The tab's last fragment: after a carried line, the one on the new line.
    const lastRect = () => {
      const rects = tab.getClientRects();
      return rects.length ? rects[rects.length - 1] : tab.getBoundingClientRect();
    };
    const resolve = () => {
      const at = lastRect();
      const x = (at.left - column.left) / scale;
      // A pixel of slack at either end: a stop at the margin, measured in rounded px.
      const stop = nextTabStop(x, stops, defaultStop, lineEnd + 1, Math.max(lineEnd, columnEnd) + 1);
      if (!stop) return { x };
      const measured = stop.align === 'left' ? undefined : portionAfter(scope, tab, tabs[index + 1], at);
      const portion = measured?.end !== undefined ? (measured.end - at.right) / scale : 0;
      const toDecimal = measured?.decimal !== undefined ? (measured.decimal - at.right) / scale : portion;
      const first = (measured?.first ?? 0) / scale;
      return { x, stop, portion, toDecimal, first };
    };
    let resolved = resolve();
    // Word carries the tab to the next line and resolves it again from there
    // (`carriesTab`); a generated line break (CSS, so no DOM text) does the carrying.
    if (carriesTab(resolved.x, resolved.stop, resolved.first ?? 0, lineEnd + 1) && resolved.x > lineStart + 1) {
      tab.dataset.wrap = '';
      resolved = resolve();
    }
    const { x, stop, portion = 0, toDecimal = 0 } = resolved;
    let gap = 0;
    if (stop) {
      // Never past the line's own end: a gap there would wrap the text after it. A stop
      // at the margin over a slightly inset paragraph then ends the text a few px short.
      const room = lineEnd - x - (stop.align === 'left' ? 0 : portion);
      gap = Math.min(tabGap(x, stop, portion, toDecimal), Math.max(0, room));
      if (stop.leader) tab.dataset.leader = stop.leader;
    }
    tab.style.paddingRight = `${Math.max(0, gap - TAB_SLACK)}px`;
  });
}

/**
 * Keep the tabs inside `ref` laid out: after every render (an edit moves the text before
 * a tab), when the paragraph's width changes, and once web fonts have loaded. A layout
 * effect, so the page is measured for pagination after the gaps are set.
 */
export function useTabLayout<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    if (ref.current) layoutTabs(ref.current);
  });
  useLayoutEffect(() => {
    const scope = ref.current;
    if (!scope) return;
    const layout = () => layoutTabs(scope);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      const block = scope.parentElement ?? scope;
      let width = block.offsetWidth;
      observer = new ResizeObserver(() => {
        // Only a width change moves a stop; a height change is this layout's own result.
        if (block.offsetWidth === width) return;
        width = block.offsetWidth;
        layout();
      });
      observer.observe(block);
    }
    let live = true;
    document.fonts?.ready.then(() => live && layout());
    return () => {
      live = false;
      observer?.disconnect();
    };
  }, []);
  return ref;
}

/** Does any run carry a typed tab? */
export function hasTab(runs: ReadonlyArray<{ text: string }>): boolean {
  return runs.some((run) => run.text.includes('\t'));
}
