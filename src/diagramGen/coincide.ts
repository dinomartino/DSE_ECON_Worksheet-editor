import type { Diagram, DiagramCurve, DiagramPlace, DiagramPoint } from '@/model/diagram';
import { getDiagramTemplate } from '@/model/diagramTemplates';
import { labelBase, plainOf, symbol } from './text';
import type { DiagramIssue, DiagramSpec } from './types';

/**
 * Things drawn on one spot (k-0586, audit k-0583 task A2). Seven specs compiled "ok" and drew a
 * wrong figure; six had one cause: two things the question tells apart printed on top of each
 * other, so the reader sees one. Two shortage brackets on one price line, two `on` marks at one
 * point, two tax lines of one shape whose place and slope the shape ignores, two Lorenz bows,
 * a data template (`flow`, `pie`) that draws another question's content. Each is an `error`, so
 * the repair turn runs and is told what to use instead. The seventh, an improvised MR, is here
 * too: kind curves cannot derive MR from demand.
 *
 * Read on the compiled diagram, so it covers whatever route drew it. Scenes and Lorenz boxes are
 * laid out by code and checked by their own checks.
 */

/** Two lines closer than this everywhere they both run (unit space) print as one. */
const SAME_LINE = 0.025;
/** Two marks closer than this print as one dot or one letter on another. */
const SAME_SPOT = 0.03;

type XY = { x: number; y: number };

function toSegment(p: XY, a: XY, b: XY): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Points along a polyline, evenly by length. */
function samples(points: readonly XY[], n = 24): XY[] {
  if (points.length < 2) return [...points];
  const lens = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const total = lens.reduce((t, l) => t + l, 0) || 1;
  const out: XY[] = [];
  for (let k = 0; k <= n; k += 1) {
    let d = (total * k) / n;
    let i = 0;
    while (i < lens.length - 1 && d > lens[i]) d -= lens[i++];
    const f = lens[i] ? Math.min(1, d / lens[i]) : 0;
    out.push({ x: points[i].x + (points[i + 1].x - points[i].x) * f, y: points[i].y + (points[i + 1].y - points[i].y) * f });
  }
  return out;
}

function toLine(p: XY, line: readonly XY[]): number {
  let best = Infinity;
  for (let i = 1; i < line.length; i += 1) best = Math.min(best, toSegment(p, line[i - 1], line[i]));
  return best;
}

/** True when every sample of each line lies on the other: one printed line. */
export function sameLine(a: DiagramCurve, b: DiagramCurve): boolean {
  if (a.points.length < 2 || b.points.length < 2) return false;
  return samples(a.points).every((p) => toLine(p, b.points) < SAME_LINE) && samples(b.points).every((p) => toLine(p, a.points) < SAME_LINE);
}

const nameOf = (c: DiagramCurve, i: number) => plainOf(c.label).trim() || `line ${i + 1}`;

/** Where a span's end sits: a point it names, or its own coordinates. */
function placeOf(diagram: Diagram, place: DiagramPlace): XY | null {
  if ('point' in place && typeof place.point === 'string') return diagram.points.find((p) => p.id === place.point)?.at ?? null;
  if ('x' in place && typeof (place as DiagramPoint).x === 'number' && 'y' in place && typeof (place as DiagramPoint).y === 'number') return place as DiagramPoint;
  return null;
}

/** Templates the model may not name: data figures hold another question's content. */
function templateIssues(spec: DiagramSpec): DiagramIssue[] {
  if (spec.kind !== 'template') return [];
  const template = getDiagramTemplate(spec.template);
  if (!template || template.group !== 'data') return [];
  const instead =
    spec.template === 'pie'
      ? 'Draw it with kind "chart", type "pie", the question\'s own slices and shares.'
      : spec.template === 'bar-chart' || spec.template === 'line-chart'
        ? 'Draw it with kind "chart" and the question\'s own figures.'
        : 'No kind draws this figure with the question\'s own content yet: say so in "reason" and use kind "none".';
  return [
    {
      level: 'error',
      code: 'template.data',
      text: `The template "${spec.template}" is a data figure: it draws a stock example (another question's boxes, slices or words), not this question's. ${instead}`,
    },
  ];
}

/** Curves a firm's figure needs that kind curves cannot draw right (MR is derived from demand, not a free line). */
const FIRM_CURVES = new Set(['MR', 'AR']);

export function checkCoincide(spec: DiagramSpec, diagram: Diagram | null): DiagramIssue[] {
  const issues: DiagramIssue[] = [...templateIssues(spec)];
  if (!diagram || spec.kind !== 'curves') return issues;
  const error = (code: string, text: string) => issues.push({ level: 'error', code, text });

  // Two lines on one spot.
  const curves = diagram.curves;
  const lines: string[] = [];
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      if (sameLine(curves[i], curves[j])) lines.push(`"${nameOf(curves[i], i)}" and "${nameOf(curves[j], j)}"`);
    }
  }
  if (lines.length) {
    const graphs = spec.curves.filter((c) => c.role === 'graph');
    const brokenPair = graphs.length >= 2 && graphs.some((c) => c.shape && /Then|Rising|Flat/.test(c.shape) && c.shape !== 'flat');
    const hint = brokenPair
      ? ' A graph line of a shape ignores place and slope: give two tax lines of one broken shape a different start (where the allowance ends) or cap (how high the cap sits).'
      : graphs.length >= 2
        ? ' A graph line of a shape ignores place and slope: give the lines different shapes, or draw Lorenz curves with kind "lorenz".'
        : ' Give each line its own place, slope or shift.';
    error('same.line', `${lines.join(', ')} are drawn on the same spot, so the figure shows one line where the question has two.${hint}`);
  }

  // Two marked points on one spot whose printed names differ.
  const shown = (p: Diagram['points'][number]) => [plainOf(p.label), plainOf(p.xTickLabel), plainOf(p.yTickLabel)].map((t) => t.trim()).filter(Boolean);
  const stacked: string[] = [];
  const pts = diagram.points;
  for (let i = 0; i < pts.length; i += 1) {
    for (let j = i + 1; j < pts.length; j += 1) {
      if (Math.hypot(pts[i].at.x - pts[j].at.x, pts[i].at.y - pts[j].at.y) >= SAME_SPOT) continue;
      const [a, b] = [shown(pts[i]), shown(pts[j])];
      if (!a.length || !b.length || a.join('|') === b.join('|')) continue;
      stacked.push(`${a[0]} and ${b[0]}`);
    }
  }
  if (stacked.length) {
    const marks = spec.marks.filter((m) => m.where === 'on');
    const hint =
      marks.length >= 2
        ? ' Two lettered points on one curve (a movement along it) are two guide levels (kind "fixed", style "guide", label "" unless the question names the prices), one side "above" and one side "below", and a point on the curve at each, named as the question names them.'
        : ' Place each point where the question puts it.';
    error('same.spot', `${stacked.join(', ')} are marked on the same spot.${hint}`);
  }

  // Two brackets on one spot.
  const spans = diagram.spans ?? [];
  const ends = spans.map((s) => ({ s, from: placeOf(diagram, s.from), to: placeOf(diagram, s.to) }));
  const brackets: string[] = [];
  for (let i = 0; i < ends.length; i += 1) {
    for (let j = i + 1; j < ends.length; j += 1) {
      const [a, b] = [ends[i], ends[j]];
      if (!a.from || !a.to || !b.from || !b.to || a.s.style !== b.s.style || (a.s.along ?? '') !== (b.s.along ?? '')) continue;
      const near = (p: XY, q: XY) => Math.hypot(p.x - q.x, p.y - q.y) < SAME_SPOT;
      if ((near(a.from, b.from) && near(a.to, b.to)) || (near(a.from, b.to) && near(a.to, b.from))) {
        const label = (s: typeof a.s) => plainOf(s.label).trim() || s.style;
        brackets.push(`"${label(a.s)}" and "${label(b.s)}"`);
      }
    }
  }
  if (brackets.length) {
    error(
      'same.bracket',
      `${brackets.join(', ')} are drawn as one bracket on the same spot. A gap is always between the first demand and supply curves at its price line; a second shortage or surplus (after a shift) is a bracket between its own two ticks: mark the two points (xTick Q_s, Q_d1) and add {from, to, label} to "brackets".`,
    );
  }

  // An improvised MR: a free line labelled MR is not the marginal revenue of the demand drawn.
  const firm = spec.curves.filter((c) => FIRM_CURVES.has(labelBase(symbol(c.label)).toUpperCase()));
  if (firm.length) {
    error(
      'curves.firm',
      `${firm.map((c) => `"${c.label}"`).join(', ')} cannot be drawn with kind "curves": marginal revenue is worked out from demand, not drawn as a free line. A monopoly figure is one of the monopoly templates.`,
    );
  }
  return issues;
}

