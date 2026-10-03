#!/usr/bin/env node
// Contact sheet: a PNG grid of frames sampled from a video, or of a directory of stills
// (every PNG/JPG in name order). Cells are scaled to --cell px wide (≤ 480). No labels are
// burned in (this ffmpeg has no drawtext); the times in cell order are printed and written
// to <out>.txt next to the sheet.
//   node scripts/film2/tools/contact.mjs <video|stills dir> [--count=24] [--cols=6] [--cell=320]
//        [--from=<s>] [--to=<s>] [--every=<s>] [--out=<png>]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUT } from '../paths.mjs';
import { parseFlags, probe } from './motion-check.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { o, pos } = parseFlags('node scripts/film2/tools/contact.mjs', 'contact sheet of a video or a directory of stills', {
    count: '<n> cells (default 24)',
    cols: '<n> columns (default 6)',
    cell: '<px> cell width, at most 480 (default 320)',
    from: '<s> video: start of the sampled range',
    to: '<s> video: end of the sampled range (default the end)',
    every: '<s> video: one cell every s seconds (overrides --count)',
    out: '<png> output (default $FILM_OUT/contact/<name>.png)',
  });
  const input = resolve(pos[0]);
  if (!existsSync(input)) {
    console.error(`contact: ${input} does not exist`);
    process.exit(1);
  }
  const cell = Math.min(480, Math.max(32, Number(o.cell ?? 320) | 0));
  const cols = Math.max(1, Number(o.cols ?? 6) | 0);
  const out = resolve(o.out ?? resolve(OUT, 'contact', `${basename(input).replace(/\.[^.]+$/, '')}.png`));
  mkdirSync(dirname(out), { recursive: true });
  const isDir = statSync(input).isDirectory();
  let times = [], args;
  if (isDir) {
    const files = readdirSync(input).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
    if (!files.length) {
      console.error(`contact: no images in ${input}`);
      process.exit(1);
    }
    const count = Math.min(files.length, Number(o.count ?? 24) | 0 || 24);
    const picks = Array.from({ length: count }, (_, i) => files[Math.round((i * (files.length - 1)) / Math.max(1, count - 1))]);
    times = picks;
    const rows = Math.ceil(count / cols);
    // a concat list of the picks: stable order, no pattern guessing
    const list = `${out}.list.txt`;
    writeFileSync(list, picks.map((f) => `file '${resolve(input, f).replace(/'/g, "'\\''")}'\nduration 1`).join('\n') + '\n');
    args = ['-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=${cell}:-2,tile=${cols}x${rows}:padding=4:margin=4:color=black`];
  } else {
    const { fps, duration } = await probe(input);
    const a = Number(o.from ?? 0), b = Math.min(Number(o.to ?? duration), duration);
    const step = o.every ? Number(o.every) : (b - a) / (Number(o.count ?? 24) | 0 || 24);
    const count = Math.max(1, Math.floor((b - a) / step + 1e-6));
    times = Array.from({ length: count }, (_, i) => +(a + i * step).toFixed(3));
    const rows = Math.ceil(count / cols);
    // fps=1/step starting at a: cell i is the frame at a + i·step (the first frame at or after it)
    args = ['-ss', String(a), '-t', String(b - a), '-i', input, '-vf', `fps=1/${step},scale=${cell}:-2,tile=${cols}x${rows}:padding=4:margin=4:color=black`];
    void fps;
  }
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args, '-frames:v', '1', '-fps_mode', 'passthrough', out], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`contact: ffmpeg failed\n${r.stderr}`);
    process.exit(1);
  }
  writeFileSync(`${out}.txt`, `${times.join('\n')}\n`);
  console.log(`contact: ${times.length} cells, ${cols} columns, ${cell} px → ${out}`);
  console.log(`  cells in order: ${times.join(' ')}`);
}
