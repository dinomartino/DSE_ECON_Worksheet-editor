import type { RailEntry, RailPart, RailSection } from './bankScreen';

/**
 * The review rail drawn as a window (a bank of thousands of questions): every heading and
 * entry is a row with a height (measured once drawn, estimated before), and only the rows
 * near the scroll position are in the page, between two spacers of the rest's height.
 * Pure arithmetic here; `ReviewPage`'s `Rail` draws it.
 */

/** From this many entries the rail draws a window; below it, every row (as it always did). */
export const RAIL_WINDOW_FROM = 150;
/** Rows drawn beyond each edge of the view, in pixels: a fast scroll never shows a gap. */
export const RAIL_OVERSCAN_PX = 800;

export type RailRow =
  | { kind: 'section'; key: string; section: RailSection; sectionIndex: number }
  | { kind: 'part'; key: string; part: RailPart; sectionIndex: number }
  | { kind: 'entry'; key: string; entry: RailEntry; sectionIndex: number; where: boolean };

/** The rail in reading order: each section's heading, its 題型 headings, its entries. */
export function railRows(sections: readonly RailSection[], hasWhere: (entry: RailEntry) => boolean): RailRow[] {
  const rows: RailRow[] = [];
  sections.forEach((section, sectionIndex) => {
    rows.push({ kind: 'section', key: `s:${section.key}`, section, sectionIndex });
    for (const part of section.parts ?? [{ key: '', label: '', entries: section.entries }]) {
      if (part.key) rows.push({ kind: 'part', key: `p:${section.key}|${part.key}`, part, sectionIndex });
      for (const entry of part.entries) rows.push({ kind: 'entry', key: `e:${entry.key}`, entry, sectionIndex, where: hasWhere(entry) });
    }
  });
  return rows;
}

/** A row's height before it has been drawn (close to the drawn one, so the scrollbar barely moves). */
export function estimatedHeight(row: RailRow): number {
  if (row.kind === 'section') return 30;
  if (row.kind === 'part') return 24;
  // Most excerpts take two lines at the rail's width; a "tests this" line adds two more.
  return row.where ? 96 : 66;
}

/** Each row's top, and the total height last: `offsets[i]` is row i's top, `offsets[n]` the end. */
export function rowOffsets(rows: readonly RailRow[], measured: ReadonlyMap<string, number>): number[] {
  const offsets = new Array<number>(rows.length + 1);
  offsets[0] = 0;
  for (let i = 0; i < rows.length; i++) offsets[i + 1] = offsets[i] + (measured.get(rows[i].key) ?? estimatedHeight(rows[i]));
  return offsets;
}

/** The first row whose bottom is below `y` (binary search over `offsets`). */
export function rowAt(offsets: readonly number[], y: number): number {
  let low = 0;
  let high = offsets.length - 2;
  if (high < 0) return 0;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (offsets[mid + 1] <= y) low = mid + 1;
    else high = mid;
  }
  return low;
}

/** The rows to draw, `[start, end)`: those in the view, plus `overscan` pixels each side. */
export function visibleRange(offsets: readonly number[], scrollTop: number, viewport: number, overscan = RAIL_OVERSCAN_PX): [number, number] {
  const count = offsets.length - 1;
  if (count <= 0) return [0, 0];
  const start = rowAt(offsets, Math.max(0, scrollTop - overscan));
  const end = Math.min(count, rowAt(offsets, scrollTop + viewport + overscan) + 1);
  return [start, end];
}

/**
 * The scroll position that brings row `index` into view the least distance ("nearest"),
 * kept below a sticky heading `stickyTop` tall; `undefined` when it is already in view.
 */
export function scrollToShow(offsets: readonly number[], index: number, scrollTop: number, viewport: number, stickyTop = 0): number | undefined {
  const top = offsets[index];
  const bottom = offsets[index + 1];
  if (top === undefined || bottom === undefined) return undefined;
  if (top - stickyTop < scrollTop) return Math.max(0, top - stickyTop);
  if (bottom > scrollTop + viewport) return Math.max(0, bottom - viewport);
  return undefined;
}
