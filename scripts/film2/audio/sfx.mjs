#!/usr/bin/env node
// Places the synthesised kit (audio/kit/) from the film's events into $FILM_OUT/audio/sfx.wav
// (48 kHz stereo, float32, sfx only: mix.mjs lays it over the music) and writes sfx-events.json
// beside it: every sound that plays (t, kit file, what it marks, level) and every event that was
// left silent, with why. Deterministic. Events come from $FILM_OUT/build/events.json (render.mjs
// writes it), --events=<file>, or --fetch (runs the stage headless and asks window.film.events()).
// Which events sound and how: sfxmap.mjs.
//   node scripts/film2/audio/sfx.mjs [--events=<file>|--fetch] [--out=<dir>] [--duration=<s>]
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DURATION, MUSIC } from '../timeline.mjs';
import { AUDIO, BUILD, KIT_DIR, MUSIC_FILE } from '../paths.mjs';
import { SOUNDS, RULES, LEVEL, kindOf } from './sfxmap.mjs';
import { ensureKit } from './kit/gen.mjs';
import { kPower, momentary } from './kit/dsp.mjs';
import { readWav, writeWav } from './wav.mjs';
import { cli } from './cli.mjs';

const SR = 48000;
const db = (x) => 10 ** (x / 20);
const HARMONY = JSON.parse(readFileSync(new URL('./kit/harmony.json', import.meta.url), 'utf8'));
const SILENT_KEYS = /^(select|deselect)$/; // footage key events that are not keystrokes

/** The chord sounding at film time t (harmony.json, one per beat). */
export function chordAt(t) {
  const tt = t + MUSIC.offset;
  let c = HARMONY.chords[0];
  for (const x of HARMONY.chords) if (x.t <= tt + 0.02) c = x;
  return c;
}
/** Accent percentile of the eighth pulse within tol of t, or 0 when t is off the pulse grid. */
export function accentAt(t, tol = RULES.accent.tol) {
  const tt = t + MUSIC.offset;
  let best = null;
  for (const a of HARMONY.accents) if (Math.abs(a.t - tt) <= tol && (!best || Math.abs(a.t - tt) < Math.abs(best.t - tt))) best = a;
  return best ? best.pct : 0;
}

/** The music master's momentary loudness (LUFS, 400 ms) at film time t. */
export function musicLevel(file = MUSIC_FILE) {
  if (!existsSync(file)) return null;
  const pw = kPower(readWav(file).ch);
  return (t) => momentary(pw, Math.round((t + MUSIC.offset) * 100));
}

/** Events → the sounds that play ({ e, sound, prio, size }) and the silent ones, with why. */
export function select(events) {
  const dropped = [], cands = [];
  const drop = (e, why) => dropped.push({ t: +e.t.toFixed(4), kind: e.sfx ?? e.kind, scene: e.scene ?? e.source, label: e.label ?? e.id ?? '', why });
  const keys = events.filter((e) => e.kind === 'key' && !SILENT_KEYS.test(String(e.label ?? ''))).map((e) => e.t);
  let lastTick = -Infinity;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const k = kindOf(e);
    if (!Number.isFinite(e.t)) continue;
    if (!k) {
      if (!/^(accent|clip)$/.test(String(e.sfx ?? e.kind)) && e.kind !== 'key') drop(e, `${e.sfx ?? e.kind}: silent in the kit`);
      continue;
    }
    const rule = RULES.drop.find((r) => (r.scene ? r.scene === e.scene && String(e.label ?? '').startsWith(r.label) : String(e.label ?? '').includes(r.labelHas)));
    if (rule) { drop(e, rule.why); continue; }
    if (k.sound === 'tick') {
      const inRun = keys.some((t) => t < e.t && e.t - t < RULES.runGap) && keys.some((t) => t > e.t && t - e.t < RULES.runGap);
      if (inRun) { drop(e, 'inside a typing run: the music carries typing'); continue; }
      if (e.t - lastTick < RULES.doubleGap) { drop(e, 'second click of a double-click'); continue; }
      lastTick = e.t;
    }
    if (RULES.accent.sounds.includes(k.sound) && accentAt(e.t) >= RULES.accent.pct) { drop(e, `lands on a strong music accent (pulse ≥ p${RULES.accent.pct})`); continue; }
    cands.push({ e, ...k });
  }
  // One sound per beat: the highest priority first; a big sound owns a window around it.
  const kept = [];
  for (const c of [...cands].sort((a, b) => b.prio - a.prio || a.e.t - b.e.t)) {
    const near = kept.find((k) => Math.abs(k.e.t - c.e.t) < RULES.minGap);
    const owner = kept.find((k) => RULES.owns[k.sound] && k.prio > c.prio && c.e.t >= k.e.t + RULES.owns[k.sound][0] && c.e.t <= k.e.t + RULES.owns[k.sound][1]);
    if (owner || near) { drop(c.e, `${(owner ?? near).sound} at ${(owner ?? near).e.t.toFixed(2)} s owns the ${owner ? 'window' : 'beat'}`); continue; }
    kept.push(c);
  }
  kept.sort((a, b) => a.e.t - b.e.t);
  dropped.sort((a, b) => a.t - b.t);
  return { kept, dropped };
}

/** The kit file a kept sound plays (sfxmap SOUNDS[sound].pick). */
function pickFile(c, n, files) {
  const own = files.filter((f) => f.sound === c.sound), pick = SOUNDS[c.sound].pick;
  const byId = (id) => own.find((f) => f.name === `${c.sound}-${id.replace('#', 's')}`);
  if (c.sound === 'air') return byId(c.size ?? 's');
  if (pick === 'cycle') return own[n % own.length];
  const ch = chordAt(c.e.t);
  if (pick === 'chord') return byId(ch.chord) ?? byId(ch.tones[0]) ?? own[0];
  if (pick === 'degree') {
    const pc = ch.tones[(n * 2) % ch.tones.length]; // root, fifth, third, root… per event
    return own.find((f) => f.notes[0].replace(/\d+$/, '') === pc) ?? own[0];
  }
  return byId(pick) ?? own[0];
}

/** Events → voices: { sound, file, event_t, pos (film s of the file's sample 0), len, gain_db, pan, duck, what }. */
export function plan(events, { duration = DURATION, level = null, files = ensureKit() } = {}) {
  const { kept, dropped } = select(events);
  const count = {}, voices = [];
  for (const c of kept) {
    const n = (count[c.sound] = (count[c.sound] ?? -1) + 1), f = pickFile(c, n, files), S = SOUNDS[c.sound];
    const music = level ? Math.max(LEVEL.musicFloor, level(c.e.t - f.anchor_s + f.loudest_s)) : -20;
    const gain = Math.min(LEVEL.maxGain, Math.max(LEVEL.minGain, S.rel_lu + music - f.lufs + (c.e.gain_db ?? 0)));
    const pan = S.panX && Number.isFinite(c.e.x) ? S.panX * Math.max(-1, Math.min(1, (c.e.x / 2880) * 2 - 1)) : 0;
    voices.push({ sound: c.sound, file: f.name, event_t: +c.e.t.toFixed(4), pos: c.e.t - f.anchor_s, len: f.duration_s, gain_db: +gain.toFixed(2), music_lufs: +music.toFixed(1), pan: +pan.toFixed(3), duck: S.duck ?? false, what: String(c.e.label ?? c.e.note ?? c.e.id ?? ''), scene: c.e.scene ?? c.e.id ?? '' });
  }
  return { voices: voices.filter((v) => v.pos + v.len > 0 && v.pos < duration), dropped };
}

/** Mixes voices (kit files, already faded and through the room) into stereo Float32 arrays. */
export function mixVoices(voices, duration, dir = KIT_DIR) {
  const N = Math.ceil(duration * SR), L = new Float32Array(N), R = new Float32Array(N), cache = new Map();
  for (const v of voices) {
    if (!cache.has(v.file)) cache.set(v.file, readWav(resolve(dir, `${v.file}.wav`)));
    const w = cache.get(v.file), g = db(v.gain_db), th = ((v.pan + 1) * Math.PI) / 4;
    const gl = g * Math.cos(th) * Math.SQRT2, gr = g * Math.sin(th) * Math.SQRT2, p0 = Math.round(v.pos * SR);
    for (let i = Math.max(0, -p0); i < w.n && p0 + i < N; i++) {
      L[p0 + i] += w.ch[0][i] * gl;
      R[p0 + i] += w.ch[1][i] * gr;
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

export async function buildSfx({ events, outDir = AUDIO, duration = DURATION, level = musicLevel() }) {
  mkdirSync(outDir, { recursive: true });
  const { voices, dropped } = plan(events, { duration, level });
  const [L, R] = mixVoices(voices, duration);
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const wav = resolve(outDir, 'sfx.wav');
  writeWav(wav, [L, R], SR);
  const bySound = {};
  for (const v of voices) bySound[v.sound] = (bySound[v.sound] ?? 0) + 1;
  const report = {
    duration, sampleRate: SR, events: events.length, voices: voices.length, bySound,
    peakDbfs: +(20 * Math.log10(peak || 1e-9)).toFixed(2), silent: dropped,
    placed: voices.map((v) => ({ ...v, pos: +v.pos.toFixed(4), start: +Math.max(0, v.pos).toFixed(4), len: +v.len.toFixed(3) })),
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
  for (const c of events) if (c.replaces && !c.replaced) console.warn(`sfx: cue ${c.id} replaces no event (${c.replaces.scene}: "${c.replaces.label}…"); the scene's label changed?`);
  const { wav, report } = await buildSfx({ events, outDir: a.out ? resolve(a.out) : AUDIO, duration: Number(a.duration ?? DURATION) });
  console.log(`sfx: ${report.voices} sounds from ${report.events} events (${report.silent.length} left silent), peak ${report.peakDbfs} dBFS → ${wav}`);
  console.log(`  ${Object.entries(report.bySound).map(([k, n]) => `${k} ${n}`).join(', ')}`);
}
