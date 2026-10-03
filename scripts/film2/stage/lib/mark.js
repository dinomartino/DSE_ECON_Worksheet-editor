// The mark and its launch animation "Draw the market", geometry and phases exactly as
// src/launch/splash.ts + splash.css (copied, never imported). at(ms) poses every part at
// splash time ms (0..1300); a scene plays it slower by passing ms = seconds * 1000 / k.
import { s, h, drawable, show, C } from './dom.js';
import { prog, lerp, outCubic, inOutCubic, outBack, wordIn, linear } from './ease.js';
import { f } from './tween.js';
import { block } from './type.js';

/** The splash phases: [delay ms, duration ms, curve]. */
export const PHASES = {
  tile: [0, 160, outCubic],
  axisV: [80, 320, outCubic],
  axisH: [120, 300, outCubic],
  demand: [300, 420, inOutCubic],
  supply: [360, 420, inOutCubic],
  knock: [680, 220, outBack],
  dot: [740, 220, outBack],
  ripple: [900, 400, outCubic],
  word: [715, 380, wordIn],
};
export const SPLASH_MS = 1300;
const ph = (name, ms) => {
  const [d, dur, e] = PHASES[name];
  return e(prog(ms, d, d + dur));
};
const about = (sc, cx = 256, cy = 256) => `translate(${cx} ${cy}) scale(${f(sc, 5)}) translate(${-cx} ${-cy})`;

/**
 * The mark tile, `size` px square, its top-left at (x, y) in the parent. Returns
 * { el, svg, parts, at(ms) }. parts: tile, axisV, axisH, demand, supply, knock, dot, ripple.
 */
export function mark(parent, { x = 0, y = 0, size = 360 } = {}) {
  const el = h('div', { class: 'mark', style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${size}px`, height: `${size}px` } }, parent);
  const svg = s('svg', { viewBox: '0 0 512 512', width: size, height: size, style: { display: 'block', overflow: 'visible' } }, el);
  const g = s('g', {}, svg);
  const tile = s('rect', { width: 512, height: 512, rx: 114, fill: C.markTile }, g);
  const axes = s('g', { opacity: 0.34, fill: 'none', stroke: C.markCream, 'stroke-width': 20, 'stroke-linecap': 'round' }, g);
  const axisV = s('path', { d: 'M118 394V106' }, axes);
  const axisH = s('path', { d: 'M118 394H406' }, axes);
  const curves = s('g', { fill: 'none', stroke: C.markCream, 'stroke-width': 30, 'stroke-linecap': 'round' }, g);
  const demand = s('path', { d: 'M150 150L362 362' }, curves);
  const supply = s('path', { d: 'M150 362L362 150' }, curves);
  const ripple = s('circle', { cx: 256, cy: 256, r: 100, fill: 'none', stroke: C.markBlue, opacity: 0 }, g);
  const knock = s('circle', { cx: 256, cy: 256, r: 46, fill: C.markTile }, g);
  const dot = s('circle', { cx: 256, cy: 256, r: 30, fill: C.markBlue }, g);
  const draw = {
    axisV: drawable(axisV, 288),
    axisH: drawable(axisH, 288),
    demand: drawable(demand, 300),
    supply: drawable(supply, 300),
  };
  const parts = { g, tile, axes, axisV, axisH, curves, demand, supply, ripple, knock, dot, draw };

  function at(ms) {
    const pt = ph('tile', ms);
    g.setAttribute('transform', about(lerp(0.9, 1, pt)));
    g.setAttribute('opacity', f(pt, 4));
    g.style.visibility = pt > 0 ? 'visible' : 'hidden';
    for (const k of ['axisV', 'axisH', 'demand', 'supply']) draw[k](ph(k, ms));
    knock.setAttribute('transform', about(ph('knock', ms)));
    dot.setAttribute('transform', about(ph('dot', ms)));
    // The ripple: grows .3 → 1 (ease-out) while fading .55 → 0 (linear); its stroke stays
    // 6 icon units wide however far it spreads (splash.css: non-scaling stroke).
    const [rd, rdur] = PHASES.ripple;
    const pr = prog(ms, rd, rd + rdur);
    const sc = lerp(0.3, 1, ph('ripple', ms));
    ripple.setAttribute('transform', about(sc));
    ripple.setAttribute('stroke-width', f(6 / sc, 3));
    ripple.setAttribute('opacity', pr > 0 && pr < 1 ? f(0.55 * (1 - linear(pr)), 4) : '0');
  }
  at(0);
  return { el, svg, parts, at, size };
}

/**
 * The splash lockup at any scale: the mark, then "Econ Studio" (Newsreader) and 經濟備課室
 * tracked .3em under it, centred on cx; top of the mark at `top`. Sizes default to the hero
 * scale (mark 360 px). at(ms) plays the splash; word(p) overrides the wordmark's progress.
 */
export function lockup(parent, { cx = 960, top = 200, size = 360, en = 110, zh = 46, copy } = {}) {
  const k = size / 104; // the splash's mark is 104 px at full size
  const m = mark(parent, { x: cx - size / 2, y: top, size });
  const gap = 14 * k;
  const word = block(parent, {
    en: copy?.en ?? 'Econ Studio', zh: copy?.zh ?? '經濟備課室',
    x: cx, y: top + size + gap, w: 1400, maxLines: 1, size: en, lh: 1.25, tracking: -0.01,
    zhSize: zh, zhTracking: 0.3, zhGap: 2 * k, zhColor: C.inkMuted, rise: 0,
  });
  const rise = 6 * k;
  function wordAt(p) {
    show(word.el, p);
    word.el.style.transform = p < 1 ? `translateY(${f((1 - p) * rise, 2)}px)` : 'none';
    for (const ln of word.lines) {
      show(ln, 1);
      ln.style.transform = 'none';
    }
    word.el.dataset.revealed = p >= 1 ? '1' : '0';
  }
  function at(ms) {
    m.at(ms);
    wordAt(ph('word', ms));
  }
  at(0);
  return { mark: m, word, at, wordAt, bottom: top + size + gap + word.height, k };
}
