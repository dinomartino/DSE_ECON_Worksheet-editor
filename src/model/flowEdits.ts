import { nanoid } from 'nanoid';
import type { FlowChart, FlowNode } from './diagram';
import { emptyBiText } from './text';

/**
 * The flow chart's editing verbs, pure so the flow editor stays a shell around them.
 *
 * Placement is slot-based (§ the flow variant): a verb targets a **column value and an
 * insertion index**, never a pixel position, and every write renumbers the touched
 * column 0..k so ties and gaps cannot survive an edit. Column values stay free
 * integers — the layout compacts their sorted order, which is what lets "a new column
 * left of everything" simply be `minCol - 1`.
 */

/** Move a box into `col`, landing at `index` among that column's other boxes. */
export function moveNodeToSlot(
  flow: FlowChart,
  nodeId: string,
  col: number,
  index: number,
): FlowChart {
  const node = flow.nodes.find((n) => n.id === nodeId);
  if (!node) return flow;
  const column = flow.nodes
    .filter((n) => n.col === col && n.id !== nodeId)
    .sort((a, b) => a.row - b.row);
  const clamped = Math.max(0, Math.min(index, column.length));
  const order = [...column.slice(0, clamped), node, ...column.slice(clamped)];
  const rowById = new Map(order.map((n, row) => [n.id, row]));
  return {
    ...flow,
    nodes: flow.nodes.map((n) =>
      n.id === nodeId
        ? { ...n, col, row: rowById.get(n.id)! }
        : rowById.has(n.id)
          ? { ...n, row: rowById.get(n.id)! }
          : n,
    ),
  };
}

/** Append a new empty box at the bottom of `col`, returning it for selection. */
export function addFlowNode(flow: FlowChart, col: number): { flow: FlowChart; node: FlowNode } {
  const bottom = flow.nodes
    .filter((n) => n.col === col)
    .reduce((max, n) => Math.max(max, n.row), -1);
  const node: FlowNode = { id: nanoid(10), label: emptyBiText(), col, row: bottom + 1 };
  return { flow: { ...flow, nodes: [...flow.nodes, node] }, node };
}

/**
 * Delete a box. Arrows lose the deleted endpoint but survive as stubs; one with no
 * end left is pointing at nothing and goes with the box.
 */
export function removeFlowNode(flow: FlowChart, nodeId: string): FlowChart {
  return {
    nodes: flow.nodes.filter((node) => node.id !== nodeId),
    arrows: flow.arrows
      .map((arrow) => ({
        ...arrow,
        from: arrow.from === nodeId ? undefined : arrow.from,
        to: arrow.to === nodeId ? undefined : arrow.to,
      }))
      .filter((arrow) => arrow.from || arrow.to),
  };
}

/**
 * Connect an arrow between two boxes (either end open = a stub). Returns null for a
 * gesture that names nothing or one box twice — those draw nothing worth storing.
 */
export function connectFlow(
  flow: FlowChart,
  from: string | undefined,
  to: string | undefined,
): { flow: FlowChart; arrowId: string } | null {
  if (!from && !to) return null;
  if (from && from === to) return null;
  const arrowId = nanoid(10);
  return {
    flow: { ...flow, arrows: [...flow.arrows, { id: arrowId, from, to }] },
    arrowId,
  };
}
