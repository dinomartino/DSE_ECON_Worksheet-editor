/**
 * The HKDSE flow figures (k-0588, audit k-0583 tasks D1/D2), built as the editor stores
 * them. Shared by `render/flowFigures.test.ts`, the frozen corpus
 * `scripts/emit-v4-flow-corpus.test.ts` and the AI flow spec's tests.
 *
 * Wording is the paper's; the Chinese is the editor's own (the Chinese papers' wording
 * was not checked word for word).
 */
import type { Diagram, FlowArrow, FlowChart, FlowNode } from '@/model/diagram';
import { bi } from '@/model/text';

export const chart = (flow: FlowChart): Diagram => ({
  x: {},
  y: {},
  curves: [],
  points: [],
  labels: [],
  arrows: [],
  flow,
});
export const node = (id: string, en: string, zh: string, col: number, row: number): FlowNode => ({
  id,
  label: bi(en, zh),
  col,
  row,
});
export const arrow = (id: string, from: string, to: string, extra: Partial<FlowArrow> = {}): FlowArrow => ({
  id,
  from,
  to,
  ...extra,
});

/** HKDSE 2026 P1 Q5: households and firms, Flow X (dashed, over the top) and Flow Y. */
export function dse2026q5(): Diagram {
  return chart({
    nodes: [node('h', 'Households', '住戶', 0, 0), node('f', 'Firms', '廠商', 1, 0)],
    arrows: [
      arrow('y', 'f', 'h', { route: 'above', labelBelow: bi('Flow Y', '流量 Y') }),
      arrow('x', 'h', 'f', { route: 'above', dashed: true, label: bi('Flow X', '流量 X') }),
      arrow('real2', 'h', 'f', { route: 'below' }),
      arrow('money2', 'f', 'h', { route: 'below', dashed: true }),
    ],
    key: { dashed: bi('Money flow', '貨幣流程'), solid: bi('Real flow', '實質流程') },
  });
}

/** HKDSE 2014 P1 Q10: three production stages in a triangle, a pair of arrows on each side. */
export function dse2014q10(): Diagram {
  return chart({
    layout: 'grid',
    nodes: [
      node('p', 'Primary\nProduction', '一級生產', 1, 0),
      node('s', 'Secondary\nProduction', '二級生產', 0, 1),
      node('t', 'Tertiary\nProduction', '三級生產', 2, 1),
    ],
    arrows: [
      arrow('e1', 's', 'p', { label: bi('E', 'E') }),
      arrow('e2', 'p', 's'),
      arrow('f1', 'p', 't', { label: bi('F', 'F') }),
      arrow('f2', 't', 'p'),
      arrow('st', 's', 't'),
      arrow('ts', 't', 's'),
    ],
  });
}

/** HKDSE 2024 P1 Q6: households over primary production, P and Q, one- and two-way links. */
export function dse2024q6(): Diagram {
  return chart({
    layout: 'grid',
    nodes: [
      node('h', 'Households', '住戶', 1, 0),
      node('p', 'Primary Production', '一級生產', 1, 1),
      node('s', 'Secondary Production', '二級生產', 0, 2),
      node('t', 'Tertiary Production', '三級生產', 2, 2),
    ],
    arrows: [
      arrow('ph', 'p', 'h'),
      arrow('P', 's', 'h', { label: bi('P', 'P') }),
      arrow('th', 't', 'h'),
      arrow('sp', 's', 'p'),
      arrow('ps', 'p', 's'),
      arrow('Q', 't', 'p', { label: bi('Q', 'Q') }),
      arrow('pt', 'p', 't'),
      arrow('ts', 't', 's'),
      arrow('st', 's', 't'),
    ],
  });
}


/**
 * HKDSE 2021 P1 Q23: a value-added chain, as every build since v0.8.7 draws it — two
 * sources into supermarkets, two buyers, an entering stub with words on both sides, and
 * a bare "increase in inventory" note under the farmers.
 */
export function dse2021q23(): Diagram {
  return chart({
    nodes: [
      node('imp', 'Local importers', '本地進口商', 0, 0),
      node('farm', 'Local farmers', '本地農民', 0, 1),
      { ...node('inv', 'increase in inventory\n$50', '存貨增加\n$50', 0, 2), boxed: false },
      node('sup', 'Local supermarkets', '本地超級市場', 1, 0),
      node('con', 'Local consumers', '本地消費者', 2, 0),
      node('tour', 'Foreign tourists', '外國遊客', 2, 1),
    ],
    arrows: [
      { id: 'raw', to: 'imp', label: bi('$200', '$200'), labelBelow: bi('raw materials', '原料') },
      arrow('a400', 'imp', 'sup', { label: bi('$400', '$400') }),
      arrow('a600', 'farm', 'sup', { labelBelow: bi('$600', '$600') }),
      arrow('a50', 'farm', 'inv'),
      arrow('a1200', 'sup', 'con', { label: bi('$1 200\n($100 sales tax inclusive)', '$1 200\n（包括 $100 銷售稅）') }),
      arrow('a500', 'sup', 'tour', { labelBelow: bi('$500', '$500') }),
    ],
  });
}
