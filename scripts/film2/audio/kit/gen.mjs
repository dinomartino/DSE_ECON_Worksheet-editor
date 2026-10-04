#!/usr/bin/env node
// Synthesises the film's SFX kit (FILM.md §6) from params.mjs into demo-media/film-v2/audio/kit/:
// one 48 kHz stereo float WAV per sound and variant, catalog.json (name → anchor, length, notes,
// loudness), and reel.mp3 + REEL.md (every sound in order, REEL_GAP apart). Deterministic: the
// same params give the same bytes. sfx.mjs runs it when the kit is missing or stale.
//   node scripts/film2/audio/kit/gen.mjs [--out=<dir>] [--no-reel]
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KIT, ROOM, PEAK_DBFS, REEL_GAP } from './params.mjs';
import { SR, hz, secs, db, noise, biquad, room, place, fade, trimTail, peak, maxMomentary } from './dsp.mjs';
import { writeWav } from '../wav.mjs';
import { KIT_DIR } from '../../paths.mjs';

const TAU = 2 * Math.PI;
const env = (t, attack, decay) => (t < attack ? 0.5 - 0.5 * Math.cos((Math.PI * t) / attack) : Math.exp(-(t - attack) / decay));
const tri = (ph) => (2 / Math.PI) * Math.asin(Math.sin(ph));
const mixInto = (dst, src, at = 0, g = 1) => { for (let i = 0; i < src.length && at + i < dst.length; i++) if (at + i >= 0) dst[at + i] += src[i] * g; };

/** Sine (+ optional triangle) of a gliding frequency f(t) under an envelope a(t). */
function tone(len, f, a, triangle = 0) {
  const x = new Float32Array(secs(len));
  let ph = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    ph += (TAU * f(t)) / SR;
    x[i] = a(t) * (Math.sin(ph) * (1 - triangle) + tri(ph) * triangle);
  }
  return x;
}

const R = {
  tick(p, v) {
    const x = new Float32Array(secs(0.12));
    const n = biquad(biquad(noise(secs(p.noise.ms / 1000), v.seed), 'hp', p.noise.band[0], p.noise.q), 'lp', p.noise.band[1], p.noise.q);
    for (let i = 0; i < n.length; i++) x[i] += n[i] * env(i / SR, p.noise.attack, p.noise.decay) * 4;
    mixInto(x, tone(0.12, () => hz(v.body), (t) => db(p.body.level) * env(t, p.noise.attack, p.body.decay)));
    mixInto(x, tone(0.06, () => p.thump.hz, (t) => db(p.thump.level) * env(t, p.noise.attack, p.thump.decay)));
    return [{ id: v.id, x, anchor: 0, notes: [v.body] }];
  },
  plip(p) {
    return p.notes.map((nt) => {
      const f0 = hz(nt), k = 2 ** (p.glide.semis / 12);
      const f = (t) => f0 * (t < p.glide.dur ? k ** (1 - t / p.glide.dur) : 1);
      const x = tone(p.length, f, (t) => env(t, p.attack, p.decay), p.triangle);
      mixInto(x, tone(p.length, (t) => 2 * f(t), (t) => db(p.octave) * env(t, p.attack, p.decay / 2.5)));
      return { id: nt.replace('#', 's'), x: biquad(x, 'lp', p.lowpass), anchor: 0, notes: [nt] };
    });
  },
  air(p, v) {
    const n = secs(v.length), pk = v.length * v.peakAt;
    const [f0, f1] = v.sweep, raw = noise(n, v.seed);
    let x = biquad(raw, 'bp', (i) => f0 * (f1 / f0) ** (i / n), p.q);
    const body = biquad(raw, 'lp', p.body.lowpass);
    for (let i = 0; i < n; i++) {
      const t = i / SR, a = t < pk ? (t / pk) ** 2.2 : ((v.length - t) / (v.length - pk)) ** 1.4;
      x[i] = (x[i] * 3 + body[i] * db(p.body.level)) * Math.max(0, a);
    }
    x = biquad(biquad(x, 'lp', p.lowpass), 'lp', p.lowpass); // 4th order: no hiss on top
    return [{ id: v.id, x, anchor: pk + p.anchor, notes: [] }];
  },
  glint(p) {
    return Object.entries(p.chords).map(([name, notes]) => {
      const x = new Float32Array(secs(p.length));
      notes.forEach((nt, j) => {
        const f0 = hz(nt), lo = 2 ** (-p.flat / 1200);
        const f = (t) => f0 * (t < p.glideDur ? lo ** (1 - t / p.glideDur) : 1);
        const len = p.length - j * p.step;
        mixInto(x, tone(len, f, (t) => db(p.levels[j]) * env(t, p.attack, p.decay)), secs(j * p.step));
        mixInto(x, tone(len, (t) => 2 * f(t), (t) => db(p.levels[j] + p.partial2) * env(t, p.attack, p.decay / 2)), secs(j * p.step));
      });
      const b = biquad(biquad(noise(secs(p.breath.dur), 21), 'hp', p.breath.band[0]), 'lp', p.breath.band[1]);
      for (let i = 0; i < b.length; i++) x[i] += b[i] * db(p.breath.level) * Math.sin((Math.PI * i) / b.length) * 6;
      return { id: name.replace('#', 's'), x: biquad(x, 'lp', p.lowpass), anchor: 0, notes };
    });
  },
  bloom(p) {
    const S = p.swell, T = p.thump, P = p.pad, at = secs(S.length);
    const x = new Float32Array(at + secs(P.length));
    // reverse swell: rises as (t / L)^curve, gone `gap` s before the hit
    const sw = new Float32Array(at);
    for (const nt of S.notes) mixInto(sw, tone(S.length, () => hz(nt), () => 1));
    const sn = biquad(noise(at, 31), 'lp', S.lowpass);
    const cut = S.length - S.gap, fl = 0.03; // raised-cosine release over fl s, silent from `cut`
    for (let i = 0; i < at; i++) {
      const t = i / SR, rel = t < cut - fl ? 1 : t < cut ? 0.5 + 0.5 * Math.cos((Math.PI * (t - cut + fl)) / fl) : 0;
      sw[i] = (sw[i] / S.notes.length + sn[i] * db(S.noise) * 3) * (t / S.length) ** S.curve * rel * db(S.level);
    }
    mixInto(x, biquad(sw, 'lp', S.lowpass));
    const f1 = hz(T.to), th = (t) => f1 * (T.from / f1) ** Math.max(0, 1 - t / T.glide);
    mixInto(x, tone(2.4, th, (t) => env(t, T.attack, T.decay)), at);
    mixInto(x, tone(2.4, (t) => 2 * th(t), (t) => db(T.octave) * env(t, T.attack, T.decay * 0.7)), at);
    const felt = biquad(noise(secs(T.felt.dur), 33), 'lp', T.felt.lowpass);
    mixInto(x, fade(felt, 0.002, T.felt.dur / 2), at, db(T.felt.level) * 4);
    const pad = new Float32Array(secs(P.length));
    P.notes.forEach((nt, j) => {
      for (const c of [-P.detune, P.detune]) {
        const f = hz(nt) * 2 ** (c / 1200);
        mixInto(pad, tone(P.length, () => f, (t) => db(P.levels[j]) * env(t, P.attack, P.decay) * (1 - P.trem.depth * (0.5 + 0.5 * Math.sin(TAU * P.trem.hz * t + j)))), 0, 0.5);
      }
    });
    mixInto(x, biquad(pad, 'lp', P.lowpass), at, db(P.level));
    return [{ id: 'lift', x, anchor: S.length, notes: [T.to, ...P.notes] }];
  },
  bell(p, v) {
    const x = new Float32Array(secs(p.length));
    for (const [nt, lv] of v.notes) {
      const f = hz(nt);
      let pc = 0, pm = 0, ps = 0;
      for (let i = 0; i < x.length; i++) {
        const t = i / SR, I = p.index[1] + (p.index[0] - p.index[1]) * Math.exp(-t / p.indexDecay);
        const a = t < p.attack ? t / p.attack : p.fastShare * Math.exp(-t / p.decay[0]) + (1 - p.fastShare) * Math.exp(-t / p.decay[1]);
        pm += (TAU * f) / SR; pc += (TAU * f) / SR; ps += (TAU * f * p.shimmer.ratio) / SR;
        x[i] += db(lv) * (a * Math.sin(pc + I * Math.sin(pm)) + db(p.shimmer.level) * Math.exp(-t / p.shimmer.decay) * Math.sin(ps));
      }
    }
    return [{ id: v.id, x: biquad(x, 'lp', p.lowpass), anchor: 0, notes: v.notes.map((n) => n[0]) }];
  },
  chapter(p) {
    return Object.entries(p.chords).map(([name, notes]) => {
      const x = new Float32Array(secs(p.length));
      notes.forEach((nt, j) => {
        for (let k = 1; k <= p.partials; k++) {
          const f = hz(nt) * k * Math.sqrt(1 + p.inharm * k * k);
          if (f > p.lowpass) break;
          mixInto(x, tone(p.length, () => f, (t) => (db(p.levels[j]) / k ** p.rolloff) * env(t, p.attack, p.decay / k ** 0.7)));
        }
      });
      const h = biquad(noise(secs(p.hammer.dur), 41), 'lp', p.hammer.lowpass);
      mixInto(x, fade(h, 0.001, p.hammer.dur / 2), 0, db(p.hammer.level) * 4);
      return { id: name.replace('#', 's'), x: biquad(x, 'lp', p.lowpass), anchor: 0, notes };
    });
  },
};

/** Every kit file: { name, sound, ch: [L, R], anchor, notes }. */
export function synthKit() {
  const ir = room(ROOM), out = [];
  for (const [sound, p] of Object.entries(KIT)) {
    const parts = (p.variants ?? [null]).flatMap((v) => R[sound](p, v));
    parts.forEach((part, j) => {
      fade(part.x, p.fade[0], p.fade[1]);
      const pan = p.pan ? p.pan[j % p.pan.length] : 0;
      let ch = trimTail(place(part.x, ir, p.wet, pan));
      const g = db(PEAK_DBFS) / peak(ch);
      ch = ch.map((c) => c.map((s) => s * g));
      out.push({ name: `${sound}-${part.id}`, sound, ch, anchor: part.anchor, notes: part.notes, wet: p.wet });
    });
  }
  return out;
}

export const kitHash = () => createHash('sha1').update(readFileSync(new URL('./params.mjs', import.meta.url))).update(readFileSync(new URL('./gen.mjs', import.meta.url))).update(readFileSync(new URL('./dsp.mjs', import.meta.url))).digest('hex').slice(0, 12);

export function writeKit(dir = KIT_DIR, { reel = true, use = {} } = {}) {
  mkdirSync(dir, { recursive: true });
  const files = synthKit(), catalog = [];
  for (const f of files) {
    writeWav(resolve(dir, `${f.name}.wav`), f.ch, SR);
    const m = maxMomentary(f.ch);
    catalog.push({ name: f.name, sound: f.sound, anchor_s: +f.anchor.toFixed(4), duration_s: +(f.ch[0].length / SR).toFixed(4), notes: f.notes, wet: f.wet, lufs: +m.lufs.toFixed(2), loudest_s: m.at });
  }
  writeWav(resolve(dir, 'room-ir.wav'), room(ROOM), SR); // for check.py (RT60)
  writeFileSync(resolve(dir, 'catalog.json'), `${JSON.stringify({ hash: kitHash(), files: catalog }, null, 1)}\n`);
  if (reel) writeReel(dir, files, use);
  return catalog;
}

function writeReel(dir, files, use) {
  const total = files.reduce((s, f) => s + f.ch[0].length / SR + REEL_GAP, REEL_GAP);
  const L = new Float32Array(secs(total)), Rr = new Float32Array(secs(total)), rows = [];
  let t = REEL_GAP;
  for (const f of files) {
    mixInto(L, f.ch[0], secs(t)); mixInto(Rr, f.ch[1], secs(t));
    rows.push(`| ${t.toFixed(2)} | \`${f.name}\` | ${f.notes.join(' ') || '–'} | ${use[f.sound] ?? ''} |`);
    t += f.ch[0].length / SR + REEL_GAP;
  }
  const wav = resolve(dir, 'reel.wav');
  writeWav(wav, [L, Rr], SR);
  const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '192k', resolve(dir, 'reel.mp3')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  writeFileSync(resolve(dir, 'REEL.md'), `# SFX kit reel\n\n\`reel.mp3\`: every kit sound in order, ${REEL_GAP} s apart (generated by scripts/film2/audio/kit/gen.mjs; kit ${kitHash()}).\n\n| t (s) | sound | notes | used for |\n|---|---|---|---|\n${rows.join('\n')}\n`);
}

export function ensureKit(dir = KIT_DIR, opts) {
  const cat = resolve(dir, 'catalog.json');
  if (existsSync(cat) && JSON.parse(readFileSync(cat, 'utf8')).hash === kitHash()) return JSON.parse(readFileSync(cat, 'utf8')).files;
  return writeKit(dir, { reel: false, ...opts });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv.find((a) => a.startsWith('--out='))?.slice(6);
  const { USED_FOR } = await import('../sfxmap.mjs');
  const cat = writeKit(out ? resolve(out) : KIT_DIR, { reel: !process.argv.includes('--no-reel'), use: USED_FOR });
  for (const c of cat) console.log(`${c.name.padEnd(14)} ${c.duration_s.toFixed(2)} s  anchor ${c.anchor_s.toFixed(3)}  ${c.lufs.toFixed(1)} LUFS(M)  ${c.notes.join(' ')}`);
}
