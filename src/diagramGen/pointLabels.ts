import type { Diagram, DiagramPointMark } from '@/model/diagram';
import { DEFAULT_DIAGRAM_SIZE } from '@/model/factories';
import { plain } from '@/model/text';
import { curveLabelAnchor, diagramPlot, diagramSize, plotSpanX, plotSpanY, type Projection } from '@/render/diagram';

/**
 * Where a lettered point's letter goes (k-0577 round 2): beside its own dot, clear of every
 * line (curves, axes, dashed drops, shift arrows), every dot and every other label. The user's
 * u-fbsp figure printed g on S₂, n on an arrow and m on a dot; the renderer's compass slot
 * (`right`) cannot know what runs past. Measured in pixels at the figure's default size, stored
 * as the point's `labelOffset` (unit space), so the letter travels with its dot when a
 * teacher drags it, and the teacher can still drag the letter itself.
 */

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
type Seg = [{ x: number; y: number }, { x: number; y: number }];

const FONT = 10 * (96 / 72);
/** A single letter's box at 10pt, a little generous. */
const LETTER = { w: FONT * 0.62, h: FONT * 0.78 };
/** Air wanted between a letter and anything else, px. */
const AIR = 3.5;
const RADII = [10, 12.5, 15, 18, 22];
const ANGLES = Array.from({ length: 16 }, (_, i) => (i * Math.PI) / 8);

function segBoxDistance([a, b]: Seg, box: Box): number {
  // Inside, or crossing an edge: 0.
  const inside = (p: { x: number; y: number }) => p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
  if (inside(a) || inside(b)) return 0;
  const corners: Array<{ x: number; y: number }> = [
    { x: box.x0, y: box.y0 },
    { x: box.x1, y: box.y0 },
    { x: box.x1, y: box.y1 },
    { x: box.x0, y: box.y1 },
  ];
  const edges: Seg[] = corners.map((c, i) => [c, corners[(i + 1) % 4]]);
  if (edges.some((e) => segmentsCross([a, b], e))) return 0;
  return Math.min(...corners.map((c) => pointSeg(c, a, b)), pointBox(a, box), pointBox(b, box));
}

function segmentsCross([p1, p2]: Seg, [p3, p4]: Seg): boolean {
  const d = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const d1 = d(p3, p4, p1);
  const d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3);
  const d4 = d(p1, p2, p4);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function pointSeg(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function pointBox(p: { x: number; y: number }, box: Box): number {
  const dx = Math.max(box.x0 - p.x, 0, p.x - box.x1);
  const dy = Math.max(box.y0 - p.y, 0, p.y - box.y1);
  return Math.hypot(dx, dy);
}

function boxBox(a: Box, b: Box): number {
  const dx = Math.max(b.x0 - a.x1, 0, a.x0 - b.x1);
  const dy = Math.max(b.y0 - a.y1, 0, a.y0 - b.y1);
  return Math.hypot(dx, dy);
}

const around = (cx: number, cy: number, w: number, h: number): Box => ({ x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2 });

/** The lines and boxes a letter must keep clear of, in pixels. */
function obstacles(diagram: Diagram, proj: Projection, skip: ReadonlySet<string>): { segs: Seg[]; boxes: Box[] } {
  const P = (p: { x: number; y: number }) => ({ x: proj.px(p.x), y: proj.py(p.y) });
  const segs: Seg[] = [];
  const boxes: Box[] = [];
  const { left, right, top, bottom } = proj.plot;
  segs.push([{ x: left, y: bottom }, { x: left, y: top - 14 }], [{ x: left, y: bottom }, { x: right + 14, y: bottom }]);
  for (const c of diagram.curves) {
    for (let i = 1; i < c.points.length; i += 1) segs.push([P(c.points[i - 1]), P(c.points[i])]);
    const text = plain(c.label?.en ?? []) || plain(c.label?.zh ?? []);
    const anchor = text ? curveLabelAnchor(c, proj, 1) : null;
    if (anchor) {
      const w = Math.max(1, text.replace(/[_{}]/g, '').length) * FONT * 0.55;
      const x0 = anchor.anchor === 'start' ? anchor.x : anchor.x - w;
      boxes.push({ x0, y0: anchor.y - FONT * 0.8, x1: x0 + w, y1: anchor.y + FONT * 0.4 });
    }
  }
  for (const p of diagram.points) {
    const at = P(p.at);
    for (const axis of p.dropTo ?? []) segs.push([at, axis === 'x' ? { x: at.x, y: bottom } : { x: left, y: at.y }]);
    if (p.dot !== false) boxes.push(around(at.x, at.y, 8, 8));
    if (p.label && !skip.has(p.id)) {
      const text = plain(p.label.en) || plain(p.label.zh);
      if (text) boxes.push(labelBox(p, proj, text));
    }
  }
  for (const a of diagram.arrows) {
    segs.push([P(a.from), P(a.to)]);
    // The arrowhead is wider than the shaft.
    const tip = P(a.to);
    boxes.push(around(tip.x, tip.y, 10, 10));
  }
  for (const s of diagram.spans ?? []) {
    const from = 'x' in s.from && typeof s.from.x === 'number' ? P(s.from as { x: number; y: number }) : null;
    const to = 'x' in s.to && typeof s.to.x === 'number' ? P(s.to as { x: number; y: number }) : null;
    if (from && to) segs.push([from, to]);
  }
  return { segs, boxes };
}

/** A point label's box where the renderer puts it (`pointLabelAnchor`): a dragged one is centred on its offset. */
function labelBox(p: DiagramPointMark, proj: Projection, text: string): Box {
  const x = proj.px(p.at.x);
  const y = proj.py(p.at.y);
  const w = Math.max(LETTER.w, text.length * FONT * 0.55);
  if (p.labelOffset) return around(x + p.labelOffset.x * plotSpanX(proj), y - p.labelOffset.y * plotSpanY(proj), w, LETTER.h);
  // The compass default, `right`.
  return { x0: x + 7, y0: y - LETTER.h / 2, x1: x + 7 + w, y1: y + LETTER.h / 2 };
}

/**
 * Sets `labelOffset` on each point in `ids` (each a one-letter label): the nearest spot round
 * its dot with `AIR` clear of everything, nearer its own dot than any other lettered dot; when
 * nothing is that clear, the spot with the most room. Points are placed most-crowded first, and
 * each placed letter is an obstacle for the next.
 */
export function placePointLabels(diagram: Diagram, ids: ReadonlySet<string>): Diagram {
  const size = diagramSize(diagram, DEFAULT_DIAGRAM_SIZE.widthPx, 'en');
  const proj = diagramPlot(diagram, { ...size, language: 'en' });
  const { segs, boxes } = obstacles(diagram, proj, ids);
  const targets = diagram.points.filter((p) => ids.has(p.id));
  const dots = targets.map((p) => ({ id: p.id, x: proj.px(p.at.x), y: proj.py(p.at.y) }));
  const placed: Box[] = [];
  const offsets = new Map<string, { x: number; y: number }>();

  const room = (box: Box): number => {
    let best = Infinity;
    for (const s of segs) best = Math.min(best, segBoxDistance(s, box));
    for (const b of [...boxes, ...placed]) best = Math.min(best, boxBox(box, b));
    return best;
  };
  const candidates = (p: DiagramPointMark) => {
    const cx = proj.px(p.at.x);
    const cy = proj.py(p.at.y);
    const out: Array<{ x: number; y: number; r: number; room: number; box: Box }> = [];
    for (const r of RADII) {
      for (const a of ANGLES) {
        const x = cx + r * Math.cos(a);
        const y = cy - r * Math.sin(a);
        const box = around(x, y, LETTER.w, LETTER.h);
        if (box.x0 < proj.plot.left + 2 || box.y1 > proj.plot.bottom - 2 || box.y0 < proj.plot.top - 10 || box.x1 > proj.plot.right + 10) continue;
        // Read as this dot's letter: nearer it than any other lettered dot.
        const own = Math.hypot(x - cx, y - cy);
        if (dots.some((d) => d.id !== p.id && Math.hypot(x - d.x, y - d.y) < own + 2)) continue;
        out.push({ x, y, r, room: room(box), box });
      }
    }
    return out;
  };
  // Most crowded first: the point with the fewest clear spots.
  const order = [...targets].sort((a, b) => candidates(a).filter((c) => c.room >= AIR).length - candidates(b).filter((c) => c.room >= AIR).length);
  for (const p of order) {
    const list = candidates(p);
    if (!list.length) continue;
    const clear = list.filter((c) => c.room >= AIR);
    // The nearest clear spot (then the roomiest); else the roomiest spot of all.
    const pick = clear.length ? clear.sort((a, b) => a.r - b.r || b.room - a.room)[0] : list.sort((a, b) => b.room - a.room || a.r - b.r)[0];
    placed.push(pick.box);
    offsets.set(p.id, { x: (pick.x - proj.px(p.at.x)) / plotSpanX(proj), y: -(pick.y - proj.py(p.at.y)) / plotSpanY(proj) });
  }
  return { ...diagram, points: diagram.points.map((p) => (offsets.has(p.id) ? { ...p, labelOffset: offsets.get(p.id)!, labelSide: undefined } : p)) };
}

/** The room round each lettered point's letter as drawn (px), for tests and the look check. */
export function letterRoom(diagram: Diagram, ids: ReadonlySet<string>): Map<string, number> {
  const size = diagramSize(diagram, DEFAULT_DIAGRAM_SIZE.widthPx, 'en');
  const proj = diagramPlot(diagram, { ...size, language: 'en' });
  const out = new Map<string, number>();
  for (const p of diagram.points) {
    if (!ids.has(p.id) || !p.label) continue;
    const mine = labelBox(p, proj, plain(p.label.en) || plain(p.label.zh));
    const others = obstacles({ ...diagram, points: diagram.points.map((q) => (q.id === p.id ? { ...q, label: undefined } : q)) }, proj, new Set());
    let best = Infinity;
    for (const s of others.segs) best = Math.min(best, segBoxDistance(s, mine));
    for (const b of others.boxes) best = Math.min(best, boxBox(mine, b));
    out.set(p.id, best);
  }
  return out;
}
