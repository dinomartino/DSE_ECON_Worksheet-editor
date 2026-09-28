import { diagramSize } from '@/render/diagram';
import { normalizeRuns } from './text';
import { sameRuns, type ApplyReport, type TextPath, type TranslationWrite } from './textSlots';
import { mapWorksheetTexts } from './textWalk';
import type { DiagramBlock, Worksheet } from './types';

/**
 * A diagram whose text changed is re-measured in `'bilingual'`, the superset, before and
 * after: it takes the new size only when that measure moved (the `DiagramCanvas` delta
 * rule), so a legacy or canvas-sized box whose text needs no new room keeps its size, and
 * the editor's mode never matters. A crop keeps its frame.
 */
function resizeForText(before: DiagramBlock, after: DiagramBlock): DiagramBlock {
  if (after.diagram.crop) return after;
  const was = diagramSize(before.diagram, before.widthPx, 'bilingual');
  const now = diagramSize(after.diagram, after.widthPx, 'bilingual');
  if (was.widthPx === now.widthPx && was.heightPx === now.heightPx) return after;
  if (now.widthPx === after.widthPx && now.heightPx === after.heightPx) return after;
  return { ...after, ...now };
}

/**
 * Apply a batch of writes in one pass, each guarded against the text having changed since
 * it was read. Identity-preserving: an all-stale batch returns the input worksheet. The
 * editor's mode is not an input (a diagram is re-measured bilingually).
 */
export function applyTranslationBatch(
  ws: Worksheet,
  writes: readonly TranslationWrite[],
): { worksheet: Worksheet; report: ApplyReport } {
  const byPath = new Map(writes.map((write) => [write.path, write]));
  const hit = new Set<TextPath>();
  const skipped: ApplyReport['skipped'] = [];
  let applied = 0;
  let resized = 0;

  const worksheet = mapWorksheetTexts(
    ws,
    (slot) => {
      const write = byPath.get(slot.path);
      if (!write) return slot.text;
      hit.add(slot.path);
      const other = write.side === 'zh' ? 'en' : 'zh';
      if (!sameRuns(slot.text[other], write.sourceSnapshot)) {
        skipped.push({ path: slot.path, reason: 'sourceChanged' });
        return slot.text;
      }
      if (!sameRuns(slot.text[write.side], write.targetSnapshot)) {
        skipped.push({ path: slot.path, reason: 'targetChanged' });
        return slot.text;
      }
      applied += 1;
      const next = normalizeRuns(write.next.map((run) => ({ ...run })));
      // Writing what is already there is a no-op, not an edit.
      if (sameRuns(slot.text[write.side], next)) return slot.text;
      return { ...slot.text, [write.side]: next };
    },
    {
      onDiagramChanged: (before, after) => {
        const next = resizeForText(before, after);
        if (next !== after) resized += 1;
        return next;
      },
    },
  );

  for (const write of writes) {
    if (!hit.has(write.path)) skipped.push({ path: write.path, reason: 'gone' });
  }
  return { worksheet, report: { applied, skipped, resized } };
}
