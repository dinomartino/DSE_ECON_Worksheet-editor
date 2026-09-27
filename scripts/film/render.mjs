#!/usr/bin/env node
// Renders the stage to video (FILM.md §8). N Chrome workers on the GPU each render a
// contiguous frame range: film.seek(t) → CDP screenshot (PNG) → their own lossless ffmpeg
// segment. Segments are concatenated and encoded once, with the score if it exists. A video
// is never muxed with a score built from another timeline or other events: a stale score is
// rebuilt first (score.mjs sfx+mix, or all), and one that cannot be is refused.
//
//   node scripts/film/render.mjs --preview                 960×540 30 fps, shutter 1
//   node scripts/film/render.mjs --final                   1920×1080 60 fps, shutter 5
//   … --from=<bar> --to=<bar> | --scene=<id>              a range (writes build/renders/)
//   … --stills=<seconds step> [--at=12.5,15.9]             PNG frames for review
//   … --workers=N --shutter=K --out=<file> --events-only --headed --allow-software
//   … --assets=fake|<dir>   serve another asset store (fake: synthetic stand-ins only)
//   … --transition=<scene>:<type>:<beats> --dof=<focus>,<aperture>,<maxBlur>   dev overrides
//   … --stale-audio   mux the existing score even when it does not match (not for delivery)
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TL from './timeline.mjs';
import { OUT, BUILD, AUDIO, FILM_DIR, ensureDirs } from './paths.mjs';
import { serve, FAKE_ASSETS } from './tools/serve.mjs';
import { launch, launchOnGpu, openStage as open, isSoftware } from './tools/chrome.mjs';

/** render.mjs's flags and what they do (--help prints them). */
export const RENDER_FLAGS = {
  preview: '960×540 30 fps, shutter 1',
  final: '1920×1080 60 fps, shutter 5 (the default)',
  from: '<bar> start of a range (writes build/renders/)',
  to: '<bar> end of a range',
  scene: '<id> one scene\'s window',
  stills: '<step s> PNG frames every step instead of a video',
  at: '<s,s,...> PNG frames at these times',
  keep: 'keep stills and segments from earlier runs',
  workers: '<n> Chrome workers',
  shutter: '<k> motion-blur subframes',
  w: '<px> width', h: '<px> height', fps: '<n> frame rate',
  out: '<file> the video path',
  'events-only': 'write build/events.json and stop',
  headed: 'render in a headed (off-screen) Chrome',
  'allow-software': 'allow a software WebGL renderer',
  assets: 'fake|<dir> another asset store',
  transition: '<scene>:<type>:<beats> dev override',
  dof: '<focus>,<aperture>,<maxBlur> dev override',
  'stale-audio': 'mux the existing score even when stale (not for delivery)',
  help: 'this text',
};

export const usage = (cmd, flags) =>
  `${cmd} [flags]\n${Object.entries(flags).map(([k, v]) => `  --${k.padEnd(15)} ${v}`).join('\n')}`;

/** --name[=value] flags; anything not in `known` throws (a typo must not start a full render). */
export function parseArgs(argv, known = RENDER_FLAGS) {
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m || !(m[1] in known)) throw new Error(`unknown argument ${a} (--help lists the flags)`);
    o[m[1]] = m[2] ?? true;
  }
  return o;
}

// The final encode keeps the dither grain in dark gradients (the default settings smooth it
// into 1-code-value rings): stronger AQ, lighter deblocking, psy-trellis, a low deadzone.
// About 2× the bitrate in dark scenes; flat dark 8×8 blocks at 88 s: 33% → 2%.
const GRAIN_SAFE = 'aq-strength=1.1:deblock=-2,-2:psy-rd=1.0,0.15:no-dct-decimate=1:deadzone-inter=8:deadzone-intra=6:';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
// Python's json.dumps(sort_keys=True, separators=(',', ':'), ensure_ascii=False).
const canon = (v) =>
  Array.isArray(v)
    ? `[${v.map(canon).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`
      : JSON.stringify(v);

/** The timeline data the music depends on, hashed as scorelib/common.py timeline_sha256() does. */
export const musicKey = () =>
  sha256(canon({ BPM: TL.BPM, DURATION: TL.DURATION, SECTIONS: TL.SECTIONS, CUES: TL.CUES, CHORDS: TL.CHORDS }));

/** Whether audio/score.wav was mixed from this timeline and exactly these events. */
export function scoreState(eventsText) {
  const read = (f) => {
    try {
      return JSON.parse(readFileSync(resolve(AUDIO, f), 'utf8'));
    } catch {
      return {};
    }
  };
  const mtime = (f) => (existsSync(resolve(AUDIO, f)) ? statSync(resolve(AUDIO, f)).mtimeMs : 0);
  const key = musicKey();
  const sfx = read('sfx-events.json');
  const s = {
    exists: mtime('score.wav') > 0,
    music: read('music-levels.json').timeline_sha256 === key,
    sfx: sfx.timeline_sha256 === key && sfx.source_sha256 === sha256(eventsText),
    mixed: mtime('score.wav') >= Math.max(mtime('music.wav'), mtime('sfx.wav')),
  };
  s.current = s.exists && s.music && s.sfx && s.mixed;
  return s;
}

/** Rebuilds what is stale in the score (the music only when the timeline moved). */
export function syncScore(eventsText) {
  let s = scoreState(eventsText);
  if (s.current) return s;
  const steps = !s.music ? ['all'] : !s.sfx ? ['sfx', 'mix'] : ['mix'];
  console.log(`score: stale (music ${s.music ? 'ok' : 'old'}, sfx ${s.sfx ? 'ok' : 'old'}, mix ${s.mixed ? 'ok' : 'old'}); running ${steps.join(' + ')}`);
  for (const step of steps) spawnSync('node', [resolve(FILM_DIR, 'score/score.mjs'), step], { stdio: 'inherit' });
  s = scoreState(eventsText);
  return s;
}

const tc = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${String(m).padStart(2, '0')}m${s.toFixed(3).padStart(6, '0')}s`;
};

/** The render settings for a set of flags. */
export function plan(args) {
  const preview = !!args.preview && !args.final;
  const w = Number(args.w ?? (preview ? 960 : TL.W));
  const h = Number(args.h ?? (preview ? 540 : TL.H));
  const fps = Number(args.fps ?? (preview ? 30 : TL.FPS));
  const shutter = Number(args.shutter ?? (preview ? 1 : 5));
  let from = 0, to = TL.DURATION, label = 'film';
  if (args.scene) {
    const win = TL.sceneWindow(args.scene);
    ({ start: from, end: to } = win);
    label = `scene-${args.scene}`;
  }
  if (args.from != null || args.to != null) {
    from = TL.bar(Number(args.from ?? 0));
    to = TL.bar(Number(args.to ?? 47));
    label = `bars${args.from ?? 0}-${args.to ?? 47}`;
  }
  const full = from === 0 && to === TL.DURATION;
  const mode = preview ? 'preview' : 'final';
  const out = args.out
    ? resolve(args.out)
    : full
      ? resolve(OUT, preview ? 'econ-worksheet-film-preview.mp4' : 'econ-worksheet-film.mp4')
      : resolve(BUILD, 'renders', `${mode}-${label}.mp4`);
  const workers = Number(args.workers ?? Math.max(1, Math.min(6, cpus().length - 2)));
  return { preview, mode, w, h, fps, shutter, from, to, label, full, out, workers };
}

function ffmpeg(args, { stdin = false } = {}) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], {
    stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'],
  });
  const done = new Promise((ok, fail) =>
    p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}: ${args.join(' ')}`)))),
  );
  done.catch(() => {}); // awaited by the caller; a worker's own error takes precedence
  return { p, done };
}

/** Frame numbers [a, b) split into n contiguous ranges. */
function split(a, b, n) {
  const total = b - a;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = a + Math.floor((total * i) / n);
    const e = a + Math.floor((total * (i + 1)) / n);
    if (e > s) out.push([s, e]);
  }
  return out;
}

async function capture(cdp) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

/** Opens a stage page and refuses a software renderer (every worker, not just the first). */
async function openStage(browser, base, size, allowSoftware) {
  const st = await open(browser, base, size);
  if (isSoftware(st.gpu) && !allowSoftware) throw new Error(`worker on a software renderer: ${st.gpu.renderer}`);
  return st;
}

export async function render(args) {
  ensureDirs();
  const P = plan(args);
  const server = await serve(
    args.assets === 'fake' ? { assets: FAKE_ASSETS, fallbacks: [] } : args.assets ? { assets: resolve(args.assets) } : {},
  );
  const extra = ['transition', 'dof'].filter((k) => args[k]).map((k) => `&${k}=${encodeURIComponent(args[k])}`).join('');
  const size = { w: P.w, h: P.h, fps: P.fps, shutter: P.shutter, extra };
  const { browser, gpu, headed } = await launchOnGpu(server.url, size, {
    allowSoftware: !!args['allow-software'],
    forceHeaded: !!args.headed,
  });
  console.log(`GPU: ${gpu.renderer} (${gpu.vendor})${headed ? ' [headed, off-screen]' : ' [headless]'}`);
  // One browser per worker: Chrome encodes screenshots in its browser process, so workers
  // sharing one browser queue behind each other.
  const extraBrowsers = [];
  const browserFor = async (i) => {
    if (i === 0) return browser;
    const b = await launch({ headed });
    extraBrowsers.push(b);
    return b;
  };
  const report = { ...P, gpu, headed, started: new Date().toISOString() };
  const stats = { frames: 0, seekMs: 0, shotMs: 0 };
  const workerLogs = [];

  try {
    // Events (timeline cues + scene events + placed clip events) for the score's SFX pass.
    let eventsText;
    {
      const { context, page, logs } = await openStage(browser, server.url, { ...size, w: 320, h: 180 }, args['allow-software']);
      const events = await page.evaluate(() => window.film.events());
      // Only the real asset store's events feed the score.
      const evFile = resolve(BUILD, args.assets ? 'events-alt-assets.json' : 'events.json');
      eventsText = `${JSON.stringify(events, null, 1)}\n`;
      writeFileSync(evFile, eventsText);
      console.log(`events: ${events.length} → ${evFile}`);
      workerLogs.push(...logs);
      await context.close();
      if (args['events-only']) return report;
    }
    // The score must be built from this timeline and these events before it is muxed.
    const video = !args.stills && !args.at;
    if (video && !args.assets && !args['stale-audio']) {
      const s = syncScore(eventsText);
      if (s.exists && !s.current) {
        throw new Error('audio/score.wav does not match this timeline and events.json and could not be rebuilt ' +
          '(node scripts/film/score/score.mjs all); --stale-audio muxes it anyway');
      }
      report.scoreCurrent = s.current;
    }

    const t0 = performance.now();
    if (args.stills || args.at) {
      const step = Number(args.stills || 1);
      const times = args.at
        ? String(args.at).split(',').map(Number)
        : Array.from({ length: Math.floor((P.to - P.from) / step + 1e-6) + 1 }, (_, i) => P.from + i * step).filter((t) => t < P.to);
      const dir = resolve(BUILD, 'stills', `${P.mode}-${P.label}`);
      if (!args.keep) rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const chunks = split(0, times.length, Math.min(P.workers, times.length));
      await Promise.all(chunks.map(async ([a, b], wi) => {
        const { context, page, logs } = await openStage(await browserFor(wi), server.url, size, args['allow-software']);
        const cdp = await context.newCDPSession(page);
        for (let i = a; i < b; i++) {
          // Snap to the frame grid so a still is exactly a frame of the video.
          const t = Math.round(times[i] * P.fps) / P.fps;
          await page.evaluate((x) => window.film.seek(x), t);
          writeFileSync(resolve(dir, `t${tc(t)}.png`), await capture(cdp));
          stats.frames++;
        }
        workerLogs.push(...logs);
        await context.close();
      }));
      report.stills = dir;
      console.log(`stills: ${times.length} → ${dir}`);
    } else {
      const f0 = Math.round(P.from * P.fps);
      const f1 = Math.round(P.to * P.fps);
      const segDir = resolve(BUILD, 'segments', `${P.mode}-${P.label}`);
      rmSync(segDir, { recursive: true, force: true });
      mkdirSync(segDir, { recursive: true });
      const ranges = split(f0, f1, Math.min(P.workers, Math.ceil((f1 - f0) / 20)));
      const total = f1 - f0;
      let lastLog = 0;
      const segs = await Promise.all(ranges.map(async ([a, b], wi) => {
        const seg = resolve(segDir, `seg-${String(wi).padStart(2, '0')}.mkv`);
        const { context, page, logs } = await openStage(await browserFor(wi), server.url, size, args['allow-software']);
        const cdp = await context.newCDPSession(page);
        const ff = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(P.fps), '-i', '-',
          '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', '-r', String(P.fps), seg], { stdin: true });
        try {
          for (let f = a; f < b; f++) {
            const s0 = performance.now();
            await page.evaluate((x) => window.film.seek(x), f / P.fps);
            const s1 = performance.now();
            const png = await capture(cdp);
            stats.seekMs += s1 - s0;
            stats.shotMs += performance.now() - s1;
            if (!ff.p.stdin.write(png)) await once(ff.p.stdin, 'drain');
            stats.frames++;
            const now = performance.now();
            if (now - lastLog > 3000) {
              lastLog = now;
              const s = (now - t0) / 1000;
              process.stdout.write(`  ${stats.frames}/${total} frames, ${(stats.frames / s).toFixed(1)} fps\n`);
            }
          }
        } finally {
          ff.p.stdin.end();
        }
        await ff.done;
        workerLogs.push(...logs);
        await context.close();
        return seg;
      }));
      const list = resolve(segDir, 'list.txt');
      writeFileSync(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
      const dur = (f1 - f0) / P.fps;
      const score = resolve(AUDIO, 'score.wav');
      const audio = existsSync(score)
        ? ['-ss', P.from.toFixed(6), '-t', dur.toFixed(6), '-i', score]
        : ['-f', 'lavfi', '-t', dur.toFixed(6), '-i', 'anullsrc=r=48000:cl=stereo'];
      report.audio = existsSync(score) ? score : 'silent';
      mkdirSync(resolve(P.out, '..'), { recursive: true });
      const e0 = performance.now();
      await ffmpeg([
        '-f', 'concat', '-safe', '0', '-i', list, ...audio,
        '-map', '0:v:0', '-map', '1:a:0',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
        '-c:v', 'libx264', '-profile:v', 'high', '-preset', P.preview ? 'medium' : 'slow', '-crf', P.preview ? '19' : '16',
        '-r', String(P.fps), '-g', String(2 * P.fps), '-x264-params', `aq-mode=3:${P.preview ? '' : GRAIN_SAFE}colorprim=bt709:transfer=bt709:colormatrix=bt709`,
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
        '-t', dur.toFixed(6), '-movflags', '+faststart', P.out,
      ]).done;
      report.encodeSeconds = +((performance.now() - e0) / 1000).toFixed(1);
      if (!args.keep) rmSync(segDir, { recursive: true, force: true });
      report.output = P.out;
      console.log(`video: ${P.out}`);
    }
    const secs = (performance.now() - t0) / 1000;
    report.seconds = +secs.toFixed(2);
    report.frames = stats.frames;
    report.fps = +(stats.frames / secs).toFixed(2);
    if (stats.seekMs) {
      report.perFrameMs = { seek: +(stats.seekMs / stats.frames).toFixed(1), screenshot: +(stats.shotMs / stats.frames).toFixed(1) };
      if (report.encodeSeconds != null) report.renderFps = +(stats.frames / (secs - report.encodeSeconds)).toFixed(2);
    }
    console.log(`rendered ${stats.frames} frames in ${secs.toFixed(1)} s (${report.fps} frames/s end to end, ${P.workers} workers)` +
      (report.perFrameMs ? `; per worker frame: seek ${report.perFrameMs.seek} ms, screenshot ${report.perFrameMs.screenshot} ms; frames alone ${report.renderFps} frames/s, final encode ${report.encodeSeconds} s` : ''));
  } finally {
    report.fallbackAssets = [...server.fallbackHits];
    report.missingAssets = [...server.missing];
    report.pageLogs = [...new Set(workerLogs)].slice(0, 50);
    await Promise.all([browser, ...extraBrowsers].map((b) => b.close()));
    await server.close();
    mkdirSync(resolve(BUILD, 'renders'), { recursive: true });
    writeFileSync(resolve(BUILD, 'renders', `${P.mode}-${P.label}${args.stills || args.at ? '-stills' : ''}.json`), `${JSON.stringify(report, null, 2)}\n`);
    if (report.fallbackAssets.length) console.warn(`WARNING: stand-in assets from build/fake-assets: ${report.fallbackAssets.join(', ')}`);
    if (report.missingAssets.length) console.warn(`WARNING: missing assets: ${report.missingAssets.join(', ')}`);
    if (report.pageLogs.length) console.warn(`page messages:\n  ${report.pageLogs.join('\n  ')}`);
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`render: ${e.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log(usage('npm run film:render --', RENDER_FLAGS));
    process.exit(0);
  }
  render(args).catch((e) => {
    console.error(e.stack ?? e);
    process.exit(1);
  });
}
