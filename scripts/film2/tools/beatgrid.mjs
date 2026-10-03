#!/usr/bin/env node
// Fits a constant-tempo beat grid to the track's librosa analysis and writes
// scripts/film2/beatgrid.<slug>.json, which timeline.mjs loads.
//   node scripts/film2/tools/beatgrid.mjs [--slug=<slug>] [--phase=0..3] [--tol=0.04]
// librosa's beat tracker drifts and can flip onto the off-beats in dense passages, so a
// plain least-squares fit over its beats is half a beat wrong somewhere. Instead: scan the
// period, keep the (period, phase) that the most beats agree with (within --tol s), then
// least-squares fit only those inliers. The downbeat (which beat of four starts a bar) is
// the phase that puts the analysis's section boundaries closest to bar lines; --phase
// overrides it. Check the result by ear: a click track is `--click` (writes build/click.wav).
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { MUSIC } from '../music.mjs';
import { FILM2_DIR, STOCK } from '../paths.mjs';

const FLAGS = { slug: '<slug> the track (default music.mjs)', phase: '<0..3> force the downbeat phase', tol: '<s> inlier tolerance (0.04)', help: 'this text' };
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (!m || !(m[1] in FLAGS)) {
    console.error(`beatgrid: unknown argument ${a} (--help)`);
    process.exit(2);
  }
  args[m[1]] = m[2] ?? true;
}
if (args.help) {
  console.log(`node scripts/film2/tools/beatgrid.mjs [flags]\n${Object.entries(FLAGS).map(([k, v]) => `  --${k.padEnd(6)} ${v}`).join('\n')}`);
  process.exit(0);
}

const slug = args.slug ?? MUSIC.slug;
const A = JSON.parse(readFileSync(resolve(STOCK, 'music', `${slug}.analysis.json`), 'utf8'));
const b = A.beat_times;
const tol = Number(args.tol ?? 0.04);

const ibi = b.slice(1).map((x, i) => x - b[i]).sort((x, y) => x - y);
const P0 = ibi[Math.floor(ibi.length / 2)];

/**
 * Beats within tol of the grid with period P through beat `ref`. Beats on the half-beat
 * (the tracker flipped onto the off-beats) count too, at half-integer k: they still measure
 * the period. `on` counts the whole-beat ones, which decide the phase.
 */
function agree(P, ref) {
  const inl = [];
  let on = 0;
  for (let i = 0; i < b.length; i++) {
    const k = Math.round((2 * (b[i] - b[ref])) / P) / 2;
    if (Math.abs(b[i] - b[ref] - k * P) > tol) continue;
    inl.push([k, b[i]]);
    if (Number.isInteger(k)) on++;
  }
  inl.on = on;
  return inl;
}

let best = { n: -1 };
for (let P = P0 * 0.97; P <= P0 * 1.03; P += 0.00005) {
  for (let ref = 0; ref < b.length; ref += 3) {
    const inl = agree(P, ref);
    const n = inl.length + inl.on / 1e4; // ties: the grid more beats sit on, not between
    if (n > best.n) best = { n, P, ref, inl };
  }
}

// Least squares t = t0 + k·P over the inliers.
const fit = (pts) => {
  const N = pts.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const [k, t] of pts) {
    sx += k; sy += t; sxx += k * k; sxy += k * t;
  }
  const P = (N * sxy - sx * sy) / (N * sxx - sx * sx);
  return { P, t0: (sy - P * sx) / N };
};
let { P, t0 } = fit(best.inl);
let pts = agree(P, best.ref);
({ P, t0 } = fit(pts)); // refit on the refined inlier set
// The beat is the grid most tracked beats sit on; the other one is the off-beat.
if (pts.on < pts.length / 2) t0 += P / 2;
const onBeat = Math.max(pts.on, pts.length - pts.on);
pts = pts.map(([k, t]) => [k, t]);
const res = pts.map(([k, t]) => { const d = t - t0 - k * P; return d - Math.round((2 * d) / P) * (P / 2); });
const rms = Math.sqrt(res.reduce((s, x) => s + x * x, 0) / res.length);
// The first grid beat at or after 0 s.
const firstBeat = t0 - Math.floor(t0 / P) * P;

const bounds = A.section_boundaries_s ?? [];
const phaseCost = (ph) =>
  bounds.reduce((s, x) => {
    const bar = 4 * P;
    const d = (((x - (firstBeat + ph * P)) % bar) + bar) % bar;
    return s + Math.min(d, bar - d);
  }, 0);
const costs = [0, 1, 2, 3].map(phaseCost);
const phase = args.phase != null ? Number(args.phase) : costs.indexOf(Math.min(...costs));

const out = {
  slug,
  file: `audio-stock/music/${slug}.mp3`,
  duration: A.duration_s,
  method: `constant tempo, consensus inliers (tol ${tol} s) + least squares over librosa beat_times`,
  bpm: +(60 / P).toFixed(4),
  beat: +P.toFixed(6),
  bar: +(4 * P).toFixed(6),
  beatsPerBar: 4,
  firstBeat: +firstBeat.toFixed(4),
  firstDownbeat: +(firstBeat + phase * P).toFixed(4),
  phase,
  phaseCosts: costs.map((c) => +c.toFixed(3)),
  inliers: `${pts.length}/${b.length} (${onBeat} on the beat, the rest on the off-beat)`,
  residual: { rms: +rms.toFixed(4), max: +Math.max(...res.map(Math.abs)).toFixed(4) },
  sections: bounds,
};
const file = resolve(FILM2_DIR, `beatgrid.${slug}.json`);
writeFileSync(file, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${slug}: ${out.bpm} BPM, beat ${out.beat} s, first downbeat ${out.firstDownbeat} s (phase ${phase}, costs ${out.phaseCosts.join('/')}), ${out.inliers} beats agree, residual rms ${out.residual.rms} s → ${file}`);
