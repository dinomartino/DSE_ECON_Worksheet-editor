// Act 0's illustrated page: a flat worksheet sheet in PaperSketch's vocabulary (grey bars,
// hairlines), a diagram with its demand line already drawn and the text box that jumps
// (no tool palette: nothing that could pass for a real product's toolbar). Illustration only: no product pixels, no logos.
import { h, s, C, FONT, PAPER_SHADOW } from '../../lib/dom.js';
import { PAGE, AX, DEMAND, BOX, FLOW_Y } from './geom.js';

const HEAD = C.sketchHead, TEXT = C.sketchText, RULE = C.sketchRule;
const bar = (g, x, y, w, ht = 12, fill = TEXT) => s('rect', { x, y, width: w, height: ht, rx: ht / 2, fill }, g);
const label = (g, x, y, text, size = 20, fill = HEAD) =>
  s('text', { x, y, fill, 'font-family': FONT.sans, 'font-size': size, 'font-weight': 500, text }, g);

/** Builds the page into `parent`. → { el, svg, box, boxFrame, boxText, flow } */
export function buildPage(parent) {
  const el = h('div', { style: {
    position: 'absolute', left: 0, top: 0, width: `${PAGE.w}px`, height: `${PAGE.h}px`,
    background: C.paper, boxShadow: PAPER_SHADOW, borderRadius: '4px', overflow: 'hidden', transformOrigin: '0 0',
  } }, parent);
  const svg = s('svg', { viewBox: `0 0 ${PAGE.w} ${PAGE.h}`, width: PAGE.w, height: PAGE.h, style: { display: 'block' } }, el);

  // Heading and question 1.
  bar(svg, 200, 48, 300, 16, HEAD);
  bar(svg, 250, 78, 200, 10);
  s('line', { x1: 60, x2: 640, y1: 112, y2: 112, stroke: TEXT, 'stroke-width': 1.5 }, svg);
  bar(svg, 60, 140, 22, 12, HEAD);
  bar(svg, 96, 140, 500);
  bar(svg, 96, 166, 320);

  // The diagram: axes, P and Q, the demand line.
  const [ox, oy] = AX.o;
  s('path', { d: `M${ox} ${AX.top}V${oy}H${AX.right}`, fill: 'none', stroke: HEAD, 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
  label(svg, ox - 28, AX.top + 14, 'P');
  label(svg, AX.right + 8, oy + 8, 'Q'); // beside the axis end: the close-up keeps it in frame
  s('line', { x1: DEMAND[0][0], y1: DEMAND[0][1], x2: DEMAND[1][0], y2: DEMAND[1][1], stroke: HEAD, 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
  label(svg, DEMAND[1][0] + 8, DEMAND[1][1] - 8, 'D');

  // Beside the diagram: part (b)'s lines, so the sheet reads as a worksheet once it is whole.
  // x ≥ 502: off the right of the opening close-up (page x 502 lands at frame x 1946).
  bar(svg, 502, 300, 22, 12, HEAD);
  for (const [y, w] of [[300, 104], [326, 138], [352, 104]]) bar(svg, y === 300 ? 536 : 502, y, w);
  for (let y = 400; y <= 520; y += 40) {
    s('line', { x1: 502, x2: 640, y1: y, y2: y, stroke: RULE, 'stroke-width': 2.2, 'stroke-dasharray': '0.1 8', 'stroke-linecap': 'round' }, svg);
  }

  // Question 2 and its dotted answer lines: the text the jumping box pushes down.
  const flow = s('g', {}, svg);
  bar(flow, 60, FLOW_Y, 22, 12, HEAD);
  bar(flow, 96, FLOW_Y, 470);
  bar(flow, 96, FLOW_Y + 26, 380);
  bar(flow, 560, FLOW_Y + 26, 80, 10, RULE);
  for (let y = FLOW_Y + 78; y < PAGE.h; y += 40) {
    s('line', { x1: 96, x2: 640, y1: y, y2: y, stroke: RULE, 'stroke-width': 2.2, 'stroke-dasharray': '0.1 8', 'stroke-linecap': 'round' }, flow);
  }

  // The text box: dashed frame + "S"; posed by the scene.
  const box = s('g', {}, svg);
  const boxFrame = s('rect', { x: 0, y: 0, width: BOX.w, height: BOX.h, rx: 2, fill: C.paper, stroke: HEAD, 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }, box);
  const boxText = s('text', { x: BOX.w / 2, y: BOX.h / 2 + 10, 'text-anchor': 'middle', fill: C.ink, 'font-family': FONT.sans, 'font-size': 28, 'font-weight': 500, text: 'S' }, box);

  return { el, svg, box, boxFrame, boxText, flow };
}
