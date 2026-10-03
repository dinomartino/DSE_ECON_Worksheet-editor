// Act 0, the cold open (FILM.md §3): an illustrated page; a cursor tries to draw a supply
// curve with clumsy line tools. Beats on the grid (P(n), timeline pulse n):
//   P(-4)..P(-2) the page settles, the palette, the cursor picks the line tool
//   P(-1)..P(1)  the drag: the line comes out crooked; "A supply curve in Word" on P(0)
//   P(2)..P(3)   the end handle is dragged right and snaps onto the demand line instead
//   P(4)..P(6)   a text box "S" is placed, then jumps into the text below, which reflows;
//                "should not take all evening" on P(6)
//   P(8)         bar 1: the line straightens (blue), the box goes home, the text flows back
//   P(9)..P(11)  the page leaves; the line travels and turns into the mark's vertical axis
//   P(11)..P(12) the axis draws back into its base, where the mark (next act) grows it again
import { h, s, svg, place, show, C } from '../lib/dom.js';
import { block } from '../lib/type.js';
import { keys, tween, tw, f } from '../lib/tween.js';
import { lerp, prog, outSoft, inOutSoft, spring, outBack } from '../lib/ease.js';
import { P, PAGE, pg, SUPPLY, CROOKED_END, GRAB_END, SNAP_END, KINKS, TOOL, LINE_TOOL, TEXT_TOOL, BOX, REFLOW, AXIS, mix } from './open/geom.js';
import { buildPage } from './open/page.js';

const LINE_W = 4.2 * PAGE.k;
const inQuad = (p) => p * p;
const BOX_CLICK = [BOX.home[0] + 26, BOX.home[1] + 30];
const CLICKS = [P(-2), P(-1), P(2), P(4), P(5)];

// Cursor path (frame px): [t, [x, y], ease into this key].
const CURSOR = [
  [P(-3), [1990, 1010]],
  [P(-2), pg(TOOL(LINE_TOOL)), outSoft],
  [P(-1), pg(SUPPLY[0]), inOutSoft],
  [P(1), pg(CROOKED_END), inOutSoft],
  [P(1.5), pg([CROOKED_END[0] + 16, CROOKED_END[1] + 14]), inOutSoft], // lets go, looks
  [P(2), pg(CROOKED_END), inOutSoft], // …and reaches back for the handle
  [P(3), pg(GRAB_END), inOutSoft],
  [P(3.4), pg(GRAB_END)],
  [P(4), pg(TOOL(TEXT_TOOL)), outSoft],
  [P(5), pg(BOX_CLICK), inOutSoft],
  [P(6), pg([BOX_CLICK[0] + 34, BOX_CLICK[1] + 30]), inOutSoft],
  [P(7.6), pg([196, 640]), inOutSoft],
  [P(8.6), pg([226, 690]), outSoft],
];

/** The end of the line the teacher is drawing (page px), and how crooked it is (0..1). */
function lineEnd(t) {
  let e = keys(t, [[P(-1), SUPPLY[0]], [P(1), CROOKED_END, inOutSoft], [P(2), CROOKED_END], [P(3), GRAB_END, inOutSoft]]);
  if (t >= P(3)) e = keys(t, [[P(3), GRAB_END], [P(3) + 0.18, SNAP_END, outBack], [P(8), SNAP_END], [P(9), SUPPLY[1], spring]]);
  const bend = 1 - spring(prog(t, P(8), P(9)));
  return { e, bend };
}

/** A polyline A → kinks → E as an SVG path (bend 0 = straight). */
function crooked(a, e, bend) {
  const dx = e[0] - a[0], dy = e[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const n = [-dy / len, dx / len];
  const k = (len / 400) * bend;
  const pts = [a, ...KINKS.map(([u, off]) => [a[0] + dx * u + n[0] * off * k, a[1] + dy * u + n[1] * off * k]), e];
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x, 2)} ${f(y, 2)}`).join('');
}

const scene = {
  events: [
    { t: P(-2), kind: 'click', label: 'the line tool' },
    { t: P(-1), kind: 'pencil', label: 'the drag: a crooked line' },
    { t: P(2), kind: 'drag', label: 'grabs the end handle' },
    { t: P(3), kind: 'snap', label: 'the handle snaps onto the demand line' },
    { t: P(4), kind: 'click', label: 'the text box tool' },
    { t: P(5), kind: 'click', label: 'places the "S" box' },
    { t: P(5.5), kind: 'click', label: 'types "S"' },
    { t: P(6), kind: 'snap', label: 'the box jumps, the text reflows' },
    { t: P(8), kind: 'pop', label: 'the line straightens' },
    { t: P(9), kind: 'whoosh', label: 'the line travels into the mark' },
  ],
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.page = buildPage(ctx.el);
    const ov = svg(ctx.el, {});
    ctx.line = s('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ov);
    ctx.handles = [0, 1].map(() => s('rect', { width: 13, height: 13, x: -6.5, y: -6.5, rx: 2, fill: C.paper, stroke: C.inkSubtle, 'stroke-width': 1.6 }, ov));
    ctx.cursor = s('g', {}, ov);
    s('path', { d: 'M0 0V25.5L6.2 19.6L10.4 29.2L14.6 27.4L10.5 18H19Z', fill: C.ink, stroke: C.paper, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, ctx.cursor);
    const col = { x: 120, w: 1000, align: 'left', size: 96, zhSize: 44, rise: 14 };
    ctx.q1 = block(ctx.el, { ...ctx.copy.q1, ...col, y: 0, maxLines: 1 });
    // Narrow on purpose: the greedy wrap breaks "should not take / all evening".
    ctx.q2 = block(ctx.el, { ...ctx.copy.q2, ...col, w: 660, y: 0, maxLines: 2 });
    const gap = 44;
    const top = 540 - (ctx.q1.height + gap + ctx.q2.height) / 2;
    ctx.q1.el.style.top = `${f(top, 2)}px`;
    ctx.q2.el.style.top = `${f(top + ctx.q1.height + gap, 2)}px`;
  },
  update(ctx, t) {
    const { page } = ctx;
    // The page: settles in, then leaves downwards as the line takes over.
    const enter = outSoft(prog(t, 0, 0.9));
    const leave = inOutSoft(prog(t, P(9), P(11)));
    place(page.el, { y: 56 * (1 - enter) + 1000 * leave, scale: PAGE.k, opacity: enter });
    show(page.toolbar, spring(prog(t, P(-3), P(-2))));
    page.toolbar.setAttribute('transform', `translate(0 ${f(10 * (1 - outSoft(prog(t, P(-3), P(-2)))), 2)})`);
    show(page.tools[LINE_TOOL], tw(t, P(-2), 0.12) - tw(t, P(4), 0.12));
    show(page.tools[TEXT_TOOL], tw(t, P(4), 0.12) - tw(t, P(8), 0.3));

    // The text box: pops in, jumps into the text (which reflows), goes home on the fix.
    const pop = spring(prog(t, P(5), P(5.6)));
    const at = keys(t, [[P(6), BOX.home], [P(6) + 0.2, BOX.jump, outBack], [P(8), BOX.jump], [P(9), BOX.home, inOutSoft]]);
    const bs = lerp(0.6, 1, pop);
    page.box.setAttribute('transform', `translate(${f(at[0] + (BOX.w * (1 - bs)) / 2, 2)} ${f(at[1] + (BOX.h * (1 - bs)) / 2, 2)}) scale(${f(bs, 4)})`);
    show(page.box, pop);
    show(page.boxFrame, 1 - outSoft(prog(t, P(8.5), P(9.5))));
    show(page.boxText, outSoft(prog(t, P(5.5), P(5.5) + 0.12))); // typed
    const flowY = keys(t, [[P(6) + 0.06, 0], [P(6) + 0.6, REFLOW, outSoft], [P(8), REFLOW], [P(9), 0, inOutSoft]]);
    page.flow.setAttribute('transform', `translate(0 ${f(flowY, 2)})`);

    // The line: drawn crooked, snapped wrong, straightened, then off to the mark.
    const { e, bend } = lineEnd(t);
    let a = pg(SUPPLY[0]), b = pg(e);
    const go = inOutSoft(prog(t, P(9), P(11)));
    a = [lerp(a[0], AXIS.base[0], go), lerp(a[1], AXIS.base[1], go)];
    b = [lerp(b[0], AXIS.top[0], go), lerp(b[1], AXIS.top[1], go)];
    const back = inQuad(prog(t, P(11), P(12)));
    b = [lerp(b[0], a[0], back), lerp(b[1], a[1], back)];
    ctx.line.setAttribute('d', crooked(a, b, bend));
    const blue = outSoft(prog(t, P(8), P(8) + 0.3)) - inOutSoft(prog(t, P(9.5), P(11)));
    const base = t < P(9.5) ? C.ink : AXIS.color;
    ctx.line.setAttribute('stroke', mix(base, C.markBlue, blue));
    ctx.line.setAttribute('stroke-width', f(lerp(LINE_W, AXIS.width, go), 3));
    show(ctx.line, t >= P(-1) && back < 0.999 ? 1 : 0);
    const sel = tw(t, P(1), 0.15) - tw(t, P(8), 0.25);
    [a, b].forEach((p, i) => {
      ctx.handles[i].setAttribute('transform', `translate(${f(p[0], 2)} ${f(p[1], 2)})`);
      show(ctx.handles[i], sel);
    });

    // The cursor: a press dips it on every click.
    const [cx, cy] = keys(t, CURSOR);
    const press = CLICKS.reduce((m, c) => Math.max(m, 1 - Math.abs(t - c - 0.05) / 0.09), 0);
    const cs = 1.6 * (1 - 0.1 * Math.max(0, press));
    ctx.cursor.setAttribute('transform', `translate(${f(cx, 2)} ${f(cy, 2)}) scale(${f(cs, 4)})`);
    show(ctx.cursor, (t >= P(-3) ? 1 : 0) - outSoft(prog(t, P(8), P(8.6))));

    ctx.q1.show(t, { at: P(0), out: P(10), outDur: 0.5 });
    ctx.q2.show(t, { at: P(6), out: P(10), outDur: 0.5 });
  },
};

export default scene;
