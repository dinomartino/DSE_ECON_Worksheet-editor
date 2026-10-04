// The draw act's measured geometry. Footage coordinates are the clips' CSS px (frame px / 2),
// probed from the frames themselves (dark-pixel runs along rows and columns), so the vector
// re-ink lands exactly on the real lines when it hands back to footage.

/** Footage: the app window, CSS px. */
export const APP = { w: 1440, h: 900 };
/** Axis arrowheads: length along the axis, half-width (CSS px). The lines are 3.5 px. */
export const ARROW = { len: 18, half: 8.5 };
export const LINE = 3.5;

// The diagram on the drawing canvas (both canvases share axes; the curves differ).
const AX = { o: [287.8, 727.3], x: 811.5 };
/** draw-diagram at clip 5.0 s: D, S and E0 just placed (blank axes, no 中文 labels). */
export const DRAWN = {
  o: AX.o, yTip: 208, xTip: AX.x,
  D: [[336.9, 286], [713.6, 659]],
  S: [[336.8, 659], [683.8, 345]],
  E: [533.7, 480.9],
};
/** shade-area / answer-draw at the start: D, S, E0 and its guides, Price 價格 / Quantity 數量. */
export const GIVEN = {
  o: AX.o, yTip: 238.5, xTip: AX.x,
  D: [[327.1, 323], [713, 672]],
  S: [[327.1, 672], [713, 323]],
  E: [520.2, 497.5],
};
/** shade-area: the consumer-surplus triangle (hatched "\" in the app), and producer surplus. */
export const CS = [[327.1, 323], [520.2, 497.5], [327.1, 497.5]];
export const PS = [[327.1, 497.5], [520.2, 497.5], [327.1, 672]];

/**
 * answer-layer (Teacher from clip 1.5 s): a per-unit tax. Black axes; the answer is all red:
 * D, S0, S1 = S0 shifted up by t, E0, E1, the P/Q guides, the arrows. Student: the axes alone.
 */
export const TAX = {
  o: [465, 554.5], yTip: 215.5, xTip: 829.5,
  D: [[492.5, 267.5], [756, 511]],
  S0: [[486, 529], [673, 340]],
  S1: [[486, 447.5], [673, 256]],
  E0: [624.4, 389.3], E1: [581.4, 349.7], Pt: 432.6, // P1 − t: where S0 meets the Q1 line
  tax: [[658.8, 354.5], [658.8, 271.3]], // the t arrow, S0 up to S1
  up: [[427.5, 389], [427.5, 350]], // the price-rise arrow left of the P labels
  left: [[625, 593], [582.5, 593]], // the quantity-fall arrow under the Q labels
  box: { x: 410, y: 170, w: 505, h: 430 }, // the whole drawing with its labels
};

// Camera framings (CSS px of each clip), all measured so no word is cut by an edge.
/** draw-diagram at CLOSE: the canvas origin pinned to the frame's own axes (x 96, y 1008). */
export const DRAW_CLOSE = { zoom: 2.4, anchor: [96, 1008], focus: [AX.o[0], AX.o[1], 0, 0] };
/** draw-diagram in C1 narrow: the paper and its labels, no toolbar, the inspector just outside. */
export const DRAW_NARROW = { zoom: 1.03, anchor: [680 + 572, 264 + 372], focus: [4.6, 95, 1110.6, 722] };
/** shade-area / answer-draw MEDIUM: the toolbar, the Shade menu and the top of the diagram. */
export const TOP = [0, 0, 1440, 620];
/** shade-area CLOSE: CS and PS fill the frame (the x axis and Q0 fall just outside). */
export const SHADE_CLOSE = { zoom: 2.4, focus: [160, 262, 800, 450] };
/** answer-draw pushed in: the diagram, D1 and the Shift a copy button, P labels kept whole. */
export const ANSWER_IN = { zoom: 1.4, focus: [222.4, 112, 1217.6, 532] };
/** answer-layer CLOSE: the red answer from the y-axis tip to the Q arrow (Price above, the blue marking points below, both outside). */
export const LAYER_CLOSE = { zoom: 2.634, focus: [298, 211, 729, 410] };

/**
 * The Templates wall: 12 real template cards cut from template-picker frames (CSS px of each
 * card's top-left; every card is 157.5 × 113), dealt into a 4 × 3 wall.
 */
export const CARD_WH = [157.5, 113];
export const TILES = [
  [72, 1103.5, 376.5], [72, 1267.5, 376.5], [72, 1103.5, 497], [72, 1267.5, 497],
  [120, 1103.5, 445], [120, 1267.5, 445], [120, 1103.5, 565], [120, 1267.5, 565],
  [168, 1103.5, 382], [168, 1267.5, 382], [168, 1103.5, 525], [168, 1267.5, 525],
];
