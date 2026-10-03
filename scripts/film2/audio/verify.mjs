#!/usr/bin/env node
// Checks a built mix: loudness and true peak (ebur128), and that every impact's transient
// lands on its event time. The hit is found in sfx.wav (clean) as the sample peak inside
// ±60 ms of the event, and in mix.wav as the largest 1 ms energy rise in the same window.
// Exit 1 when LUFS is off by > 0.1, TP > -1, or a hit is off by > --tol ms.
//   node scripts/film2/audio/verify.mjs [--dir=<audio dir>] [--tol=5]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO, SFX } from '../paths.mjs';
import { readWav } from './wav.mjs';
import { measure } from './mix.mjs';
import { cli } from './cli.mjs';

const SR = 48000;

function peakTime(w, t, span) {
  let pk = 0, at = t;
  for (let i = Math.max(0, Math.round((t - span) * SR)); i < Math.min(w.n, Math.round((t + span) * SR)); i++) {
    const a = Math.max(Math.abs(w.ch[0][i]), Math.abs(w.ch[1][i]));
    if (a > pk) { pk = a; at = i / SR; }
  }
  return at;
}

/** 1 ms energy-rise series of w over [t0, t1). */
function rises(w, t0, t1) {
  const win = 48, out = [];
  let prev = 0;
  for (let s = Math.round(t0 * SR); s + win < Math.min(w.n, Math.round(t1 * SR)); s += win) {
    let e = 0;
    for (let i = s; i < s + win; i++) e += w.ch[0][i] ** 2 + w.ch[1][i] ** 2;
    e = Math.sqrt(e);
    out.push(Math.max(0, e - prev));
    prev = e;
  }
  return out;
}

/** Lag (ms) at which the mix's energy rises best match sfx.wav's around t: 0 = the hit is where the sfx put it. */
function mixLag(sfx, mixw, t) {
  const a = rises(sfx, t - 0.3, t + 0.3), b = rises(mixw, t - 0.3, t + 0.3);
  let best = -Infinity, lag = 0;
  for (let l = -20; l <= 20; l++) {
    let c = 0;
    for (let i = 25; i < a.length - 25; i++) c += a[i] * b[i + l];
    if (c > best) { best = c; lag = l; }
  }
  return lag;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = cli('node scripts/film2/audio/verify.mjs', 'loudness, true peak and impact timing of a built mix', {
    dir: '<dir> folder with sfx.wav, sfx-events.json, mix.wav (default $FILM_OUT/audio)',
    tol: '<ms> allowed hit error (default 5)',
  });
  const dir = resolve(a.dir ?? AUDIO), tol = Number(a.tol ?? 5);
  const report = JSON.parse(readFileSync(resolve(dir, 'sfx-events.json'), 'utf8'));
  const sfx = readWav(resolve(dir, 'sfx.wav')), mixw = readWav(resolve(dir, 'mix.wav'));
  const m = measure(resolve(dir, 'mix.wav'));
  console.log(`mix: ${m.lufs} LUFS integrated, ${m.tp} dBTP, LRA ${m.lra}`);
  let bad = Math.abs(m.lufs + 16) > 0.1 || m.tp > -1;
  const cat = Object.fromEntries(JSON.parse(readFileSync(resolve(SFX, 'catalog.json'), 'utf8')).map((c) => [c.name, c]));
  for (const v of report.placed.filter((p) => p.duck === true)) {
    // the file's own loudest sample near its onset marks where its hit sits; it must land at event_t + that distance
    const src = readWav(resolve(SFX, `${v.file}.wav`)), on = cat[v.file].onset_s;
    const dist = peakTime(src, on + 0.03, 0.06) - on;
    const got = peakTime(sfx, v.event_t + dist, 0.03);
    const err = (got - (v.event_t + dist)) * 1000, lag = mixLag(sfx, mixw, v.event_t);
    console.log(`impact ${v.file} @ ${v.event_t} s: hit peak ${got.toFixed(4)} s = event + ${(dist * 1000).toFixed(1)} ms (onset to peak), error ${err.toFixed(2)} ms; mix vs sfx lag ${lag} ms`);
    if (Math.abs(err) > tol || Math.abs(lag) > tol) bad = true;
  }
  if (bad) {
    console.error('verify: out of tolerance');
    process.exit(1);
  }
}
