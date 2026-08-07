import { describe, expect, it } from 'vitest';
import type { FlowChart } from './diagram';
import { bi } from './text';
import { addFlowNode, connectFlow, moveNodeToSlot, removeFlowNode } from './flowEdits';

/**
 * The flow editor's verbs (§ the flow variant). Slot moves renumber the touched
 * column, endpoint cleanup keeps arrows honest — each rule the canvas leans on.
 */

const chart = (): FlowChart => ({
  nodes: [
    { id: 'a', label: bi('Mill', '磨坊'), col: 0, row: 0 },
    { id: 'b', label: bi('Bakery', '麵包店'), col: 1, row: 0 },
    { id: 'c', label: bi('Consumers', '消費者'), col: 2, row: 0 },
    { id: 'd', label: bi('Hotels', '酒店'), col: 2, row: 1 },
  ],
  arrows: [
    { id: 'r1', from: 'a', to: 'b' },
    { id: 'r2', from: 'b', to: 'c' },
    { id: 'r3', to: 'a' },
  ],
});

describe('flow chart edit verbs', () => {
  it('moves a box into another column at the asked index, renumbering that column', () => {
    const next = moveNodeToSlot(chart(), 'a', 2, 1);
    const a = next.nodes.find((n) => n.id === 'a')!;
    expect(a.col).toBe(2);
    expect(a.row).toBe(1);
    // The column reads c, a, d from top to bottom, rows 0..2 with no gaps or ties.
    const col2 = next.nodes.filter((n) => n.col === 2).sort((n, m) => n.row - m.row);
    expect(col2.map((n) => n.id)).toEqual(['c', 'a', 'd']);
    expect(col2.map((n) => n.row)).toEqual([0, 1, 2]);
  });

  it('clamps the index and reorders within the same column', () => {
    const next = moveNodeToSlot(chart(), 'c', 2, 99);
    const col2 = next.nodes.filter((n) => n.col === 2).sort((n, m) => n.row - m.row);
    expect(col2.map((n) => n.id)).toEqual(['d', 'c']);
  });

  it('accepts a column value below every existing one — a new leftmost column', () => {
    const next = moveNodeToSlot(chart(), 'd', -1, 0);
    expect(next.nodes.find((n) => n.id === 'd')!.col).toBe(-1);
  });

  it('appends a new empty box at the bottom of its column', () => {
    const { flow, node } = addFlowNode(chart(), 2);
    expect(node.col).toBe(2);
    expect(node.row).toBe(2);
    expect(flow.nodes).toHaveLength(5);
  });

  it('deleting a box downgrades its arrows to stubs and drops one left with no end', () => {
    const next = removeFlowNode(chart(), 'a');
    // r1 lost its start and survives as an entering stub; r3 lost its only end.
    expect(next.arrows.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(next.arrows[0].from).toBeUndefined();
    expect(next.arrows[0].to).toBe('b');
  });

  it('connects boxes, allows one open end, and refuses an arrow that names nothing', () => {
    const drawn = connectFlow(chart(), 'c', 'd');
    expect(drawn).not.toBeNull();
    expect(drawn!.flow.arrows).toHaveLength(4);

    const stub = connectFlow(chart(), undefined, 'a');
    expect(stub!.flow.arrows.at(-1)!.from).toBeUndefined();

    expect(connectFlow(chart(), undefined, undefined)).toBeNull();
    expect(connectFlow(chart(), 'a', 'a')).toBeNull();
  });
});
