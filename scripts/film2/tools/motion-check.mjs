#!/usr/bin/env node
// Motion check for film v2: per-frame MAD (mean absolute luma difference to the previous frame,
// 0-255, on a 240×136 area-averaged copy) and mean luma of a rendered video, against the cuts
// of scripts/film2/timeline.mjs SCENES (a scene entered by a cut or a match cut is a planned hard
// change at its `from`, and so is every time in a scene's `cuts`; push and iris transitions are
// planned motion around their `from`). Flags
//   stalls     MAD under --still for longer than --stall s (default 0.3), unless inside a hold
//   jumps      a MAD spike (> --jump × the local median and > 3) outside a transition window
//              and outside a planned cut (from 1 frame before it to 0.1 s after: a page dealt
//              in at once settles over a few frames)
//   flashes    a run of ≤ 0.15 s whose mean luma is black (< 8) or white (> 247) while the
//              picture on both sides is not
//   weakCuts   a scene cut that shows no change (MAD < 1.5 within ± 1 frame)
//   staleCuts  the same for a declared in-act cut: reported, not failed (the scene moved on)
// A hold is declared in timeline.mjs as `holds: [[from, to], …]` (film seconds) on a scene, or
// with --hold=a-b,c-d. Exit 1 when any of the first three, or a weak cut, is found.
//   node scripts/film2/tools/motion-check.mjs <video> [--from=<film s of the first frame>]
//                                             [--out=<dir>] [--still=0.08] [--stall=0.3] [--jump=5]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCENES, halfIn, isCut } from '../timeline.mjs';
import { OUT } from '../paths.mjs';

export const SW = 240, SH = 136;

/** --name[=value] flags and positionals; unknown flags exit 2, --help exits 0. */
export function parseFlags(name, summary, known, argv = process.argv.slice(2), { positional = 1 } = {}) {
  const help = `${name} <${positional ? 'input' : ''}> [flags]\n${summary}\n${Object.entries(known).map(([k, v]) => `  --${k.padEnd(10)} ${v}`).join('\n')}\n  --help       this text`;
  const o = {}, pos = [];
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) {
      pos.push(a);
      continue;
    }
    if (m[1] !== 'help' && !(m[1] in known)) {
      console.error(`${name}: unknown argument ${a} (--help lists the flags)`);
      process.exit(2);
    }
    o[m[1]] = m[2] ?? true;
  }
  if (o.help) {
    console.log(help);
    process.exit(0);
  }
  if (pos.length !== positional) {
    console.error(`${name}: expected ${positional} input, got ${pos.length} (--help)`);
    process.exit(2);
  }
  return { o, pos };
}

export function probe(video) {
  return new Promise((ok, fail) => {
    const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate,r_frame_rate,nb_frames,duration', '-of', 'json', video]);
    let s = '';
    p.stdout.on('data', (d) => (s += d));
    p.on('exit', (c) => {
      if (c) return fail(new Error(`ffprobe failed for ${video}`));
      const st = JSON.parse(s).streams[0];
      const [n, d] = (st.avg_frame_rate !== '0/0' ? st.avg_frame_rate : st.r_frame_rate).split('/').map(Number);
      ok({ fps: n / d, frames: Number(st.nb_frames) || null, duration: Number(st.duration) || null });
    });
  });
}

/** Decodes every frame (passthrough: no duplicated or dropped frames) → { mad[i] vs frame i-1 (mad[0] = 0), luma[i] }. */
export async function frameStats(video) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-vf', `scale=${SW}:${SH}:flags=area,format=gray`, '-fps_mode', 'passthrough', '-f', 'rawvideo', '-']);
  const size = SW * SH, mad = [], luma = [];
  let prev = null, buf = Buffer.alloc(0);
  p.stdout.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= size) {
      const f = Buffer.from(buf.subarray(0, size));
      let sum = 0, d = 0;
      for (let i = 0; i < size; i++) {
        sum += f[i];
        if (prev) d += Math.abs(f[i] - prev[i]);
      }
      mad.push(prev ? d / size : 0);
      luma.push(sum / size);
      prev = f;
      buf = buf.subarray(size);
    }
  });
  await new Promise((ok, fail) => p.on('exit', (c) => (c ? fail(new Error('ffmpeg decode failed')) : ok())));
  return { mad, luma };
}

/** Planned hard cuts (a scene entered by a cut), transition windows and declared holds, film seconds. */
export function plannedChanges() {
  const cuts = [], transitions = [], holds = [];
  SCENES.forEach((s, i) => {
    if (i > 0 && isCut(s)) cuts.push({ t: s.from, scene: s.id, kind: s.in?.type ?? 'cut' });
    for (const t of s.cuts ?? []) cuts.push({ t, scene: s.id, kind: 'in-act' });
    if (i > 0 && !isCut(s)) transitions.push({ a: s.from - halfIn(s), b: s.from + halfIn(s), scene: s.id, type: s.in.type });
    for (const h of s.holds ?? (s.hold ? [s.hold] : [])) holds.push(Array.isArray(h) ? h : [h.from, h.to]);
  });
  return { cuts, transitions, holds };
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
};

export function analyse({ mad, luma }, { fps, from = 0, still = 0.08, stall = 0.3, jump = 5, extraHolds = [] }) {
  const { cuts, transitions, holds: declared } = plannedChanges();
  const holds = [...declared, ...extraHolds];
  const t = (i) => from + i / fps;
  const nearCut = (i) => cuts.some((c) => Math.abs(t(i) - c.t) <= 1.01 / fps);
  const afterCut = (i) => cuts.some((c) => t(i) - c.t >= -1.01 / fps && t(i) - c.t <= 0.1 + 0.01 / fps);
  const inTransition = (i) => transitions.some((x) => t(i) >= x.a - 1 / fps && t(i) <= x.b + 1 / fps);
  const inHold = (a, b) => holds.some(([h0, h1]) => a >= h0 - 1 / fps && b <= h1 + 1 / fps);

  const stalls = [];
  for (let i = 1; i < mad.length; ) {
    if (mad[i] >= still || nearCut(i)) {
      i++;
      continue;
    }
    let j = i;
    while (j < mad.length && mad[j] < still) j++;
    const secs = (j - i + 1) / fps; // the run of identical frames, the first of them included
    if (secs > stall && !inHold(t(i - 1), t(j - 1))) stalls.push({ t: +t(i - 1).toFixed(3), seconds: +secs.toFixed(3), frames: j - i + 1 });
    i = j;
  }

  const jumps = [];
  for (let i = 1; i < mad.length; i++) {
    if (mad[i] <= 3 || afterCut(i) || inTransition(i)) continue;
    const near = [...mad.slice(Math.max(1, i - 6), i), ...mad.slice(i + 1, i + 7)];
    const local = Math.max(median(near), 0.3);
    if (mad[i] > jump * local) jumps.push({ t: +t(i).toFixed(3), frame: i, mad: +mad[i].toFixed(2), local: +local.toFixed(2), hardCut: mad[i] > 20 });
  }

  const flashes = [];
  const side = Math.round(0.05 * fps) + 1, maxRun = Math.round(0.15 * fps);
  const extreme = (l) => l < 8 || l > 247;
  for (let i = 0; i < luma.length; ) {
    if (!extreme(luma[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < luma.length && extreme(luma[j]) && (luma[j] < 8) === (luma[i] < 8)) j++;
    const before = luma[i - side], after = luma[j + side - 1];
    if (j - i <= maxRun && before != null && after != null && !extreme(before) && !extreme(after)) {
      flashes.push({ t: +t(i).toFixed(3), frames: j - i, luma: +luma[i].toFixed(1), kind: luma[i] < 8 ? 'black' : 'white' });
    }
    i = j;
  }

  const weak = cuts.map((c) => {
    const k = Math.round((c.t - from) * fps);
    const m = Math.max(...[k - 1, k, k + 1].map((x) => mad[x] ?? 0));
    return { ...c, mad: +m.toFixed(2), frame: k };
  }).filter((c) => c.t >= from && c.frame < mad.length && c.mad < 1.5);
  const weakCuts = weak.filter((c) => c.kind !== 'in-act');
  const staleCuts = weak.filter((c) => c.kind === 'in-act');

  const sorted = mad.slice(1).sort((a, b) => a - b);
  const q = (p) => +(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0).toFixed(3);
  return {
    frames: mad.length, fps, from, duration: +(mad.length / fps).toFixed(3),
    planned: { cuts: cuts.filter((c) => c.t >= from && c.t < from + mad.length / fps), transitions, holds },
    stats: { mean: +(sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length)).toFixed(3), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1) },
    stalls, jumps, flashes, weakCuts, staleCuts,
  };
}

export const parseRange = (s) => String(s ?? '').split(',').filter(Boolean).map((r) => r.split('-').map(Number));

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { o, pos } = parseFlags('node scripts/film2/tools/motion-check.mjs', 'stalls, jumps, flashes and weak cuts of a rendered video against timeline.mjs SCENES', {
    from: '<s> film time of the video\'s first frame (a partial render; default 0)',
    out: '<dir> report directory (default $FILM_OUT/motion)',
    still: '<mad> a frame this close to the last counts as still (default 0.08)',
    stall: '<s> a still run longer than this is a stall (default 0.3)',
    jump: '<x> spike over this multiple of the local median is a jump (default 5)',
    hold: '<a-b,c-d> extra holds, film seconds',
  });
  const video = resolve(pos[0]);
  const { fps } = await probe(video);
  const stats = await frameStats(video);
  const r = analyse(stats, { fps, from: Number(o.from ?? 0), still: Number(o.still ?? 0.08), stall: Number(o.stall ?? 0.3), jump: Number(o.jump ?? 5), extraHolds: parseRange(o.hold) });
  const dir = resolve(o.out ?? resolve(OUT, 'motion'));
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `${basename(video).replace(/\.[^.]+$/, '')}.json`);
  writeFileSync(file, `${JSON.stringify({ video, ...r }, null, 1)}\n`);
  console.log(`${basename(video)}: ${r.frames} frames at ${r.fps} fps from ${r.from} s; MAD mean ${r.stats.mean}, p95 ${r.stats.p95}, max ${r.stats.max}`);
  const sceneCuts = r.planned.cuts.filter((c) => c.kind !== 'in-act');
  console.log(`  planned: ${sceneCuts.map((c) => `${c.scene}@${c.t.toFixed(2)}`).join(' ') || 'no scene cut'}; ${r.planned.cuts.length - sceneCuts.length} in-act cuts, ${r.planned.transitions.length} transitions, ${r.planned.holds.length} holds`);
  for (const k of ['stalls', 'jumps', 'flashes', 'weakCuts', 'staleCuts']) {
    console.log(`  ${k}: ${r[k].length}`);
    for (const x of r[k].slice(0, 12)) console.log(`    ${JSON.stringify(x)}`);
  }
  console.log(`  report: ${file}`);
  process.exit(r.stalls.length || r.jumps.length || r.flashes.length || r.weakCuts.length ? 1 : 0);
}
