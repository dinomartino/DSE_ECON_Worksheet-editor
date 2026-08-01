import {
  clampPoint,
  type Diagram,
  type DiagramArrow,
  type DiagramCurve,
  type DiagramLabel,
  type DiagramPoint,
  type DiagramPointMark,
} from './diagram';
import type { BiText } from './types';

/**
 * Direct manipulation of diagram geometry (§7.5).
 *
 * The drawing canvas needs two things that have nothing to do with React: "what is
 * under the pointer" and "what does the diagram look like once this handle moves
 * there". Both are pure functions over unit-space geometry, so they live here rather
 * than in the component — that is what lets a drag be unit-tested without a DOM, and it
 * keeps the canvas a thin layer that converts pixels to unit space and calls in.
 *
 * Every result goes through `clampPoint`, so no gesture can push geometry outside the
 * unit square where the renderer would silently clip it.
 */

/**
 * A grab-able piece of the diagram, addressed by **id** rather than by array index.
 *
 * Index would be wrong the moment a drag reorders nothing but the caller re-renders
 * from a patched diagram: ids survive the round trip, indices do not. `vertex` is the
 * one place an index appears, because a curve's points genuinely have no ids — they
 * are positions in a polyline, not entities.
 */
export type DiagramHandle =
  | { kind: 'vertex'; curveId: string; index: number }
  | { kind: 'curve'; curveId: string }
  | { kind: 'point'; pointId: string }
  | { kind: 'label'; labelId: string }
  | { kind: 'arrowFrom'; arrowId: string }
  | { kind: 'arrowTo'; arrowId: string }
  | { kind: 'arrow'; arrowId: string }
  // --- Anchored text. Each drags its own offset from whatever it belongs to, never an
  // absolute position, so moving the anchor carries the text with it (§7.5).
  | { kind: 'curveLabel'; curveId: string }
  | { kind: 'pointLabel'; pointId: string }
  | { kind: 'arrowLabel'; arrowId: string }
  | { kind: 'pointTick'; pointId: string; axis: 'x' | 'y' }
  | { kind: 'axisTick'; axis: 'x' | 'y'; tickId: string }
  | { kind: 'axisTitle'; axis: 'x' | 'y' }
  | { kind: 'diagramTitle' };

/** Do these two handles address the same thing? */
export function sameHandle(a: DiagramHandle | null, b: DiagramHandle | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'vertex') return handleId(a) === handleId(b) && a.index === (b as typeof a).index;
  // A point's two tick labels share the point's id, so the axis is part of the address.
  if (a.kind === 'pointTick') return handleId(a) === handleId(b) && a.axis === (b as typeof a).axis;
  return handleId(a) === handleId(b);
}

/**
 * Does this handle address a whole element rather than one precise part of it?
 *
 * The distinction matters when deciding whether a press landed on something already
 * selected. Two *body* handles for one id are the same grab, but a `vertex` of a
 * selected curve is not the curve: treating them as equal made clicking an endpoint
 * drag the entire line, which is precisely the handle-beats-body rule `hitTest` exists
 * to enforce.
 */
export function isBody(handle: DiagramHandle): boolean {
  return handle.kind === 'curve' || handle.kind === 'arrow';
}

/**
 * The CSS cursor for whatever is under the pointer.
 *
 * Two grabs on the same curve do very different things — an endpoint reshapes the line,
 * the body slides all of it — and they used to look identical, so the only way to find
 * out which one you had was to make the edit and undo it. The cursor says it up front:
 *
 * - **body** (a whole curve or arrow, or any multi-selection) → `grab` / `grabbing`,
 *   the universal "pick this up and put it somewhere" pointer;
 * - **endpoint or vertex** → a directional resize arrow, oriented along the segment it
 *   will stretch, because that gesture changes the line's shape rather than its position;
 * - **a point or label** → `move`, which has no single axis to point along;
 * - **a tick label**, which slides along its own axis only → that axis's arrow, so the
 *   constraint is visible before the drag rather than discovered during it.
 *
 * The resize arrow is picked from the four the platform actually ships (`ns`, `ew`,
 * `nwse`, `nesw`) by bucketing the segment's angle into 45° quadrants — CSS has no
 * free-rotation cursor, and the nearest of four reads correctly on a diagram whose lines
 * are mostly diagonal or axis-parallel anyway.
 */
export function cursorFor(
  diagram: Diagram,
  handle: DiagramHandle,
  group: boolean,
  active: boolean,
): string {
  // A group has no single axis to reshape along, so it is always a move.
  if (group || isBody(handle)) return active ? 'grabbing' : 'grab';

  // Ticks are constrained to their axis, so the cursor advertises the one direction the
  // drag can actually go.
  if (handle.kind === 'pointTick' || handle.kind === 'axisTick') {
    return handle.axis === 'x' ? 'ew-resize' : 'ns-resize';
  }

  const segment = segmentAt(diagram, handle);
  if (!segment) return 'move';

  // The cursor names are screen-oriented ("nwse" is the ↘ diagonal as displayed), and
  // screen y grows downward while unit y grows upward — so the rise is negated once,
  // here, to put the angle in screen space before it is bucketed. Negating and then
  // reading the buckets as unit-space would swap the two diagonals, which is invisible
  // on an axis-parallel line and wrong on every supply curve.
  const angle = Math.atan2(-(segment.b.y - segment.a.y), segment.b.x - segment.a.x);
  const deg = ((angle * 180) / Math.PI + 180) % 180;
  if (deg < 22.5 || deg >= 157.5) return 'ew-resize';
  if (deg < 67.5) return 'nwse-resize';
  if (deg < 112.5) return 'ns-resize';
  return 'nesw-resize';
}

/** The segment an endpoint handle would stretch, or null if it has no direction. */
function segmentAt(
  diagram: Diagram,
  handle: DiagramHandle,
): { a: DiagramPoint; b: DiagramPoint } | null {
  if (handle.kind === 'vertex') {
    const curve = diagram.curves.find((c) => c.id === handle.curveId);
    if (!curve || curve.points.length < 2) return null;
    // An interior vertex belongs to two segments; the one *before* it is as good a
    // direction as the one after, and choosing consistently keeps the cursor stable as
    // the pointer crosses the handle.
    const i = handle.index;
    const other = i === 0 ? curve.points[1] : curve.points[i - 1];
    return { a: other, b: curve.points[i] };
  }
  if (handle.kind === 'arrowFrom' || handle.kind === 'arrowTo') {
    const arrow = diagram.arrows.find((a) => a.id === handle.arrowId);
    if (!arrow) return null;
    return { a: arrow.from, b: arrow.to };
  }
  return null;
}

/**
 * The id of whatever element a handle belongs to.
 *
 * A label handle returns its **anchor's** id, not an id of its own: a curve's label is
 * part of that curve, so deleting or copying by handle reaches the right thing without
 * every caller learning about text separately.
 */
export function handleId(handle: DiagramHandle): string {
  switch (handle.kind) {
    case 'vertex':
    case 'curve':
    case 'curveLabel':
      return handle.curveId;
    case 'point':
    case 'pointLabel':
    case 'pointTick':
      return handle.pointId;
    case 'label':
      return handle.labelId;
    case 'axisTick':
      return handle.tickId;
    // The axes and the caption are singletons, so the kind is the whole address.
    case 'axisTitle':
      return `axis-${handle.axis}`;
    case 'diagramTitle':
      return 'diagram-title';
    default:
      return handle.arrowId;
  }
}

/**
 * One piece of anchored text, at the unit-space position it is actually drawn.
 *
 * The canvas builds these from the render's own anchor functions, so hit-testing and
 * drawing agree by construction rather than by two modules happening to compute the
 * same thing.
 */
export interface LabelAnchor {
  handle: DiagramHandle;
  at: DiagramPoint;
  /**
   * The box the text actually occupies, in unit space, if the caller could measure it.
   *
   * `at` is a *drawing* anchor — a baseline, sitting at the start, middle or end of the
   * text depending on how that piece is anchored — so it is nowhere near the centre of
   * the word for most labels. Hit-testing on distance to `at` alone therefore made a
   * long caption reachable only near one edge and a baseline below the letters: you
   * could see the words and not click them.
   *
   * Optional because the anchors remain useful without it (a marquee still catches by
   * position, and the drag rings are drawn at `at`). When present, `hitTest` treats a
   * click anywhere inside the box as a hit on the text.
   */
  box?: { x0: number; y0: number; x1: number; y1: number };
}

const dist = (a: DiagramPoint, b: DiagramPoint) => Math.hypot(a.x - b.x, a.y - b.y);

/** Is a point inside a label's drawn box? */
const withinBox = (p: DiagramPoint, box: NonNullable<LabelAnchor['box']>) =>
  p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;

/** Shortest distance from `p` to the segment `a`–`b`, in unit space. */
function distanceToSegment(p: DiagramPoint, a: DiagramPoint, b: DiagramPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return dist(p, a);
  // Projection parameter, clamped so a point beyond an end measures to that end.
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/**
 * What is at `at`, or null.
 *
 * `tolerance` is a unit-space radius the caller derives from a pixel radius, so the
 * grab area is the same physical size whatever the diagram is scaled to.
 *
 * Search order is deliberate and is the difference between a canvas that feels precise
 * and one that fights back: **vertices and endpoints beat whole bodies**, so grabbing
 * the end of a curve moves that end rather than sliding the entire curve; and among
 * bodies, later-drawn elements win, matching what is visually on top.
 */
export function hitTest(
  diagram: Diagram,
  at: DiagramPoint,
  tolerance: number,
  /**
   * Where every piece of anchored text sits, in unit space.
   *
   * Passed in rather than computed because a label's position is decided by the
   * *renderer* — it depends on font size, the plot padding and the language being
   * shown, none of which this pure module can see. `labelAnchors` in the canvas derives
   * it from the very projection `diagramSvg` uses, which is what keeps a label grabbable
   * exactly where it is drawn (§7.5).
   */
  labels: LabelAnchor[] = [],
): DiagramHandle | null {
  let best: { handle: DiagramHandle; d: number } | null = null;
  const consider = (handle: DiagramHandle, d: number) => {
    if (d > tolerance) return;
    if (!best || d < best.d) best = { handle, d };
  };

  // --- Pass 1: precise targets — anchored text and draggable points. ---
  // Text is considered alongside vertices rather than after them, competing on distance,
  // so the nearer of a curve's endpoint and its name wins. Both then beat whole bodies,
  // which is what makes a label grabbable at all: a curve's name is drawn right beside
  // the line it names, and losing to that line would leave it unreachable.
  for (const label of labels) {
    // Inside the drawn box counts as a direct hit — distance zero — so clicking the
    // middle of a word beats a vertex that happens to be nearer the text's baseline
    // anchor. Without this the anchor's position alone decided, and for `end`-anchored
    // or centred text that point is not where the words are.
    if (label.box && withinBox(at, label.box)) consider(label.handle, 0);
    else consider(label.handle, dist(at, label.at));
  }
  for (const curve of diagram.curves) {
    curve.points.forEach((point, index) => {
      consider({ kind: 'vertex', curveId: curve.id, index }, dist(at, point));
    });
  }
  for (const mark of diagram.points) {
    consider({ kind: 'point', pointId: mark.id }, dist(at, mark.at));
  }
  for (const arrow of diagram.arrows) {
    consider({ kind: 'arrowFrom', arrowId: arrow.id }, dist(at, arrow.from));
    consider({ kind: 'arrowTo', arrowId: arrow.id }, dist(at, arrow.to));
  }
  for (const label of diagram.labels) {
    consider({ kind: 'label', labelId: label.id }, dist(at, label.at));
  }
  if (best) return (best as { handle: DiagramHandle }).handle;

  // --- Pass 2: bodies. Topmost (last drawn) wins, so iterate in reverse. ---
  for (let i = diagram.arrows.length - 1; i >= 0; i -= 1) {
    const arrow = diagram.arrows[i];
    if (distanceToSegment(at, arrow.from, arrow.to) <= tolerance) {
      return { kind: 'arrow', arrowId: arrow.id };
    }
  }
  for (let i = diagram.curves.length - 1; i >= 0; i -= 1) {
    const curve = diagram.curves[i];
    for (let s = 0; s < curve.points.length - 1; s += 1) {
      if (distanceToSegment(at, curve.points[s], curve.points[s + 1]) <= tolerance) {
        return { kind: 'curve', curveId: curve.id };
      }
    }
  }
  return null;
}

const mapById = <T extends { id: string }>(items: T[], id: string, patch: (item: T) => T): T[] =>
  items.map((item) => (item.id === id ? patch(item) : item));

/** Translate every point of a polyline by a delta, clamped. */
const shift = (points: DiagramPoint[], dx: number, dy: number): DiagramPoint[] =>
  points.map((p) => clampPoint({ x: p.x + dx, y: p.y + dy }));

/**
 * Apply a drag to the diagram.
 *
 * `from` and `to` are the pointer's unit-space positions at grab time and now; the
 * delta between them is what a *body* drag uses, while a handle drag simply moves the
 * handle to `to`. Both are computed against the **original** diagram passed in, so the
 * caller can re-apply the same gesture from the pre-drag geometry on every pointer move
 * and get no accumulated drift.
 */
export function applyDrag(
  diagram: Diagram,
  handle: DiagramHandle,
  from: DiagramPoint,
  to: DiagramPoint,
): Diagram {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const target = clampPoint(to);

  switch (handle.kind) {
    case 'vertex':
      return {
        ...diagram,
        curves: mapById(diagram.curves, handle.curveId, (curve) => ({
          ...curve,
          points: curve.points.map((p, i) => (i === handle.index ? target : p)),
        })),
      };
    case 'curve':
      return {
        ...diagram,
        curves: mapById(diagram.curves, handle.curveId, (curve) => ({
          ...curve,
          points: shift(curve.points, dx, dy),
        })),
      };
    case 'point':
      return {
        ...diagram,
        points: mapById(diagram.points, handle.pointId, (mark) => ({ ...mark, at: target })),
      };
    case 'label':
      return {
        ...diagram,
        labels: mapById(diagram.labels, handle.labelId, (label) => ({ ...label, at: target })),
      };
    case 'arrowFrom':
      return {
        ...diagram,
        arrows: mapById(diagram.arrows, handle.arrowId, (arrow) => ({ ...arrow, from: target })),
      };
    case 'arrowTo':
      return {
        ...diagram,
        arrows: mapById(diagram.arrows, handle.arrowId, (arrow) => ({ ...arrow, to: target })),
      };
    case 'arrow':
      return {
        ...diagram,
        arrows: mapById(diagram.arrows, handle.arrowId, (arrow) => {
          const [start, end] = shift([arrow.from, arrow.to], dx, dy);
          return { ...arrow, from: start, to: end };
        }),
      };

    // --- Anchored text. Every one of these accumulates the pointer *delta* onto its own
    // offset rather than snapping to `to`: the text is positioned relative to an anchor
    // that itself sits at an arbitrary place, so an absolute drop would teleport the
    // label to the pointer on the first pixel of the drag. Offsets are deliberately not
    // clamped to the unit square — a curve label legitimately sits outside the plot, in
    // the padding reserved for it.
    case 'curveLabel':
      return {
        ...diagram,
        curves: mapById(diagram.curves, handle.curveId, (curve) => ({
          ...curve,
          labelOffset: nudge(curve.labelOffset, dx, dy),
        })),
      };
    case 'pointLabel':
      return {
        ...diagram,
        points: mapById(diagram.points, handle.pointId, (mark) => ({
          ...mark,
          // The first drag of a slot-positioned label starts from where that slot put
          // it, so the label does not jump to the dot as the gesture begins.
          labelOffset: nudge(mark.labelOffset ?? sideSeed(mark.labelSide), dx, dy),
        })),
      };
    case 'arrowLabel':
      return {
        ...diagram,
        arrows: mapById(diagram.arrows, handle.arrowId, (arrow) => ({
          ...arrow,
          labelOffset: nudge(arrow.labelOffset, dx, dy),
        })),
      };
    case 'pointTick':
      return {
        ...diagram,
        points: mapById(diagram.points, handle.pointId, (mark) =>
          handle.axis === 'x'
            ? { ...mark, xTickOffset: (mark.xTickOffset ?? 0) + dx }
            : { ...mark, yTickOffset: (mark.yTickOffset ?? 0) + dy },
        ),
      };
    case 'axisTick': {
      const axis = diagram[handle.axis];
      const along = handle.axis === 'x' ? dx : dy;
      return {
        ...diagram,
        [handle.axis]: {
          ...axis,
          ticks: (axis.ticks ?? []).map((tick) =>
            tick.id === handle.tickId ? { ...tick, offset: (tick.offset ?? 0) + along } : tick,
          ),
        },
      };
    }
    case 'axisTitle':
      return {
        ...diagram,
        [handle.axis]: {
          ...diagram[handle.axis],
          titleOffset: nudge(diagram[handle.axis].titleOffset, dx, dy),
        },
      };
    // `diagramTitle` is deliberately absent: the title is edited in the sidebar and
    // auto-placed, so there is no handle on the canvas to drag (§the title is sidebar-only).
  }
  return diagram;
}

/** Accumulate a pointer delta onto an optional offset. */
const nudge = (offset: DiagramPoint | undefined, dx: number, dy: number): DiagramPoint => ({
  x: (offset?.x ?? 0) + dx,
  y: (offset?.y ?? 0) + dy,
});

/**
 * The offset a compass slot is already worth, so the first drag of a never-dragged point
 * label continues from where it is drawn rather than snapping back to the dot.
 *
 * Approximate on purpose: the renderer's slot gap is in pixels and this is unit space,
 * with no plot size in scope. A small constant is enough — the drag delta dominates
 * immediately, and the only thing this prevents is a visible jump on the first frame.
 */
function sideSeed(side: DiagramPointMark['labelSide']): DiagramPoint | undefined {
  if (!side) return undefined;
  const step = 0.02;
  const x = side.includes('Right') || side === 'right' ? step : side.includes('Left') || side === 'left' ? -step : 0;
  const y = side.startsWith('up') ? step : side.startsWith('down') ? -step : 0;
  return { x, y };
}

/**
 * The text a handle addresses, or null if it addresses geometry rather than writing.
 *
 * This and `setHandleText` are the one place that knows which field of which element a
 * given piece of text lives in. The canvas edits text in place by asking here, so the
 * editor cannot open on a label whose value it would then write somewhere else — and a
 * handle kind added later that forgets to appear in both simply has no editor, rather
 * than silently editing the wrong thing.
 *
 * Note this deliberately answers for **text handles only**. A `curve` handle addresses
 * the line, not its name: the two are separately selectable and separately draggable, so
 * folding them together here would make double-clicking a line retype its label.
 */
export function handleText(diagram: Diagram, handle: DiagramHandle): BiText | null {
  switch (handle.kind) {
    case 'curveLabel':
      return diagram.curves.find((c) => c.id === handle.curveId)?.label ?? emptyText();
    case 'pointLabel':
      return diagram.points.find((p) => p.id === handle.pointId)?.label ?? emptyText();
    case 'arrowLabel':
      return diagram.arrows.find((a) => a.id === handle.arrowId)?.label ?? emptyText();
    case 'label':
      return diagram.labels.find((l) => l.id === handle.labelId)?.text ?? emptyText();
    case 'pointTick': {
      const mark = diagram.points.find((p) => p.id === handle.pointId);
      if (!mark) return null;
      return (handle.axis === 'x' ? mark.xTickLabel : mark.yTickLabel) ?? emptyText();
    }
    case 'axisTick':
      return (diagram[handle.axis].ticks ?? []).find((t) => t.id === handle.tickId)?.label ?? null;
    case 'axisTitle':
      return diagram[handle.axis].title ?? emptyText();
    case 'diagramTitle':
      return diagram.title ?? emptyText();
    default:
      return null;
  }
}

/** Can this handle's text be edited in place? */
export function isTextHandle(handle: DiagramHandle): boolean {
  return (
    handle.kind === 'curveLabel' ||
    handle.kind === 'pointLabel' ||
    handle.kind === 'arrowLabel' ||
    handle.kind === 'label' ||
    handle.kind === 'pointTick' ||
    handle.kind === 'axisTick' ||
    handle.kind === 'axisTitle' ||
    handle.kind === 'diagramTitle'
  );
}

const emptyText = (): BiText => ({ en: [], zh: [] });

/** Write a handle's text back. The mirror of `handleText`; see its note. */
export function setHandleText(diagram: Diagram, handle: DiagramHandle, text: BiText): Diagram {
  switch (handle.kind) {
    case 'curveLabel':
      return {
        ...diagram,
        curves: mapById(diagram.curves, handle.curveId, (c) => ({ ...c, label: text })),
      };
    case 'pointLabel':
      return {
        ...diagram,
        points: mapById(diagram.points, handle.pointId, (p) => ({ ...p, label: text })),
      };
    case 'arrowLabel':
      return {
        ...diagram,
        arrows: mapById(diagram.arrows, handle.arrowId, (a) => ({ ...a, label: text })),
      };
    case 'label':
      return {
        ...diagram,
        labels: mapById(diagram.labels, handle.labelId, (l) => ({ ...l, text })),
      };
    case 'pointTick':
      return {
        ...diagram,
        points: mapById(diagram.points, handle.pointId, (p) =>
          handle.axis === 'x' ? { ...p, xTickLabel: text } : { ...p, yTickLabel: text },
        ),
      };
    case 'axisTick':
      return {
        ...diagram,
        [handle.axis]: {
          ...diagram[handle.axis],
          ticks: (diagram[handle.axis].ticks ?? []).map((t) =>
            t.id === handle.tickId ? { ...t, label: text } : t,
          ),
        },
      };
    case 'axisTitle':
      return { ...diagram, [handle.axis]: { ...diagram[handle.axis], title: text } };
    case 'diagramTitle':
      return { ...diagram, title: text };
    default:
      return diagram;
  }
}

/** Remove whatever a handle addresses. A vertex removal falls back to the whole curve. */
export function deleteHandle(diagram: Diagram, handle: DiagramHandle): Diagram {
  switch (handle.kind) {
    case 'vertex': {
      const curve = diagram.curves.find((c) => c.id === handle.curveId);
      // A line needs two points, so removing the second-to-last takes the curve with it
      // rather than leaving a degenerate one-point "curve" the renderer would skip.
      if (curve && curve.points.length <= 2) {
        return { ...diagram, curves: diagram.curves.filter((c) => c.id !== handle.curveId) };
      }
      return {
        ...diagram,
        curves: mapById(diagram.curves, handle.curveId, (c) => ({
          ...c,
          points: c.points.filter((_, i) => i !== handle.index),
        })),
      };
    }
    case 'curve':
      return { ...diagram, curves: diagram.curves.filter((c) => c.id !== handle.curveId) };
    case 'point':
      return { ...diagram, points: diagram.points.filter((p) => p.id !== handle.pointId) };
    case 'label':
      return { ...diagram, labels: diagram.labels.filter((l) => l.id !== handle.labelId) };

    // --- Anchored text deletes the *text*, never its anchor. Removing a whole supply
    // curve because its "S" was selected would be a destructive surprise; clearing the
    // name is what "delete this label" can only mean.
    case 'curveLabel':
      return {
        ...diagram,
        curves: mapById(diagram.curves, handle.curveId, ({ label, ...rest }) => rest),
      };
    case 'pointLabel':
      return {
        ...diagram,
        // The free offset goes with the text: a later re-label should start from the
        // tidy compass default rather than inheriting a position nothing can be seen at.
        points: mapById(diagram.points, handle.pointId, ({ label, labelOffset, ...rest }) => rest),
      };
    case 'arrowLabel':
      return {
        ...diagram,
        arrows: mapById(diagram.arrows, handle.arrowId, ({ label, labelOffset, ...rest }) => rest),
      };
    case 'pointTick':
      return {
        ...diagram,
        points: mapById(diagram.points, handle.pointId, (mark) => {
          if (handle.axis === 'x') {
            const { xTickLabel, xTickOffset, ...rest } = mark;
            return rest;
          }
          const { yTickLabel, yTickOffset, ...rest } = mark;
          return rest;
        }),
      };
    case 'axisTick':
      return {
        ...diagram,
        [handle.axis]: {
          ...diagram[handle.axis],
          ticks: (diagram[handle.axis].ticks ?? []).filter((t) => t.id !== handle.tickId),
        },
      };
    case 'axisTitle':
      return {
        ...diagram,
        [handle.axis]: (({ title, titleOffset, ...rest }) => rest)(diagram[handle.axis]),
      };
    // The title is not selectable on the canvas — it is edited in the sidebar — so
    // nothing here can be aimed at it, and it is removed by clearing that field.
    case 'diagramTitle':
      return diagram;

    default:
      return { ...diagram, arrows: diagram.arrows.filter((a) => a.id !== handle.arrowId) };
  }
}

/**
 * Insert a vertex into a curve at the segment nearest `at`.
 *
 * This is how a kink gets drawn rather than typed: click the line where the corner
 * should be. The new vertex goes at the click, not at the segment's midpoint, because
 * the whole gesture is "put a corner *here*".
 */
export function insertVertex(diagram: Diagram, curveId: string, at: DiagramPoint): Diagram {
  return {
    ...diagram,
    curves: mapById(diagram.curves, curveId, (curve) => {
      let bestIndex = 0;
      let bestDistance = Infinity;
      for (let i = 0; i < curve.points.length - 1; i += 1) {
        const d = distanceToSegment(at, curve.points[i], curve.points[i + 1]);
        if (d < bestDistance) {
          bestDistance = d;
          bestIndex = i;
        }
      }
      const points = [...curve.points];
      points.splice(bestIndex + 1, 0, clampPoint(at));
      return { ...curve, points };
    }),
  };
}

/**
 * Snap a dragged position to the geometry already on the diagram.
 *
 * DSE diagrams are full of coincidences that are *meant* to be exact — an equilibrium
 * sits exactly on both curves, a shifted curve stays parallel, area letters line up
 * with a price line. Freehand dragging cannot hit those by eye, so the canvas snaps to
 * the intersections of existing curves and to existing marked points when the pointer
 * comes within `tolerance`. Nothing is stored about the snap: it only decides where the
 * point lands, so the geometry stays plain numbers (§7.5).
 */
export function snapPoint(
  diagram: Diagram,
  at: DiagramPoint,
  tolerance: number,
  /** Curve to ignore — the one being dragged should not snap to itself. */
  exceptCurveId?: string,
): DiagramPoint {
  let best: { point: DiagramPoint; d: number } | null = null;
  const consider = (point: DiagramPoint) => {
    const d = dist(at, point);
    if (d <= tolerance && (!best || d < best.d)) best = { point, d };
  };

  for (const mark of diagram.points) consider(mark.at);

  const curves = diagram.curves.filter((c) => c.id !== exceptCurveId);
  for (let i = 0; i < curves.length; i += 1) {
    for (let j = i + 1; j < curves.length; j += 1) {
      for (const crossing of intersections(curves[i], curves[j])) consider(crossing);
    }
  }

  return best ? (best as { point: DiagramPoint }).point : at;
}

/**
 * How near flat a line must be, in **screen** degrees, before the assist straightens it.
 *
 * Small on purpose. A DSE demand curve is often genuinely shallow, and a catch radius
 * wide enough to be effortless is also wide enough to flatten a curve the teacher drew
 * deliberately — a silent edit to geometry they were happy with. 5° catches the wobble
 * in a hand-drawn "horizontal" without reaching any slope that reads as sloped.
 */
export const AXIS_SNAP_DEGREES = 5;

/**
 * Straighten a near-horizontal or near-vertical line, the way a drawing tool does.
 *
 * Papers are full of lines that must be *exactly* flat — a world price, an import quota,
 * a price ceiling — and freehand dragging cannot land on exact. Shift already forces the
 * nearest axis, but that requires knowing the shortcut and deciding *before* the drag;
 * this catches the far commoner case of someone simply drawing what they intended to be
 * horizontal and missing by two degrees.
 *
 * The angle is measured in **screen space, not unit space**. Unit space is square while
 * the plot is drawn wider than tall, so an identical stored slope prints at a different
 * visible angle: judging in unit space would snap lines that look sloped and ignore lines
 * that look flat. `aspect` is the plot's pixel width ÷ height, which the canvas takes
 * from the shared projection.
 *
 * Returns `to` unchanged when the line is not near an axis, so the caller can apply this
 * unconditionally.
 */
export function snapToAxis(
  from: DiagramPoint,
  to: DiagramPoint,
  aspect: number,
  degrees: number = AXIS_SNAP_DEGREES,
): DiagramPoint {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  // A zero-length line has no angle to judge; every direction is equally near.
  if (dx === 0 && dy === 0) return to;

  // Into screen proportions before measuring, then the comparison is a plain angle.
  const sx = dx * aspect;
  const sy = dy;
  const tolerance = Math.tan((degrees * Math.PI) / 180);

  // Nearer horizontal than vertical: flatten y, keep the length the drag actually had.
  if (Math.abs(sy) <= Math.abs(sx) * tolerance) return clampPoint({ x: to.x, y: from.y });
  if (Math.abs(sx) <= Math.abs(sy) * tolerance) return clampPoint({ x: from.x, y: to.y });
  return to;
}

/** Every crossing between two polylines, treating both as straight segment chains. */
function intersections(a: DiagramCurve, b: DiagramCurve): DiagramPoint[] {
  const out: DiagramPoint[] = [];
  for (let i = 0; i < a.points.length - 1; i += 1) {
    for (let j = 0; j < b.points.length - 1; j += 1) {
      const hit = segmentIntersection(a.points[i], a.points[i + 1], b.points[j], b.points[j + 1]);
      if (hit) out.push(hit);
    }
  }
  return out;
}

function segmentIntersection(
  p1: DiagramPoint,
  p2: DiagramPoint,
  p3: DiagramPoint,
  p4: DiagramPoint,
): DiagramPoint | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denominator = d1x * d2y - d1y * d2x;
  if (Math.abs(denominator) < 1e-9) return null; // Parallel or degenerate.

  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denominator;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/**
 * Is there already a marked point at `at`?
 *
 * Snapping makes this reachable in a way freehand never would: aiming a new point at an
 * intersection that is *already* marked lands it exactly on the existing dot, producing
 * a second point stacked pixel-perfectly on the first. It is invisible on screen and in
 * the exported PNG, but it is really in the model — unselectable, undeletable by
 * clicking, and silently duplicated in every later edit. The canvas uses this to select
 * the existing point instead of adding a twin.
 */
export function pointAt(
  diagram: Diagram,
  at: DiagramPoint,
  tolerance = 1e-6,
): DiagramPointMark | undefined {
  return diagram.points.find((mark) => dist(mark.at, at) <= tolerance);
}

/**
 * A rectangle in unit space, as dragged out by a marquee.
 *
 * Stored by its two dragged corners rather than normalised, because a marquee is drawn
 * in whichever direction the pointer moves; `normalizeRect` is what every consumer uses.
 */
export interface DiagramRect {
  from: DiagramPoint;
  to: DiagramPoint;
}

export function normalizeRect(rect: DiagramRect): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.min(rect.from.x, rect.to.x),
    y0: Math.min(rect.from.y, rect.to.y),
    x1: Math.max(rect.from.x, rect.to.x),
    y1: Math.max(rect.from.y, rect.to.y),
  };
}

const inside = (p: DiagramPoint, r: ReturnType<typeof normalizeRect>) =>
  p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;

/**
 * Every element **fully** inside the marquee.
 *
 * Fully, not partially: a curve that merely crosses the box is almost always one the
 * teacher was dragging *around* rather than selecting — the marquee is drawn in the
 * empty space beside a diagram, and a demand curve spanning the whole plot would be
 * caught by every box otherwise. Requiring containment makes the gesture predictable.
 *
 * Returns whole-element handles only. A marquee selects *things*, never one vertex of a
 * curve, so a subsequent drag moves each caught element as a unit.
 */
export function selectWithin(
  diagram: Diagram,
  rect: DiagramRect,
  /** Anchored text, so a box drawn around a label catches the label. */
  labels: LabelAnchor[] = [],
): DiagramHandle[] {
  const r = normalizeRect(rect);
  const handles: DiagramHandle[] = [];
  for (const label of labels) {
    if (inside(label.at, r)) handles.push(label.handle);
  }
  for (const curve of diagram.curves) {
    if (curve.points.every((p) => inside(p, r))) handles.push({ kind: 'curve', curveId: curve.id });
  }
  for (const mark of diagram.points) {
    if (inside(mark.at, r)) handles.push({ kind: 'point', pointId: mark.id });
  }
  for (const label of diagram.labels) {
    if (inside(label.at, r)) handles.push({ kind: 'label', labelId: label.id });
  }
  for (const arrow of diagram.arrows) {
    if (inside(arrow.from, r) && inside(arrow.to, r)) handles.push({ kind: 'arrow', arrowId: arrow.id });
  }
  return handles;
}

/**
 * The geometry a set of handles refers to, detached from the diagram.
 *
 * This is what the clipboard holds. It is plain geometry with the original ids still on
 * it — `pasteInto` re-ids on the way back in, so one copy can be pasted repeatedly
 * without the second paste colliding with the first.
 */
export interface DiagramClip {
  curves: DiagramCurve[];
  points: DiagramPointMark[];
  labels: DiagramLabel[];
  arrows: DiagramArrow[];
}

export function isClipEmpty(clip: DiagramClip | null): boolean {
  if (!clip) return true;
  return (
    clip.curves.length === 0 &&
    clip.points.length === 0 &&
    clip.labels.length === 0 &&
    clip.arrows.length === 0
  );
}

/**
 * Copy the elements a selection addresses.
 *
 * A `vertex` handle copies its **whole curve**: a single point of a polyline is not a
 * thing that can exist on its own, so copying one and pasting it would have to invent a
 * curve around it. Duplicate handles for one element collapse, so selecting both ends of
 * an arrow and copying yields one arrow rather than two.
 */
export function copyHandles(diagram: Diagram, handles: DiagramHandle[]): DiagramClip {
  const curveIds = new Set<string>();
  const pointIds = new Set<string>();
  const labelIds = new Set<string>();
  const arrowIds = new Set<string>();

  for (const handle of handles) {
    switch (handle.kind) {
      // Anchored text copies its whole anchor, for the same reason a `vertex` does: a
      // curve's name is not a thing that can exist without the curve, so pasting one on
      // its own would have to invent a curve to hang it from.
      case 'vertex':
      case 'curve':
      case 'curveLabel':
        curveIds.add(handle.curveId);
        break;
      case 'point':
      case 'pointLabel':
      case 'pointTick':
        pointIds.add(handle.pointId);
        break;
      case 'label':
        labelIds.add(handle.labelId);
        break;
      // The axes and the caption are part of the diagram itself rather than free
      // elements, so there is nothing to copy — a pasted "Price" would have no second
      // axis to belong to, and a pasted caption no second diagram.
      case 'axisTick':
      case 'axisTitle':
      case 'diagramTitle':
        break;
      default:
        arrowIds.add(handle.arrowId);
    }
  }

  return {
    curves: diagram.curves.filter((c) => curveIds.has(c.id)),
    points: diagram.points.filter((p) => pointIds.has(p.id)),
    labels: diagram.labels.filter((l) => labelIds.has(l.id)),
    arrows: diagram.arrows.filter((a) => arrowIds.has(a.id)),
  };
}

/**
 * Paste a clip, offset so the copy is visibly its own object.
 *
 * `offset` nudges everything by a fixed amount in unit space rather than dropping the
 * copy on the original, which would look like nothing happened and leave two elements
 * stacked exactly — the same hazard `pointAt` guards against for snapped points.
 *
 * `mint` supplies fresh ids. It is injected rather than imported so this stays a pure
 * function the tests can drive with a counter instead of nanoid.
 */
export function pasteInto(
  diagram: Diagram,
  clip: DiagramClip,
  mint: () => string,
  offset: DiagramPoint = { x: 0.04, y: -0.04 },
): { diagram: Diagram; handles: DiagramHandle[] } {
  const shiftPoint = (p: DiagramPoint) => clampPoint({ x: p.x + offset.x, y: p.y + offset.y });
  const handles: DiagramHandle[] = [];

  const curves = clip.curves.map((curve) => {
    const id = mint();
    handles.push({ kind: 'curve', curveId: id });
    return { ...curve, id, points: curve.points.map(shiftPoint) };
  });
  const points = clip.points.map((mark) => {
    const id = mint();
    handles.push({ kind: 'point', pointId: id });
    return { ...mark, id, at: shiftPoint(mark.at) };
  });
  const labels = clip.labels.map((label) => {
    const id = mint();
    handles.push({ kind: 'label', labelId: id });
    return { ...label, id, at: shiftPoint(label.at) };
  });
  const arrows = clip.arrows.map((arrow) => {
    const id = mint();
    handles.push({ kind: 'arrow', arrowId: id });
    return { ...arrow, id, from: shiftPoint(arrow.from), to: shiftPoint(arrow.to) };
  });

  return {
    diagram: {
      ...diagram,
      curves: [...diagram.curves, ...curves],
      points: [...diagram.points, ...points],
      labels: [...diagram.labels, ...labels],
      arrows: [...diagram.arrows, ...arrows],
    },
    handles,
  };
}

/**
 * Delete everything a selection addresses.
 *
 * Applied one handle at a time via `deleteHandle`, which is safe because that function
 * addresses elements by id — the array reshuffling of an earlier delete cannot make a
 * later handle point at the wrong element. Vertex handles are the exception and are
 * applied **last, highest index first**, since those genuinely are positional.
 */
export function deleteHandles(diagram: Diagram, handles: DiagramHandle[]): Diagram {
  const vertices = handles.filter((h) => h.kind === 'vertex') as Array<
    Extract<DiagramHandle, { kind: 'vertex' }>
  >;
  const others = handles.filter((h) => h.kind !== 'vertex');

  let next = others.reduce(deleteHandle, diagram);
  for (const vertex of [...vertices].sort((a, b) => b.index - a.index)) {
    next = deleteHandle(next, vertex);
  }
  return next;
}

/** Apply one drag to every handle in a selection, all from the same origin. */
export function dragHandles(
  diagram: Diagram,
  handles: DiagramHandle[],
  from: DiagramPoint,
  to: DiagramPoint,
): Diagram {
  return handles.reduce((current, handle) => applyDrag(current, handle, from, to), diagram);
}

/** Factories for elements the canvas creates by drawing, kept beside the geometry. */
export const drawn = {
  curve: (id: string, from: DiagramPoint, to: DiagramPoint): DiagramCurve => ({
    id,
    points: [clampPoint(from), clampPoint(to)],
    shape: 'straight',
    labelAt: 'end',
  }),
  point: (id: string, at: DiagramPoint): DiagramPointMark => ({
    id,
    at: clampPoint(at),
    labelSide: 'right',
    dot: true,
  }),
  label: (id: string, at: DiagramPoint): DiagramLabel => ({ id, at: clampPoint(at), text: { en: [], zh: [] } }),
  arrow: (id: string, from: DiagramPoint, to: DiagramPoint): DiagramArrow => ({
    id,
    from: clampPoint(from),
    to: clampPoint(to),
  }),
};
