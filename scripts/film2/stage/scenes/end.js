// Act 7, the end (FILM.md §3): on the music's pull-back, "Less formatting / More teaching";
// then everything folds back into lines: each of the four text lines squashes into a rule,
// the rules travel and turn into the mark's four strokes (axes, demand, supply), the tile
// grows under them, the dot lands (a chime) and the lockup + "Free · No account needed"
// settle. A slow drift ends on the music's tail; from there the frame holds, still, into
// silence. Beats (P(n) = scene pulse n; the act is entered by a push up centred on P0):
//   P0     "Less formatting" rides in with the push (already set)
//   P4     "More teaching"
//   P12    the four lines squash into rules          P13..P16 they travel into the mark
//   P15.5  the tile grows under them                 P17      knock + dot (chime)
//   P17.5  the wordmark                              P19.5    "Free · No account needed"
//   tail   (10.67 s, the music's tail section) the drift stops: a still hold to the end (108.48)
import { lockup, block, h, place, show, f, C, ease } from '../lib/index.js';
import { AXIS_COLOR } from './mark.js';

const SIZE = 220, TOP = 290; // the mark at end-card scale; its tile's top edge
const K = SIZE / 512;
const X0 = 960 - SIZE / 2;
const { prog, lerp, outSoft, inOutSoft } = ease;

// The mark's strokes in tile units [from, to, width] (lib/mark.js, src/launch/).
const STROKES = {
  axisV: [[118, 394], [118, 106], 20],
  axisH: [[118, 394], [406, 394], 20],
  demand: [[150, 150], [362, 362], 30],
  supply: [[150, 362], [362, 150], 30],
};
// Which text line becomes which stroke: the two long English lines the diagonals, the short
// Chinese lines the axes (the bottom one stays horizontal).
const ROUTE = [['less', 'en', 'demand'], ['less', 'zh', 'axisV'], ['more', 'en', 'supply'], ['more', 'zh', 'axisH']];

const toTile = ([x, y]) => [(x - X0) / K, (y - TOP) / K];

function mix(a, b, p) {
  const c = (hx) => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16));
  const [x, y] = [c(a), c(b)];
  const q = Math.min(1, Math.max(0, p));
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * q).toString(16).padStart(2, '0')).join('')}`;
}

const scene = {
  events: [
    { t: 5.334, kind: 'whoosh', size: 's', label: 'the words fold into lines' },
    { t: 7.557, kind: 'chime', label: 'the dot lands: the lockup' },
  ],
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 500px' } }, ctx.el);
    const stmt = { x: 960, w: 1400, maxLines: 1, size: 96, zhSize: 44, rise: 14 };
    ctx.less = block(ctx.el, { ...ctx.copy.less, ...stmt, y: 0 });
    ctx.more = block(ctx.el, { ...ctx.copy.more, ...stmt, y: 0 });
    const gap = 44;
    const top = 540 - (ctx.less.height + gap + ctx.more.height) / 2;
    ctx.less.el.style.top = `${f(top, 2)}px`;
    ctx.more.el.style.top = `${f(top + ctx.less.height + gap, 2)}px`;
    for (const b of [ctx.less, ctx.more]) b.top = top + (b === ctx.more ? ctx.less.height + gap : 0);

    // The card: lockup + one line, centred on the frame.
    ctx.lock = lockup(ctx.group, { cx: 960, top: TOP, size: SIZE, en: 68, zh: 28, copy: ctx.copy.name });
    ctx.free = block(ctx.group, {
      ...ctx.copy.free, x: 960, y: ctx.lock.bottom + 56, w: 1400, maxLines: 1, face: 'sans', weight: 500,
      size: 32, tracking: 0, color: C.inkMuted, zhSize: 22, zhTracking: 0.08, zhColor: C.inkSubtle, zhGap: 8, rise: 10,
    });

    // Each text line's rule: through its glyphs' middle, as wide as the line, in frame px.
    ctx.routes = ROUTE.map(([key, lang, stroke]) => {
      const b = ctx[key];
      const ln = b.lines.find((l) => l.classList.contains('zh') === (lang === 'zh'));
      const span = ln.querySelector('.i');
      const y = b.top + ln.offsetTop + ln.offsetHeight * (lang === 'zh' ? 0.52 : 0.56);
      const x = b.left + span.offsetLeft;
      ln.style.transformOrigin = `50% ${f(y - b.top - ln.offsetTop, 2)}px`;
      return { ln, stroke, from: [[x, y], [x + span.offsetWidth, y]], width: lang === 'zh' ? 3 : 4, color: lang === 'zh' ? C.inkMuted : C.ink };
    });
    const { parts } = ctx.lock.mark;
    for (const k of Object.keys(STROKES)) parts[k].setAttribute('stroke-dasharray', 'none');
  },
  update(ctx, t) {
    const P = (n) => ctx.pulse(n);
    ctx.less.show(t, { at: -3 });
    ctx.more.show(t, { at: P(4) });

    // The fold: each line squashes into its rule (P12..P13), the rule then travels into its
    // stroke (P13..P16) and takes the tile's colours as the tile grows under it.
    const squash = inOutSoft(prog(t, P(12), P(13)));
    const travel = inOutSoft(prog(t, P(13), P(16)));
    const ink = outSoft(prog(t, P(15.5), P(16.5)));
    const { parts } = ctx.lock.mark;
    for (const r of ctx.routes) {
      if (squash > 0) {
        r.ln.style.transform = `scaleY(${f(Math.max(0.001, 1 - squash), 4)})`;
        r.ln.style.visibility = squash >= 0.98 ? 'hidden' : 'visible';
      }
      const [a0, b0] = r.from.map(toTile);
      const [a1, b1, w1] = STROKES[r.stroke];
      const a = [lerp(a0[0], a1[0], travel), lerp(a0[1], a1[1], travel)];
      const b = [lerp(b0[0], b1[0], travel), lerp(b0[1], b1[1], travel)];
      const el = parts[r.stroke];
      el.setAttribute('d', `M${f(a[0], 2)} ${f(a[1], 2)}L${f(b[0], 2)} ${f(b[1], 2)}`);
      el.setAttribute('stroke-width', f(lerp((r.width * squash) / K, w1, travel), 3));
      const axis = r.stroke.startsWith('axis');
      el.setAttribute('stroke', mix(r.color, axis ? AXIS_COLOR : C.markCream, ink));
      el.style.visibility = squash > 0.02 ? 'visible' : 'hidden';
    }
    parts.axes.setAttribute('opacity', '1');

    // The mark: the tile grows from its centre under the strokes; knock, dot and ripple run
    // on the splash's own clock at half speed, the dot landing on P17.
    const ms = 740 + (t - P(17)) * 500;
    ctx.lock.mark.at(ms);
    for (const k of Object.keys(STROKES)) parts[k].removeAttribute('stroke-dashoffset');
    parts.g.removeAttribute('transform');
    parts.g.setAttribute('opacity', '1');
    parts.g.style.visibility = 'visible';
    const grow = outSoft(prog(t, P(15.5), P(17)));
    const sz = 512 * grow;
    parts.tile.setAttribute('x', f(256 - sz / 2, 3));
    parts.tile.setAttribute('y', f(256 - sz / 2, 3));
    parts.tile.setAttribute('width', f(sz, 3));
    parts.tile.setAttribute('height', f(sz, 3));
    parts.tile.setAttribute('rx', f(114 * grow, 3));
    parts.tile.style.visibility = grow > 0 ? 'visible' : 'hidden';
    // drawable() re-hides strokes at progress 0: they are ours, keep them as posed above.
    for (const r of ctx.routes) parts[r.stroke].style.visibility = squash > 0.02 ? 'visible' : 'hidden';

    ctx.lock.wordAt(outSoft(prog(t, P(17.5), P(17.5) + 0.9)));
    ctx.free.show(t, { at: P(19.5), dur: 0.8 });
    // A slow drift towards the camera from the dot to the music's tail, then still.
    const tail = ctx.tl.SECTIONS.find((x) => x.label === 'tail').t - ctx.from;
    place(ctx.group, { scale: lerp(1, 1.018, inOutSoft(prog(t, P(17), tail))) });
  },
};

export default scene;
