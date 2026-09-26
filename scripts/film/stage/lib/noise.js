// Seeded hash and smooth noise. Every "random" value in the film comes from here, keyed
// by (id, t), so any frame renders the same regardless of order (FILM.md §5.2).

/** Integer hash → [0, 1). */
export function hash(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Hash of several integers → [0, 1). */
export const hashN = (...ns) => hash(ns.reduce((h, n) => Math.imul(h ^ (n | 0), 0x27d4eb2d) + 0x165667b1, 0x3243f6a8));

/** String → integer seed. */
export function seedOf(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

/** Deterministic PRNG stream (mulberry32) for setup-time layout. */
export function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (u) => u * u * u * (u * (u * 6 - 15) + 10);

/** Smooth 1D value noise in [-1, 1]. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hashN(seed, i) * 2 - 1;
  const b = hashN(seed, i + 1) * 2 - 1;
  return a + (b - a) * fade(f);
}

/** Smooth 2D value noise in [-1, 1]. */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = fade(x - ix), fy = fade(y - iy);
  const h = (dx, dy) => hashN(seed, ix + dx, iy + dy) * 2 - 1;
  const a = h(0, 0) + (h(1, 0) - h(0, 0)) * fx;
  const b = h(0, 1) + (h(1, 1) - h(0, 1)) * fx;
  return a + (b - a) * fy;
}

/** Fractal 1D noise, `oct` octaves, in about [-1, 1]. */
export function fbm1(x, seed = 0, oct = 3) {
  let v = 0, amp = 0.5, f = 1, norm = 0;
  for (let o = 0; o < oct; o++) {
    v += amp * noise1(x * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return v / norm;
}

/** A slow smooth wander in [-1, 1]^n for camera drift: `rate` in cycles per second. */
export const wander = (t, seed, rate = 0.08, n = 3) =>
  Array.from({ length: n }, (_, k) => fbm1(t * rate, seed + k * 977, 2));
