import type { BiText } from './types';

/**
 * Economics diagram model.
 *
 * HKDSE papers draw the same handful of shapes over and over: a pair of axes with an
 * arrowhead, two or three straight curves, a marked equilibrium point, dashed lines
 * dropped to the axes, and a shift arrow between an original and a new curve. This
 * models exactly that vocabulary rather than being a general drawing surface — a
 * teacher picks a template and edits its parts, and every part stays *data*, so it can
 * be re-labelled and re-shifted later instead of being frozen into pixels.
 *
 * Geometry uses a **unit coordinate space**: x and y both run 0..1 with the origin at
 * the bottom-left, independent of the rendered pixel size. That is what lets the same
 * diagram render as a crisp SVG in the preview and as a high-resolution PNG in the
 * .docx without any of the stored numbers changing (§7.5).
 */

/** A point in unit space: x and y in 0..1, origin bottom-left. */
export interface DiagramPoint {
  x: number;
  y: number;
}

/**
 * How a curve is drawn between its points.
 *
 * `straight` covers the overwhelming majority of DSE curves (AD, SRAS, linear supply
 * and demand). `curved` fits a smooth spline through the points, for the few genuinely
 * non-linear shapes. A kinked supply curve — the import-quota diagrams — is just a
 * `straight` curve with three or more points, which is why there is no separate kind.
 */
export type DiagramCurveShape = 'straight' | 'curved';

export type DiagramStroke = 'solid' | 'dashed';

/**
 * One labelled line on the diagram.
 *
 * The label is a `BiText` like everything else user-visible, and it is positioned
 * *relative to the curve's own end* rather than at an absolute point, so re-dragging a
 * curve carries its label along instead of stranding it.
 */
export interface DiagramCurve {
  id: string;
  /** Two or more points in unit space, in draw order. */
  points: DiagramPoint[];
  shape: DiagramCurveShape;
  stroke?: DiagramStroke;
  /** Curve name printed at the anchor end: "AD", "SRAS", "S₁", "M_d0". */
  label?: BiText;
  /** Which end of the curve the label sits at. */
  labelAt?: 'start' | 'end';
  /** Nudge for the label, in unit space, from the anchor end. */
  labelOffset?: DiagramPoint;
  /** Line weight multiplier; 1 is the diagram's default weight. */
  weight?: number;
}

/**
 * A marked point, e.g. an equilibrium "E₀".
 *
 * `dropTo` is what draws the dashed lines down to the axes that nearly every DSE
 * diagram uses to mark Q₁ and P₁ — they are a property of the point rather than
 * free-standing lines, so moving the point moves them.
 */
export interface DiagramPointMark {
  id: string;
  at: DiagramPoint;
  label?: BiText;
  /** Where the label sits relative to the dot. */
  labelSide?: 'up' | 'down' | 'left' | 'right' | 'upRight' | 'upLeft' | 'downRight' | 'downLeft';
  /**
   * Free nudge for the label, in unit space, measured from the dot.
   *
   * Set by dragging the label. It **supersedes** `labelSide` rather than replacing it:
   * the eight compass slots are how a template says "up and to the right" without
   * knowing the font, and picking one in the sidebar clears this back to that tidy
   * default. Storing an offset rather than an absolute position is what keeps the label
   * travelling with its dot when the point is later moved.
   */
  labelOffset?: DiagramPoint;
  /** Draw a filled dot. Off for a point that is only an anchor for drop-lines. */
  dot?: boolean;
  /** Dashed guide lines from the point to the named axes. */
  dropTo?: Array<'x' | 'y'>;
  /** Axis tick labels printed where the drop-lines meet the axis. */
  xTickLabel?: BiText;
  yTickLabel?: BiText;
  /**
   * Nudges for the tick labels along their own axis, in unit space.
   *
   * One scalar each rather than a point: a tick label belongs *on* its axis, and letting
   * it drift off would break the alignment with the drop-line that makes it readable as
   * a tick at all. Dragging one slides it along the axis to clear a neighbouring tick.
   */
  xTickOffset?: number;
  yTickOffset?: number;
}

/**
 * Free text placed on the plot: the area letters "a b c d" of a tariff diagram, a
 * note, a legend line. Deliberately separate from curve and point labels, which are
 * anchored to something that can move.
 */
export interface DiagramLabel {
  id: string;
  at: DiagramPoint;
  text: BiText;
  align?: 'left' | 'center' | 'right';
  italic?: boolean;
}

/**
 * The shift arrow between an original and a new curve — "S₁ → S₂".
 *
 * Stored as its own element rather than being derived from two curves: papers draw it
 * wherever there is room, which is a presentational choice the teacher makes.
 */
export interface DiagramArrow {
  id: string;
  from: DiagramPoint;
  to: DiagramPoint;
  /** A gentle arc instead of a straight shaft, for arrows that would cross a curve. */
  curved?: boolean;
  label?: BiText;
  /**
   * Nudge for the label, in unit space, from the shaft's midpoint. Set by dragging it;
   * relative so that re-aiming the arrow carries its label along.
   */
  labelOffset?: DiagramPoint;
}

/** One axis: its title, whether it carries an arrowhead, and its tick marks. */
export interface DiagramAxis {
  /** "Price level" / "價格水平". Printed at the far end of the axis. */
  title?: BiText;
  /**
   * Nudge for the title, in unit space, from its computed anchor.
   *
   * The anchor itself stays derived from the plot edges, and the padding is still sized
   * from the title's own estimated width — so a long title reserves its room and cannot
   * clip. This only moves it *within* that reserved space.
   */
  titleOffset?: DiagramPoint;
  /** Named values along the axis, positioned in unit space. */
  ticks?: Array<{
    id: string;
    at: number;
    label: BiText;
    /**
     * Nudge along the axis, in unit space. A scalar rather than a point for the same
     * reason as a point's tick labels: a tick that drifts off its own axis stops
     * reading as a tick.
     */
    offset?: number;
  }>;
}

/**
 * A complete diagram.
 *
 * Everything is optional except the axes, because the default state — what a teacher
 * gets when they insert a diagram — is a bare pair of labelled axes with nothing on
 * them, ready to be drawn on.
 */
export interface Diagram {
  x: DiagramAxis;
  y: DiagramAxis;
  curves: DiagramCurve[];
  points: DiagramPointMark[];
  labels: DiagramLabel[];
  arrows: DiagramArrow[];
  /** Printed at the origin. Papers almost always show a "0" there. */
  showOrigin?: boolean;
  /**
   * Which template this started from, kept only so the editor can show it and offer a
   * reset. It never affects rendering — the geometry above is the single source of truth.
   */
  templateId?: string;
}

/** Clamp a coordinate into the unit square; geometry outside it cannot be drawn. */
export function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function clampPoint(point: DiagramPoint): DiagramPoint {
  return { x: clampUnit(point.x), y: clampUnit(point.y) };
}
