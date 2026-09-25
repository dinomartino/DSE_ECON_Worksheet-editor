import type { BiText } from './types';
import type { Diagram } from './diagram';
import { bi, emptyBiText } from './text';
import {
  AXIS,
  axes,
  curve,
  newId,
  point,
  sub,
  type DiagramTemplate,
  type DiagramTemplateGroup,
} from './diagramTemplateKit';
import { MARKET_TEMPLATES, oneShift } from './diagramTemplatesMarket';
import { MACRO_TEMPLATES } from './diagramTemplatesMacro';
import { TRADE_TEMPLATES, buildImportQuota, buildTariff } from './diagramTemplatesTrade';

export type { DiagramTemplate, DiagramTemplateGroup } from './diagramTemplateKit';

/**
 * Starting points for a diagram, one per diagram type the marking schemes name
 * (`docs/Diagram_Requirements/` §8), grouped by syllabus topic.
 *
 * A template is only an initial value: it produces plain `Diagram` geometry with fresh
 * ids, and from that moment the teacher's copy is independent. Nothing downstream ever
 * looks up the template again, which is why `templateId` is a note-to-self rather than
 * a dependency — and why an id, once shipped, is never removed or reused.
 */

export const DIAGRAM_TEMPLATE_GROUPS: Array<{ id: DiagramTemplateGroup; name: BiText }> = [
  { id: 'supplyDemand', name: bi('Supply & demand', '供應與需求') },
  { id: 'controls', name: bi('Price controls & quotas', '價格管制與配額') },
  { id: 'taxSubsidy', name: bi('Tax & subsidy', '稅項與津貼') },
  { id: 'macro', name: bi('Macro', '宏觀經濟') },
  { id: 'money', name: bi('Money', '貨幣') },
  { id: 'trade', name: bi('Trade', '貿易') },
  { id: 'electives', name: bi('Electives', '選修') },
  { id: 'data', name: bi('Data figures', '數據圖表') },
];

/** The default: a bare pair of axes, nothing drawn on them. */
export function createBlankDiagram(): Diagram {
  return axes(AXIS.quantity, AXIS.price, {});
}

// The templates that predate the grouped catalogue, traced from `real_life_reference/`.
const ORIGINAL_TEMPLATES: DiagramTemplate[] = [
  {
    id: 'blank',
    group: 'supplyDemand',
    name: bi('Blank axes', '空白坐標軸'),
    hint: bi('An empty x–y diagram to draw on.', '空白的 x–y 圖，可自行繪畫。'),
    build: createBlankDiagram,
  },
  {
    id: 'supply-demand',
    group: 'supplyDemand',
    name: bi('Supply and demand', '供應與需求'),
    hint: bi('Linear S and D crossing at one equilibrium.', '線性供求曲線相交於一均衡點。'),
    build: () =>
      axes(AXIS.quantity, AXIS.price, {
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
      }),
  },
  {
    id: 'demand-shift',
    group: 'supplyDemand',
    name: bi('Demand shift', '需求變動'),
    hint: bi('D shifts right: two equilibria, P and Q arrows.', '需求右移：兩個均衡點及價格、數量箭嘴。'),
    build: () => oneShift('demand'),
  },
  {
    id: 'ad-as',
    group: 'macro',
    name: bi('AD–AS with LRAS', 'AD–AS 及 LRAS'),
    hint: bi('AD, SRAS and a vertical LRAS — the DSE macro diagram.', 'AD、SRAS 及垂直的 LRAS，DSE 常見宏觀圖。'),
    build: () =>
      axes(bi('Output level', '產出水平'), AXIS.priceLevel, {
        curves: [
          curve([[0.1, 0.78], [0.82, 0.18]], bi('AD', 'AD')),
          curve([[0.1, 0.18], [0.82, 0.78]], bi('SRAS', 'SRAS')),
          // The vertical LRAS: two points sharing an x, labelled at the top.
          curve([[0.46, 0.0], [0.46, 0.94]], bi('LRAS', 'LRAS')),
        ],
        points: [
          point(0.46, 0.48, sub('E', '0'), { dropTo: ['x'], xTickLabel: sub('Y', '1') }),
          point(0.58, 0.6, sub('E', '1')),
        ],
      }),
  },
  {
    id: 'money-market',
    group: 'money',
    name: bi('Money market', '貨幣市場'),
    hint: bi('Vertical money supply against a downward money demand.', '垂直貨幣供應與向下傾斜的貨幣需求。'),
    build: () =>
      axes(AXIS.money, AXIS.interest, {
        curves: [
          curve([[0.44, 0.0], [0.44, 0.9]], sub('MS', '0')),
          curve([[0.06, 0.74], [0.9, 0.24]], sub('MD', '0')),
        ],
        points: [point(0.44, 0.51, sub('E', '0'), { labelSide: 'upRight' })],
      }),
  },
  {
    id: 'tariff',
    group: 'trade',
    name: bi('Import tariff', '進口關稅'),
    hint: bi('Pw and Pw + t: domestic output Q₁, imports QM, tariff revenue.', 'Pw 及 Pw + t：本地產量 Q₁、進口量 QM、關稅收入。'),
    build: buildTariff,
  },
  {
    id: 'import-quota',
    group: 'trade',
    name: bi('Import quota', '進口配額'),
    hint: bi('"S with quota": S to Pw, flat for the quota QA, then shifted; EA.', '有配額的供應：至 Pw、配額 QA 一段水平、其後右移；EA。'),
    build: buildImportQuota,
  },
  {
    id: 'proportional-tax',
    group: 'taxSubsidy',
    name: bi('Tax schedule', '稅項圖'),
    hint: bi('A single line against income — for progressive / proportional questions.', '單一線對應收入，用於累進／比例稅題目。'),
    build: () =>
      axes(bi('Taxable income ($)', '應課稅入息（$）'), bi('Tax rate (%)', '稅率（%）'), {
        curves: [curve([[0.0, 0.1], [0.86, 0.86]])],
      }),
  },
  {
    id: 'business-cycle',
    group: 'macro',
    name: bi('Business cycle', '經濟週期'),
    hint: bi(
      'A wave around a dashed average growth line, with a marked point.',
      '圍繞平均增長虛線的波浪，附標記點。',
    ),
    // Traced from real_life_reference/curve-graph.png; the wave's points were hand-tuned
    // on the canvas (real_life_reference/2021.worksheet.json, Q6). No "0" at the origin.
    build: () =>
      axes(bi('Year', '年份'), bi('Percentage change in real GDP', '實質本地生產總值變動百分率'), {
        curves: [
          curve(
            [[0.104, 0.43], [0.26, 0.15], [0.313, 0.165], [0.67, 0.82], [0.9, 0.35]],
            undefined,
            { shape: 'curved' },
          ),
          // Dashed, stopping short so its two-line label straddles the dashes.
          curve([[0.0, 0.5], [0.898, 0.5]], bi('average\ngrowth rate', '平均增長率'), {
            stroke: 'dashed',
            labelOffset: { x: -0.01, y: 0.035 },
          }),
        ],
        points: [
          point(0.588, 0.739, bi('A', 'A'), { labelOffset: { x: -0.03, y: 0.009 } }),
        ],
        showOrigin: false,
      }),
  },
  {
    id: 'ppc',
    group: 'electives',
    name: bi('Production possibility curve', '生產可能性曲線'),
    hint: bi('A concave PPC with a point on, inside and outside it.', '凹向原點的 PPC，附曲線上、內、外的點。'),
    build: () =>
      axes(bi('Good X', 'X 貨品'), bi('Good Y', 'Y 貨品'), {
        curves: [
          curve([[0.06, 0.9], [0.34, 0.82], [0.62, 0.62], [0.82, 0.12]], undefined, {
            shape: 'curved',
          }),
        ],
        points: [
          point(0.34, 0.82, bi('A', 'A'), { labelSide: 'upRight' }),
          point(0.3, 0.4, bi('B', 'B')),
          point(0.78, 0.72, bi('C', 'C')),
        ],
      }),
  },
  {
    id: 'flow',
    group: 'data',
    name: bi('Flow chart', '流程圖'),
    hint: bi(
      'Boxed stages joined by labelled arrows — production chains.',
      '方框加帶標籤箭嘴，適用於生產鏈流程圖。',
    ),
    // `flow` makes this a flow chart: the renderer ignores the axes, and the sidebar
    // panel edits it. Invented wording — the reference charts are past-paper questions.
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
    group: 'data',
    name: bi('Pie chart', '圓形圖'),
    hint: bi(
      'Patterned slices with derived percentages — market shares.',
      '以不同紋理表示份額，百分比自動計算。',
    ),
    // `pie` makes this a pie chart; round 40/30/20/10 so the derived percents visibly work.
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
  {
    id: 'forum',
    group: 'data',
    name: bi('Forum views', '論壇意見'),
    hint: bi(
      'Speech bubbles around a picture — views expressed in a forum.',
      '圍繞圖片的對話氣泡，適用於論壇意見。',
    ),
    // `forum` makes this a forum figure; invented wording, and no picture — the
    // teacher's own clipart is imported in the panel.
    build: () => ({
      x: {},
      y: {},
      curves: [],
      points: [],
      labels: [],
      arrows: [],
      forum: {
        bubbles: [
          {
            id: newId(),
            slot: 'topLeft',
            speaker: bi('A shop owner:', '一位店主：'),
            text: bi(
              'Our rent and ingredient costs keep rising, so we have no choice but to raise our prices.',
              '租金和材料成本不斷上升，我們只好提高售價。',
            ),
          },
          {
            id: newId(),
            slot: 'topRight',
            speaker: bi('A customer:', '一位顧客：'),
            text: bi(
              'Eating out is getting more and more expensive. I now cook at home more often.',
              '外出用膳愈來愈貴，我現在多數在家煮食。',
            ),
          },
        ],
      },
    }),
  },
];

/** Every template, in picker order: by group, originals first within each. */
export const DIAGRAM_TEMPLATES: DiagramTemplate[] = (() => {
  const all = [...ORIGINAL_TEMPLATES, ...MARKET_TEMPLATES, ...MACRO_TEMPLATES, ...TRADE_TEMPLATES];
  return DIAGRAM_TEMPLATE_GROUPS.flatMap((group) => all.filter((template) => template.group === group.id));
})();

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
