#!/usr/bin/env node
// demo-media/film/README.md for a finished film (FILM.md §9): what the files are, the
// storyboard with real timecodes, the shared cues, how it was made, credits, how to re-run.
//   node scripts/film/tools/readme.mjs [video]      (film.mjs writes it after a full render)
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as TL from '../timeline.mjs';
import { ASSETS, AUDIO, BUILD, FILM_DIR, OUT } from '../paths.mjs';

const tc = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const mb = (f) => (statSync(f).size < 1e6 ? `${Math.ceil(statSync(f).size / 1e3)} KB` : `${(statSync(f).size / 1e6).toFixed(1)} MB`);
const json = (f) => {
  try {
    return JSON.parse(readFileSync(f, 'utf8'));
  } catch {
    return null;
  }
};
const git = (...a) => {
  try {
    return execFileSync('git', a, { cwd: FILM_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '?';
  }
};

function probe(video) {
  const r = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries',
    'stream=codec_type,codec_name,profile,width,height,avg_frame_rate,sample_rate,channels,bit_rate:format=duration,bit_rate',
    '-of', 'json', video], { encoding: 'utf8' }));
  const v = r.streams.find((s) => s.codec_type === 'video');
  const a = r.streams.find((s) => s.codec_type === 'audio');
  const [n, d] = v.avg_frame_rate.split('/').map(Number);
  return { v, a, fps: n / d, duration: Number(r.format.duration), kbps: Math.round(Number(r.format.bit_rate) / 1000) };
}

/** Every string of a scene's copy, English and Chinese, in order. */
function copyOf(id) {
  const out = [];
  const walk = (v) => (Array.isArray(v) ? v.forEach(walk) : v && typeof v === 'object' ? Object.values(v).forEach(walk) : v && out.push(String(v).replace(/\n/g, ' ')));
  walk(TL.COPY[id] ?? {});
  return out;
}

const transition = (s) => {
  const t = s.in?.type ?? 'cut';
  const d = s.in?.beats ? ` (${s.in.beats} beat${s.in.beats > 1 ? 's' : ''})` : '';
  return `${t.replace(/([A-Z])/g, ' $1').toLowerCase()}${d}${s.out ? `; out: ${s.out.type.replace(/([A-Z])/g, ' $1').toLowerCase()}` : ''}`;
};

const music = (s) =>
  TL.SECTIONS.filter((m) => m.from < s.to && m.to > s.from).map((m) => `${m.id} (${Math.round(m.energy * 100)}%)`).join(', ');

export function readme(video, { report = json(resolve(BUILD, 'renders', `${basename(video, '.mp4')}.json`)) ?? {} } = {}) {
  const p = probe(video);
  const score = json(resolve(AUDIO, 'report.json'));
  const sfx = json(resolve(AUDIO, 'sfx-events.json'));
  const manifest = json(resolve(ASSETS, 'manifest.json'));
  const clips = (manifest?.assets ?? []).filter((a) => a.kind === 'clip');
  const rel = (f) => (relative(OUT, f).startsWith('..') ? basename(f) : relative(OUT, f) || basename(f));
  const files = [
    [video, `the film: ${p.v.width}×${p.v.height}, ${p.fps} fps, ${p.v.codec_name.toUpperCase()} ${p.v.profile}, ${p.kbps} kbps`],
    [resolve(OUT, 'poster.jpg'), 'the poster: the title frame'],
    [resolve(OUT, 'contact-sheet.jpg'), 'a frame every second, timecoded, with its scene'],
    [resolve(AUDIO, 'score.wav'), 'the score: music and sound design, mastered, 48 kHz 24-bit'],
    [resolve(AUDIO, 'stems'), 'music stems: drums, bass, harmony, lead, fx (they sum to music.wav)'],
    [resolve(AUDIO, 'sfx.wav'), 'the sound design alone: cue sounds and the app’s own clicks and keys'],
    [resolve(AUDIO, 'report.txt'), 'the score’s verification: loudness, true peak, cue timing, mono'],
    [resolve(AUDIO, 'spectrogram.png'), 'the full mix, with sections and cues'],
  ].filter(([f]) => existsSync(f));

  const L = score?.loudness;
  const lines = [
    '# Econ Worksheet — product film',
    '',
    `**${basename(video)}** · ${tc(p.duration)} · ${p.v.width}×${p.v.height} · ${p.fps} fps · H.264 ${p.v.profile} · ` +
      (p.a ? `AAC ${p.a.sample_rate / 1000} kHz ${p.a.channels === 2 ? 'stereo' : `${p.a.channels} ch`}` : 'no audio') +
      (L ? ` · ${L.I.toFixed(1)} LUFS, ${L.TP.toFixed(1)} dBTP` : ''),
    '',
    `Rendered ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC from \`${git('rev-parse', '--short', 'HEAD')}\` ` +
      `(${git('rev-parse', '--abbrev-ref', 'HEAD')}).`,
    '',
    '| File | What |',
    '|---|---|',
    ...files.map(([f, what]) => `| \`${rel(f)}\` (${statSync(f).isDirectory() ? 'folder' : mb(f)}) | ${what} |`),
    '',
    '## Storyboard',
    '',
    `120 BPM, 4/4: a beat is 0.5 s, a bar 2 s. ${TL.SCENES.length} scenes, ${TL.DURATION} s.`,
    '',
    '| Time | Bars | Scene | World | In | On screen | Music |',
    '|---|---|---|---|---|---|---|',
    ...TL.SCENES.map((s) =>
      `| ${tc(TL.bar(s.from))}–${tc(TL.bar(s.to))} | ${s.from}–${s.to} | \`${s.id}\` | ${s.world} | ${transition(s)} | ` +
      `${copyOf(s.id).join(' · ') || '—'} | ${music(s)} |`),
    '',
    '### Where picture and music meet',
    '',
    'Every cut and key motion lands on one of these (film seconds). Ticks are small glassy accents; the',
    'app’s own clicks and key taps come from the captured clips.',
    '',
    '| Time | Kind | What |',
    '|---|---|---|',
    ...[
      ...TL.CUES.filter((c) => !/^montage/.test(c.note ?? ''))
        .map((c) => [c.t, `| ${tc(c.t)} | ${c.kind}${c.to ? ` → ${tc(c.to)}` : ''}${c.peak ? ` (peak ${tc(c.peak)})` : ''} | ${c.note ?? ''} |`]),
      [TL.MONTAGE_CUTS[0], `| ${tc(TL.MONTAGE_CUTS[0])}–${tc(TL.MONTAGE_CUTS.at(-1))} | tick × ${TL.MONTAGE_CUTS.length} | the montage cuts |`],
    ].sort((a, b) => a[0] - b[0]).map(([, row]) => row),
    '',
    '## How it was made',
    '',
    `- **The product is real.** ${clips.length || 'The'} clips of the real app, driven by Playwright in virtual time ` +
      '(its clock, animations and input stepped one 60 fps frame at a time, then screenshotted at 2880×1800), so every ' +
      'frame is exact and nothing stutters. Printed sheets, the diagram layers and the exported `.docx` page are the ' +
      'app’s own output.',
    `- **The stage** is Three.js: each frame is a pure function of its time, rendered on the GPU` +
      `${report.gpu?.renderer ? ` (${report.gpu.renderer.replace(/^ANGLE \(|\)$/g, '')})` : ''} with ` +
      `${report.shutter ?? 5}+ motion-blur sub-frames, depth of field, selective bloom and a dither grain; type is ` +
      'live DOM (SF Pro, PingFang HK) over it.' +
      (report.frames ? ` ${report.frames} frames by ${report.workers} workers in ${Math.round(report.seconds)} s.` : ''),
    `- **The score is original**, composed and synthesised in code for this film (\`scripts/film/score/\`): ` +
      'no samples, no stock music. D major, 120 BPM, cut to the picture: the three-note motif is the logo ' +
      '(Supply, Demand, Equilibrium).' +
      (sfx ? ` ${sfx.events.length} sound-design events, ${sfx.events.filter((e) => ['click', 'key', 'toggle', 'drag-start', 'drag-end'].includes(e.kind)).length} of them the app’s own.` : '') +
      (score ? ` Verification ${score.pass ? 'passes' : 'FAILS'} (\`audio/report.txt\`).` : ''),
    `- **Encode**: H.264 High, yuv420p, BT.709, CRF ${report.preview ? 19 : 16}, 2 s GOP, +faststart; AAC 256 kbps.`,
    '',
    '## Credits',
    '',
    '- Original score and sound design: composed and synthesised for this film (`scripts/film/score/`).',
    '- Product footage, sheets and documents: the Econ Worksheet app itself.',
    '- No stock footage, stock music, samples or third-party logos.',
    '',
    '## Re-run',
    '',
    '```sh',
    'npm --prefix scripts/film ci   # the film’s own dependencies',
    'npm run film                   # capture (only if assets are missing) → events → score → render → this README',
    'npm run film -- --preview      # 960×540, 30 fps',
    '```',
    '',
    'The spec is `scripts/film/FILM.md`; the timeline, cues and copy are `scripts/film/timeline.mjs`.',
    '',
  ];
  const out = resolve(OUT, 'README.md');
  writeFileSync(out, lines.join('\n'));
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const video = resolve(process.argv[2] ?? resolve(OUT, 'econ-worksheet-film.mp4'));
  if (!existsSync(video)) throw new Error(`no video: ${video}`);
  console.log(`readme: ${readme(video)}`);
}
