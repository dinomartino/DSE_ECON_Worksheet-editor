import type { ContentBlock } from '@/model/types';

/**
 * Figures in a grid's cells (MC options two per row, a stem's figure grid, k-0545): each is
 * fitted to its cell as printed, the stored size untouched.
 */

const TWIPS_PER_PX = 15;
/** Kept clear between two figures of a grid row. */
export const CELL_GUTTER_PX = 8;
/** The most of its cell a table option spans. */
const TABLE_IN_CELL = 0.9;

/** One cell's width in px when `perRow` cells share a text column `textWidth` twips wide, less a gutter. */
export function cellWidthPx(textWidth: number, perRow: number): number {
  return Math.floor(textWidth / Math.max(1, perRow) / TWIPS_PER_PX) - CELL_GUTTER_PX;
}

/**
 * A grid cell's figures, any wider than the cell scaled down to it (height in proportion),
 * as printed only: the stored size is untouched. A past paper's diagram option can be a few
 * pixels wider than half the page, and a fixed-width Word cell would cut it off.
 */
export function fitToCell(blocks: ContentBlock[], maxPx: number): ContentBlock[] {
  if (maxPx <= 0) return blocks;
  let changed = false;
  const fitted = blocks.map((block) => {
    // A table as an option (four tables, A to D) leaves a gap to its neighbour's, or the two
    // read as one table across the row.
    if (block.kind === 'table') {
      if ((block.width ?? 1) <= TABLE_IN_CELL) return block;
      changed = true;
      return { ...block, width: TABLE_IN_CELL };
    }
    if ((block.kind !== 'image' && block.kind !== 'diagram') || block.widthPx <= maxPx) return block;
    changed = true;
    return { ...block, widthPx: maxPx, heightPx: Math.round((block.heightPx * maxPx) / block.widthPx) };
  });
  return changed ? fitted : blocks;
}
