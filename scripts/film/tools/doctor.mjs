#!/usr/bin/env node
// The film's health check (FILM.md §8): npm run film:doctor. Exit 1 on errors, 0 on warnings.
//   1 timeline   scenes tile 0..DURATION, cues sorted, in range, ids unique
//   2 assets     every registry file exists (clips: every frame)
//   3 gpu        WebGL on the GPU
//   4 clips      every placeClip window inside its clip
//   5 score      audio/ built from this timeline and these events
//   6 text       every text block, fully revealed, inside its box and title-safe
//   7 capture    assets captured before a later src/ change
// Checks 3-6 open the stage in Chrome (--skip-stage skips them).
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import * as TL from '../timeline.mjs';
import { ASSETS as REGISTRY } from '../assets.mjs';
import { ASSETS, FILM_DIR } from '../paths.mjs';

const FLAGS = { 'skip-stage': 'checks 1, 2 and 7 only (no browser)', step: 'text sampling step in s (0.2)', help: 'this text' };
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
  console.log('npm run film:doctor [-- flags]\n' + Object.entries(FLAGS).map(([k, v]) => `  --${k.padEnd(11)} ${v}`).join('\n'));
  process.exit(0);
}

const found = { error: 0, warn: 0 };
const say = (level, msg) => {
  if (level !== 'ok') found[level]++;
  console.log(`  ${{ ok: 'ok   ', warn: 'WARN ', error: 'ERROR' }[level]} ${msg}`);
};
const head = (name) => console.log(`\n${name}`);
const eps = 1e-6;

// ---- 1. timeline -----------------------------------------------------------------------
function timeline() {
  head('1. timeline');
  let n = 0;
  const bad = (m) => (n++, say('error', m));
  let at = 0;
  for (const s of TL.SCENES) {
    if (s.from !== at) bad(`scene ${s.id} starts at bar ${s.from}, expected ${at}`);
    if (s.to <= s.from) bad(`scene ${s.id} is empty (bars ${s.from}..${s.to})`);
    at = s.to;
  }
  if (TL.bar(at) !== TL.DURATION) bad(`scenes end at ${TL.bar(at)} s, DURATION is ${TL.DURATION} s`);
  const ids = new Set();
  const scenes = new Set(TL.SCENES.map((s) => s.id));
  TL.CUES.forEach((c, i) => {
    if (ids.has(c.id)) bad(`cue id ${c.id} is used twice`);
    ids.add(c.id);
    if (!scenes.has(String(c.id).split('.')[0])) bad(`cue ${c.id}: not <scene>.<name>`);
    if (!(c.t >= 0 && c.t <= TL.DURATION)) bad(`cue ${c.id} at ${c.t} s is outside 0..${TL.DURATION}`);
    if (c.to != null && !(c.to > c.t && c.to <= TL.DURATION)) bad(`cue ${c.id}: to ${c.to} must be in (${c.t}, ${TL.DURATION}]`);
    if (i && c.t < TL.CUES[i - 1].t - eps) bad(`cue ${c.id} at ${c.t} s comes after ${TL.CUES[i - 1].id} at ${TL.CUES[i - 1].t} s`);
  });
  at = 0;
  for (const s of TL.SECTIONS) {
    if (s.from !== at) bad(`section ${s.id} starts at bar ${s.from}, expected ${at}`);
    at = s.to;
  }
  if (TL.bar(at) !== TL.DURATION) bad(`sections end at bar ${at}`);
  if (TL.CHORDS.length !== Math.round(TL.DURATION / TL.BAR)) bad(`${TL.CHORDS.length} chords for ${TL.DURATION / TL.BAR} bars`);
  if (!n) say('ok', `${TL.SCENES.length} scenes tile 0..${TL.DURATION} s; ${TL.CUES.length} cues sorted, in range, unique`);
}

// ---- 2. asset files -------------------------------------------------------------------
const clipMeta = {};
function assetFiles() {
  head('2. assets');
  let missing = 0;
  for (const [id, a] of Object.entries(REGISTRY)) {
    const file = resolve(ASSETS, a.kind === 'clip' ? `${a.path}.json` : a.path);
    if (!existsSync(file)) {
      missing++;
      say('error', `${id}: missing ${file} (node scripts/film/capture/${a.capture})`);
      continue;
    }
    if (a.kind !== 'clip') continue;
    const meta = JSON.parse(readFileSync(file, 'utf8'));
    const dir = resolve(ASSETS, a.path);
    const frames = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')).length : 0;
    const want = meta.frames ?? Math.round(meta.duration * meta.fps);
    if (frames < want) {
      missing++;
      say('error', `${id}: ${frames} of ${want} frames in ${dir}`);
    }
    clipMeta[id] = { duration: meta.duration ?? meta.frames / meta.fps, fps: meta.fps ?? 60 };
  }
  if (!missing) say('ok', `${Object.keys(REGISTRY).length} registry assets present in ${ASSETS}`);
}

// ---- 7. capture age --------------------------------------------------------------------
// capture.mjs records the app commit (last src/ change) per asset in manifest.json; assets
// captured before that was recorded fall back to their file time.
function captureAge() {
  head('7. capture age');
  const git = (...a) => execFileSync('git', a, { cwd: FILM_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const last = git('log', '-1', '--format=%H %ct', '--', ':/src');
  if (!last) return say('warn', 'no git history for src/');
  const [srcCommit, srcTime] = last.split(' ');
  const manifest = {};
  try {
    for (const a of JSON.parse(readFileSync(resolve(ASSETS, 'manifest.json'), 'utf8')).assets) manifest[a.path] = a;
  } catch {
    /* no manifest: file times only */
  }
  const stale = [];
  for (const [id, a] of Object.entries(REGISTRY)) {
    const entry = a.kind === 'clip' ? manifest[`${a.path}/`] ?? manifest[`${a.path}.json`] : manifest[a.path];
    const file = resolve(ASSETS, a.kind === 'clip' ? `${a.path}.json` : a.path);
    if (entry?.appCommit) {
      if (entry.appCommit === srcCommit) continue;
      let behind;
      try {
        behind = git('rev-list', '--count', `${entry.appCommit}..${srcCommit}`, '--', ':/src');
      } catch {
        behind = '?';
      }
      if (behind !== '0') stale.push(`${id} (${behind} src/ commits after ${entry.appCommit.slice(0, 7)})`);
    } else if (existsSync(file) && statSync(file).mtimeMs / 1000 < Number(srcTime)) {
      stale.push(`${id} (file older than src/ ${srcCommit.slice(0, 7)})`);
    }
  }
  if (!stale.length) return say('ok', `every asset is newer than the last src/ change (${srcCommit.slice(0, 7)})`);
  say('warn', `${stale.length} assets predate the last src/ change ${srcCommit.slice(0, 7)}; recapture those whose UI changed:`);
  for (const s of stale) console.log(`        ${s}`);
}

// ---- the stage: 3 gpu, 4 clips, 5 score, 6 text ----------------------------------
async function stage() {
  const { serve } = await import('./serve.mjs');
  const { launchOnGpu, openStage, isSoftware } = await import('./chrome.mjs');
  const { scoreState } = await import('../render.mjs');
  const server = await serve({ fallbacks: [] });
  const size = { w: 640, h: 360, fps: 30, shutter: 1 };
  const { browser, gpu, headed } = await launchOnGpu(server.url, size, { allowSoftware: true });
  try {
    head('3. gpu');
    if (isSoftware(gpu)) say('error', `WebGL is on a software renderer (${gpu.renderer}); render.mjs refuses it`);
    else say('ok', `${gpu.renderer}${headed ? ' (headed: headless fell back to software)' : ''}`);

    const { context, page, logs } = await openStage(browser, server.url, size);
    clipWindows(await page.evaluate(() => window.film.placements()));

    head('5. score');
    const events = await page.evaluate(() => window.film.events());
    const s = scoreState(`${JSON.stringify(events, null, 1)}\n`);
    if (!s.exists) say('warn', 'no audio/score.wav: run npm run film:score');
    else if (!s.current) say('warn', `stale (music ${s.music ? 'ok' : 'old'}, sfx ${s.sfx ? 'ok' : 'old'}, mix ${s.mixed ? 'ok' : 'old'}): run npm run film:score`);
    else say('ok', `score.wav matches this timeline and ${events.length} events`);

    await textFit(page);
    const errs = [...new Set(logs)].filter((l) => !/type: ".*" overflows/.test(l));
    if (errs.length) say('warn', `page messages:\n        ${errs.slice(0, 10).join('\n        ')}`);
    if (server.missing.size) say('error', `the stage asked for missing files: ${[...server.missing].join(', ')}`);
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

// ---- 4. clip windows ------------------------------------------------------------------
function clipWindows(placements) {
  head('4. clip windows');
  let bad = 0;
  for (const p of placements) {
    const meta = clipMeta[p.clip];
    if (!meta) continue; // missing: reported above
    const end = p.from + p.rate * Math.max(0, p.dur);
    const slack = 1 / meta.fps;
    if (p.from < -slack || end > meta.duration + slack) {
      bad++;
      say('error', `${p.scene}: clip ${p.clip} plays ${p.from.toFixed(2)}..${end.toFixed(2)} s; it has 0..${meta.duration.toFixed(2)} s (recapture it longer, or place it shorter)`);
    }
  }
  if (!bad) say('ok', `${placements.length} clip placements inside their clips`);
}

// ---- 6. text fit -----------------------------------------------------------------------
// Samples the film; each block is judged at the middle of the span where it is fully revealed.
const SAFE = { x: 96, y: 72 };
async function textFit(page) {
  head('6. text fit');
  const step = Number(args.step ?? 0.2);
  const blocks = new Map();
  for (let t = 0; t < TL.DURATION; t += step) {
    const at = Math.round(t * 1000) / 1000;
    await page.evaluate((x) => window.film.seek(x), at);
    for (const b of await page.evaluate(() => window.film.text())) {
      const key = `${b.en}|${b.zh}|${b.maxWidth}`;
      const rec = blocks.get(key) ?? blocks.set(key, { ...b, shown: [] }).get(key);
      if (b.revealed) rec.shown.push({ t: at, ...b });
    }
  }
  let bad = 0;
  const q = (b) => JSON.stringify((b.en || b.zh).replace(/\n/g, ' / '));
  for (const b of blocks.values()) {
    if (!b.fits) {
      bad++;
      say('error', `${q(b)} overflows ${Math.round(b.maxWidth)} px x ${b.maxLines} lines even at the 80% floor: shorten it or widen its box`);
      continue;
    }
    if (b.scale < 0.8 + 1e-6) say('warn', `${q(b)} is at the 80% shrink floor`);
    if (!b.shown.length) continue; // never fully on screen (a toggle's hidden side)
    const s = b.shown[Math.floor(b.shown.length / 2)];
    const wide = Math.max(...s.widths);
    const { l, t, r, b: bottom } = s.box;
    const out = [];
    if (wide > b.maxWidth + 1) out.push(`${Math.round(wide)} px wide in a ${Math.round(b.maxWidth)} px box`);
    if (l < SAFE.x - 1 || r > TL.W - SAFE.x + 1) out.push(`x ${Math.round(l)}..${Math.round(r)} outside title-safe ${SAFE.x}..${TL.W - SAFE.x}`);
    if (t < SAFE.y - 1 || bottom > TL.H - SAFE.y + 1) out.push(`y ${Math.round(t)}..${Math.round(bottom)} outside title-safe ${SAFE.y}..${TL.H - SAFE.y}`);
    if (out.length) {
      bad++;
      say('error', `${q(b)} at ${s.t} s: ${out.join('; ')}`);
    }
  }
  const shrunk = [...blocks.values()].filter((b) => b.fits && b.scale < 1 - 1e-6);
  const hidden = [...blocks.values()].filter((b) => !b.shown.length).map(q);
  if (!bad) say('ok', `${blocks.size - hidden.length} text blocks inside their boxes and title-safe${shrunk.length ? `; ${shrunk.length} shrunk to fit` : ''}`);
  if (shrunk.length) console.log(`        shrunk: ${shrunk.map((b) => `${q(b)} ${Math.round(b.scale * 100)}%`).join(', ')}`);
  if (hidden.length) console.log(`        never fully revealed, fit only: ${hidden.join(', ')}`);
}

// ---- main ------------------------------------------------------------------------------
const t0 = Date.now();
timeline();
assetFiles();
if (!args['skip-stage']) await stage();
captureAge();
console.log(`\ndoctor: ${found.error} errors, ${found.warn} warnings (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
process.exit(found.error ? 1 : 0);
