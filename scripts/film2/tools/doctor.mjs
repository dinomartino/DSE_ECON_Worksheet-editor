#!/usr/bin/env node
// Film v2's health check: npm run film2:doctor. Exit 1 on errors, 0 on warnings only.
//   1 timeline  scenes tile 0..DURATION; every cut on the pulse grid (±1 frame); cues sorted,
//               in range, unique; transitions fit inside their neighbours
//   2 copy      every COPY line: no line-end , . ， 。 ; ；  (user rule, FILM.md §3)
//   3 assets    every registry file exists (clips: every frame); the grid copy is current
//   4 audio     the music master exists and lasts at least DURATION
//   5 stage     (Chrome) clip windows inside their clips; text fits its box and title-safe;
//               no missing files or page errors
// --skip-stage runs 1-4 only.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as TL from '../timeline.mjs';
import { ASSETS as REGISTRY, asset } from '../assets.mjs';
import { ASSETS, MUSIC_FILE, MUSIC_GRID, FILM2_DIR } from '../paths.mjs';
import { ASSETS as V1_ASSETS } from '../../film/paths.mjs';

const FLAGS = { 'skip-stage': 'checks 1-4 only (no browser)', step: 'text sampling step in s (0.2)', help: 'this text' };
const args = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
  if (!m || !(m[1] in FLAGS)) {
    console.error(`doctor: unknown argument ${a} (--help)`);
    process.exit(2);
  }
  args[m[1]] = m[2] ?? true;
}
if (args.help) {
  console.log('npm run film2:doctor [-- flags]\n' + Object.entries(FLAGS).map(([k, v]) => `  --${k.padEnd(11)} ${v}`).join('\n'));
  process.exit(0);
}

const found = { error: 0, warn: 0 };
const say = (level, msg) => {
  if (level !== 'ok') found[level]++;
  console.log(`  ${{ ok: 'ok   ', warn: 'WARN ', error: 'ERROR' }[level]} ${msg}`);
};
const head = (name) => console.log(`\n${name}`);
const FRAME = 1 / TL.FPS;
const SAFE = { x0: 96, x1: TL.W - 96, y0: 72, y1: TL.H - 72 };

// ---- 1. timeline -----------------------------------------------------------------------
async function timeline() {
  head('1. timeline');
  let n = 0;
  const bad = (m) => (n++, say('error', m));
  const off = (t) => Math.abs(TL.snap(t) - t);
  let at = 0;
  TL.SCENES.forEach((s, i) => {
    if (Math.abs(s.from - at) > 1e-6) bad(`scene ${s.id} starts at ${s.from} s, the previous ends at ${at} s`);
    if (s.to <= s.from) bad(`scene ${s.id} is empty`);
    if (i > 0 && off(s.from) > FRAME + 1e-6) bad(`cut into ${s.id} at ${s.from.toFixed(3)} s is ${(off(s.from) * 1000).toFixed(0)} ms off the pulse grid`);
    const half = TL.halfIn(s);
    if (i > 0 && (half > (s.to - s.from) / 2 || half > (TL.SCENES[i - 1].to - TL.SCENES[i - 1].from) / 2)) bad(`the transition into ${s.id} is longer than a neighbour can hold`);
    if (!['cut', 'match', 'push', 'iris'].includes(s.in?.type ?? 'cut')) bad(`scene ${s.id}: unknown transition ${s.in.type}`);
    for (const c of s.cuts ?? []) {
      if (!(c > s.from && c < s.to)) bad(`scene ${s.id}: declared cut ${c} s is outside ${s.from.toFixed(3)}..${s.to.toFixed(3)}`);
      else if (off(c) > FRAME + 1e-6) bad(`scene ${s.id}: declared cut ${c.toFixed(3)} s is off the pulse grid`);
    }
    for (const u of s.ui ?? []) if (!(u > s.from - half && u < s.to)) bad(`scene ${s.id}: footage UI change ${u} s is outside the act`);
    for (const [a, b] of s.holds ?? []) if (!(a < b && a >= s.from - half && b <= s.to + 1e-6)) bad(`scene ${s.id}: hold ${a}..${b} is empty or outside the scene`);
    at = s.to;
  });
  if (Math.abs(at - TL.DURATION) > 1e-6) bad(`scenes end at ${at} s, DURATION is ${TL.DURATION} s`);
  const ids = new Set();
  const scenes = new Set(TL.SCENES.map((s) => s.id));
  TL.CUES.forEach((c, i) => {
    if (ids.has(c.id)) bad(`cue id ${c.id} is used twice`);
    ids.add(c.id);
    if (!scenes.has(String(c.id).split('.')[0])) bad(`cue ${c.id}: not <scene>.<name>`);
    if (!(c.t >= 0 && c.t <= TL.DURATION)) bad(`cue ${c.id} at ${c.t} s is outside 0..${TL.DURATION}`);
    if (i && c.t < TL.CUES[i - 1].t - 1e-6) bad(`cue ${c.id} comes before ${TL.CUES[i - 1].id}`);
    if (off(c.t) > FRAME + 1e-6) say('warn', `cue ${c.id} at ${c.t.toFixed(3)} s is off the pulse grid`);
  });
  // The iris into write opens out of the mark's dot.
  const { MARK_DOT } = await import('../stage/scenes/mark.js');
  const iris = TL.SCENES.find((s) => s.id === 'write')?.in;
  if (iris?.type === 'iris' && String(iris.at) !== String(MARK_DOT)) bad(`write's iris opens at ${iris.at}, the mark's dot is at ${MARK_DOT} (scenes/mark.js)`);
  if (!n) say('ok', `${TL.SCENES.length} scenes tile 0..${TL.DURATION} s, cuts on the ${(TL.PULSE * 1000).toFixed(1)} ms pulse; ${TL.CUES.length} cues sorted and unique`);
}

// ---- 2. copy ---------------------------------------------------------------------------
function copy() {
  head('2. copy');
  let n = 0;
  const scenes = new Set(TL.SCENES.map((s) => s.id));
  for (const [scene, entries] of Object.entries(TL.COPY)) {
    if (!scenes.has(scene)) { n++; say('error', `COPY.${scene}: no such scene`); }
    for (const [key, pair] of Object.entries(entries)) {
      for (const lang of ['en', 'zh']) {
        if (typeof pair[lang] !== 'string' || !pair[lang].trim()) {
          n++;
          say('error', `COPY.${scene}.${key}.${lang} is missing`);
          continue;
        }
        for (const line of pair[lang].split('\n')) {
          if (/[,.，。;；]\s*$/u.test(line)) { n++; say('error', `COPY.${scene}.${key}.${lang}: "${line}" ends in punctuation`); }
          if (line !== line.trim()) { n++; say('error', `COPY.${scene}.${key}.${lang}: "${line}" has outer spaces`); }
        }
      }
    }
  }
  const count = Object.values(TL.COPY).reduce((s, e) => s + Object.keys(e).length, 0);
  if (!n) say('ok', `${count} en+zh pairs, no line ends in punctuation`);
}

// ---- 3. assets -------------------------------------------------------------------------
const clipMeta = {};
function assets() {
  head('3. assets');
  let missing = 0;
  for (const id of Object.keys(REGISTRY)) {
    const a = asset(id);
    const store = a.store === 'v1' ? V1_ASSETS : ASSETS;
    const file = resolve(store, a.kind === 'clip' ? `${a.path}.json` : a.path);
    if (!existsSync(file)) {
      missing++;
      say('error', `${id}: missing ${file}${a.capture ? ` (${a.capture})` : ''}`);
      continue;
    }
    if (a.kind !== 'clip') continue;
    const meta = JSON.parse(readFileSync(file, 'utf8'));
    const dir = resolve(store, a.path);
    const frames = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.jpg')).length : 0;
    const want = meta.frames ?? Math.round(meta.duration * meta.fps);
    if (frames < want) { missing++; say('error', `${id}: ${frames} of ${want} frames in ${dir}`); }
    clipMeta[id] = { duration: meta.duration ?? meta.frames / meta.fps, fps: meta.fps ?? 60 };
  }
  if (!missing) say('ok', `${Object.keys(REGISTRY).length} registry assets present`);
  if (!existsSync(MUSIC_GRID)) say('error', `the verified grid ${MUSIC_GRID} is missing`);
  else {
    const g = JSON.parse(readFileSync(MUSIC_GRID, 'utf8'));
    if (Math.abs(g.beat_s - TL.GRID.beat) > 1e-9 || Math.abs(g.first_downbeat_s - TL.GRID.firstDownbeat) > 1e-9) {
      say('error', `beatgrid.${TL.MUSIC.slug}.json is out of date with ${MUSIC_GRID}: node scripts/film2/tools/beatgrid.mjs`);
    } else say('ok', `beat grid current (${TL.MUSIC.grid})`);
  }
}

// ---- 4. audio --------------------------------------------------------------------------
function audio() {
  head('4. audio');
  if (!existsSync(MUSIC_FILE)) return say('error', `music master missing: ${MUSIC_FILE}`);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=sample_rate', '-of', 'json', MUSIC_FILE], { encoding: 'utf8' });
  const j = JSON.parse(probe);
  const dur = Number(j.format.duration);
  const sr = Number(j.streams?.[0]?.sample_rate);
  const need = TL.DURATION + TL.MUSIC.offset;
  if (dur + 1e-3 < need) say('error', `${TL.MUSIC.audio} lasts ${dur.toFixed(2)} s; the film needs ${need.toFixed(2)} s`);
  else say('ok', `${TL.MUSIC.audio}: ${dur.toFixed(2)} s at ${sr} Hz covers the film's ${TL.DURATION.toFixed(2)} s (audible to ${TL.AUDIBLE_END} s)`);
  if (sr !== 48000) say('warn', `${TL.MUSIC.audio} is ${sr} Hz, the film is mastered at 48 kHz`);
}

// ---- 5. stage --------------------------------------------------------------------------
async function stage() {
  const { serve } = await import('./serve.mjs');
  const { launch, openStage } = await import('../../film/tools/chrome.mjs');
  const server = await serve();
  const browser = await launch();
  try {
    const { context, page, logs } = await openStage(browser, server.url, { w: 640, h: 360, fps: 30, shutter: 1 });
    head('5a. clip windows');
    const placements = await page.evaluate(() => window.film.placements());
    let bad = 0;
    for (const p of placements) {
      const meta = clipMeta[p.clip];
      if (!meta) continue;
      const end = p.from + p.rate * Math.max(0, p.dur);
      if (p.from < -1 / meta.fps || end > meta.duration + 1 / meta.fps) {
        bad++;
        say('error', `${p.scene}: clip ${p.clip} plays ${p.from.toFixed(2)}..${end.toFixed(2)} s; it has 0..${meta.duration.toFixed(2)} s`);
      }
    }
    if (!bad) say('ok', `${placements.length} clip placements inside their clips`);
    await textFit(page);
    const errs = [...new Set(logs)];
    if (errs.length) say('error', `page messages:\n        ${errs.slice(0, 10).join('\n        ')}`);
    if (server.missing.size) say('error', `the stage asked for missing files: ${[...server.missing].join(', ')}`);
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

async function textFit(page) {
  head(`5b. text fit (title-safe x ${SAFE.x0}..${SAFE.x1}, y ${SAFE.y0}..${SAFE.y1})`);
  const step = Number(args.step ?? 0.2);
  const blocks = new Map();
  for (let t = 0; t < TL.DURATION; t += step) {
    const at = Math.round(t * 1000) / 1000;
    await page.evaluate((x) => window.film.seek(x), at);
    for (const b of await page.evaluate(() => window.film.text())) {
      const key = `${b.scene}|${b.en}|${b.zh}|${b.maxWidth}`;
      const rec = blocks.get(key) ?? blocks.set(key, { ...b, shown: [] }).get(key);
      if (b.revealed) rec.shown.push({ t: at, ...b });
    }
  }
  let bad = 0;
  const q = (b) => JSON.stringify((b.en || b.zh).replace(/\n/g, ' / '));
  for (const b of blocks.values()) {
    if (!b.fits) {
      bad++;
      say('error', `${b.scene}: ${q(b)} overflows ${Math.round(b.maxWidth)} px × ${b.maxLines} lines even at 80%`);
      continue;
    }
    if (!b.shown.length) continue;
    const s = b.shown[Math.floor(b.shown.length / 2)];
    const { l, t, r, b: bottom } = s.box;
    const out = [];
    if (Math.max(...s.widths) > b.maxWidth + 1) out.push(`${Math.round(Math.max(...s.widths))} px wide in a ${Math.round(b.maxWidth)} px box`);
    if (l < SAFE.x0 - 1 || r > SAFE.x1 + 1) out.push(`x ${Math.round(l)}..${Math.round(r)} outside title-safe`);
    if (t < SAFE.y0 - 1 || bottom > SAFE.y1 + 1) out.push(`y ${Math.round(t)}..${Math.round(bottom)} outside title-safe`);
    if (out.length) { bad++; say('error', `${b.scene}: ${q(b)} at ${s.t} s: ${out.join('; ')}`); }
  }
  const hidden = [...blocks.values()].filter((b) => !b.shown.length).map((b) => `${b.scene}: ${q(b)}`);
  const shrunk = [...blocks.values()].filter((b) => b.fits && b.scale < 1 - 1e-6);
  if (!bad) say('ok', `${blocks.size - hidden.length} text blocks inside their boxes and title-safe${shrunk.length ? `; ${shrunk.length} shrunk to fit` : ''}`);
  if (shrunk.length) console.log(`        shrunk: ${shrunk.map((b) => `${q(b)} ${Math.round(b.scale * 100)}%`).join(', ')}`);
  if (hidden.length) say('warn', `never fully revealed (fit only): ${hidden.join(', ')}`);
}

const t0 = Date.now();
console.log(`film v2 doctor (${FILM2_DIR})`);
await timeline();
copy();
assets();
audio();
if (!args['skip-stage']) await stage();
console.log(`\ndoctor: ${found.error} errors, ${found.warn} warnings (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(found.error ? 1 : 0);
