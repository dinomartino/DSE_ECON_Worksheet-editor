#!/usr/bin/env node
// The whole film (FILM.md §8): capture → events → score → render → master.
//   npm run film [-- flags]         final 1920×1080 60 fps
//   npm run film:preview            960×540 30 fps
// Film flags: --recapture (force capture), --skip-capture, --skip-score, --no-master.
// Every other flag passes through to render.mjs (--from/--to/--scene/--stills/--workers…).
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FILM_DIR, OUT, ASSETS, BUILD, ensureDirs } from './paths.mjs';
import { render, parseArgs } from './render.mjs';
import { contactSheet } from './tools/contact-sheet.mjs';

const argv = process.argv.slice(2);
const args = parseArgs(argv);
const own = new Set(['recapture', 'skip-capture', 'skip-score', 'no-master']);
const passthrough = argv.filter((a) => !own.has(a.replace(/^--/, '').split('=')[0]));

function run(label, cmd, cmdArgs) {
  console.log(`\n== ${label}: ${cmd} ${cmdArgs.join(' ')}`);
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: resolve(FILM_DIR, '../..') });
  if (r.status !== 0) throw new Error(`${label} failed (exit ${r.status})`);
}

/** The asset store is complete when its manifest exists and every listed file is there. */
function assetsComplete() {
  const manifest = resolve(ASSETS, 'manifest.json');
  if (!existsSync(manifest)) return false;
  try {
    const { assets = [] } = JSON.parse(readFileSync(manifest, 'utf8'));
    return assets.length > 0 && assets.every((a) => existsSync(resolve(ASSETS, a.path)));
  } catch {
    return false;
  }
}

function scoreEntry() {
  const dir = resolve(FILM_DIR, 'score');
  for (const f of ['score.mjs', 'run.mjs', 'index.mjs']) if (existsSync(resolve(dir, f))) return ['node', [resolve(dir, f)]];
  for (const f of ['score.py', 'main.py', 'build.py']) {
    if (!existsSync(resolve(dir, f))) continue;
    const venv = resolve(dir, '.venv/bin/python');
    return [existsSync(venv) ? venv : 'python3', [resolve(dir, f)]];
  }
  return null;
}

ensureDirs();
const t0 = Date.now();

// 1. Capture.
const capture = resolve(FILM_DIR, 'capture/capture.mjs');
if (args['skip-capture']) console.log('capture: skipped (--skip-capture)');
else if (!existsSync(capture)) console.log('capture: no capture/capture.mjs yet; using the asset store as it is');
else if (!args.recapture && assetsComplete()) console.log('capture: asset store complete; skipped (--recapture forces it)');
else run('capture', 'node', [capture, ...(args.recapture ? ['--recapture'] : [])]);

// 2. Events for the score's SFX pass, then 3. the score.
await render({ ...args, 'events-only': true });
const entry = scoreEntry();
if (args['skip-score']) console.log('score: skipped (--skip-score)');
else if (!entry) console.log('score: no score entry yet; rendering with the existing audio (or silence)');
else run('score', entry[0], entry[1]);

// 4. Render (encodes with the score when audio/score.wav exists).
const report = await render(parseArgs(passthrough));

// 5. Master: poster and contact sheet for full-length renders.
if (!args['no-master'] && report.output && report.full) {
  const poster = resolve(OUT, args.preview ? 'poster-preview.jpg' : 'poster.jpg');
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '12.0', '-i', report.output, '-frames:v', '1', '-q:v', '2', poster]);
  const sheet = await contactSheet(report.output, { out: resolve(OUT, args.preview ? 'contact-sheet-preview.jpg' : 'contact-sheet.jpg') });
  console.log(`poster: ${poster}\ncontact sheet: ${sheet.out}`);
}
console.log(`\nfilm done in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${report.output ?? report.stills ?? BUILD}`);
