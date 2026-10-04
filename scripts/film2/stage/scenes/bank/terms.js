// The Check terms re-ink lift: Q1 D's line leaves the page as vector type, its wavy underline
// draws on at frame scale, then the glossary term sets in (剩 → 盈) and the underline retracts.
// Illustration of what the footage just proved; the replace itself is shown in footage after.
import { h, s, C } from '../../lib/dom.js';
import { lerp, prog, inOutSoft, outSoft } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';
import { wavyPath, stroke } from '../../lib/reink.js';
import { Q1D_TEXT, Q1D_SWAP, UNDERLINE_INK } from './geom.js';

const SIZE = 104; // px: the line at frame scale (about 6× its 17 px on the page)
const FACE = '"Songti TC", "STSong", "PingFang HK", serif';

export function termsLift(parent) {
  const el = h('div', { style: { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', whiteSpace: 'pre' } }, parent);
  const line = h('div', { style: { position: 'relative', font: `400 ${SIZE}px ${FACE}`, color: C.ink, lineHeight: '1.2', letterSpacing: '0.02em' } }, el);
  line.lang = 'zh-HK';
  const chars = [...Q1D_TEXT].map((ch) => h('span', { text: ch, style: { display: 'inline-block' } }, line));
  const swap = chars[Q1D_SWAP.i];
  const inn = h('span', { text: Q1D_SWAP.to, style: { position: 'absolute', top: 0, color: C.accent } }, line);
  const w = line.offsetWidth, ht = line.offsetHeight;
  inn.style.left = `${swap.offsetLeft}px`;
  const svg = s('svg', { width: w + 40, height: 60, style: { position: 'absolute', left: '-20px', top: `${ht - 8}px`, overflow: 'visible' } }, el);
  const wave = s('path', { d: wavyPath(20, 24, w, { amp: 7, wave: 30 }), fill: 'none', stroke: UNDERLINE_INK, 'stroke-width': 5, 'stroke-linecap': 'round' }, svg);
  const box = { w, h: ht };
  const target = { x: 960 - w / 2, y: 560 - ht / 2, w };

  /**
   * from: Q1 D's line on screen (design px rect) when the footage cuts away. Beats (scene s):
   * lift [lift, lift + dur]; underline draws [draw, draw + 0.45]; the swap at `swapAt`.
   */
  function at(t, { from, lift, dur, draw, swapAt }) {
    const p = inOutSoft(prog(t, lift, lift + dur));
    const k = Math.exp(lerp(Math.log(from.w / w), 0, p));
    const x = lerp(from.x, target.x, p), y = lerp(from.y, target.y, p);
    el.style.transform = `translate(${f(x, 2)}px, ${f(y, 2)}px) scale(${f(k, 5)})`;
    if (t < swapAt) stroke(wave, t, { at: draw, dur: 0.45, ease: outSoft });
    else stroke(wave, t, { at: swapAt + 0.12, dur: 0.4, ease: inOutSoft, reverse: true });
    const q = outSoft(prog(t, swapAt, swapAt + 0.4));
    swap.style.opacity = f(1 - q, 3);
    swap.style.transform = `translateY(${f(-0.35 * SIZE * q, 2)}px)`;
    inn.style.opacity = f(q, 3);
    inn.style.transform = `translateY(${f(0.35 * SIZE * (1 - q), 2)}px)`;
    // A slow push through the hold (still alive after the swap).
    const k2 = 1 + 0.03 * inOutSoft(prog(t, lift + dur, swapAt + 1.2));
    line.style.transform = k2 > 1 ? `scale(${f(k2, 5)})` : 'none';
    line.style.transformOrigin = '50% 50%';
    svg.style.transform = line.style.transform;
    svg.style.transformOrigin = `${f(w / 2 + 20)}px ${f(-ht / 2 + 8)}px`;
  }
  return { el, at, box };
}
