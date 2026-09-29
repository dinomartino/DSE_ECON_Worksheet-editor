import { insertQuestionAt } from '@/model/flow';
import type { Question, Worksheet } from '@/model/types';

/**
 * Where a question dragged from the 題庫 tab would land — the gesture's pure half.
 *
 * A slot is a gap of the resolved flow (`flowOf`): 0 is before everything, n after the
 * n-th item. Gaps either side of a section marker are different slots (a section is a
 * marker, so the question joins whichever section precedes it). The page draws the
 * provisional question *in* the slot, so the geometry moves under the pointer when the
 * slot changes; the rules below keep that from feeding back into a flicker.
 */

/** One rendered flow item (or a fragment of one split across sheets), in client px. */
export interface SlotBox {
  /** The item's gap-before index: its position in the base flow (without the ghost). */
  index: number;
  top: number;
  bottom: number;
  /** A page a break opened that holds nothing yet: anywhere on it means "after the break". */
  blank?: boolean;
}

export interface SlotGeometry {
  /** The pointer is over the body of the sheets (not the cover, not off the page column). */
  onPage: boolean;
  /** Over a header or footer band: not a target, so the slot holds. */
  overBand?: boolean;
  items: readonly SlotBox[];
  /** The provisional question's own boxes. Over it, the slot holds (it *is* the slot). */
  ghost: ReadonlyArray<{ top: number; bottom: number }>;
}

export interface SlotOptions {
  /** The last gap a question may take (`lastQuestionGap`: not after "END OF PAPER"). */
  maxSlot: number;
  /** How far past an item's midpoint the pointer must go to flip sides. */
  hysteresisPx?: number;
}

export const SLOT_HYSTERESIS_PX = 8;

const within = (y: number, box: { top: number; bottom: number }) => y >= box.top && y <= box.bottom;

/**
 * The slot for pointer height `y`, given the current one. `null` = no target (the page
 * returns to how it is; a release there cancels).
 */
export function pickSlot(y: number, geometry: SlotGeometry, current: number | null, options: SlotOptions): number | null {
  if (!geometry.onPage) return null;
  const clamp = (slot: number) => Math.max(0, Math.min(options.maxSlot, slot));
  if (geometry.overBand) return current;
  if (current !== null && geometry.ghost.some((box) => within(y, box))) return current;

  const items = [...geometry.items].sort((a, b) => a.top - b.top);
  if (items.length === 0) return clamp(0);

  const hit = items.find((box) => within(y, box));
  if (hit) {
    if (hit.blank) return clamp(hit.index + 1);
    const mid = (hit.top + hit.bottom) / 2;
    const candidate = clamp(y < mid ? hit.index : hit.index + 1);
    // Near the midpoint, a slot already on this item's edge stays put: the provisional
    // question moving to the other side shifts the item, and the pointer with it.
    const margin = Math.min(options.hysteresisPx ?? SLOT_HYSTERESIS_PX, (hit.bottom - hit.top) / 4);
    const onThisEdge = current === clamp(hit.index) || current === clamp(hit.index + 1);
    if (current !== null && candidate !== current && onThisEdge && Math.abs(y - mid) < margin) return current;
    return candidate;
  }

  // Between items (a sheet gap, blank paper under the last item, a sheet's top margin).
  let above: SlotBox | undefined;
  let below: SlotBox | undefined;
  for (const box of items) {
    if (box.bottom < y) above = box;
    else if (box.top > y && !below) below = box;
  }
  if (!above) return clamp(below!.index);
  if (!below) return clamp(above.index + 1);
  if (below.index <= above.index + 1) return clamp(above.index + 1);
  // Items the page does not draw lie between: take the nearer edge.
  return clamp(y - above.bottom <= below.top - y ? above.index + 1 : below.index);
}

/**
 * The page as it would read with `ghost` dropped at `slot`: a derived value, never
 * stored. Existing questions keep their object identity, so the render cache still
 * holds them; only the ones the insert renumbers render again.
 */
export function provisionalWorksheet(worksheet: Worksheet, ghost: Question, slot: number): Worksheet {
  return { ...worksheet, ...insertQuestionAt(worksheet, ghost, slot) };
}
