// The stage engine (FILM.md §5.2–5.4). window.film.seek(t) renders film time t as a pure
// function of t: scenes are set up lazily when their window is active and disposed after,
// every scene renders into its own target (K motion-blur sub-frames averaged), then the
// transition compositor and the output pass write the canvas; DOM overlays follow.
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import * as TL from '../timeline.mjs';
import * as lib from './lib/index.js';
import { Post, makeTarget } from './post.js';
import { loadImageTexture, loadClip, placedEvents } from './lib/clip.js';
import { backdrop } from './lib/backdrop.js';
import * as rigs from './lib/rigs.js';
import { clamp, sineInOut, sineOut, quintInOut, smoothstep } from './lib/ease.js';

const q = new URLSearchParams(location.search);
const num = (k, d) => (q.has(k) ? Number(q.get(k)) : d);
const W = num('w', TL.W);
const H = num('h', TL.H);
const FPS = num('fps', TL.FPS);
const SHUTTER = Math.max(1, Math.round(num('shutter', 1)));
const ANGLE = num('angle', 180);
const GRAIN = num('grain', 1.5);
const ASSETS = q.get('assets') ?? '/assets/';
// Dev-only overrides for testing the compositor: ?transition=<scene>:<type>:<beats> and
// ?dof=<focus>,<aperture>,<maxBlur> (forces DOF on every scene).
const TR_OVERRIDE = q.get('transition')?.split(':');
const DOF_OVERRIDE = q.get('dof')?.split(',').map(Number);
const DW = 1920, DH = 1080; // overlay design space

const stage = document.getElementById('stage');
const canvas = document.getElementById('gl');
const typeRoot = document.getElementById('type');
stage.style.width = `${W}px`;
stage.style.height = `${H}px`;
typeRoot.style.transform = `scale(${W / DW})`;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: false,
  depth: false,
  stencil: false,
  preserveDrawingBuffer: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.autoClear = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
RectAreaLightUniformsLib.init();

const fx = new Post(renderer, W, H);
const sceneRT = new THREE.WebGLRenderTarget(W, H, {
  type: THREE.HalfFloatType,
  samples: 4,
  depthTexture: new THREE.DepthTexture(W, H),
});

const errors = [];
addEventListener('error', (e) => errors.push(String(e.error?.stack ?? e.message)));
addEventListener('unhandledrejection', (e) => errors.push(String(e.reason?.stack ?? e.reason)));

const assetUrl = (p) => (/^(\/|https?:|blob:|data:)/.test(p) ? p : ASSETS + p);

// ---- scenes ---------------------------------------------------------------------------

const defs = new Map();
async function sceneDef(id) {
  if (!defs.has(id)) defs.set(id, import(`./scenes/${id}.js`).then((m) => m.default));
  return defs.get(id);
}

const infoOf = (id) => {
  const info = TL.SCENES.find((s) => s.id === id);
  if (TR_OVERRIDE?.[0] !== id) return info;
  return { ...info, in: { type: TR_OVERRIDE[1], beats: Number(TR_OVERRIDE[2] ?? 1) } };
};
const sceneAt = (t) => {
  if (!TR_OVERRIDE) return TL.sceneAt(t);
  const ids = [];
  TL.SCENES.forEach((s, i) => {
    const half = (x) => (x && !['cut', 'fadeFromBlack', 'fadeToBlack'].includes(x.type) ? (x.beats * TL.BEAT) / 2 : 0);
    const start = TL.bar(s.from) - half(infoOf(s.id).in);
    const next = TL.SCENES[i + 1];
    const end = TL.bar(s.to) + (next ? half(infoOf(next.id).in) : 0);
    if (t >= Math.max(0, start) && t < Math.min(TL.DURATION, end)) ids.push(s.id);
  });
  return ids;
};

async function createSlot(id, { dry = false } = {}) {
  const info = infoOf(id);
  const def = await sceneDef(id);
  const start = TL.bar(info.from);
  const dur = TL.bar(info.to) - start;
  const world = def.world ?? info.world;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, W / H, 0.05, 400);
  const el = document.createElement('div');
  el.className = 'scene';
  el.dataset.scene = id;
  typeRoot.appendChild(el);
  const res = { textures: [], clips: [], disposers: [] };
  const placements = [];
  const post = {
    bloom: { strength: 0, radius: 0.6, threshold: 1, knee: 0.5 },
    samples: 0, // raise for fast moves: sub-frames = max(shutter, samples) in final renders
    dof: null,
    vignette: world === 'day' ? 0.06 : 0.22,
    exposure: 1,
  };
  const ctx = {
    id, THREE, scene, camera, el, dur, start, world, lib, post, renderer, fx, dry,
    beat: TL.BEAT, bar: TL.BAR, W: DW, H: DH, renderW: W, renderH: H, fps: FPS,
    timeline: TL,
    copy: TL.COPY[id] ?? {},
    time: start,
    prepasses: [],
    framePasses: [],
    /**
     * fn(renderer, scene, camera, fx) runs before rendering. With { once: true } it runs
     * once per frame at the centre time (reflections), else before every sub-frame.
     */
    onPrepass(fn, { once = false } = {}) { (once ? ctx.framePasses : ctx.prepasses).push(fn); },
    onDispose(fn) { res.disposers.push(fn); },
    load: {
      texture: async (path, opts) => {
        if (dry) return new THREE.Texture();
        const tex = await loadImageTexture(assetUrl(path), renderer, opts);
        res.textures.push(tex);
        return tex;
      },
      clip: async (name, opts) => {
        const c = await loadClip(name, ASSETS, renderer, opts);
        res.clips.push(c);
        return c;
      },
      json: async (path) => {
        const r = await fetch(assetUrl(path));
        if (!r.ok) throw new Error(`${r.status} ${path}`);
        return r.json();
      },
      exists: async (path) => (await fetch(assetUrl(path), { method: 'HEAD' })).ok,
    },
    /** Declare a clip use: clip time `from` plays at scene time `at`, at `rate`. */
    placeClip(name, p = {}) { placements.push({ name, at: 0, from: 0, rate: 1, ...p }); },
    placements,
  };
  ctx.backdrop = backdrop(world, W / H);
  scene.add(ctx.backdrop);
  ctx.rig = world === 'day' ? rigs.day(ctx) : rigs.night(ctx);
  res.disposers.push(() => ctx.rig.dispose());
  await def.setup?.(ctx);
  const slot = { id, info, def, ctx, res, start, dry };
  if (!dry) {
    slot.accum = SHUTTER > 1 ? makeTarget(W, H) : null;
    slot.out = makeTarget(W, H);
  }
  return slot;
}

function disposeMaterial(m) {
  for (const v of Object.values(m)) if (v?.isTexture) v.dispose();
  if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u?.value?.isTexture) u.value.dispose();
  m.dispose();
}

function disposeSlot(slot) {
  try {
    slot.def.dispose?.(slot.ctx);
  } catch (e) {
    errors.push(`dispose ${slot.id}: ${e.stack ?? e}`);
  }
  const done = new Set();
  slot.ctx.scene.traverse((o) => {
    if (o.userData.dispose && !done.has(o.userData.dispose)) {
      done.add(o.userData.dispose);
      o.userData.dispose();
    }
    o.geometry?.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) disposeMaterial(m);
  });
  for (const fn of slot.res.disposers) fn();
  for (const tex of slot.res.textures) {
    tex.dispose();
    tex.userData.bitmap?.close?.();
  }
  for (const c of slot.res.clips) c.dispose();
  slot.ctx.el.remove();
  slot.accum?.dispose();
  slot.out?.dispose();
}

const slots = new Map();
async function slotFor(id) {
  if (!slots.has(id)) slots.set(id, createSlot(id));
  return slots.get(id);
}

// ---- rendering ------------------------------------------------------------------------

/** Sub-frame times across the shutter, centred on t (a scene may ask for more). */
function subTimes(slot, t) {
  if (SHUTTER <= 1) return [t];
  update(slot, t);
  const k = Math.min(64, Math.max(SHUTTER, Math.round(slot.ctx.post.samples || 0)));
  const open = ANGLE / 360 / FPS;
  return Array.from({ length: k }, (_, i) => t + ((i + 0.5) / k - 0.5) * open);
}

function update(slot, t) {
  slot.ctx.time = t;
  slot.def.update?.(t - slot.start, slot.ctx);
}

function renderOnce(slot) {
  const { ctx } = slot;
  for (const fn of ctx.prepasses) fn(renderer, ctx.scene, ctx.camera, fx);
  renderer.setRenderTarget(sceneRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear(true, true, false);
  renderer.render(ctx.scene, ctx.camera);
}

function renderSlot(slot, t, times) {
  const { ctx } = slot;
  let src;
  if (ctx.framePasses.length) {
    update(slot, t);
    for (const fn of ctx.framePasses) fn(renderer, ctx.scene, ctx.camera, fx);
  }
  if (times.length === 1) {
    update(slot, times[0]);
    renderOnce(slot);
    src = sceneRT.texture;
  } else {
    fx.clear(slot.accum);
    for (const ts of times) {
      update(slot, ts);
      renderOnce(slot);
      fx.accumulate(sceneRT.texture, slot.accum, 1 / times.length);
    }
    update(slot, t); // DOM and post settings at exactly t
    src = slot.accum.texture;
  }
  const dof = DOF_OVERRIDE ? { focus: DOF_OVERRIDE[0], aperture: DOF_OVERRIDE[1], maxBlur: DOF_OVERRIDE[2] } : ctx.post.dof;
  if (dof) src = fx.dof(src, sceneRT.depthTexture, ctx.camera, dof, fx.tmpA);
  fx.finish(src, ctx.post, slot.out);
}

/** Fade from/to black at a scene's own edges (FILM.md §3 transitions). */
function edgeFade(info, t) {
  let f = 1;
  if (info.in?.type === 'fadeFromBlack') {
    f *= sineOut(clamp((t - TL.bar(info.from)) / (info.in.beats * TL.BEAT)));
  }
  if (info.out?.type === 'fadeToBlack') {
    const d = info.out.beats * TL.BEAT;
    f *= 1 - sineInOut(clamp((t - (TL.bar(info.to) - d)) / d));
  }
  return f;
}

const BLUR_PEAK = 8; // px at 1080p, blurDissolve midpoint: paper stays legible through it
const PUSH_BLUR = 16; // px at 1080p, pushThrough midpoint

/** Composites the active scenes and returns the DOM pose of each. */
function composite(active, t) {
  const k = H / DH;
  if (!active.length) {
    fx.transition(0, null, null, 0, 0, 0, fx.comp);
    return { poses: [], level: 0 };
  }
  const fades = active.map((s) => edgeFade(s.info, t));
  if (active.length === 1) {
    fx.transition(0, active[0].out.texture, null, 0, fades[0], 0, fx.comp);
    return { poses: [{ opacity: fades[0] }], level: fades[0] };
  }
  const [A, B] = active;
  const [fA, fB] = fades;
  const tr = B.info.in ?? { type: 'cut' };
  const b = TL.bar(B.info.from);
  const d = (tr.beats ?? 0) * TL.BEAT || 1e-6;
  const p = clamp((t - (b - d / 2)) / d);
  const a = A.out.texture, bt = B.out.texture;
  switch (tr.type) {
    case 'blurDissolve': {
      const e = sineInOut(p);
      const ta = fx.blur(a, BLUR_PEAK * k * smoothstep(0, 1, e * 1.25), fx.blurA, fx.tmpA);
      const tb = fx.blur(bt, BLUR_PEAK * k * smoothstep(0, 1, (1 - e) * 1.25), fx.blurB, fx.tmpB);
      fx.transition(1, ta, tb, e, fA, fB, fx.comp);
      return {
        poses: [
          { opacity: (1 - e) * fA, blur: BLUR_PEAK * e },
          { opacity: e * fB, blur: BLUR_PEAK * (1 - e) },
        ],
        level: 1,
      };
    }
    case 'dipToBlack':
      fx.transition(2, a, bt, p, fA, fB, fx.comp);
      return {
        poses: [{ opacity: p < 0.5 ? (1 - 2 * p) * fA : 0 }, { opacity: p >= 0.5 ? (2 * p - 1) * fB : 0 }],
        level: Math.abs(1 - 2 * p),
      };
    case 'pushThrough': {
      const e = quintInOut(p);
      const r = PUSH_BLUR * k * Math.sin(Math.PI * e);
      const ta = fx.blur(a, r, fx.blurA, fx.tmpA);
      const tb = fx.blur(bt, r, fx.blurB, fx.tmpB);
      fx.transition(3, ta, tb, e, fA, fB, fx.comp);
      const m = smoothstep(0.2, 0.8, e);
      return {
        poses: [
          { opacity: (1 - m) * fA, scale: 1 + 0.35 * e, blur: r / k },
          { opacity: m * fB, scale: 0.82 + 0.18 * e, blur: r / k },
        ],
        level: 1,
      };
    }
    case 'whip': {
      const e = quintInOut(p);
      fx.transition(4, a, bt, e, fA, fB, fx.comp);
      const blur = 30 * Math.sin(Math.PI * e);
      return { poses: [{ opacity: fA, x: -e * DW, blur }, { opacity: fB, x: (1 - e) * DW, blur }], level: 1 };
    }
    case 'dissolve':
    default: {
      const e = sineInOut(p);
      fx.transition(1, a, bt, e, fA, fB, fx.comp);
      return { poses: [{ opacity: (1 - e) * fA }, { opacity: e * fB }], level: 1 };
    }
  }
}

function applyDom(active, poses) {
  const activeEls = new Set(active.map((s) => s.ctx.el));
  for (const el of typeRoot.children) if (!activeEls.has(el)) el.style.visibility = 'hidden';
  active.forEach((s, i) => {
    const p = poses[i] ?? { opacity: 1 };
    const st = s.ctx.el.style;
    st.visibility = p.opacity > 0.001 ? 'visible' : 'hidden';
    st.opacity = String(clamp(p.opacity));
    st.filter = p.blur > 0.05 ? `blur(${p.blur.toFixed(2)}px)` : 'none';
    const tf = [];
    if (p.x) tf.push(`translateX(${p.x.toFixed(2)}px)`);
    if (p.scale && Math.abs(p.scale - 1) > 1e-4) tf.push(`scale(${p.scale.toFixed(5)})`);
    st.transform = tf.length ? tf.join(' ') : 'none';
  });
}

const raf2 = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

async function doSeek(t) {
  const ids = sceneAt(t);
  for (const [id, pending] of slots) {
    if (ids.includes(id)) continue;
    slots.delete(id);
    disposeSlot(await pending);
  }
  const active = [];
  for (const id of ids) active.push(await slotFor(id));
  const times = active.map((s) => subTimes(s, t));
  // Request pass: run every sub-frame once so clips record the frames they need.
  active.forEach((s, i) => times[i].forEach((ts) => update(s, ts)));
  for (const s of active) await Promise.all(s.res.clips.map((c) => c.flush()));
  active.forEach((s, i) => renderSlot(s, t, times[i]));
  const { poses, level } = composite(active, t);
  fx.output(fx.comp.texture, Math.round(t * FPS), (GRAIN / 255) * Math.min(1, level * 4));
  applyDom(active, poses);
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

// ---- events ---------------------------------------------------------------------------

async function events() {
  const out = TL.CUES.map((c) => ({ ...c, source: 'cue' }));
  for (const info of TL.SCENES) {
    const def = await sceneDef(info.id);
    const start = TL.bar(info.from);
    const win = TL.sceneWindow(info.id);
    for (const e of def.events ?? []) out.push({ ...e, t: start + e.t, source: 'scene', scene: info.id });
    const slot = await createSlot(info.id, { dry: true });
    for (const p of slot.ctx.placements) {
      let clip = slot.res.clips.find((c) => c.name === p.name);
      if (!clip) {
        try {
          clip = await loadClip(p.name, ASSETS, renderer);
          slot.res.clips.push(clip);
        } catch {
          out.push({ t: start + p.at, kind: 'missing-clip', clip: p.name, source: 'clip', scene: info.id });
          continue;
        }
      }
      for (const e of placedEvents(clip, p, start)) {
        if (e.t >= win.start && e.t < win.end) out.push({ ...e, source: 'clip', scene: info.id });
      }
    }
    disposeSlot(slot);
  }
  return out.sort((a, b) => a.t - b.t);
}

function gpu() {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
  };
}

const ready = (async () => {
  await document.fonts.ready;
  await raf2();
})();

window.film = {
  ready: () => ready,
  fps: FPS,
  duration: TL.DURATION,
  frames: Math.round(TL.DURATION * FPS),
  size: { w: W, h: H, shutter: SHUTTER },
  seek,
  events,
  gpu,
  errors: () => errors.slice(),
  scenesAt: (t) => sceneAt(t),
  memory: () => ({ ...renderer.info.memory, programs: renderer.info.programs?.length ?? 0 }),
};
