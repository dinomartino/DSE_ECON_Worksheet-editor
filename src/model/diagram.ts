import type { BiText, CaptionPlacement } from './types';

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
  /**
   * A curve defined by a relation (MR of D, a line parallel to another, a price level).
   * `points` then holds the last resolved geometry, so older builds still draw it.
   */
  derive?: DiagramCurveDerive;
}

/** A position given as an anchor, or as a fixed unit-space point. */
export type DiagramPlace = DiagramAnchorRef | DiagramPoint;

/**
 * How a derived curve is computed from others (`model/diagramAnchors.ts:resolveDiagram`).
 * `level` is horizontal, `vertical` vertical; `from`/`to` bound the other coordinate.
 */
export type DiagramCurveDerive =
  /** Same vertical intercept as `of` (read as the line through its ends), twice the slope. */
  | { kind: 'marginalRevenue'; of: string }
  | { kind: 'parallel'; to: string; through: DiagramPlace }
  /** Tangent to `to` at the point on it nearest `at`. */
  | { kind: 'tangent'; to: string; at: DiagramPlace }
  | { kind: 'level'; y: DiagramAnchorRef | number; from?: number; to?: number }
  | { kind: 'vertical'; x: DiagramAnchorRef | number; from?: number; to?: number };

/**
 * A marked point, e.g. an equilibrium "E₀".
 *
 * `dropTo` is what draws the dashed lines down to the axes that nearly every DSE
 * diagram uses to mark Q₁ and P₁ — they are a property of the point rather than
 * free-standing lines, so moving the point moves them.
 */
export interface DiagramPointMark {
  id: string;
  /** Where it is drawn; with `anchor`, the last resolved position (older builds read it). */
  at: DiagramPoint;
  /** Where the point is defined to be — E where D meets S. Dragging it away detaches it. */
  anchor?: DiagramAnchorRef;
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

export type DiagramSpanStyle = 'bracket' | 'doubleArrow' | 'arrow' | 'dimension';

/**
 * A measured distance between two places: the shortage bracket, the tax wedge "t", the
 * P₁→P₂ arrow on the axis. Ends are anchors when they name something, so the span
 * follows what it measures. Geometry: `model/diagramSpans.ts:spanGeometry`.
 */
export interface DiagramSpan {
  id: string;
  from: DiagramPlace;
  to: DiagramPlace;
  /** `dimension` is a thin line with end ticks; `arrow` has one head, at `to`. */
  style: DiagramSpanStyle;
  /** Project both ends onto that axis, so the span sits on it. */
  along?: 'x' | 'y';
  /** Unit-space distance off the line joining the ends (or off the axis, into the plot). */
  offset?: number;
  label?: BiText;
  /** Nudge for the label, in unit space, from its default spot beside the midpoint. */
  labelOffset?: DiagramPoint;
}

/*
 * ── Shaded areas ──────────────────────────────────────────────────────────────────
 *
 * A welfare area (consumer surplus, deadweight loss, tax revenue) is stored as
 * **references** to the curves and points that bound it, so it stays attached when
 * they are dragged. Explicit `vertices` are the fallback for a free shape.
 * Resolution into a polygon lives in `model/diagramAreas.ts`.
 */

/** A position named by what is drawn, never by coordinates. */
export type DiagramAnchorRef =
  /** A marked point's position. */
  | { point: string }
  /** Where two curves cross (the first crossing, if several). */
  | { cross: [string, string] }
  /** On curve `on`, directly above or below `x`'s position — the producer price under a tax. */
  | { on: string; x: DiagramAnchorRef }
  /** On curve `on`, level with `y` — Qd and Qs at a ceiling, Q₁ at Pw + t. */
  | { on: string; y: DiagramAnchorRef | number }
  /** One anchor's x with another's y (new Q, old P); a number is a fixed unit value. */
  | { x: DiagramAnchorRef | number; y: DiagramAnchorRef | number };

/** One bound of an area's x-range: a unit value (0 is the y-axis) or an anchor's x. */
export type DiagramAreaX = number | DiagramAnchorRef;

/** One edge of a band: a curve, or a horizontal level (a number, or an anchor's y). */
export type DiagramAreaEdge = { curve: string } | { level: number | DiagramAnchorRef };

export type DiagramAreaFill = 'shade' | 'hatch';

/**
 * How a hatched area is drawn, so areas differ on a black-and-white photocopy: `/`,
 * `\`, both, `-`, `|`, or a grid of dots. Absent = `diagonal`, the original hatch.
 */
export type DiagramAreaPattern = 'diagonal' | 'reverse' | 'cross' | 'horizontal' | 'vertical' | 'dots';

/** Spacing of a hatch pattern. Absent = `normal`, the original spacing. */
export type DiagramAreaDensity = 'normal' | 'dense';

/**
 * A change in total revenue between two equilibria: the part of one P×Q rectangle
 * (origin to the point) that lies outside the other. `gain` is the new rectangle less
 * the old; `loss` the old less the new. Derived on every render, so it is a rectangle,
 * an L (price and quantity move the same way) or empty as the points move.
 */
export interface DiagramAreaRevenue {
  change: 'gain' | 'loss';
  /** E₀, before the change. */
  from: DiagramAnchorRef;
  /** E₁, after it. */
  to: DiagramAnchorRef;
}

/**
 * A named paper colour, not a hex: a curated set whose tints differ in lightness, so
 * areas stay distinguishable on a monochrome photocopy. Hex lives in `render/diagram.ts`.
 */
export type DiagramAreaColor = 'grey' | 'yellow' | 'green' | 'blue' | 'red' | 'purple';

/** Where an area's label goes: `auto` is inside when it fits, else on a leader. */
export type DiagramAreaLabelPlacement = 'auto' | 'inside' | 'leader';

export interface DiagramArea {
  id: string;
  /** The region between two edges across `from`..`to` — how every preset is stored. */
  band?: { edges: [DiagramAreaEdge, DiagramAreaEdge]; from: DiagramAreaX; to: DiagramAreaX };
  /** A revenue gain or loss between two points; wins over `band` and `vertices`. */
  revenue?: DiagramAreaRevenue;
  /** A free polygon in unit space, used when `band` is absent. */
  vertices?: DiagramPoint[];
  /** Absent = `shade`, a light grey tint. */
  fill?: DiagramAreaFill;
  /** A hatch's pattern; ignored by a shade. Absent = `diagonal`. */
  pattern?: DiagramAreaPattern;
  /** A hatch's spacing; ignored by a shade. Absent = `normal`. */
  density?: DiagramAreaDensity;
  /** Absent = `grey`. The tint of a shade, the ink of a hatch. */
  color?: DiagramAreaColor;
  label?: BiText;
  /** Nudge for the label, in unit space, from the region's centroid. */
  labelOffset?: DiagramPoint;
  /** Absent = `auto`. */
  labelPlacement?: DiagramAreaLabelPlacement;
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
  /**
   * The value the plot's far edge stands for (unit 1 = `max`), so the inspector reads
   * and types values (a PPF's 30 and 60). Storage stays unit space.
   */
  max?: number;
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
 * A user-chosen frame around the plot: the distance from each plot edge to the canvas
 * edge, in pixels at the diagram's nominal (1×) size.
 *
 * Absent means the frame is **measured** — the renderer derives each side's padding from
 * the text drawn there (§ the picture is measured, not padded). Present means the teacher
 * cropped the picture on the canvas and their frame replaces every derived pad: a title
 * wider than the measured canvas clips at its edge, and no amount of measuring fixes that
 * without also deciding how much white a teacher wants — so the frame is theirs to drag,
 * photo-crop style. The plot keeps its aspect and its printed size; only the white around
 * it is chosen, which is why the values are stored plot-relative rather than as a canvas
 * size — resizing the block later moves the plot, never the chosen clearances.
 */
export interface DiagramCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * One labelled share of a pie chart: "Ele.me — 36.5".
 *
 * `value` is a share, not a percentage: the printed percent is **derived** from the
 * slice's value over the total, so a teacher can type raw figures (sales, counts) or
 * percentages and the labels come out right either way. Storing the percent would go
 * stale the moment a slice is added — the same reason marks totals are never stored.
 */
export interface PieSlice {
  id: string;
  /** Slice name, printed inside the slice above its derived percent. */
  label: BiText;
  /** Non-negative share of the whole. */
  value: number;
}

/**
 * A pie chart, the reference papers' data-response stimulus (market shares, spending
 * breakdowns). Slices draw clockwise from 12 o'clock in array order, filled with
 * cycling monochrome patterns — white, hatch, grey, dots — because the papers print in
 * black and white and colour would flatten to indistinguishable greys.
 */
export interface PieChart {
  slices: PieSlice[];
}

/**
 * One box in a flow chart: "Garment factory", "Local consumers".
 *
 * Placement is **slot-based, never free** (the same rule as bands): a node names its
 * column and its row within that column, and the renderer measures every box from its
 * own text and lays the grid out — so re-wording a stage reflows the chart instead of
 * overlapping a neighbour, and no stored pixel position can go stale when a box is
 * added. Column and row values need not be contiguous; the layout compacts them, which
 * is what keeps delete/move edits from having to renumber everything else.
 */
export interface FlowNode {
  id: string;
  label: BiText;
  /** 0-based column, left to right. */
  col: number;
  /** Order within the column, top to bottom. */
  row: number;
  /**
   * Absent means boxed — the reference charts frame every stage. `false` is bare text
   * for the annotations that end a side-branch ("increase in inventory $50").
   */
  boxed?: boolean;
}

/**
 * One arrow of the flow, with the payment or goods labels riding on it.
 *
 * Endpoints are node **ids**, not positions — the layout owns where boxes sit, so an
 * arrow can only ever point where its stage actually is. An absent endpoint is an open
 * end: no `from` draws a stub entering the chart ("$20 000 →" into the first factory),
 * no `to` a stub leaving it. Both absent draws nothing.
 *
 * Two label slots, not one label with a side: the reference charts genuinely use both
 * at once — flow4's entering stub prints "$200" above the shaft and "raw materials"
 * below it. On a mostly-vertical shaft, above reads as the right side and below as
 * the left.
 */
export interface FlowArrow {
  id: string;
  from?: string;
  to?: string;
  /** "Wool jacket ($700)" — printed above the shaft's midpoint. */
  label?: BiText;
  /** Printed below the shaft's midpoint. */
  labelBelow?: BiText;
}

/**
 * A production-chain flow chart (`real_life_reference/flow1–4.png`) — the value-added
 * and national-income stimulus the papers draw as boxed stages joined by labelled
 * arrows. A variant inside `Diagram`, exactly as `pie` is, so the whole block pipeline
 * — one SVG, one rasterized PNG, resize by re-measure, the title mechanism — serves it
 * unchanged.
 */
export interface FlowChart {
  nodes: FlowNode[];
  arrows: FlowArrow[];
}

/**
 * Where one speech bubble sits around the forum's central picture.
 *
 * Slot-based, never free (the same rule as bands and flow nodes): the reference
 * figures (2023 Source B, 2025 Source C) place their bubbles in exactly these four
 * corners around the illustration, and a stored pixel position would go stale the
 * moment a bubble's text rewrapped or the picture changed.
 */
export type ForumSlot = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

/**
 * One speech bubble: an underlined speaker line ("A typical US citizen:") over a
 * body, with a tail drawn toward the central picture. Speaker and body are separate
 * fields, not one text with a convention, because the papers format them differently
 * (the speaker line is underlined, the body is not) and a derived split would break
 * on a speaker whose name contains a colon.
 */
export interface ForumBubble {
  id: string;
  slot: ForumSlot;
  /** "The host:" — printed underlined on its own line inside the box. */
  speaker: BiText;
  /** The quoted view itself. */
  text: BiText;
  /**
   * The box's width as a fraction of the figure's own width. Absent = the default
   * share (two bubbles and a gutter fill the row, the reference proportion).
   *
   * A fraction rather than pixels so a bubble keeps its proportion when the whole
   * figure is resized — the same reason a table's columns store fractions. Set by
   * dragging the bubble's inner edge on the forum canvas; the text re-wraps to
   * whatever width the box gives it, and the box's height follows the wrapped lines.
   */
  width?: number;
}

/**
 * The central illustration the bubbles' tails point at — the round-table or
 * whiteboard clipart of the reference figures.
 *
 * A `data:` URL like every stored picture (§ imageImport), so the document stays
 * self-contained; it is embedded *inline* in the forum's SVG and rasterizes into the
 * same single PNG, which is what keeps "one diagram = one image in Word" true. The
 * natural size describes the stored bytes, exactly as `ImageBlock`'s does, so the
 * drawn aspect cannot disagree with the pixels.
 */
export interface ForumImage {
  src: string;
  naturalWidthPx: number;
  naturalHeightPx: number;
}

/**
 * A forum figure — the "views expressed in a forum" stimulus both reference DRQs
 * print (`real_life_reference/2023_essay.png` Source B, `2025_essay.png` Source C):
 * speech bubbles with pointed tails around a central illustration. A variant inside
 * `Diagram`, under the same contract as `pie` and `flow`: one SVG, one rasterized
 * PNG, resize by re-measure, and the sidebar panel — never a canvas — edits it.
 */
export interface ForumChart {
  bubbles: ForumBubble[];
  /** Optional: a forum with no picture yet still draws its bubbles, tails inward. */
  image?: ForumImage;
}

/**
 * A complete diagram.
 *
 * Everything is optional except the axes, because the default state — what a teacher
 * gets when they insert a diagram — is a bare pair of labelled axes with nothing on
 * them, ready to be drawn on.
 */
export interface Diagram {
  /**
   * A caption printed above the plot: "Australian wine sold in China".
   *
   * Part of the diagram rather than a paragraph above it, because the reference papers
   * centre it over the *plot* and underline it — a heading in the document flow would
   * centre on the text column and drift away from the picture as the diagram is resized
   * or realigned. Keeping it here also means it rasterizes into the same single PNG, so
   * a stray click in Word cannot separate a diagram from its own caption.
   *
   * Optional, and absent by default: most DSE diagrams carry no title, and an empty one
   * would reserve the room it needs whether or not anything was ever typed.
   */
  title?: BiText;
  /*
   * Deliberately **no `titleOffset`**, unlike `DiagramAxis`.
   *
   * An axis title is nudgeable because it sits in a crowded margin beside ticks, an
   * arrowhead and whatever the curves do near the edge — a teacher genuinely needs to
   * move it. The diagram's title has none of that: the canvas is now sized *around* it
   * (§the picture is measured, not padded), so it always has exactly its own room, and
   * it is centred on the plot with nothing to collide with. A nudge would only let two
   * diagrams in one paper sit differently for no reason anybody could see.
   */
  /**
   * Which side of the plot the title prints on. `above` is the default and stays
   * **unstored**, matching the reference papers and the rule that only a deviation is
   * written down.
   *
   * This is the *only* label a diagram has. A diagram block used to carry a `caption`
   * too — an ordinary paragraph in the document flow — and it was the wrong mechanism
   * twice over: it printed as a separate line that a stray click in Word could pull
   * away from the picture, and being a paragraph it obeyed the text column rather than
   * the plot, so it drifted out from under the figure it named as the diagram was
   * resized. The title supersedes it because it rasterizes *into the same PNG*: one
   * object, one thing to move, and words that cannot come unstuck from the drawing.
   *
   * Typed as the block-level `CaptionPlacement` rather than a parallel type of its own —
   * it answers the identical question, and two spellings of `'above' | 'below'` is two
   * things to keep in step.
   */
  titlePlacement?: CaptionPlacement;
  /**
   * The cropped frame, when the teacher has chosen one on the canvas. Absent, the
   * canvas is sized from what the diagram draws. See `DiagramCrop`.
   */
  crop?: DiagramCrop;
  /**
   * When present, the diagram **is** a pie chart: the renderer draws the slices and
   * ignores the axes fields entirely. A variant inside `Diagram` rather than a new
   * block kind, so the whole diagram pipeline — one SVG, rasterized once, resized by
   * re-measuring — serves the pie unchanged. The axes canvas never opens for a pie;
   * its slices are edited in the sidebar panel.
   */
  pie?: PieChart;
  /**
   * When present, the diagram **is** a flow chart, under the same contract as `pie`:
   * the renderer draws the boxed stages and arrows and ignores the axes fields, and the
   * sidebar panel — never the axes canvas — edits the nodes and arrows.
   */
  flow?: FlowChart;
  /**
   * When present, the diagram **is** a forum figure, under the same contract as `pie`
   * and `flow`: the renderer draws speech bubbles around the central picture and
   * ignores the axes fields, and the sidebar panel edits the bubbles and the image.
   */
  forum?: ForumChart;
  x: DiagramAxis;
  y: DiagramAxis;
  curves: DiagramCurve[];
  points: DiagramPointMark[];
  labels: DiagramLabel[];
  arrows: DiagramArrow[];
  /** Shaded regions, drawn under everything else. Optional: older documents have none. */
  areas?: DiagramArea[];
  /** Brackets and change arrows between two places. Optional: older documents have none. */
  spans?: DiagramSpan[];
  /** Printed at the origin. Papers almost always show a "0" there. */
  showOrigin?: boolean;
  /**
   * Which template this started from, kept only so the editor can show it and offer a
   * reset. It never affects rendering — the geometry above is the single source of truth.
   */
  templateId?: string;
}

/**
 * The plot's height ÷ width, which every template is drawn against. The shared
 * projection holds it; the model needs it only where shape is judged as it looks.
 */
export const DIAGRAM_PLOT_ASPECT = 3 / 4;

/** A unit coordinate as the axis's value (`max` × unit), or the unit itself unscaled. */
export function axisValue(axis: DiagramAxis, unit: number): number {
  return axis.max ? unit * axis.max : unit;
}

/** An axis value back to unit space. */
export function axisUnit(axis: DiagramAxis, value: number): number {
  return axis.max ? value / axis.max : value;
}

/** A value as a tick prints it: at most two decimals, no trailing zeros. */
export function formatAxisValue(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * The text a tick prints: its label, or — with a scaled axis and no label — its value.
 * Derived text, never stored.
 */
export function axisTickLabel(axis: DiagramAxis, tick: { at: number; label: BiText }): BiText {
  const empty = [...(tick.label.en ?? []), ...(tick.label.zh ?? [])].every((run) => run.text === '');
  if (!empty || !axis.max) return tick.label;
  const text = formatAxisValue(axisValue(axis, tick.at));
  return { en: [{ text }], zh: [{ text }] };
}

/** Clamp a coordinate into the unit square; geometry outside it cannot be drawn. */
export function clampUnit(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function clampPoint(point: DiagramPoint): DiagramPoint {
  return { x: clampUnit(point.x), y: clampUnit(point.y) };
}
