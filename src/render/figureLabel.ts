import type { BiText, TableAlign } from '@/model/types';
import { plain } from '@/model/text';
import type { RenderNode } from './ir';

/**
 * Diagrams numbered (1) to (4) (k-0555, u-g93j): on the HKDSE papers each number sits at the
 * upper-left corner of its own diagram, not centred above it. The IR marks such a label
 * (`OptionRowNode.figureLabels`, `TableNodeCell.labelAtImage`); each backend then starts the
 * label where its figure starts, the figure itself staying exactly where it was.
 */

const TWIPS_PER_PX = 15;

/** "(1)", "（2）", "(iii)", "(b)": a diagram's number, in every language that has text. */
const NUMBER_LABEL = /^[(（]\s*(?:\d{1,2}|[ivx]{1,4}|[a-h])\s*[)）]$/i;

export function isFigureNumberLabel(text: BiText): boolean {
  const sides = [plain(text.en).trim(), plain(text.zh).trim()].filter((side) => side.length > 0);
  return sides.length > 0 && sides.every((side) => NUMBER_LABEL.test(side));
}

/**
 * How far in from its cell's left edge a label starts so it sits over its figure's left edge,
 * in twips: the figure is `figurePx` wide and sits by `align` in a cell `cellTwips` wide.
 * Never negative: a figure as wide as its cell starts at the cell's edge, and so does its label.
 */
export function figureLabelIndent(cellTwips: number, figurePx: number, align: TableAlign = 'center'): number {
  const free = Math.max(0, cellTwips - figurePx * TWIPS_PER_PX);
  if (align === 'left') return 0;
  return Math.round(align === 'right' ? free : free / 2);
}

/**
 * A figure grid cell (§ `OptionRowNode.figureLabels`) for a backend that places by indent (the
 * `.docx`, the clipboard): its label lines indented to where its figure starts in a cell
 * `cellTwips` wide with no margins, so "(1)" sits at the figure's upper-left corner.
 */
export function withLabelsAtFigure(cellNodes: RenderNode[], cellTwips: number): RenderNode[] {
  const figure = cellNodes.find(
    (child): child is Extract<RenderNode, { kind: 'image' | 'diagram' }> =>
      child.kind === 'image' || child.kind === 'diagram',
  );
  if (!figure) return cellNodes;
  const offset = figureLabelIndent(cellTwips, figure.widthPx, figure.align);
  if (offset === 0) return cellNodes;
  return cellNodes.map((child) =>
    child.kind === 'columns' ? { ...child, indent: (child.indent ?? 0) + offset } : child,
  );
}
