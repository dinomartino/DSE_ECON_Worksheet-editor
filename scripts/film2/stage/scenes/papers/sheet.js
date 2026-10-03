// Printed sheets (A4 print previews, 2379×3366 px) as flat paper: white, the app's paper
// shadow, no gloss, no tilt. A sheet shows its whole page, or a crop of it (a close-up of
// real pixels) that can open out to the whole page. Images are decoded and downscaled once
// at setup, so update only writes transforms.
import { h, show, f, C, PAPER_SHADOW } from '../../lib/index.js';

export const SHEET_W = 2379, SHEET_H = 3366;

/** Decodes `url`, downscales it to `w` px wide once, and returns a decoded <img> of that. */
export async function loadSheet(url, w = 900) {
  const src = new Image();
  src.src = url;
  await src.decode();
  const ht = Math.round((w * src.naturalHeight) / src.naturalWidth);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = ht;
  const g = cv.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, ht);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const img = new Image();
  img.decoding = 'sync';
  img.src = URL.createObjectURL(blob);
  await img.decode();
  Object.assign(img.style, { width: `${w}px`, height: `${ht}px` });
  return img;
}

/**
 * sheet(parent, canvases[]) → { el, set({ x, y, w, crop, rot, opacity, face }) }:
 * (x, y) is the centre in design px, w the shown width; crop = [sx, sy, sw, sh] in sheet px
 * (default the whole page); face picks which canvas shows (cut, never blended).
 */
export function sheet(parent, canvases, { radius = 3 } = {}) {
  const el = h('div', { class: 'sheet', style: {
    position: 'absolute', left: 0, top: 0, background: C.paper, boxShadow: PAPER_SHADOW,
    borderRadius: `${radius}px`, overflow: 'hidden', transformOrigin: '50% 50%',
  } }, parent);
  // Each sheet gets its own copies of the images (one node can only sit in one place).
  const faces = canvases.map((src) => {
    const cv = src.cloneNode();
    Object.assign(cv.style, { position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', visibility: 'hidden' });
    el.appendChild(cv);
    return cv;
  });
  const ready = Promise.all(faces.map((cv) => cv.decode()));
  function set({ x = 960, y = 540, w = 400, crop = [0, 0, SHEET_W, SHEET_H], rot = 0, opacity = 1, face = 0 }) {
    const [sx, sy, sw, sh] = crop;
    const k = w / sw;
    const ht = sh * k;
    Object.assign(el.style, {
      width: `${f(w, 2)}px`, height: `${f(ht, 2)}px`,
      transform: `translate(${f(x - w / 2, 2)}px, ${f(y - ht / 2, 2)}px)${rot ? ` rotate(${f(rot, 3)}deg)` : ''}`,
    });
    faces.forEach((cv, i) => {
      if (i !== face) {
        cv.style.visibility = 'hidden';
        return;
      }
      const ck = (SHEET_W / cv.naturalWidth) * k; // canvas px → shown px
      cv.style.visibility = 'visible';
      cv.style.transform = `translate(${f(-sx * k, 2)}px, ${f(-sy * k, 2)}px) scale(${f(ck, 5)})`;
    });
    show(el, opacity);
  }
  set({ opacity: 0 });
  return { el, set, ready };
}
