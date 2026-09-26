// Capture the real app for the film (FILM.md §6): frame-perfect clips in virtual time,
// stills, isolated sheets, diagram layers and the exported .docx, into the shared asset
// store, plus review media (contact sheets, quick mp4s) under build/capture-review/.
//
//   node scripts/film/capture/capture.mjs                 # everything (P0, P1, P2 clips; all assets)
//   node scripts/film/capture/capture.mjs --list          # what can be captured
//   node scripts/film/capture/capture.mjs --only=type-mcq,stills
//   flags: --reseed (rebuild the seed documents), --no-build (use out/ as is),
//          --no-review (skip contact sheets and review mp4s)
//
// Needs `npm run build` output in out/ (built here if missing), system Chrome, ffmpeg,
// LibreOffice and pdftoppm (for the .docx pages).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveStatic } from './server.mjs';
import { ensureOut, launch, PORT, OUT } from './session.mjs';
import { seedState } from './seed.mjs';
import { CLIPS, recordClip } from './clips.mjs';
import { ASSET_JOBS } from './assets.mjs';
import { review } from './review.mjs';
import { writeManifest } from './manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const log = (m) => console.log(m);

const GROUPS = {
  p0: CLIPS.filter((c) => c.priority === 0).map((c) => c.name),
  p1: CLIPS.filter((c) => c.priority === 1).map((c) => c.name),
  p2: CLIPS.filter((c) => c.priority === 2).map((c) => c.name),
  clips: CLIPS.map((c) => c.name),
  assets: ASSET_JOBS.map((j) => j.name),
};

if (flag('list')) {
  log('clips:');
  for (const c of CLIPS) log(`  ${c.name.padEnd(16)} P${c.priority}  ${c.dur}s  ${c.about}`);
  log('assets:');
  for (const j of ASSET_JOBS) log(`  ${j.name.padEnd(16)} ${j.about}`);
  log(`groups: ${Object.keys(GROUPS).join(', ')}`);
  process.exit(0);
}

const wanted = new Set();
for (const name of (opt('only') ?? 'clips,assets').split(',').map((s) => s.trim()).filter(Boolean)) {
  const names = GROUPS[name] ?? [name];
  for (const n of names) {
    if (!CLIPS.some((c) => c.name === n) && !ASSET_JOBS.some((j) => j.name === n)) {
      console.error(`capture: unknown clip or asset "${n}" (see --list)`);
      process.exit(1);
    }
    wanted.add(n);
  }
}

const outDir = path.join(ROOT, 'out');
if (!flag('no-build') && !fs.existsSync(path.join(outDir, 'index.html'))) {
  log('capture: building the app (npm run build)…');
  const build = spawnSync('npm', ['run', 'build'], { cwd: ROOT, stdio: 'inherit' });
  if (build.status !== 0) process.exit(build.status ?? 1);
}
for (const bin of ['ffmpeg', 'ffprobe']) {
  if (spawnSync('which', [bin]).status !== 0) {
    console.error(`capture: ${bin} is required`);
    process.exit(1);
  }
}

ensureOut();
const server = await serveStatic(outDir, PORT);
const browser = await launch(2);
const results = [];
try {
  const state = await seedState({ browser, url: server.url, root: ROOT, force: flag('reseed'), log });
  const env = { browser, url: server.url, state, root: ROOT, log };
  for (const clip of CLIPS.filter((c) => wanted.has(c.name))) {
    const meta = await recordClip(clip, env);
    results.push({ kind: 'clip', name: clip.name, meta });
    if (!flag('no-review')) await review(clip.name, meta, log);
  }
  for (const job of ASSET_JOBS.filter((j) => wanted.has(j.name))) {
    log(`asset: ${job.name}…`);
    await job.run(env);
  }
  writeManifest(log);
} finally {
  await browser.close();
  await server.close();
}
log(`capture: done → ${path.dirname(OUT.clips)}`);
