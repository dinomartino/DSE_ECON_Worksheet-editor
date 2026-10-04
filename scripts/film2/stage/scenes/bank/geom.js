// Act 5's measurements. Footage is 1440×900 CSS (frames 2880×1800). CARDS / bars are in
// FRAME px (canvas crops land on whole pixels; CSS = frame / 2); everything else is CSS px
// of the clip, or design px where it says so.
import { PULSE } from '../../../timeline.mjs';

/** Scene-local seconds of pulse n (the act starts on bar 20, so pulses are on the grid). */
export const P = (n) => n * PULSE;

// bank-screen 2.5 s: the twelve topic cards (4 × 3) and their coverage bars, frame px.
const COLS = [160, 806, 1452, 2098];
const ROWS = [[423, 266], [711, 298], [1031, 298]];
const CARD_W = 622;
const BAR_Y = [[646, 18], [916, 14], [1236, 14]]; // the bar strip per row (top, height)
/** Question counts printed on the cards (bank-screen 2.5 s). */
export const COUNTS = { A: 7, B: 6, C: 23, D: 3, E: 4, F: 4, G: 2, H: 4, I: 2, J: 3, EL1: 2, EL2: 2 };
export const CARDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'EL1', 'EL2'].map((id, i) => {
  const col = i % 4, row = Math.floor(i / 4);
  const [y, h] = ROWS[row];
  const bar = id === 'D' ? [596, 16] : BAR_Y[row]; // D's bar sits higher ("Only 3. Worth adding more")
  return {
    id, i, col, row, x: COLS[col], y, w: CARD_W, h,
    bar: { x: COLS[col] + 26, y: bar[0], w: 562, h: bar[1] },
    frame: id === 'EL1' ? 60 : 150, // EL1 is crossed by the pointer at 2.5 s: take it from 1.0 s
  };
});

/** The grid of cut-out cards on cream (design px): CSS (80, 212) → (96, 331) at 1.35×. */
export const GRID = { s: 1.35, css: [80, 212], at: [96, 331] };
/** CSS px of the clip → design px of the cut-out grid. */
export const gridPt = ([x, y]) => [GRID.at[0] + (x - GRID.css[0]) * GRID.s, GRID.at[1] + (y - GRID.css[1]) * GRID.s];

/** The re-inked coverage chart (design px): 12 columns across 1400 px, baseline y 900. */
export const CHART = { x: 260, w: 1400, base: 900, h: 470, gap: 0.6 };
export const COLUMN_W = CHART.w / (12 + CHART.gap * 11);
export const columnX = (i) => CHART.x + i * COLUMN_W * (1 + CHART.gap);

// ---- the camera shots (CSS px of the clips) ----------------------------------------------
/** bank-screen after the topic click: the sub-topic list and the preview, whole width (no word
 * cut at either edge); its top under the "23 questions" / "Question 1 of 26" header strip (y 60–76). */
export const TOPIC = [0, 86, 1440, 620];
/** bank-drag: the page from Q1 to Q3 (CLOSE); its edges fall between text lines. */
export const DRAG_CLOSE = [236, 176, 800, 1080 / 2.55]; // at 2.55×
export const DRAG_CLOSE_END = [236, 176, 800, 450]; // at 2.4×
/** bank-drag after the drop: Q1's options to Q4 and the "1 question added" toast. */
export const DRAG_AFTER = [0, 238, 1440, 620];
export const DRAG_PAGE = [252, 238, 763, 620]; // the page column (the spotlight)
/** The ✦ AI toolbar button, masked in the WIDE frame (the act shows no AI). */
export const AI_BUTTON = [1220, 9, 58, 36];

// check-terms: the menu row alone, the page with the underlines, the finding card.
// "Check terms against EDB glossary   free": the row's own rounded fill (918.5–1268.5 × 124.5–155.5),
// eroded 1.5 px so no popover white rings it; the card takes the fill's corner radius.
export const ROW = [920, 126, 346, 28];
export const ROW_RADIUS = 4; // CSS px
export const ROW_W = [1600, 1728]; // design px: the card at the cut, after its push (HEADLINE + object)
export const ROW_ZOOM = ROW_W[0] / ROW[2];
export const ROW_CARD = { x: 960 - ROW_W[0] / 2, y: 610 - (ROW[3] * ROW_ZOOM) / 2, w: ROW_W[0], h: ROW[3] * ROW_ZOOM };
/** Where the click marker lands on the row (CSS px): the gap between "glossary" and "free". */
export const ROW_CLICK = [1190, 140];
export const TERMS_PAGE = [0, 160, 1440, 620]; // title to Section B Q1; the findings bar out
// Q1 D and the finding card: the frame's edges sit in the gaps between text lines (y 156, 606).
export const REPLACE = [90, 156, 800, 450];
export const REPLACE_SAFE = [345, 200, 520, 360];
// The three wavy underlines Check terms draws (Q1 D, Q3, Q4), as strips of the frame before
// the click that wipe away left to right (frame px).
export const UNDERLINES = [
  { x: 820, y: 760, w: 380, h: 26 },
  { x: 730, y: 1036, w: 720, h: 24 },
  { x: 730, y: 1252, w: 1010, h: 24 },
];
/** Q1 D's text on the page (CSS px): the line the re-ink lift carries off. */
export const Q1D = { x: 417, y: 368, w: 172, h: 17 };
export const Q1D_TEXT = '所有買家的消費者剩餘增加';
export const Q1D_SWAP = { i: 8, from: '剩', to: '盈' };
export const UNDERLINE_INK = '#A87A34'; // the app's wavy underline (sampled)
