// Act 0, the cold open (FILM.md §3): an illustrated sheet; a cursor tries to draw a supply
// curve with clumsy line tools. Beats on the grid (P(n), timeline pulse n; frame 0 = P(-4)):
//   0..P(-1.5)    an extreme close-up (3.9 px per page px, full-bleed): the drag, the line comes
//                 out crooked under a 2× cursor from the first frame
//   P(-2)..P(.5)  the sheet slides right (pull-out to 2.16) and the cream takes the left half;
//                 "A supply curve in Word" (STATEMENT, C2) rises on P0
//   P(.5)..P(1.5) the end handle is dragged right and snaps onto the demand line instead
//   P(2.5)..P(4)  the text tool; a box "S" is placed and typed;
//                 "should not take all evening" on P3
//   P(4.5)        the box jumps into the text below, which reflows; P(5.5)..P(6.5) dragged back,
//                 it springs to the wrong place again
//   P(8)          bar 1: the line straightens (blue), the box goes home, the text flows back, and
//                 the camera pulls back 2.25 → 0.9 (P8..P10.5): the whole sheet, the reveal
//   P(10)..P(12)  the line lifts off and docks, exactly on the cut, as the mark's vertical axis
//                 (its colour and width): the mark act grows the tile around it (scenes/mark.js)
// A slow push (2.16 → 2.25) runs under the struggle so the frame never stalls.
import { h, s, svg, show, C } from '../lib/dom.js';
import { block, STATEMENT } from '../lib/type.js';
import { C2, STACK_GAP } from '../lib/layout.js';
import { keys, tw, f } from '../lib/tween.js';
import { lerp, prog, outSoft, inOutSoft, spring, outBack, sineInOut } from '../lib/ease.js';
import {
  P, SUPPLY, CROOKED_END, GRAB_END, SNAP_END, KINKS, LINE_W, TOOL, LINE_TOOL, TEXT_TOOL, BOX, REFLOW, AXIS,
  ANCHOR, CAM, mix,
} from './open/geom.js';
import { buildPage } from './open/page.js';

const BOX_GRAB = [BOX.jump[0] + 30, BOX.jump[1] + 28];
const BOX_PULL = [150, 470]; // where the box is dragged back to before it springs away again
const CLICKS = [P(0.5), P(2.5), P(3.5), P(4), P(5.5)];

/** The sheet's pose at t: { k, ox, oy } (frame = o + k · page). */
function camAt(t) {
  const logk = (a, b, p) => Math.exp(lerp(Math.log(a), Math.log(b), p));
  const ab = inOutSoft(prog(t, P(-2), P(0.5)));
  const push = sineInOut(prog(t, P(0.5), P(8)));
  const back = inOutSoft(prog(t, P(8), P(10.5)));
  let k = logk(CAM.A.k, CAM.B.k, ab);
  k = logk(k, CAM.B2.k, push);
  let at = [lerp(CAM.A.at[0], CAM.B.at[0], ab), lerp(CAM.A.at[1], CAM.B.at[1], ab)];
  // A first push in on the drag keeps the close-up alive before the slide.
  k *= 1 + 0.025 * sineInOut(prog(t, 0, P(-2))) * (1 - ab);
  k = logk(k, CAM.C.k, back);
  at = [lerp(at[0], CAM.C.at[0], back), lerp(at[1], CAM.C.at[1], back)];
  return { k, ox: at[0] - ANCHOR[0] * k, oy: at[1] - ANCHOR[1] * k };
}
const toFrame = (c, [x, y]) => [c.ox + c.k * x, c.oy + c.k * y];

// Cursor path in PAGE px: [t, [x, y], ease into this key]. Mapped through the camera at t.
const CURSOR = [
  [0, SUPPLY[0]],
  [P(-3), [190, 470], inOutSoft],
  [P(-2.2), [300, 360], inOutSoft],
  [P(-1.5), CROOKED_END, outSoft],
  [P(-0.5), [CROOKED_END[0] + 10, CROOKED_END[1] + 24], inOutSoft], // lets go, looks
  [P(0.5), CROOKED_END, inOutSoft], // …and reaches back for the handle
  [P(1.5), GRAB_END, inOutSoft],
  [P(1.7), GRAB_END],
  [P(2.5), TOOL(TEXT_TOOL), inOutSoft],
  [P(3.5), [BOX.home[0] + 26, BOX.home[1] + 30], inOutSoft],
  [P(4.5), [BOX.home[0] + 52, BOX.home[1] + 60], inOutSoft],
  [P(5.5), BOX_GRAB, inOutSoft],
  [P(6.5), [BOX_PULL[0] + 30, BOX_PULL[1] + 28], inOutSoft],
  [P(7.3), [BOX_PULL[0] + 80, BOX_PULL[1] + 90], inOutSoft], // lets go, gives up
  [P(8.6), [BOX_PULL[0] + 150, BOX_PULL[1] + 170], outSoft],
];

/** The end of the line being drawn (page px), and how crooked it is (0..1). */
function lineEnd(t) {
  let e = keys(t, [[0, SUPPLY[0]], [P(-3), [190, 470], inOutSoft], [P(-2.2), [300, 360], inOutSoft], [P(-1.5), CROOKED_END, outSoft], [P(0.5), CROOKED_END], [P(1.5), GRAB_END, inOutSoft]]);
  if (t >= P(1.5)) e = keys(t, [[P(1.7), GRAB_END], [P(1.7) + 0.18, SNAP_END, outBack], [P(8), SNAP_END], [P(9), SUPPLY[1], spring]]);
  const bend = 1 - spring(prog(t, P(8), P(9)));
  return { e, bend };
}

/** A polyline A → kinks → E as an SVG path (bend 0 = straight). */
function crooked(a, e, bend) {
  const dx = e[0] - a[0], dy = e[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  const n = [-dy / len, dx / len];
  const k = Math.min(1, len / 280) * bend;
  const pts = [a, ...KINKS.map(([u, off]) => [a[0] + dx * u + n[0] * off * k, a[1] + dy * u + n[1] * off * k]), e];
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x, 2)} ${f(y, 2)}`).join('');
}

const scene = {
  events: [
    { t: 0.05, kind: 'pencil', label: 'the drag: a crooked line' },
    { t: P(0.5), kind: 'drag', label: 'grabs the end handle' },
    { t: P(1.7), kind: 'snap', label: 'the handle snaps onto the demand line' },
    { t: P(2.5), kind: 'click', label: 'the text box tool' },
    { t: P(3.5), kind: 'click', label: 'places the "S" box' },
    { t: P(4), kind: 'click', label: 'types "S"' },
    { t: P(4.5), kind: 'snap', label: 'the box jumps, the text reflows' },
    { t: P(5.5), kind: 'drag', label: 'drags the box back' },
    { t: P(6.5), kind: 'snap', label: 'it springs away again' },
    { t: P(8), kind: 'pop', label: 'the line straightens' },
    { t: P(10), kind: 'whoosh', label: 'the line travels into the mark' },
  ],
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.page = buildPage(ctx.el);
    const ov = svg(ctx.el, {});
    ctx.line = s('path', { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, ov);
    ctx.handles = [0, 1].map(() => s('rect', { width: 1, height: 1, x: -0.5, y: -0.5, rx: 0.15, fill: C.paper, stroke: C.inkSubtle, 'stroke-width': 0.12 }, ov));
    ctx.cursor = s('g', {}, ov);
    s('path', { d: 'M0 0V25.5L6.2 19.6L10.4 29.2L14.6 27.4L10.5 18H19Z', fill: C.ink, stroke: C.paper, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, ctx.cursor);
    // The statement (C2, left column): one sentence in two blocks. 760 px wide so the wrap
    // breaks "A supply curve / in Word" and "should not take / all evening".
    const col = { ...STATEMENT, ...C2.statement, w: 760, valign: 'top', y: 0 };
    ctx.q1 = block(ctx.el, { ...col, ...ctx.copy.q1 });
    ctx.q2 = block(ctx.el, { ...col, ...ctx.copy.q2 });
    const top = 540 - (ctx.q1.height + STACK_GAP + ctx.q2.height) / 2;
    ctx.q1.el.style.top = `${f(top, 2)}px`;
    ctx.q2.el.style.top = `${f(top + ctx.q1.height + STACK_GAP, 2)}px`;
    // The doctor's shot budget: a close-up (an illustrated one) until the pull-back.
    ctx.registerShots?.('open', [
      { at: 0, end: P(8), size: 'close', to: 'close', moveAt: P(8) },
      { at: P(8), end: ctx.dur, size: 'close', to: 'wide', moveAt: P(9) },
    ]);
  },
  update(ctx, t) {
    const { page } = ctx;
    const cam = camAt(t);
    // The sheet: posed by the camera; it falls away as the line takes over.
    const leave = inOutSoft(prog(t, P(10.5), P(11.75)));
    page.el.style.transform = `translate(${f(cam.ox, 2)}px, ${f(cam.oy + 140 * leave, 2)}px) scale(${f(cam.k, 5)})`;
    show(page.el, 1 - leave);
    show(page.tools[LINE_TOOL], 1 - tw(t, P(2.5), 0.12));
    show(page.tools[TEXT_TOOL], tw(t, P(2.5), 0.12) - tw(t, P(8), 0.3));

    // The text box: pops in, jumps into the text (which reflows), is dragged back, springs
    // away again, and goes home on the fix.
    const pop = spring(prog(t, P(3.5), P(3.5) + 0.6));
    const at = keys(t, [
      [P(4.5), BOX.home], [P(4.5) + 0.2, BOX.jump, outBack],
      [P(5.5), BOX.jump], [P(6.5), BOX_PULL, inOutSoft], [P(6.5) + 0.24, BOX.jump, outBack],
      [P(8), BOX.jump], [P(9), BOX.home, inOutSoft],
    ]);
    const bs = lerp(0.6, 1, pop);
    page.box.setAttribute('transform', `translate(${f(at[0] + (BOX.w * (1 - bs)) / 2, 2)} ${f(at[1] + (BOX.h * (1 - bs)) / 2, 2)}) scale(${f(bs, 4)})`);
    show(page.box, pop);
    show(page.boxFrame, 1 - outSoft(prog(t, P(8.5), P(9.5))));
    show(page.boxText, outSoft(prog(t, P(4), P(4) + 0.12))); // typed
    const flowY = keys(t, [
      [P(4.5) + 0.06, 0], [P(4.5) + 0.6, REFLOW, outSoft],
      [P(5.5), REFLOW], [P(6.5), REFLOW * 0.35, inOutSoft], [P(6.5) + 0.5, REFLOW, outBack],
      [P(8), REFLOW], [P(9), 0, inOutSoft],
    ]);
    page.flow.setAttribute('transform', `translate(0 ${f(flowY, 2)})`);

    // The line (frame px): drawn crooked, snapped wrong, straightened, then off to the mark.
    const { e, bend } = lineEnd(t);
    let a = SUPPLY[0], b = e;
    const go = inOutSoft(prog(t, P(10), P(12)));
    const fa = toFrame(cam, a), fb = toFrame(cam, b);
    // Kinks are bent in page px, then mapped: build the path in page px and transform it.
    const d = crooked(a, b, bend);
    const sx = cam.k, tx = cam.ox, ty = cam.oy;
    if (go <= 0) {
      ctx.line.setAttribute('d', d);
      ctx.line.setAttribute('transform', `translate(${f(tx, 2)} ${f(ty, 2)}) scale(${f(sx, 5)})`);
      ctx.line.setAttribute('stroke-width', f(LINE_W, 3));
    } else {
      // Docks at the cut: still (velocity 0) on the act's last frame, axis-coloured.
      const A = [lerp(fa[0], AXIS.base[0], go), lerp(fa[1], AXIS.base[1], go)];
      const B = [lerp(fb[0], AXIS.top[0], go), lerp(fb[1], AXIS.top[1], go)];
      ctx.line.setAttribute('d', `M${f(A[0], 2)} ${f(A[1], 2)}L${f(B[0], 2)} ${f(B[1], 2)}`);
      ctx.line.removeAttribute('transform');
      ctx.line.setAttribute('stroke-width', f(lerp(LINE_W * cam.k, AXIS.width, go), 3));
    }
    const blue = outSoft(prog(t, P(8), P(8) + 0.3)) - inOutSoft(prog(t, P(10.8), P(12) - 0.05));
    const base = t < P(10.8) ? C.ink : AXIS.color;
    ctx.line.setAttribute('stroke', mix(base, C.markBlue, blue));
    show(ctx.line, 1);
    const sel = tw(t, P(-1.5), 0.15) - tw(t, P(8), 0.25);
    const hs = Math.min(20, Math.max(11, 5.2 * cam.k));
    [fa, fb].forEach((p, i) => {
      ctx.handles[i].setAttribute('transform', `translate(${f(p[0], 2)} ${f(p[1], 2)}) scale(${f(hs, 3)})`);
      show(ctx.handles[i], sel);
    });

    // The cursor (2×, frame px): a press dips it on every click; held down during the drag.
    const [cx, cy] = toFrame(cam, keys(t, CURSOR));
    const press = CLICKS.reduce((m, c) => Math.max(m, 1 - Math.abs(t - c - 0.05) / 0.09), 0);
    const cs = 1.8 * (1 - 0.1 * Math.max(0, press));
    ctx.cursor.setAttribute('transform', `translate(${f(cx, 2)} ${f(cy, 2)}) scale(${f(cs, 4)})`);
    show(ctx.cursor, 1 - outSoft(prog(t, P(8), P(8.6))));

    ctx.q1.show(t, { at: P(0), out: P(11.5), outDur: 0.55 });
    ctx.q2.show(t, { at: P(3), out: P(11.5), outDur: 0.55 });
  },
};

export default scene;
