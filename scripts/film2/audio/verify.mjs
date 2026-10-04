#!/usr/bin/env node
// Checks a built mix: loudness and true peak (ebur128), and that every bloom and bell lands on
// its event time: the hit is where the sound first reaches 25 % of its peak in sfx.wav (clean),
// and sfx.wav's waveform must sit in mix.wav at lag 0 (cross-correlation). Prints each sound's
// loudness against the music's at its event (LU). Exit 1 when LUFS is off by > 0.1, TP > -1,
// or a hit is off by > --tol ms.
//   node scripts/film2/audio/verify.mjs [--dir=<audio dir>] [--tol=5]
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO, MUSIC_FILE } from '../paths.mjs';
import { kPower, momentary } from './kit/dsp.mjs';
import { readWav } from './wav.mjs';
import { measure } from './mix.mjs';
import { cli } from './cli.mjs';

const SR = 48000;

/**
 * Film time where the sound at t speaks: the first sample from t − span whose |x| reaches 25 % of
 * the loudest |x| over [t, t + 0.15] (a low thump's energy peaks a cycle late; its onset does not).
 */
function hitTime(w, t, span = 0.06) {
  const amp = (i) => Math.max(Math.abs(w.ch[0][i]), Math.abs(w.ch[1][i]));
  let pk = 0;
  for (let i = Math.round(t * SR); i < Math.round((t + 0.15) * SR); i++) pk = Math.max(pk, amp(i));
  for (let i = Math.round((t - span) * SR); i < Math.round((t + 0.15) * SR); i++) if (amp(i) >= 0.25 * pk) return i / SR;
  return NaN;
}

/** Lag (ms) of sfx.wav's waveform inside mix.wav around t (the music is uncorrelated with it): 0 = in place. */
function mixLag(sfx, mixw, t) {
  const a = Math.round((t - 0.1) * SR), b = Math.round((t + 0.4) * SR), L = 48 * 20;
  let best = -Infinity, lag = 0;
  for (let l = -L; l <= L; l++) {
    let c = 0;
    for (let i = a; i < b; i += 2) c += sfx.ch[0][i] * (mixw.ch[0][i + l] ?? 0) + sfx.ch[1][i] * (mixw.ch[1][i + l] ?? 0);
    if (c > best) { best = c; lag = l; }
  }
  return (lag / SR) * 1000;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = cli('node scripts/film2/audio/verify.mjs', 'loudness, true peak, hit timing and SFX levels of a built mix', {
    dir: '<dir> folder with sfx.wav, sfx-events.json, mix.wav (default $FILM_OUT/audio)',
    tol: '<ms> allowed hit error (default 5)',
  });
  const dir = resolve(a.dir ?? AUDIO), tol = Number(a.tol ?? 5);
  const report = JSON.parse(readFileSync(resolve(dir, 'sfx-events.json'), 'utf8'));
  const sfx = readWav(resolve(dir, 'sfx.wav')), mixw = readWav(resolve(dir, 'mix.wav'));
  const m = measure(resolve(dir, 'mix.wav'));
  console.log(`mix: ${m.lufs} LUFS integrated, ${m.tp} dBTP, LRA ${m.lra}`);
  let bad = Math.abs(m.lufs + 16) > 0.1 || m.tp > -1;
  for (const v of report.placed.filter((p) => p.sound === 'bloom' || p.sound === 'bell')) {
    const got = hitTime(sfx, v.event_t), err = (got - v.event_t) * 1000, lag = mixLag(sfx, mixw, v.event_t);
    console.log(`${v.sound} ${v.file} @ ${v.event_t} s: hit ${got.toFixed(4)} s, error ${err.toFixed(2)} ms; mix vs sfx lag ${lag.toFixed(2)} ms`);
    if (Math.abs(err) > tol || Math.abs(lag) > tol) bad = true;
  }
  // Each sound's loudest momentary loudness (sfx alone) against the music's there, in LU.
  const sp = kPower(sfx.ch), mp = kPower(readWav(MUSIC_FILE).ch);
  console.log('   t      sound    file          LU vs music  what');
  for (const v of report.placed) {
    let best = -Infinity, at = 0;
    for (let j = Math.max(0, Math.round(v.pos * 100)); j < Math.min(sp.length, Math.round((v.pos + v.len) * 100)); j++) {
      const x = momentary(sp, j);
      if (x > best) { best = x; at = j; }
    }
    const d = best - momentary(mp, at);
    console.log(`${v.event_t.toFixed(3).padStart(8)}  ${v.sound.padEnd(8)} ${v.file.padEnd(13)} ${d >= 0 ? '+' : ''}${d.toFixed(1).padStart(5)}        ${v.what}`);
  }
  if (bad) {
    console.error('verify: out of tolerance');
    process.exit(1);
  }
}
