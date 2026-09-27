#!/usr/bin/env node
// The whole film in one command (FILM.md §8): capture (only when the asset store is
// incomplete) → events → score (music, sfx, mix, verified) → render → poster, contact
// sheet and demo-media/film/README.md.
//   npm run film [-- flags]         final 1920×1080 60 fps
//   npm run film:preview            960×540 30 fps
//   npm run film:9x16               the 9:16 Reels cut (--format=portrait, FILM-9x16.md): 1080×1920
//                                   60 fps; no capture, no score — muxes the existing score and
//                                   refuses a stale one; outputs *-9x16 (mp4, poster, contact sheet)
// Film flags: --recapture (force capture), --skip-capture, --skip-score, --no-master.
// Every other flag passes through to render.mjs (--from/--to/--scene/--stills/--workers…).
import { spawnSync, execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FILM_DIR, OUT, ASSETS, BUILD, ensureDirs } from './paths.mjs';
import { formatOf } from './format.mjs';
import { render, parseArgs, RENDER_FLAGS, usage } from './render.mjs';
import { contactSheet } from './tools/contact-sheet.mjs';
import { readme } from './tools/readme.mjs';

const OWN = {
  recapture: 'capture everything again',
  'skip-capture': 'never capture',
  'skip-score': 'keep the score as is (render.mjs still refuses a stale one)',
  'no-master': 'no poster, contact sheet or README',
};
const argv = process.argv.slice(2);
let args;
try {
  args = parseArgs(argv, { ...OWN, ...RENDER_FLAGS });
} catch (e) {
  console.error(`film: ${e.message}`);
  process.exit(2);
}
if (args.help) {
  console.log(`${usage('npm run film --', OWN)}\nand every render flag:\n${usage('', RENDER_FLAGS).split('\n').slice(1).join('\n')}`);
  process.exit(0);
}
const passthrough = argv.filter((a) => !(a.replace(/^--/, '').split('=')[0] in OWN));
// A non-landscape format is a recomposition of the same timeline: the capture and the score
// (made for landscape) are shared, so it skips both and render.mjs refuses a stale score.
const format = formatOf(args.format === true ? '' : args.format);
const shared = format.suffix !== '';

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

ensureDirs();
const t0 = Date.now();

// 1. Capture, only when the asset store is incomplete.
const capture = resolve(FILM_DIR, 'capture/capture.mjs');
if (shared) console.log(`capture: skipped (${format.id} shares the landscape assets)`);
else if (args['skip-capture']) console.log('capture: skipped (--skip-capture)');
else if (!args.recapture && assetsComplete()) console.log('capture: asset store complete; skipped (--recapture forces it)');
else if (!existsSync(capture)) throw new Error(`capture: the asset store is incomplete and ${capture} is missing`);
else run('capture', 'node', [capture, ...(args.recapture ? ['--recapture'] : [])]);

// 2. Events (timeline cues, scene events, the clips' clicks and keys) for the score.
if (!shared) {
  console.log('\n== events');
  await render({ ...parseArgs(passthrough), 'events-only': true });
}

// 3. The score, built from exactly those events; it fails when its verification fails.
if (shared) console.log(`score: skipped (${format.id} muxes the landscape score; render.mjs refuses a stale one)`);
else if (args['skip-score']) console.log('score: skipped (--skip-score); render.mjs still refuses a stale score');
else run('score', 'node', [resolve(FILM_DIR, 'score/score.mjs'), 'all']);

// 4. Render; the encode muxes audio/score.wav (render.mjs checks it matches the events).
console.log('\n== render');
const report = await render(parseArgs(passthrough));

// 5. Master: poster, contact sheet and README for full-length renders.
if (!args['no-master'] && report.output && report.full) {
  const name = (base) => `${base}${format.suffix}${args.preview ? '-preview' : ''}.jpg`;
  const poster = resolve(OUT, name('poster'));
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-ss', '12.0', '-i', report.output, '-frames:v', '1', '-q:v', '2', poster]);
  const sheet = await contactSheet(report.output, {
    out: resolve(OUT, name('contact-sheet')),
    ...(format.W < format.H ? { cols: 12, width: 180, aspect: format.W / format.H } : {}),
  });
  console.log(`poster: ${poster}\ncontact sheet: ${sheet.out}`);
  if (!args.preview && !shared) console.log(`readme: ${readme(report.output, { report })}`);
}
console.log(`\nfilm done in ${((Date.now() - t0) / 1000).toFixed(0)} s → ${report.output ?? report.stills ?? BUILD}`);
