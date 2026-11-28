import type { Diagram, DiagramCurve } from '@/model/diagram';
import { curveXAt, curveYAt } from '@/model/diagramAnchors';
import { curveCrossing } from '@/model/diagramAreas';
import { DEMAND_LIKE, SUPPLY_LIKE, tickKey, type Compiled } from './compile';
import { optionLabels } from './labels';
import { plainOf } from './text';
import { isAreaAsk, type AskWhat, type DiagramIssue, type DiagramSpec, type SolvedKey } from './types';

/**
 * The key worked out again from the drawing (k-0534). The question says what it asks
 * (`spec.asks`); the curves, their shifts and the controls on the compiled diagram decide
 * where the answer is; the tick printed there is the answer. An MCQ whose options are
 * labels must key exactly that option. This is the check the old pipeline lacked: it read
 * shift directions from the key, never the answer itself.
 *
 * Economics (the rules dse-econ-graph teaches): a ceiling binds below equilibrium (quantity
 * transacted = quantity supplied at the ceiling, a shortage); a floor binds above it
 * (transacted = quantity demanded, a surplus); a quota binds left of the equilibrium
 * quantity (transacted = the quota, price read off demand there). Under a tax or subsidy
 * buyers pay the new market price and sellers get the original supply's price at the new
 * quantity.
 */

const EPS = 0.012;

const WHAT_WORDS: Record<AskWhat, string> = {
  none: '',
  quantityTransacted: 'the quantity transacted',
  quantityDemanded: 'the quantity demanded',
  quantitySupplied: 'the quantity supplied',
  shortage: 'the shortage',
  surplus: 'the surplus',
  marketPrice: 'the market price',
  buyersPay: 'the price buyers pay',
  sellersGet: 'the price sellers receive',
  dwl: 'the deadweight loss',
  cs: 'the consumer surplus',
  ps: 'the producer surplus',
  taxRevenue: 'the tax revenue (or subsidy spending)',
  consumerBurden: "the consumers' share of the tax",
  producerBurden: "the producers' share of the tax",
  spending: "buyers' total spending",
};

type Target = { axis: 'x' | 'y'; at: number[]; why: string };

/** The curve a spec id became on the compiled diagram. */
function curveOf(spec: DiagramSpec, compiled: Compiled, diagram: Diagram, id: string | undefined): DiagramCurve | undefined {
  if (!id) return undefined;
  const editorId = compiled.curveIds.get(id);
  return diagram.curves.find((c) => c.id === editorId);
}

/** A base curve's id, and its last shift's (the "after" curve); the same id when it never moves. */
function chain(spec: DiagramSpec, baseId: string): { before: string; after: string } {
  let after = baseId;
  for (;;) {
    const next = spec.shifts.find((s) => s.of === after);
    if (!next) break;
    after = next.id;
  }
  return { before: baseId, after };
}

const labelOf = (spec: DiagramSpec, id: string) =>
  spec.curves.find((c) => c.id === id)?.label || spec.shifts.find((s) => s.id === id)?.label || spec.levels.find((l) => l.id === id)?.label || id;

/** Where the answer is on the drawing, or why it cannot be found. */
function target(spec: DiagramSpec, compiled: Compiled, diagram: Diagram): Target | string {
  const { what, state } = spec.asks;
  const demand = spec.curves.find((c) => DEMAND_LIKE.has(c.role));
  const supply = spec.curves.find((c) => SUPPLY_LIKE.has(c.role));
  if (!demand || !supply) return 'it has no demand and supply curve to work from';
  const d = chain(spec, demand.id);
  const s = chain(spec, supply.id);
  const dId = state === 'after' ? d.after : d.before;
  const sId = state === 'after' ? s.after : s.before;
  const D = curveOf(spec, compiled, diagram, dId);
  const S = curveOf(spec, compiled, diagram, sId);
  const S0 = curveOf(spec, compiled, diagram, s.before);
  if (!D || !S || !S0) return 'a curve it needs is not drawn';
  const E = curveCrossing(D, S);
  if (!E) return `${labelOf(spec, dId)} and ${labelOf(spec, sId)} do not cross`;
  const curves = `${labelOf(spec, dId)} and ${labelOf(spec, sId)}`;

  const control = spec.levels.find((l) => l.kind === 'ceiling' || l.kind === 'floor');
  const quota = spec.levels.find((l) => l.kind === 'quota');
  // Where the levels sit, drawn as a line or (a guide) only through their points.
  const py = control ? compiled.levels.get(control.id)?.at : undefined;
  const qx = quota ? compiled.levels.get(quota.id)?.at : undefined;
  const ceilingBinds = control?.kind === 'ceiling' && py !== undefined && py < E.y - EPS;
  const floorBinds = control?.kind === 'floor' && py !== undefined && py > E.y + EPS;
  const quotaBinds = qx !== undefined && qx < E.x - EPS;
  const cName = control ? `the ${control.kind} ${control.label}` : '';

  // Quantities read at the control price (a guide is short: read the curve itself, not the drawn line).
  const atPrice = (curve: DiagramCurve, y: number) => curveXAt(curve, y);
  const price = ceilingBinds || floorBinds ? py! : quotaBinds ? curveYAt(D, qx!) ?? E.y : E.y;
  const priceWhy = ceilingBinds
    ? `${cName} is below the equilibrium of ${curves}, so it binds and the price is ${control!.label}`
    : floorBinds
      ? `${cName} is above the equilibrium of ${curves}, so it binds and the price is ${control!.label}`
      : quotaBinds
        ? `the quota ${quota!.label} is less than the equilibrium quantity of ${curves}, so the price is read off ${labelOf(spec, dId)} at the quota`
        : control
          ? `${cName} does not bind against ${curves} (the equilibrium is ${control.kind === 'ceiling' ? 'below' : 'above'} it), so the market clears where ${curves} cross`
          : `the market clears where ${curves} cross`;
  const qd = atPrice(D, price);
  const qs = quotaBinds ? qx! : atPrice(S, price);

  switch (what) {
    case 'quantityTransacted': {
      if (ceilingBinds && qs !== null) return { axis: 'x', at: [qs], why: `${priceWhy}; the quantity transacted is the quantity supplied there, on ${labelOf(spec, sId)}` };
      if (floorBinds && qd !== null) return { axis: 'x', at: [qd], why: `${priceWhy}; the quantity transacted is the quantity demanded there, on ${labelOf(spec, dId)}` };
      if (quotaBinds) return { axis: 'x', at: [qx!], why: `${priceWhy}; the quantity transacted is the quota` };
      return { axis: 'x', at: [E.x], why: priceWhy };
    }
    case 'quantityDemanded':
      return qd === null ? `${labelOf(spec, dId)} does not reach that price` : { axis: 'x', at: [qd], why: `${priceWhy}; quantity demanded is read off ${labelOf(spec, dId)} at that price` };
    case 'quantitySupplied':
      return qs === null ? `${labelOf(spec, sId)} does not reach that price` : { axis: 'x', at: [qs], why: `${priceWhy}; quantity supplied is read off ${labelOf(spec, sId)} at that price` };
    case 'shortage':
      if (!ceilingBinds || qd === null || qs === null) return `there is no shortage: ${priceWhy}`;
      return { axis: 'x', at: [qs, qd], why: `${priceWhy}; the shortage runs from the quantity supplied to the quantity demanded at ${control!.label}` };
    case 'surplus':
      if (!floorBinds || qd === null || qs === null) return `there is no surplus: ${priceWhy}`;
      return { axis: 'x', at: [qd, qs], why: `${priceWhy}; the surplus runs from the quantity demanded to the quantity supplied at ${control!.label}` };
    case 'marketPrice':
    case 'buyersPay':
      return { axis: 'y', at: [price], why: priceWhy };
    case 'sellersGet': {
      const q = ceilingBinds ? qs : floorBinds ? qd : quotaBinds ? qx! : E.x;
      const y = q === null ? null : curveYAt(S0, q);
      if (y === null) return `${labelOf(spec, s.before)} does not reach the quantity transacted`;
      return { axis: 'y', at: [y], why: `${priceWhy}; sellers receive the price on the original supply ${labelOf(spec, s.before)} at the quantity transacted` };
    }
    default:
      return 'nothing to solve';
  }
}

/** The tick labels printed at a place on one axis: point ticks, and a level's own name at the axis. */
function ticksAt(diagram: Diagram, axis: 'x' | 'y', at: number): string[] {
  const out: string[] = [];
  for (const p of diagram.points) {
    const label = axis === 'x' ? p.xTickLabel : p.yTickLabel;
    if (!label || !p.dropTo?.includes(axis)) continue;
    if (Math.abs((axis === 'x' ? p.at.x : p.at.y) - at) < EPS) out.push(plainOf(label));
  }
  for (const c of diagram.curves) {
    const d = c.derive;
    if (!c.label) continue;
    if (axis === 'y' && d?.kind === 'level' && Math.abs((c.points[0]?.y ?? -1) - at) < EPS) out.push(plainOf(c.label));
    if (axis === 'x' && d?.kind === 'vertical' && Math.abs((c.points[0]?.x ?? -1) - at) < EPS) out.push(plainOf(c.label));
  }
  return [...new Set(out.map((t) => t.trim()).filter(Boolean))];
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

export interface SolveInput {
  options: readonly string[];
  answer: number;
}

/**
 * The answer as the drawing gives it, and what is wrong with the key against it. Nothing
 * when the spec asks nothing this solver reads, or the options are not labels (words like
 * "rises" are the blind solve's to judge).
 */
export function solveKey(spec: DiagramSpec, compiled: Compiled, mcq: SolveInput | undefined): { solved: SolvedKey | null; issues: DiagramIssue[] } {
  const diagram = compiled.diagram;
  // Areas are `market.ts`'s (k-0596).
  if (spec.kind !== 'curves' || spec.asks.what === 'none' || isAreaAsk(spec.asks.what) || !diagram) return { solved: null, issues: [] };
  const words = WHAT_WORDS[spec.asks.what];
  const found = target(spec, compiled, diagram);
  const optionKeys = (mcq?.options ?? []).map(optionLabels);
  const labelOptions = optionKeys.length > 0 && optionKeys.every((k) => k.length > 0);
  if (typeof found === 'string') {
    // The question asks for something the drawing does not have (a shortage where none is).
    return {
      solved: null,
      issues: labelOptions ? [{ level: 'error', code: 'key.geometry', text: `The question asks for ${words} (${spec.asks.state} the change), but on this diagram ${found}. Draw it so the question has an answer.` }] : [],
    };
  }
  const labels = found.at.map((at) => ticksAt(diagram, found.axis, at));
  const missing = labels.some((l) => !l.length);
  const why = `${words} (${spec.asks.state} the change): ${found.why}`;
  if (missing) {
    return {
      solved: { labels: [], option: -1, why },
      issues: [{ level: 'error', code: 'key.unlabelled', text: `On this diagram ${why}, but no tick is printed there. Mark that point with its tick.` }],
    };
  }
  const chosen = labels.map((l) => l[0]);
  const keys = chosen.map(tickKey);
  const matching = optionKeys.flatMap((k, i) => (sameSet(k, keys) ? [i] : []));
  const option = matching.length === 1 ? matching[0] : -1;
  const solved: SolvedKey = { labels: chosen, option, why };
  if (!mcq || !labelOptions) return { solved, issues: [] };
  const LETTERS = 'ABCD';
  const keyed = `${LETTERS[mcq.answer] ?? '?'} (${mcq.options[mcq.answer] ?? ''})`;
  if (!matching.length) {
    return { solved, issues: [{ level: 'error', code: 'key.geometry', text: `On this diagram ${why}: ${chosen.join(' to ')}. No option says that; the key is ${keyed}. Draw the diagram so that the key's label marks the answer.` }] };
  }
  if (matching.length > 1) {
    return { solved, issues: [{ level: 'error', code: 'key.twoOptions', text: `On this diagram the answer is ${chosen.join(' to ')}, which ${matching.length} options say.` }] };
  }
  if (option !== mcq.answer) {
    return {
      solved,
      issues: [{ level: 'error', code: 'key.geometry', text: `On this diagram ${why}: that is ${chosen.join(' to ')}, option ${LETTERS[option]}. The key is ${keyed}. Draw the diagram so that the key's label marks the answer (move the price line or the shift, or put the labels where the key needs them).` }],
    };
  }
  return { solved, issues: [] };
}
