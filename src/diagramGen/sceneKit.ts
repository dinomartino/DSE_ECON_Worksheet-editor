import type { Diagram, DiagramAnchorRef, DiagramAreaEdge, DiagramArrow, DiagramCurve, DiagramPointMark, DiagramSpan } from '@/model/diagram';
import { resolveAnchor } from '@/model/diagramAnchors';
import { point } from '@/model/diagramTemplateKit';
import type { BiText } from '@/model/types';
import type { StagePlan } from './stageCatalogue';
import type { TradeNumbers } from './trade';
import { phrase } from './text';
import type { CurveRole, SpecText } from './types';

/**
 * What every scene drafter shares (k-0589: split out of `scene.ts` so the monopoly drafter can use
 * it without a cycle): the draft's shape, tick points, area bands and the facts of a two-state
 * figure. Pure helpers; no scene knowledge.
 */

/** Ticks closer than this read as one. */
export const MIN_GAP = 0.06;
export const TOP = 0.92;

export const level = (ref: DiagramAnchorRef | number): DiagramAreaEdge => ({ level: ref });
export const on = (c: DiagramCurve): DiagramAreaEdge => ({ curve: c.id });
export const at = (p: DiagramPointMark): DiagramAnchorRef => ({ point: p.id });

export interface Band {
  edges: [DiagramAreaEdge, DiagramAreaEdge];
  from: number | DiagramAnchorRef;
  to: number | DiagramAnchorRef;
  cap?: DiagramAreaEdge;
}
/** Under `d` and above `lvl`, from the y-axis: capped by d, so a steep demand that starts below the top still closes it. */
export const underFromAxis = (d: DiagramCurve, lvl: DiagramAreaEdge, to: DiagramAnchorRef): Band => ({ edges: [level(TOP), lvl], from: 0, to, cap: on(d) });
export const band = (edges: [DiagramAreaEdge, DiagramAreaEdge], from: number | DiagramAnchorRef, to: number | DiagramAnchorRef, cap?: DiagramAreaEdge): Band => ({ edges, from, to, ...(cap ? { cap } : {}) });

export function scratchOf(parts: Array<DiagramCurve | DiagramPointMark>): Diagram {
  return {
    x: {},
    y: {},
    curves: parts.filter((p): p is DiagramCurve => 'points' in p),
    points: parts.filter((p): p is DiagramPointMark => 'at' in p),
    labels: [],
    arrows: [],
  };
}

export function resolveIn(d: Diagram, ref: DiagramAnchorRef): { x: number; y: number } {
  const p = resolveAnchor(d, ref);
  if (!p) throw new Error('scene anchor does not resolve');
  return p;
}

/** A tick-carrying point at `ref`: dashed drops to the axes whose ticks it prints (or that bound a region). */
export function tickPoint(
  ref: DiagramAnchorRef,
  parts: Array<DiagramCurve | DiagramPointMark>,
  ticks: { x?: BiText | null; y?: BiText | null },
): DiagramPointMark {
  const where = resolveIn(scratchOf(parts), ref);
  const drops: Array<'x' | 'y'> = [];
  if (ticks.x !== undefined) drops.push('x');
  if (ticks.y !== undefined) drops.push('y');
  return point(where.x, where.y, undefined, {
    anchor: ref,
    dot: false,
    dropTo: drops,
    ...(ticks.x ? { xTickLabel: ticks.x } : {}),
    ...(ticks.y ? { yTickLabel: ticks.y } : {}),
  });
}

/** One state of a two-state scene, in unit space: what a student compares. */
export interface StateFacts {
  /** The control is effective (a monopoly: always false). */
  binds: boolean;
  quantity: number;
  /** The price buyers pay (and sellers receive). */
  price: number;
  cs: number;
  ps: number;
  tss: number;
  dwl: number;
  shortage: number;
  surplus: number;
  /** A monopoly (k-0589): the efficient output, where D meets MC. */
  efficient?: number;
}
export interface StageFacts {
  /** A two-state control (k-0587); absent for a monopoly (k-0589). */
  plan?: StagePlan;
  before: StateFacts;
  after: StateFacts;
  /** The same change with other slopes and sizes: a claim holds only when every one agrees. */
  variants?: Array<{ before: StateFacts; after: StateFacts }>;
}

export interface Draft {
  curves: DiagramCurve[];
  points: DiagramPointMark[];
  arrows: DiagramArrow[];
  /** Shift arrows to place once every point is known (they keep clear of lettered points too). */
  shifts?: Array<{ source: DiagramCurve; copy: DiagramCurve; by: { x: number; y: number } }>;
  spans?: DiagramSpan[];
  x: BiText;
  y: BiText;
  regions: Record<string, Band>;
  curveRoles: Record<string, { curve: DiagramCurve; role: CurveRole }>;
  levels: Record<string, { vertical: boolean; at: number }>;
  /** Tick part → the point whose drop carries it (for lettered points at a tick's quantity or price). */
  marks: Record<string, DiagramPointMark>;
  /** Stand-ins a catalogue point may name: the externality's `other` and `private` curves. */
  alias?: Record<string, string>;
  /** A two-state figure (k-0587, k-0589): the market in each state, worked out from the geometry. */
  stage?: StageFacts;
  /** k-0589: points the drafter lettered itself (a PPF's E, P, C): their letters are placed clear of the lines. */
  named?: string[];
  /** k-0589: what each axis's far edge stands for (a trade figure's goods units). */
  axisMax?: { x: number; y: number };
  /** k-0589: a trade figure's numbers. */
  trade?: TradeNumbers;
}

const w = (en: string, zh: string): SpecText => ({ en, zh });

/** The EDB words for the standard areas (k-0577; moved here in k-0589). */
export const WORDS = {
  cs: w('Consumer surplus', '消費者盈餘'),
  ps: w('Producer surplus', '生產者盈餘'),
  tss: w('Total social surplus', '總社會盈餘'),
  dwl: w('Deadweight loss', '效率損失'),
  taxRevenue: w('Tax revenue', '政府稅收'),
  buyersBurden: w("Buyers' burden", '買家負擔'),
  sellersBurden: w("Sellers' burden", '賣家負擔'),
  consumerBenefit: w('Consumer benefit', '消費者得益'),
  producerBenefit: w('Producer benefit', '生產者得益'),
  cost: w('Cost of production', '生產成本'),
  revenue: w('Total revenue', '總收入'),
  tssLoss: w('Decrease in total social surplus', '總社會盈餘減少'),
  externalCost: w('External cost', '界外成本'),
  externalBenefit: w('External benefit', '界外利益'),
  tariffRevenue: w('Tariff revenue', '關稅收入'),
  psGain: w('Increase in producer surplus', '生產者盈餘增加'),
  csLoss: w('Decrease in consumer surplus', '消費者盈餘減少'),
} as const;

export const AX = {
  price: { en: 'Price', zh: '價格' },
  quantity: { en: 'Quantity', zh: '數量' },
  wage: { en: 'Wage rate', zh: '工資率' },
  labour: { en: 'Quantity\nof labour', zh: '勞工數量' },
  cost: { en: 'Price / cost', zh: '價格／成本' },
  benefit: { en: 'Price / benefit', zh: '價格／利益' },
};

export function phraseOf(t: SpecText): BiText {
  return phrase(t) ?? { en: [], zh: [] };
}
