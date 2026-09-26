import { chromium } from 'playwright-core';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeScreenshots, SHOTS } from './demo/screenshots.mjs';
import { recordStoryboard } from './demo/record.mjs';
import { recordDiagrams } from './demo/diagrams.mjs';
import { sidecars } from './demo/subtitles.mjs';

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
 *
 *   node scripts/demo.mjs --story=diagrams                   # npm run demo:diagrams
 *
 * The diagram film instead: scripts/demo/diagrams.mjs:diagramStoryboard, a diagram drawn
 * from blank axes in one recording, plus numbered stills and the exported .docx, into
 * `demo-media/diagrams/`.
 */

const args = process.argv.slice(2);
const urlArg = args.find((a) => a.startsWith('--url='));
const URL = (urlArg ? urlArg.slice(6) : 'http://localhost:3931').replace(/\/?$/, '/');
const storyAt = args.findIndex((a) => a === '--story' || a.startsWith('--story='));
const STORY = storyAt < 0 ? 'site' : args[storyAt].startsWith('--story=') ? args[storyAt].slice(8) : args[storyAt + 1];
if (!['site', 'diagrams'].includes(STORY)) {
  console.error(`demo: unknown story "${STORY}" (site | diagrams)`);
  process.exit(1);
}
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

/** The film's frames → `<base>.mp4`, its subtitles as `.vtt` and `.srt`, a `<base>-poster.jpg`, and (optionally) a GIF. */
function encodeFilm(rec, base, { gif: wantGif }) {
  log('video: encoding…');
  const mp4 = `${base}.mp4`;
  ff('-framerate', String(rec.fps), '-i', rec.seqPattern,
    '-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-pix_fmt', 'yuv420p', '-color_range', 'tv',
    '-c:v', 'libx264', '-profile:v', 'high', '-crf', '28', '-preset', 'slow', '-tune', 'stillimage',
    '-movflags', '+faststart', '-an', mp4);
  const subs = sidecars(rec.cues, rec.duration);
  fs.writeFileSync(`${base}.vtt`, subs.vtt);
  fs.writeFileSync(`${base}.srt`, subs.srt);

  const poster = `${base}-poster.jpg`;
  for (const q of ['4', '7', '10']) {
    ff('-ss', '0.1', '-i', mp4, '-frames:v', '1', '-q:v', q, poster);
    if (fs.statSync(poster).size <= 150_000) break;
  }
  if (!wantGif) return;

  const gif = `${base}.gif`;
  const palette = path.join(tmpDir, 'palette.png');
  ff('-i', mp4, '-vf', 'fps=12,scale=960:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff', palette);
  ff('-i', mp4, '-i', palette, '-lavfi',
    'fps=12,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle', gif);
  if (fs.statSync(gif).size > 4_000_000) {
    fs.rmSync(gif);
    notes.push(`\`${path.basename(gif)}\` was skipped: at 960 px and 12 fps it came out over 4 MB.`);
  }
}

const DIAGRAMS_OUT = path.join(OUT, 'diagrams');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'econ-demo-'));
fs.mkdirSync(OUT, { recursive: true });
// Without the flag, Chrome's screencast delivers CSS-pixel frames even at 2×, and the
// camera's push-ins would upscale them (§ demo/camera.mjs).
const browser = await chromium.launch({ channel: 'chrome', args: ['--force-device-scale-factor=2'] });
let timeline = null;
let cues = [];
let shots = [];
let diagrams = null;
const notes = [];
try {
  if (wantShots && STORY === 'site') await takeScreenshots({ browser, url: URL, outDir: OUT, tmpDir, encode: encodeImage, log });

  if (STORY === 'diagrams') {
    fs.rmSync(DIAGRAMS_OUT, { recursive: true, force: true });
    fs.mkdirSync(path.join(DIAGRAMS_OUT, 'stills'), { recursive: true });
    const film = await recordDiagrams({ browser, url: URL, root: ROOT, tmpDir, outDir: DIAGRAMS_OUT, log });
    timeline = film.rec.timeline;
    cues = film.rec.cues;
    shots = film.rec.shots;
    diagrams = film;
    encodeFilm(film.rec, path.join(DIAGRAMS_OUT, 'diagrams'), { gif: false });
    for (const still of film.stills) still.path = encodeImage(still.png, path.join(DIAGRAMS_OUT, 'stills', still.file));
    notes.push(...film.notes);
  } else if (wantVideo) {
    const rec = await recordStoryboard({ browser, url: URL, tmpDir, log });
    timeline = rec.timeline;
    cues = rec.cues;
    shots = rec.shots;
    encodeFilm(rec, path.join(OUT, 'demo'), { gif: true });
  }
  fs.rmSync(tmpDir, { recursive: true, force: true }); // kept on failure: it holds failed-step.png
} finally {
  await browser.close();
}

const DIR = STORY === 'diagrams' ? DIAGRAMS_OUT : OUT;
if (STORY === 'diagrams') writeDiagramsReadme();
else writeReadme();
log(`done → ${path.relative(ROOT, DIR)}/`);
for (const f of listFiles(DIR)) log(`  ${f.rel}  ${f.dims}  ${kb(f.size)}`);
for (const n of notes) log(`  note: ${n.replace(/`/g, '')}`);

// ---- README -----------------------------------------------------------------

function kb(n) {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.round(n / 1000)} KB`;
}

/** Every file under `root` but the README; the diagram film's folder is its own. */
function listFiles(root = OUT) {
  const files = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        if (p !== DIAGRAMS_OUT || root === DIAGRAMS_OUT) walk(p);
      } else if (name !== 'README.md') {
        const rel = path.relative(root, p);
        const media = /\.(mp4|gif|jpe?g|png|webp)$/i.test(name);
        files.push({ rel, size: fs.statSync(p).size, dims: media ? probe(p, 'stream=width,height') : '—' });
      }
    }
  };
  walk(root);
  return files;
}

function describe(f) {
  if (f.rel === 'demo.mp4') {
    const secs = Number(probe(path.join(OUT, f.rel), 'format=duration')).toFixed(1);
    return [`${f.dims}, H.264, 30 fps, ${secs} s, no audio`, 'The walkthrough (storyboard below)'];
  }
  if (f.rel === 'demo-poster.jpg') return [f.dims, 'First frame, for `<video poster>`'];
  if (f.rel === 'demo.vtt' || f.rel === 'demo.srt') return ['—', 'The subtitles burned into the film, as a sidecar'];
  if (f.rel === 'demo.gif') return [`${f.dims}, 12 fps`, 'The same walkthrough as an animated GIF'];
  const shot = SHOTS.find((s) => f.rel.startsWith(`screenshots/${s.file}.`));
  return [f.dims, shot ? shot.caption : ''];
}

/**
 * One row per step: what it does, the subtitles shown during it (§ demo/subtitles.mjs),
 * and where the camera goes (§ demo/camera.mjs).
 */
function storyboardTable(fmt) {
  const subtitles = (step) =>
    cues.filter((c) => c.step === step && c.text).map((c) => c.text.replace(/\n/g, ' ')).join('<br>');
  const camera = (step) =>
    shots.filter((s) => s.step === step)
      .map((s) => (s.rect ? `${fmt(s.at)} in ${(1440 / s.rect.w).toFixed(1)}× on ${s.name}` : `${fmt(s.at)} out to full frame`))
      .join('<br>');
  return [
    '| Time | Step | What happens | Subtitles | Camera |',
    '|---|---|---|---|---|',
    ...timeline.map(({ at, step }) =>
      `| ${fmt(at)} | ${step.speed ? `⏩ ${step.speed}× ` : ''}${step.name} | ${step.caption} | ${subtitles(step)} | ${camera(step)} |`),
  ].join('\n');
}

function writeDiagramsReadme() {
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const secs = Number(probe(path.join(DIAGRAMS_OUT, 'diagrams.mp4'), 'format=duration')).toFixed(1);
  const rows = listFiles(DIAGRAMS_OUT).map((f) => {
    const still = diagrams.stills.find((s) => f.rel.startsWith(`stills/${s.file}.`));
    const what =
      f.rel === 'diagrams.mp4' ? `H.264, 30 fps, ${secs} s, no audio: the whole walkthrough`
        : f.rel === 'diagrams-poster.jpg' ? 'First frame, for `<video poster>`'
          : still ? still.caption
            : /^diagrams\.(vtt|srt)$/.test(f.rel) ? 'The subtitles burned into the film, as a sidecar'
            : f.rel.endsWith('.docx') ? 'Exported by the film'
              : f.rel.endsWith('.png') ? 'Page 1 of that .docx, rendered by LibreOffice' : '';
    return `| \`${f.rel}\` | ${f.dims} | ${kb(f.size)} | ${what} |`;
  });
  const text = [
    '# Demo media: diagrams',
    '',
    'A supply-and-demand diagram for a per-unit tax, drawn from blank axes on the real canvas',
    '(curves, equilibria, the shift, shaded areas), dropped into a question and exported to',
    'Word: the job teachers otherwise do with loose lines and text boxes in Word.',
    '',
    'Generated by `npm run demo:diagrams` (`scripts/demo/diagrams.mjs`) from the built web app',
    'in Chrome, from a seeded worksheet. The film is recorded at 2× and framed afterwards by a',
    'virtual camera (the Camera column below); the subtitles are drawn over it, unzoomed, and',
    'are also in `diagrams.vtt` / `.srt`. Stills are 2× page screenshots, framed as the camera',
    'was, scaled to 1440 wide, captured during the recording and cut out of it. The example',
    'question is original text.',
    '',
    '| File | Dimensions | Size | What it shows |',
    '|---|---|---|---|',
    ...rows,
    ...(notes.length ? ['', '## Notes on this build', '', ...notes.map((n) => `- ${n}`)] : []),
    '',
    '## Video storyboard',
    '',
    storyboardTable(fmt),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(DIAGRAMS_OUT, 'README.md'), text);
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
      storyboardTable(fmt),
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
    'Screenshots are captured at 2× and scaled to 1440 wide. The film is recorded at 2× and',
    'framed afterwards by a virtual camera; its subtitles are drawn over that, unzoomed, and',
    'are also in `demo.vtt` / `.srt`. All example questions are original text written for',
    'the demo, not HKEAA past-paper items.',
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
