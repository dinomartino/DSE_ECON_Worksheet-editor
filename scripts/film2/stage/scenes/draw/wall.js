// The Templates flash as a full-frame wall: twelve real template cards cut from
// template-picker frames (product pixels, rearranged), dealt 4 × 3 on a diagonal stagger,
// then held with a drift until the cut. Each tile is the card's own pixels at 2.4×.
import { h, show } from '../../lib/dom.js';
import { prog, outSoft, sineInOut } from '../../lib/ease.js';
import { f } from '../../lib/tween.js';
import { TILES, CARD_WH, APP } from './geom.js';

const COLS = 4, TW = 380, GAP = 32;
const K = TW / CARD_WH[0];
const TH = CARD_WH[1] * K;
const X0 = (1920 - (COLS * TW + (COLS - 1) * GAP)) / 2;
const Y0 = (1080 - (3 * TH + 2 * GAP)) / 2;

/** wall(parent, frameUrl) → { el, ready, set(t) } (t in seconds from the cut). */
export function wall(parent, frameUrl) {
  const el = h('div', { style: { position: 'absolute', inset: 0, transformOrigin: '960px 540px' } }, parent);
  const imgs = [];
  const tiles = TILES.map(([frame, x, y], i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const box = h('div', { style: {
      position: 'absolute', left: `${f(X0 + col * (TW + GAP), 2)}px`, top: `${f(Y0 + row * (TH + GAP), 2)}px`,
      width: `${TW}px`, height: `${f(TH, 2)}px`, overflow: 'hidden', borderRadius: `${f(9 * K, 1)}px`,
      boxShadow: '0 1px 2px rgb(0 0 0 / 0.07), 0 8px 24px -6px rgb(0 0 0 / 0.13)', willChange: 'transform, opacity',
    } }, el);
    const img = h('img', { src: frameUrl(frame), style: {
      position: 'absolute', left: `${f(-x * K, 2)}px`, top: `${f(-y * K, 2)}px`, width: `${f(APP.w * K, 2)}px`, height: `${f(APP.h * K, 2)}px`, maxWidth: 'none',
    } }, box);
    imgs.push(img);
    return { box, order: col + row };
  });
  const ready = Promise.all(imgs.map((im) => im.decode()));
  function set(t) {
    el.style.transform = `scale(${f(1 + 0.02 * sineInOut(prog(t, 0.3, 1.33)), 5)})`;
    for (const tl of tiles) {
      const p = outSoft(prog(t, tl.order * 0.05, tl.order * 0.05 + 0.42));
      show(tl.box, p);
      tl.box.style.transform = p < 1 ? `translateY(${f((1 - p) * 40, 2)}px) scale(${f(0.94 + 0.06 * p, 4)})` : 'none';
    }
  }
  return { el, ready, set };
}
