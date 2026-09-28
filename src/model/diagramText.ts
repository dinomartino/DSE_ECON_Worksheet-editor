import type { Diagram } from './diagram';
import type { SlotKind } from './textSlots';
import type { BiText } from './types';

/** Structural, identity-preserving map over every BiText in a Diagram. Optional fields stay optional. */
export function mapDiagramTexts(d: Diagram, fn: (segment: string, text: BiText, kind: SlotKind) => BiText): Diagram {
  // P-TEXT replaces this body
  void fn;
  return d;
}
