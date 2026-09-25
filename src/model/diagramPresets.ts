import type {
  Diagram,
  DiagramAnchorRef,
  DiagramArea,
  DiagramAreaEdge,
  DiagramAreaPattern,
  DiagramCurve,
} from './diagram';
import {
  AREA_PRESETS,
  areaPolygon,
  curveSlopeSign,
  curveYAt,
  guessMarketCurves,
  newPresetArea,
  resolveAnchor,
  type AreaPreset,
} from './diagramAreas';
import type { BiText } from './types';

/**
 * The Shade menu's catalogue: every welfare area the marking schemes name, as bands of
 * references (§ Shaded areas). Each preset declares the roles it needs; the menu fills
 * them by guess or by the teacher's pick, and a preset that cannot be drawn says why.
 */

/** A horizontal price line: a flat curve, or an anchor's height. Also a band edge. */
export type PriceLevel = { curve: string } | { level: DiagramAnchorRef };

export type CurveRole = 'demand' | 'supply' | 'shifted' | 'mr' | 'mc';
export type LevelRole = 'control' | 'world' | 'raised';
export type PresetRole = CurveRole | LevelRole;

/** Which curve or line plays which part. `shifted` is S₁, after a tax or subsidy. */
export interface PresetRoles {
  demand?: string;
  supply?: string;
  shifted?: string;
  mr?: string;
  mc?: string;
  /** A price ceiling, floor or minimum wage. */
  control?: PriceLevel;
  /** Pw. */
  world?: PriceLevel;
  /** Pw + t, or the domestic price under a quota. */
  raised?: PriceLevel;
}

export type WelfarePreset =
  | 'buyersBurden'
  | 'sellersBurden'
  | 'csLossTax'
  | 'consumerBenefit'
  | 'producerBenefit'
  | 'subsidyDwl'
  | 'tssLoss'
  | 'controlRevenue'
  | 'controlGap'
  | 'controlDwl'
  | 'wageBill'
  | 'ceilingCsGain'
  | 'ceilingCsLoss'
  | 'tariffRevenue'
  | 'tariffPsGain'
  | 'tariffCsLoss'
  | 'tariffDwl'
  | 'quotaRent'
  | 'monopolyDwl';

export type ShadePresetId = AreaPreset | WelfarePreset;
export type PresetGroup = 'surplus' | 'tax' | 'control' | 'trade' | 'monopoly';
/** The menu's sections: the preset groups, then revenue and custom shapes. */
export type ShadeGroup = PresetGroup | 'revenue' | 'custom';

export const SHADE_GROUPS: Array<{ id: ShadeGroup; name: string }> = [
  { id: 'surplus', name: 'Surplus' },
  { id: 'tax', name: 'Tax & subsidy' },
  { id: 'control', name: 'Price control' },
  { id: 'trade', name: 'Trade' },
  { id: 'monopoly', name: 'Monopoly' },
  { id: 'revenue', name: 'Revenue' },
  { id: 'custom', name: 'Custom' },
];

type Band = NonNullable<DiagramArea['band']>;
/** One area a preset adds; most add one, the tariff DWL adds two. */
type Part = Omit<DiagramArea, 'id'>;

export interface ShadePreset {
  id: ShadePresetId;
  group: PresetGroup;
  name: string;
  /** In picker order; an optional role may be left empty. `name` overrides the role's. */
  roles: Array<{ role: PresetRole; optional?: true; name?: string }>;
  /** The areas, or why they cannot be drawn. Roles marked required are present. */
  build: (roles: PresetRoles, diagram: Diagram) => Part[] | string;
}

const bi = (en: string, zh: string): BiText => ({ en: [{ text: en }], zh: [{ text: zh }] });

/**
 * The hatch each new preset starts with. Areas drawn together differ: the two burdens,
 * CB/PB, the tariff's a/b/c/d, a ceiling's + and −. The four originals keep theirs.
 */
export const WELFARE_PATTERNS: Record<WelfarePreset, DiagramAreaPattern> = {
  buyersBurden: 'horizontal',
  sellersBurden: 'vertical',
  csLossTax: 'horizontal',
  consumerBenefit: 'horizontal',
  producerBenefit: 'vertical',
  subsidyDwl: 'cross',
  tssLoss: 'horizontal',
  controlRevenue: 'dots',
  controlGap: 'vertical',
  controlDwl: 'cross',
  wageBill: 'dots',
  ceilingCsGain: 'vertical',
  ceilingCsLoss: 'horizontal',
  tariffRevenue: 'dots',
  tariffPsGain: 'reverse',
  tariffCsLoss: 'diagonal',
  // Production (b) then consumption (d): the two triangles differ from each other too.
  tariffDwl: 'vertical',
  quotaRent: 'dots',
  monopolyDwl: 'cross',
};
const CONSUMPTION_DWL_PATTERN: DiagramAreaPattern = 'horizontal';

const DWL = bi('DWL', '無謂損失');

/*
 * ── Reading the diagram ─────────────────────────────────────────────────────────
 */

let onYSupported: boolean | undefined;

/**
 * Whether the anchor resolver reads `{ on, y }` — a curve at a price level. Without it a
 * price given by a point (not a drawn line) cannot be read across to a curve.
 */
export function onCurveAtLevelSupported(): boolean {
  if (onYSupported === undefined) {
    const probe: Diagram = {
      x: {},
      y: {},
      curves: [{ id: 'c', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], shape: 'straight' }],
      points: [],
      labels: [],
      arrows: [],
    };
    try {
      const at = resolveAnchor(probe, { on: 'c', y: 0.25 } as unknown as DiagramAnchorRef);
      onYSupported = Boolean(at) && Math.abs(at!.x - 0.25) < 1e-6;
    } catch {
      onYSupported = false;
    }
  }
  return onYSupported;
}

const NEEDS_LINE = 'Draw that price as a horizontal line first';

/** Where `curve` meets a price level: a crossing with a drawn line, else `{ on, y }`. */
function along(curve: string, level: PriceLevel): DiagramAnchorRef | null {
  if ('curve' in level) return { cross: [curve, level.curve] };
  return onCurveAtLevelSupported() ? ({ on: curve, y: level.level } as unknown as DiagramAnchorRef) : null;
}

/** A horizontal line: two or more points at one height, with some width. */
export function isFlatCurve(curve: DiagramCurve): boolean {
  if (curve.points.length < 2) return false;
  const ys = curve.points.map((p) => p.y);
  const xs = curve.points.map((p) => p.x);
  return Math.max(...ys) - Math.min(...ys) < 1e-6 && Math.max(...xs) - Math.min(...xs) > 1e-6;
}

const curveOf = (diagram: Diagram, id: string) => diagram.curves.find((c) => c.id === id);

/** A price level's height at `x` (a drawn line may be a little off flat). */
function levelHeight(diagram: Diagram, level: PriceLevel, x: number): number | null {
  if ('curve' in level) {
    const curve = curveOf(diagram, level.curve);
    return curve ? (curveYAt(curve, x) ?? curve.points[0]?.y ?? null) : null;
  }
  return resolveAnchor(diagram, level.level)?.y ?? null;
}

const at = (diagram: Diagram, ref: DiagramAnchorRef) => resolveAnchor(diagram, ref);
const cross = (a: string, b: string): DiagramAnchorRef => ({ cross: [a, b] });
const level = (ref: DiagramAnchorRef | number): DiagramAreaEdge => ({ level: ref });
const band = (edges: Band['edges'], from: Band['from'], to: Band['to'], cap?: DiagramAreaEdge): Band =>
  cap ? { edges, from, to, cap } : { edges, from, to };
const part = (preset: WelfarePreset, b: Band, label: BiText): Part => ({
  band: b,
  label,
  fill: 'hatch',
  pattern: WELFARE_PATTERNS[preset],
});

/** Tax (S₁ above S) or subsidy (below), read at the two equilibria; or why neither. */
function shiftDirection(diagram: Diagram, r: PresetRoles): 'tax' | 'subsidy' | string {
  const e0 = at(diagram, cross(r.demand!, r.supply!));
  const e1 = at(diagram, cross(r.demand!, r.shifted!));
  if (!e0) return 'Demand and supply do not cross';
  if (!e1) return 'The shifted supply does not cross demand';
  if (Math.abs(e1.y - e0.y) < 1e-6) return 'The two supply curves meet demand at one price';
  return e1.y > e0.y ? 'tax' : 'subsidy';
}

/** Ceiling (below equilibrium) or floor (above); or why the line fixes nothing. */
function controlSide(diagram: Diagram, r: PresetRoles): 'ceiling' | 'floor' | string {
  const e0 = at(diagram, cross(r.demand!, r.supply!));
  if (!e0) return 'Demand and supply do not cross';
  const y = levelHeight(diagram, r.control!, e0.x);
  if (y === null) return 'The price line is gone';
  if (Math.abs(y - e0.y) < 1e-6) return 'The price line sits at equilibrium — it fixes nothing';
  return y < e0.y ? 'ceiling' : 'floor';
}

/*
 * ── The catalogue ───────────────────────────────────────────────────────────────
 */

const SHIFT_ROLES = (shifted: string): ShadePreset['roles'] => [
  { role: 'demand' },
  { role: 'supply', name: 'Supply (before)' },
  { role: 'shifted', name: shifted },
];
const CONTROL_ROLES: ShadePreset['roles'] = [{ role: 'demand' }, { role: 'supply' }, { role: 'control' }];
const TRADE_ROLES = (raised: string): ShadePreset['roles'] => [
  { role: 'demand' },
  { role: 'supply', name: 'Domestic supply' },
  { role: 'world' },
  { role: 'raised', name: raised },
];

/** One of the four original presets, exactly as `newPresetArea` builds it. */
function original(id: AreaPreset, group: PresetGroup, name: string, needsTax: boolean): ShadePreset {
  return {
    id,
    group,
    name,
    roles: [
      { role: 'demand' },
      { role: 'supply' },
      needsTax ? { role: 'shifted', name: 'Supply with tax' } : { role: 'shifted', optional: true, name: 'Supply with tax' },
    ],
    build: (r) => {
      const area = newPresetArea(id, { demand: r.demand, supply: r.supply, taxed: r.shifted }, 'probe');
      return area ? [area] : 'Needs a taxed supply curve — shift S up first';
    },
  };
}

/** A tax or subsidy preset: checks the direction, then builds from E₀, E₁ and S under E₁. */
function shifted(
  id: WelfarePreset,
  name: string,
  wants: 'tax' | 'subsidy',
  make: (refs: { d: string; s: string; s1: string; e0: DiagramAnchorRef; e1: DiagramAnchorRef; seller: DiagramAnchorRef }) => Band,
  label: BiText,
  group: PresetGroup = 'tax',
): ShadePreset {
  return {
    id,
    group,
    name,
    roles: SHIFT_ROLES(wants === 'tax' ? 'Supply with tax' : 'Supply with subsidy'),
    build: (r, diagram) => {
      const direction = shiftDirection(diagram, r);
      if (direction !== wants) {
        if (direction === 'tax' || direction === 'subsidy') {
          return wants === 'tax' ? 'Needs S₁ above S — shift S up for a tax' : 'Needs S₁ below S — shift S down for a subsidy';
        }
        return direction;
      }
      const e1 = cross(r.demand!, r.shifted!);
      const refs = {
        d: r.demand!,
        s: r.supply!,
        s1: r.shifted!,
        e0: cross(r.demand!, r.supply!),
        e1,
        seller: { on: r.supply!, x: e1 } as DiagramAnchorRef,
      };
      return [part(id, make(refs), label)];
    },
  };
}

/** A price-control preset: finds Qs and Qd on the line, and which side is transacted. */
function controlled(
  id: WelfarePreset,
  name: string,
  wants: 'ceiling' | 'floor' | 'either',
  make: (refs: {
    d: string;
    s: string;
    c: PriceLevel;
    e0: DiagramAnchorRef;
    qs: DiagramAnchorRef;
    qd: DiagramAnchorRef;
    qt: DiagramAnchorRef;
  }) => Band,
  label: BiText,
): ShadePreset {
  return {
    id,
    group: 'control',
    name,
    roles: id === 'wageBill' ? [{ role: 'demand', name: 'Labour demand' }, { role: 'supply', name: 'Labour supply' }, { role: 'control', name: 'Wage line' }] : CONTROL_ROLES,
    build: (r, diagram) => {
      const side = controlSide(diagram, r);
      if (side !== 'ceiling' && side !== 'floor') return side;
      if (wants === 'ceiling' && side !== 'ceiling') return 'Needs the price line below equilibrium — a ceiling';
      if (wants === 'floor' && side !== 'floor') return 'Needs the line above equilibrium — a minimum wage or floor';
      const c = r.control!;
      const qs = along(r.supply!, c);
      const qd = along(r.demand!, c);
      if (!qs || !qd) return NEEDS_LINE;
      const refs = { d: r.demand!, s: r.supply!, c, e0: cross(r.demand!, r.supply!), qs, qd, qt: side === 'ceiling' ? qs : qd };
      return [part(id, make(refs), label)];
    },
  };
}

/** A small-open-economy preset: Q₁…Q₄ where S and D meet Pw and the raised price. */
function traded(
  id: WelfarePreset,
  name: string,
  raisedName: string,
  make: (refs: {
    d: string;
    s: string;
    w: PriceLevel;
    t: PriceLevel;
    q1: DiagramAnchorRef;
    q2: DiagramAnchorRef;
    q3: DiagramAnchorRef;
    q4: DiagramAnchorRef;
  }) => Part[],
): ShadePreset {
  return {
    id,
    group: 'trade',
    name,
    roles: TRADE_ROLES(raisedName),
    build: (r, diagram) => {
      const e0 = at(diagram, cross(r.demand!, r.supply!));
      if (!e0) return 'Demand and supply do not cross';
      const w = levelHeight(diagram, r.world!, e0.x);
      const t = levelHeight(diagram, r.raised!, e0.x);
      if (w === null || t === null) return 'A price line is gone';
      if (w >= e0.y - 1e-6) return 'Needs the world price below the domestic equilibrium';
      if (t <= w + 1e-6) return `Needs ${raisedName} above the world price`;
      if (t >= e0.y - 1e-6) return `Needs ${raisedName} below the domestic equilibrium — else nothing is imported`;
      const q = [
        along(r.supply!, r.world!),
        along(r.supply!, r.raised!),
        along(r.demand!, r.raised!),
        along(r.demand!, r.world!),
      ];
      if (q.some((ref) => !ref)) return NEEDS_LINE;
      const [q1, q2, q3, q4] = q as DiagramAnchorRef[];
      return make({ d: r.demand!, s: r.supply!, w: r.world!, t: r.raised!, q1, q2, q3, q4 });
    },
  };
}

export const SHADE_PRESETS: ShadePreset[] = [
  // ── Surplus
  original('consumerSurplus', 'surplus', 'Consumer surplus', false),
  original('producerSurplus', 'surplus', 'Producer surplus', false),
  shifted(
    'tssLoss',
    'TSS loss (MC rises)',
    'tax',
    // abE₁E₀: between S and S₁ up to demand — S₁ capped by D past the new equilibrium.
    ({ d, s, s1, e0 }) => band([{ curve: s1 }, { curve: s }], 0, e0, { curve: d }),
    bi('TSS loss', '總盈餘損失'),
    'surplus',
  ),

  // ── Tax & subsidy
  shifted(
    'buyersBurden',
    "Buyers' burden",
    'tax',
    ({ e0, e1 }) => band([level(e1), level(e0)], 0, e1),
    bi("Buyers' burden", '買方稅負'),
  ),
  shifted(
    'sellersBurden',
    "Sellers' burden",
    'tax',
    ({ e0, e1, seller }) => band([level(e0), level(seller)], 0, e1),
    bi("Sellers' burden", '賣方稅負'),
  ),
  original('taxRevenue', 'tax', 'Tax revenue', true),
  original('deadweightLoss', 'tax', 'DWL of a tax', true),
  shifted(
    'csLossTax',
    'CS loss under a tax',
    'tax',
    // The buyers' burden plus its triangle: P₁ capped by D from Q₁ to Q₀.
    ({ d, e0, e1 }) => band([level(e1), level(e0)], 0, e0, { curve: d }),
    bi('CS loss', '消費者盈餘損失'),
  ),
  shifted(
    'consumerBenefit',
    'Consumer benefit (subsidy)',
    'subsidy',
    ({ e0, e1 }) => band([level(e0), level(e1)], 0, e1),
    bi('CB', '消費者得益'),
  ),
  shifted(
    'producerBenefit',
    'Producer benefit (subsidy)',
    'subsidy',
    ({ e0, e1, seller }) => band([level(seller), level(e0)], 0, e1),
    bi('PB', '生產者得益'),
  ),
  shifted(
    'subsidyDwl',
    'DWL of a subsidy',
    'subsidy',
    ({ d, s, e0, e1 }) => band([{ curve: s }, { curve: d }], e0, e1),
    DWL,
  ),

  // ── Price control
  controlled(
    'controlRevenue',
    'Revenue at the fixed price',
    'either',
    ({ c, qt }) => band([level(0), c], 0, qt),
    bi('TR', '總收益'),
  ),
  controlled(
    'controlGap',
    'Shortage / surplus × price',
    'either',
    ({ c, qs, qd }) => band([level(0), c], qs, qd),
    bi('P × ΔQ', 'P × ΔQ'),
  ),
  controlled(
    'controlDwl',
    'DWL of a price control',
    'either',
    ({ d, s, e0, qt }) => band([{ curve: d }, { curve: s }], qt, e0),
    DWL,
  ),
  controlled('wageBill', 'Wage bill (minimum wage)', 'floor', ({ c, qd }) => band([level(0), c], 0, qd), bi('Wage bill', '工資總額')),
  controlled(
    'ceilingCsGain',
    'CS gain under a ceiling (+)',
    'ceiling',
    ({ c, e0, qs }) => band([level(e0), c], 0, qs),
    bi('+', '+'),
  ),
  controlled(
    'ceilingCsLoss',
    'CS loss under a ceiling (−)',
    'ceiling',
    ({ d, e0, qs }) => band([{ curve: d }, level(e0)], qs, e0),
    bi('−', '−'),
  ),

  // ── Trade
  traded('tariffRevenue', 'Tariff revenue', 'Pw + t', ({ w, t, q2, q3 }) => [
    part('tariffRevenue', band([w, t], q2, q3), bi('Tariff revenue', '關稅收入')),
  ]),
  traded('tariffPsGain', 'PS gain (tariff)', 'Pw + t', ({ s, w, t, q2 }) => [
    // Left of S between the two prices: Pw lifted to S where S rises through the band.
    part('tariffPsGain', band([w, t], 0, q2, { curve: s }), bi('PS gain', '生產者盈餘增加')),
  ]),
  traded('tariffCsLoss', 'CS loss (tariff)', 'Pw + t', ({ d, w, t, q4 }) => [
    part('tariffCsLoss', band([t, w], 0, q4, { curve: d }), bi('CS loss', '消費者盈餘損失')),
  ]),
  traded('tariffDwl', 'DWL of a tariff (both triangles)', 'Pw + t', ({ d, s, w, q1, q2, q3, q4 }) => [
    // b sits under S, above Pw; d under D, above Pw.
    part('tariffDwl', band([{ curve: s }, w], q1, q2), DWL),
    { ...part('tariffDwl', band([{ curve: d }, w], q3, q4), DWL), pattern: CONSUMPTION_DWL_PATTERN },
  ]),
  traded('quotaRent', 'Quota rent', 'Price with quota', ({ w, t, q2, q3 }) => [
    part('quotaRent', band([w, t], q2, q3), bi('Quota rent', '配額租金')),
  ]),

  // ── Monopoly
  {
    id: 'monopolyDwl',
    group: 'monopoly',
    name: 'DWL of a monopoly',
    roles: [{ role: 'demand', name: 'Demand (AR)' }, { role: 'mr' }, { role: 'mc' }],
    build: (r) => [
      part(
        'monopolyDwl',
        band([{ curve: r.demand! }, { curve: r.mc! }], cross(r.mr!, r.mc!), cross(r.demand!, r.mc!)),
        DWL,
      ),
    ],
  },
];

export const ROLE_NAMES: Record<PresetRole, string> = {
  demand: 'Demand',
  supply: 'Supply',
  shifted: 'Shifted supply',
  mr: 'MR',
  mc: 'MC',
  control: 'Price line',
  world: 'World price',
  raised: 'Pw + t',
};

/** What the menu says when a role has nothing to fill it. */
const ROLE_NEEDS: Record<PresetRole, string> = {
  demand: 'Needs a falling demand curve',
  supply: 'Needs a rising supply curve',
  shifted: 'Needs a shifted supply curve — shift S first',
  mr: 'Needs a falling MR curve beside demand',
  mc: 'Needs an MC curve',
  control: 'Needs a horizontal price line',
  world: 'Needs a horizontal world-price line',
  raised: 'Needs a second price line above Pw',
};

export const shadePreset = (id: ShadePresetId) => SHADE_PRESETS.find((p) => p.id === id)!;

/*
 * ── Candidates and guesses ──────────────────────────────────────────────────────
 */

const labelText = (curve: DiagramCurve) => (curve.label?.en ?? []).map((run) => run.text).join('');

/** What can fill a role: curves by slope, levels from flat lines (and points, with `{on, y}`). */
export function roleCandidates(diagram: Diagram, role: PresetRole): Array<string | PriceLevel> {
  const { curves } = diagram;
  switch (role) {
    case 'demand':
    case 'mr':
      return curves.filter((c) => curveSlopeSign(c) < 0).map((c) => c.id);
    case 'supply':
    case 'shifted':
      return curves.filter((c) => curveSlopeSign(c) > 0).map((c) => c.id);
    case 'mc':
      return curves.filter((c) => curveSlopeSign(c) > 0 || isFlatCurve(c)).map((c) => c.id);
    default: {
      const lines: PriceLevel[] = curves.filter(isFlatCurve).map((c) => ({ curve: c.id }));
      if (!onCurveAtLevelSupported()) return lines;
      return [...lines, ...diagram.points.map((p) => ({ level: { point: p.id } }))];
    }
  }
}

/** Rising curves that meet `demand`, in drawing order — the original first, then S₁. */
function supplyPair(diagram: Diagram, demand: DiagramCurve | undefined): [string?, string?] {
  const rising = diagram.curves.filter((c) => curveSlopeSign(c) > 0);
  const meeting = demand ? rising.filter((c) => at(diagram, cross(demand.id, c.id))) : rising;
  const pool = meeting.length > 0 ? meeting : rising;
  return [pool[0]?.id, pool[1]?.id];
}

/**
 * A best guess at every role a preset needs. The originals keep `guessMarketCurves`;
 * the rest read drawing order and labels. The picker re-picks any of it.
 */
export function guessRoles(diagram: Diagram, preset: ShadePreset): PresetRoles {
  if (AREA_PRESETS.some((p) => p.id === preset.id)) {
    const guess = guessMarketCurves(diagram);
    return { demand: guess.demand, supply: guess.supply, shifted: guess.taxed };
  }
  const falling = diagram.curves.filter((c) => curveSlopeSign(c) < 0);
  if (preset.group === 'monopoly') {
    const mrCurve = falling.find((c) => /^MR/i.test(labelText(c)));
    const byLabel = falling.find((c) => c !== mrCurve && /^(D|AR)/i.test(labelText(c)));
    // Unlabelled: MR is the steeper of the two falling lines.
    const steepness = (c: DiagramCurve) => {
      const xs = c.points.map((p) => p.x);
      const ys = c.points.map((p) => p.y);
      return (Math.max(...ys) - Math.min(...ys)) / Math.max(1e-6, Math.max(...xs) - Math.min(...xs));
    };
    const sorted = [...falling].sort((a, b) => steepness(a) - steepness(b));
    const demand = byLabel ?? sorted.find((c) => c !== mrCurve);
    const mr = mrCurve ?? sorted.reverse().find((c) => c !== demand);
    const mcs = diagram.curves.filter((c) => c !== demand && c !== mr && (curveSlopeSign(c) > 0 || isFlatCurve(c)));
    const mc = mcs.find((c) => /^MC/i.test(labelText(c))) ?? mcs[0];
    return { demand: demand?.id, mr: mr?.id, mc: mc?.id };
  }
  const demand = falling[0];
  const [supply, next] = supplyPair(diagram, demand);
  const roles: PresetRoles = { demand: demand?.id, supply };
  if (preset.roles.some((r) => r.role === 'shifted')) roles.shifted = next;
  const levels = roleCandidates(diagram, 'control') as PriceLevel[];
  if (preset.group === 'control') roles.control = levels[0];
  if (preset.group === 'trade') {
    // Pw is the lowest line, the raised price the next above it.
    const e0 = demand && supply ? at(diagram, cross(demand.id, supply)) : null;
    const x = e0?.x ?? 0.5;
    const sorted = levels
      .map((l) => ({ l, y: levelHeight(diagram, l, x) }))
      .filter((e): e is { l: PriceLevel; y: number } => e.y !== null)
      .sort((a, b) => a.y - b.y);
    roles.world = sorted[0]?.l;
    roles.raised = sorted[1]?.l;
  }
  return roles;
}

/** Whether the teacher should pick: some required role has more than one candidate. */
export function presetIsAmbiguous(diagram: Diagram, preset: ShadePreset): boolean {
  return preset.roles.some((r) => !r.optional && roleCandidates(diagram, r.role).length > 1);
}

/** The areas a preset adds with these roles, ids from `newId`, or why it cannot. */
export function planPreset(
  diagram: Diagram,
  preset: ShadePreset,
  roles: PresetRoles,
  newId: () => string,
): { areas: DiagramArea[] } | { why: string } {
  for (const { role, optional } of preset.roles) {
    if (!optional && !roles[role]) return { why: ROLE_NEEDS[role] };
  }
  const built = preset.build(roles, diagram);
  if (typeof built === 'string') return { why: built };
  if (built.some((p) => !areaPolygon(diagram, { ...p, id: 'probe' }))) {
    return { why: 'Nothing to shade — the curves do not bound that area' };
  }
  return { areas: built.map((p) => ({ ...p, id: newId() })) };
}

/** A preset's areas, or null when the curves or lines it needs are missing. */
export function presetAreas(
  diagram: Diagram,
  id: ShadePresetId,
  roles: PresetRoles,
  newId: () => string,
): DiagramArea[] | null {
  const plan = planPreset(diagram, shadePreset(id), roles, newId);
  return 'areas' in plan ? plan.areas : null;
}

/**
 * How the menu shows a preset: `blocked` (greyed, with `why`), `pick` (opens the role
 * picker, pre-filled with `roles`), or neither (adds at once with the guess).
 */
export function presetStatus(
  diagram: Diagram,
  preset: ShadePreset,
): { roles: PresetRoles; pick: boolean; blocked: boolean; why?: string } {
  const roles = guessRoles(diagram, preset);
  // The guess only leaves a role empty when no distinct curve can fill it (MR ≠ D).
  const empty = preset.roles.find(
    (r) => !r.optional && (!roles[r.role] || roleCandidates(diagram, r.role).length === 0),
  );
  if (empty) return { roles, pick: false, blocked: true, why: ROLE_NEEDS[empty.role] };
  const plan = planPreset(diagram, preset, roles, () => 'probe');
  const why = 'why' in plan ? plan.why : undefined;
  const pick = presetIsAmbiguous(diagram, preset);
  return { roles, pick, blocked: Boolean(why) && !pick, why };
}
