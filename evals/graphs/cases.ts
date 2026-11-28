/**
 * The graph eval set (k-0577): studio-style questions (stem, options, key, the writer's figure
 * note) whose diagram the studio's diagram step must draw. Frozen, so a before and an after run
 * of `evals/graphs.eval.ts` read the same inputs. Weighted to topic E (efficiency): surplus areas,
 * deadweight loss, tax and subsidy incidence, price controls, quota, externalities. Invented
 * questions in the HKDSE manner, no paper's own words.
 *
 * `want` is what a right figure shows, for the reviewer's score; `labels` are the labels the
 * question names, which must all be on the figure.
 */
import { LORENZ_CASES } from '@/diagramGen/lorenz.fixture';

export interface GraphCase {
  id: string;
  /** The graph type, as in the k-0577 inventory. */
  type: string;
  family: 'E' | 'SD' | 'other';
  stem: string;
  /** Numbered statements (1), (2) … of a statement question (k-0587); absent = none. */
  statements?: string[];
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
  figure: string;
  want: string;
  labels: string[];
}

/** The writer's figure note and the reviewer's "want" for each Lorenz case (k-0584), vague as a writer's. */
const LORENZ_NOTES: Record<string, { figure: string; want: string; labels: string[] }> = {
  'lz-two-economies': {
    figure: 'Two Lorenz curve diagrams side by side, one for Economy X and one for Economy Y. Y is closer to the line of equality. Key: B.',
    want: 'two square boxes titled Economy X and Economy Y; Y nearer the diagonal; smooth convex curves through both corners; no before/after key',
    labels: [],
  },
  'lz-grid-gini': {
    figure: 'Lorenz curves of Country A and Country B, each on its own grid (0 to 100, every 20), cumulative percentages. A is closer to the line of equality. Key: D.',
    want: 'two square boxes with 20% grids and 0–100 numbers; A nearer the diagonal; titles Country A, Country B',
    labels: [],
  },
  'lz-before-after': {
    figure: 'One Lorenz diagram with two curves: A (pre-tax pre-transfer, dashed) and B (post-tax post-transfer), B further from the line of equality, with a key. Key: C.',
    want: 'one square box; A dashed nearer the diagonal, B further; key beside the box; letters by their curves',
    labels: ['A', 'B'],
  },
  'lz-old-new': {
    figure: 'One Lorenz diagram on a grid: old curve A and new curve B, B closer to the line of equality, line of equality drawn. Key: C.',
    want: 'one square box with grid; A further, B nearer the diagonal; line of equality; key old/new',
    labels: ['A', 'B'],
  },
};

/** The Lorenz cases (k-0584, u-25vr), from the fixture the offline tests use. */
const LORENZ_GRAPH_CASES: GraphCase[] = LORENZ_CASES.map((c) => ({
  id: c.id,
  type: `Lorenz curves (${c.like})`,
  family: 'other',
  stem: c.mcq.stem,
  options: c.mcq.options as [string, string, string, string],
  answer: c.mcq.answer as 0 | 1 | 2 | 3,
  explanation: c.key,
  ...LORENZ_NOTES[c.id],
}));

/**
 * Audit k-0583 task A (k-0586): one case per HKDSE example the audit cites for the routes A1 to
 * A3 change (money market, movement along, import-quota brace, AD–AS with LRAS, output gap, old
 * and new tax schedules, pie, subsidy raised, revenue at a fixed price). Invented in the HKDSE
 * manner (the bank holds no option keys, so the keys are ours), the figure type and labels
 * following the named question; drafted by a subagent (Sonnet) and checked here.
 */
const AUDIT_CASES: GraphCase[] = [
  {
    id: 'mm-lattice',
    type: 'Money market lattice: three Ms verticals x three Md curves, lettered crossings (like DSE2017 P1 Q32)',
    family: 'other',
    stem: 'The diagram below shows the money demand and money supply curves of an economy. The original equilibrium point is at E.\nSuppose a new online platform lets households buy and sell government bonds at almost no cost, and at the same time the central bank raises the discount rate. The new equilibrium point will be at ______.',
    options: ['A', 'B', 'C', 'D'],
    answer: 3,
    explanation:
      'Bonds become cheaper to trade, so holding money to be ready for bond deals is less needed and the demand for money falls from M_d0 to M_d2. A higher discount rate makes banks borrow less from the central bank and lend less, so the money supply falls from M_s0 to M_s2. The new equilibrium is where M_d2 meets M_s2, point D. Point A (M_d1 and M_s1) is the result of rising demand and rising supply. Point B (M_d2 and M_s1) wrongly raises the money supply. Point C (M_d1 and M_s2) wrongly raises the demand for money.',
    figure:
      'Money market. Y axis nominal interest rate, X axis quantity of money. Three verticals M_s2 (left), M_s0, M_s1 (right). Three downward lines M_d1 (top), M_d0, M_d2 (bottom). Dot and letter each crossing that is an option: A = M_d1 with M_s1, B = M_d2 with M_s1, C = M_d1 with M_s2, D = M_d2 with M_s2, E = M_d0 with M_s0 (start). Key: D.',
    want: 'three vertical Ms lines in order Ms2, Ms0, Ms1 left to right, three parallel Md lines Md1 above Md0 above Md2, dots with letters A to E exactly on the named crossings, labels on the lines, axes titled; no extra curves',
    labels: ['M_s0', 'M_s1', 'M_s2', 'M_d0', 'M_d1', 'M_d2', 'A', 'B', 'C', 'D', 'E'],
  },
  {
    id: 'mm-demand-shift',
    type: 'One money-demand curve shifting, no money supply line (like DSE2020 P1 Q28 and DSE2023 P1 Q29)',
    family: 'other',
    stem: 'The following diagram shows the asset demand for money of an economy. Which of the following will cause the change from M_a1 to M_a2?',
    options: [
      'The nominal interest rate rises.',
      'Investors become less worried that firms will fail to repay their bonds.',
      'People fear a financial crisis and worry more about the default risk of corporate bonds.',
      'The central bank buys government bonds from the public.',
    ],
    answer: 2,
    explanation:
      'The curve shifts to the right: at every interest rate people want to hold more money. When default risk of bonds rises, people switch from bonds to money, so the asset demand for money rises. Option A is a movement along the curve, because the interest rate is on the vertical axis. Option B lowers the demand for money, a shift to the left. Option D changes the money supply, not the asset demand for money.',
    figure:
      'Asset demand for money. Y axis nominal interest rate (%), X axis quantity of money. One downward line M_a1 and a parallel one M_a2 to its right, arrow between them pointing right. No supply curve. Key: C.',
    want: 'exactly two parallel downward-sloping lines, M_a1 on the left and M_a2 on the right, a horizontal arrow pointing right between them, axes titled; no vertical supply line, no equilibrium points',
    labels: ['M_a1', 'M_a2'],
  },
  {
    id: 'sd-movement-along',
    type: 'One demand curve with two lettered points: movement along vs shift (like DSE2022 P1 Q14)',
    family: 'SD',
    stem: 'The following diagram shows the demand curve of electric bicycles. Which of the following can best explain the change in equilibrium position from Y to X?',
    options: [
      'The production cost of electric bicycles falls.',
      'Consumers expect the price of electric bicycles to rise next year.',
      'The price of petrol, a substitute for electric bicycles, falls.',
      'The income of consumers increases.',
    ],
    answer: 0,
    explanation:
      'X lies lower and to the right of Y on the same demand curve, so the price falls and the quantity demanded rises along D. This is caused by a rise in supply, such as a fall in the cost of production. Options B, C and D all shift the demand curve itself (to the right, to the left and to the right respectively for a normal good) and cannot move the equilibrium along D.',
    figure:
      'Just one downward demand curve D, Price on Y axis, Quantity on X axis. Two dots on it, Y upper left and X lower right. No supply curves drawn. Key: A.',
    want: 'a single downward-sloping line D with two separate dots, Y on the upper left part and X on the lower right part, each with its letter; no supply curve, no second demand curve; the dots are on the line and far enough apart to read',
    labels: ['D', 'X', 'Y'],
  },
  {
    id: 'iq-brace',
    type: 'Import quota as a labelled gap at the price P_0, no kinked supply (like DSE2016 P1 Q42)',
    family: 'E',
    stem: 'Refer to the following supply-demand diagram about Good Y in a small country. The country has imposed an import quota on Good Y and the price and quantity transacted are P_0 and Q_0 respectively.\nIf the government doubles the import quota, which of the following will happen?',
    options: [
      'The price of Good Y will rise.',
      'The quantity of domestic production of Good Y will fall.',
      'The total quantity transacted of Good Y will fall.',
      'The quantity of domestic production of Good Y will rise.',
    ],
    answer: 1,
    explanation:
      'The quota is the horizontal gap between D and S at P_0. A doubled gap can only be found at a lower price, because the gap widens as the price falls. So the price falls (A wrong). Domestic firms move down along S and produce less (B right, D wrong). The quantity demanded rises as the price falls along D, so the total quantity transacted rises (C wrong).',
    figure:
      'Price ($) on Y axis, Quantity on X axis. Upward S, downward D, they cross higher up. Dashed horizontal line at P_0 below the crossing, with a drop to Q_0 on the X axis where it meets D. Curly brace on the P_0 line from S to D marked "Import quota". Key: B.',
    want: 'S and D crossing; dashed price line P_0 below the crossing meeting S and D; a brace under or on that line spanning exactly from S to D, labelled Import quota; dashed drop from the D end to Q_0; no kink in S, no second supply curve',
    labels: ['S', 'D', 'P_0', 'Q_0', 'Import quota'],
  },
  {
    id: 'adas-self-adjust',
    type: 'AD-AS with vertical LRAS: AD falls, SRAS shifts until AD meets LRAS (like DSE2018 P1 Q28)',
    family: 'other',
    stem: 'The diagram below shows the aggregate demand (AD) curves, short-run aggregate supply (SRAS) curves and the long-run aggregate supply (LRAS) curve of an economy. The economy initially operates at E_0.\nIf the government cuts its spending on public works by a large amount, the short-run equilibrium will be at ______ and the long-run equilibrium will be at ______.',
    options: ['E_2 and E_1', 'E_3 and E_0', 'E_3 and E_4', 'E_4 and E_4'],
    answer: 2,
    explanation:
      'Lower government spending shifts AD from AD_0 to AD_1. In the short run, prices of inputs are sticky, so SRAS_0 stays and the economy moves to E_3, with output below the full-employment level on LRAS_0. With unemployment above the natural rate, wages and other input prices fall, so SRAS shifts right from SRAS_0 to SRAS_2 until it meets AD_1 on LRAS_0, at E_4. Option A is the answer for a rise in AD. Option B is wrong because AD does not return to AD_0, so E_0 is not reached. Option D is wrong because output cannot be at LRAS_0 in the short run before input prices adjust.',
    figure:
      'AD-AS. Y axis price level, X axis output level. Vertical LRAS_0. Three upward lines SRAS_1 (upper left), SRAS_0, SRAS_2 (lower right); three downward lines AD_1 (lowest), AD_0, AD_2 (highest). E_0 = AD_0 x SRAS_0 on LRAS_0. E_1 = AD_2 x SRAS_1 on LRAS_0 above E_0. E_2 = AD_2 x SRAS_0. E_3 = AD_1 x SRAS_0. E_4 = AD_1 x SRAS_2 on LRAS_0 below E_0. Key: C.',
    want: 'a vertical LRAS_0 line with E_0, E_1 and E_4 exactly on it (E_1 above, E_4 below E_0); E_2 right of it on AD_2, E_3 left of it on AD_1; SRAS_1 through E_1, SRAS_0 through E_0 E_2 E_3, SRAS_2 through E_4; AD_0 through E_0, AD_2 through E_1 E_2, AD_1 through E_3 E_4',
    labels: ['LRAS_0', 'SRAS_0', 'SRAS_1', 'SRAS_2', 'AD_0', 'AD_1', 'AD_2', 'E_0', 'E_1', 'E_2', 'E_3', 'E_4'],
  },
  {
    // No HKDSE P1 bank question has an output-gap bracket; invented in the manner of Paper 2 inflationary-gap parts.
    id: 'adas-output-gap',
    type: 'AD-AS with LRAS at Y_f: inflationary output gap and its correction (invented, Paper 2 output-gap manner)',
    family: 'other',
    stem: 'The diagram below shows the aggregate demand curve AD, the short-run aggregate supply curve SRAS and the long-run aggregate supply curve LRAS of an economy. The economy is at E, with output Y_1 and price level P_1.\nWhich of the following statements is correct?',
    options: [
      'There is a deflationary gap equal to Y_1 - Y_f.',
      'The unemployment rate is above the natural rate of unemployment.',
      'In the long run, SRAS will shift to the left, the price level will rise further and output will fall back to Y_f.',
      'In the long run, AD will fall until it cuts SRAS at Y_f.',
    ],
    answer: 2,
    explanation:
      'Actual output Y_1 is above the full-employment output Y_f, so there is an inflationary gap Y_f Y_1 and unemployment is below its natural rate (A and B wrong). Input prices rise as firms compete for scarce resources, so SRAS shifts to the left until it cuts AD on LRAS at Y_f, with a higher price level than P_1 (C right). Nothing in the situation makes AD fall by itself, so D is wrong.',
    figure:
      'AD-AS. Price level up, Output level across. Vertical LRAS with Y_f below it on the X axis. One downward AD and one upward SRAS crossing at E to the RIGHT of LRAS. Dashed drops from E to Y_1 on X axis and across to P_1 on the Y axis. Bracket between Y_f and Y_1 maybe. Key: C.',
    want: 'LRAS vertical at Y_f; AD and SRAS crossing at E clearly right of LRAS; dashed lines from E to P_1 and Y_1; Y_f and Y_1 on the X axis with Y_1 right of Y_f; an optional bracket for the gap between them; no other curves',
    labels: ['AD', 'SRAS', 'LRAS', 'E', 'Y_f', 'Y_1', 'P_1'],
  },
  {
    id: 'tax-old-new',
    type: 'Old vs new tax schedule, tax rate against income, lines cross (like DSE2013 P1 Q36)',
    family: 'other',
    stem: 'The following diagram shows the change in the salaries tax structure of an economy. Compared to the old salaries tax structure, the new tax structure ______.',
    options: [
      'lowers the tax rate of every taxpayer.',
      'raises the tax rate of every person who pays tax.',
      'turns the salaries tax from progressive into proportional.',
      'makes the burden lighter for taxpayers near the old tax-free income and heavier for high-income taxpayers.',
    ],
    answer: 3,
    explanation:
      'The new structure starts at a higher income, so people with income just above the old threshold now pay a lower rate, and its highest rate is higher than the old one, so high-income taxpayers pay a higher rate. The lines cross, so options A and B (every taxpayer) are wrong. Both schedules still rise with income up to the highest rate, so the tax stays progressive and C is wrong.',
    figure:
      'Tax rate (%) on Y axis, Income ($) on X axis. Two schedules, each zero then a steep rise then flat at its top rate. Old tax structure starts earlier and tops out lower; New tax structure starts later (higher allowance) and tops out higher. They cross once on the way up. Label each line at its right end. Key: D.',
    want: 'two line schedules each flat at zero then rising then flat; the New one starting further right and ending higher; they cross once before the plateaus; each labelled at the plateau end; no axis numbers needed',
    labels: ['Old tax structure', 'New tax structure'],
  },
  {
    id: 'tax-old-new-2',
    type: 'Old vs new tax schedule, the new one above the original everywhere (like DSE2026 P1 Q40)',
    family: 'other',
    stem: 'The diagram below shows the change in the salaries tax structure of an economy. As a result of the above changes, ______.',
    options: [
      'every taxpayer who also paid tax before will pay a higher tax rate',
      'the number of taxpayers will fall',
      'the tax will become regressive',
      'taxpayers with the lowest taxable incomes will gain the most',
    ],
    answer: 0,
    explanation:
      'The new schedule lies above the original one at every income above the original tax-free level, so every person who already paid tax now pays a higher rate (A right). The new schedule also starts at a lower income, so more people pay tax and B is wrong. Rates still rise with income, so it is still progressive, not regressive (C wrong). Taxpayers with low incomes are newly taxed or taxed more, so they cannot gain (D wrong).',
    figure:
      'Tax rate (%) on Y axis, Income ($) on X axis. Two schedules, ramp then flat. Original tax structure: starts later, lower top rate. New tax structure: starts earlier, higher top rate; both flatten out at about the same income. The new one stays above, no crossing. Key: A.',
    want: 'an Original line and a New line, New starting left of Original and ending higher; New above Original everywhere above Original starting point; no crossing; both labelled at their plateau ends',
    labels: ['Original tax structure', 'New tax structure'],
  },
  {
    id: 'pie-shares',
    type: 'Pie chart of revenue shares (like DSE2012 P1 Q35, one year of its two pies)',
    family: 'other',
    stem: 'The following chart shows the composition of the General Revenue of Country Z in 2020-2021. Total revenue was $440 billion.\nBased on the chart, revenue from indirect tax in 2020-2021 was',
    options: ['$38.5 billion.', '$110 billion.', '$160.6 billion.', '$169.4 billion.'],
    answer: 1,
    explanation:
      'Indirect tax was 25.0% of $440 billion, which is $110 billion (B). $160.6 billion is the other revenues (36.5%) and $169.4 billion the direct tax (38.5%), so C and D read the wrong slice; $38.5 billion mistakes the percentage of direct tax for an amount (A).',
    figure: 'A pie chart of General Revenue 2020-2021, three slices: Direct tax 38.5%, Indirect tax 25.0%, Other revenues 36.5%. Key: B.',
    want: 'one pie with the shares to scale (38.5 / 25.0 / 36.5), each slice named with its percentage, different shading; no axes',
    labels: ['Direct tax', 'Indirect tax', 'Other revenues'],
  },

  {
    id: 'subsidy-raise',
    type: 'Per-unit subsidy raised: three parallel supply curves, corner letters (like DSE2024 P1 Q20)',
    family: 'E',
    stem: 'The following diagram shows the supply and demand curves of Good Z. Suppose the government increases the per-unit subsidy on Good Z from $2 to $4. Which of the following statements is correct?',
    options: [
      'The deadweight loss increases by area efih.',
      'The new deadweight loss is area efih.',
      'The government\'s subsidy spending increases by area cdgf.',
      'The deadweight loss increases by area cdi.',
    ],
    answer: 0,
    explanation:
      'S_0 shows the marginal cost without subsidy. With the $2 subsidy the quantity is at f and the deadweight loss is triangle cef (the cost on S_0 exceeds the value on D between the output at c and the output at f). With the $4 subsidy the quantity is at i and the deadweight loss is triangle chi. The increase is chi minus cef, which is area efih (A right). Option B calls the increase the new deadweight loss, which is area chi. Option C is not a subsidy-spending area: spending is the subsidy per unit times quantity, so the area is not cdgf. Option D, area cdi, lies under the first quantity and is not a loss.',
    figure:
      'Price (Y) and Quantity (X). D downward. Three parallel upward supply curves: S_0 (without subsidy), S_1 (with $2 subsidy), S_2 (with $4 subsidy). c = D x S_0, f = D x S_1, i = D x S_2. d on S_2 straight below c; e on S_0 straight above f; g on S_2 straight below f; h on S_0 straight above i. Dashed verticals through c d, e f g, h i. Key: A.',
    want: 'D, three parallel upward supplies S_0 above S_1 above S_2, c, f, i on D at the three crossings, d on S_2 below c, e on S_0 and g on S_2 on the vertical through f, h on S_0 above i, dashed verticals through c d / e f g / h i, supply labels with their subsidies at the right ends',
    labels: ['D', 'S_0', 'S_1', 'S_2', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  },
  {
    // Paper 2 question (no Paper 2 in the bank); modelled on the coverage note (revenue-tr row), made into an MCQ.
    id: 'fixed-price-revenue',
    type: "Price fixed in the seller's currency, demand shifts left, change in total revenue (modelled on DSE2014 P2 Q11 and DSE2023 P2 Q9, Paper 2 made into an MCQ)",
    family: 'SD',
    stem: 'A theme park in Macau charges a price of P_0 for its tickets and does not change it. The following diagram shows the demand for tickets before (D_0) and after (D_1) tourists from Hong Kong become fewer. The total revenue of the theme park',
    options: ['rises by P_0 × (Q_0 − Q_1).', 'falls by P_0 × (Q_0 − Q_1).', 'falls by P_0 × Q_0.', 'does not change because the price is fixed.'],
    answer: 1,
    explanation:
      'The price stays at P_0, the horizontal line. When demand falls from D_0 to D_1 the number of tickets sold falls from Q_0 to Q_1, so total revenue falls from P_0 × Q_0 to P_0 × Q_1, a fall of P_0 × (Q_0 − Q_1) (B). A has the wrong direction, C is the whole old revenue, and D forgets that the quantity sold still changes when the price is fixed.',
    figure: 'Price on Y axis, Quantity on X axis. A horizontal line at P_0 (the fixed price). D_0 and D_1 downward, D_1 left of D_0. Q_1 below where D_1 meets the P_0 line, Q_0 below where D_0 meets it. Shade the fall in revenue. Key: B.',
    want: 'a horizontal price line P_0; D_0 and D_1 downward with D_1 left of D_0; dashed drops to Q_1 and Q_0; the revenue fall (the box between Q_1 and Q_0 under P_0) shaded',
    labels: ['P_0', 'Q_0', 'Q_1', 'D_0', 'D_1'],
  },

  {
    id: 'mm-lattice-2',
    type: 'Money market lattice, second form: Ms1 left, Ms2 right, Md2 on top (like DSE2025 P1 Q33)',
    family: 'other',
    stem: 'The diagram below shows the money demand and money supply curves of an economy. The original equilibrium point is at E.\nSuppose employers in the economy start paying wages every day instead of every month. At the same time, the central bank sells government bonds to the public. The new equilibrium point in the above diagram will be at point ______.',
    options: ['A', 'B', 'C', 'D'],
    answer: 2,
    explanation:
      'With daily pay, people need to hold less money between pay days, so the transactions demand for money falls from M_d0 to M_d1. When the central bank sells government bonds the public pays with money, so the money supply falls from M_s0 to M_s1. The new equilibrium is where M_d1 meets M_s1, point C. Point A (M_d2 and M_s2) has demand and supply both rising. Point B (M_d1 and M_s2) has the right fall in demand but a rise in supply. Point D (M_d0 and M_s1) has the right fall in supply but demand unchanged.',
    figure:
      'Money market. Nominal interest rate up, quantity of money across. Verticals M_s1 (left), M_s0 (middle), M_s2 (right). Downward lines M_d2 (top), M_d0, M_d1 (bottom). Dots with letters: E = M_d0 x M_s0, D = M_d0 x M_s1, C = M_d1 x M_s1, A = M_d2 x M_s2, B = M_d1 x M_s2. Key: C.',
    want: 'three verticals in order M_s1, M_s0, M_s2 left to right; three parallel demand lines M_d2 above M_d0 above M_d1; five dots A to E each exactly on its two named lines; line labels at the ends; no other crossings lettered',
    labels: ['M_s0', 'M_s1', 'M_s2', 'M_d0', 'M_d1', 'M_d2', 'A', 'B', 'C', 'D', 'E'],
  },
];


/**
 * Audit k-0583 task B (k-0587): two-state control figures, one case per HKDSE form the audit
 * cites (a ceiling lowered across equilibrium, a floor changed, both floors ineffective, a ceiling
 * with a supply shift, a quota enlarged, demand rising under a quota, a ceiling lowered while
 * binding, a minimum wage with a labour-supply fall). Invented in the HKDSE manner, our words,
 * the figure type and labels following the named question; keys are ours.
 */
/** k-0589 (audit k-0583 task C): monopoly scenes, MR derived from D. */
const MONOPOLY_CASES: GraphCase[] = [
  {
    id: 'c-mono-mc-fall',
    type: 'Monopoly, MC falls, statements (like DSE2019 P2 Q13 as an MCQ)',
    family: 'other',
    stem: 'The diagram shows the demand (D), marginal revenue (MR) and marginal cost curves of a monopolist that charges a uniform price. Its marginal cost falls from MC_1 to MC_2 because components become cheaper. Which of the following will happen?',
    options: ['The monopoly price will rise.', 'The output will increase.', 'The consumer surplus will decrease.', 'The output will remain unchanged.'],
    answer: 1,
    explanation: 'The monopolist produces where MR = MC. When MC falls to MC_2, MR = MC at a larger output, and the price read from D is lower (A is wrong, B is right). With a lower price and a larger output, consumer surplus rises (C is wrong). The output changes (D is wrong).',
    figure: 'Price and Quantity. A straight D, MR below it from the same intercept, two upward-sloping MC curves MC_1 and MC_2 (MC_2 lower). No ticks. Key: B.',
    want: 'monopoly mc rising stage mcFall; MR from D intercept twice as steep; MC_1 above MC_2; no letters',
    labels: ['D', 'MR', 'MC_1', 'MC_2'],
  },
  {
    id: 'c-mono-dwl-letters',
    type: 'Monopoly, constant MC: deadweight loss by letters',
    family: 'other',
    stem: 'The diagram shows a monopolist with constant marginal cost (MC). It maximises profit and charges a uniform price. The deadweight loss is area',
    options: ['A.', 'B.', 'C.', 'A + C.'],
    answer: 2,
    explanation: 'The monopolist produces where MR = MC and charges the price on D above that output. Society would want output up to where D (marginal benefit) meets MC. The triangle between D and MC from the monopoly output to the efficient output is the deadweight loss: C. A is consumer surplus and B the monopolist\'s surplus.',
    figure: 'Price and Quantity. D, MR, a horizontal MC. Q_m and P_m marked. Area A consumer surplus, B the producer surplus rectangle, C the triangle between D and MC beyond Q_m. Key: C.',
    want: 'monopoly flat MC; A = cs, B = ps, C = dwl; Q_m, P_m ticks',
    labels: ['D', 'MR', 'MC', 'A', 'B', 'C'],
  },
  {
    id: 'c-mono-zero',
    type: 'Monopoly, MC = 0: profit-maximising and efficient outputs (like DSE2017 P2 Q14 as an MCQ)',
    family: 'other',
    stem: 'An internet service provider is a monopoly. Once its network is installed, its marginal cost of serving a customer is zero. The diagram shows its demand (D) and marginal revenue (MR) curves. Which output maximises its profit?',
    options: ['Q_1', 'Q_2', 'zero output', 'the output where D meets MR'],
    answer: 0,
    explanation: 'With MC = 0, profit is greatest where MR = MC = 0: Q_1, where MR meets the quantity axis (half of the demand curve\'s quantity intercept). Q_2, where D meets the axis, is the efficient output (MB = MC = 0).',
    figure: 'Price and Quantity. D reaching the quantity axis, MR from the same intercept reaching it halfway. MC = 0. Q_1 where MR meets the axis, Q_2 where D meets it. Key: A.',
    want: 'monopoly mc zero; Q_1 at MR foot, Q_2 at D foot; MC = 0 named',
    labels: ['D', 'MR', 'Q_1', 'Q_2'],
  },
];

/** k-0589: PPF / CPF trade scenes, numbers worked out from the question's. */
const TRADE_CASES: GraphCase[] = [
  {
    id: 'c-ppf-imports',
    type: 'Linear PPF and CPF, imports read from the figure (like DSE2019 P2 Q14 as an MCQ)',
    family: 'other',
    stem: 'The diagram shows the production possibility frontier (PPF) of Country A, which can produce 20X or 30Y. The world price is 1X = 2Y. After trade, A consumes 10 units of X. How many units of Y does A import?',
    options: ['5', '10', '15', '20'],
    answer: 3,
    explanation: 'A gives up 1.5Y for each X at home, less than the world price of 2Y, so it specialises completely in X and produces 20X. Its CPF runs from 20X to 40Y. Consuming 10X, it exports 10X and receives 20Y: it imports 20 units of Y (D).',
    figure: 'Axes Good X and Good Y. PPF_A from 30 on the Y axis to 20 on the X axis. Show only the PPF and its numbers: the student works out the rest. Key: D.',
    want: 'ppfTrade one country, linear 20X/30Y, tot 2; the figure printed shows only PPF_A with 20 and 30 (CPF, C may be an answer layer or absent)',
    labels: ['PPF_A'],
  },
  {
    id: 'c-ppf-concave-exports',
    type: 'Concave PPF, world price flatter than the PPF at the no-trade point: which good is exported',
    family: 'other',
    stem: 'The diagram shows the concave PPF of Country K with its no-trade point E. The world price line TT\' is flatter than the PPF at E. After trade, Country K will',
    options: ['export X and import Y.', 'export Y and import X.', 'produce at E and not trade.', 'produce more of both goods.'],
    answer: 1,
    explanation: 'At E the opportunity cost of X at home is higher than the world price, so K has a comparative advantage in Y. It moves along the PPF towards more Y, to where the PPF is as flat as TT\', and exports Y for imported X (B).',
    figure: 'Axes Good X and Good Y. A concave PPF with the no-trade point E (opportunity cost 2Y per X) and a dotted world price line TT\' with slope 1 (flatter). Key: B.',
    want: 'ppfTrade concave, noTradeCost 2, tot 1, totLine TT\'; P up-left of E; no brackets needed',
    labels: ['E', "TT'"],
  },  {
    id: 'c-iq-kinked-rent',
    type: 'Import quota, kinked S at the world price, the quota rent by area letters (like DSE2022 P1 Q44)',
    family: 'other',
    stem: 'The diagram shows the market for Good X in a small open economy. S_0 is the domestic supply and S_1 the supply with an import quota at the world price P_w. Which area represents the quota rent?',
    options: ['a', 'b', 'c', 'b + d'],
    answer: 2,
    explanation: 'With the quota the domestic price rises to where D meets S_1. The holders of the import licences buy the quota at P_w and sell it at the domestic price: the quota rent is the rectangle between the two prices over the quota, area c. Areas b and d are the deadweight loss; a is the gain in producer surplus.',
    figure: 'Price and Quantity. D, domestic S_0, kinked S_1 (S_0 up to P_w, flat along P_w for the quota, then S_0 moved right). P_w below where D meets S_0. Area a between the two prices left of S_0, b the triangle above P_w under S_0, c the rectangle between the prices over the quota, d the triangle above P_w under D. Key: C.',
    want: 'importQuota stage none: S_0 domestic, S_1 kinked at P_w; a = psGain, b = dwlProduction, c = rent, d = dwlConsumption; ask quotaRent',
    labels: ['S_0', 'S_1', 'P_w', 'D'],
  },
  {
    id: 'c-iq-brace-doubled',
    type: 'Import quota brace, the quota doubled: statements (like DSE2016 P1 Q42)',
    family: 'other',
    stem: 'Refer to the following supply-demand diagram about Good Y in a small country. The country has imposed an import quota on Good Y and the price and quantity transacted are P_0 and Q_0 respectively. If the government doubles the import quota, which of the following will happen?',
    options: ['The price of Good Y will rise.', 'The quantity of domestic production of Good Y will fall.', 'The total quantity transacted of Good Y will fall.', 'The quantity of domestic production of Good Y will rise.'],
    answer: 1,
    explanation: 'The quota is the horizontal gap between D and S at P_0. A doubled gap can only be found at a lower price, because the gap widens as the price falls. So the price falls (A wrong). Domestic firms move down along S and produce less (B right, D wrong). The quantity demanded rises as the price falls along D, so the total quantity transacted rises (C wrong).',
    figure: 'Price on the Y axis, Quantity on the X axis. Upward S, downward D. Dashed horizontal line at P_0 below their crossing, a drop to Q_0 where it meets D. A brace on the P_0 line from S to D marked "Import quota". No world price line, no kinked supply. Key: B.',
    want: 'importQuota brace form (Pw "", Sq ""): S, D, P_0 line, brace from S to D labelled Import quota, Q_0 at D; stage none (the doubling read from the stem)',
    labels: ['S', 'D', 'P_0', 'Q_0', 'Import quota'],
  },
  {
    id: 'c-iq-demand-imports',
    type: 'Demand rises under an import quota: imports unchanged (like DSE2021 P2 Q9(b), made an MCQ)',
    family: 'other',
    stem: 'The diagram shows the market for Good X in a small open economy with an import quota. The demand for Good X increases from D_0 to D_1 while the quota stays unchanged. Which of the following is correct?',
    options: ['The quantity of imports will remain unchanged.', 'The domestic price will fall.', 'Domestic output will fall.', 'The quantity of imports will increase.'],
    answer: 0,
    explanation: 'The quota fixes the quantity imported, so the extra demand is met by domestic producers at a higher price: the domestic price and domestic output rise, and imports stay at the quota (A).',
    figure: 'Price and Quantity. D_0 and D_1 (right of D_0), domestic S_0, the world price P_w, the kinked supply S_q with its flat step along P_w. P_1 where D_0 meets S_q, P_2 where D_1 meets it. Key: A.',
    want: 'importQuota stage demandRise: D_0 → D_1, kinked S_q at P_w, P_1 and P_2 on the kinked supply',
    labels: ['D_0', 'D_1', 'S_0', 'P_w'],
  },
];

const STAGE_CASES: GraphCase[] = [
  {
    id: 'b-ceiling-lowered',
    type: 'Price ceiling lowered from above to below equilibrium, statements (like DSE2021 P1 Q17, 2015 P1 Q19)',
    family: 'E',
    stem: 'The diagram below shows the demand and supply of rice in Country K. The government cuts the maximum price of rice from P_1 to P_2. Which of the following will happen?',
    options: ['Producer surplus will fall.', 'Consumer surplus will rise.', 'The quantity of rice traded will rise.', 'The excess supply of rice will disappear.'],
    answer: 0,
    explanation:
      'P_1 lies above the equilibrium price, so the first ceiling has no effect: the market trades at the equilibrium. P_2 lies below it, so sellers supply less and receive a lower price: producer surplus falls (A). Consumer surplus may rise or fall, since buyers pay less on the units still bought but lose the units no longer sold (B is not necessarily true). The quantity traded falls (C is wrong). At P_1 there was no excess supply, since the market cleared (D is wrong).',
    figure: 'Price and Quantity. D and S cross in the middle. Two dashed horizontal lines: P_1 above the equilibrium, P_2 below it. No quantity ticks. Key: A.',
    want: 'priceCeiling stage lowered binds after: dashed P_1 above E, dashed P_2 below E, D and S straight, no Q ticks, no letters',
    labels: ['D', 'S', 'P_1', 'P_2'],
  },
  {
    id: 'b-floor-changed',
    type: 'Price floor changed from below to above equilibrium (like DSE2020 P1 Q20)',
    family: 'E',
    stem: 'Refer to the diagram of the market for milk below. The government changes the minimum price of milk from P_1 to P_2. As a result,',
    options: ['the deadweight loss will increase.', 'producer surplus will certainly increase.', 'the quantity of milk traded will stay at Q_1.', 'an excess demand for milk will become an excess supply.'],
    answer: 0,
    explanation:
      'P_1 is below the equilibrium price, so it does not bind and there is no deadweight loss. P_2 is above it: the quantity traded falls to the quantity demanded at P_2, below the efficient quantity, so a deadweight loss appears (A). Producers sell less at a higher price, so producer surplus may rise or fall (B). Before the change the market traded the equilibrium quantity, not Q_1 (C). At P_1 there was no excess demand, since the floor did not bind (D).',
    figure: 'Price and Quantity. D and S. Dotted horizontal lines at P_1 (below the equilibrium) and P_2 (above it). Q_1 where S meets P_1. Key: A.',
    want: 'priceFloor stage raised binds after: P_1 below E, P_2 above E, dashed/dotted lines, Q_1 under S at P_1',
    labels: ['D', 'S', 'P_1', 'P_2', 'Q_1'],
  },
  {
    id: 'b-floor-both-below',
    type: 'Price floor changed, both prices below equilibrium, statements (like DSE2023 P1 Q17)',
    family: 'E',
    stem: 'The diagram shows the market for a good. The government changes its price floor from P_1 to P_2. Which of the following statements is/are correct?',
    options: ['(4) only', '(1) and (4) only', '(2) and (3) only', '(1), (2) and (3) only'],
    answer: 0,
    explanation:
      'Both P_1 and P_2 lie below the equilibrium price, so neither floor binds: the market stays at the equilibrium. The quantity traded does not change (1 is wrong), there is no deadweight loss before or after (2 is wrong), producer surplus does not change (3 is wrong), and total social surplus remains unchanged (4 is right).',
    statements: ['The quantity traded will fall.', 'The deadweight loss will rise.', 'Producer surplus will rise.', 'Total social surplus will remain unchanged.'],
    figure: 'Price and Quantity. D and S cross well above two dashed horizontal lines P_1 and P_2 (P_2 lower). Key: A.',
    want: 'priceFloor stage lowered binds neither: both dashed lines below E, P_1 above P_2, no ticks',
    labels: ['D', 'S', 'P_1', 'P_2'],
  },
  {
    id: 'b-ceiling-supply-rise',
    type: 'Price ceiling and a supply increase, Q1–Q4 (like DSE2026 P1 Q16)',
    family: 'E',
    stem: 'The diagram below shows the market for Good W. The government sets a price ceiling at P_1. A new technology then shifts supply from S_1 to S_2. What is the quantity of Good W traded after the shift?',
    options: ['Q_1', 'Q_2', 'Q_3', 'Q_4'],
    answer: 2,
    explanation:
      'With S_1 the equilibrium price is above P_1, so the ceiling binds. After supply rises to S_2, the new equilibrium price is below P_1, so the ceiling no longer binds and the market trades at the new equilibrium, Q_3 (C). Q_1 is the old equilibrium quantity, Q_2 the quantity demanded at P_1, and Q_4 the quantity supplied on S_2 at P_1.',
    figure: 'Price and Quantity. D_1 downward; S_1 and S_2 upward, S_2 right of S_1 with an arrow. Dashed P_1 between the old and the new equilibrium price. Dashed drops: Q_1 at D_1×S_1, Q_2 at D_1 on P_1, Q_3 at D_1×S_2, Q_4 at S_2 on P_1. Key: C.',
    want: 'priceCeiling stage supplyRise binds before: P_1 between the equilibria, Q_1 < Q_2 < Q_3 < Q_4 in order at those four points, shift arrow',
    labels: ['D_1', 'S_1', 'S_2', 'P_1', 'Q_1', 'Q_2', 'Q_3', 'Q_4'],
  },
  {
    id: 'b-quota-enlarged',
    type: 'Quota enlarged: fall in DWL by corner letters (like DSE2015 P2 Q3, made an MCQ)',
    family: 'E',
    stem: 'The diagram shows the market for taxi licences in City Z, where the number of licences is limited by a quota. The government raises the quota from Q_1 to Q_2. Which of the following is correct?',
    options: ['The deadweight loss falls by area WXYZ.', 'The deadweight loss rises by area WXYZ.', 'The deadweight loss falls to zero.', 'The deadweight loss does not change.'],
    answer: 0,
    explanation:
      'With the quota at Q_1, the units between Q_1 and the equilibrium quantity are not produced although buyers value them (along D) more than they cost (along S). Raising the quota to Q_2 lets the units between Q_1 and Q_2 be produced, so the deadweight loss falls by area WXYZ, between D and S from Q_1 to Q_2 (A). Some loss remains because Q_2 is still below the equilibrium quantity (C is wrong).',
    figure: 'Price and Quantity. D, S_0 (no quota), S_1 kinked upright at Q_1, S_2 kinked upright at Q_2. W on D above Q_1, X on D above Q_2, Y on S at Q_2, Z on S at Q_1. Key: A.',
    want: 'quota stage raised binds both: kinked S_1 at Q_1 and S_2 at Q_2 (both left of E); W, X on D, Y, Z on S at the two quotas',
    labels: ['D', 'Q_1', 'Q_2', 'W', 'X', 'Y', 'Z'],
  },
  {
    id: 'b-quota-demand-rise',
    type: 'Demand rises under a quota: lettered DWL regions (like DSE2024 P2 Q3, made an MCQ)',
    family: 'E',
    stem: 'The diagram shows a market under a production quota. Demand rises from D_0 to D_1 while the quota stays. Which area shows the deadweight loss after the rise?',
    options: ['A', 'B', 'A + B', 'none: the quota keeps the market efficient'],
    answer: 2,
    explanation:
      'Before the rise the deadweight loss is area A, between D_0 and S from the quota to the old equilibrium quantity. After demand rises to D_1 the quota still holds output at the same level, but the efficient quantity rises, so the loss grows by area B, between D_1 and the higher of D_0 and S. The deadweight loss after the rise is A + B (C).',
    figure: 'Price and Quantity. D_0 and D_1 (right of D_0), S_0, kinked S_1 upright at the quota Q_1 left of both equilibria. Region A = the loss with D_0, region B = the extra loss with D_1. Key: C.',
    want: 'quota stage demandRise binds both: A = dwlKept, B = dwlAdded; kinked S_1 at Q_1; shift arrow D_0 → D_1',
    labels: ['D_0', 'D_1', 'A', 'B'],
  },
  {
    id: 'b-ceiling-lowered-dwl',
    type: 'Binding ceiling lowered further: rise in DWL by region letters (like DSE2012 P2 Q5, made an MCQ)',
    family: 'E',
    stem: 'The diagram shows the market for flats under rent control. The government lowers the maximum rent from P_1 to P_2. By how much does the deadweight loss change?',
    options: ['It rises by area B.', 'It rises by area A + B.', 'It falls by area B.', 'It falls by area A.'],
    answer: 0,
    explanation:
      'Both P_1 and P_2 are below the equilibrium rent, so both bind and the quantity traded is read off supply. At P_1 the deadweight loss is area A, between D and S from the quantity at P_1 to the equilibrium quantity. At P_2 even fewer flats are let, so the loss also covers area B, between D and S from the quantity at P_2 to the quantity at P_1: it rises by area B (A). A + B is the new loss, not the change.',
    figure: 'Price and Quantity. D and S; dashed P_1 and lower P_2, both below the equilibrium. Region A = the loss at P_1, region B = the extra loss at P_2. Key: A.',
    want: 'priceCeiling stage lowered binds both: A = dwlKept, B = dwlAdded, dashed lines with drops at the quantities supplied',
    labels: ['D', 'S', 'P_1', 'P_2', 'A', 'B'],
  },
  {
    id: 'b-min-wage-supply-fall',
    type: 'Minimum wage, labour supply falls (like DSE2013 P2 Q10, DSE2018 P2 Q10, made an MCQ)',
    family: 'E',
    stem: 'The diagram shows the labour market of cleaners, with a minimum wage W_m. Many cleaners then leave the city, so labour supply falls from S_1 to S_2. Which of the following is correct?',
    options: ['Unemployment of cleaners disappears.', 'Unemployment of cleaners rises.', 'Employment of cleaners rises.', 'The deadweight loss rises.'],
    answer: 0,
    explanation:
      'With S_1 the equilibrium wage is below W_m, so the minimum wage binds and there is unemployment. After supply falls to S_2 the equilibrium wage is above W_m, so the minimum wage no longer binds: the wage rises to the new equilibrium and unemployment disappears (A). Employment falls from the quantity demanded at W_m to the new equilibrium quantity (C is wrong), and with the minimum wage no longer binding there is no deadweight loss from it (D is wrong).',
    figure: 'Wage rate and Quantity of labour. D; S_1 and S_2 (left of S_1, arrow). Dashed W_m between the old and the new equilibrium wage. Key: A.',
    want: 'priceFloor market labour stage supplyFall binds before: W_m between the equilibria, axes Wage rate / Quantity of labour, shift arrow',
    labels: ['D', 'S_1', 'S_2', 'W_m'],
  },
];

/**
 * k-0596 (u-a587 "code"): area questions no scene draws, so the model must plan them in kind
 * "curves" with bands and an area ask; the editor works the answer out from the market.
 */
const PLAN_CASES: GraphCase[] = [
  {
    id: 'p-tax-floor',
    type: 'Unit tax and a minimum price at once: DWL by lettered areas (plan path)',
    family: 'E',
    stem: 'The government imposes a unit tax on Good Z, so that the supply curve shifts from S_0 to S_1. It also sets a minimum price at P_f, which is above the market price after the tax. Refer to the diagram. Which area represents the deadweight loss?',
    options: ['Area A', 'Area A + B', 'Area A + B + C', 'Area B + C'],
    answer: 1,
    explanation:
      'At the minimum price P_f buyers buy only Q_1. The efficient output is Q_0, where D meets S_0, the supply without the tax (the tax is a transfer, not a cost to society). The deadweight loss is the area between D and S_0 from Q_1 to Q_0: areas A + B. Area C lies between P_f and S_1 to the left of Q_1, which is not a loss of surplus.',
    figure: 'D, S_0 and S_1 (S_0 shifted up by the tax), P_f a line above where D meets S_1. Q_1 where D meets P_f, Q_0 where D meets S_0. Area A between D and S_0 from Q_1 to where D meets S_1; area B between D and S_0 from there to Q_0; area C between P_f and S_1 from the price axis to Q_1. Key B.',
    want: 'curves with bands: D, S0, S1 up, Pf above D×S1; Q1 at D×Pf, Q0 at D×S0; A, B, C lettered regions as described; key from the market (A + B)',
    labels: ['D', 'S_0', 'S_1', 'P_f', 'Q_1', 'Q_0', 'A', 'B', 'C'],
  },
  {
    id: 'p-ceiling-tax',
    type: 'A ceiling at the old equilibrium price, then a unit tax: DWL by corner letters (plan path)',
    family: 'E',
    stem: 'The government sets a maximum price of Good V at P_c, its equilibrium price. It then imposes a unit tax on Good V, so that the supply curve shifts from S_0 to S_1. Refer to the diagram. Which area represents the deadweight loss after the tax?',
    options: ['Area abe', 'Area ace', 'Area bce', 'Area abf'],
    answer: 2,
    explanation:
      'P_c is the price at e, where D meets S_0. After the tax, sellers supply only the quantity at a, where S_1 meets P_c. The efficient quantity is still at e, because the tax is a transfer, not a cost to society. The deadweight loss is the area between D and S_0 from the quantity at a to the quantity at e: area bce, where b is on D directly above a and c is on S_0 directly below a.',
    figure: 'D, S_0 and S_1 (S_0 shifted up by the tax). P_c a line through e, where D meets S_0. a where S_1 meets P_c; b on D above a; c on S_0 below a; f where D meets S_1. Key C (bce).',
    want: 'curves: P_c through D×S0 at e; a = S1×Pc; b on D above a; c on S0 below a; f = D×S1; dashed b–c; key from the market (bce)',
    labels: ['D', 'S_0', 'S_1', 'P_c', 'a', 'b', 'c', 'e', 'f'],
  },
  {
    id: 'p-tax-to-floor',
    type: 'A unit tax replaced by a minimum price: change in DWL by lettered areas (plan path)',
    family: 'E',
    stem: 'A unit tax on Good W shifts its supply curve from S_0 to S_1. The government then abolishes the tax and sets a minimum price at P_f, which is above the price buyers paid under the tax. Refer to the diagram. Which of the following is correct?',
    options: ['The deadweight loss decreases by area A.', 'The deadweight loss increases by area A.', 'The deadweight loss increases by area B.', 'The deadweight loss does not change.'],
    answer: 1,
    explanation:
      'Under the tax, output is Q_2, where D meets S_1, and the deadweight loss is area B, between D and S_0 from Q_2 to Q_3. Under the minimum price P_f with no tax, buyers buy only Q_1, where D meets P_f, so the deadweight loss is areas A + B, between D and S_0 from Q_1 to Q_3. The deadweight loss increases by area A.',
    figure: 'D, S_0 and S_1 (S_0 shifted up by the tax), P_f a line above where D meets S_1. Q_1 where D meets P_f, Q_2 where D meets S_1, Q_3 where D meets S_0. Area A between D and S_0 from Q_1 to Q_2; area B between D and S_0 from Q_2 to Q_3. Key B.',
    want: 'curves with bands: two markets (D, S1, cost S0) then (D, S0, floor Pf); A, B lettered; change in DWL = A',
    labels: ['D', 'S_0', 'S_1', 'P_f', 'Q_3', 'Q_1', 'Q_2', 'A', 'B'],
  },
];

/**
 * Studio reviews (k-0600): a teacher's chat, exported. "Make it to be subsidy" (after HKDSE 2025
 * P1 Q22): statement (2) names area 0abc, 0 the origin; the stored figure printed no letter and
 * passed. A right figure draws S0 from the origin and S1 from a on the quantity axis with every
 * letter; one that cannot must fail, never pass without them.
 */
const REVIEW_CASES: GraphCase[] = [
  {
    id: 'r-subsidy-elastic-0abc',
    type: 'Per-unit subsidy, perfectly elastic demand, area 0abc in a statement (studio review k-0600)',
    family: 'E',
    stem: 'The following diagram shows the supply and demand curves of a good. Suppose the government provides a per-unit subsidy on the production of the good.\nWhich of the following statements about the provision of the per-unit subsidy are correct?',
    statements: ['The consumers enjoy no subsidy benefit.', 'The decrease in total social surplus is area 0abc.', 'There is deadweight loss after the provision of the subsidy.'],
    options: ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'],
    answer: 1,
    explanation:
      'Since demand is perfectly elastic (horizontal), the market price remains unchanged after the subsidy, so consumers enjoy no subsidy benefit and (1) is correct. Overproduction occurs beyond the original equilibrium quantity, creating a deadweight loss represented by the triangle between S0 and D to the right of b, so (3) is correct. Area 0abc represents the increase in producer surplus rather than the decrease in total social surplus, so (2) is incorrect.',
    figure:
      'Price on vertical axis, Quantity on horizontal axis, origin 0. Horizontal demand curve D. Upward-sloping supply curve S0 (before subsidy) starting from origin 0 and meeting D at b. Parallel upward-sloping supply curve S1 (after subsidy) shifted downwards/rightwards, starting from a on the horizontal Quantity axis and meeting D at c.',
    want: 'Horizontal D; S0 from the origin meeting D at b; S1 parallel, from a on the quantity axis, meeting D at c; letters a, b, c printed (0 at the origin). Or a failed figure that names what it cannot draw.',
    labels: ['D', 'S_0', 'S_1', 'a', 'b', 'c'],
  },
];

export const GRAPH_CASES: GraphCase[] = [
  ...LORENZ_GRAPH_CASES,
  {
    // k-0577 round 2 (u-fbsp): the user's HKDSE 2018 P1 Q22 draft, areas named by their corners; the note is as vague as a writer's.
    id: 'e-tax-raise',
    type: 'Unit tax raised from t1 to t2: change in DWL (corner letters)',
    family: 'E',
    stem: 'The following diagram shows the demand and supply curves of Good Y.\nSuppose the government increases the unit tax on Good Y from t1 to t2. Which of the following statements is correct?',
    options: ['The deadweight loss will decrease by area efj.', 'The new deadweight loss is area fgk.', 'The deadweight loss will increase by area fgmj.', 'The new deadweight loss is area egn.'],
    answer: 2,
    explanation:
      'With the tax t1, the deadweight loss is area efj. When the tax increases to t2, the deadweight loss becomes area egm, so the deadweight loss increases by area fgmj. Option A is wrong because a higher unit tax increases, rather than decreases, the deadweight loss. Option B is wrong because area fgk only lies between S2 and S1 instead of between D and S0. Option D is wrong because area egn lies above the demand curve D.',
    figure: 'Axes Price and Quantity. D, S0 (without tax), S1 (with tax t1) and S2 (with tax t2), each higher. Points e, f, g where D meets S0, S1, S2; j, k, m, n where the explanation needs them. Key: fgmj.',
    want: 'taxChange: S0 < S1 < S2 up; e=D×S0, f=D×S1, g=D×S2, j on S0 below f, m on S0 below g, k on S1 below g, n on S2 above e; dashed lines at the three quantities; letters clear of lines; no other letters.',
    labels: ['S_0', 'S_1', 'S_2', 'D', 'e', 'f', 'g', 'j', 'k', 'm', 'n'],
  },
  {
    // k-0577 round 3 (u-kmdo): HKDSE 2023 P1 Q21, a ceiling at P1 made effective by a rise in demand; our words, the paper's figure and key.
    id: 'e-ceiling-demand-rise',
    type: 'Ceiling made effective by a demand rise: DWL (corner letters)',
    family: 'E',
    stem: 'The diagram below shows the market for Good X.\nThe government sets a price ceiling at P_1. Demand for Good X then increases from D_1 to D_2. Which of the following is correct?',
    options: [
      'There is over-production, and the deadweight loss is area abc.',
      'There is over-production, and the deadweight loss is area acf.',
      'There is under-production, and the deadweight loss is area abc.',
      'There is under-production, and the deadweight loss is area acf.',
    ],
    answer: 2,
    explanation:
      'Before the rise, D_1 meets S at point a on the ceiling, so the ceiling does not bind. After demand rises to D_2, the equilibrium would be at c, but the price cannot rise above P_1. Sellers supply only the quantity at a, less than the efficient quantity at c: there is under-production. The units between a and c, which buyers value (up to b on D_2) more than they cost to make (along S), are not produced: the deadweight loss is area abc. Area acf lies under D_2 and above P_1 beyond c, which is not a loss of surplus.',
    figure: 'Axes Price and Quantity. D_1 and S cross at a, on the dashed price line P_1. D_2 (demand after the rise) lies right of D_1 and meets S at c and the P_1 line at f; b is on D_2 directly above a, with a dashed line from b down to a. No quantity ticks. Key: abc.',
    want: 'ceilingDemandRise: P1 dashed through a = D1×S; D2 right of D1; c = D2×S, f = D2 at P1, b on D2 above a; dashed b–a; letters above their dots, clear of lines; no other letters, no Q ticks.',
    labels: ['D_1', 'D_2', 'S', 'P_1', 'a', 'b', 'c', 'f'],
  },
  {
    id: 'e-cs-ps',
    type: 'Consumer and producer surplus',
    family: 'E',
    stem: 'Refer to the following supply-demand diagram of good X. The market is at equilibrium. Which area represents the producer surplus?',
    options: ['A', 'B', 'A + B', 'B + C'],
    answer: 1,
    explanation: 'Producer surplus is the area above the supply curve and below the equilibrium price, up to the equilibrium quantity: area B. A is consumer surplus; C is the cost of production.',
    figure: 'Axes Price and Quantity. D and S cross at the equilibrium, with ticks P_0 and Q_0. Area A between D and P_0 (consumer surplus), area B between P_0 and S (producer surplus), area C under S from 0 to Q_0. Key: B.',
    want: 'D, S, one equilibrium (P0, Q0); A = CS triangle, B = PS triangle, C = area under S to Q0; letters, no words naming the areas.',
    labels: ['A', 'B', 'C', 'P_0', 'Q_0'],
  },
  {
    id: 'e-tax-dwl',
    type: 'Unit tax: incidence and DWL',
    family: 'E',
    stem: 'The government imposes a per-unit tax on good X. The supply curve shifts from S_0 to S_1. Which of the following areas represents the deadweight loss of the tax?',
    options: ['B + C', 'E + F', 'B + E', 'C + F'],
    answer: 1,
    explanation: 'Output falls from Q_0 to Q_1. The units between Q_1 and Q_0 are no longer traded although their marginal benefit exceeds their marginal cost: the deadweight loss is E + F. B + C is the tax revenue.',
    figure: 'Axes Price and Quantity. D, S_0, and S_1 above S_0 (the tax). Equilibrium before at P_0, Q_0; after at P_1 (price buyers pay), Q_1; P_2 the price sellers receive on S_0 at Q_1. Areas: A consumer surplus after the tax, B between P_1 and P_0 up to Q_1, C between P_0 and P_2 up to Q_1, D producer surplus after the tax, E the triangle between D and P_0 from Q_1 to Q_0, F the triangle between P_0 and S_0 from Q_1 to Q_0. Key: E + F.',
    want: 'S shifted UP by the tax; P1 > P0 > P2; Q1 < Q0; six regions A–F placed as the note says; E + F the DWL triangle.',
    labels: ['S_0', 'S_1', 'P_0', 'P_1', 'P_2', 'Q_0', 'Q_1', 'A', 'B', 'C', 'D', 'E', 'F'],
  },
  {
    id: 'e-tax-burden',
    type: 'Unit tax: buyers’ and sellers’ burden',
    family: 'E',
    stem: 'A per-unit tax is imposed on good Y, whose demand is price inelastic. Refer to the diagram. Which area represents the tax burden borne by consumers?',
    options: ['Area a', 'Area b', 'Area a + b', 'Area c'],
    answer: 0,
    explanation: 'Consumers pay P_1 instead of P_0 on each of the Q_1 units bought: area a. Area b is the sellers’ burden; a + b is the tax revenue. With inelastic demand, a > b.',
    figure: 'Axes Price and Quantity. A steep (inelastic) D, S_0 and S_1 shifted up by the tax. Ticks P_1 (buyers pay), P_0, P_2 (sellers receive), Q_1, Q_0. Area a between P_1 and P_0 up to Q_1, area b between P_0 and P_2 up to Q_1, area c the triangle between D and S_0 from Q_1 to Q_0. Key: area a.',
    want: 'Steep D; S up; a (buyers) visibly larger than b (sellers); c the DWL triangle.',
    labels: ['S_0', 'S_1', 'P_0', 'P_1', 'P_2', 'Q_0', 'Q_1', 'a', 'b', 'c'],
  },
  {
    id: 'e-subsidy-dwl',
    type: 'Unit subsidy: benefits and DWL',
    family: 'E',
    stem: 'The government grants a per-unit subsidy to producers of good Z. The supply curve shifts from S_0 to S_1. Which area represents the deadweight loss of the subsidy?',
    options: ['A', 'B', 'C', 'A + B'],
    answer: 2,
    explanation: 'Output rises from Q_0 to Q_1. For the extra units the marginal cost (on S_0) exceeds the marginal benefit (on D): the deadweight loss is the triangle C. A is the consumer benefit and B the producer benefit.',
    figure: 'Axes Price and Quantity. D, S_0, and S_1 below S_0 (the subsidy). Equilibrium before P_0, Q_0; after P_1 (price buyers pay), Q_1; P_2 the price sellers receive, on S_0 at Q_1. Area A between P_0 and P_1 up to Q_1 (consumer benefit), area B between P_2 and P_0 up to Q_1 (producer benefit), area C the triangle between S_0 and D from Q_0 to Q_1. Key: C.',
    want: 'S shifted DOWN; P1 < P0 < P2; Q1 > Q0; C the triangle between S0 and D beyond Q0.',
    labels: ['S_0', 'S_1', 'P_0', 'P_1', 'P_2', 'Q_0', 'Q_1', 'A', 'B', 'C'],
  },
  {
    id: 'e-ceiling-dwl',
    type: 'Price ceiling: DWL',
    family: 'E',
    stem: 'The government sets a price ceiling at P_c in the market for good X. Refer to the diagram. Which area represents the deadweight loss?',
    options: ['A', 'B', 'C', 'B + C'],
    answer: 3,
    explanation: 'At P_c only Q_s is supplied. The units between Q_s and Q_0 are no longer traded though their marginal benefit exceeds their marginal cost: the deadweight loss is B + C.',
    figure: 'Axes Price and Quantity. D and S cross at P_0, Q_0. A price ceiling P_c below P_0 drawn as a line; Q_s on S at P_c and Q_d on D at P_c. Area A between P_0 and P_c up to Q_s, area B the triangle between D and P_0 from Q_s to Q_0, area C the triangle between P_0 and S from Q_s to Q_0. Key: B + C.',
    want: 'Ceiling BELOW P0; Qs < Q0 < Qd; B + C together = the DWL triangle between D and S from Qs to Q0.',
    labels: ['P_c', 'P_0', 'Q_0', 'Q_s', 'A', 'B', 'C'],
  },
  {
    id: 'e-ceiling-shortage',
    type: 'Price ceiling: shortage (Q ticks)',
    family: 'E',
    stem: 'The government sets a maximum price of P_1 for good X. Refer to the diagram. What is the shortage?',
    options: ['Q_1Q_2', 'Q_1Q_3', 'Q_2Q_3', 'Q_3Q_4'],
    answer: 1,
    explanation: 'At P_1, below the equilibrium price, quantity supplied is Q_1 and quantity demanded is Q_3: the shortage is Q_1Q_3.',
    figure: 'Axes Price and Quantity. D and S cross at the equilibrium with quantity Q_2. P_1 is a price below equilibrium (guide style). Q_1 is the quantity supplied at P_1 (on S), Q_2 the equilibrium quantity, Q_3 the quantity demanded at P_1 (on D). Q_4 a larger quantity on D at a lower price is not needed; omit it. Key: Q_1Q_3.',
    want: 'P1 below equilibrium; Q1 on S, Q2 at E, Q3 on D, in order from the origin.',
    labels: ['P_1', 'Q_1', 'Q_2', 'Q_3'],
  },
  {
    id: 'e-min-wage',
    type: 'Minimum wage: unemployment',
    family: 'E',
    stem: 'A minimum wage is set at W_1 in the labour market for cleaners. Refer to the diagram. How many cleaners are employed after the minimum wage is set?',
    options: ['Q_1', 'Q_2', 'Q_3', 'Q_3 − Q_1'],
    answer: 0,
    explanation: 'At W_1, above the equilibrium wage, firms hire only Q_1 workers (read off the demand for labour); Q_3 − Q_1 workers are unemployed.',
    figure: 'Axes Wage rate and Quantity of labour. D (demand for labour) and S (supply of labour) cross at Q_2. W_1 is above the equilibrium wage (guide). Q_1 is the quantity demanded at W_1 (on D), Q_2 equilibrium, Q_3 the quantity supplied at W_1 (on S). Key: Q_1.',
    want: 'Labour axes; W1 ABOVE equilibrium; Q1 on D, Q2 at E, Q3 on S.',
    labels: ['W_1', 'Q_1', 'Q_2', 'Q_3'],
  },
  {
    id: 'e-floor-dwl',
    type: 'Price floor: DWL',
    family: 'E',
    stem: 'The government sets a minimum price at P_f for wheat. Refer to the diagram. Which area represents the deadweight loss?',
    options: ['A', 'B', 'A + B', 'C'],
    answer: 1,
    explanation: 'At P_f buyers purchase only Q_d. Output between Q_d and Q_0 is no longer traded: the deadweight loss is the triangle B between D and S.',
    figure: 'Axes Price and Quantity. D and S cross at P_0, Q_0. A price floor P_f above P_0 drawn as a line; Q_d on D at P_f, Q_s on S at P_f. Area A between P_f and P_0 up to Q_d, area B the triangle between D and S from Q_d to Q_0, area C between Q_d and Q_s under P_f above S... omit C if it cannot be drawn. Key: B.',
    want: 'Floor ABOVE P0; Qd < Q0 < Qs; B = triangle between D and S from Qd to Q0.',
    labels: ['P_f', 'P_0', 'Q_0', 'Q_d', 'A', 'B'],
  },
  {
    id: 'e-quota',
    type: 'Quota: price, output, DWL',
    family: 'E',
    stem: 'The government limits the output of good X to Q_1 by a quota. Refer to the diagram. Which area represents the deadweight loss of the quota?',
    options: ['A', 'B', 'C', 'A + B'],
    answer: 2,
    explanation: 'The quota cuts output from Q_0 to Q_1 and raises the price from P_0 to P_1. The units between Q_1 and Q_0 have a marginal benefit above their marginal cost: the deadweight loss is C.',
    figure: 'Axes Price and Quantity. D and S cross at P_0, Q_0. A quota at Q_1 left of Q_0: the supply curve follows S up to Q_1 and is vertical there. P_1 on D at Q_1. Area A between P_1 and P_0 up to Q_1, area B between P_0 and S up to Q_1, area C the triangle between D and S from Q_1 to Q_0. Key: C.',
    want: 'Quota line LEFT of Q0 (supply vertical at Q1); P1 on D at Q1 above P0; C = triangle D–S from Q1 to Q0.',
    labels: ['Q_0', 'Q_1', 'P_0', 'P_1', 'A', 'B', 'C'],
  },
  {
    id: 'e-ext-negative',
    type: 'Negative production externality',
    family: 'E',
    stem: 'The production of good X creates external costs. Refer to the diagram, where MPC is the marginal private cost, MSC the marginal social cost and D the demand (MPB = MSB). Which area represents the deadweight loss of the free market?',
    options: ['A', 'B', 'A + B', 'C'],
    answer: 1,
    explanation: 'The free market produces Q_m where MPC = MPB, more than the socially efficient Q* where MSC = MSB. For the units between Q* and Q_m, MSC exceeds MSB: the deadweight loss is area B.',
    figure: 'Axes Price / cost and Quantity. D = MPB = MSB, MPC (the supply), MSC above MPC. Market equilibrium where D meets MPC (Q_m), efficient where D meets MSC (Q*). Area B the triangle between MSC and D from Q* to Q_m; area A between MSC and MPC up to Q*. Key: B.',
    want: 'MSC ABOVE MPC; Q* < Qm; B the triangle between MSC and D from Q* to Qm.',
    labels: ['MPC', 'MSC', 'Q_m', 'Q*', 'A', 'B'],
  },
  {
    id: 'e-ext-positive',
    type: 'Positive consumption externality',
    family: 'E',
    stem: 'Flu vaccination generates external benefits. Refer to the diagram, where MPB is the marginal private benefit, MSB the marginal social benefit and S the supply (MPC = MSC). Which quantity is the socially efficient output?',
    options: ['Q_1', 'Q_2', 'Q_1Q_2', 'zero'],
    answer: 1,
    explanation: 'The market produces Q_1 where MPB = MPC. The efficient output is Q_2, where MSB = MSC: the market under-produces by Q_1Q_2.',
    figure: 'Axes Price / benefit and Quantity. S = MPC = MSC, MPB (the demand), MSB above MPB. Market output Q_1 where MPB meets S; efficient output Q_2 where MSB meets S; optionally shade the deadweight loss between MSB and S from Q_1 to Q_2. Key: Q_2.',
    want: 'MSB ABOVE MPB; Q1 (market) < Q2 (efficient).',
    labels: ['MPB', 'MSB', 'Q_1', 'Q_2'],
  },
  {
    id: 'e-mc-rise',
    type: 'MC rises: total social surplus loss',
    family: 'E',
    stem: 'The cost of producing good X rises, and the supply curve shifts from S_0 to S_1. Which area represents the decrease in total social surplus?',
    options: ['A', 'B', 'A + B', 'C'],
    answer: 2,
    explanation: 'Total social surplus is the area between D and S up to the quantity traded. It falls from the area under D above S_0 to Q_0, to the area under D above S_1 to Q_1: the decrease is A + B.',
    figure: 'Axes Price and Quantity. D, S_0 and S_1 above it (higher cost). Equilibria at Q_0 and Q_1. Area A between S_1 and S_0 up to Q_1, area B the triangle between D and S_0 from Q_1 to Q_0, area C between D and S_1 up to Q_1 (the remaining surplus). Key: A + B.',
    want: 'S shifts UP; A = band between S1 and S0 to Q1; B = triangle D–S0 Q1..Q0; C = surplus left.',
    labels: ['S_0', 'S_1', 'Q_0', 'Q_1', 'A', 'B', 'C'],
  },
  {
    id: 'sd-demand-increase',
    type: 'Demand shift',
    family: 'SD',
    stem: 'The price of a substitute for good X rises. Refer to the diagram. What will the new equilibrium quantity of good X be?',
    options: ['Q_1', 'Q_2', 'Q_3', 'unchanged at Q_2'],
    answer: 2,
    explanation: 'Good X becomes relatively cheaper: the demand for X increases and the demand curve shifts right from D_1 to D_2. The equilibrium quantity rises from Q_2 to Q_3.',
    figure: 'Axes Price and Quantity. S, D_1 and D_2 right of D_1. Q_2 the equilibrium of D_1 and S, Q_3 the equilibrium of D_2 and S, Q_1 the quantity on S at a lower price (or where D_2 would meet a lower price): Q_1 < Q_2 < Q_3. Key: Q_3.',
    want: 'D shifts RIGHT; Q3 at the new equilibrium, right of Q2.',
    labels: ['D_1', 'D_2', 'Q_2', 'Q_3'],
  },
  {
    id: 'sd-vertical-supply',
    type: 'Vertical supply, demand rises',
    family: 'SD',
    stem: 'The supply of residential land in a district is fixed. The demand for land there increases. Refer to the diagram. What is the new equilibrium rent?',
    options: ['P_0', 'P_1', 'P_2', 'unchanged'],
    answer: 1,
    explanation: 'With a fixed (perfectly inelastic) supply, an increase in demand from D_0 to D_1 raises the rent from P_0 to P_1 and leaves the quantity unchanged at Q_0.',
    figure: 'Axes Rent and Quantity of land. A vertical S at Q_0; D_0 and D_1 right of it. P_0 where D_0 meets S, P_1 where D_1 meets S. P_2 is not needed. Key: P_1.',
    want: 'Vertical S; D shifts RIGHT; P1 above P0 on S; one Q0.',
    labels: ['S', 'D_0', 'D_1', 'P_0', 'P_1', 'Q_0'],
  },
  {
    id: 'sd-revenue-elastic',
    type: 'Elastic demand: revenue change',
    family: 'SD',
    stem: 'The demand for good X is price elastic. Supply increases from S_0 to S_1 and the price falls from P_0 to P_1. Refer to the diagram. Which of the following is correct?',
    options: ['Area A > area B, so total revenue rises', 'Area A < area B, so total revenue rises', 'Area A > area B, so total revenue falls', 'Area A = area B, so total revenue is unchanged'],
    answer: 1,
    explanation: 'Total revenue loses area A (the lower price on the units sold before) and gains area B (the extra units sold). With elastic demand the gain is larger: A < B, total revenue rises.',
    figure: 'Axes Price and Quantity. A flat (elastic) D; S_0 and S_1 to its right. Equilibria (P_0, Q_0) and (P_1, Q_1). Area A the loss in revenue (between P_0 and P_1 from 0 to Q_0), area B the gain (under P_1 from Q_0 to Q_1). Key: A < B.',
    want: 'Flat D; S shifts RIGHT; A = revenue loss rectangle, B = gain rectangle, B visibly larger.',
    labels: ['S_0', 'S_1', 'P_0', 'P_1', 'Q_0', 'Q_1', 'A', 'B'],
  },
  {
    id: 'o-tariff',
    type: 'Tariff: welfare areas',
    family: 'other',
    stem: 'A small open economy imports good X at the world price P_w. The government imposes a tariff, raising the domestic price to P_t. Refer to the diagram. Which areas represent the deadweight loss of the tariff?',
    options: ['a', 'c', 'b + d', 'a + b + c + d'],
    answer: 2,
    explanation: 'b is the extra cost of producing at home units that could be imported more cheaply, and d the consumer surplus lost on units no longer bought: the deadweight loss is b + d. c is the tariff revenue and a the gain in producer surplus.',
    figure: 'Axes Price and Quantity. Domestic D and S; world price P_w below the domestic equilibrium; P_t = P_w + tariff, still below it. Areas: a between P_t and P_w left of S, b the triangle between S and P_w from Q_1 to Q_2, c the tariff revenue between P_w and P_t from Q_2 to Q_3, d the triangle between D and P_w from Q_3 to Q_4. Key: b + d.',
    want: 'Pw and Pt below domestic equilibrium; four quantities; a, b, c, d placed right.',
    labels: ['P_w', 'P_t', 'a', 'b', 'c', 'd'],
  },
  {
    id: 'o-ad-as',
    type: 'AD shift (AD-AS)',
    family: 'other',
    stem: 'The government increases its expenditure. Refer to the diagram. What happens to the price level and real output in the short run?',
    options: ['P_1 and Y_1', 'P_1 and Y_0', 'P_0 and Y_1', 'P_0 and Y_0'],
    answer: 0,
    explanation: 'Higher government expenditure increases aggregate demand: AD shifts right from AD_0 to AD_1 along SRAS. The price level rises to P_1 and real output to Y_1.',
    figure: 'Axes Price level and Real output. SRAS, AD_0 and AD_1 right of AD_0. Equilibria (P_0, Y_0) and (P_1, Y_1). Key: P_1 and Y_1.',
    want: 'AD shifts RIGHT along SRAS; P1 > P0, Y1 > Y0.',
    labels: ['AD_0', 'AD_1', 'P_0', 'P_1', 'Y_0', 'Y_1'],
  },
  {
    id: 'o-ppc',
    type: 'PPC: points',
    family: 'other',
    stem: 'Refer to the production possibility curve of an economy. Which point shows that the economy has unemployed resources?',
    options: ['A', 'B', 'C', 'none of them'],
    answer: 0,
    explanation: 'A point inside the PPC (A) means resources are unemployed or used inefficiently; B on the curve is efficient; C outside is unattainable.',
    figure: 'Axes Good X and Good Y. A concave PPC with point A inside, B on the curve, C outside. Key: A.',
    want: 'Concave PPC; A inside, B on, C outside.',
    labels: ['A', 'B', 'C'],
  },
  ...AUDIT_CASES,
  ...STAGE_CASES,
  ...MONOPOLY_CASES,
  ...TRADE_CASES,
  ...PLAN_CASES,
  ...REVIEW_CASES,
];
