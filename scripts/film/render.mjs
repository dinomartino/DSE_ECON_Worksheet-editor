#!/usr/bin/env node
// Renders the stage to video (FILM.md §8). N Chrome workers on the GPU each render a
// contiguous frame range: film.seek(t) → CDP screenshot (PNG) → their own lossless ffmpeg
// segment. Segments are concatenated and encoded once, with the score if it exists.
//
//   node scripts/film/render.mjs --preview                 960×540 30 fps, shutter 1
//   node scripts/film/render.mjs --final                   1920×1080 60 fps, shutter 5
//   … --from=<bar> --to=<bar> | --scene=<id>              a range (writes build/renders/)
//   … --stills=<seconds step> [--at=12.5,15.9]             PNG frames for review
//   … --workers=N --shutter=K --out=<file> --events-only --headed --allow-software
//   … --assets=fake|<dir>   serve another asset store (fake: synthetic stand-ins only)
//   … --transition=<scene>:<type>:<beats> --dof=<focus>,<aperture>,<maxBlur>   dev overrides
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TL from './timeline.mjs';
import { OUT, BUILD, AUDIO, ensureDirs } from './paths.mjs';
import { serve, FAKE_ASSETS } from './tools/serve.mjs';
import { launchOnGpu, openStage } from './tools/chrome.mjs';

export function parseArgs(argv) {
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (m) o[m[1]] = m[2] ?? true;
  }
  return o;
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
  const report = { ...P, gpu, headed, started: new Date().toISOString() };
  const stats = { frames: 0 };
  const workerLogs = [];

  try {
    // Events (timeline cues + scene events + placed clip events) for the score's SFX pass.
    {
      const { context, page, logs } = await openStage(browser, server.url, { ...size, w: 320, h: 180 });
      const events = await page.evaluate(() => window.film.events());
      // Only the real asset store's events feed the score.
      const evFile = resolve(BUILD, args.assets ? 'events-alt-assets.json' : 'events.json');
      writeFileSync(evFile, `${JSON.stringify(events, null, 1)}\n`);
      console.log(`events: ${events.length} → ${evFile}`);
      workerLogs.push(...logs);
      await context.close();
      if (args['events-only']) return report;
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
      await Promise.all(chunks.map(async ([a, b]) => {
        const { context, page, logs } = await openStage(browser, server.url, size);
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
        const { context, page, logs } = await openStage(browser, server.url, size);
        const cdp = await context.newCDPSession(page);
        const ff = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(P.fps), '-i', '-',
          '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', '-r', String(P.fps), seg], { stdin: true });
        try {
          for (let f = a; f < b; f++) {
            await page.evaluate((x) => window.film.seek(x), f / P.fps);
            const png = await capture(cdp);
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
      await ffmpeg([
        '-f', 'concat', '-safe', '0', '-i', list, ...audio,
        '-map', '0:v:0', '-map', '1:a:0',
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
        '-c:v', 'libx264', '-profile:v', 'high', '-preset', P.preview ? 'medium' : 'slow', '-crf', P.preview ? '19' : '16',
        '-r', String(P.fps), '-g', String(2 * P.fps), '-x264-params', 'aq-mode=3:colorprim=bt709:transfer=bt709:colormatrix=bt709',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
        '-t', dur.toFixed(6), '-movflags', '+faststart', P.out,
      ]).done;
      if (!args.keep) rmSync(segDir, { recursive: true, force: true });
      report.output = P.out;
      console.log(`video: ${P.out}`);
    }
    const secs = (performance.now() - t0) / 1000;
    report.seconds = +secs.toFixed(2);
    report.frames = stats.frames;
    report.fps = +(stats.frames / secs).toFixed(2);
    console.log(`rendered ${stats.frames} frames in ${secs.toFixed(1)} s (${report.fps} frames/s, ${P.workers} workers)`);
  } finally {
    report.fallbackAssets = [...server.fallbackHits];
    report.missingAssets = [...server.missing];
    report.pageLogs = [...new Set(workerLogs)].slice(0, 50);
    await browser.close();
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
  render(parseArgs(process.argv.slice(2))).catch((e) => {
    console.error(e.stack ?? e);
    process.exit(1);
  });
}
