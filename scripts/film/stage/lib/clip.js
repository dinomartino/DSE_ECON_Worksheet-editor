// Image-sequence clips from the asset store (FILM.md §5.6):
//   clips/<name>.json  { name, fps, frames, width, height, duration, events }
//   clips/<name>/00000.jpg …
// frameAt(t) is synchronous: a frame not yet uploaded is recorded as a request and the
// nearest cached frame stands in. The engine calls flush() before rendering, so the
// final render of every frame only ever sees real, uploaded frames.
import * as THREE from 'three';

/** Fetches an image into an uploaded, mipmapped sRGB texture. */
export async function loadImageTexture(url, renderer, { mipmaps = true } = {}) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const bitmap = await createImageBitmap(await res.blob(), {
    imageOrientation: 'flipY',
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  const tex = new THREE.Texture(bitmap);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = mipmaps;
  tex.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  tex.needsUpdate = true;
  tex.userData.bitmap = bitmap;
  tex.userData.url = url;
  renderer.initTexture(tex);
  return tex;
}

export function disposeImageTexture(tex) {
  tex.dispose();
  tex.userData.bitmap?.close?.();
}

const pad = (i) => String(i).padStart(5, '0');

export class Clip {
  constructor(meta, base, renderer, { cache = 8, prefetch = 2 } = {}) {
    Object.assign(this, meta);
    this.fps = meta.fps ?? 60;
    this.frames = meta.frames ?? Math.round((meta.duration ?? 0) * this.fps);
    this.duration = meta.duration ?? this.frames / this.fps;
    this.events = meta.events ?? [];
    this.base = base;
    this.renderer = renderer;
    this.cacheSize = cache;
    this.prefetchCount = prefetch;
    this.cache = new Map(); // index → texture
    this.loading = new Map(); // index → Promise<texture>
    this.wanted = new Set(); // requested since the last flush
    this.blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.blank.colorSpace = THREE.SRGBColorSpace;
    this.blank.needsUpdate = true;
    this.lastUsed = new Map();
    this.tick = 0;
  }

  /** Frame index for clip time t (seconds), clamped to the clip. */
  index(t) {
    return Math.min(this.frames - 1, Math.max(0, Math.round(t * this.fps)));
  }

  url(i) {
    return `${this.base}clips/${this.name}/${pad(i)}.jpg`;
  }

  /** Texture of the frame at clip time t (see the file comment for the request rule). */
  frameAt(t) {
    const i = this.index(t);
    this.wanted.add(i);
    this.lastUsed.set(i, ++this.tick);
    const hit = this.cache.get(i);
    if (hit) return hit;
    let best = null, bestD = Infinity;
    for (const [j, tex] of this.cache) {
      const d = Math.abs(j - i);
      if (d < bestD) {
        best = tex;
        bestD = d;
      }
    }
    return best ?? this.blank;
  }

  load(i) {
    if (this.cache.has(i)) return Promise.resolve(this.cache.get(i));
    if (!this.loading.has(i)) {
      const p = loadImageTexture(this.url(i), this.renderer).then((tex) => {
        this.loading.delete(i);
        this.cache.set(i, tex);
        return tex;
      }, (e) => {
        this.loading.delete(i);
        throw new Error(`clip ${this.name}: frame ${i} of ${this.frames} failed (${e.message}) — asset store incomplete or a capture in progress?`);
      });
      this.loading.set(i, p);
    }
    return this.loading.get(i);
  }

  /** Loads every requested frame, starts prefetching the next ones, trims the cache. */
  async flush() {
    const wanted = [...this.wanted];
    this.wanted.clear();
    if (!wanted.length) return false;
    const missing = wanted.filter((i) => !this.cache.has(i));
    await Promise.all(missing.map((i) => this.load(i)));
    const last = Math.max(...wanted);
    for (let k = 1; k <= this.prefetchCount; k++) {
      const j = last + k;
      if (j < this.frames && !this.cache.has(j)) this.load(j).catch(() => {});
    }
    const keep = new Set(wanted);
    if (this.cache.size > this.cacheSize) {
      const old = [...this.cache.keys()]
        .filter((j) => !keep.has(j) && j <= last)
        .sort((a, b) => (this.lastUsed.get(a) ?? 0) - (this.lastUsed.get(b) ?? 0));
      while (this.cache.size > this.cacheSize && old.length) {
        const j = old.shift();
        disposeImageTexture(this.cache.get(j));
        this.cache.delete(j);
        this.lastUsed.delete(j);
      }
    }
    return missing.length > 0;
  }

  dispose() {
    for (const tex of this.cache.values()) disposeImageTexture(tex);
    this.cache.clear();
    this.blank.dispose();
  }
}

/** Loads a clip's metadata; frames load on demand. */
export async function loadClip(name, base, renderer, opts) {
  const res = await fetch(`${base}clips/${name}.json`);
  if (!res.ok) throw new Error(`clip ${name}: ${res.status}`);
  const meta = await res.json();
  return new Clip({ ...meta, name }, base, renderer, opts);
}

/**
 * Film-time events of one clip placement: clip time `from` plays at scene time `at`, at
 * `rate` clip seconds per film second, for `dur` film seconds (default: to the clip's end).
 */
export function placedEvents(clip, { at = 0, from = 0, rate = 1, dur = Infinity }, sceneStart) {
  const out = [];
  for (const e of clip.events ?? []) {
    if (e.t < from) continue;
    const local = (e.t - from) / rate;
    if (local > dur) continue;
    out.push({ ...e, t: sceneStart + at + local, clip: clip.name, clipT: e.t });
  }
  return out;
}
