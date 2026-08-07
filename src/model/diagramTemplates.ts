import type { BiText } from './types';
import type { Diagram, DiagramCurve, DiagramLabel, DiagramPointMark } from './diagram';
import { nanoid } from 'nanoid';
import { bi, emptyBiText } from './text';

// Its own id source rather than `factories.newId`: factories imports this module for
// the diagram-block factory, and importing back would make the cycle load-order
// dependent — the same reason `migrations` keeps its defaults as literals.
const newId = () => nanoid(10);

/**
 * Starting points for a diagram.
 *
 * These are traced from the reference papers in `real_life_reference/` — AD-AS
 * (DSE2026/P1/Q29), the money market (Q34), an import tariff (DSE2014/P1/Q45), an
 * import quota's kinked supply curve (DSE2017/P1/Q42) and the tax-system curves
 * (Q38) — because the point of a template is to save the teacher from rebuilding a
 * shape the syllabus draws the same way every year.
 *
 * A template is only an initial value: it produces plain `Diagram` geometry with fresh
 * ids, and from that moment the teacher's copy is independent. Nothing downstream ever
 * looks up the template again, which is why `templateId` is a note-to-self rather than
 * a dependency.
 */

export interface DiagramTemplate {
  id: string;
  name: BiText;
  /** One-line note shown under the name in the picker. */
  hint: BiText;
  build: () => Diagram;
}

/** Subscripted label: "E₀", "S₁" — the naming convention of every DSE diagram. */
function sub(base: string, suffix: string): BiText {
  const runs = [{ text: base }, { text: suffix, vertAlign: 'subscript' as const }];
  return { en: [...runs], zh: [...runs] };
}

/** "P₁+t": a subscripted base with trailing text back on the baseline. */
function subPlus(base: string, suffix: string, tail: string): BiText {
  const runs = [
    { text: base },
    { text: suffix, vertAlign: 'subscript' as const },
    { text: tail },
  ];
  return { en: [...runs], zh: [...runs] };
}

function curve(
  points: Array<[number, number]>,
  label?: BiText,
  extra: Partial<DiagramCurve> = {},
): DiagramCurve {
  return {
    id: newId(),
    points: points.map(([x, y]) => ({ x, y })),
    shape: 'straight',
    label,
    labelAt: 'end',
    ...extra,
  };
}

function point(
  x: number,
  y: number,
  label?: BiText,
  extra: Partial<DiagramPointMark> = {},
): DiagramPointMark {
  return { id: newId(), at: { x, y }, label, labelSide: 'right', dot: true, ...extra };
}

function label(x: number, y: number, text: BiText, extra: Partial<DiagramLabel> = {}): DiagramLabel {
  return { id: newId(), at: { x, y }, text, align: 'center', ...extra };
}

/** The default: a bare pair of axes, nothing drawn on them. */
export function createBlankDiagram(): Diagram {
  return {
    x: { title: bi('Quantity', '數量') },
    y: { title: bi('Price', '價格') },
    curves: [],
    points: [],
    labels: [],
    arrows: [],
    showOrigin: true,
  };
}

export const DIAGRAM_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'blank',
    name: bi('Blank axes', '空白坐標軸'),
    hint: bi('An empty x–y diagram to draw on.', '空白的 x–y 圖，可自行繪畫。'),
    build: createBlankDiagram,
  },
  {
    id: 'supply-demand',
    name: bi('Supply and demand', '供應與需求'),
    hint: bi('Linear S and D crossing at one equilibrium.', '線性供求曲線相交於一均衡點。'),
    build: () => ({
      x: { title: bi('Quantity', '數量') },
      y: { title: bi('Price', '價格') },
      curves: [
        curve([[0.08, 0.88], [0.86, 0.12]], bi('D', 'D')),
        curve([[0.08, 0.12], [0.86, 0.88]], bi('S', 'S')),
      ],
      points: [
        point(0.47, 0.5, sub('E', '0'), {
          dropTo: ['x', 'y'],
          xTickLabel: sub('Q', '0'),
          yTickLabel: sub('P', '0'),
        }),
      ],
      labels: [],
      arrows: [],
      showOrigin: true,
    }),
  },
  {
    id: 'demand-shift',
    name: bi('Demand shift', '需求變動'),
    hint: bi('D shifts right, with a shift arrow and two equilibria.', '需求右移，附移動箭嘴及兩個均衡點。'),
    build: () => ({
      x: { title: bi('Quantity', '數量') },
      y: { title: bi('Price', '價格') },
      curves: [
        curve([[0.06, 0.78], [0.68, 0.1]], sub('D', '0')),
        curve([[0.24, 0.92], [0.88, 0.22]], sub('D', '1')),
        curve([[0.08, 0.1], [0.88, 0.9]], bi('S', 'S')),
      ],
      points: [
        point(0.4, 0.42, sub('E', '0'), { labelSide: 'downRight' }),
        point(0.56, 0.58, sub('E', '1'), { labelSide: 'upLeft' }),
      ],
      labels: [],
      arrows: [{ id: newId(), from: { x: 0.5, y: 0.82 }, to: { x: 0.68, y: 0.82 } }],
      showOrigin: true,
    }),
  },
  {
    id: 'ad-as',
    name: bi('AD–AS with LRAS', 'AD–AS 及 LRAS'),
    hint: bi('AD, SRAS and a vertical LRAS — the DSE macro diagram.', 'AD、SRAS 及垂直的 LRAS，DSE 常見宏觀圖。'),
    build: () => ({
      x: { title: bi('Output level', '產出水平') },
      y: { title: bi('Price level', '價格水平') },
      curves: [
        curve([[0.1, 0.78], [0.82, 0.18]], bi('AD', 'AD')),
        curve([[0.1, 0.18], [0.82, 0.78]], bi('SRAS', 'SRAS')),
        // The vertical LRAS: two points sharing an x, labelled at the top.
        curve([[0.46, 0.0], [0.46, 0.94]], bi('LRAS', 'LRAS'), { labelAt: 'end' }),
      ],
      points: [
        point(0.46, 0.48, sub('E', '0'), {
          labelSide: 'right',
          dropTo: ['x'],
          xTickLabel: sub('Y', '1'),
        }),
        point(0.58, 0.6, sub('E', '1'), { labelSide: 'right' }),
      ],
      labels: [],
      arrows: [],
      showOrigin: true,
    }),
  },
  {
    id: 'money-market',
    name: bi('Money market', '貨幣市場'),
    hint: bi('Vertical money supply against a downward money demand.', '垂直貨幣供應與向下傾斜的貨幣需求。'),
    build: () => ({
      x: { title: bi('Quantity of money', '貨幣數量') },
      y: { title: bi('Nominal interest rate', '名義利率') },
      curves: [
        curve([[0.44, 0.0], [0.44, 0.9]], sub('MS', '0'), { labelAt: 'end' }),
        curve([[0.06, 0.74], [0.9, 0.24]], sub('MD', '0')),
      ],
      points: [point(0.44, 0.51, sub('E', '0'), { labelSide: 'upRight' })],
      labels: [],
      arrows: [],
      showOrigin: true,
    }),
  },
  {
    id: 'tariff',
    name: bi('Import tariff', '進口關稅'),
    hint: bi('World price and price-plus-tariff lines with welfare areas.', '世界價格與加關稅價格線及福利面積。'),
    build: () => ({
      x: { title: bi('Quantity', '數量') },
      y: { title: bi('$', '$') },
      curves: [
        curve([[0.06, 0.92], [0.88, 0.12]], bi('D', 'D')),
        curve([[0.1, 0.06], [0.62, 0.94]], bi('S', 'S')),
        // The two horizontal price lines. Drawn as curves so they carry a label and
        // can be dragged like anything else.
        curve([[0.0, 0.5], [0.92, 0.5]], sub('P', '1'), { labelAt: 'start', weight: 0.8 }),
        curve([[0.0, 0.62], [0.92, 0.62]], subPlus('P', '1', '+t'), { labelAt: 'start', weight: 0.8 }),
      ],
      points: [
        point(0.16, 0.5, undefined, { dot: false, dropTo: ['x'], xTickLabel: sub('Q', '1') }),
        point(0.27, 0.62, undefined, { dot: false, dropTo: ['x'], xTickLabel: sub('Q', '2') }),
        point(0.58, 0.62, undefined, { dot: false, dropTo: ['x'], xTickLabel: sub('Q', '3') }),
        point(0.7, 0.5, undefined, { dot: false, dropTo: ['x'], xTickLabel: sub('Q', '4') }),
      ],
      // The four welfare areas, sitting in the band between P₁ and P₁+t. Placed at the
      // midpoint of each region rather than evenly spaced, so none of them lands on a
      // curve — "c" is the wide middle area and is centred on it.
      labels: [
        label(0.13, 0.56, bi('a', 'a')),
        label(0.225, 0.56, bi('b', 'b')),
        label(0.5, 0.56, bi('c', 'c')),
        label(0.645, 0.56, bi('d', 'd')),
      ],
      arrows: [],
      showOrigin: true,
    }),
  },
  {
    id: 'import-quota',
    name: bi('Import quota', '進口配額'),
    hint: bi('A kinked supply curve shifting outwards.', '有拗折的供應曲線向外移。'),
    build: () => ({
      x: { title: bi('Quantity of Good X', 'X 貨品數量') },
      y: { title: bi('Price', '價格') },
      curves: [
        curve([[0.06, 0.9], [0.86, 0.26]], bi('D', 'D')),
        // The quota shape: supply rises, runs flat while the quota binds, then rises
        // again. Four points with a `straight` shape keep both corners sharp — a
        // `curved` fit would round the plateau away and it would no longer read as a
        // quota. Increasing the quota lengthens the flat run, so S₂ is S₁ shifted right,
        // and demand crosses on the plateau where the quota is what sets the price.
        // S₂ is S₁ translated right by a fixed amount: an increase in the quota lets more
        // in at every price, so the two curves stay parallel rather than converging.
        curve([[0.06, 0.14], [0.22, 0.4], [0.44, 0.4], [0.66, 0.82]], sub('S', '1'), {
          labelAt: 'end',
        }),
        curve([[0.24, 0.14], [0.4, 0.4], [0.62, 0.4], [0.84, 0.82]], sub('S', '2'), {
          labelAt: 'end',
        }),
      ],
      points: [],
      labels: [],
      arrows: [{ id: newId(), from: { x: 0.5, y: 0.6 }, to: { x: 0.66, y: 0.6 } }],
      showOrigin: true,
    }),
  },
  {
    id: 'proportional-tax',
    name: bi('Tax schedule', '稅項圖'),
    hint: bi('A single line against income — for progressive / proportional questions.', '單一線對應收入，用於累進／比例稅題目。'),
    build: () => ({
      x: { title: bi('Taxable income ($)', '應課稅入息（$）') },
      y: { title: bi('Tax rate (%)', '稅率（%）') },
      curves: [curve([[0.0, 0.1], [0.86, 0.86]])],
      points: [],
      labels: [],
      arrows: [],
      showOrigin: true,
    }),
  },
  {
    id: 'business-cycle',
    name: bi('Business cycle', '經濟週期'),
    hint: bi(
      'A wave around a dashed average growth line, with a marked point.',
      '圍繞平均增長虛線的波浪，附標記點。',
    ),
    // Traced from real_life_reference/curve-graph.png: a smooth wave crossing a dashed
    // horizontal "average growth rate" line, one lettered point on the upswing, no "0"
    // at the origin. The wave is `curved` through five points — start, trough,
    // crossing, crest, end — the fewest handles that keep the reference's shape.
    build: () => ({
      x: { title: bi('Year', '年份') },
      y: { title: bi('Percentage change in real GDP', '實質本地生產總值變動百分率') },
      curves: [
        // Hand-tuned on the canvas (real_life_reference/2021.worksheet.json, Q6): two
        // close points ground a flat-bottomed trough, then the ascent runs unbroken
        // into the crest.
        curve(
          [[0.104, 0.43], [0.26, 0.15], [0.313, 0.165], [0.67, 0.82], [0.9, 0.35]],
          undefined,
          { shape: 'curved' },
        ),
        // The average line is dashed and stops short of the plot edge so its two-line
        // label ("average" over "growth rate", a hard break) sits beside it, straddling
        // the dashes as the reference prints it.
        curve([[0.0, 0.5], [0.898, 0.5]], bi('average\ngrowth rate', '平均增長率'), {
          stroke: 'dashed',
          labelAt: 'end',
          labelOffset: { x: -0.01, y: 0.035 },
        }),
      ],
      points: [
        point(0.588, 0.739, bi('A', 'A'), {
          labelSide: 'right',
          labelOffset: { x: -0.03, y: 0.009 },
        }),
      ],
      labels: [],
      arrows: [],
      showOrigin: false,
    }),
  },
  {
    id: 'ppc',
    name: bi('Production possibility curve', '生產可能性曲線'),
    hint: bi('A concave PPC with a point on, inside and outside it.', '凹向原點的 PPC，附曲線上、內、外的點。'),
    build: () => ({
      x: { title: bi('Good X', 'X 貨品') },
      y: { title: bi('Good Y', 'Y 貨品') },
      curves: [
        curve([[0.06, 0.9], [0.34, 0.82], [0.62, 0.62], [0.82, 0.12]], undefined, {
          shape: 'curved',
        }),
      ],
      points: [
        point(0.34, 0.82, bi('A', 'A'), { labelSide: 'upRight' }),
        point(0.3, 0.4, bi('B', 'B'), { labelSide: 'right' }),
        point(0.78, 0.72, bi('C', 'C'), { labelSide: 'right' }),
      ],
      labels: [],
      arrows: [],
      showOrigin: true,
    }),
  },
  {
    id: 'flow',
    name: bi('Flow chart', '流程圖'),
    hint: bi(
      'Boxed stages joined by labelled arrows — production chains.',
      '方框加帶標籤箭嘴，適用於生產鏈流程圖。',
    ),
    // The `flow` field is what makes this a flow chart: the renderer ignores the axes
    // fields entirely, and the sidebar panel (not the drawing canvas) edits the stages
    // and arrows. Modelled on real_life_reference/flow1–4.png with invented wording and
    // figures — the reference charts are past-paper questions and must not ship.
    build: () => {
      const mill = newId();
      const bakery = newId();
      const consumers = newId();
      const hotels = newId();
      return {
        x: {},
        y: {},
        curves: [],
        points: [],
        labels: [],
        arrows: [],
        flow: {
          nodes: [
            { id: mill, label: bi('Flour mill', '麵粉廠'), col: 0, row: 0 },
            { id: bakery, label: bi('Bakery', '麵包店'), col: 1, row: 0 },
            { id: consumers, label: bi('Local consumers', '本地消費者'), col: 2, row: 0 },
            { id: hotels, label: bi('Hotels', '酒店'), col: 2, row: 1 },
          ],
          arrows: [
            { id: newId(), to: mill, label: bi('$10 000', '$10 000') },
            { id: newId(), from: mill, to: bakery, label: bi('Flour ($25 000)', '麵粉（$25 000）') },
            { id: newId(), from: bakery, to: consumers, label: bi('Bread ($40 000)', '麵包（$40 000）') },
            {
              id: newId(),
              from: bakery,
              to: hotels,
              labelBelow: bi('Bread ($18 000)', '麵包（$18 000）'),
            },
          ],
        },
      };
    },
  },
  {
    id: 'pie',
    name: bi('Pie chart', '圓形圖'),
    hint: bi(
      'Patterned slices with derived percentages — market shares.',
      '以不同紋理表示份額，百分比自動計算。',
    ),
    // The `pie` field is what makes this a pie chart: the renderer ignores the axes
    // fields entirely, and the sidebar panel (not the drawing canvas) edits the slices.
    // Values seed at a round 40/30/20/10 so the derived percents visibly work; the
    // title is left for the teacher — a pie names its own subject.
    build: () => ({
      x: {},
      y: {},
      curves: [],
      points: [],
      labels: [],
      arrows: [],
      pie: {
        slices: [
          { id: newId(), label: bi('Firm A', '公司甲'), value: 40 },
          { id: newId(), label: bi('Firm B', '公司乙'), value: 30 },
          { id: newId(), label: bi('Firm C', '公司丙'), value: 20 },
          { id: newId(), label: bi('Others', '其他'), value: 10 },
        ],
      },
    }),
  },
];

export function getDiagramTemplate(id: string): DiagramTemplate | undefined {
  return DIAGRAM_TEMPLATES.find((template) => template.id === id);
}

/** Build a template's geometry, tagged with where it came from. */
export function buildFromTemplate(id: string): Diagram {
  const template = getDiagramTemplate(id);
  const diagram = template ? template.build() : createBlankDiagram();
  return { ...diagram, templateId: id };
}

/** A caption/alt-text default so an inserted diagram is never unlabelled for a11y. */
export function defaultDiagramAltText(id: string): BiText {
  const template = getDiagramTemplate(id);
  return template ? template.name : emptyBiText();
}
