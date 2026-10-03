// A small contact strip of a captured clip, to look at instead of full frames:
// frames at the given clip seconds (default: start, middle, end), each ≤ 480 px wide.
//
//   node scripts/film2/capture/strip.mjs <clip> [t1,t2,…] [--cols=N]   (FILM_STORE = the store)
//   → <store>/strips/<clip>.jpg
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ASSETS } from '../../film/paths.mjs';

const [name, times, ...rest] = process.argv.slice(2);
if (!name) {
  console.error('usage: strip.mjs <clip> [t1,t2,…] [--cols=N]');
  process.exit(2);
}
const meta = JSON.parse(fs.readFileSync(path.join(ASSETS, 'clips', `${name}.json`), 'utf8'));
const ts = times && !times.startsWith('--')
  ? times.split(',').map(Number)
  : [0, meta.duration / 2, meta.duration - 1 / meta.fps];
const cols = Number(rest.concat(times ?? '').find((a) => a.startsWith('--cols='))?.slice(7) ?? ts.length);
const files = ts.map((t) => {
  const f = Math.min(meta.frames - 1, Math.max(0, Math.round(t * meta.fps)));
  return path.join(ASSETS, 'clips', name, `${String(f).padStart(5, '0')}.jpg`);
});
const out = path.join(ASSETS, 'strips', `${name}${times && !times.startsWith('--') ? `-${ts.length}` : ''}.jpg`);
fs.mkdirSync(path.dirname(out), { recursive: true });
const rows = Math.ceil(files.length / cols);
const inputs = files.flatMap((f) => ['-i', f]);
const scaled = files.map((_, i) => `[${i}:v]scale=480:300:force_original_aspect_ratio=decrease,pad=480:300:-1:-1:gray[s${i}]`).join(';');
const pad = Array.from({ length: rows * cols - files.length }, (_, k) => `color=c=gray:s=480x300[p${k}]`);
const all = [...files.map((_, i) => `[s${i}]`), ...pad.map((_, k) => `[p${k}]`)];
const layout = all.map((_, i) => `${(i % cols) * 480}_${Math.floor(i / cols) * 300}`).join('|');
const graph = [scaled, ...pad, `${all.join('')}xstack=inputs=${all.length}:layout=${layout}:fill=gray[o]`].join(';');
const run = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', graph, '-map', '[o]', '-q:v', '4', out], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(run.stderr);
  process.exit(1);
}
console.log(out);
