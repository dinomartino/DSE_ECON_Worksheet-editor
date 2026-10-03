// Film v2's 2D stage (FILM.md §7). window.film.seek(t) renders film time t as a pure
// function of t: the scenes whose windows hold t are set up lazily (and disposed when they
// leave), each updates its own DOM/SVG layer from its local time, the transition between two
// scenes is posed here, clips decode the exact frames asked for, fonts settle, and the frame
// is ready for the renderer's screenshot. Design space 1920×1080, scaled to the viewport.
import * as TL from '../timeline.mjs';
import { asset, assetUrl } from '../assets.mjs';
import * as lib from './lib/index.js';
import { ClipPlayer, loadClipMeta, placedEvents } from './lib/clip.js';
import { clamp, inOutSoft, spring } from './lib/ease.js';
import { f } from './lib/tween.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const W = num('w', TL.W);
const H = num('h', TL.H);
const FPS = num('fps', TL.FPS);
const DW = TL.W, DH = TL.H;

// ?lab=<id>&labdur=<s>: render one scene file (e.g. scenes/_lab.js, not in the timeline) alone
// from 0 s, for trying lib pieces (camera sizes, re-ink lifts) without touching the film.
const LAB = q.get('lab');
const LAB_INFO = LAB && { id: LAB, from: 0, to: num('labdur', 8), bars: [0, 0], in: { type: 'cut' } };
const SC = LAB
  ? { list: [LAB_INFO], at: (t) => (t >= 0 && t < LAB_INFO.to ? [LAB] : []), window: () => ({ start: 0, end: LAB_INFO.to, from: 0, to: LAB_INFO.to }) }
  : { list: TL.SCENES, at: TL.sceneAt, window: TL.sceneWindow };

const root = document.getElementById('film');
const fx = document.getElementById('fx');
document.getElementById('stage').style.cssText = `width:${W}px;height:${H}px`;
for (const el of [root, fx]) {
  el.style.width = `${DW}px`;
  el.style.height = `${DH}px`;
  el.style.transform = `scale(${W / DW})`;
}

const errors = [];
addEventListener('error', (e) => errors.push(String(e.error?.stack ?? e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.stack ?? e.reason)));

// ---- fonts: every face loaded before any scene measures text ---------------------------
const FONTS = [
  ['400 100px Newsreader', 'Econ Studio'],
  ['400 100px Inter', 'Aa'],
  ['500 100px Inter', 'Aa'],
  ['600 100px Inter', 'Aa'],
  ['300 100px "PingFang HK"', '經濟備課室中文'], // 中文 inside serif headlines (lib/type.js)
  ['400 100px "PingFang HK"', '經濟備課室'],
  ['500 100px "PingFang HK"', '經濟備課室'],
];
const fontsReady = (async () => {
  await Promise.all(FONTS.map(([font, text]) => document.fonts.load(font, text)));
  for (const [font] of FONTS.slice(0, 2)) if (!document.fonts.check(font)) errors.push(`font not loaded: ${font}`);
  await document.fonts.ready;
})();

// ---- scenes ---------------------------------------------------------------------------
const defs = new Map();
const sceneDef = (id) => {
  if (!defs.has(id)) defs.set(id, import(`./scenes/${id}.js`).then((m) => m.default));
  return defs.get(id);
};
const infoOf = (id) => SC.list.find((s) => s.id === id);

function assetFor(id, scene, kind) {
  const a = asset(id);
  if (!LAB && !a.scenes?.includes(scene)) throw new Error(`asset "${id}" is not registered for scene ${scene} (assets.mjs)`);
  if ((kind === 'clip') !== (a.kind === 'clip')) throw new Error(`asset "${id}" is a ${a.kind}, not a ${kind}`);
  return a;
}

async function createSlot(id, { dry = false } = {}) {
  await fontsReady;
  const info = infoOf(id);
  const def = await sceneDef(id);
  // The engine poses `wrap` (transitions: transform, clip, opacity); the scene owns `el`.
  const wrap = lib.h('div', { class: 'slot', 'data-slot': id }, root);
  const el = lib.h('div', { class: 'scene', 'data-scene': id }, wrap);
  const res = { clips: [], disposers: [] };
  const placements = [];
  const ctx = {
    id, el, dry, lib, tl: TL,
    W: DW, H: DH, fps: FPS,
    from: info.from, to: info.to, dur: info.to - info.from, window: SC.window(id),
    PULSE: TL.PULSE, BEAT: TL.BEAT, BAR: TL.BAR,
    /** Scene-local seconds of pulse / beat / bar n counted from the scene's start. */
    pulse: (n) => n * TL.PULSE,
    beat: (n) => n * TL.BEAT,
    bar: (n) => n * TL.BAR,
    copy: TL.COPY[id] ?? {},
    /** Scene-local seconds of cue `cueId`. */
    cue: (cueId) => TL.cueAt(cueId) - info.from,
    onDispose: (fn) => res.disposers.push(fn),
    load: {
      /** A clip player for asset `assetId` in box { x, y, w, h } of `parent` (default ctx.el). */
      clip: async (assetId, box = {}, parent = el) => {
        const a = assetFor(assetId, id, 'clip');
        const meta = await loadClipMeta(assetId, assetUrl(a));
        const c = new ClipPlayer(meta, `${assetUrl(a)}/`, parent, box);
        res.clips.push(c);
        return c;
      },
      url: (assetId) => assetUrl(assetFor(assetId, id, 'image')),
    },
    /** Declare a clip use: clip time `from` plays at scene time `at`, at `rate`, for `dur`. */
    placeClip(assetId, p = {}) {
      assetFor(assetId, id, 'clip');
      placements.push({ name: assetId, at: 0, from: 0, rate: 1, ...p });
    },
    placements,
    /** lib/camera.js declares its shot list here (the doctor's shot-size budget). */
    registerShots(name, list, problems = []) {
      shots.push(...list.map((s) => ({ ...s, rig: name })));
      shotProblems.push(...problems.map((p) => `${name}: ${p}`));
    },
  };
  const shots = [], shotProblems = [];
  ctx.shotList = shots;
  ctx.shotProblems = shotProblems;
  await def.setup?.(ctx);
  return { id, info, def, ctx, res, el, wrap };
}

function disposeSlot(slot) {
  try {
    slot.def.dispose?.(slot.ctx);
  } catch (e) {
    errors.push(`dispose ${slot.id}: ${e.stack ?? e}`);
  }
  for (const fn of slot.res.disposers) fn();
  for (const c of slot.res.clips) c.dispose();
  slot.wrap.remove();
}

const slots = new Map();
const slotFor = (id) => {
  if (!slots.has(id)) slots.set(id, createSlot(id));
  return slots.get(id);
};

// ---- transitions (FILM.md §5): cut, push, dot-iris ----------------------------------------
const irisDot = lib.s('circle', { r: 0, fill: lib.C.markBlue }, fx);
const irisRing = lib.s('circle', { r: 0, fill: 'none', stroke: lib.C.markBlue }, fx);

// A slot is hidden with opacity, never visibility: a descendant that lib show() set to
// visibility: visible would ignore a hidden ancestor and leak into the other act.
const hide = (wrap) => (wrap.style.opacity = '0');

function resetPose(wrap) {
  wrap.style.transform = 'none';
  wrap.style.clipPath = 'none';
  wrap.style.opacity = '1';
}

function pose(active, t) {
  irisDot.style.visibility = 'hidden';
  irisRing.style.visibility = 'hidden';
  active.forEach((s, i) => {
    resetPose(s.wrap);
    s.wrap.style.zIndex = String(i + 1);
  });
  if (active.length < 2) return;
  const [A, B] = active;
  const tr = B.info.in ?? { type: 'cut' };
  const d = 2 * TL.halfIn(B.info) || 1e-6;
  const p = clamp((t - (B.info.from - d / 2)) / d);
  if (tr.type === 'push') {
    const e = inOutSoft(p);
    const [ax, ay] = tr.dir === 'up' ? [0, -DH] : [-DW, 0];
    A.wrap.style.transform = `translate(${f(ax * e, 2)}px, ${f(ay * e, 2)}px)`;
    B.wrap.style.transform = `translate(${f(-ax * (1 - e), 2)}px, ${f(-ay * (1 - e), 2)}px)`;
  } else if (tr.type === 'iris') {
    // The dot grows on A (a spring), then opens into B as a circle that covers the frame.
    const [cx, cy] = tr.at ?? [DW / 2, DH / 2];
    const R = Math.hypot(Math.max(cx, DW - cx), Math.max(cy, DH - cy)) + 4;
    const r0 = 44;
    const grow = spring(clamp(p / 0.35));
    const open = inOutSoft(clamp((p - 0.3) / 0.7));
    const r = r0 + (R - r0) * open;
    if (open <= 0) {
      hide(B.wrap);
      irisDot.setAttribute('cx', cx);
      irisDot.setAttribute('cy', cy);
      irisDot.setAttribute('r', f(r0 * grow, 2));
      irisDot.style.visibility = 'visible';
    } else {
      // A path, not circle(): Chrome's compositor erased everything outside a circle() clip
      // whose box overhangs the slot on every side (transparent corners in the screenshot).
      const rr = f(r, 2);
      B.wrap.style.clipPath = `path('M ${f(cx - r, 2)} ${cy} a ${rr} ${rr} 0 1 0 ${f(2 * r, 2)} 0 a ${rr} ${rr} 0 1 0 ${f(-2 * r, 2)} 0 Z')`;
      irisRing.setAttribute('cx', cx);
      irisRing.setAttribute('cy', cy);
      irisRing.setAttribute('r', f(r, 2));
      irisRing.setAttribute('stroke-width', f(10 * (1 - open), 3));
      irisRing.style.visibility = open < 1 ? 'visible' : 'hidden';
    }
  } else hide(t >= B.info.from ? A.wrap : B.wrap);
}

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function doSeek(t) {
  const ids = SC.at(t);
  for (const [id, pending] of slots) {
    if (ids.includes(id)) continue;
    slots.delete(id);
    disposeSlot(await pending);
  }
  const active = [];
  for (const id of ids) active.push(await slotFor(id));
  for (const el of root.children) if (!active.some((s) => s.wrap === el)) hide(el);
  for (const s of active) s.def.update?.(s.ctx, t - s.info.from);
  for (const s of active) await Promise.all(s.res.clips.map((c) => c.flush()));
  pose(active, t);
  await document.fonts.ready;
  await raf2();
  if (errors.length) throw new Error(errors.join('\n'));
  return { t, scenes: ids };
}

let chain = Promise.resolve();
function seek(t) {
  const run = chain.then(() => doSeek(t));
  chain = run.catch(() => {});
  return run;
}

// ---- events and doctor probes -------------------------------------------------------
async function forEachDry(fn) {
  for (const info of SC.list) {
    const slot = await createSlot(info.id, { dry: true });
    try {
      await fn(info, slot);
    } finally {
      disposeSlot(slot);
    }
  }
}

/** Cues + scene events + placed clip events, film time, sorted (the SFX pass reads these). */
async function events() {
  const out = TL.CUES.map((c) => ({ ...c, source: 'cue' }));
  await forEachDry(async (info, slot) => {
    const win = SC.window(info.id);
    for (const e of slot.def.events ?? []) out.push({ ...e, t: info.from + e.t, source: 'scene', scene: info.id });
    for (const p of slot.ctx.placements) {
      let meta;
      try {
        meta = await loadClipMeta(p.name, assetUrl(asset(p.name)));
      } catch {
        out.push({ t: info.from + p.at, kind: 'missing-clip', clip: p.name, source: 'clip', scene: info.id });
        continue;
      }
      for (const e of placedEvents(meta, p, info.from)) if (e.t >= win.start && e.t < win.end) out.push({ ...e, source: 'clip', scene: info.id });
    }
  });
  return out.sort((a, b) => a.t - b.t);
}

/** Every clip placement: scene, clip id, and its window. */
async function placements() {
  const out = [];
  await forEachDry((info, slot) => {
    const win = SC.window(info.id);
    for (const p of slot.ctx.placements) {
      const dur = Math.min(p.dur ?? Infinity, win.end - (info.from + p.at));
      out.push({ scene: info.id, clip: p.name, at: p.at, from: p.from, rate: p.rate, dur });
    }
  });
  return out;
}

/** Every declared camera shot (lib/camera.js), film seconds, clipped to its scene's window. */
async function shots() {
  const out = [], problems = [];
  await forEachDry((info, slot) => {
    const win = SC.window(info.id);
    problems.push(...slot.ctx.shotProblems.map((p) => `${info.id}: ${p}`));
    for (const s of slot.ctx.shotList) {
      const from = Math.max(win.start, info.from + s.at), to = Math.min(win.end, info.from + s.end);
      if (to > from) out.push({ scene: info.id, rig: s.rig, from, to, size: s.size, to_size: s.to, moveAt: info.from + s.moveAt });
    }
  });
  return { shots: out, problems };
}

/** The text blocks on screen now, design px: fit data, reveal, line widths and bounds. */
function text() {
  const k = W / DW;
  const out = [];
  for (const el of root.querySelectorAll('.tx')) {
    if (!el.fit) continue;
    const spans = [...el.querySelectorAll('.ln .i')].filter((s) => s.textContent);
    const shown = el.checkVisibility({ opacityProperty: true, visibilityProperty: true });
    const r = spans.map((s) => s.getBoundingClientRect()).reduce((u, b) => ({
      l: Math.min(u.l, b.left), t: Math.min(u.t, b.top), r: Math.max(u.r, b.right), b: Math.max(u.b, b.bottom),
    }), { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity });
    out.push({
      ...el.fit,
      scene: el.closest('.scene')?.dataset.scene,
      revealed: shown && el.dataset.revealed === '1',
      widths: spans.map((s) => s.offsetWidth),
      lines: spans.map((s) => s.textContent),
      box: { l: r.l / k, t: r.t / k, r: r.r / k, b: r.b / k },
    });
  }
  return out;
}

const ready = (async () => {
  await fontsReady;
  await raf2();
})();

window.film = {
  ready: () => ready,
  fps: FPS,
  duration: TL.DURATION,
  frames: Math.round(TL.DURATION * FPS),
  size: { w: W, h: H },
  seek,
  events,
  placements,
  shots,
  text,
  errors: () => errors.slice(),
  scenesAt: (t) => SC.at(t),
  // No WebGL: the DOM stage needs no GPU (v1's chrome.mjs asks for this).
  gpu: () => ({ renderer: 'DOM/SVG (no WebGL)', vendor: 'n/a' }),
};
