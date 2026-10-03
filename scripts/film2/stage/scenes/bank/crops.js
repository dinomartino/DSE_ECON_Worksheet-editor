// Real pixels, cut out: canvases cropped from a clip's decoded frame (frame px in, CSS px
// out), built once in setup. No pixel here is drawn by the film: the topic cards, their bars
// and the chart columns are the app's own frame, only revealed in a different order.
import { h } from '../../lib/dom.js';

/** Decodes frame `i` of a clip player's frame sequence (setup only). */
export async function frameImage(player, i) {
  const img = new Image();
  img.src = player.url(i);
  await img.decode();
  return img;
}

/** A canvas showing frame rect r (frame px) of img, sized r / 2 in CSS px. */
export function crop(img, r, parent, style = {}) {
  const cv = h('canvas', { width: r.w, height: r.h, style: {
    position: 'absolute', left: `${r.x / 2}px`, top: `${r.y / 2}px`, width: `${r.w / 2}px`, height: `${r.h / 2}px`, ...style,
  } }, parent);
  cv.getContext('2d', { willReadFrequently: true }).drawImage(img, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
  return cv;
}

/**
 * A topic card: its crop, with the coverage bar painted out in the card's own fill and a
 * second crop of just the bar on top, so the bar can wipe on. → { el, bar }
 */
export function topicCard(img, card, parent) {
  const el = h('div', { style: {
    position: 'absolute', left: `${card.x / 2}px`, top: `${card.y / 2}px`, width: `${card.w / 2}px`, height: `${card.h / 2}px`,
    borderRadius: '6px', overflow: 'hidden', transformOrigin: '50% 50%',
  } }, parent);
  const base = crop(img, card, el, { left: '0', top: '0' });
  const g = base.getContext('2d', { willReadFrequently: true });
  const b = card.bar;
  const [r, gg, bb] = g.getImageData(b.x - card.x - 10, b.y - card.y + b.h / 2, 1, 1).data;
  g.fillStyle = `rgb(${r} ${gg} ${bb})`;
  g.fillRect(b.x - card.x, b.y - card.y, b.w, b.h);
  const bar = crop(img, b, el, { left: `${(b.x - card.x) / 2}px`, top: `${(b.y - card.y) / 2}px` });
  return { el, bar };
}
