import type { ChatTurn, CompletionRequest, ProviderPreset } from '@/ai/types';
import { SHADE_PRESETS } from '@/model/diagramPresets';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import { describeDiagram } from './describe';
import { SCENES } from './sceneCatalogue';
import { DIAGRAM_EDIT_SCHEMA, DIAGRAM_SHAPE_HINT, DIAGRAM_SPEC_SCHEMA, EDIT_SHAPE_HINT } from './schema';
import type { DiagramGenInput, DiagramIssue, DiagramSpec } from './types';

/**
 * The request for one question's diagram. The economics rules are the ones the
 * dse-econ-graph skill teaches (its "Economics that is easy to get wrong"); the vocabulary
 * is the editor's own, so whatever comes back is editable in the diagram editor.
 */

/**
 * Templates a scene draws better (k-0577): fixed labels, no letters the question can choose. They
 * stay in the editor's Insert menu for teachers; the model is offered the scene instead.
 */
export const SCENE_TEMPLATES: ReadonlySet<string> = new Set([
  'surplus',
  'mc-rise-tss',
  'price-ceiling',
  'price-control-dwl',
  'ceiling-cs-change',
  'minimum-wage',
  'price-floor-dwl',
  'domestic-quota',
  'per-unit-tax',
  'per-unit-subsidy',
  'subsidy-efficiency',
  'tax-efficiency',
  'tax-net-revenue',
  'externality-overproduction',
  'tariff',
  'tariff-welfare',
  // k-0584: kind "lorenz" draws the question's own boxes and labels.
  'lorenz',
  // k-0586 (audit k-0583 A1): kind "curves" draws the money market with the question's own labels;
  // these add an M_s line and r₀, r₁ a money-demand question does not have.
  'money-market',
  'money-supply-shift',
  'money-demand-shift',
  'money-rate-change',
  // k-0587 (audit k-0583 task B): two-state control scenes (stage, binds) draw these with the question's own labels and letters.
  'shortage-change',
  'ceiling-lowered',
  'ceiling-demand-falls',
  'quota-enlarged',
  'quota-demand-increase',
  // k-0589 (audit k-0583 task C): scene monopoly draws these with the question's own labels, MR derived from D.
  'monopoly',
  'monopoly-rising-mc',
  'monopoly-u-mc',
  'monopoly-mc-zero',
  'monopoly-cost-fall',
  'monopoly-mc-rises',
  'monopoly-same-output',
  'monopoly-lump-sum',
  // k-0589: scene ppfTrade draws these with the question's own numbers, the CPF and points worked out.
  'ppf-linear-trade',
  'ppf-two-countries',
  'ppf-concave-trade',
  'ppf-shift',
  'ppf-growth-trade',
  // k-0589: scene importQuota draws these with the question's own labels, the kink at the world price worked out.
  'import-quota',
  'import-quota-demand',
  'import-quota-increase',
]);

/** Scenes kept for specs saved before, never offered: a newer form draws them (k-0587: ceilingDemandRise = priceCeiling, stage demandRise, binds after). */
const RETIRED_SCENES: ReadonlySet<string> = new Set(['ceilingDemandRise']);

/** Every template but the blank, the panel-only figures and those a scene replaces, as "id: name". Derived, so it never drifts. */
export function templateMenu(): string {
  // Data figures (pie, flow, forum, stakeholders, charts) hold the paper's own content: not a template to reuse.
  return DIAGRAM_TEMPLATES.filter((t) => t.id !== 'blank' && t.group !== 'data' && !SCENE_TEMPLATES.has(t.id))
    .map((t) => `- ${t.id}: ${plain(t.name.en)}. ${plain(t.hint.en)}`)
    .join('\n');
}

/**
 * The scene catalogue as the model reads it (k-0577): each type, when to use it, its parts with
 * their default labels, its regions, the areas made of them and the ticks it can be asked for.
 * Derived from `sceneCatalogue.ts`, so it never drifts.
 */
export function sceneMenu(): string {
  return SCENES.filter((def) => !RETIRED_SCENES.has(def.type)).map((def) => {
    const parts = def.parts.map((p) => `${p.id}${p.label ? ` ${p.label}` : ''}${p.labour ? `/${p.labour}` : ''}: ${p.what}`).join('; ');
    const regions = def.regions.map((r) => `${r.id} (${r.what})`).join('; ');
    const areas = Object.entries(def.measures)
      .filter(([id, rs]) => rs && !(rs.length === 1 && rs[0] === id))
      .map(([id, rs]) => `${id} = ${rs!.join(' + ')}`)
      .join('; ');
    const ticks = Object.entries(def.ticks).map(([id, ps]) => `${id} = ${ps!.join('..')}`).join('; ');
    const curves = new Set(def.parts.filter((p) => p.kind === 'curve').map((p) => p.id));
    const points = def.points.map((p) => `${p.id} (${p.on} ${curves.has(p.at) || p.at === 'other' ? '×' : 'at'} ${p.at})`).join(', ');
    const two = def.type === 'priceCeiling' || def.type === 'priceFloor' || def.type === 'quota' ? ' Two states: stage (below).' : def.type === 'monopoly' ? ' MC shapes, changes and their parts: MONOPOLY (below).' : def.type === 'ppfTrade' ? ' Its numbers and parts: TRADE (below).' : def.type === 'importQuota' ? ' Its forms and changes: IMPORT QUOTA (below).' : '';
    return [`- ${def.type}: ${def.when}.${two}`, `  parts: ${parts}.`, `  regions: ${regions}.`, areas ? `  areas: ${areas}.` : '', `  ticks: ${ticks}.`, `  points: ${points}.`].filter(Boolean).join('\n');
  }).join('\n');
}

export function shadeMenu(): string {
  const presets = SHADE_PRESETS.map((p) => `${p.id} (${p.name})`);
  return [...presets, 'revenueGain (gain in total revenue between the first two equilibria)', 'revenueLoss (loss in total revenue between them)'].join(', ');
}

export const DIAGRAM_SYSTEM_PROMPT = `You draw diagrams for HKDSE Economics questions, in the black-and-white HKEAA style.
You are given one question and its answer key. Decide whether it needs a diagram, and if so describe it as JSON in the shape below. Never draw pixels or coordinates: name the parts and the editor draws them.

DECIDE
- kind "none": the question needs no figure (a pure definition, a calculation with no graph). Say why in "reason".
- placement "question": the figure is printed with the question and the students read it (an MCQ's diagram, a data stimulus). Draw only what the question gives. Never draw what the student is asked to work out.
- placement "answer": the question asks the student to draw ("with the aid of a diagram", "illustrate"). Draw the model answer the marking scheme rewards: every point it says to indicate, labelled as it names them.
- kind "scene": a typed market diagram the editor draws exactly (below): consumer and producer surplus, a per-unit tax, a per-unit subsidy, a per-unit tax or subsidy raised, a price ceiling, a price floor or minimum wage, a quota (one state, or two states: the control lowered or raised, or demand or supply shifting under it), an externality, a cost rise and total social surplus, a tariff, a monopoly firm (D, MR, MC; a change in MC or a lump-sum tax), PPF / CPF trade (one or two countries' PPFs with numbers, the world price, CPF, production and consumption points, export and import brackets, growth), an import quota (the kinked supply at the world price, the "Import quota" brace, the quota rent; the quota raised or cut, demand changing under it). ALWAYS use a scene when one draws the figure, and for every question about areas (surplus, deadweight loss, tax revenue, burdens, benefits) a scene covers. An area question no scene draws (two policies at once, such as a tax and a price floor; a change no stage covers) is kind "curves" with bands and an area ask (below). A control figure no scene draws (a vertical supply with a fixed price, three or more control prices, a quota with a supply shift) is kind "curves" with levels.
- kind "curves": axes and straight lines you compose (below). Use it for demand and supply shifts, a movement along a curve, elasticity and revenue, fixed supply, AD-AS, the money market, the PPC and plain graphs such as tax schedules: anything no scene draws (recipes below).
- kind "chart": a bar, line or pie chart of figures from the question (a table as a graph, shares of a whole). chart: {type bar | line | pie, categories, series, yTitle, xTitle}; a pie has one series, its values the shares and the categories the slices' names.
- kind "flow": boxes joined by arrows (below): a value-added chain of firms with $ on the arrows (GDP, value added), the circular flow of income, the production stages (primary, secondary, tertiary). Never template "flow".
- kind "lorenz": Lorenz curves (below). ALWAYS for a Lorenz curve or income distribution figure.
- kind "template": one of the editor's ready-made diagrams, by id, when neither a scene nor kind "curves" can draw it. Never a data template (flow, pie, charts): those draw another question's content. Its labels are fixed: use it only when the question names no label the template lacks. Set title/xAxis/yAxis only to rename them, else leave them "".

KIND "scene"
- scene: {type, market, externality, demand, supply, size, labels, areas, points, ask, gap, stage, binds, mc, given, trade}. The editor draws the curves, the shift, the price line or quota, the ticks and the regions from the type: you only choose.
- market: goods | labour (wage rate and labour: a minimum wage). externality (type externality only): negativeProduction (MSC above MPC) | positiveProduction (MSC below MPC) | negativeConsumption (MSB below MPB) | positiveConsumption (MSB above MPB); else "none".
- demand, supply: normal | steep (inelastic) | flat (elastic), as the question says. size: small | normal | large (the tax, subsidy, external effect or control).
- labels: [{part, label}]: the label the question and its key use for each part, exactly ({"part":"Pb","label":"P_1"}): a short symbol (S_2), never words in brackets ("S_2 (with tax t_2)": the stem says what a curve is). A part not listed keeps its default below; "" prints no tick. Every label the stem, the options or the key name must be on a part.
- areas: [{region, label}]: the regions that carry a letter, label {"en":"A","zh":"A"} (or "a"). An MCQ about areas letters EVERY region its options name, one letter per region, never two letters on one area and never words that say what an area is (no "DWL" on the figure the student reads). A model answer may give an area from "areas" (it covers its regions) with label {"en":"","zh":""}: the editor prints its standard words.
- points: [{point, label}]: lettered corners, when the question names areas by their corners ("area efj", "fgmj") or names a point ("point e"). Put each letter the stem, the options AND the explanation use on the scene point where the explanation's geometry puts it ("D×S1" = where D meets S1; "S0 at Qt1" = on S0 directly below or above that crossing), one letter per point, and no letter the question does not use. Then areas is [] (no region letters) and the keyed option's corners must be exactly the corners of what "ask" names. Example (tax raised from t1 to t2, key "the deadweight loss increases by area fgmj", explanation "with t1 it is efj; with t2 egm"): taxChange, ask dwlChange, points e0 e, e1 f, e2 g, s0AtQt1 j, s0AtQt2 m.
- ask: what the question asks, one of the scene's areas, regions or ticks (below), or "none". The editor works the answer out from your letters and labels: it must be the keyed option.
- gap: true draws the shortage or surplus bracket at a price control (a model answer only); with two states, one bracket per state the control binds in.
- stage, binds: "none", "both" except for the two-state control figures, the monopoly and the import quota below. mc: "flat" except for a monopoly. given: [] except for a figure the student completes (below). trade: tot 0 and countries [] except for type ppfTrade.
- A question about areas is answered by the letters: work out which regions make up what it asks (e.g. a tax's deadweight loss = dwlBuyers + dwlSellers), letter them as the keyed option says, and letter the other regions the options name.

SCENES
${'${SCENES}'}

TWO STATES (priceCeiling, priceFloor, quota)
- stage: what changes while the control is in force. lowered | raised: the control itself moves (a ceiling or floor price lowered or raised; a quota cut = lowered, enlarged = raised): two control lines, Pc1 before and Pc2 after. demandRise | demandFall | supplyRise | supplyFall: the control stays and D shifts to D2 (or S to S2). "none" = the one-state scene above.
- binds: the states the control is effective in: both | before | after | neither. A ceiling binds below the equilibrium price, a floor above it, a quota left of the equilibrium quantity. "lowers the price ceiling from P1 (above equilibrium) to P2 (below)" = lowered, after; a floor changed from P1 to P2 with both below equilibrium = neither; a ceiling at the old equilibrium price, binding once demand rises (HKDSE 2023 Q21) = demandRise, after; a ceiling between the old and the new equilibrium price as supply rises (2026 Q16) = supplyRise, before. The editor places each line from it; a quota changed binds both.
- parts: D, S; D2 or S2 for a shift (D is then the demand before: label it D_1 or D_0 as the question does); quota: S (no quota), S1 and for a quota change S2 (the kinked supplies). Pc1, Pc2: the control lines (labour: wages). P0, Q0: the equilibrium before (none when Pc1 sits on it); Pn, Qn: the equilibrium after a shift. Qd1, Qs1: demanded and supplied at Pc1 before; Qd2, Qs2: at the control after (Pc2, or Pc1 after the shift; the curve that did not shift keeps its 1). Quota: Qq1, Qq2 (the quotas), Pq1, Pq2 (the prices with them, on demand).
- regions: dwlKept (the loss in both states), dwlAdded (only after), dwlRemoved (only before), those the change has. areas: dwlBefore, dwlAfter, dwlChange (= dwl after). ticks: quantityBefore, quantityAfter, priceBefore, priceAfter, shortageBefore, shortage (after), surplusBefore, surplus (after), quantityDemanded, quantitySupplied (after).
- points: e0 (D × S), en (the equilibrium after); <curve>At<part>: d, s, d2, s2 with a control line or a quantity tick (dAtPc1 = where D meets Pc1, d2AtQ0 = on D2 above Q0, sAtQq2 = on S at the second quota).
- A question of statements about the change ("the producer surplus will decrease") has ask "none": the editor works out each statement from both states, and the keyed one must hold for any slopes.
- Label the parts as the stem names them: "from P1 to P2" puts P_1 on Pc1 and P_2 on Pc2; "from S1 to S2" S_1 on S and S_2 on S2.

MONOPOLY (type monopoly)
- The editor draws D, MR from D (same intercept, twice as steep: never draw MR yourself), MC, Qm where MR = MC with Pm read up to D, the efficient output Qc where D (= MB) meets MC, and the deadweight loss between them.
- mc: flat (constant MC = AC, a horizontal line) | rising | zero (MC = 0: Qm where MR reaches the axis, Qc at D's own intercept; label MC "MC = 0") | uShaped, as the question's figure gives it. demand: the slope of D; supply: the slope of a rising MC.
- stage: none | mcRise (MC rises, e.g. dearer fuel or a per-unit tax: MC to MC2, a smaller output Qm2, a higher price Pm2) | mcFall (cheaper inputs: a larger output, a lower price) | mcFallKept (MC falls but the firm keeps its price and output: HKDSE 2016) | mcRiseToPrice (MC rises to the old monopoly price, so the new efficient output is the old monopoly output: HKDSE 2025) | lumpSumTax (a lump-sum tax or a fixed cost: no curve moves; label the ticks "Q_1 = Q_2", "P_1 = P_2" as the question names them). binds "both".
- parts: D (label "D = MB" or "D = AR" when the question does), MR, MC; MC2 with a change in MC (MC is then the MC before: label it MC_1 or MC_0 as the question does). Pm, Qm: the monopoly price and output (before); Pc, Qc: where D meets MC (the efficient or competitive price and output, Q_E, Q_c, Q*); Pm2, Qm2, Pc2, Qc2: the same after. mcRiseToPrice has no Pc2, Qc2 (they are Pm, Qm); mcFallKept no Pm2, Qm2.
- regions, one state: cs, ps (the monopoly's surplus), dwl. With MC2: dwlKept (the loss in both states), dwlAdded (only after), dwlRemoved (only before), those the stage has. areas: dwlBefore, dwlAfter (= dwl), dwlChange. A model answer that shades the original and the new deadweight loss gives areas dwlBefore and dwlAfter in words (labels "" print the standard words, or "DWL_1", "DWL_2"): they may overlap; letters never do.
- ticks: priceBefore, quantityBefore, priceAfter, quantityAfter, efficientQuantity (after), misallocation (the monopoly to the efficient output). A statement question ("the output will increase", "the deadweight loss will decrease") has ask "none": the editor works out each statement from both states, and the keyed one must hold for any slopes.

TRADE (type ppfTrade, Elective 2)
- trade: {tot, totLine, grow, xGood, yGood, countries}. Give only the question's numbers; the editor works out the rest: which good each country specialises in (straight PPF: completely, in the good whose opportunity cost is below the world price; concave: to where the PPF's slope equals the world price), the CPF through that point at the world price, the consumption point, exports, imports, the gain, and prints the numbers on the axes.
- tot: the world price (terms of trade) as Y per 1 X: "1X = 2Y" is 2, "1Y = 0.5X" is 2. totLine: true draws a dotted world price line apart from the CPF (the question's AB, TT', "the dotted line"). grow: the first country's PPF after growth, both intercepts times this ("labour doubles" = 2; a technology advance in both goods, e.g. 1.3); 0 = none. xGood, yGood: the goods' names on the axes ({"en":"Clothing","zh":"衣服"}); "" = Good X / Good Y (X across, Y up).
- countries: one or two, {name, shape, x, y, noTradeX, noTradeCost, trade, consume, amount, brackets, gain}. name: "A", "B" (subscripts PPF_A, CPF_A, P_A), "" for one country. shape: linear (constant opportunity cost) | concave. x, y: the PPF's intercepts ("20X or 30Y": x 20, y 30). The no-trade point: noTradeX (its X; on a straight PPF its Y follows), or on a concave PPF noTradeCost (the opportunity cost of X there, "E0 (1X = 1.5Y)": 1.5); 0 = none. trade: false = only the PPF (a country the question does not trade). consume: none | sameX (the same X as before trade) | equal (equal amounts of X and Y) | x (amount = the X it consumes, "always consumes 10X") | tradedX (amount = the X it exports or imports, "4X are traded"). brackets: the export and import brackets. gain: an arrow from the consumption point down to the PPF (the gain from trade at the same X).
- parts (labels as the question names them): PPF, CPF, E (no-trade point), P (production with trade), C (consumption with trade), X (exports bracket), M (imports bracket), G (the gain arrow), TOT; the second country's end in 2 (PPF2, CPF2, E2, P2, C2, X2, M2); after growth PPFnew, CPFnew, Pnew. Numbers are parts too (PPFx, PPFy = the intercepts; CPFx, CPFy; Ex, Ey; Cx, Cy): label one "" to leave it off. Default names: PPF, CPF, E, P, C; with names PPF_A, P_A …; with growth PPF_0 → PPF_1.
- ask: exports | imports | gainFromTrade (numbers of the first country, for an MCQ whose options are numbers) | none. With such an ask give the trade and consume the question states even when its figure prints only the PPF: given ["PPF"] keeps the rest off the student's figure.

IMPORT QUOTA (type importQuota)
- The editor draws D, the domestic S, the world price Pw below where they meet, and Sq: S up to Pw, flat along Pw for the quota, then S moved right by it. The price with the quota Pq is where D meets Sq; the quota is the gap between S and D at Pq. demand, supply: their slopes; size: how tight the quota is (large = a large price rise).
- parts: D, S, Sq, Pw; Pq; Qsw, Qdw (domestic output and quantity demanded at Pw); Qs, Qd (the same at Pq; Qd is the quantity transacted); P0, Q0 (no trade); quota (the brace from S to D at Pq), step (the flat step along Pw); label a bracket to draw it ("Import quota" prints the EDB words, or the question's symbol "Q_A"). S, Sq or Pw labelled "" is left off: the brace form (DSE 2016: S, D, a price line and the brace) has Sq "" and Pw ""; kinked supplies alone (DSE 2017) have S "".
- stage: none (one figure; the question's words say what changes: imposed, abolished, doubled, cut, or demand rising, and the statements are read that way) | raised | lowered (two kinked supplies Sq → Sq2: Pq2, Qs2, Qd2; quota2 the second brace) | demandRise | demandFall (D → D2 with the quota kept: Pq2, Qs2, Qd2).
- regions, one state: psGain, dwlProduction, rent (the quota rent), dwlConsumption, csAfter, psBefore. areas: dwl, quotaRent, psGain, csLoss, psAfter. raised / lowered: rentKept, rentHigh (only at the higher price), rentLeft, rentRight (only with the larger quota); areas quotaRentBefore, quotaRent. demand: rent (after) = quotaRent. ticks: priceBefore, priceAfter, importsBefore, importsAfter, domesticOutput, quantityBefore, quantityAfter. A statement question (the price, domestic output, imports, quota rent, surplus) has ask "none".

A FIGURE THE STUDENT COMPLETES (Paper 2: "With the aid of Figure 3", "In Figure 2, indicate …")
- given: the parts the printed figure gives, by part id (["D"], ["D","MR","MC"], ["PPF","E","PPF2"], ["D","S","Pw"]); a curve or point brings its own numbers; placement "question". Draw the whole model answer on it (every part, tick and area the marking scheme rewards): what given does not list is the answer layer, printed only in the marking scheme. given [] = one figure as before.

KIND "flow"
- flow: {layout, nodes, arrows, key}. nodes: {id, label, col, row, boxed}: col 0, 1, 2… left to right; row orders a column top to bottom. boxed false = bare words (a note such as "increase in inventory $50" under the box it comes from).
- arrows: {from, to, label, labelBelow, dashed, route}: from and to are node ids; "" = an open end (raw materials entering: from ""; exports leaving: to ""). label sits over the shaft, labelBelow under it: the $ amount and the goods ("$400", "Flour ($25 000)"), or the letter the question asks about ("Flow X", "E"). Draw only the transactions the question gives, never the value added it asks for.
- The circular flow: households col 0, firms col 1, the same row; route "above" / "below" loops over / under the boxes (the first listed on a side runs inside); dashed true for money flows, false for real flows; key {dashed: "Money flow" 貨幣流程, solid: "Real flow" 實質流程}.
- Production stages in a triangle: layout "grid" (row is shared by every column): primary col 1 row 0, secondary col 0 row 1, tertiary col 2 row 1; two arrows between two boxes are drawn side by side, one each way.
- Otherwise layout "columns", every route "straight", dashed false, key words "".

KIND "lorenz"
- lorenz: {panels, equality, grid, axes}. panels: one box, or two side by side when the question compares economies ("Economy X and Economy Y": one box each, title "Lorenz curve of Economy X" / "X 經濟體的洛倫茲曲線"). A box's curves: {label, name, inequality, style}; one curve (label "") or two lettered "A", "B" as the question names them (before/after a policy), with name {en, zh} for the key beside the box ("pre-tax income"). inequality: slight | moderate | high | extreme (further from the line of equality = less even, larger Gini); two curves of a box differ. style: solid | dashed. equality: draw the line of equality (HKDSE often leaves it out). grid: the 20% grid with 0–100 numbers. axes: percent ("% of income") | cumulative ("Cumulative percentage of income"). Every economy or curve the question names is on the figure; the key's comparison must be true of it. For any other kind, lorenz.panels is [].

KIND "curves"
- curves: {id, role, slope, place, label, shape, rise, start, cap, through}. role: demand | supply | ad | sras | lras | vertical (fixed supply) | horizontal (perfectly elastic) | frontier (PPC) | graph (a plain line against two named axes, below). slope: normal | steep (inelastic) | flat (elastic). place (vertical, horizontal, frontier only): low | mid | high. shape and rise: "none" and "rising" except on a graph. start and cap: "none" except on a broken tax line (below). through: [] or, on a vertical or horizontal line, two ids listed before it whose crossing it passes through (an LRAS at E_0: through ["AD0","SRAS0"]); on a supply, ["origin"] draws it from the origin (an area with corner 0, "area 0abc").
- role "graph": the line of a plain graph such as "tax payment against taxable income", "average tax rate against income", "average cost against output". Name the axes exactly in xAxis and yAxis; the label may be "". shape: origin (straight from the origin) | linear (straight from a point on the y-axis) | convex (bending upward: rising faster and faster, or falling more and more slowly) | concave (bending downward: rising more and more slowly, or falling faster and faster) | flat (horizontal) | zeroThenRising (zero along the x-axis up to a value, e.g. a tax-free allowance, then rising straight) | risingThenFlat (rising straight from the origin, then horizontal beyond a value, e.g. capped at a standard rate) | linearThenFlat (rising straight from a point on the y-axis, then horizontal) | zeroRisingFlat (zero, then rising, then horizontal: an allowance and a cap). rise: rising | falling (the broken shapes always rise). start (where a broken line's tax-free part ends) and cap (how high its level part sits): low | mid | high, "none" = mid; an old and a new schedule differ in these (a raised allowance = a later start; a raised cap = a higher cap). Pick the shape the note describes, part by part; never "flat" for a line that is only partly horizontal. In a set, options or cells that should differ must not be drawn alike. Taxes: a proportional tax is tax payment straight from the origin and a flat average rate; a progressive tax is tax payment convex and rising, and a rising average rate; a regressive tax is tax payment concave (or flat, a lump sum), and a falling average rate.
- shifts: {of, id, direction, size, label, through}. A shifted copy of curve "of" (or of an earlier shift). direction: right | left | up | down | out | in. size: small | normal | large. through: [] or two drawn ids: the copy passes exactly through where they meet, its size worked out ("SRAS shifts until AD meets LRAS": through ["AD","LRAS"]). For a frontier, out/in move both ends, right/left only the x end, up/down only the y end.
- levels: {id, kind, above, below, side, style, label, through}: a fixed price line, or for kind "quota" a fixed quantity line. kind: ceiling | floor (also minimum wage) | world | fixed | quota. through: [] or two drawn ids: exactly at their crossing (a ceiling set at the old equilibrium price), above / below then unused.
  Place it against crossings of two drawn curves: "above": ["D1","S1"] puts it higher than (a quota: right of) where D1 meets S1; "below": ["D1","S2"] lower than (left of) where D1 meets S2. Give both when the question needs it between two equilibria. [] = no bound; with both [] it goes "side" (below | above) the first equilibrium. The editor finds the exact height.
  style "guide": dashed from the axis to the last point marked on it, its label a tick on the axis: the usual HKDSE multiple-choice look ("P1 - - -" to the crossings). style "line": a solid line across the plot (a price ceiling drawn as a line, a world price).
- points: {a, b, name, xTick, yTick, dot}: a marked point where lines a and b meet. a and b are any drawn ids: two curves (an equilibrium), or a curve and a level (the quantity supplied on S2 at the price P1: a "S2", b "P1"). b may also be an earlier point's tick: {a "S1", b "Q_1"} is the point on S1 above Q1 (the price sellers receive under a tax), or an earlier point's name: {a "D2", b "a", name "b"} is b on D2 straight above a, joined to it by a dashed line, or "xAxis" / "yAxis": where line a meets that axis (S1, a supply from the origin shifted right, starts at a on the quantity axis: {a "S1", b "xAxis", name "a"}). Corner 0 is the origin, always printed: no point for it. xTick/yTick: the tick labels where its dashed lines meet the axes; "" leaves that line off. name "" unless the question names the point (E_0). dot: false for HKDSE multiple-choice figures (they mark ticks, not dots).
- gaps: {level, label}: the shortage or surplus bracket at a price line, between the first demand and supply curves.
- brackets: {from, to, label}: a bracket under the axis between two ticks printed on the figure (a point's xTick or yTick, or a price line's label), both on one axis: an output gap (from "Y_0" to "Y_f", label "Deflationary gap"), a shortage after a shift (from "Q_s" to "Q_d1").
- bands: {label, corners, top, bottom, from, to}: an area the question names, as the region between two drawn lines across a stretch of quantity. top, bottom: drawn ids (bottom "" = the x-axis); from, to: a point's name or an x tick ("" from = the y-axis, "" to = where top and bottom meet). label: the letter printed in it ("A"; areas lettered A, B, C as the options name them), or "" when the question names it by corner letters; corners: those letters ("abc"), which the editor checks enclose exactly the band. You name the area; the editor finds its outline.
- shades: {preset, label}: a shaded area (curves only; a question about areas is a scene). preset is one of: ${'${SHADES}'}. label {en:"",zh:""} keeps the preset's own.
- marks: {of, where, label}: a lettered point inside / on / outside a curve (a PPC's A, B, C).
- changeArrows: true draws arrows along both axes from the first equilibrium's P and Q to the second's.
- asks: {what, state, markets}: what the question asks the student to find, so the editor can work the answer out again from your drawing. what: quantityTransacted | quantityDemanded | quantitySupplied | shortage | surplus | marketPrice | buyersPay | sellersGet (the editor reads the tick at that answer: it must be the label of the keyed option) | an area: dwl | cs | ps | taxRevenue (or subsidy spending) | consumerBurden | producerBurden | spending (the editor works the area out from the market and checks that the keyed option's area, by corner letters or band letters, is it) | none (anything else: a PPC point, a reason). state: before | after the change (after = every curve replaced by its last shift) | change (areas only: the area between the before and after measures, "the deadweight loss increases by …"). markets ([] unless an area is asked): [before] or [before, after], each {demand, supply, cost, benefit, socialCost, control} naming the ids in force: supply = the curve traded on (with a tax, S1); cost = the supply without the tax or subsidy (S0; "" = supply); benefit, socialCost = MSB and MSC curves ("" = demand, cost); control = a ceiling, floor or quota id ("" = none). [] = the first demand and supply before, their last shifts after, the first control. An MCQ whose options name areas is refused without an area ask.
- Recipes. Money market: axes "Quantity of money" / "Nominal interest rate" (貨幣數量 / 名義利率), M_s role vertical, M_d role demand, lettered crossings as points (name, dot); one money-demand curve shifting (M_a1 → M_a2) has no M_s. Two lettered points on ONE curve (a movement along it): two guide levels (kind fixed, label "" unless the question names the prices), side above and side below, and a point on the curve at each, named as the question names them; never two "on" marks (they land on one spot). A price fixed in the seller's currency while demand shifts (a revenue box): the price is a curve of role horizontal, not a level. AD-AS back at full employment: the shift goes through ["AD","LRAS"] (or ["AD1","LRAS"]); an economy starting at full employment has its LRAS through ["AD0","SRAS0"]. Tax schedules, old and new: two graph lines of one broken shape with a different start or cap.
- Two things the question tells apart are never drawn on one spot (two lines alike, two points at one place, two brackets on one stretch): the editor rejects it.
- ids are short and unique ("D", "S", "D1", "Pc"); every entry refers to ids defined before it.
- For kind "scene", "curves", "shifts", "levels", "points", "gaps", "brackets", "bands", "shades", "marks" are []: the scene draws them. For any other kind, scene.type is "none". flow.nodes and flow.arrows are [] unless kind is "flow".

A QUESTION'S FIGURE (placement "question")
- Draw exactly what the question and its options name: every label in the stem or an option (Q1, Q2, Q3, Q4, P1, S1, S2, D1, area A, point B) is on the figure, and nothing the student is asked to find is said in words on it.
- An MCQ whose options are quantities (Q1–Q4) marks one point for each, with a dashed line down to its tick. Number the ticks in order along the axis: Q1 nearest the origin, then Q2, Q3, Q4 to the right; P1 the lowest price tick. Then make the key the label at the right answer: the editor checks it.
- HKDSE look: straight lines, curve names at their ends (S1, S2 at the top, D1 at the bottom), axes "Price" and "Quantity", a short arrow for each shift, no dots, no title unless the question gives one.
- "figure" (when given) is the question writer's note on what to draw and which label is the key: follow it.

ECONOMICS (get these right)
- Increase in demand or supply = shift RIGHT; decrease = LEFT. A unit tax or higher cost moves supply UP (a decrease); a subsidy moves it DOWN.
- Price ceiling BELOW equilibrium gives a shortage (Qd > Qs at the ceiling); price floor or minimum wage ABOVE equilibrium gives a surplus.
- Fixed stock (land, licences, seats) = vertical supply. AD-AS: axes "Price level" / "Real output"; LRAS vertical; a demand shock moves AD, a cost shock SRAS.
- Elastic = flat, inelastic = steep. PPC: growth = out; a point inside = unemployment or inefficiency; outside = unattainable.
- The diagram must agree with the answer key exactly: the same curves move the same way. Name curves as the question does (D_1 → D_2 if it says so).

LABELS
- Curve, point and tick labels are symbols, the same in both languages: D, S, AD, SRAS, LRAS, PPC, E_0, P_1, Q_c. Write a subscript as _x or _{xy}.
- Words (title, axes, gap and shade labels, chart text) have "en" and "zh". Write the Chinese in Hong Kong Traditional Chinese with HKEAA terms: Price 價格, Quantity 數量, Wage rate 工資率, Quantity of labour 勞工數量, Price level 物價水平, Real output 實質產出, shortage 短缺, surplus 過剩, deadweight loss 效率損失, total revenue 總收入.
- Write only the languages listed in "languages"; leave the other "".

REFERENCE
- When "reference" is given, it is a past question's figure (in words, or a picture attached): read it into the vocabulary above (its curves, shifts, levels and which points carry which ticks), then make a similar but NEW diagram for THIS question (the same type of diagram and idea, with this question's curves, directions and labels). Never copy a reference that disagrees with this question's key.
- When "previous" is given, it is the figure of the draft this question replaces, as JSON: keep its look and ids where the question still fits it.

EDIT
- When "edit" is given, you are changing an existing figure, not drawing a new one. "edit.spec" is the figure as JSON and "edit.note" the teacher's request ("label Q1 and Q3", "move P1 up", "make it a price floor"). Return the whole spec with only what the note asks changed; keep every other entry, id and label as it is.
- "questionChange": "" when the question's words (stem, options, key) still fit the edited figure. Otherwise one English sentence saying what the words must change to (for example "the policy is now a price floor; the key becomes Q2"). Never change the words just to describe the figure.

SEVERAL FIGURES (task "diagram-set")
- "figures" lists every figure the question needs, each {at, note}: at "stem" is the stem's one figure, "(1)" to "(4)" the cells of a grid of small figures in the stem (the question asks "Which of the following diagrams …"), "A" to "D" the figure under each option. Reply {"figures": [...], "gridAsks": "..."}: one diagram object per asked figure, its "at" first, in the order asked.
- Each figure is a whole diagram on its own (its own axes, curves, ticks and labels), drawn to its note. A grid's figures are small and alike: the same axes, changing only what the question tests. Option figures differ only in what the options test; exactly the keyed one is right.
- The grid's labels (1)–(4) and the option letters are printed by the paper, never on the figures.
- gridAsks: what a grid of plain graphs asks, so the editor can work the key out from your drawings: progressiveTax | proportionalTax | regressiveTax ("which of the following show a progressive tax") | none (anything else).

TEMPLATES
${'${TEMPLATES}'}

Every key of the JSON is always present; use "" or [] for what is unused.`;

export function systemPrompt(): string {
  return DIAGRAM_SYSTEM_PROMPT.replace('${SCENES}', sceneMenu()).replace('${SHADES}', shadeMenu()).replace('${TEMPLATES}', templateMenu());
}

export interface DiagramPayload {
  task: 'diagram' | 'diagram-edit';
  languages: string[];
  question: string;
  key: string;
  figure?: string;
  reference?: { description?: string; image?: 'attached' | 'not available' };
  previous?: DiagramSpec;
  edit?: { spec: DiagramSpec; note: string };
}

export function buildPayload(input: DiagramGenInput, imageAttached: boolean): DiagramPayload {
  const payload: DiagramPayload = {
    task: 'diagram',
    languages: input.sides.map((s) => (s === 'en' ? 'en' : 'zh')),
    question: input.question.trim(),
    key: input.key.trim(),
    ...(input.figure?.trim() ? { figure: input.figure.trim() } : {}),
  };
  if (input.edit) {
    payload.task = 'diagram-edit';
    payload.edit = { spec: input.edit.spec, note: input.edit.note.trim().slice(0, 400) };
  } else if (input.base) payload.previous = input.base;
  const ref = input.reference;
  if (ref && (ref.diagram || ref.image || ref.text?.trim())) {
    const description = [ref.diagram ? describeDiagram(ref.diagram) : '', ref.text?.trim() ?? ''].filter(Boolean).join('\n');
    payload.reference = {
      ...(description ? { description } : {}),
      ...(ref.image ? { image: imageAttached ? 'attached' : 'not available' } : {}),
    };
  }
  return payload;
}

/** Room for the spec: small, plus a thinking allowance on Gemini. */
export function maxOutputTokens(preset: ProviderPreset): number {
  const thinking = preset.family === 'gemini' ? 4096 : 0;
  return Math.min(preset.outputCap, 3000 + thinking);
}

export function buildDiagramRequest(
  input: DiagramGenInput,
  preset: ProviderPreset,
  signal: AbortSignal,
  imageAttached: boolean,
): CompletionRequest {
  return {
    system: systemPrompt(),
    turns: [{ role: 'user', content: JSON.stringify(buildPayload(input, imageAttached)) }],
    schema: input.edit ? DIAGRAM_EDIT_SCHEMA : DIAGRAM_SPEC_SCHEMA,
    shapeHint: input.edit ? EDIT_SHAPE_HINT : DIAGRAM_SHAPE_HINT,
    maxOutputTokens: maxOutputTokens(preset),
    feature: 'studio.diagram',
    signal,
  };
}

/** The repair turn: the first reply, then what failed, asking for the whole spec again. */
export function buildRepairRequest(first: CompletionRequest, reply: string, issues: readonly DiagramIssue[]): CompletionRequest {
  const problems = issues.filter((i) => i.level === 'error').map((i) => `- ${i.text}`);
  const turns: ChatTurn[] = [
    ...first.turns,
    { role: 'assistant', content: reply },
    {
      role: 'user',
      content: `That diagram has these problems:\n${problems.join('\n')}\nReturn the whole corrected JSON, every key present. Fix the drawing, not the question: the question's words and key are fixed.`,
    },
  ];
  return { ...first, turns };
}
