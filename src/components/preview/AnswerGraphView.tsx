'use client';

import { useMemo } from 'react';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { LanguageMode } from '@/model/types';
import { answerGraphBox, answerGraphSvg } from '@/render/answerGraph';
import type { AnswerGraphNode } from '@/render/ir';
import { useWorksheetStore } from '@/store/worksheetStore';

/**
 * A graph answer space on the page (§ `AnswerGraphNode`): the same SVG the export
 * rasterises, in a box exactly `lines` × 12pt tall. The picture sits at the box's
 * bottom, as Word seats an inline picture on its line's baseline; the inset is above.
 * Paper content, so it prints — no chrome, nothing to hide.
 */
export function AnswerGraphView({
  node,
  language,
}: {
  node: AnswerGraphNode;
  language: LanguageMode;
}) {
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);
  // A number, so the selector is stable between renders.
  const textWidth = useWorksheetStore((s) => contentWidth(pageSetupOf(s.worksheet)));
  const box = answerGraphBox(node, textWidth);

  // Memoised for the reason `DiagramNodeView` is: a fresh string handed to
  // `dangerouslySetInnerHTML` makes the browser reparse the SVG on every render.
  const svg = useMemo(
    () =>
      answerGraphSvg(node, {
        widthPx: box.widthPx,
        heightPx: box.imageHeightPx,
        language,
        fonts,
      }),
    [node, box.widthPx, box.imageHeightPx, language, fonts],
  );

  return (
    <div
      data-answer-graph=""
      role="img"
      aria-label="Blank axes for a diagram"
      style={{
        height: `${node.lines * 12}pt`,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: node.widthShare < 1 ? 'center' : 'flex-start',
        lineHeight: 0,
      }}
    >
      <div
        style={{ width: `${box.widthPx}px`, height: `${box.imageHeightPx}px` }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
