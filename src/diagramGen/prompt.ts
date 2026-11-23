import type { ChatTurn, CompletionRequest, ProviderPreset } from '@/ai/types';
import { SHADE_PRESETS } from '@/model/diagramPresets';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { plain } from '@/model/text';
import { describeDiagram } from './describe';
import { DIAGRAM_SHAPE_HINT, DIAGRAM_SPEC_SCHEMA } from './schema';
import type { DiagramGenInput, DiagramIssue } from './types';

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
- curves: {id, role, slope, place, label}. role: demand | supply | ad | sras | lras | vertical (fixed supply) | horizontal (perfectly elastic) | frontier (PPC). slope: normal | steep (inelastic) | flat (elastic). place (vertical, horizontal, frontier only): low | mid | high.
- shifts: {of, id, direction, size, label}. A shifted copy of curve "of" (or of an earlier shift). direction: right | left | up | down | out | in. size: small | normal | large. For a frontier, out/in move both ends, right/left only the x end, up/down only the y end.
- levels: {id, kind, side, label}: a horizontal price line. kind: ceiling | floor (also minimum wage) | world | fixed. side: below | above the first equilibrium.
- equilibria: {a, b, name, yTick, xTick}: where curves a and b cross, with dashed lines to the axes. name "" unless the scheme names the point (E_0). yTick/xTick "" leaves that drop off.
- gaps: {level, label}: the shortage or surplus bracket at a price line, between demand and supply.
- shades: {preset, label}: a shaded area. preset is one of: ${'${SHADES}'}. label {en:"",zh:""} keeps the preset's own.
- marks: {of, where, label}: a lettered point inside / on / outside a curve (a PPC's A, B, C).
- changeArrows: true draws arrows along both axes from the first equilibrium's P and Q to the second's.
- ids are short and unique ("D", "S", "D1", "Pc"); every entry refers to ids defined before it.

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
- When "reference" is given, it is a past question's figure: make a similar but NEW diagram for THIS question (the same type of diagram and idea, with this question's curves, directions and labels). Never copy a reference that disagrees with this question's key.

TEMPLATES
${'${TEMPLATES}'}

Every key of the JSON is always present; use "" or [] for what is unused.`;

export function systemPrompt(): string {
  return DIAGRAM_SYSTEM_PROMPT.replace('${SHADES}', shadeMenu()).replace('${TEMPLATES}', templateMenu());
}

export interface DiagramPayload {
  task: 'diagram';
  languages: string[];
  question: string;
  key: string;
  reference?: { description?: string; image?: 'attached' | 'not available' };
}

export function buildPayload(input: DiagramGenInput, imageAttached: boolean): DiagramPayload {
  const payload: DiagramPayload = {
    task: 'diagram',
    languages: input.sides.map((s) => (s === 'en' ? 'en' : 'zh')),
    question: input.question.trim(),
    key: input.key.trim(),
  };
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
    schema: DIAGRAM_SPEC_SCHEMA,
    shapeHint: DIAGRAM_SHAPE_HINT,
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
      content: `That diagram has these problems:\n${problems.join('\n')}\nReturn the whole corrected JSON, every key present.`,
    },
  ];
  return { ...first, turns };
}
