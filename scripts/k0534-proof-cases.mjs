/**
 * The k-0534 before/after cases: six MC questions with a figure, EN + 中文. No live model was
 * reachable, so these are RECORDED replies: `old` is the kind of diagram reply the pre-k-0534
 * prompt asked for (its vocabulary: `equilibria`, `levels` by side; no labelled readings at a
 * price line, no quota), with the narrated stem its writer rule produced; `reply` is a reply in
 * the k-0534 vocabulary, and `after` the stem the new writer rule asks for. Case 1 is the
 * user's own draft (Outbox/k-0534/ai-generated.png): its stem is quoted, its spec rebuilt to
 * draw what the screenshot shows. Read by `scripts/k0534-proof.test.ts` (new pipeline) and
 * the old-code harness `scripts/k0534-before-after.mjs` writes into a worktree of a11491c5.
 */

const t = (en, zh) => ({ en, zh });
const PRICE = t('Price', '價格');
const QUANTITY = t('Quantity', '數量');
const base = (body) => ({
  kind: 'curves', reason: '', placement: 'question', template: '', title: t('', ''), xAxis: QUANTITY, yAxis: PRICE,
  curves: [], shifts: [], levels: [], gaps: [], shades: [], marks: [], changeArrows: false,
  asks: { what: 'none', state: 'after' },
  chart: { type: 'bar', categories: [], series: [], yTitle: t('', ''), xTitle: t('', '') },
  ...body,
});
const D = (id, label) => ({ id, role: 'demand', slope: 'normal', place: 'mid', label });
const S = (id, label) => ({ id, role: 'supply', slope: 'normal', place: 'mid', label });
const pt = (a, b, xTick, yTick = '') => ({ a, b, name: '', xTick, yTick, dot: false });
const eq = (a, b, xTick, yTick = '') => ({ a, b, name: '', xTick, yTick });
const guide = (l) => ({ above: [], below: [], side: 'below', style: 'guide', ...l });
const Q4 = t(['Q1', 'Q2', 'Q3', 'Q4'], ['Q1', 'Q2', 'Q3', 'Q4']);

export const CASES = [
  {
    id: 'floor-shift',
    title: t('1 · The k-0534 draft: price floor, supply falls', '1 · k-0534 草稿：最低價格，供應減少'),
    beforeImage: 'ai-generated.png',
    before: t(
      'Refer to a supply-demand diagram of good X, where the demand curve is D1, the initial supply curve is S1, and the new supply curve (shifted to the left) is S2. Suppose Country B sets a price floor on good X at P1, which is above the intersection of D1 and S1 but below the intersection of D1 and S2. On the horizontal quantity axis from left to right, dashed lines mark four quantities: Q1 is the quantity supplied on S2 at P1, Q2 is the equilibrium quantity at the intersection of D1 and S2, Q3 is the quantity demanded on D1 at P1, and Q4 is the equilibrium quantity at the intersection of D1 and S1. If the supply curve shifts from S1 to S2, the new quantity transacted will be at ____.',
      '參看 X 物品的供求圖，其中需求曲線為 D1，原來的供應曲線為 S1，新的供應曲線（向左移）為 S2。假設 B 國為 X 物品設定最低價格 P1，P1 高於 D1 與 S1 的交點，但低於 D1 與 S2 的交點。在橫軸上由左至右，虛線標示四個數量：Q1 是 S2 在 P1 的供應量，Q2 是 D1 與 S2 交點的均衡數量，Q3 是 D1 在 P1 的需求量，Q4 是 D1 與 S1 交點的均衡數量。若供應曲線由 S1 移至 S2，新的交易量會是 ____。',
    ),
    after: t(
      'Refer to the following supply-demand diagram of good X.\n\nSuppose Country B sets a price floor on good X at P_1. If the supply curve shifts from S_1 to S_2, the new quantity transacted will be at ____.',
      '參看下面 X 物品的供求圖。\n\n假設 B 國為 X 物品設定最低價格 P_1。若供應曲線由 S_1 移至 S_2，新的交易量會是 ____。',
    ),
    options: Q4,
    answer: 1,
    explanation: t('After the decrease in supply the equilibrium price is above P1, so the floor no longer binds: the quantity transacted is Q2.', '供應減少後，均衡價格高於 P1，最低價格不再生效，交易量為 Q2。'),
    figure: 'D1, S1 shifting left to S2; a floor P1 above D1×S1 and below D1×S2; Q1 S2 at P1, Q2 D1×S2, Q3 D1 at P1, Q4 S1 at P1; key Q2.',
    old: base({
      curves: [D('D1', 'D_1'), S('S1', 'S_1')],
      shifts: [{ of: 'S1', id: 'S2', direction: 'left', size: 'normal', label: 'S_2' }],
      levels: [{ id: 'P1', kind: 'floor', side: 'above', label: 'P_1' }],
      equilibria: [{ ...eq('D1', 'S2', 'Q_2'), name: '' }, eq('D1', 'S1', 'Q_4')],
    }),
    reply: base({
      reason: 'A floor between the old and new equilibria; supply decreases.',
      curves: [D('D1', 'D_1'), S('S1', 'S_1')],
      shifts: [{ of: 'S1', id: 'S2', direction: 'left', size: 'normal', label: 'S_2' }],
      levels: [guide({ id: 'P1', kind: 'floor', above: ['D1', 'S1'], below: ['D1', 'S2'], side: 'above', label: 'P_1' })],
      points: [pt('S2', 'P1', 'Q_1'), pt('D1', 'S2', 'Q_2'), pt('D1', 'P1', 'Q_3'), pt('S1', 'P1', 'Q_4')],
      asks: { what: 'quantityTransacted', state: 'after' },
    }),
    followUp: {
      note: 'Move P1 up, above the new equilibrium.',
      reply: base({
        reason: 'P1 moved above D1×S2.',
        curves: [D('D1', 'D_1'), S('S1', 'S_1')],
        shifts: [{ of: 'S1', id: 'S2', direction: 'left', size: 'normal', label: 'S_2' }],
        levels: [guide({ id: 'P1', kind: 'floor', above: ['D1', 'S2'], side: 'above', label: 'P_1' })],
        points: [pt('D1', 'P1', 'Q_1'), pt('D1', 'S2', 'Q_2'), pt('S2', 'P1', 'Q_3'), pt('S1', 'P1', 'Q_4')],
        asks: { what: 'quantityTransacted', state: 'after' },
        questionChange: '',
      }),
      rekeyed: { answer: 0, explanation: t('P1 is above the new equilibrium price, so the floor binds: the quantity transacted is the quantity demanded at P1, Q1.', 'P1 高於新的均衡價格，最低價格生效，交易量為 P1 的需求量 Q1。') },
    },
  },
  {
    id: 'ceiling-q16',
    title: t('2 · Price ceiling, supply rises (HKDSE Q16, read from the reference)', '2 · 最高價格，供應增加（文憑試第 16 題，由參考圖讀出）'),
    referenceImage: 'reference.png',
    before: t(
      'Refer to a supply-demand diagram of good Z, where D1 is the demand curve, S1 the initial supply curve and S2 the new supply curve (shifted to the right). Country A sets a price ceiling at P1, below the intersection of D1 and S1. Dashed lines mark Q2, the equilibrium quantity of D1 and S1, and Q3, the equilibrium quantity of D1 and S2. If the supply curve shifts from S1 to S2, the new quantity transacted will be at ____.',
      '參看 Z 物品的供求圖，D1 為需求曲線，S1 為原來的供應曲線，S2 為新的供應曲線（向右移）。A 國把最高價格定於 P1，低於 D1 與 S1 的交點。虛線標示 Q2（D1 與 S1 的均衡數量）及 Q3（D1 與 S2 的均衡數量）。若供應曲線由 S1 移至 S2，新的交易量會是 ____。',
    ),
    after: t(
      'Refer to the following supply-demand diagram of good Z.\n\nSuppose Country A sets a price ceiling on good Z at P_1. If the supply curve shifts from S_1 to S_2, the new quantity transacted will be at ____.',
      '參看下面 Z 物品的供求圖。\n\n假設 A 國為 Z 物品設定最高價格 P_1。若供應曲線由 S_1 移至 S_2，新的交易量會是 ____。',
    ),
    options: Q4,
    answer: 2,
    explanation: t('After the increase in supply the equilibrium price is below P1, so the ceiling no longer binds: the quantity transacted is Q3.', '供應增加後，均衡價格低於 P1，最高價格不再生效，交易量為 Q3。'),
    figure: 'D1, S1 shifting right to S2; a ceiling P1 below D1×S1 and above D1×S2; Q1 S1 at P1, Q2 D1 at P1, Q3 D1×S2, Q4 S2 at P1; key Q3.',
    old: base({
      curves: [D('D1', 'D_1'), S('S1', 'S_1')],
      shifts: [{ of: 'S1', id: 'S2', direction: 'right', size: 'normal', label: 'S_2' }],
      levels: [{ id: 'P1', kind: 'ceiling', side: 'below', label: 'P_1' }],
      equilibria: [eq('D1', 'S1', 'Q_2'), eq('D1', 'S2', 'Q_3')],
    }),
    reply: base({
      reason: 'The reference read into the spec: a ceiling between the equilibria, supply increases.',
      curves: [D('D1', 'D_1'), S('S1', 'S_1')],
      shifts: [{ of: 'S1', id: 'S2', direction: 'right', size: 'normal', label: 'S_2' }],
      levels: [guide({ id: 'P1', kind: 'ceiling', below: ['D1', 'S1'], above: ['D1', 'S2'], label: 'P_1' })],
      points: [pt('S1', 'P1', 'Q_1'), pt('D1', 'P1', 'Q_2'), pt('D1', 'S2', 'Q_3'), pt('S2', 'P1', 'Q_4')],
      asks: { what: 'quantityTransacted', state: 'after' },
    }),
  },
  {
    id: 'unit-tax',
    title: t('3 · Unit tax: the price sellers receive', '3 · 從量稅：賣家收取的價格'),
    before: t(
      'Refer to a supply-demand diagram of good Y. The government imposes a unit tax and the supply curve shifts upward from S0 to S1. P3 is the new equilibrium price at the intersection of D and S1, P2 is the original equilibrium price where D meets S0, and P1 is the price on S0 at the new quantity Q1. After the tax, the price received by sellers is ____.',
      '參看 Y 物品的供求圖。政府徵收從量稅，供應曲線由 S0 向上移至 S1。P3 是 D 與 S1 交點的新均衡價格，P2 是 D 與 S0 的原來均衡價格，P1 是 S0 在新數量 Q1 的價格。徵稅後，賣家收取的價格是 ____。',
    ),
    after: t(
      'Refer to the following diagram. The government imposes a unit tax on good Y and the supply curve shifts from S_0 to S_1.\n\nAfter the tax, the price received by sellers is ____.',
      '參看下圖。政府向 Y 物品徵收從量稅，供應曲線由 S_0 移至 S_1。\n\n徵稅後，賣家收取的價格是 ____。',
    ),
    options: t(['P1', 'P2', 'P3', 'P3 − P1'], ['P1', 'P2', 'P3', 'P3 − P1']),
    answer: 0,
    explanation: t('Buyers pay P3; sellers keep the price on the original supply at the new quantity, P1.', '買家支付 P3；賣家收取原來供應曲線在新數量的價格 P1。'),
    figure: 'D, S0 shifting up to S1 by the tax; P3/Q1 at D×S1, P2/Q2 at D×S0, P1 on S0 above Q1; key P1.',
    old: base({
      curves: [D('D', 'D'), S('S0', 'S_0')],
      shifts: [{ of: 'S0', id: 'S1', direction: 'up', size: 'normal', label: 'S_1' }],
      equilibria: [eq('D', 'S0', 'Q_2', 'P_2'), eq('D', 'S1', 'Q_1', 'P_3')],
    }),
    reply: base({
      reason: 'A unit tax shifts supply up; sellers get S0 at the new quantity.',
      curves: [D('D', 'D'), S('S0', 'S_0')],
      shifts: [{ of: 'S0', id: 'S1', direction: 'up', size: 'normal', label: 'S_1' }],
      points: [pt('D', 'S1', 'Q_1', 'P_3'), pt('D', 'S0', 'Q_2', 'P_2'), pt('S0', 'Q_1', '', 'P_1')],
      asks: { what: 'sellersGet', state: 'after' },
    }),
  },
  {
    id: 'subsidy',
    title: t('4 · Unit subsidy: the price buyers pay', '4 · 從量津貼：買家支付的價格'),
    before: t(
      'Refer to a supply-demand diagram of good Y. The government gives producers a unit subsidy and the supply curve shifts downward from S0 to S1. P2 is the original equilibrium price at the intersection of D and S0, P1 is the new equilibrium price where D meets S1, and P3 is the price on S0 at the new quantity Q2. After the subsidy, the price paid by buyers is ____.',
      '參看 Y 物品的供求圖。政府向生產者提供從量津貼，供應曲線由 S0 向下移至 S1。P2 是 D 與 S0 交點的原來均衡價格，P1 是 D 與 S1 交點的新均衡價格，P3 是 S0 在新數量 Q2 的價格。提供津貼後，買家支付的價格是 ____。',
    ),
    after: t(
      'Refer to the following diagram. The government gives producers of good Y a unit subsidy and the supply curve shifts from S_0 to S_1.\n\nAfter the subsidy, the price paid by buyers is ____.',
      '參看下圖。政府向 Y 物品的生產者提供從量津貼，供應曲線由 S_0 移至 S_1。\n\n津貼實施後，買家支付的價格是 ____。',
    ),
    options: t(['P1', 'P2', 'P3', 'P3 − P1'], ['P1', 'P2', 'P3', 'P3 − P1']),
    answer: 0,
    explanation: t('Buyers pay the new market price P1; sellers receive P3 including the subsidy.', '買家支付新的市場價格 P1；賣家連津貼收取 P3。'),
    figure: 'D, S0 shifting down to S1 by the subsidy; P2/Q1 at D×S0, P1/Q2 at D×S1, P3 on S0 above Q2; key P1.',
    old: base({
      curves: [D('D', 'D'), S('S0', 'S_0')],
      shifts: [{ of: 'S0', id: 'S1', direction: 'down', size: 'normal', label: 'S_1' }],
      equilibria: [eq('D', 'S0', 'Q_1', 'P_2'), eq('D', 'S1', 'Q_2', 'P_1')],
    }),
    reply: base({
      reason: 'A unit subsidy shifts supply down; buyers pay the new market price.',
      curves: [D('D', 'D'), S('S0', 'S_0')],
      shifts: [{ of: 'S0', id: 'S1', direction: 'down', size: 'normal', label: 'S_1' }],
      points: [pt('D', 'S0', 'Q_1', 'P_2'), pt('D', 'S1', 'Q_2', 'P_1'), pt('S0', 'Q_2', '', 'P_3')],
      asks: { what: 'buyersPay', state: 'after' },
    }),
  },
  {
    id: 'quota',
    title: t('5 · Quota: the market price', '5 · 配額：市場價格'),
    before: t(
      'Refer to a supply-demand diagram of good W. The government sets a quota at Q1, which is to the left of the intersection of D and S. P1 is the equilibrium price without the quota, at quantity Q2, and P2 is the price on the demand curve at the quota. The market price will be ____.',
      '參看 W 物品的供求圖。政府把配額定於 Q1，位於 D 與 S 交點的左方。P1 是沒有配額時的均衡價格，數量為 Q2；P2 是需求曲線在配額數量的價格。市場價格會是 ____。',
    ),
    after: t(
      'Refer to the following supply-demand diagram of good W. The government sets a quota of Q_1 on the output of good W.\n\nThe market price will be ____.',
      '參看下面 W 物品的供求圖。政府把 W 物品的產量配額定於 Q_1。\n\n市場價格會是 ____。',
    ),
    options: t(['P1', 'P2', 'Q1', 'Q2'], ['P1', 'P2', 'Q1', 'Q2']),
    answer: 1,
    explanation: t('Only Q1 can be sold, so the price is what buyers will pay for Q1 on the demand curve: P2.', '只可出售 Q1，價格是需求曲線上 Q1 的價格 P2。'),
    figure: 'D, S; a quota Q1 left of D×S; P2 on D at Q1, P1/Q2 at D×S; key P2.',
    old: base({
      curves: [D('D', 'D'), S('S', 'S'), { id: 'Qq', role: 'vertical', slope: 'normal', place: 'low', label: 'Quota' }],
      equilibria: [eq('D', 'S', 'Q_2', 'P_1'), eq('D', 'Qq', '', 'P_2')],
    }),
    reply: base({
      reason: 'A binding quota: the price read off demand at the quota.',
      curves: [D('D', 'D'), S('S', 'S')],
      levels: [guide({ id: 'Qq', kind: 'quota', below: ['D', 'S'], label: 'Q_1' })],
      points: [pt('D', 'Qq', '', 'P_2'), pt('S', 'Qq', '', ''), pt('D', 'S', 'Q_2', 'P_1')],
      asks: { what: 'marketPrice', state: 'after' },
    }),
  },
  {
    id: 'ppc',
    title: t('6 · PPC: economic growth', '6 · 生產可能曲線：經濟增長'),
    before: t(
      'Refer to a diagram where the production possibilities curve of an economy shifts outward from PPC0 to PPC1. Point A lies inside PPC0, point B lies on PPC0 and point C lies outside PPC0. Which of the following points was unattainable before the shift but attainable after it?',
      '參看某經濟體的生產可能曲線由 PPC0 向外移至 PPC1 的圖。A 點在 PPC0 之內，B 點在 PPC0 之上，C 點在 PPC0 之外。以下哪一點在移動前不能達到，但在移動後可以達到？',
    ),
    after: t(
      'Refer to the following diagram. The production possibilities curve of an economy shifts from PPC_0 to PPC_1.\n\nWhich of the following points was unattainable before the shift but attainable after it?',
      '參看下圖。某經濟體的生產可能曲線由 PPC_0 移至 PPC_1。\n\n以下哪一點在移動前不能達到，但在移動後可以達到？',
    ),
    options: t(['Point A', 'Point B', 'Point C', 'None of them'], ['A 點', 'B 點', 'C 點', '以上皆不是']),
    answer: 2,
    explanation: t('C is outside PPC0 but inside PPC1.', 'C 點在 PPC0 之外，但在 PPC1 之內。'),
    figure: 'PPC0 moving out to PPC1; A inside PPC0, B on PPC0, C between PPC0 and PPC1; key C.',
    old: base({
      xAxis: t('Good X', 'X 物品'),
      yAxis: t('Good Y', 'Y 物品'),
      curves: [{ id: 'F0', role: 'frontier', slope: 'normal', place: 'mid', label: 'PPC_0' }],
      shifts: [{ of: 'F0', id: 'F1', direction: 'out', size: 'normal', label: 'PPC_1' }],
      marks: [{ of: 'F0', where: 'inside', label: 'A' }, { of: 'F0', where: 'on', label: 'B' }, { of: 'F0', where: 'outside', label: 'C' }],
    }),
    reply: base({
      reason: 'Growth: PPC0 moves out to PPC1; A inside, B on, C between.',
      xAxis: t('Good X', 'X 物品'),
      yAxis: t('Good Y', 'Y 物品'),
      curves: [{ id: 'F0', role: 'frontier', slope: 'normal', place: 'mid', label: 'PPC_0' }],
      shifts: [{ of: 'F0', id: 'F1', direction: 'out', size: 'normal', label: 'PPC_1' }],
      marks: [{ of: 'F0', where: 'inside', label: 'A' }, { of: 'F0', where: 'on', label: 'B' }, { of: 'F0', where: 'outside', label: 'C' }],
    }),
  },
];
