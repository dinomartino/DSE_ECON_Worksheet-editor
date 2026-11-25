import type { ChatTurn, CompletionRequest, ProviderPreset } from '@/ai/types';
import { SHADE_PRESETS } from '@/model/diagramPresets';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import { describeDiagram } from './describe';
import { DIAGRAM_EDIT_SCHEMA, DIAGRAM_SHAPE_HINT, DIAGRAM_SPEC_SCHEMA, EDIT_SHAPE_HINT } from './schema';
import type { DiagramGenInput, DiagramIssue, DiagramSpec } from './types';

/**
 * The request for one question's diagram. The economics rules are the ones the
 * dse-econ-graph skill teaches (its "Economics that is easy to get wrong"); the vocabulary
 * is the editor's own, so whatever comes back is editable in the diagram editor.
 */

/** Every template but the blank and the panel-only figures, as "id: name". Derived, so it never drifts. */
export function templateMenu(): string {
  // Data figures (pie, flow, forum, stakeholders, charts) hold the paper's own content: not a template to reuse.
  return DIAGRAM_TEMPLATES.filter((t) => t.id !== 'blank' && t.group !== 'data')
    .map((t) => `- ${t.id}: ${plain(t.name.en)}. ${plain(t.hint.en)}`)
    .join('\n');
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
- kind "curves": axes and straight lines you compose (below). Use it for demand and supply, shifts, price controls, AD-AS, the PPC.
- kind "chart": a bar or line chart of figures from the question (a table as a graph).
- kind "template": one of the editor's ready-made diagrams, by id, when the question is one of these and kind "curves" cannot draw it (tariffs, import quotas, monopoly, externalities, money market, Lorenz curve). Its labels are fixed; set title/xAxis/yAxis only to rename them, else leave them "".

KIND "curves"
- curves: {id, role, slope, place, label, shape, rise}. role: demand | supply | ad | sras | lras | vertical (fixed supply) | horizontal (perfectly elastic) | frontier (PPC) | graph (a plain line against two named axes, below). slope: normal | steep (inelastic) | flat (elastic). place (vertical, horizontal, frontier only): low | mid | high. shape and rise: "none" and "rising" except on a graph.
- role "graph": the line of a plain graph such as "tax payment against taxable income", "average tax rate against income", "average cost against output". Name the axes exactly in xAxis and yAxis; the label may be "". shape: origin (straight from the origin) | linear (straight from a point on the y-axis) | convex (bending upward: rising faster and faster, or falling more and more slowly) | concave (bending downward: rising more and more slowly, or falling faster and faster) | flat (horizontal) | zeroThenRising (zero along the x-axis up to a value, e.g. a tax-free allowance, then rising straight) | risingThenFlat (rising straight from the origin, then horizontal beyond a value, e.g. capped at a standard rate) | linearThenFlat (rising straight from a point on the y-axis, then horizontal) | zeroRisingFlat (zero, then rising, then horizontal: an allowance and a cap). rise: rising | falling (the broken shapes always rise). Pick the shape the note describes, part by part; never "flat" for a line that is only partly horizontal. In a set, options or cells that should differ must not be drawn alike. Taxes: a proportional tax is tax payment straight from the origin and a flat average rate; a progressive tax is tax payment convex and rising, and a rising average rate; a regressive tax is tax payment concave (or flat, a lump sum), and a falling average rate.
- shifts: {of, id, direction, size, label}. A shifted copy of curve "of" (or of an earlier shift). direction: right | left | up | down | out | in. size: small | normal | large. For a frontier, out/in move both ends, right/left only the x end, up/down only the y end.
- levels: {id, kind, above, below, side, style, label}: a fixed price line, or for kind "quota" a fixed quantity line. kind: ceiling | floor (also minimum wage) | world | fixed | quota.
  Place it against crossings of two drawn curves: "above": ["D1","S1"] puts it higher than (a quota: right of) where D1 meets S1; "below": ["D1","S2"] lower than (left of) where D1 meets S2. Give both when the question needs it between two equilibria. [] = no bound; with both [] it goes "side" (below | above) the first equilibrium. The editor finds the exact height.
  style "guide": dashed from the axis to the last point marked on it, its label a tick on the axis: the usual HKDSE multiple-choice look ("P1 - - -" to the crossings). style "line": a solid line across the plot (a price ceiling drawn as a line, a world price).
- points: {a, b, name, xTick, yTick, dot}: a marked point where lines a and b meet. a and b are any drawn ids: two curves (an equilibrium), or a curve and a level (the quantity supplied on S2 at the price P1: a "S2", b "P1"). b may also be an earlier point's tick: {a "S1", b "Q_1"} is the point on S1 above Q1 (the price sellers receive under a tax). xTick/yTick: the tick labels where its dashed lines meet the axes; "" leaves that line off. name "" unless the question names the point (E_0). dot: false for HKDSE multiple-choice figures (they mark ticks, not dots).
- gaps: {level, label}: the shortage or surplus bracket at a price line, between demand and supply.
- shades: {preset, label}: a shaded area. preset is one of: ${'${SHADES}'}. label {en:"",zh:""} keeps the preset's own.
- marks: {of, where, label}: a lettered point inside / on / outside a curve (a PPC's A, B, C).
- changeArrows: true draws arrows along both axes from the first equilibrium's P and Q to the second's.
- asks: {what, state}: what the question asks the student to find, so the editor can work the answer out again from your drawing. what: quantityTransacted | quantityDemanded | quantitySupplied | shortage | surplus | marketPrice | buyersPay | sellersGet | none (anything else: a PPC point, a reason, a shaded area). state: before | after the change (after = every curve replaced by its last shift). The editor reads the tick at that answer: it must be the label of the keyed option.
- ids are short and unique ("D", "S", "D1", "Pc"); every entry refers to ids defined before it.

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
  return DIAGRAM_SYSTEM_PROMPT.replace('${SHADES}', shadeMenu()).replace('${TEMPLATES}', templateMenu());
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
