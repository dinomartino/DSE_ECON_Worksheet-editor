// The films' virtual camera, and the post pass that renders the final frames.
//
// The page is never zoomed: the app is filmed at 2× and whole, and `d.focus(...)` only
// records where the camera should look (a rect from real element boxes). After the
// recording, each output frame is cropped from its 2× source to the camera's rect,
// scaled to 1440×900, and the subtitle is composited on top, so subtitles never zoom.
//
// Motion (after Screen Studio-style product films): a push-in per meaningful step,
// never per click; ease-in-out over CAMERA.move seconds; `d.focus` waits for the move
// to land, so the camera holds still while the pointer works; zoom 1-2×; back to the
// full frame (`d.focus(null)`) before the pointer leaves the framed area.
import fs from 'node:fs';
import path from 'node:path';
import { LOOK, captionState, subtitlePage } from './subtitles.mjs';
import { VIEWPORT } from './flow.mjs';

// `room`: CSS px kept free below a target, so the subtitle band never covers what is framed.
export const CAMERA = { move: 0.8, pad: 40, maxZoom: 2, room: 90 };
const W = VIEWPORT.width;
const H = VIEWPORT.height;
const FULL = { x: 0, y: 0, w: W, h: H };

/** A box (CSS px) padded, grown to the frame's shape, zoom-capped, and kept on screen. */
export function frameRect(box, { pad = CAMERA.pad, maxZoom = CAMERA.maxZoom } = {}) {
  let w = box.width + 2 * pad;
  let h = box.height + 2 * pad;
  if (w / h < W / H) w = (h * W) / H;
  // Whole CSS pixels in the frame's 16:10, so a still clipped to it is exactly 1440×900 at 2×.
  w = Math.min(W, Math.round(Math.max(w, W / maxZoom) / 16) * 16);
  h = (w * H) / W;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const x = Math.round(Math.min(Math.max(cx - w / 2, 0), W - w));
  const y = Math.round(Math.min(Math.max(cy - h / 2, 0), H - h));
  return { x, y, w, h };
}

/** The union of several boxes. */
const union = (boxes) => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x, y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};

/**
 * Give driver `d` a camera: `await d.focus(target, opts)` moves it and waits until it
 * lands. `target` is a locator, a box {x, y, width, height}, an array of either (framed
 * together), or null for the full frame; `name` says what it frames, for the README.
 * `d.shots` keeps every move, for the post pass;
 * `d.framing()` is where the camera rests now (null = full frame), for stills.
 */
export function withCamera(d) {
  d.shots = [];
  let now = null;
  d.framing = () => now;
  /** Wait `seconds` of film time (a fast-forwarded step waits longer on the wall clock). */
  d.hold = (seconds) => d.wait(Math.round(seconds * 1000 * d.speedNow()));
  d.focus = async (target, { name = 'the action', pad, maxZoom, room = CAMERA.room, move = CAMERA.move } = {}) => {
    let rect = null;
    if (target) {
      const boxes = [];
      for (const t of Array.isArray(target) ? target : [target]) {
        const b = typeof t.boundingBox === 'function' ? await t.first().boundingBox() : t;
        if (!b) throw new Error('camera: the focus target has no box (hidden or detached)');
        boxes.push(b);
      }
      const box = union(boxes);
      rect = frameRect({ ...box, height: box.height + room }, { pad, maxZoom });
      if (rect.w >= W - 1) rect = null;
    }
    const same = (a, b) => (!a && !b) || (a && b && ['x', 'y', 'w'].every((k) => Math.abs(a[k] - b[k]) < 2));
    if (same(rect, now)) return;
    d.shots.push({ wall: Date.now() / 1000, rect, move, name, step: d.step() });
    now = rect;
    await d.wait(Math.round((move * 1000 + 120) * d.speedNow()));
  };
  return d;
}

const ease = (p) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2);

/** Between two rects: the centre glides, the width changes by constant ratio. */
function blend(a, b, p) {
  if (p <= 0) return a;
  if (p >= 1) return b;
  const w = Math.exp(Math.log(a.w) + (Math.log(b.w) - Math.log(a.w)) * p);
  const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * p;
  const cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * p;
  const h = (w * H) / W;
  return { x: Math.min(Math.max(cx - w / 2, 0), W - w), y: Math.min(Math.max(cy - h / 2, 0), H - h), w, h };
}

/** The camera at output time `t`, given shots with output times `at`. */
export function cameraAt(shots, t) {
  let from = FULL;
  let to = FULL;
  let at = -Infinity;
  let move = 0;
  const progress = (u) => (move ? ease(Math.min(1, Math.max(0, (u - at) / move))) : 1);
  for (const s of shots) {
    if (s.at > t) break;
    from = blend(from, to, progress(s.at));
    to = s.rect ?? FULL;
    at = s.at;
    move = s.move;
  }
  return blend(from, to, progress(t));
}

/**
 * Each subtitle set once at output size: its capsule's shape (`pill`, output px) and
 * the text's coverage (`words`, one channel, drawn in LOOK.ink) with where it sits.
 */
async function renderCaptions(browser, texts) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(subtitlePage());
  const { default: sharp } = await import('sharp');
  const out = new Map();
  for (const text of texts) {
    const { clip, pill } = await page.evaluate((t) => window.__subtitle.layout(t), text);
    const png = await page.screenshot({ clip, omitBackground: true });
    const cover = await sharp(png).resize(clip.width, clip.height).ensureAlpha().extractChannel(3).raw().toBuffer();
    out.set(text, { pill, words: { cover, left: clip.x, top: clip.y, width: clip.width, height: clip.height } });
  }
  await ctx.close();
  return out;
}

/** A composite layer of raw pixels at (left, top), its rows below the frame cut off. */
function layer(data, width, height, channels, left, top) {
  const rows = Math.min(height, H - top);
  return { input: data.subarray(0, rows * width * channels), raw: { width, height: rows, channels }, left, top };
}

const lerp = (a, b, p) => a + (b - a) * p;

/**
 * The subtitle's layers for sharp's composite over output frame `base` (raw RGB, W×H):
 * the frame behind the capsule blurred and saturated, the capsule's tint, edge and
 * shadow, then the words.
 */
async function captionLayers(sharp, base, captions, { capsule, words }) {
  const layers = [];
  const a = captions.get(capsule.from).pill;
  const b = captions.get(capsule.to).pill;
  const k = capsule.morph;
  // Centred and sitting on the same baseline, so only the width, height and corners move.
  const w = lerp(a.w, b.w, k);
  const h = lerp(a.h, b.h, k);
  const pill = { x: (W - w) / 2, y: b.y + b.h - h + capsule.rise, w, h, r: Math.min(lerp(a.r, b.r, k), h / 2) };

  // The glass: the frame behind the capsule, blurred and saturated, cut to its shape.
  const gx = Math.floor(pill.x);
  const gy = Math.floor(pill.y);
  const gw = Math.ceil(pill.x + pill.w) - gx;
  const gh = Math.ceil(pill.y + pill.h) - gy;
  const pad = Math.ceil(LOOK.blur * 3);
  const x0 = Math.max(0, gx - pad);
  const y0 = Math.max(0, gy - pad);
  const around = { left: x0, top: y0, width: Math.min(W, gx + gw + pad) - x0, height: Math.min(H, gy + gh + pad) - y0 };
  const blurred = await sharp(base, { raw: { width: W, height: H, channels: 3 } }).extract(around)
    .blur(LOOK.blur).modulate({ saturation: LOOK.saturate }).raw().toBuffer();
  const rect = (dx, dy, extra = '') =>
    `<rect x="${pill.x - dx}" y="${pill.y - dy}" width="${pill.w}" height="${pill.h}" rx="${pill.r}" ${extra}/>`;
  const svg = (width, height, body) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`);
  const mask = await sharp(svg(gw, gh, rect(gx, gy, `fill="#fff" fill-opacity="${capsule.alpha}"`))).extractChannel(3).raw().toBuffer();
  const glass = await sharp(blurred, { raw: { width: around.width, height: around.height, channels: 3 } })
    .extract({ left: gx - x0, top: gy - y0, width: gw, height: gh })
    .joinChannel(mask, { raw: { width: gw, height: gh, channels: 1 } }).raw().toBuffer();

  // Tint, hairline and shadow, drawn around the capsule with room for the shadow.
  const m = 48;
  const cx = gx - m;
  const cy = gy - m;
  const cw = gw + 2 * m;
  const ch = gh + 2 * m;
  const e = 0.5;
  const shadows = LOOK.shadows.map((s, i) =>
    `<filter id="s${i}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s.blur}"/></filter>` +
    rect(cx, cy - s.y, `fill="#000" fill-opacity="${s.alpha}" filter="url(#s${i})"`)).join('');
  const shadow = await sharp(svg(cw, ch, `<g opacity="${capsule.alpha}">${shadows}</g>`)).ensureAlpha().raw().toBuffer();
  const chrome = await sharp(svg(cw, ch,
    `<g opacity="${capsule.alpha}">${rect(cx, cy, `fill="${LOOK.tint}" fill-opacity="${LOOK.tintAlpha}"`)}` +
    `<rect x="${pill.x - cx + e}" y="${pill.y - cy + e}" width="${pill.w - 2 * e}" height="${pill.h - 2 * e}" rx="${pill.r - e}" ` +
    `fill="none" stroke="${LOOK.edge}" stroke-width="1"/></g>`)).ensureAlpha().raw().toBuffer();
  // Shadow, glass, then tint: under the glass the shadow is hidden, as CSS draws it only outside the box.
  layers.push(layer(shadow, cw, ch, 4, cx, cy), layer(glass, gw, gh, 4, gx, gy), layer(chrome, cw, ch, 4, cx, cy));

  if (words.alpha > 0) {
    const t = captions.get(words.text).words;
    let cover = t.cover;
    if (words.blur >= 0.3) {
      cover = await sharp(cover, { raw: { width: t.width, height: t.height, channels: 1 } }).blur(words.blur)
        .extractChannel(0).raw().toBuffer(); // blur hands back sRGB
    }
    const rgba = Buffer.alloc(t.width * t.height * 4);
    for (let i = 0, o = 0; i < cover.length; i++, o += 4) {
      rgba[o] = INK_RGB[0];
      rgba[o + 1] = INK_RGB[1];
      rgba[o + 2] = INK_RGB[2];
      rgba[o + 3] = Math.round(cover[i] * words.alpha);
    }
    layers.push(layer(rgba, t.width, t.height, 4, t.left, t.top + words.rise + capsule.rise));
  }
  return layers;
}

const INK_RGB = [1, 3, 5].map((i) => parseInt(LOOK.ink.slice(i, i + 2), 16));

/**
 * Write the output frame sequence: for frame k, the source frame showing at k/fps,
 * cropped to the camera, with the subtitle on top. A frame identical to the one
 * before it is a link to it. Returns the sequence's ffmpeg pattern.
 */
export async function renderFrames({ browser, starts, count, fps, shots, cues, end, seqDir, log }) {
  let sharp;
  try {
    ({ default: sharp } = await import('sharp'));
  } catch {
    throw new Error('demo: the post pass needs `sharp` (installed with next); run npm ci');
  }
  const captions = await renderCaptions(browser, [...new Set(cues.filter((c) => c.text).map((c) => c.text))]);
  const jobs = [];
  let j = 0;
  for (let k = 0; k < count; k++) {
    const t = k / fps;
    while (j + 1 < starts.length && starts[j + 1].at <= t) j++;
    const cam = cameraAt(shots, t);
    const sub = captionState(cues, t, end, fps);
    const key = `${starts[j].file}|${[cam.x, cam.y, cam.w].map((v) => v.toFixed(2))}|${sub ? JSON.stringify(sub) : ''}`;
    jobs.push({ k, src: starts[j].file, cam, sub, key });
  }

  const name = (k) => path.join(seqDir, `${String(k).padStart(6, '0')}.jpg`);
  const unique = jobs.filter((job, i) => i === 0 || job.key !== jobs[i - 1].key);
  log(`video: rendering ${unique.length} of ${count} frames through the camera…`);
  let small = 0;
  const render = async ({ k, src, cam, sub }) => {
    // Each frame's own size: the screencast is 2× (§ demo.mjs), but check, never assume.
    const meta = await sharp(src).metadata();
    const scale = meta.width / W;
    if (scale < 2 && cam.w < W - 1) small++;
    const left = Math.min(Math.round(cam.x * scale), meta.width - 1);
    const top = Math.min(Math.round(cam.y * scale), meta.height - 1);
    const box = {
      left, top,
      width: Math.min(Math.round(cam.w * scale), meta.width - left),
      height: Math.min(Math.round(cam.h * scale), meta.height - top),
    };
    let img = sharp(src).extract(box).resize(W, H, { kernel: 'lanczos3' });
    if (sub) {
      const base = await img.removeAlpha().raw().toBuffer();
      img = sharp(base, { raw: { width: W, height: H, channels: 3 } })
        .composite(await captionLayers(sharp, base, captions, sub));
    }
    await img.jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toFile(name(k));
  };
  for (let i = 0; i < unique.length; i += 8) await Promise.all(unique.slice(i, i + 8).map(render));
  if (small) log(`  camera: ${small} pushed-in frames were captured below 2×, so upscaled`);
  let last = 0;
  for (let i = 0; i < jobs.length; i++) {
    if (i > 0 && jobs[i].key === jobs[i - 1].key) fs.symlinkSync(name(last), name(i));
    else last = i;
  }
  return path.join(seqDir, '%06d.jpg');
}
