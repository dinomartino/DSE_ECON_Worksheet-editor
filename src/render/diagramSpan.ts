import type { Diagram, DiagramSpan } from '@/model/diagram';
import { spanGeometry, type SpanClearance } from '@/model/diagramSpans';
import type { Projection } from './diagram';

/**
 * A span in pixels: the strokes, the arrowheads and the label spot. `diagramSvg` turns
 * this into markup; the canvas reads the label spot from here, so it drags where drawn.
 */

type Pt = { x: number; y: number };

/** End-tick length, and the label's gap from the shaft, px at nominal size. */
export const SPAN_TICK = 5;
export const SPAN_LABEL_GAP = 8;

export interface SpanLayout {
  lines: Array<[Pt, Pt]>;
  /** Solid heads, each on the shaft `from → end`. */
  heads: Array<{ from: Pt; end: Pt }>;
  strokeWidth: number;
  label: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; baseline: 'auto' | 'middle' | 'hanging' };
}

export function spanLayout(
  diagram: Diagram,
  span: DiagramSpan,
  proj: Projection,
  scale: number,
  /** An axis span's rest outside its tick labels: `axisSpanClearance` for this projection. */
  clearance?: SpanClearance,
): SpanLayout | null {
  const geometry = spanGeometry(diagram, span, clearance);
  if (!geometry) return null;
  const spanX = proj.plot.right - proj.plot.left;
  const spanY = proj.plot.bottom - proj.plot.top;
  const a = { x: proj.px(geometry.ends[0].x), y: proj.py(geometry.ends[0].y) };
  const b = { x: proj.px(geometry.ends[1].x), y: proj.py(geometry.ends[1].y) };

  // The offset side on screen, then the shaft's perpendicular pointing that way.
  const sx = geometry.side.x * spanX;
  const sy = -geometry.side.y * spanY;
  const sideLength = Math.hypot(sx, sy) || 1;
  const side = { x: sx / sideLength, y: sy / sideLength };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  let normal = length > 1e-6 ? { x: -(b.y - a.y) / length, y: (b.x - a.x) / length } : side;
  if (normal.x * side.x + normal.y * side.y < 0) normal = { x: -normal.x, y: -normal.y };

  const tick = SPAN_TICK * scale;
  const along = (p: Pt, k: number) => ({ x: p.x + normal.x * k, y: p.y + normal.y * k });
  const lines: Array<[Pt, Pt]> = [[a, b]];
  const heads: SpanLayout['heads'] = [];
  let strokeWidth = 1.8 * scale;
  switch (span.style) {
    case 'bracket':
      // Ticks face away from the offset side, back toward what is measured.
      lines.push([a, along(a, -tick)], [b, along(b, -tick)]);
      strokeWidth = 1.2 * scale;
      break;
    case 'dimension':
      lines.push([along(a, -tick), along(a, tick)], [along(b, -tick), along(b, tick)]);
      strokeWidth = 1 * scale;
      break;
    case 'doubleArrow':
      heads.push({ from: b, end: a }, { from: a, end: b });
      break;
    case 'arrow':
      heads.push({ from: a, end: b });
      break;
  }

  // A span that measures nothing (Q unchanged) draws no strokes, only its label.
  if (length < 0.5 * scale) {
    lines.length = 0;
    heads.length = 0;
  }

  const gap = SPAN_LABEL_GAP * scale;
  const offset = span.labelOffset;
  const x = (a.x + b.x) / 2 + normal.x * gap + (offset ? offset.x * spanX : 0);
  const y = (a.y + b.y) / 2 + normal.y * gap - (offset ? offset.y * spanY : 0);
  const sideways = Math.abs(normal.x) > Math.abs(normal.y);
  return {
    lines,
    heads,
    strokeWidth,
    label: sideways
      ? { x, y, anchor: normal.x > 0 ? 'start' : 'end', baseline: 'middle' }
      : { x, y, anchor: 'middle', baseline: normal.y < 0 ? 'auto' : 'hanging' },
  };
}
