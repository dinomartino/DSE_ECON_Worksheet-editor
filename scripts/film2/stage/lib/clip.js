// Footage: JPEG frame sequences from an asset store (the capture format of scripts/film:
// <path>.json { fps, frames, width, height, duration, events } + <path>/00000.jpg …) shown
// as <img> elements. at(t) only records the wanted frame (update stays pure); the engine
// awaits flush() before the screenshot, which decodes that frame and shows exactly it.
import { h } from './dom.js';

const pad = (i) => String(i).padStart(5, '0');

export class ClipPlayer {
  /** box: { x, y, w, h } design px inside `parent` (object-fit cover). */
  constructor(meta, dir, parent, { x = 0, y = 0, w = 1440, h: ht = 900, fit = 'cover', cache = 8, prefetch = 2 } = {}) {
    Object.assign(this, meta);
    this.fps = meta.fps ?? 60;
    this.frames = meta.frames ?? Math.round((meta.duration ?? 0) * this.fps);
    this.duration = meta.duration ?? this.frames / this.fps;
    this.events = meta.events ?? [];
    this.dir = dir;
    this.fit = fit;
    this.cacheSize = cache;
    this.prefetchCount = prefetch;
    this.cache = new Map(); // index → decoded <img> (in the DOM, hidden unless current)
    this.loading = new Map();
    this.used = new Map();
    this.tick = 0;
    this.want = 0;
    this.current = null;
    this.el = h('div', { class: 'clip', style: { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${ht}px`, overflow: 'hidden', background: '#fff' } }, parent);
  }

  index(t) {
    return Math.min(this.frames - 1, Math.max(0, Math.round(t * this.fps)));
  }

  url(i) {
    return `${this.dir}${pad(i)}.jpg`;
  }

  /** Shows the frame at clip time t (seconds) once flushed. */
  at(t) {
    this.want = this.index(t);
    this.used.set(this.want, ++this.tick);
  }

  load(i) {
    if (this.cache.has(i)) return Promise.resolve(this.cache.get(i));
    if (!this.loading.has(i)) {
      const img = new Image();
      img.decoding = 'sync';
      Object.assign(img.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: this.fit, display: 'none' });
      img.src = this.url(i);
      const p = img.decode().then(() => {
        this.loading.delete(i);
        this.el.appendChild(img);
        this.cache.set(i, img);
        return img;
      }, (e) => {
        this.loading.delete(i);
        throw new Error(`clip ${this.name}: frame ${i} of ${this.frames} failed (${e.message}): asset store incomplete?`);
      });
      this.loading.set(i, p);
    }
    return this.loading.get(i);
  }

  /** Decodes and shows the wanted frame, prefetches the next ones, trims the cache. */
  async flush() {
    const i = this.want;
    const img = await this.load(i);
    if (this.current !== img) {
      if (this.current) this.current.style.display = 'none';
      img.style.display = 'block';
      this.current = img;
    }
    for (let k = 1; k <= this.prefetchCount; k++) if (i + k < this.frames) this.load(i + k).catch(() => {});
    if (this.cache.size > this.cacheSize) {
      const old = [...this.cache.keys()].filter((j) => j !== i && this.used.has(j)).sort((a, b) => this.used.get(a) - this.used.get(b));
      while (this.cache.size > this.cacheSize && old.length) {
        const j = old.shift();
        this.cache.get(j).remove();
        this.cache.delete(j);
        this.used.delete(j);
      }
    }
  }

  dispose() {
    for (const img of this.cache.values()) img.remove();
    this.cache.clear();
    this.el.remove();
  }
}

/** Fetches clip metadata from `url` + '.json'; frames load from `url` + '/'. */
export async function loadClipMeta(name, url) {
  const res = await fetch(`${url}.json`);
  if (!res.ok) throw new Error(`clip ${name}: ${res.status} ${url}.json`);
  return { ...(await res.json()), name };
}

/**
 * Film-time events of one clip placement: clip time `from` plays at scene time `at`, at
 * `rate` clip seconds per film second, for `dur` film seconds (ported from scripts/film).
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
