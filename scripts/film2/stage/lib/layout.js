// The frame's grid and the film's three compositions (FILM.md §4 "Compositions"). Design px,
// 1920×1080. Every footage frame, statement and object sits in one of these; a scene that
// needs another rectangle is asking for a new composition, not a literal.

/** Title-safe area: 96 px left/right, 72 px top/bottom (content 1728 × 936). */
export const SAFE = Object.freeze({ x: 96, y: 72, w: 1728, h: 936, r: 1824, b: 1008 });
/** 12 columns of 122 px with 24 px gutters: column i starts at x = 96 + 146 i. */
export const GRID = Object.freeze({ cols: 12, col: 122, gutter: 24, x: (i) => 96 + 146 * i, unit: 8 });
/** The bar line the axis chapter draws on (the frame's own axes): x 96, y 1008. */
export const AXES = Object.freeze({ x: 96, y: 1008, top: 72, right: 1824 });

/**
 * C1 feature: the HEADLINE slot (lib/type.js) over a 1728 × 744 card whose bottom is the axis
 * line (y 1008). Footage at 1.2× (1440 CSS → 1728 px); the camera crops vertically.
 */
export const C1 = Object.freeze({ card: Object.freeze({ x: 96, y: 264, w: 1728, h: 744 }), scale: 1.2 });
/** C1 narrow: the same slot, a 1144 × 744 card from column 4 (x 680) for portrait subjects. */
export const C1N = Object.freeze({ card: Object.freeze({ x: 680, y: 264, w: 1144, h: 744 }), scale: 744 / 900 });
/**
 * C2 statement + object: a STATEMENT at left (x 96, w 784, middle on y 540) and an object
 * (a page, a dialog crop) at x 1008…1824, top 96, allowed to bleed off the bottom edge only.
 */
export const C2 = Object.freeze({
  statement: Object.freeze({ x: 96, y: 540, w: 784, align: 'left', valign: 'middle' }),
  object: Object.freeze({ x: 1008, y: 96, w: 816, h: 984 }),
});
/** C3 centred: one statement (or the mark) alone, x 960, w 1400, middle on y 540. */
export const C3 = Object.freeze({ statement: Object.freeze({ x: 960, y: 540, w: 1400, align: 'center', valign: 'middle' }) });
/** Two stacked statements in C3: 56 px apart, centred as a group on y 540. */
export const STACK_GAP = 56;
/** WIDE shot: the card at 0.62 of the frame (1190 × 744), centred in the C1 band. */
export const WIDE = Object.freeze({ card: Object.freeze({ x: 365, y: 264, w: 1190, h: 744 }) });
/** A printed page is legible at ≥ 1190 px wide (11 pt → 22 px); smaller, it holds ≤ 1 s. */
export const PRINT_MIN_W = 1190;
