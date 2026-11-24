import type { Diagram, DiagramCurve } from '@/model/diagram';
import { curveCrossing } from '@/model/diagramAreas';
import { DEMAND_LIKE, SUPPLY_LIKE, tickKey } from './compile';
import { plainOf } from './text';
import type { DiagramSpec, SpecCurve, SpecPoint } from './types';

/**
 * A drawn figure in plain English for the blind solve (k-0534): what a student sees, read
 * off the geometry — the curves, the ticks along each axis in order and what each marks,
 * and where the unmarked crossings sit against the ticks. Never the answer and never the
 * spec's `asks`: the solve must work the question out as a student would. Symbols plain
 * ("Q1", "S2"), the same in both languages.
 */

const sym = (raw: string) => plainOf({ en: [{ text: raw.replace(/_\{?([^}\s]*)\}?/g, '$1') }], zh: [] }).trim();

const ROLE: Record<string, string> = {
  demand: 'a demand curve (downward-sloping)',
  supply: 'a supply curve (upward-sloping)',
  ad: 'an AD curve',
  sras: 'an SRAS curve',
  lras: 'a vertical LRAS curve',
  vertical: 'a vertical supply curve',
  horizontal: 'a horizontal curve',
  frontier: 'a production possibilities curve',
};
const WAY: Record<string, string> = { right: 'to the right', left: 'to the left', up: 'upward', down: 'downward', out: 'outward', in: 'inward' };

/** A plain graph's line in words (k-0545), as a student reads the sketch. */
export function graphWords(shape: SpecCurve['shape'], rise: SpecCurve['rise']): string {
  const up = rise !== 'falling';
  switch (shape) {
    case 'linear':
      return `a straight line starting from a positive value on the vertical axis, ${up ? 'rising' : 'falling'}`;
    case 'convex':
      return up ? 'a curve from the origin, rising at an increasing rate' : 'a curve falling at a decreasing rate';
    case 'concave':
      return up ? 'a curve from the origin, rising at a decreasing rate' : 'a curve falling at an increasing rate';
    case 'flat':
      return 'a horizontal straight line (constant)';
    default:
      return up ? 'a straight line from the origin, rising' : 'a straight line, falling';
  }
}

export function figureWords(spec: DiagramSpec, diagram: Diagram): string {
  if (spec.kind !== 'curves') return '';
  const lines: string[] = [];
  const x = spec.xAxis.en || spec.xAxis.zh;
  const y = spec.yAxis.en || spec.yAxis.zh;
  lines.push(`Axes: ${y || 'y'} (up), ${x || 'x'} (across).`);
  const name = (id: string) => {
    const c = spec.curves.find((k) => k.id === id) ?? spec.shifts.find((k) => k.id === id) ?? spec.levels.find((k) => k.id === id);
    return c ? sym(c.label) || id : sym(id);
  };
  const curveLines = [
    ...spec.curves.map((c) => (c.role === 'graph' ? `${sym(c.label) || 'the line'}: ${graphWords(c.shape, c.rise)}` : `${sym(c.label)}: ${ROLE[c.role] ?? c.role}`)),
    ...spec.shifts.map((s) => `${sym(s.label)}: ${name(s.of)} shifted ${WAY[s.direction] ?? s.direction}`),
    ...spec.levels.map((l) => (l.kind === 'quota' ? `${sym(l.label)}: a quota, a fixed quantity` : `${sym(l.label)}: a fixed price (${l.kind === 'ceiling' ? 'a price ceiling' : l.kind === 'floor' ? 'a price floor' : l.kind === 'world' ? 'the world price' : 'a set price'})`)),
  ];
  lines.push(`Lines: ${curveLines.join('; ')}.`);

  /** What a spec point marks, in words. */
  const what = (p: SpecPoint): string => {
    const level = spec.levels.find((l) => l.id === p.a || l.id === p.b);
    const other = level ? (level.id === p.a ? p.b : p.a) : '';
    if (level) return level.kind === 'quota' ? `${name(other)} at the quota ${name(level.id)}` : `${name(other)} at the price ${name(level.id)}`;
    const isLine = (id: string) => spec.curves.some((c) => c.id === id) || spec.shifts.some((s) => s.id === id);
    if (isLine(p.b)) return `where ${name(p.a)} meets ${name(p.b)}`;
    return `on ${name(p.a)} at ${sym(p.b)}`;
  };
  const byTick = new Map<string, string>();
  for (const p of spec.points) {
    if (p.xTick.trim()) byTick.set(`x:${tickKey(p.xTick)}`, what(p));
    if (p.yTick.trim()) byTick.set(`y:${tickKey(p.yTick)}`, what(p));
  }
  for (const l of spec.levels) byTick.set(`${l.kind === 'quota' ? 'x' : 'y'}:${tickKey(l.label)}`, l.kind === 'quota' ? 'the quota' : 'the fixed price');

  const ticks = (axis: 'x' | 'y') => {
    const found = new Map<string, { at: number; label: string }>();
    for (const p of diagram.points) {
      const label = plainOf(axis === 'x' ? p.xTickLabel : p.yTickLabel).trim();
      if (label && p.dropTo?.includes(axis)) found.set(tickKey(label), { at: axis === 'x' ? p.at.x : p.at.y, label });
    }
    for (const c of diagram.curves) {
      const label = plainOf(c.label).trim();
      if (!label) continue;
      if (axis === 'y' && c.derive?.kind === 'level') found.set(tickKey(label), { at: c.points[0].y, label });
      if (axis === 'x' && c.derive?.kind === 'vertical' && spec.levels.some((l) => tickKey(l.label) === tickKey(label))) found.set(tickKey(label), { at: c.points[0].x, label });
    }
    return [...found.values()].sort((a, b) => a.at - b.at);
  };
  const xs = ticks('x');
  const ys = ticks('y');
  if (xs.length) lines.push(`${x || 'x'} ticks from the origin outward: ${xs.map((t) => `${t.label} (${byTick.get(`x:${tickKey(t.label)}`) ?? 'marked'})`).join(', ')}.`);
  if (ys.length) lines.push(`${y || 'y'} ticks from the bottom up: ${ys.map((t) => `${t.label} (${byTick.get(`y:${tickKey(t.label)}`) ?? 'marked'})`).join(', ')}.`);

  // Market crossings no tick marks: where they sit against the ticks decides many questions.
  const editor = new Map<string, DiagramCurve>();
  for (const c of diagram.curves) editor.set(plainOf(c.label).trim(), c);
  const ids = [...spec.curves.map((c) => ({ id: c.id, role: c.role })), ...spec.shifts.map((s) => ({ id: s.id, role: spec.curves.find((c) => c.id === rootOf(spec, s.id))?.role }))];
  const demands = ids.filter((c) => c.role && DEMAND_LIKE.has(c.role));
  const supplies = ids.filter((c) => c.role && SUPPLY_LIKE.has(c.role));
  const marked = new Set(spec.points.flatMap((p) => [`${p.a}|${p.b}`, `${p.b}|${p.a}`]));
  const between = (list: Array<{ at: number; label: string }>, at: number, low: string, high: string) => {
    if (!list.length) return '';
    const below = list.filter((t) => t.at < at - 0.01).pop();
    const above = list.find((t) => t.at > at + 0.01);
    const same = list.find((t) => Math.abs(t.at - at) <= 0.01);
    if (same) return `at ${same.label}`;
    if (below && above) return `between ${below.label} and ${above.label}`;
    return below ? `${high} ${below.label}` : `${low} ${above!.label}`;
  };
  for (const d of demands) {
    for (const s of supplies) {
      if (marked.has(`${d.id}|${s.id}`)) continue;
      const dc = editor.get(name(d.id));
      const sc = editor.get(name(s.id));
      const hit = dc && sc ? curveCrossing(dc, sc) : null;
      if (!hit) continue;
      const parts = [between(ys, hit.y, 'below', 'above'), between(xs, hit.x, 'left of', 'right of')].filter(Boolean);
      lines.push(`${name(d.id)} and ${name(s.id)} cross (not marked)${parts.length ? ` ${parts.join(', ')}` : ''}.`);
    }
  }
  for (const m of spec.marks) lines.push(`Point ${m.label}: ${m.where} ${name(m.of)}.`);
  return lines.join('\n');
}

function rootOf(spec: DiagramSpec, id: string): string {
  let at = id;
  for (let i = 0; i < 10; i += 1) {
    const s = spec.shifts.find((k) => k.id === at);
    if (!s) return at;
    at = s.of;
  }
  return at;
}
