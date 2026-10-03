// Act 0's illustrated page: a flat worksheet sheet in PaperSketch's vocabulary (grey bars,
// hairlines), a diagram with its demand line already drawn, a generic four-tool palette and
// the text box that jumps. Illustration only: no product pixels, no logos.
import { h, s, C, FONT, PAPER_SHADOW } from '../../lib/dom.js';
import { PAGE, AX, DEMAND, TOOLBAR, TOOL, BOX } from './geom.js';

const HEAD = C.sketchHead, TEXT = C.sketchText, RULE = C.sketchRule;
const bar = (g, x, y, w, ht = 12, fill = TEXT) => s('rect', { x, y, width: w, height: ht, rx: ht / 2, fill }, g);
const label = (g, x, y, text, size = 20, fill = HEAD) =>
  s('text', { x, y, fill, 'font-family': FONT.sans, 'font-size': size, 'font-weight': 500, text }, g);

/** Builds the page into `parent`. → { el, svg, tools: [highlight rects], box, boxFrame, boxText, flow, label } */
export function buildPage(parent) {
  const el = h('div', { style: {
    position: 'absolute', left: `${PAGE.x}px`, top: `${PAGE.y}px`, width: `${PAGE.w}px`, height: `${PAGE.h}px`,
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
  label(svg, ox - 30, AX.top + 12, 'P');
  label(svg, AX.right - 6, oy + 34, 'Q');
  s('line', { x1: DEMAND[0][0], y1: DEMAND[0][1], x2: DEMAND[1][0], y2: DEMAND[1][1], stroke: HEAD, 'stroke-width': 4, 'stroke-linecap': 'round' }, svg);
  label(svg, DEMAND[1][0] + 8, DEMAND[1][1] + 30, 'D');

  // Question 2 and its dotted answer lines: the text the jumping box pushes down.
  const flow = s('g', {}, svg);
  bar(flow, 60, 618, 22, 12, HEAD);
  bar(flow, 96, 618, 470);
  bar(flow, 96, 644, 380);
  bar(flow, 560, 644, 80, 10, RULE);
  for (let y = 696; y < PAGE.h; y += 40) {
    s('line', { x1: 96, x2: 640, y1: y, y2: y, stroke: RULE, 'stroke-width': 2.2, 'stroke-dasharray': '0.1 8', 'stroke-linecap': 'round' }, flow);
  }

  // The tool palette: line, arrow, text box, rectangle.
  const tb = s('g', {}, svg);
  s('rect', { x: TOOLBAR.x, y: TOOLBAR.y, width: TOOLBAR.w, height: TOOLBAR.h, rx: 12, fill: C.panel, stroke: C.line, 'stroke-width': 1.5 }, tb);
  const tools = [0, 1, 2, 3].map((i) => {
    const [cx, cy] = TOOL(i);
    return s('rect', { x: cx - 20, y: cy - 17, width: 40, height: 34, rx: 8, fill: C.accentSoft, opacity: 0 }, tb);
  });
  const icon = (i, d, extra = {}) => {
    const [cx, cy] = TOOL(i);
    s('path', { d, transform: `translate(${cx} ${cy})`, fill: 'none', stroke: C.inkMuted, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', ...extra }, tb);
  };
  icon(0, 'M-9 8L9 -8');
  icon(1, 'M-9 8L8 -7M1 -8H9V0');
  icon(2, 'M-11 -10H11V10H-11Z', { 'stroke-width': 1.6, 'stroke-dasharray': '3 3' });
  icon(2, 'M-5 -5H5M0 -5V6');
  icon(3, 'M-10 -7H10V7H-10Z');

  // The text box: dashed frame + "S"; posed by the scene.
  const box = s('g', {}, svg);
  const boxFrame = s('rect', { x: 0, y: 0, width: BOX.w, height: BOX.h, rx: 2, fill: C.paper, stroke: HEAD, 'stroke-width': 1.6, 'stroke-dasharray': '5 4' }, box);
  const boxText = s('text', { x: BOX.w / 2, y: BOX.h / 2 + 10, 'text-anchor': 'middle', fill: C.ink, 'font-family': FONT.sans, 'font-size': 28, 'font-weight': 500, text: 'S' }, box);

  return { el, svg, tools, toolbar: tb, box, boxFrame, boxText, flow };
}
