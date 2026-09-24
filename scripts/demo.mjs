import { chromium } from 'playwright-core';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeScreenshots, SHOTS } from './demo/screenshots.mjs';
import { recordStoryboard } from './demo/record.mjs';

/**
 * Website demo media: a screen-recorded walkthrough and a screenshot set, written to
 * `demo-media/` (gitignored), with a README describing each file.
 *
 *   npm run build && python3 -m http.server 3931 -d out     # serve the built app
 *   node scripts/demo.mjs [--url=http://localhost:3931] [--video] [--shots]
 *
 * Neither flag = both. Needs system Chrome and ffmpeg; cwebp is used for WebP if present
 * (otherwise JPEG). What is typed: scripts/demo/content.mjs. The film:
 * scripts/demo/record.mjs:STORYBOARD. The stills: scripts/demo/screenshots.mjs:SHOTS.
 */

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='));
const URL = (urlArg ? urlArg.slice(6) : 'http://localhost:3931').replace(/\/?$/, '/');
const wantVideo = args.includes('--video') || !args.includes('--shots');
const wantShots = args.includes('--shots') || !args.includes('--video');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'demo-media');
const log = (m) => console.log(m);

const has = (bin) => spawnSync('which', [bin]).status === 0;
if (!has('ffmpeg') || !has('ffprobe')) {
  console.error('demo: ffmpeg (with ffprobe) is required. Install it (macOS: `brew install ffmpeg`) and re-run.');
  process.exit(1);
}
try {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`demo: nothing is serving the app at ${URL} (${e.message}).\n` +
    'Start it first: npm run build && python3 -m http.server 3931 -d out');
  process.exit(1);
}

const ff = (...a) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...a]);
const probe = (file, entries) =>
  execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', entries, '-of', 'csv=p=0:s=x', file])
    .toString().trim().split('\n')[0];

/** A 2× PNG → 1440-wide WebP (cwebp) or JPEG q≈85 (ffmpeg). Returns the written path. */
function encodeImage(png, outBase) {
  if (has('cwebp')) {
    execFileSync('cwebp', ['-quiet', '-q', '92', '-m', '6', '-resize', '1440', '0', png, '-o', `${outBase}.webp`]);
    return `${outBase}.webp`;
  }
  ff('-i', png, '-vf', 'scale=1440:-1:flags=lanczos', '-q:v', '3', `${outBase}.jpg`);
  return `${outBase}.jpg`;
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'econ-demo-'));
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome' });
let timeline = null;
const notes = [];
try {
  if (wantShots) await takeScreenshots({ browser, url: URL, outDir: OUT, tmpDir, encode: encodeImage, log });

  if (wantVideo) {
    const rec = await recordStoryboard({ browser, url: URL, tmpDir, log });
    timeline = rec.timeline;
    log('video: encoding…');
    const mp4 = path.join(OUT, 'demo.mp4');
    ff('-framerate', String(rec.fps), '-i', rec.seqPattern,
      '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
      '-c:v', 'libx264', '-profile:v', 'high', '-crf', '28', '-preset', 'slow', '-tune', 'stillimage',
      '-movflags', '+faststart', '-an', mp4);

    const poster = path.join(OUT, 'demo-poster.jpg');
    for (const q of ['4', '7', '10']) {
      ff('-ss', '0.1', '-i', mp4, '-frames:v', '1', '-q:v', q, poster);
      if (fs.statSync(poster).size <= 150_000) break;
    }

    const gif = path.join(OUT, 'demo.gif');
    const palette = path.join(tmpDir, 'palette.png');
    ff('-i', mp4, '-vf', 'fps=12,scale=960:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff', palette);
    ff('-i', mp4, '-i', palette, '-lavfi',
      'fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle', gif);
    if (fs.statSync(gif).size > 4_000_000) {
      fs.rmSync(gif);
      notes.push('`demo.gif` was skipped: at 960 px and 12 fps it came out over 4 MB.');
    }
  }
} finally {
  await browser.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

writeReadme();
log(`done → ${path.relative(ROOT, OUT)}/`);
for (const f of listFiles()) log(`  ${f.rel}  ${f.dims}  ${kb(f.size)}`);
for (const n of notes) log(`  note: ${n.replace(/`/g, '')}`);

// ---- README -----------------------------------------------------------------

function kb(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`;
}

function listFiles() {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name !== 'README.md') {
        const rel = path.relative(OUT, p);
        files.push({ rel, size: fs.statSync(p).size, dims: probe(p, 'stream=width,height') });
      }
    }
  };
  walk(OUT);
  return files;
}

function describe(f) {
  if (f.rel === 'demo.mp4') {
    const secs = Number(probe(path.join(OUT, f.rel), 'format=duration')).toFixed(1);
    return [`${f.dims}, H.264, 30 fps, ${secs} s, no audio`, 'The walkthrough (storyboard below)'];
  }
  if (f.rel === 'demo-poster.jpg') return [f.dims, 'First frame, for `<video poster>`'];
  if (f.rel === 'demo.gif') return [`${f.dims}, 12 fps`, 'The same walkthrough as an animated GIF'];
  const shot = SHOTS.find((s) => f.rel.startsWith(`screenshots/${s.file}.`));
  return [f.dims, shot ? shot.caption : ''];
}

function writeReadme() {
  const readme = path.join(OUT, 'README.md');
  const old = fs.existsSync(readme) ? fs.readFileSync(readme, 'utf8') : '';
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  let storyboard;
  if (timeline) {
    storyboard = [
      '## Video storyboard',
      '',
      'Some steps are sped up (marked ⏩) so text does not take long to appear.',
      '',
      '| Time | Step | What happens |',
      '|---|---|---|',
      ...timeline.map(({ at, step }) =>
        `| ${fmt(at)} | ${step.speed ? `⏩ ${step.speed}× ` : ''}${step.name} | ${step.caption} |`),
    ].join('\n');
  } else {
    const i = old.indexOf('## Video storyboard');
    storyboard = i >= 0 ? old.slice(i).trim() : '';
  }
  const rows = listFiles().map((f) => {
    const [dims, what] = describe(f);
    return `| \`${f.rel}\` | ${dims} | ${kb(f.size)} | ${what} |`;
  });
  const text = [
    '# Demo media: Econ worksheet generator',
    '',
    'Generated by `npm run demo` (`scripts/demo.mjs`) from the built web app in Chrome.',
    'Screenshots are captured at 2× and scaled to 1440 wide. All example questions are',
    'original text written for the demo, not HKEAA past-paper items.',
    '',
    '| File | Dimensions | Size | What it shows |',
    '|---|---|---|---|',
    ...rows,
    ...notes.map((n) => `\n${n}`),
    '',
    '## Embed',
    '',
    '```html',
    '<video src="demo.mp4" poster="demo-poster.jpg" width="1440" height="900"',
    '       autoplay muted loop playsinline preload="metadata"',
    '       style="max-width:100%;height:auto">',
    '</video>',
    '```',
    '',
    storyboard,
    '',
  ].join('\n');
  fs.writeFileSync(readme, text);
}
