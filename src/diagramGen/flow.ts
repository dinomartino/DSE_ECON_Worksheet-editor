import type { Diagram, FlowArrow, FlowChart, FlowNode } from '@/model/diagram';
import { newId } from '@/model/factories';
import type { Side } from '@/model/textSlots';
import type { Compiled } from './compile';
import { phrase, plainOf } from './text';
import type { DiagramIssue, DiagramSpec } from './types';

/**
 * Kind "flow" (k-0588, audit k-0583 tasks D1/D2): boxes and arrows, compiled to the editor's
 * own flow chart (`model/diagram.ts:FlowChart`), so the teacher edits the AI's chart in the
 * flow editor like one they drew. The value-added chain (HKDSE 2021 P1 Q23: importers and
 * farmers into supermarkets, "$1 200 ($100 sales tax inclusive)", "increase in inventory
 * $50"), the circular flow (2026 P1 Q5: dashed money flows looping over and under) and the
 * production stages (2014 P1 Q10: a triangle, pairs of arrows) are all this one kind.
 */

/** More boxes than any paper's chart has (the largest, 2021 P1 Q23, has six and a note). */
export const MAX_FLOW_NODES = 12;
export const MAX_FLOW_ARROWS = 20;

export function compileFlow(spec: DiagramSpec): Compiled {
  const issues: DiagramIssue[] = [];
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });
  const empty = { curveIds: new Map(), roles: new Map(), levels: new Map() };
  const given = spec.flow;
  if (!given || given.nodes.length === 0) {
    error('flow.empty', 'The flow chart has no boxes.');
    return { diagram: null, issues, ...empty };
  }
  if (given.nodes.length > MAX_FLOW_NODES) error('flow.size', `A flow chart holds at most ${MAX_FLOW_NODES} boxes.`);
  if (given.arrows.length > MAX_FLOW_ARROWS) error('flow.size', `A flow chart holds at most ${MAX_FLOW_ARROWS} arrows.`);

  const ids = new Map<string, string>();
  const nodes: FlowNode[] = [];
  for (const n of given.nodes.slice(0, MAX_FLOW_NODES)) {
    if (!n.id || ids.has(n.id)) {
      error('flow.id', n.id ? `Two boxes are both "${n.id}".` : 'A box has no id.');
      continue;
    }
    const label = phrase(n.label);
    if (!label) error('flow.unnamed', `Box "${n.id}" has no words.`);
    const id = newId();
    ids.set(n.id, id);
    const clamp = (v: number) => Math.max(0, Math.min(MAX_FLOW_NODES, v));
    nodes.push({
      id,
      label: label ?? { en: [], zh: [] },
      col: clamp(n.col),
      row: clamp(n.row),
      ...(n.boxed ? {} : { boxed: false }),
    });
  }
  const cells = new Set<string>();
  for (const n of nodes) {
    const cell = `${n.col}:${n.row}`;
    if (cells.has(cell)) error('flow.cell', `Two boxes share column ${n.col}, row ${n.row}: give each its own place.`);
    cells.add(cell);
  }

  const arrows: FlowArrow[] = [];
  for (const a of given.arrows.slice(0, MAX_FLOW_ARROWS)) {
    const from = a.from ? ids.get(a.from) : undefined;
    const to = a.to ? ids.get(a.to) : undefined;
    const name = `${a.from || '(open)'} → ${a.to || '(open)'}`;
    if ((a.from && !from) || (a.to && !to)) {
      error('flow.endpoint', `Arrow ${name} names a box that is not on the chart.`);
      continue;
    }
    if (!from && !to) {
      error('flow.endpoint', 'An arrow has neither end on a box.');
      continue;
    }
    if (from && from === to) {
      error('flow.endpoint', `Arrow ${name} starts and ends on the same box.`);
      continue;
    }
    const label = phrase(a.label);
    const labelBelow = phrase(a.labelBelow);
    const routed = from && to && a.route !== 'straight';
    arrows.push({
      id: newId(),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(label ? { label } : {}),
      ...(labelBelow ? { labelBelow } : {}),
      ...(a.dashed ? { dashed: true } : {}),
      ...(routed ? { route: a.route as 'above' | 'below' } : {}),
    });
  }

  const dashed = phrase(given.key.dashed);
  const solid = phrase(given.key.solid);
  const flow: FlowChart = {
    nodes,
    arrows,
    ...(given.layout === 'grid' ? { layout: 'grid' as const } : {}),
    ...(dashed || solid ? { key: { ...(dashed ? { dashed } : {}), ...(solid ? { solid } : {}) } } : {}),
  };
  const title = phrase(spec.title);
  const diagram: Diagram = {
    x: {},
    y: {},
    curves: [],
    points: [],
    labels: [],
    arrows: [],
    ...(title ? { title } : {}),
    flow,
  };
  return { diagram, issues, ...empty };
}

/** Every word the chart prints, each label as one string per side. */
export function flowWords(diagram: Diagram, side: Side): string[] {
  const flow = diagram.flow;
  if (!flow) return [];
  const texts = [
    ...flow.nodes.map((n) => n.label),
    ...flow.arrows.flatMap((a) => [a.label, a.labelBelow]),
    flow.key?.dashed,
    flow.key?.solid,
  ];
  return texts.map((t) => plainOf(t, side).trim()).filter(Boolean);
}

/** "$1 200", "$45,000", "$0.5 million": an amount of money as the question prints it, digits only. */
const MONEY = /\$\s?(\d[\d,\s]*(?:\.\d+)?)/g;
const digits = (raw: string) => raw.replace(/[\s,]/g, '');

/**
 * The letters a flow question names: "Flow X", "flows E and F", "arrow P", "流量 X", and the
 * letters options open with ("X: factor payments; Y: …"), plus a stem's bare capitals that
 * stand for a flow ("Which of the following could be P and Q?").
 */
const NAMED = /\b(?:[Ff]lows?|[Aa]rrows?)\s+([A-Z](?:\s*(?:,|and|or|&)\s*[A-Z])*)(?![A-Za-z])/g;
const NAMED_ZH = /(?:流量|流向|箭咀|箭嘴|箭頭)\s*([A-Z](?:\s*(?:、|及|和|與|,)\s*[A-Z])*)(?![A-Za-z])/g;
const OPENING = /(?:^|[;；,，]\s*)([A-Z])\s*[:：]/g;
const BARE = /(?<![A-Za-z(])([B-HJ-Z])(?![A-Za-z)])/g;

export function flowLetters(question: { stem: string; statements: readonly string[]; options: readonly string[] }): string[] {
  const out = new Set<string>();
  const read = (text: string) => {
    for (const re of [NAMED, NAMED_ZH]) for (const m of text.matchAll(re)) for (const l of m[1].match(/[A-Z]/g) ?? []) out.add(l);
  };
  for (const piece of [question.stem, ...question.statements]) {
    read(piece);
    for (const m of piece.matchAll(BARE)) out.add(m[1]);
  }
  for (const option of question.options) {
    read(option);
    for (const m of option.matchAll(OPENING)) out.add(m[1]);
  }
  return [...out];
}

/**
 * The question's words against the chart (k-0588): every letter it names for a flow is
 * printed on the chart (an error: the student cannot answer), every amount of money the
 * stem or statements give is on it (a look: a stem may also give a figure in words), the
 * chart has words in every language the paper prints.
 */
export function checkFlow(
  diagram: Diagram,
  question: { stem: string; statements: readonly string[]; options: readonly string[] } | undefined,
  sides: readonly Side[],
): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const flow = diagram.flow;
  if (!flow) return issues;
  for (const side of sides) {
    const which = side === 'en' ? 'English' : 'Chinese';
    const bare = flow.nodes.filter((n) => !plainOf(n.label, side).trim());
    if (bare.length) issues.push({ level: 'look', code: 'flow.side', text: `${bare.length} box${bare.length === 1 ? ' has' : 'es have'} no ${which}.` });
  }
  if (question) issues.push(...checkFlowWords(diagram, question, sides));
  return issues;
}

/** The question's letters and amounts against the chart's words (§ `checkFlow`). */
function checkFlowWords(
  diagram: Diagram,
  question: { stem: string; statements: readonly string[]; options: readonly string[] },
  sides: readonly Side[],
): DiagramIssue[] {
  const issues: DiagramIssue[] = [];
  const printed = sides.flatMap((side) => flowWords(diagram, side));
  const tokens = new Set(printed.flatMap((text) => text.split(/[^A-Za-z]+/)).filter((t) => /^[A-Z]$/.test(t)));
  const missing = flowLetters(question).filter((l) => !tokens.has(l));
  if (missing.length) {
    issues.push({
      level: 'error',
      code: 'label.missing',
      text: `The question names ${missing.join(', ')}, but the flow chart does not print ${missing.length === 1 ? 'it' : 'them'}: put each letter on its arrow (or box).`,
    });
  }
  const amounts = new Set(printed.flatMap((text) => [...text.matchAll(MONEY)].map((m) => digits(m[1]))));
  const stated = [...new Set([question.stem, ...question.statements].flatMap((text) => [...text.matchAll(MONEY)].map((m) => digits(m[1]))))];
  const absent = stated.filter((amount) => !amounts.has(amount));
  if (absent.length) {
    issues.push({
      level: 'look',
      code: 'flow.amount',
      text: `The question gives ${absent.map((a) => `$${a}`).join(', ')}, which the chart does not print.`,
    });
  }
  return issues;
}
