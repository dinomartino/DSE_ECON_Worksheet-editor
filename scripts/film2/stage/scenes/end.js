// Act 7, the end (FILM.md §3). The act is entered by the axis chapter (engine.js, no label): a
// stroke wipes in from the right over B-2..B0 and the frame's axes draw and retract by B+4.
// Beats (P(n) = scene pulse n, P0 = bar 26 = 94.26 s):
//   P-2..P0  "Less formatting" (STATEMENT, C3) rises alone on y 540 as the wipe crosses it
//   P3..P4.75 the first line makes room; P4.5 "More teaching" rises under it
//   P6.5..P8.5 "Less formatting" pales to ink-subtle: less, then more. The read is alive: a
//            push 1 → STMT_PUSH about the axis line (y 1008) at constant speed runs from the
//            wipe to the fold, so the words also rise ~50 px
//   P11.5    the four lines squash into rules     P12.25..P15 they travel into the mark's strokes
//   P14.5    the tile grows under them            P16      knock + dot on bar 28 (the chime)
//   P16.25   the wordmark                         P20      "Free · No account needed" rises
//   104.40   the music's last stab (P22.8): the dot beats, a ripple runs out to the tile's edge
//            and the drift gets a soft kick that settles over 3 pulses
//   P15..the last frame (bar 29.5, 106.71 s): the card drifts 1 → DRIFT at constant speed about
//   its own centre (DRIFT_O: the lockup + free line span y 158..922), so it is visibly moving on every frame (no hold; timeline alive range, not holds), with a soft push
//   accent (KICK) on the stab; all of it at one speed, so the last seconds move as much as
//   the first (mean MAD ≥ 0.05 over 102..106.71 at 240×136, motion-check's measure)
// The lockup is the act-1 hero lockup (END_CARD: tile 360, wordmark 110, zh 46), at the mark
// act's own top (scenes/mark.js TOP) so the film ends on the shape it opened with.
import { lockup, block, h, place, show, f, C, ease, STATEMENT, END_CARD } from '../lib/index.js';
import { C3, STACK_GAP } from '../lib/layout.js';
import { AXIS_COLOR, TOP, ramp } from './mark.js';
import { PULSE } from '../../timeline.mjs';

const SIZE = END_CARD.size;
const K = SIZE / 512;
const X0 = END_CARD.cx - SIZE / 2;
const STMT_PUSH = 1.09; // the statement's push, about STMT_O
const STMT_O = [960, 1008]; // on the chapter's axis: the words grow up out of it, so they rise as they push
const DRIFT = 1.2; // the end card's drift about DRIFT_O, P15 → the last frame (+ KICK: ink y 81..999, measured)
const DRIFT_O = [960, 540]; // the card's centre: it pushes in evenly, the tile's edges carry the motion
const KICK = 0.012; // a push accent on the stab, settled over SETTLE pulses
const SETTLE = 3;
const STAB = 104.4; // film s: the music's last stab (RMS onset, mixkit-31 104.38–104.40)
const LEAD = 0.05; // s the dot runs early so it is visible on the chime's attack (sync #7)
const { prog, lerp, outSoft, inOutSoft, outCubic, cubicBezier } = ease;
const SQUASH = cubicBezier(0.65, 0, 0.8, 0.8);
const TRAVEL = cubicBezier(0.3, 0.3, 0.35, 1);

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
    { t: 11.5 * PULSE, kind: 'whoosh', size: 's', label: 'the words fold into lines' },
    { t: 16 * PULSE, kind: 'chime', label: 'the dot lands on bar 28: the lockup' },
  ],
  setup(ctx) {
    h('div', { style: { position: 'absolute', inset: 0, background: C.cream } }, ctx.el);
    ctx.group = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${DRIFT_O[0]}px ${DRIFT_O[1]}px` } }, ctx.el);
    ctx.stmt = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: `${STMT_O[0]}px ${STMT_O[1]}px` } }, ctx.el);
    const stmt = { ...STATEMENT, ...C3.statement, valign: 'top', y: 0 };
    ctx.less = block(ctx.stmt, { ...stmt, ...ctx.copy.less });
    ctx.more = block(ctx.stmt, { ...stmt, ...ctx.copy.more });
    const top = 540 - (ctx.less.height + STACK_GAP + ctx.more.height) / 2;
    ctx.less.at = top;
    ctx.more.at = top + ctx.less.height + STACK_GAP;
    ctx.less.el.style.top = `${f(ctx.less.at, 2)}px`;
    ctx.more.el.style.top = `${f(ctx.more.at, 2)}px`;
    // Alone, "Less formatting" stands centred on y 540: this far below its final place.
    ctx.drop = 540 - ctx.less.height / 2 - top;
    ctx.lessEn = ctx.less.lines.find((l) => !l.classList.contains('zh'));

    // The card: the hero lockup + the free line, the act-1 geometry.
    ctx.lock = lockup(ctx.group, { cx: END_CARD.cx, top: TOP, size: SIZE, en: END_CARD.en, zh: END_CARD.zh, copy: ctx.copy.name });
    const tg = END_CARD.tagline;
    ctx.free = block(ctx.group, {
      ...ctx.copy.free, x: END_CARD.cx, y: ctx.lock.bottom + tg.gap, w: tg.w, maxLines: tg.maxLines, face: tg.face, weight: tg.weight,
      // Ink-muted in en and zh, the act-1 tagline's tone (scenes/mark.js).
      size: tg.size, tracking: 0, color: C.inkMuted, zhSize: tg.zhSize, zhTracking: tg.zhTracking, zhColor: tg.zhColor, zhGap: tg.zhGap, rise: 16,
    });

    // Each text line's rule: through its glyphs' middle, as wide as the line, in frame px,
    // where it lies once the push has settled (STMT_PUSH) and the first line has made room.
    ctx.routes = ROUTE.map(([key, lang, stroke]) => {
      const b = ctx[key];
      const ln = b.lines.find((l) => l.classList.contains('zh') === (lang === 'zh'));
      const span = ln.querySelector('.i');
      const y = b.at + ln.offsetTop + ln.offsetHeight * (lang === 'zh' ? 0.52 : 0.56);
      const x = b.left + ln.offsetLeft + span.offsetLeft;
      ln.style.transformOrigin = `50% ${f(y - b.at - ln.offsetTop, 2)}px`;
      const at = ([px, py]) => [STMT_O[0] + STMT_PUSH * (px - STMT_O[0]), STMT_O[1] + STMT_PUSH * (py - STMT_O[1])];
      return {
        ln, stroke, from: [at([x, y]), at([x + span.offsetWidth, y])],
        width: (lang === 'zh' ? 3 : 4) * STMT_PUSH,
        color: lang === 'zh' ? C.inkMuted : key === 'less' ? C.inkSubtle : C.ink,
      };
    });
    const { parts } = ctx.lock.mark;
    for (const k of Object.keys(STROKES)) parts[k].setAttribute('stroke-dasharray', 'none');
  },
  update(ctx, t) {
    const P = (n) => ctx.pulse(n);
    // The statement: alive from the wipe until its rules leave (P12.25).
    place(ctx.stmt, { scale: lerp(1, STMT_PUSH, ramp(t, -P(2), P(12.25), P(1))) });
    ctx.less.show(t, { at: -P(1.35), dur: 0.8 });
    ctx.more.show(t, { at: P(4.5), dur: 0.8 });
    place(ctx.less.el, { y: ctx.drop * (1 - inOutSoft(prog(t, P(3), P(4.75)))) });
    ctx.lessEn.style.color = mix(C.ink, C.inkSubtle, inOutSoft(prog(t, P(6.5), P(8.5))));

    // The fold: each line squashes into its rule (P11.5..P12.25), the rule then travels into its
    // stroke (P12.25..P15) and takes the tile's colours as the tile grows under it.
    // The squash ends moving and the travel starts moving, so the hand-off never stops.
    const squash = SQUASH(prog(t, P(11.5), P(12.25)));
    const travel = TRAVEL(prog(t, P(12.25), P(15)));
    const ink = outSoft(prog(t, P(14.5), P(15.5)));
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
    }
    parts.axes.setAttribute('opacity', '1');

    // The mark: the tile grows from its centre under the strokes; knock, dot and ripple run
    // on the splash's own clock at half speed, the dot landing on P16 (LEAD early).
    ctx.lock.mark.at(740 + (t - P(16) + LEAD) * 500);
    for (const k of Object.keys(STROKES)) parts[k].removeAttribute('stroke-dashoffset');
    parts.g.removeAttribute('transform');
    parts.g.setAttribute('opacity', '1');
    parts.g.style.visibility = 'visible';
    const grow = inOutSoft(prog(t, P(14.5), P(16)));
    const sz = 512 * grow;
    parts.tile.setAttribute('x', f(256 - sz / 2, 3));
    parts.tile.setAttribute('y', f(256 - sz / 2, 3));
    parts.tile.setAttribute('width', f(sz, 3));
    parts.tile.setAttribute('height', f(sz, 3));
    parts.tile.setAttribute('rx', f(114 * grow, 3));
    parts.tile.style.visibility = grow > 0 ? 'visible' : 'hidden';
    // drawable() re-hides strokes at progress 0: they are ours, keep them as posed above.
    for (const r of ctx.routes) parts[r.stroke].style.visibility = squash > 0.02 ? 'visible' : 'hidden';

    // The last stab: the dot beats once and one ripple runs out to the tile's edge (3 pulses);
    // the shimmer (timeline end.stab) is its sound.
    const stab = t - (STAB - ctx.from);
    const about = (k) => `translate(256 256) scale(${f(k, 5)}) translate(-256 -256)`;
    if (stab >= 0) {
      const pr = prog(stab, 0, P(3));
      const sc = lerp(0.3, 1.9, outCubic(pr));
      parts.ripple.setAttribute('transform', about(sc));
      parts.ripple.setAttribute('stroke-width', f(10 / sc, 3));
      parts.ripple.setAttribute('opacity', pr < 1 ? f(0.85 * (1 - pr), 4) : '0');
      const beat = Math.sin(Math.PI * prog(stab, 0, 0.42));
      parts.dot.setAttribute('transform', about(1 + 0.18 * beat));
    }

    ctx.lock.wordAt(outSoft(prog(t, P(16.25), P(16.25) + 0.9)));
    ctx.free.show(t, { at: P(20), dur: P(2) });
    // The drift: about the card's centre at constant speed from P15 (as the strokes land) to the last frame (still moving there),
    // plus two kicks that ease out and stay: the landing (the chime) and the stab.
    const end = ctx.window.end - ctx.from;
    const kick = KICK * outSoft(prog(stab, 0, P(SETTLE)));
    const drift = ramp(t, P(15), end, P(1.5));
    place(ctx.group, { scale: lerp(1, DRIFT, drift) + kick });
  },
};

export default scene;
