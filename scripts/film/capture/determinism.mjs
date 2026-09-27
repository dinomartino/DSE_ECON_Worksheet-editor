// Records clips twice and compares them frame by frame: frame N must be a pure function
// of the script (FILM.md §6.1). Differing frames are listed with the box that changed.
//
//   node scripts/film/capture/determinism.mjs language-toggle answer-lines …   (default: every clip)
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLIPS, recordClip } from './clips.mjs';
import { seedState } from './seed.mjs';
import { serveStatic } from './server.mjs';
import { CAPTURE_BUILD, launch, PORT } from './session.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const names = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const clips = names.length ? CLIPS.filter((c) => names.includes(c.name)) : CLIPS;
const log = () => {};
const md5 = (file) => crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');

/** Bounding box (frame px) of pixels that differ between two JPEGs, via ffmpeg. */
function changedBox(a, b) {
  const raw = (f) => execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-vf', 'format=gray', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 26 });
  const [x, y] = [raw(a), raw(b)];
  const w = 2880;
  let box = null;
  for (let i = 0; i < x.length; i++) {
    if (Math.abs(x[i] - y[i]) <= 12) continue;
    const px = i % w;
    const py = Math.floor(i / w);
    box = box ? [Math.min(box[0], px), Math.min(box[1], py), Math.max(box[2], px), Math.max(box[3], py)] : [px, py, px, py];
  }
  return box;
}

const server = await serveStatic(path.join(ROOT, 'out'), PORT);
const browser = await launch(2);
const report = {};
try {
  const state = await seedState({ browser, url: server.url, root: ROOT, log });
  const env = { browser, url: server.url, state, root: ROOT, log };
  for (const clip of clips) {
    const dirs = ['a', 'b'].map((k) => path.join(CAPTURE_BUILD, 'determinism', `${clip.name}-${k}`));
    for (const dir of dirs) await recordClip(clip, env, { dir });
    const frames = fs.readdirSync(dirs[0]).filter((f) => f.endsWith('.jpg')).sort();
    const differing = frames.filter((f) => !fs.existsSync(path.join(dirs[1], f)) || md5(path.join(dirs[0], f)) !== md5(path.join(dirs[1], f)));
    report[clip.name] = {
      frames: frames.length,
      differing: differing.length,
      samples: differing.slice(0, 6).map((f) => ({ frame: Number(f.slice(0, 5)), box: changedBox(path.join(dirs[0], f), path.join(dirs[1], f)) })),
    };
    console.log(`${clip.name}: ${frames.length} frames, ${differing.length} differ` +
      (differing.length ? ` — ${report[clip.name].samples.map((s) => `#${s.frame} ${s.box ? `[${s.box}]` : 'within JPEG noise'}`).join(', ')}` : ''));
  }
  fs.writeFileSync(path.join(CAPTURE_BUILD, 'determinism', 'report.json'), JSON.stringify(report, null, 1));
} finally {
  await browser.close();
  await server.close();
}
