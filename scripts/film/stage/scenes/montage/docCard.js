// The montage's .docx shot in 9:16: the same dark document window as word/docWindow.js,
// zoomed in on the real exported page (as a document app zoomed past fit-width), so the
// title, Q1 and its diagram are big on a phone. Real page pixels; generic chrome.
import { DOC } from '../word/docWindow.js';

const W = 2160; // canvas px
const CHROME = 1.8; // the title bar drawn larger than docWindow's: a phone has to read ".docx"
const BAR = Math.round((CHROME * 40 / 1440) * W);

/**
 * `map` is the .docx page texture (ctx.load bitmaps arrive flipped: drawn un-flipped here).
 * `crop` = [u0, v0, u1, v1] page fractions from the top-left; the window fits `fit` {w, h}.
 */
export function docCard(ctx, lib, map, { fit, crop }) {
  const [u0, v0, u1, v1] = crop;
  const aspectPage = DOC.aspect; // page h / w
  const regionH = Math.round((W * ((v1 - v0) * aspectPage)) / (u1 - u0));
  const H = BAR + regionH;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, BAR, W, regionH);
  const img = map.image;
  if (img) {
    const [iw, ih] = [img.width, img.height];
    const [sx, sw] = [u0 * iw, (u1 - u0) * iw];
    const [sy, sh] = [v0 * ih, (v1 - v0) * ih];
    g.save();
    g.translate(0, BAR + regionH);
    g.scale(1, -1);
    g.drawImage(img, sx, ih - sy - sh, sw, sh, 0, 0, W, regionH);
    g.restore();
  }
  // Title bar, as docWindow draws it.
  const s = (CHROME * W) / 1440;
  g.fillStyle = '#302E2C';
  g.fillRect(0, 0, W, BAR);
  g.fillStyle = 'rgba(0, 0, 0, 0.55)';
  g.fillRect(0, BAR - s, W, s);
  g.fillStyle = 'rgba(255, 255, 255, 0.06)';
  g.fillRect(0, 0, W, s);
  ['#FF5F57', '#FEBC2E', '#28C840'].forEach((col, i) => {
    g.beginPath();
    g.arc((22 + i * 20) * s, BAR / 2, 6.2 * s, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
  });
  g.fillStyle = '#D2CEC8';
  g.font = `600 ${13 * s}px -apple-system, "SF Pro Text", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(DOC.title, W / 2, BAR / 2 + 0.5 * s);
  const tex = new ctx.THREE.CanvasTexture(c);
  tex.colorSpace = ctx.THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  ctx.onDispose(() => tex.dispose());
  const aspect = W / H;
  const width = Math.min(fit.w, fit.h * aspect);
  const win = lib.win.appWindow({ variant: 'none', width, aspect, screen: tex, shadow: false, border: '#8A847D' });
  return { group: win.group, width, height: win.height, set: () => {} };
}
