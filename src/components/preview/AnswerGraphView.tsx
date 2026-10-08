'use client';

import { useMemo } from 'react';
import {
  ANSWER_GRAPH_LINE_PT,
  ANSWER_GRAPH_MAX_LINES,
  ANSWER_GRAPH_MIN_LINES,
} from '@/model/answerGraph';
import { contentWidth, pageSetupOf } from '@/model/page';
import type { LanguageMode } from '@/model/types';
import { answerGraphBox, answerGraphSvg } from '@/render/answerGraph';
import type { AnswerGraphNode, SchemeAddress } from '@/render/ir';
import { useWorksheetStore } from '@/store/worksheetStore';
import { useMessages } from '@/i18n/language';
import { PREVIEW_HANDLE_MESSAGES } from './messages';
import { ResizableRows } from './ResizableRows';

/** Page px per 12pt line: the drag's unit. */
const LINE_PX = (ANSWER_GRAPH_LINE_PT * 96) / 72;

/** A stable string for the leaf owning a box, so the page can name the selected one. */
export function answerGraphKey(owner: SchemeAddress): string {
  return [owner.questionId, owner.partId ?? '', owner.subPartId ?? ''].join('/');
}

/** What the page needs to select and resize a box; absent on read-only paths. */
export interface AnswerGraphPageControls {
  /** Preview zoom, so a pointer delta converts to page pixels. */
  scale: number;
  selectedKey?: string;
  onSelect: (owner: SchemeAddress) => void;
  /** Called once per gesture, on release. */
  onResize: (owner: SchemeAddress, lines: number) => void;
}

/**
 * A graph answer space with its page chrome: click to select, drag the bottom edge to
 * change its height in whole lines (6–40). Like `SizedRows`, the read-only and print
 * paths take the plain view, so they hold no chrome at all.
 */
export function AnswerGraphOnPage({
  node,
  language,
  controls,
}: {
  node: AnswerGraphNode;
  language: LanguageMode;
  controls?: AnswerGraphPageControls;
}) {
  const m = useMessages(PREVIEW_HANDLE_MESSAGES);
  const owner = node.owner;
  if (!controls || !owner) return <AnswerGraphView node={node} language={language} />;
  const key = answerGraphKey(owner);
  return (
    <ResizableRows
      elementId={key}
      value={node.lines}
      pxPerUnit={LINE_PX}
      min={ANSWER_GRAPH_MIN_LINES}
      // The cap is the model's, not the page's: a box always fits one page whole.
      maxFor={() => Math.max(0, ANSWER_GRAPH_MAX_LINES - node.lines) * LINE_PX}
      step={1}
      unit={['line', 'lines']}
      scale={controls.scale}
      selected={controls.selectedKey === key}
      onSelect={() => controls.onSelect(owner)}
      onResize={(_, lines) => controls.onResize(owner, lines)}
      handleLabel={m.dragGraph}
      capNote={m.graphLargest}
    >
      {(lines) => (
        <AnswerGraphView
          node={lines === node.lines ? node : { ...node, lines }}
          language={language}
        />
      )}
    </ResizableRows>
  );
}

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
      aria-label="Blank axes for a diagram" // i18n-ignore: alt text of a printed graph
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
