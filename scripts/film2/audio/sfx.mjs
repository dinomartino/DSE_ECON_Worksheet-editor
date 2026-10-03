#!/usr/bin/env node
// Places sound effects from the film's events into $FILM_OUT/audio/sfx.wav (48 kHz stereo,
// float32, sfx only: mix.mjs lays it over the music) and writes sfx-events.json beside it.
// A JS mixer, so the same events always give the same bytes. Events come from
// $FILM_OUT/build/events.json (render.mjs writes it), --events=<file>, or --fetch (runs the
// stage headless and asks window.film.events()). What each event kind sounds like: sfxmap.mjs.
//   node scripts/film2/audio/sfx.mjs [--events=<file>|--fetch] [--out=<dir>] [--duration=<s>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION } from '../timeline.mjs';
import { AUDIO, BUILD, SFX } from '../paths.mjs';
import { SFX_MAP, kindOf } from './sfxmap.mjs';
import { readWav, writeWav } from './wav.mjs';
import { cli } from './cli.mjs';

const SR = 48000;
const MIN_UI_GAP = 0.06; // s between ui voices
const BURST_GAP = 0.4; // s: key events closer than this are one typing run
const db = (x) => 10 ** (x / 20);
const hash = (i) => ((Math.imul(i + 1, 2654435761) >>> 0) / 2 ** 32);

let catalogCache = null;
const catalog = () => (catalogCache ??= Object.fromEntries(JSON.parse(readFileSync(resolve(SFX, 'catalog.json'), 'utf8')).map((c) => [c.name, c])));
const wavCache = new Map();
const load = (name) => {
  if (!wavCache.has(name)) {
    const w = readWav(resolve(SFX, `${name}.wav`));
    if (w.sr !== SR) throw new Error(`${name}: ${w.sr} Hz, expected ${SR}`);
    wavCache.set(name, w);
  }
  return wavCache.get(name);
};

/** Events → voices: { kind, file, t, pos (s, film time of the file's sample 0), from, len (s), gain_db, pan, fade }. */
export function plan(events, { duration = DURATION } = {}) {
  const dropped = [];
  const raw = [];
  for (const e of events) {
    const kind = kindOf(e);
    if (kind && Number.isFinite(e.t)) raw.push({ e, kind });
  }
  raw.sort((a, b) => a.e.t - b.e.t);

  // Typing runs → one burst event each (start t, end t).
  const events2 = [];
  for (const r of raw) {
    const last = events2[events2.length - 1];
    if (SFX_MAP[r.kind].burst && last?.kind === r.kind && r.e.t - last.end < BURST_GAP) {
      last.end = Math.max(last.end, r.e.t + (r.e.dur ?? 0));
      last.n++;
      continue;
    }
    events2.push({ kind: r.kind, e: r.e, t: r.e.t, end: r.e.t + (r.e.dur ?? 0), n: 1 });
  }

  // Thin ui runs.
  let lastUi = -Infinity;
  const kept = [];
  for (const v of events2) {
    if (SFX_MAP[v.kind].ui) {
      if (v.t - lastUi < MIN_UI_GAP) {
        dropped.push({ kind: v.kind, t: v.t, why: `ui spacing < ${MIN_UI_GAP * 1000} ms` });
        continue;
      }
      lastUi = v.t;
    }
    kept.push(v);
  }

  const counters = {};
  const voices = [];
  for (const v of kept) {
    const m = SFX_MAP[v.kind];
    const idx = (counters[v.kind] = (counters[v.kind] ?? -1) + 1);
    const name = v.e.file && catalog()[v.e.file] ? v.e.file : m.files[idx % m.files.length];
    const cat = catalog()[name];
    if (!cat) throw new Error(`sfxmap: ${name} is not in catalog.json`);
    const gain = m.gain_db + (m.trim_db?.[name] ?? 0) + (hash(idx) - 0.5) * 1.4 + (v.e.gain_db ?? 0) + (v.kind === 'impact' && v.e.strength != null ? 20 * Math.log10(Math.max(0.1, v.e.strength)) : 0);
    const pan = v.e.pan ?? (m.panX && Number.isFinite(v.e.x) ? m.panX * Math.max(-1, Math.min(1, (v.e.x / 2880) * 2 - 1)) : 0);
    const base = { kind: v.kind, file: name, event_t: +v.t.toFixed(4), gain_db: +gain.toFixed(2), pan: +pan.toFixed(3), fade: m.fade };
    const dur = cat.duration_s;
    if (m.end) {
      const D = Math.min(v.e.dur ?? m.defDur ?? 3, dur);
      voices.push({ ...base, pos: v.t - D, from: dur - D, len: D, onset: null, fade: [Math.min(m.fade[0], D / 2), m.fade[1]] });
    } else if (m.burst) {
      const total = Math.max(0.5, v.end - v.t + 0.3);
      for (let k = 0, at = v.t; ; k++) {
        const f = m.files[(idx + k) % m.files.length];
        const c = catalog()[f];
        const len = Math.min(c.duration_s, v.t + total - at);
        voices.push({ ...base, file: f, pos: at - (k === 0 ? c.onset_s : 0), from: 0, len, onset: k === 0 ? c.onset_s : 0 });
        if (at + len >= v.t + total - 1e-6) break;
        at += Math.max(len - 0.12, 0.1);
      }
    } else {
      const len = Math.min(dur, m.maxDur ?? dur);
      for (const dt of [0, ...(m.repeat ?? [])]) voices.push({ ...base, event_t: +(v.t + dt).toFixed(4), pos: v.t + dt - cat.onset_s, from: 0, len, onset: cat.onset_s });
    }
  }
  voices.sort((a, b) => a.event_t - b.event_t || a.pos - b.pos);
  return { voices: voices.filter((v) => v.pos + v.len > 0 && v.pos < duration), dropped };
}

/** Mixes voices into stereo Float32 arrays of `duration` seconds. */
export function mixVoices(voices, duration) {
  const N = Math.ceil(duration * SR);
  const L = new Float32Array(N), R = new Float32Array(N);
  for (const v of voices) {
    const w = load(v.file);
    const g = db(v.gain_db);
    const theta = ((v.pan + 1) * Math.PI) / 4; // constant power, centre = 1/√2 each → ×√2 so centre is unity
    const gl = g * Math.cos(theta) * Math.SQRT2, gr = g * Math.sin(theta) * Math.SQRT2;
    const n = Math.round(v.len * SR), s0 = Math.round(v.from * SR), p0 = Math.round(v.pos * SR);
    const fi = Math.max(1, Math.round(v.fade[0] * SR)), fo = Math.max(1, Math.min(n, Math.round(v.fade[1] * SR)));
    const mono = w.ch.length === 1;
    for (let i = 0; i < n; i++) {
      const o = p0 + i;
      if (o < 0 || o >= N) continue;
      const s = s0 + i;
      if (s >= w.n) break;
      let f = 1;
      if (v.fade[0] > 0 && i < fi) f = 0.5 - 0.5 * Math.cos((Math.PI * i) / fi);
      if (n - i <= fo) f *= 0.5 + 0.5 * Math.cos((Math.PI * (fo - (n - i))) / fo);
      if (v.pos * SR + i < 0) f = 0;
      L[o] += w.ch[0][s] * gl * f;
      R[o] += w.ch[mono ? 0 : 1][s] * gr * f;
    }
  }
  return [L, R];
}

async function fetchEvents() {
  const { serve } = await import('../tools/serve.mjs');
  const { launch, openStage } = await import('../../film/tools/chrome.mjs');
  const server = await serve();
  const browser = await launch();
  try {
    const { context, page } = await openStage(browser, server.url, { w: 320, h: 180, fps: 30, shutter: 1 });
    const events = await page.evaluate(() => window.film.events());
    await context.close();
    return events;
  } finally {
    await browser.close();
    await server.close();
  }
}

export async function buildSfx({ events, outDir = AUDIO, duration = DURATION }) {
  mkdirSync(outDir, { recursive: true });
  const { voices, dropped } = plan(events, { duration });
  const [L, R] = mixVoices(voices, duration);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const wav = resolve(outDir, 'sfx.wav');
  writeWav(wav, [L, R], SR);
  const byKind = {};
  for (const v of voices) byKind[v.kind] = (byKind[v.kind] ?? 0) + 1;
  const report = {
    duration, sampleRate: SR, events: events.length, voices: voices.length, byKind,
    peakDbfs: +(20 * Math.log10(peak || 1e-9)).toFixed(2), thinned: dropped,
    placed: voices.map((v) => ({ kind: v.kind, file: v.file, event_t: v.event_t, start: +Math.max(0, v.pos).toFixed(4), len: +v.len.toFixed(3), gain_db: v.gain_db, pan: v.pan, duck: !!SFX_MAP[v.kind].duck })),
  };
  writeFileSync(resolve(outDir, 'sfx-events.json'), `${JSON.stringify(report, null, 1)}\n`);
  return { wav, report };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = cli('node scripts/film2/audio/sfx.mjs', 'events → $FILM_OUT/audio/sfx.wav + sfx-events.json', {
    events: '<file> events.json (default $FILM_OUT/build/events.json)',
    fetch: 'run the stage headless and read window.film.events() (writes build/events.json)',
    out: '<dir> output directory (default $FILM_OUT/audio)',
    duration: '<s> length of sfx.wav (default the film DURATION)',
  });
  let events;
  if (a.fetch) {
    events = await fetchEvents();
    mkdirSync(BUILD, { recursive: true });
    writeFileSync(resolve(BUILD, 'events.json'), `${JSON.stringify(events, null, 1)}\n`);
  } else {
    const file = resolve(a.events ?? resolve(BUILD, 'events.json'));
    if (!existsSync(file)) {
      console.error(`sfx: no events at ${file}; run render.mjs --events-only or pass --fetch`);
      process.exit(1);
    }
    events = JSON.parse(readFileSync(file, 'utf8'));
  }
  const { wav, report } = await buildSfx({ events, outDir: a.out ? resolve(a.out) : AUDIO, duration: Number(a.duration ?? DURATION) });
  console.log(`sfx: ${report.voices} voices from ${report.events} events (${report.thinned.length} thinned), peak ${report.peakDbfs} dBFS → ${wav}`);
  console.log(`  ${Object.entries(report.byKind).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
