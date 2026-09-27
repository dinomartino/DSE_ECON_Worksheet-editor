// Frame-diff check for a captured clip (FILM.md §6.1 acceptance): the mean absolute
// difference between consecutive frames, duplicates inside scripted motion, and spikes
// (a jump several times larger than its neighbours).
//
//   node scripts/film/capture/check-clip.mjs <clip dir | clip name> [--json]
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SW = 480; // analysis size: fine enough for motion, fast to decode
const SH = 300;

/** Mean abs diff (0–255) between consecutive frames of `dir`, at SW×SH grey. */
export function frameDiffs(dir) {
  const frames = fs.readdirSync(dir).filter((f) => /^\d{5}\.jpg$/.test(f)).sort();
  if (frames.length < 2) return { count: frames.length, diffs: [] };
  const raw = execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-framerate', '60', '-start_number', '0',
    '-i', path.join(dir, '%05d.jpg'), '-vf', `scale=${SW}:${SH}:flags=area,format=gray`,
    '-f', 'rawvideo', '-',
  ], { maxBuffer: 1 << 30 });
  const size = SW * SH;
  const n = Math.floor(raw.length / size);
  const diffs = [];
  for (let i = 1; i < n; i++) {
    let sum = 0;
    const a = (i - 1) * size;
    const b = i * size;
    for (let p = 0; p < size; p++) sum += Math.abs(raw[a + p] - raw[b + p]);
    diffs.push(sum / size);
  }
  return { count: n, diffs };
}

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

/** Expand [[from, to], …] frame ranges to a Set. */
const frameSet = (ranges = []) => {
  const out = new Set();
  for (const [from, to] of ranges) for (let f = from; f <= to; f++) out.add(f);
  return out;
};

/**
 * Stats for one clip. A duplicate is a frame byte-identical to the one before it; it is
 * a fault only where the script moved something by at least one frame pixel
 * (`meta.expectChange`, [[from, to], …]). A spike is a diff > 4× the median of its ±6
 * neighbours and > 1.0: a cut-like jump (the reflows a clip is about are listed, not failed).
 */
export function checkClip(dir, meta = {}) {
  const { count, diffs } = frameDiffs(dir);
  const sorted = [...diffs].sort((a, b) => a - b);
  const expect = frameSet(meta.expectChange);
  const files = fs.readdirSync(dir).filter((f) => /^\d{5}\.jpg$/.test(f)).sort();
  const hashes = files.map((f) => crypto.createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex'));
  const dupes = [];
  const dupesInMotion = [];
  for (let f = 1; f < hashes.length; f++) {
    if (hashes[f] !== hashes[f - 1]) continue;
    dupes.push(f);
    if (expect.has(f)) dupesInMotion.push(f);
  }
  const spikes = [];
  diffs.forEach((d, i) => {
    const around = diffs.slice(Math.max(0, i - 6), i).concat(diffs.slice(i + 1, i + 7)).sort((a, b) => a - b);
    const med = around[Math.floor(around.length / 2)] ?? 0;
    if (d > 1.0 && d > 4 * Math.max(med, 0.05)) spikes.push({ frame: i + 1, diff: +d.toFixed(3), neighbours: +med.toFixed(3) });
  });
  return {
    frames: count,
    mean: +(diffs.reduce((a, b) => a + b, 0) / Math.max(1, diffs.length)).toFixed(4),
    median: +pct(sorted, 0.5).toFixed(4),
    p95: +pct(sorted, 0.95).toFixed(4),
    max: +(sorted[sorted.length - 1] ?? 0).toFixed(4),
    identicalPairs: dupes.length,
    motionFrames: expect.size,
    duplicatesInMotion: dupesInMotion,
    spikes,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = process.argv[2];
  if (!arg) {
    console.error('usage: check-clip.mjs <clip dir | clip name> [--json]');
    process.exit(1);
  }
  const { ASSETS } = await import('../paths.mjs');
  const dir = fs.existsSync(arg) ? path.resolve(arg) : path.join(ASSETS, 'clips', arg);
  const metaFile = `${dir}.json`;
  const meta = fs.existsSync(metaFile) ? JSON.parse(fs.readFileSync(metaFile, 'utf8')) : {};
  const stats = checkClip(dir, meta);
  if (process.argv.includes('--json')) console.log(JSON.stringify(stats, null, 1));
  else {
    console.log(`${path.basename(dir)}: ${stats.frames} frames · diff mean ${stats.mean} median ${stats.median} p95 ${stats.p95} max ${stats.max}`);
    console.log(`  identical pairs ${stats.identicalPairs} · motion frames ${stats.motionFrames} · duplicates in motion ${stats.duplicatesInMotion.length}` +
      (stats.duplicatesInMotion.length ? ` (${stats.duplicatesInMotion.slice(0, 20).join(', ')}${stats.duplicatesInMotion.length > 20 ? ', …' : ''})` : ''));
    console.log(`  spikes ${stats.spikes.length}${stats.spikes.length ? `: ${stats.spikes.map((s) => `#${s.frame} ${s.diff} (vs ${s.neighbours})`).join(', ')}` : ''}`);
  }
}
