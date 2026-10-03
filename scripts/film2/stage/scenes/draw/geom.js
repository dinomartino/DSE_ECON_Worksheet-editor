// The draw act's measured geometry. Footage coordinates are the clips' CSS px (frame px / 2),
// probed from the frames themselves (dark-pixel runs along rows and columns), so the vector
// re-ink lands exactly on the real lines when it hands back to footage.

/** The card every footage shot sits in (design px), its 1 px border inside. */
export const CARD = { x: 704, y: 96, w: 1120, h: 912 };
/** The card for the template flash: a centred portrait window onto the Templates grid. */
export const FLASH = { x: 680, y: 84, w: 560, h: 912 };
/** The card, centred, for the held answer beat. */
export const CENTRED = { ...CARD, x: (1920 - CARD.w) / 2 };
/** Footage: the app window, CSS px. */
export const APP = { w: 1440, h: 900 };
/** The smallest zoom that fills the card's height (no ground shows above or below). */
export const ZMIN = 1.0125;

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
/** Axis arrowheads: length along the axis, half-width (CSS px). The lines are 3.5 px. */
export const ARROW = { len: 18, half: 8.5 };
export const LINE = 3.5;
/** The diagram's centre (the box of its axes), the point the camera holds still. */
export const MID = [(AX.o[0] + AX.x) / 2, (GIVEN.yTip + AX.o[1]) / 2];
