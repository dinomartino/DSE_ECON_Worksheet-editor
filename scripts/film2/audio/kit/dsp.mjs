// Small deterministic DSP for the synthesised SFX kit: notes, a seeded PRNG, RBJ biquads
// (optionally swept), FFT convolution, the shared room, fades, and BS.1770 loudness.
export const SR = 48000;

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F#5' → Hz (A4 = 440). */
export function hz(note) {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(note);
  if (!m) throw new Error(`bad note ${note}`);
  const midi = (Number(m[3]) + 1) * 12 + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}
/** Pitch class name ('F#') + octave → note, e.g. at('F#', 5) = 'F#5'. */
export const note = (pc, oct) => `${pc}${oct}`;
export const PCS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const pcIndex = (pc) => PCS.indexOf(pc);

/** mulberry32: seed → () => [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function noise(n, seed) {
  const r = rng(seed), x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = r() * 2 - 1;
  return x;
}
export const secs = (s) => Math.max(1, Math.round(s * SR));
export const db = (x) => 10 ** (x / 20);

function coefs(type, f, q) {
  const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, c = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') [b0, b1, b2] = [(1 - c) / 2, 1 - c, (1 - c) / 2];
  else if (type === 'hp') [b0, b1, b2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2];
  else if (type === 'bp') [b0, b1, b2] = [al, 0, -al];
  else throw new Error(type);
  const a0 = 1 + al;
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * c) / a0, (1 - al) / a0];
}
/** RBJ biquad; f is Hz or (i) => Hz (re-read every 16 samples, a sweep). Returns a new array. */
export function biquad(x, type, f, q = 0.707) {
  const y = new Float32Array(x.length);
  let k = coefs(type, typeof f === 'function' ? f(0) : f, q), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    if (typeof f === 'function' && (i & 15) === 0) k = coefs(type, f(i), q);
    const v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}

function fft(re, im, inv) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = ((inv ? 2 : -2) * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
/** Linear convolution (FFT), length x + h − 1. */
export function convolve(x, h) {
  const m = x.length + h.length - 1;
  let n = 1;
  while (n < m) n <<= 1;
  const ar = new Float64Array(n), ai = new Float64Array(n), br = new Float64Array(n), bi = new Float64Array(n);
  ar.set(x); br.set(h);
  fft(ar, ai, false); fft(br, bi, false);
  for (let i = 0; i < n; i++) { const r = ar[i] * br[i] - ai[i] * bi[i]; ai[i] = ar[i] * bi[i] + ai[i] * br[i]; ar[i] = r; }
  fft(ar, ai, true);
  return Float32Array.from(ar.subarray(0, m));
}

/**
 * The one shared room: decorrelated L/R noise tails, a low band (< split Hz) decaying over rt s
 * (RT60) and a high band over rtHigh s, after preDelay s, plus a few early reflections; each
 * channel's IR has unit energy, so `wet` in place() is a true wet/dry energy share.
 */
export function room({ rt, rtHigh, split, preDelay, length, early, seed }) {
  return [0, 1].map((c) => {
    const n = secs(length), lo = biquad(noise(n, seed + c), 'lp', split), hi = biquad(noise(n, seed + 10 + c), 'hp', split);
    const h = new Float32Array(n), pd = secs(preDelay), r = rng(seed + 20 + c);
    for (let i = pd; i < n; i++) {
      const t = (i - pd) / SR, on = Math.min(1, t / 0.01);
      h[i] = on * (lo[i] * 10 ** ((-3 * t) / rt) + hi[i] * 10 ** ((-3 * t) / rtHigh));
    }
    for (const [ms, g] of early) h[secs((ms * (1 + (r() - 0.5) * 0.2)) / 1000)] += g * (c ? -1 : 1);
    let e = 0;
    for (const v of h) e += v * v;
    const k = 1 / Math.sqrt(e);
    for (let i = 0; i < n; i++) h[i] *= k;
    return h;
  });
}

/** A mono dry sound through the room → stereo: dry share (1 − wet) energy, wet share `wet`. pan ∈ [−1, 1]. */
export function place(dry, ir, wet, pan = 0) {
  const th = ((pan + 1) * Math.PI) / 4, gl = Math.cos(th) * Math.SQRT2, gr = Math.sin(th) * Math.SQRT2;
  let e = 0;
  for (const v of dry) e += v * v;
  return ir.map((h, c) => {
    const w = convolve(dry, h);
    let ew = 0;
    for (const v of w) ew += v * v;
    const kd = Math.sqrt(1 - wet) * (c ? gr : gl), kw = Math.sqrt((wet * e) / Math.max(ew, 1e-20));
    for (let i = 0; i < w.length; i++) w[i] = w[i] * kw + (i < dry.length ? dry[i] * kd : 0);
    return w;
  });
}

/** Raised-cosine fade in/out (s), in place. */
export function fade(x, fin, fout) {
  const a = secs(fin), b = Math.min(x.length, secs(fout));
  for (let i = 0; i < a && i < x.length; i++) x[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b; i++) x[x.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
  return x;
}
/** Trim trailing near-silence (below floor dBFS) keeping a fade of fout s. Stereo in, stereo out. */
export function trimTail(ch, floor = -80, fout = 0.03) {
  const th = db(floor);
  let end = ch[0].length;
  while (end > 1 && Math.abs(ch[0][end - 1]) < th && Math.abs(ch[1][end - 1]) < th) end--;
  return ch.map((x) => fade(x.slice(0, Math.min(x.length, end + secs(fout))), 0, fout));
}
export function peak(ch) {
  let p = 0;
  for (const x of ch) for (const v of x) p = Math.max(p, Math.abs(v));
  return p;
}

// BS.1770 K-weighting at 48 kHz (stage 1 shelf, stage 2 RLB high-pass).
const K1 = [1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585];
const K2 = [1, -2, 1, -1.99004745483398, 0.99007225036621];
function iir(x, k) {
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = k[0] * x[i] + k[1] * x1 + k[2] * x2 - k[3] * y1 - k[4] * y2;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
  }
  return y;
}
export const kweight = (x) => iir(iir(x, K1), K2);
/** K-weighted mean square per 10 ms hop, summed over channels (BS.1770 channel weights 1). */
export function kPower(ch) {
  const k = ch.map(kweight), hop = SR / 100, n = Math.floor(k[0].length / hop), out = new Float64Array(n);
  for (let j = 0; j < n; j++) {
    let e = 0;
    for (const x of k) for (let i = j * hop; i < (j + 1) * hop; i++) e += x[i] * x[i];
    out[j] = e / hop;
  }
  return out;
}
/** Momentary loudness (LUFS, 400 ms) of a 10 ms power series, window centred at hop index j. */
export function momentary(pw, j) {
  let e = 0, n = 0;
  for (let i = Math.max(0, j - 20); i < Math.min(pw.length, j + 20); i++, n++) e += pw[i];
  return -0.691 + 10 * Math.log10(e / Math.max(1, n) + 1e-12);
}
/** The loudest momentary loudness of a sound and where (s). */
export function maxMomentary(ch) {
  const pw = kPower(ch);
  let best = -Infinity, at = 0;
  for (let j = 0; j < pw.length; j++) {
    const m = momentary(pw, j);
    if (m > best) { best = m; at = j / 100; }
  }
  return { lufs: best, at };
}
