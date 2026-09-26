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
import { SUBTITLE_PAGE, captionAlpha } from './subtitles.mjs';
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

/** Each subtitle's text as an RGBA bitmap at output size, and where it sits. */
async function renderCaptions(browser, texts) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(SUBTITLE_PAGE);
  const { default: sharp } = await import('sharp');
  const out = new Map();
  for (const text of texts) {
    const clip = await page.evaluate((t) => window.__subtitle.layout(t), text);
    const png = await page.screenshot({ clip, omitBackground: true });
    const { data, info } = await sharp(png).resize(clip.width, clip.height).ensureAlpha().raw()
      .toBuffer({ resolveWithObject: true });
    out.set(text, { data, width: info.width, height: info.height, left: Math.round(clip.x), top: Math.round(clip.y) });
  }
  await ctx.close();
  return out;
}

/** The same bitmap with its alpha scaled by `k`. */
function faded(cap, k) {
  if (k >= 1) return cap.data;
  const data = Buffer.from(cap.data);
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * k);
  return data;
}

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
    const sub = captionAlpha(cues, t, end, fps);
    const key = `${starts[j].file}|${[cam.x, cam.y, cam.w].map((v) => v.toFixed(2))}|${sub ? `${sub.text}@${sub.alpha}` : ''}`;
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
      const cap = captions.get(sub.text);
      img = img.composite([{ input: faded(cap, sub.alpha), raw: { width: cap.width, height: cap.height, channels: 4 }, left: cap.left, top: cap.top }]);
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
