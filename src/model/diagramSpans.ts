import type { Diagram, DiagramPlace, DiagramPoint, DiagramSpan, DiagramSpanStyle } from './diagram';
import { resolvePlace } from './diagramAnchors';

/**
 * Spans: brackets and change arrows between two places, in unit space. The ends
 * resolve through anchors, so a shortage bracket stays between Qs and Qd as the
 * curves move. Pixels (ticks, heads, the label) are `render/diagramSpan.ts`.
 */

/** A new free span's distance off its line: clear of what it measures. */
export const DEFAULT_SPAN_OFFSET = 0.04;

/**
 * How far an axis span's rest position sits outside its axis, in unit space: past the
 * tick labels. Measured by the renderer from its text (`render/diagram.ts:axisSpanClearance`);
 * absent (pure model code), an axis span rests on the axis itself.
 */
export type SpanClearance = (span: DiagramSpan) => number;

export interface SpanGeometry {
  /** The two ends as measured — on the axis when `along` is set. */
  base: [DiagramPoint, DiagramPoint];
  /** The drawn ends: `base` moved along `normal` by the offset (plus the clearance on an axis). */
  ends: [DiagramPoint, DiagramPoint];
  /** Unit normal the offset is measured along (out of the plot for an axis span). */
  normal: DiagramPoint;
  /** The side the span sits on: `normal`, flipped when the total move is negative. */
  side: DiagramPoint;
}

/** The unit normal an offset is measured along: out of the plot on an axis, else left of from→to. */
function spanNormal(span: DiagramSpan, a: DiagramPoint, b: DiagramPoint): DiagramPoint {
  if (span.along === 'x') return { x: 0, y: -1 };
  if (span.along === 'y') return { x: -1, y: 0 };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  return length < 1e-9 ? { x: 0, y: 1 } : { x: -(b.y - a.y) / length, y: (b.x - a.x) / length };
}

/** Where a span is drawn now, or null when an end no longer resolves. */
export function spanGeometry(diagram: Diagram, span: DiagramSpan, clearance?: SpanClearance): SpanGeometry | null {
  const from = resolvePlace(diagram, span.from);
  const to = resolvePlace(diagram, span.to);
  if (!from || !to) return null;
  const project = (p: DiagramPoint): DiagramPoint =>
    span.along === 'x' ? { x: p.x, y: 0 } : span.along === 'y' ? { x: 0, y: p.y } : { x: p.x, y: p.y };
  const a = project(from);
  const b = project(to);
  const normal = spanNormal(span, from, to);
  const offset = (span.offset ?? 0) + (span.along && clearance ? clearance(span) : 0);
  const move = (p: DiagramPoint) => ({ x: p.x + normal.x * offset, y: p.y + normal.y * offset });
  const sign = offset < 0 ? -1 : 1;
  return {
    base: [a, b],
    ends: [move(a), move(b)],
    normal,
    side: { x: normal.x * sign, y: normal.y * sign },
  };
}

/** A span as the canvas creates it: an axis span rests outside its tick labels, a free one just off its line. */
export function newSpan(
  id: string,
  from: DiagramPlace,
  to: DiagramPlace,
  style: DiagramSpanStyle,
  along?: 'x' | 'y',
): DiagramSpan {
  if (along) return { id, from, to, style, along };
  return { id, from, to, style, offset: DEFAULT_SPAN_OFFSET };
}

/**
 * A tax or subsidy wedge: a span from a curve to its `shift` copy, both ends on those
 * curves (`{ on, x }`). Always an arrow from S₀ to S₁, so it points the way S moved.
 */
export function isShiftWedge(diagram: Diagram, span: DiagramSpan): boolean {
  return shiftWedge(diagram, span) !== null;
}

/** `forward` when `to` is the shifted copy of `from`'s curve, `reversed` the other way round. */
export function shiftWedge(diagram: Diagram, span: DiagramSpan): 'forward' | 'reversed' | null {
  const on = (place: DiagramPlace) => ('on' in place && 'x' in place ? place.on : null);
  const a = on(span.from);
  const b = on(span.to);
  if (!a || !b || a === b) return null;
  const shiftOf = (id: string) => {
    const derive = diagram.curves.find((c) => c.id === id)?.derive;
    return derive?.kind === 'shift' ? derive.of : null;
  };
  return shiftOf(b) === a ? 'forward' : shiftOf(a) === b ? 'reversed' : null;
}

/** The offset after a body drag by (dx, dy): the drag's component along the normal. */
export function draggedSpanOffset(diagram: Diagram, span: DiagramSpan, dx: number, dy: number): number {
  const geometry = spanGeometry(diagram, span);
  const normal = geometry?.normal ?? { x: 0, y: 1 };
  return (span.offset ?? 0) + dx * normal.x + dy * normal.y;
}
