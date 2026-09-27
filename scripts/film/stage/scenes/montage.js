// montage — bars 40–42, mixed (FILM.md §3). A beat-cut recap on MONTAGE_CUTS: eight real
// product moments, each one big centred card on its own world's backdrop (day or night,
// as in the scene it recalls), each a small push-in with alternating tilt. The last shot,
// the finished tax diagram on white in the night, holds from 83.0 and accelerates into the
// deadweight-loss triangle under the riser, ready for the hard cut to black on the 84.0 hit.
import { MONTAGE_CUTS, sceneStart, sceneEnd } from '../../timeline.mjs';
import { WORLDS } from '../lib/backdrop.js';
import { softShadow } from './everywhere/shadow.js';
import { docWindow, DOC } from './word/docWindow.js';

const START = sceneStart('montage'); // film seconds at the scene's t = 0
const CUTS = MONTAGE_CUTS.map((c) => c - START);
const END = sceneEnd('montage') - START;

// crop = [x, y, w, h] in source px. Clip shots play `from` at `rate` clip s per film s.
const SHOTS = [
  { id: 'typing', clip: 'type-mcq', from: 1.72, rate: 1, crop: [250, 560, 1100, 380], world: 'day' }, // ends above option B
  { id: 'start', still: 'start-screen', size: [2880, 1800], crop: [0, 0, 2880, 1800], world: 'day' },
  { id: 'zh', clip: 'language-toggle', from: 2.56, rate: 1, crop: [446, 458, 880, 532], world: 'day' },
  { id: 'curve', clip: 'draw-diagram', from: 2.93, rate: 1.24, crop: [324, 348, 1592, 1332], world: 'night' },
  { id: 'teacher', clip: 'teacher-toggle', from: 1.12, rate: 1, crop: [705, 606, 880, 456], world: 'day' },
  // The Paper 2 cover's title block, below its placeholder school name.
  { id: 'cover', still: 'p2-cover', size: [2379, 3366], crop: [263, 740, 1060, 597], world: 'day' },
  // The window rises from the bottom edge: title bar, heading and the diagram in the .docx.
  { id: 'docx', doc: true, world: 'night', aim: [0, 0.075] },
  // The finished diagram as it prints (no editor handles), on white: DWL, tax, E₀/E₁.
  { id: 'dwl', still: 'diagram-full', flatten: true, size: [2400, 2010], crop: [60, 300, 2100, 1350], world: 'night' },
];

const FOV = 30;
const DIST = 6; // camera distance at a shot's start
const VIEW_H = 2 * DIST * Math.tan((FOV * Math.PI) / 360);
const FIT = { w: 0.8 * VIEW_H * (16 / 9), h: 0.82 * VIEW_H }; // card box, world units
// The last shot pushes into the deadweight-loss triangle (card uv, v up).
const FOCUS = [0.456, 0.485];

/** A transparent still composited onto white (the window shader reads rgb only). */
function onWhite(THREE, tex, ctx) {
  if (!tex.image) return tex; // the engine's dry (events-only) pass loads no pixels
  const { width: w, height: h } = tex.image;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#FFFFFF';
  g.fillRect(0, 0, w, h);
  g.drawImage(tex.image, 0, 0);
  const out = new THREE.CanvasTexture(c);
  out.flipY = false; // ctx.load bitmaps arrive already flipped
  out.colorSpace = THREE.SRGBColorSpace;
  out.anisotropy = 8;
  ctx.onDispose(() => out.dispose());
  return out;
}

const scene = {
  id: 'montage',
  world: 'mixed',
  async setup(ctx) {
    const { lib, scene } = ctx;
    const s = (ctx.state = { cards: [] });
    const clips = {};
    for (const [i, sh] of SHOTS.entries()) {
      const dur = (CUTS[i + 1] ?? END) - CUTS[i];
      let card;
      if (sh.doc) {
        const map = await ctx.load.texture(DOC.texture);
        const doc = docWindow(lib, map, { width: FIT.w * 0.95 });
        const { sheet, L } = doc;
        sheet.set({ lit: 1, base: 1, clip: [L.bottom - L.slot[1], 0.004, 1] });
        card = { group: doc.group, width: L.width, height: L.h, set: () => {} };
      } else {
        const [cw, ch] = [sh.crop[2], sh.crop[3]];
        const aspect = cw / ch;
        const width = Math.min(FIT.w, FIT.h * aspect);
        const win = lib.win.appWindow({ variant: 'none', width, aspect, shadow: false });
        const size = sh.clip ? [2880, 1800] : sh.size;
        win.set({ crop: [sh.crop[0] / size[0], 1 - (sh.crop[1] + ch) / size[1], cw / size[0], ch / size[1]] });
        if (sh.still) {
          const tex = await ctx.load.texture(sh.still);
          win.set({ screen: sh.flatten ? onWhite(ctx.THREE, tex, ctx) : tex });
        }
        if (sh.clip) {
          clips[sh.clip] ??= await ctx.load.clip(sh.clip);
          ctx.placeClip(sh.clip, { at: CUTS[i], from: sh.from, rate: sh.rate, dur });
        }
        card = { group: win.group, width, height: win.height, set: win.set };
      }
      if (sh.world === 'day') {
        const amb = softShadow({ w: card.width * 0.98, h: card.height * 0.97, r: 0.08, s: 0.2, opacity: 0.16 });
        const key = softShadow({ w: card.width * 0.96, h: card.height * 0.96, r: 0.04, s: 0.05, opacity: 0.12 });
        amb.position.set(0, -0.1, -0.05);
        key.position.set(0, -0.04, -0.03);
        card.group.add(amb, key);
      }
      card.group.visible = false;
      scene.add(card.group);
      s.cards.push({ ...card, shot: sh, clip: sh.clip ? clips[sh.clip] : null });
    }
    s.dust = lib.particles.dust({
      count: 90, seed: 40, H: ctx.renderH,
      box: [[-7, -4, -12], [7, 4, 1.5]], size: 0.012, aperture: 0.2, bright: 0.5, drift: 0.2, rise: 0.012, minPx: 5,
    });
    scene.add(s.dust.mesh);
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;

    // The shot is chosen from the frame's own time, so motion-blur sub-frames never mix
    // two shots across a cut.
    const tq = Math.round(t * ctx.fps) / ctx.fps;
    let i = 0;
    while (i + 1 < CUTS.length && tq >= CUTS[i + 1] - 1e-6) i++;
    const card = s.cards[i];
    const sh = card.shot;
    const t0 = CUTS[i];
    const dur = (CUTS[i + 1] ?? END) - t0;
    const tau = t - t0;
    const u = E.clamp(tau / dur, -0.1, 1.1);
    const last = i === CUTS.length - 1;
    s.cards.forEach((c, j) => (c.group.visible = j === i));
    if (card.clip) card.set({ screen: card.clip.frameAt(sh.from + sh.rate * Math.max(0, tau)) });

    // Alternating tilt that relaxes a little through the shot; a push-in that lands soft.
    const side = i % 2 ? 1 : -1;
    const relax = E.sineOut(E.clamp(u));
    const g = card.group;
    g.position.set(0, 0, 0);
    g.rotation.set(0.012 * side, side * (0.105 - 0.035 * relax), 0.006 * side);

    let dist, target = [0, 0, 0], shift = [0, 0];
    if (!last) {
      const push = 0.5 * u + 0.5 * E.cubicOut(E.clamp(u));
      const aim = sh.aim ?? [0, 0];
      dist = DIST * (sh.zoom ?? 1) * (1 - 0.06 * push);
      target = [aim[0] * card.width + side * 0.06 * (1 - relax), aim[1] * card.height, 0];
    } else {
      // Under the riser: a slow start that accelerates into the triangle (log-space dolly).
      const k = E.cubicIn(E.clamp(u));
      dist = DIST * Math.pow(0.58, k) * (1 - 0.03 * u);
      const lx = (FOCUS[0] - 0.5) * card.width;
      const ly = (FOCUS[1] - 0.5) * card.height;
      const aim = E.sineInOut(E.clamp(u));
      target = [lx * aim, ly * aim, 0];
      g.rotation.y = side * 0.09 * (1 - 0.6 * aim);
    }
    const d = cam.drift(START + t, 40, { amp: 0.25, rate: 0.1, roll: 0.05, dolly: 0.002 });
    cam.orbit(camera, { target, dist: dist * d.dist, az: d.az, el: d.el, roll: d.roll, fov: FOV, shift });

    // The world behind each card.
    const W = WORLDS[sh.world];
    ctx.backdrop.userData.set({ top: W.top, bottom: W.bottom, glow: W.glow, glowAmount: W.glowAmount, radius: W.radius, center: W.center });
    const night = sh.world === 'night';
    s.dust.mesh.visible = night;
    s.dust.set({ time: START + t, focus: dist, bright: 0.4, fov: FOV, H: ctx.renderH });
    post.vignette = night ? 0.22 : 0.06;
    post.bloom = null;
    post.samples = last ? Math.round(6 + 18 * E.cubicIn(E.clamp(u))) : 8;
  },
};

export default scene;
