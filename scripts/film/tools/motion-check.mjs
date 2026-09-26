#!/usr/bin/env node
// Motion check: per-frame mean absolute difference (MAD, 0–255 luma, on a downscaled copy
// that averages the dither grain away) between consecutive frames of a rendered video.
// Flags (1) stalls: a near-duplicate frame while its neighbours move, and (2) jumps: a
// spike well above the local motion that is not at a cut. Writes a JSON report and a plot.
//   node scripts/film/tools/motion-check.mjs <video> [--from=<film s>] [--out=<dir>]
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, MONTAGE_CUTS, bar } from '../timeline.mjs';
import { videoStart } from './contact-sheet.mjs';

const SW = 240, SH = 136; // analysis size (each pixel averages a 8×8 block at 1080p)

function probe(video) {
  return new Promise((ok, fail) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,nb_frames', '-of', 'json', video]);
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    p.on('exit', (c) => {
      if (c) return fail(new Error('ffprobe failed'));
      const st = JSON.parse(s).streams[0];
      const [n, d] = st.avg_frame_rate.split('/').map(Number);
      ok({ fps: n / d, frames: Number(st.nb_frames) });
    });
  });
}

/** Per-frame MAD series of a video. */
export async function madSeries(video) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video,
    '-vf', `scale=${SW}:${SH}:flags=area,format=gray`, '-f', 'rawvideo', '-']);
  const size = SW * SH;
  const mads = [];
  let prev = null, buf = Buffer.alloc(0);
  p.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= size) {
      const frame = buf.subarray(0, size);
      if (prev) {
        let sum = 0;
        for (let i = 0; i < size; i++) sum += Math.abs(frame[i] - prev[i]);
        mads.push(sum / size);
      }
      prev = Buffer.from(frame);
      buf = buf.subarray(size);
    }
  });
  await new Promise((ok, fail) => p.on('exit', (c) => (c ? fail(new Error('ffmpeg decode failed')) : ok())));
  return mads;
}

/** Film times where a hard change is expected: cuts between scenes and montage cuts. */
export function cutTimes() {
  const cuts = SCENES.filter((s, i) => i > 0 && (s.in?.type ?? 'cut') === 'cut').map((s) => bar(s.from));
  return [...new Set([...cuts, ...MONTAGE_CUTS])].sort((a, b) => a - b);
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export function analyse(mads, { fps, from = 0 }) {
  const cuts = cutTimes();
  // Diff i is between frames i and i+1; it sits at the time of frame i+1.
  const at = (i) => from + (i + 1) / fps;
  const nearCut = (i) => cuts.some((c) => Math.abs(at(i) - c) <= 1.01 / fps);
  const stalls = [], jumps = [];
  for (let i = 0; i < mads.length; i++) {
    const before = mads.slice(Math.max(0, i - 4), i);
    const after = mads.slice(i + 1, i + 5);
    const around = Math.min(median(before.length ? before : after), median(after.length ? after : before));
    const neighbours = Math.min(mads[i - 1] ?? Infinity, mads[i + 1] ?? Infinity);
    const inner = i > 0 && i < mads.length - 1;
    if (inner && neighbours > 0.35 && mads[i] < 0.2 * neighbours && !nearCut(i)) {
      stalls.push({ frame: i + 1, t: +at(i).toFixed(3), mad: +mads[i].toFixed(3), neighbours: +neighbours.toFixed(3) });
    }
    const local = Math.max(median(before), median(after), 0.25);
    if (mads[i] > 2.5 && mads[i] > 4 * local && !nearCut(i)) {
      jumps.push({ frame: i + 1, t: +at(i).toFixed(3), mad: +mads[i].toFixed(3), local: +local.toFixed(3), around: +around.toFixed(3) });
    }
  }
  const sorted = [...mads].sort((a, b) => a - b);
  const q = (p) => +(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0).toFixed(3);
  return {
    frames: mads.length + 1,
    fps,
    from,
    stats: { mean: +(mads.reduce((a, b) => a + b, 0) / Math.max(1, mads.length)).toFixed(3), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) },
    cutsInRange: cuts.filter((c) => c > from && c < from + mads.length / fps),
    stalls,
    jumps,
  };
}

/** A plot of the MAD series (cuts in blue, flags in red) as PNG via ffmpeg. */
export async function plot(mads, report, out) {
  const W = 1600, H = 360, pad = 30;
  const img = Buffer.alloc(W * H * 3, 18);
  const px = (x, y, r, g, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    img[i] = r; img[i + 1] = g; img[i + 2] = b;
  };
  const maxV = Math.max(4, report.stats.p99 * 1.5);
  const X = (i) => Math.round(pad + ((W - 2 * pad) * i) / Math.max(1, mads.length - 1));
  const Y = (v) => Math.round(H - pad - ((H - 2 * pad) * Math.min(v, maxV)) / maxV);
  for (let v = 0; v <= maxV; v += 1) for (let x = pad; x < W - pad; x += 3) px(x, Y(v), 50, 50, 50);
  for (const c of report.cutsInRange) {
    const i = Math.round((c - report.from) * report.fps) - 1;
    for (let y = pad; y < H - pad; y++) px(X(i), y, 40, 110, 220);
  }
  for (let i = 1; i < mads.length; i++) {
    const [x0, y0, x1, y1] = [X(i - 1), Y(mads[i - 1]), X(i), Y(mads[i])];
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let k = 0; k <= n; k++) px(Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), 235, 235, 235);
  }
  for (const f of [...report.stalls, ...report.jumps]) {
    for (let d = -3; d <= 3; d++) for (let y = pad; y < pad + 12; y++) px(X(f.frame - 1) + d, y, 240, 60, 60);
  }
  await new Promise((ok, fail) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-i', '-', out]);
    p.stdin.end(img);
    p.on('exit', (c) => (c ? fail(new Error('plot failed')) : ok()));
  });
}

export async function motionCheck(video, { from, out } = {}) {
  const { fps } = await probe(video);
  const start = from ?? videoStart(video);
  const mads = await madSeries(video);
  const report = { video, ...analyse(mads, { fps, from: start }) };
  const dir = out ?? dirname(video);
  mkdirSync(dir, { recursive: true });
  const base = resolve(dir, `${basename(video, '.mp4')}-motion`);
  writeFileSync(`${base}.json`, `${JSON.stringify({ ...report, mads: mads.map((m) => +m.toFixed(3)) }, null, 1)}\n`);
  await plot(mads, report, `${base}.png`);
  return { ...report, json: `${base}.json`, png: `${base}.png` };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const video = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!video || !existsSync(video)) throw new Error('usage: motion-check.mjs <video> [--from=s] [--out=dir]');
  const r = await motionCheck(resolve(video), { from: args.from != null ? Number(args.from) : undefined, out: args.out });
  console.log(`${basename(video)}: ${r.frames} frames @ ${r.fps} fps from ${r.from} s`);
  console.log(`  MAD mean ${r.stats.mean}, p50 ${r.stats.p50}, p95 ${r.stats.p95}, p99 ${r.stats.p99}, max ${r.stats.max}`);
  console.log(`  cuts in range: ${r.cutsInRange.join(', ') || 'none'}`);
  console.log(`  stalls (duplicate frames during motion): ${r.stalls.length}${r.stalls.length ? ` — ${r.stalls.slice(0, 12).map((s) => s.t).join(', ')}` : ''}`);
  console.log(`  jumps (spikes not at a cut): ${r.jumps.length}${r.jumps.length ? ` — ${r.jumps.slice(0, 12).map((s) => `${s.t}(${s.mad})`).join(', ')}` : ''}`);
  console.log(`  report: ${r.json}\n  plot:   ${r.png}`);
  process.exitCode = r.stalls.length || r.jumps.length ? 2 : 0;
}
