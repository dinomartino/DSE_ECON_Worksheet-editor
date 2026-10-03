#!/usr/bin/env node
// Music + sfx → $FILM_OUT/audio/mix.wav (48 kHz stereo, 24-bit), mastered to -16 LUFS
// integrated and ≤ -1 dBTP. Order: music (from MUSIC.offset) ducked lightly under impacts and
// dense sfx clusters, + sfx.wav, tail fade, then gain + ffmpeg alimiter iterated against
// ebur128 until both numbers hold (ffmpeg's loudnorm falls back to dynamic mode; not used).
// Ducking reads sfx-events.json beside sfx.wav. Writes mix-report.json.
//   node scripts/film2/audio/mix.mjs [--sfx=<wav>] [--out=<wav>] [--duration=<s>] [--fade=1]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION, MUSIC } from '../timeline.mjs';
import { AUDIO, MUSIC_FILE } from '../paths.mjs';
import { readWav, writeWav } from './wav.mjs';
import { cli } from './cli.mjs';

const SR = 48000;
const LIM_DELAY = 5 * 48; // samples: alimiter attack 5 ms at 48 kHz
const DUCK = {
  impact: { depth: 3.5, pre: 0.05, hold: 0.3, release: 1.2 }, // dB, s
  cluster: { depth: 1.5, pre: 0.08, hold: 0.0, release: 0.5, count: 5, window: 1.0 }, // ≥ count voices within window
};

/** Music gain envelope in dB (≤ 0), one value per ms: the minimum of every duck. */
export function duckEnvelope(placed, duration) {
  const n = Math.ceil(duration * 1000) + 1;
  const env = new Float32Array(n);
  const duck = (a, b, { depth, pre, release }) => {
    // full depth on [a, b]; linear in dB over `pre` before and `release` after
    for (let i = Math.max(0, Math.floor((a - pre) * 1000)); i < Math.min(n, Math.ceil((b + release) * 1000)); i++) {
      const t = i / 1000;
      const k = t < a ? 1 - (a - t) / pre : t > b ? 1 - (t - b) / release : 1;
      env[i] = Math.min(env[i], -depth * Math.max(0, k));
    }
  };
  const ducks = [];
  for (const v of placed) if (v.duck) {
    duck(v.event_t, v.event_t + DUCK.impact.hold, DUCK.impact);
    ducks.push({ kind: 'impact', t: v.event_t, ...DUCK.impact });
  }
  const ts = placed.map((v) => v.event_t).sort((a, b) => a - b);
  const C = DUCK.cluster;
  for (let i = 0; i + C.count - 1 < ts.length; i++) {
    if (ts[i + C.count - 1] - ts[i] <= C.window) {
      let j = i + C.count - 1;
      while (j + 1 < ts.length && ts[j + 1] - ts[j] <= C.window / C.count) j++;
      duck(ts[i], ts[j], C);
      ducks.push({ kind: 'cluster', t: ts[i], end: ts[j], depth: C.depth });
      i = j;
    }
  }
  return { env, ducks };
}

/** ebur128 summary of a file: { lufs, lra, tp }. */
export function measure(file) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  const s = r.stderr.slice(r.stderr.lastIndexOf('Summary:'));
  const num = (re) => {
    const m = re.exec(s);
    return m ? Number(m[1]) : NaN;
  };
  return { lufs: num(/I:\s+(-?[\d.]+) LUFS/), lra: num(/LRA:\s+(-?[\d.]+) LU/), tp: num(/Peak:\s+(-?[\d.]+) dBFS/) };
}

function encode(src, dst, gainDb, limitDb) {
  const limit = 10 ** (limitDb / 20);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src,
    // alimiter delays its output by `attack` ms (uncompensated): pad the end, drop that many samples from the start
    '-af', `volume=${gainDb.toFixed(3)}dB,apad=pad_len=${LIM_DELAY},alimiter=limit=${limit.toFixed(5)}:attack=5:release=80:level=0,atrim=start_sample=${LIM_DELAY},asetpts=PTS-STARTPTS`,
    '-ar', String(SR), '-ac', '2', '-c:a', 'pcm_s24le', dst], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

export function mix({ sfxFile, out, duration = DURATION, fade = 1, target = -16, tpMax = -1 }) {
  mkdirSync(dirname(out), { recursive: true });
  if (!existsSync(MUSIC_FILE)) throw new Error(`music master missing: ${MUSIC_FILE}`);
  const music = readWav(MUSIC_FILE);
  if (music.sr !== SR) throw new Error(`music is ${music.sr} Hz`);
  const sfx = existsSync(sfxFile) ? readWav(sfxFile) : null;
  const evFile = resolve(dirname(sfxFile), 'sfx-events.json');
  const placed = sfx && existsSync(evFile) ? JSON.parse(readFileSync(evFile, 'utf8')).placed : [];
  const N = Math.round(duration * SR);
  const { env, ducks } = duckEnvelope(placed, duration);
  const off = Math.round(MUSIC.offset * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = (i / SR) * 1000, k = Math.min(env.length - 2, Math.floor(x));
    const g = 10 ** ((env[k] + (env[k + 1] - env[k]) * (x - k)) / 20);
    const s = i + off;
    L[i] = s < music.n ? music.ch[0][s] * g : 0;
    R[i] = s < music.n ? music.ch[1][s] * g : 0;
    if (sfx && i < sfx.n) {
      L[i] += sfx.ch[0][i];
      R[i] += sfx.ch[1][i];
    }
  }
  const nf = Math.min(N, Math.round(fade * SR));
  for (let i = 0; i < nf; i++) {
    const f = 0.5 + 0.5 * Math.cos((Math.PI * i) / nf);
    L[N - nf + i] *= f;
    R[N - nf + i] *= f;
  }
  const pre = `${out}.pre.wav`;
  writeWav(pre, [L, R], SR);
  const first = measure(pre);
  let gain = target - first.lufs, limit = tpMax - 0.3, last = null;
  const iterations = [];
  for (let it = 0; it < 8; it++) {
    encode(pre, out, gain, limit);
    last = measure(out);
    iterations.push({ gain: +gain.toFixed(2), limit: +limit.toFixed(2), ...last });
    const dl = target - last.lufs;
    const ok = Math.abs(dl) <= 0.1 && last.tp <= tpMax;
    if (ok) break;
    if (last.tp > tpMax) limit -= last.tp - tpMax + 0.1;
    if (Math.abs(dl) > 0.05) gain += dl;
  }
  rmSync(pre, { force: true });
  const report = { out, duration, premix: first, final: last, target, tpMax, passed: Math.abs(last.lufs - target) <= 0.1 && last.tp <= tpMax, sfx: sfxFile && !!sfx, ducks, iterations };
  writeFileSync(resolve(dirname(out), 'mix-report.json'), `${JSON.stringify(report, null, 1)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = cli('node scripts/film2/audio/mix.mjs', 'music + sfx.wav → mix.wav at -16 LUFS, ≤ -1 dBTP', {
    sfx: '<wav> sfx track (default $FILM_OUT/audio/sfx.wav; music only if missing)',
    out: '<wav> output (default $FILM_OUT/audio/mix.wav)',
    duration: '<s> length (default the film DURATION)',
    fade: '<s> tail fade-out (default 1)',
    target: '<LUFS> integrated loudness (default -16)',
    tp: '<dBTP> true-peak ceiling (default -1)',
  });
  const r = mix({
    sfxFile: resolve(a.sfx ?? resolve(AUDIO, 'sfx.wav')), out: resolve(a.out ?? resolve(AUDIO, 'mix.wav')),
    duration: Number(a.duration ?? DURATION), fade: Number(a.fade ?? 1), target: Number(a.target ?? -16), tpMax: Number(a.tp ?? -1),
  });
  console.log(`mix: ${r.final.lufs} LUFS, ${r.final.tp} dBTP, LRA ${r.final.lra} (premix ${r.premix.lufs} LUFS, ${r.iterations.length} passes, ${r.ducks.length} ducks) → ${r.out}`);
  if (!r.passed) {
    console.error('mix: target not met');
    process.exit(1);
  }
}
