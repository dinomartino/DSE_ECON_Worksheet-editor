import type { EditTarget } from '@/render/ir';
import type { Side, TextSlot, TextVisitor } from './textSlots';
import type { BiText, DiagramBlock, OutputMode, Worksheet } from './types';

/**
 * The one identity-preserving walk over every BiText in a worksheet, in print order.
 * Collection, the untranslated count, scoping, Check terms and apply all go through it,
 * so they cannot disagree. A visit that changes nothing returns the same `Worksheet`.
 */

export interface WalkOptions {
  /** Called only for a DiagramBlock whose `diagram` object changed; returns the block to store. */
  onDiagramChanged?: (before: DiagramBlock, after: DiagramBlock) => DiagramBlock;
}

export function mapWorksheetTexts(ws: Worksheet, visit: TextVisitor, opts?: WalkOptions): Worksheet {
  // P-TEXT replaces this body
  void visit;
  void opts;
  return ws;
}

/** Every slot in printed order (identity visitor that records). */
export function collectTexts(ws: Worksheet): TextSlot[] {
  // P-TEXT replaces this body
  void ws;
  return [];
}

/** All slots whose `target` deep-equals `target` (≥2 when Duplicate shared block ids). */
export function slotsForTarget(ws: Worksheet, target: EditTarget): TextSlot[] {
  // P-TEXT replaces this body
  void ws;
  void target;
  return [];
}

/** Missing one side that this edition prints, and not a symbol-only text that prints fine. */
export function needsTranslation(slot: TextSlot, mode: Pick<OutputMode, 'language' | 'version'>): boolean {
  // P-TEXT replaces this body
  void slot;
  void mode;
  return false;
}

export function countUntranslated(ws: Worksheet, mode: Pick<OutputMode, 'language' | 'version'>): number {
  // P-TEXT replaces this body
  void ws;
  void mode;
  return 0;
}

/** BiTextField's tag and fill button: the missing side, or null when both/neither are
 *  present or the present side is symbol-only (a copy would print twice in EN+中). */
export function fieldNeedsFill(text: BiText): Side | null {
  // P-TEXT replaces this body
  void text;
  return null;
}
