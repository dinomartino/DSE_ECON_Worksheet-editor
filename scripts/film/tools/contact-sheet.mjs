#!/usr/bin/env node
// Contact sheet: a frame every `step` seconds of a video, timecoded with the film time and
// scene, laid out in a grid and saved as one JPEG (FILM.md §9).
//   node scripts/film/tools/contact-sheet.mjs [video] [--out=contact-sheet.jpg] [--step=1]
//        [--cols=8] [--width=320] [--from=<film seconds at the video's start>]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { sceneAt } from '../timeline.mjs';
import { OUT, BUILD } from '../paths.mjs';

/** Film time at a video's first frame, from its render report when there is one. */
export function videoStart(video) {
  const report = resolve(BUILD, 'renders', `${basename(video).replace(/\.mp4$/, '')}.json`);
  try {
    return JSON.parse(readFileSync(report, 'utf8')).from ?? 0;
  } catch {
    return 0;
  }
}

const tc = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`;

export async function contactSheet(video, { out = resolve(OUT, 'contact-sheet.jpg'), step = 1, cols = 8, width = 320, aspect = 16 / 9, from } = {}) {
  const start = from ?? videoStart(video);
  const dir = mkdtempSync(join(tmpdir(), 'film-sheet-'));
  try {
    const [n, d] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=avg_frame_rate', '-of', 'csv=p=0', video], { encoding: 'utf8' }).trim().split('/').map(Number);
    const every = Math.max(1, Math.round((n / d) * step)); // exact frames at 0, step, 2·step…
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video,
      '-vf', `select=not(mod(n\\,${every})),scale=${width}:-2`, '-fps_mode', 'vfr', '-q:v', '3', join(dir, '%05d.jpg')]);
    const frames = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
    const h = Math.round(width / aspect);
    const cells = frames.map((f, i) => {
      const t = start + i * step;
      const data = readFileSync(join(dir, f)).toString('base64');
      return `<figure><img src="data:image/jpeg;base64,${data}"><figcaption><b>${tc(t)}</b> ${sceneAt(t).join(' → ')}</figcaption></figure>`;
    });
    const rows = Math.ceil(cells.length / cols);
    const W = cols * (width + 8) + 8;
    const H = rows * (h + 30) + 60;
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#111;color:#ddd;font:500 12px -apple-system,system-ui;width:${W}px}
      h1{font:600 16px -apple-system;margin:0;padding:16px 10px 8px;color:#fff}
      main{display:grid;grid-template-columns:repeat(${cols},${width}px);gap:8px;padding:8px}
      figure{margin:0}img{display:block;width:${width}px;height:${h}px;object-fit:cover;background:#000}
      figcaption{height:20px;line-height:20px;white-space:nowrap;overflow:hidden;color:#999}b{color:#fff;font-variant-numeric:tabular-nums}
    </style><h1>${basename(video)} — a frame every ${step} s</h1><main>${cells.join('')}</main>`;
    const browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage({ viewport: { width: W, height: H } });
    await page.setContent(html);
    await page.screenshot({ path: out, type: 'jpeg', quality: 88, fullPage: true });
    await browser.close();
    return { out, frames: frames.length };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
  const video = resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) ?? resolve(OUT, 'econ-worksheet-film.mp4'));
  if (!existsSync(video)) throw new Error(`no video: ${video}`);
  const r = await contactSheet(video, {
    out: args.out ? resolve(args.out) : resolve(dirname(video), `${basename(video, '.mp4')}-contact.jpg`),
    step: Number(args.step ?? 1),
    cols: Number(args.cols ?? 8),
    width: Number(args.width ?? 320),
    from: args.from != null ? Number(args.from) : undefined,
  });
  console.log(`contact sheet: ${r.frames} frames → ${r.out}`);
}
