import type { ApplyReport, TranslationWrite } from './textSlots';
import type { Worksheet } from './types';

/**
 * Apply a batch of writes in one pass, each guarded against the text having changed since
 * it was read. Identity-preserving: an all-stale batch returns the input worksheet. The
 * editor's mode is not an input (a diagram is re-measured bilingually).
 */
export function applyTranslationBatch(
  ws: Worksheet,
  writes: readonly TranslationWrite[],
): { worksheet: Worksheet; report: ApplyReport } {
  // P-TEXT replaces this body
  return {
    worksheet: ws,
    report: { applied: 0, skipped: writes.map((w) => ({ path: w.path, reason: 'gone' as const })), resized: 0 },
  };
}
