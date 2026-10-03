#!/usr/bin/env node
// Renders the v2 stage to video (FILM.md §7). N Chrome workers each render a contiguous frame
// range: film.seek(t) → CDP screenshot (PNG) → their own lossless ffmpeg segment; segments are
// concatenated and encoded once, muxed with the music master (MUSIC.audio) and, when it exists,
// $FILM_OUT/audio/sfx.wav. The stage is DOM/SVG: no GPU needed, no score gate.
//
//   node scripts/film2/render.mjs --preview              960×540 30 fps
//   node scripts/film2/render.mjs --final                1920×1080 60 fps (the default)
//   … --from=<s> --to=<s> | --scene=<id>                 a range (writes renders/)
//   … --stills=<step s> | --at=<s,s,…>                    PNG frames → $FILM_OUT/stills/
//   … --workers=N --out=<file> --events-only --keep
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TL from './timeline.mjs';
import { OUT, BUILD, AUDIO, MUSIC_FILE, ensureDirs } from './paths.mjs';
import { serve } from './tools/serve.mjs';
import { launch, openStage } from '../film/tools/chrome.mjs';

export const RENDER_FLAGS = {
  preview: '960×540 30 fps',
  final: '1920×1080 60 fps (the default)',
  from: '<s> start of a range, film seconds',
  to: '<s> end of a range, film seconds',
  scene: '<id> one scene\'s window (transitions included)',
  stills: '<step s> PNG frames every step instead of a video',
  at: '<s,s,...> PNG frames at these times',
  keep: 'keep stills and segments from earlier runs',
  workers: '<n> Chrome workers',
  w: '<px> width', h: '<px> height', fps: '<n> frame rate',
  out: '<file> the video path',
  'events-only': 'write build/events.json and stop',
  help: 'this text',
};

export const usage = (cmd, flags) => `${cmd} [flags]\n${Object.entries(flags).map(([k, v]) => `  --${k.padEnd(12)} ${v}`).join('\n')}`;

/** --name[=value] flags; anything unknown throws (a typo must not start a full render). */
export function parseArgs(argv, known = RENDER_FLAGS) {
  const o = {};
  for (const a of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m || !(m[1] in known)) throw new Error(`unknown argument ${a} (--help lists the flags)`);
    o[m[1]] = m[2] ?? true;
  }
  return o;
}

const tc = (t) => {
  const m = Math.floor(t / 60);
  return `${String(m).padStart(2, '0')}m${(t - m * 60).toFixed(3).padStart(6, '0')}s`;
};

export function plan(args) {
  const preview = !!args.preview && !args.final;
  const w = Number(args.w ?? (preview ? 960 : TL.W));
  const h = Number(args.h ?? (preview ? 540 : TL.H));
  const fps = Number(args.fps ?? (preview ? 30 : TL.FPS));
  let from = 0, to = TL.DURATION, label = 'film';
  if (args.scene) {
    ({ start: from, end: to } = TL.sceneWindow(args.scene));
    label = `scene-${args.scene}`;
  }
  if (args.from != null || args.to != null) {
    from = Number(args.from ?? 0);
    to = Math.min(TL.DURATION, Number(args.to ?? TL.DURATION));
    if (!(to > from)) throw new Error(`empty range ${from}..${to}`);
    label = `s${from}-${to}`;
  }
  const full = from === 0 && to === TL.DURATION;
  const mode = preview ? 'preview' : 'final';
  const out = args.out
    ? resolve(args.out)
    : full ? resolve(OUT, `econ-studio-film${preview ? '-preview' : ''}.mp4`) : resolve(OUT, 'renders', `${mode}-${label}.mp4`);
  const workers = Number(args.workers ?? Math.max(1, Math.min(6, cpus().length - 2)));
  return { preview, mode, w, h, fps, from, to, label, full, out, workers };
}

function ffmpeg(args, { stdin = false } = {}) {
  const p = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: [stdin ? 'pipe' : 'ignore', 'inherit', 'inherit'] });
  const done = new Promise((ok, fail) => p.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}: ${args.join(' ')}`)))));
  done.catch(() => {});
  return { p, done };
}

function split(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = a + Math.floor(((b - a) * i) / n);
    const e = a + Math.floor(((b - a) * (i + 1)) / n);
    if (e > s) out.push([s, e]);
  }
  return out;
}

async function capture(cdp) {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true, fromSurface: true, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

/** The audio inputs + filter for [from, from + dur): the music master and sfx.wav if present. */
function audioArgs(from, dur) {
  const at = (from + TL.MUSIC.offset).toFixed(6);
  const sfx = resolve(AUDIO, 'sfx.wav');
  if (!existsSync(MUSIC_FILE)) {
    return { inputs: ['-f', 'lavfi', '-t', dur.toFixed(6), '-i', 'anullsrc=r=48000:cl=stereo'], map: ['-map', '1:a:0'], used: 'silent' };
  }
  const inputs = ['-ss', at, '-t', dur.toFixed(6), '-i', MUSIC_FILE];
  if (!existsSync(sfx)) return { inputs, map: ['-map', '1:a:0'], used: MUSIC_FILE };
  inputs.push('-ss', from.toFixed(6), '-t', dur.toFixed(6), '-i', sfx);
  return {
    inputs,
    map: ['-filter_complex', '[1:a][2:a]amix=inputs=2:normalize=0:duration=first[a]', '-map', '[a]'],
    used: `${MUSIC_FILE} + ${sfx}`,
  };
}

export async function render(args) {
  ensureDirs();
  const P = plan(args);
  const server = await serve();
  const size = { w: P.w, h: P.h, fps: P.fps, shutter: 1 };
  const browsers = [];
  const browserFor = async () => {
    const b = await launch();
    browsers.push(b);
    return b;
  };
  const report = { ...P, started: new Date().toISOString() };
  const stats = { frames: 0, seekMs: 0, shotMs: 0 };
  const logs = [];
  try {
    {
      const { context, page, logs: l } = await openStage(await browserFor(), server.url, { ...size, w: 320, h: 180 });
      const events = await page.evaluate(() => window.film.events());
      mkdirSync(BUILD, { recursive: true });
      writeFileSync(resolve(BUILD, 'events.json'), `${JSON.stringify(events, null, 1)}\n`);
      console.log(`events: ${events.length} → ${resolve(BUILD, 'events.json')}`);
      logs.push(...l);
      await context.close();
      if (args['events-only']) return report;
    }
    const t0 = performance.now();
    if (args.stills || args.at) {
      const step = Number(args.stills || 1);
      const times = args.at
        ? String(args.at).split(',').map(Number)
        : Array.from({ length: Math.floor((P.to - P.from) / step + 1e-6) + 1 }, (_, i) => P.from + i * step).filter((t) => t < P.to);
      const dir = resolve(OUT, 'stills', `${P.mode}-${args.at ? 'at' : P.label}`);
      if (!args.keep) rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const chunks = split(0, times.length, Math.min(P.workers, times.length));
      await Promise.all(chunks.map(async ([a, b], wi) => {
        const { context, page, logs: l } = await openStage(wi === 0 ? browsers[0] : await browserFor(), server.url, size);
        const cdp = await context.newCDPSession(page);
        for (let i = a; i < b; i++) {
          const t = Math.round(times[i] * P.fps) / P.fps; // a still is exactly a frame of the video
          await page.evaluate((x) => window.film.seek(x), t);
          writeFileSync(resolve(dir, `t${tc(t)}.png`), await capture(cdp));
          stats.frames++;
        }
        logs.push(...l);
        await context.close();
      }));
      report.stills = dir;
      console.log(`stills: ${times.length} → ${dir}`);
    } else {
      const f0 = Math.round(P.from * P.fps), f1 = Math.round(P.to * P.fps);
      const segDir = resolve(BUILD, 'segments', `${P.mode}-${P.label}`);
      rmSync(segDir, { recursive: true, force: true });
      mkdirSync(segDir, { recursive: true });
      const ranges = split(f0, f1, Math.min(P.workers, Math.ceil((f1 - f0) / 20)));
      let lastLog = 0;
      const segs = await Promise.all(ranges.map(async ([a, b], wi) => {
        const seg = resolve(segDir, `seg-${String(wi).padStart(2, '0')}.mkv`);
        const { context, page, logs: l } = await openStage(wi === 0 ? browsers[0] : await browserFor(), server.url, size);
        const cdp = await context.newCDPSession(page);
        const ff = ffmpeg(['-f', 'image2pipe', '-c:v', 'png', '-framerate', String(P.fps), '-i', '-',
          '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', '-r', String(P.fps), seg], { stdin: true });
        try {
          for (let fr = a; fr < b; fr++) {
            const s0 = performance.now();
            await page.evaluate((x) => window.film.seek(x), fr / P.fps);
            const s1 = performance.now();
            const png = await capture(cdp);
            stats.seekMs += s1 - s0;
            stats.shotMs += performance.now() - s1;
            if (!ff.p.stdin.write(png)) await once(ff.p.stdin, 'drain');
            stats.frames++;
            const now = performance.now();
            if (now - lastLog > 3000) {
              lastLog = now;
              process.stdout.write(`  ${stats.frames}/${f1 - f0} frames, ${(stats.frames / ((now - t0) / 1000)).toFixed(1)} fps\n`);
            }
          }
        } finally {
          ff.p.stdin.end();
        }
        await ff.done;
        logs.push(...l);
        await context.close();
        return seg;
      }));
      const list = resolve(segDir, 'list.txt');
      writeFileSync(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
      const dur = (f1 - f0) / P.fps;
      const audio = audioArgs(P.from, dur);
      report.audio = audio.used;
      mkdirSync(resolve(P.out, '..'), { recursive: true });
      const e0 = performance.now();
      await ffmpeg([
        '-f', 'concat', '-safe', '0', '-i', list, ...audio.inputs,
        '-map', '0:v:0', ...audio.map,
        '-vf', 'scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int+full_chroma_inp,format=yuv420p,setparams=range=tv:color_primaries=bt709:color_trc=bt709:colorspace=bt709',
        '-c:v', 'libx264', '-profile:v', 'high', '-preset', P.preview ? 'medium' : 'slow', '-crf', P.preview ? '19' : '16',
        '-r', String(P.fps), '-g', String(2 * P.fps), '-x264-params', 'aq-mode=3:colorprim=bt709:transfer=bt709:colormatrix=bt709',
        '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
        '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-ac', '2',
        '-t', dur.toFixed(6), '-movflags', '+faststart', P.out,
      ]).done;
      report.encodeSeconds = +((performance.now() - e0) / 1000).toFixed(1);
      if (!args.keep) rmSync(segDir, { recursive: true, force: true });
      report.output = P.out;
      console.log(`video: ${P.out} (audio: ${audio.used})`);
    }
    const secs = (performance.now() - t0) / 1000;
    report.seconds = +secs.toFixed(2);
    report.frames = stats.frames;
    if (stats.seekMs) report.perFrameMs = { seek: +(stats.seekMs / stats.frames).toFixed(1), screenshot: +(stats.shotMs / stats.frames).toFixed(1) };
    console.log(`rendered ${stats.frames} frames in ${secs.toFixed(1)} s with ${P.workers} workers` +
      (report.perFrameMs ? `; per frame: seek ${report.perFrameMs.seek} ms, screenshot ${report.perFrameMs.screenshot} ms` : ''));
  } finally {
    report.missingAssets = [...server.missing];
    report.pageLogs = [...new Set(logs)].slice(0, 50);
    await Promise.all(browsers.map((b) => b.close()));
    await server.close();
    mkdirSync(resolve(OUT, 'renders'), { recursive: true });
    writeFileSync(resolve(OUT, 'renders', `${P.mode}-${P.label}${args.stills || args.at ? '-stills' : ''}.json`), `${JSON.stringify(report, null, 2)}\n`);
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
    console.log(usage('node scripts/film2/render.mjs', RENDER_FLAGS));
    process.exit(0);
  }
  render(args).catch((e) => {
    console.error(e.stack ?? e);
    process.exit(1);
  });
}
