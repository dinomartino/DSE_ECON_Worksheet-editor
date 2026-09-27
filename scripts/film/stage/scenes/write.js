// write — bars 8–16, day (FILM.md §3). The drop cuts in on the page of the real app (16.0),
// already flying out of it, and lands by the bar-9 downbeat in a close three-quarter view —
// window bleeding off right, "Type right on the page." in the cream on the left — then arcs
// toward front while the question and its options are typed. The 24.0 whoosh pushes into
// the question; the capture hands over to a layered page built from the real sheets. The
// bilingual question holds, framed whole, while its English lifts off the paper; then one
// pull out wide. The real toolbar toggle clicks on the beats 26.0 / 27.0 / 28.0 and the
// page answers at once, as the app does: English floats over a ghost of the Chinese, then
// the Chinese rises, then both land back on the paper. Settled from 28.5 to the cut.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { FONT_ZH } from '../lib/type.js';
import { layeredPage } from './write/page.js';
import { framePatch } from './write/patch.js';

const C = COPY.write;
const WW = 3.2; // window width (world units) for the 1440×900 css px capture
const WIN_SHADOW = 0.5;
// The page inside the capture: sheet px → clip frame px (130% zoom, DPR 2 vs sheet DPR 3).
const PAGE_IN_CLIP = { x: 84, y: 205, k: (2 * 1.3) / 3 };
// The toolbar's EN / 中文 / EN+中 toggle in the language-toggle capture (frame px): the whole
// toolbar strip (it ends at 107), so the resting pointer (tail at 100) is never sliced.
const TOGGLE = { x0: 512, x1: 800, y0: 6, y1: 106 };
const TOGGLE_RATE = 1.5; // its clicks (clip 1.0, 2.5, 4.0) one second apart
// Clip time held inside [from, to]: the pointer is already in the chip when it fades in
// (it enters from below until 0.75) and never leaves it (it exits from 4.6).
const TOGGLE_HOLD = [0.8, 4.4];
// type-mcq's options paste ~50 ms after the half-beat; start the clip early so they land on it.
const CLIP_LEAD = 0.05;
// The formatting toolbar (css px rect, shadow included) snaps in over ~4 clip frames on focus
// (44) and vanishes in one on Enter (272). A patch of the frame before each change eases it
// over [frame, frames]. Between Enter at 199 and focus at 217 (back to identical by 225) the
// patch holds frame 198's toolbar, so it never blinks.
const TOOLBAR = { x0: 16, x1: 1092, y0: 56, y1: 140, pops: [[44, 12], [272, 10]], bridge: [199, 226] };

const out = cubicBezier(0.1, 0.72, 0.2, 1); // the drop: already fast at the cut, long settle
const rush = cubicBezier(0.6, 0, 0.2, 1); // the push: from rest, fastest on the 24.0 whoosh

// Scene seconds (film − 16).
const T = {
  head: 2.0, sub: 3.0, exit: 7.3,
  push: [7.3, 8.35], swap: [8.15, 8.35], hold: [8.55, 9.3], pull: [9.2, 9.95], orbit: [9.5, 15.85],
  chip: [9.45, 9.85],
  en: 9.96, zh: 10.96, both: 11.96, langsSub: 12.7,
};
const CLICKS = [10.0, 11.0, 12.0]; // EN, 中文, EN+中: each on a beat, the page answers at once
// The layers. While the camera holds on the question its English lifts off the paper and
// the Chinese falls out of focus. On each click the old layout lifts a little and fades
// fast while the new one comes up into focus (never two sharp layouts at once).
const SPLIT = [8.55, 9.3]; // = T.hold
const SPLIT_UP = 0.05, UP = 0.22, ZUP = 0.26, LOW = 0.05, MERGE = 0.1, RISE = 0.05, GHOST = 0.1, GBLUR = 8;
const OUT = 0.15, IN = [0.08, 0.42];

const bob = (t) => 0.012 * Math.sin(t * 0.9);

/** The four page layers at t (see write/page.js): each { z, alpha, blur }. */
function layers(t, E) {
  const lerp = (a, b, u) => a + (b - a) * u;
  const go = (w) => E.quintIn(E.seg(t, w, w + OUT)); // the outgoing layout fades late …
  const soft = (w) => 6 * E.sineOut(E.seg(t, w, w + OUT)); // … but softens at once
  const come = (w) => E.seg(t, w + IN[0], w + IN[1]); // the incoming one, linear 0→1
  const alphaIn = (u) => E.quintOut(u); // visible at once …
  const focus = (u) => 1 - E.sineInOut(u); // … and sharp only as the old one has gone
  const [c1, c2, c3] = CLICKS;
  const sp = E.sineInOut(E.seg(t, SPLIT[0], SPLIT[1]));
  const o1 = go(c1), o2 = go(c2), o3 = go(c3);
  const i1 = come(c1), i2 = come(c2), i3 = come(c3);
  const L = (z, alpha, blur) => ({ z, alpha, blur });
  let biEn, biZh, en;
  if (t < c3) {
    biEn = L(SPLIT_UP * sp + RISE * o1, 1 - o1, soft(c1));
    biZh = L(RISE * o1, (1 - 0.5 * sp) * (1 - o1), 3.5 * sp + soft(c1));
  } else {
    // Both: the bilingual page settles back onto the paper, into focus.
    biEn = biZh = L(MERGE * (1 - E.quintOut(i3)), alphaIn(i3), GBLUR * focus(i3));
  }
  if (t < c2 + OUT) en = L(UP * E.quintOut(i1) + RISE * o2, alphaIn(i1) * (1 - o2), GBLUR * focus(i1) + soft(c2));
  else en = L(LOW, GHOST * E.sineInOut(E.seg(t, c2 + OUT, c2 + 0.5)) * (1 - E.sineInOut(E.seg(t, c3, c3 + 0.2))), GBLUR);
  const ghost = GHOST * E.sineInOut(E.seg(t, c1 + 0.1, c1 + 0.5));
  const zh = L(ZUP * E.quintOut(i2) + RISE * o3, lerp(ghost, 1, alphaIn(i2)) * (1 - o3), GBLUR * focus(i2) + soft(c3));
  return { biEn, biZh, en, zh };
}

/** Camera pose: target x/y (window-group space, z = 0), distance, azimuth, elevation, roll. */
const pose = (x, y, d, az, el, roll = 0) => ({ x, y, d, az, el, roll });
/** Blend of two poses; distance in log space so the image scale changes evenly. */
function mix(A, B, u) {
  if (u <= 0) return A;
  if (u >= 1) return B;
  const l = (a, b) => a + (b - a) * u;
  return pose(l(A.x, B.x), l(A.y, B.y), A.d * (B.d / A.d) ** u, l(A.az, B.az), l(A.el, B.el), l(A.roll, B.roll));
}

const scene = {
  id: 'write',
  world: 'day',
  async setup(ctx) {
    const { lib, scene, THREE } = ctx;
    const s = (ctx.state = {});
    s.clip = await ctx.load.clip('type-mcq', { cache: 10, prefetch: 3 });
    ctx.placeClip('type-mcq', { at: -CLIP_LEAD, from: 0, rate: 1, dur: T.push[1] + CLIP_LEAD });
    s.win = lib.win.appWindow({ variant: 'mac', width: WW, shadow: false });
    scene.add(s.win.group);
    // A soft warm shadow on an imagined wall behind: it breathes out past the window's left
    // and lower edges as the camera looks from the left, so the window reads as floating.
    s.shadow = lib.floor.contactShadow({ w: WW * 0.96, h: s.win.height * 0.92, radius: 0.12, blur: 0.35, color: '#3A342E', opacity: WIN_SHADOW });
    s.shadow.position.set(-0.1, -0.2, -0.35);
    s.win.group.add(s.shadow);
    s.css = (cx, cy) => [(cx / 1440 - 0.5) * WW, s.win.contentCenter.y + (0.5 - cy / 900) * s.win.screenHeight];
    const R = TOOLBAR;
    s.patch = framePatch({
      w: ((R.x1 - R.x0) / 1440) * WW,
      h: ((R.y1 - R.y0) / 900) * s.win.screenHeight,
      uv: [R.x0 / 1440, 1 - R.y1 / 900, R.x1 / 1440, 1 - R.y0 / 900],
    });
    s.patch.mesh.position.set(...s.css((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2), 0.001);
    s.win.group.add(s.patch.mesh);
    s.dust = lib.particles.dust({
      count: 60, seed: 8, H: ctx.renderH, box: [[-7, -3, -9], [7, 4, 3.2]],
      size: 0.02, aperture: 0.26, bright: 0.4, drift: 0.2, rise: 0.02, minPx: 6, color: '#FFF3E0', color2: '#FFFFFF',
    });
    scene.add(s.dust.mesh);
    s.glow = [new THREE.Color('#F8F5EF'), new THREE.Color('#FFFFFF'), new THREE.Color()];
    s.v = new THREE.Vector3();

    // Camera poses for bars 8–12 (window-group space).
    const [sx, sy] = s.css(430, 395);
    s.stem = [sx, sy];
    s.P0 = pose(sx, sy, 1.3, -50, 16, -3); // just before the cut, close on the stem
    s.C1 = pose(-1.26, 0.14, 3.8, -17, 5); // landed on bar 9: window right, type left
    s.C1b = pose(-1.33, 0.19, 3.45, -8, 3); // the slow arc toward front as the options land

    // The toggle: a crop of the real toolbar, clicked at 1.5× so its clicks land on beats.
    s.toggleClip = await ctx.load.clip('language-toggle', { cache: 4, prefetch: 2 });
    s.toggleAt = CLICKS[0] - 1.0 / TOGGLE_RATE;
    const [h0, h1] = TOGGLE_HOLD;
    ctx.placeClip('language-toggle', { at: s.toggleAt + h0 / TOGGLE_RATE, from: h0, rate: TOGGLE_RATE, dur: (h1 - h0) / TOGGLE_RATE });
    const tw = TOGGLE.x1 - TOGGLE.x0, th = TOGGLE.y1 - TOGGLE.y0;
    s.chip = lib.win.appWindow({ variant: 'none', width: 0.62, aspect: tw / th, shadowOpacity: 0.16, shadowBlur: 0.09 });
    s.chip.set({ crop: [TOGGLE.x0 / 2880, 1 - TOGGLE.y1 / 1800, tw / 2880, th / 1800] });
    s.chip.material.uniforms.uRadius.value = 0.3 * s.chip.height;
    s.chip.material.uniforms.uBorder.value.set('#8A8178');
    s.chip.mesh.renderOrder = 20; // over the page's ink strips, which skip the depth test

    if (!ctx.dry) {
      const k = PAGE_IN_CLIP.k;
      s.page = await layeredPage(ctx, { width: ((2379 * k) / 2880) * WW });
      // The page sits exactly on the capture's page (same window, a hair in front).
      const c = s.css((PAGE_IN_CLIP.x + (2379 * k) / 2) / 2, (PAGE_IN_CLIP.y + (3366 * k) / 2) / 2);
      s.pagePos = [c[0], c[1], 0.004];
      s.page.group.position.set(...s.pagePos);
      s.win.group.add(s.page.group);
      s.pageAt = (x, y) => {
        const l = s.page.local(x, y);
        return [s.pagePos[0] + l[0], s.pagePos[1] + l[1]];
      };
      s.page.group.add(s.chip.group);
      s.chipHome = s.page.local(1010, 150);
      // Bars 12–16: into the question, hold, out wide to the layers, arc toward front and
      // settle. The hold frames "Section A" and all of question 1 (sheet px 443–1128, x
      // 303–1498) with nothing of question 2 (from 1185): below question 1 the capture and
      // the sheets differ, so the swap never shows it.
      const q = s.pageAt(900, 771);
      s.Q = pose(q[0], q[1], 1.4, -1, 1.5);
      // As the English lifts toward the lens the camera eases back by as much: the English
      // holds its size and place while the paper and the Chinese fall away behind it.
      s.Qb = pose(q[0], q[1], 1.4 + SPLIT_UP, -5, 1.8);
      const pc = s.pageAt(1189, 1000);
      s.C2 = pose(pc[0] - 0.5, pc[1] + 0.18, 3.2, -30, 3);
      s.C3 = pose(pc[0] - 0.5, pc[1] + 0.26, 3.45, -13, 2);
    }

    const T_ = lib.type;
    s.head = T_.headline(ctx.el, { en: 'Type right\non the page.', zh: C.headlineZh, x: 128, y: 468, align: 'left', size: 104, world: 'day', zhSize: 44, zhGap: 20 });
    s.sub = T_.sub(ctx.el, { en: 'The preview is the editor.\nWhat you see is what prints.', x: 128, y: 736, align: 'left', size: 34, world: 'day' });
    const L = { x: 128, align: 'left', size: 108, world: 'day' };
    s.langs = [
      T_.headline(ctx.el, { ...L, en: C.langs[0], y: 388 }),
      T_.headline(ctx.el, { ...L, en: C.langs[1], y: 524, font: FONT_ZH, tracking: 0.02 }),
      T_.headline(ctx.el, { ...L, en: C.langs[2], y: 660 }),
    ];
    s.langsSub = T_.sub(ctx.el, { en: 'One language, the other,\nor side by side.', x: 128, y: 790, align: 'left', size: 34, world: 'day' });
  },

  update(t, ctx) {
    const { lib, camera, post } = ctx;
    const { ease: E, camera: cam } = lib;
    const s = ctx.state;
    const sm = (a0, a1) => E.sineInOut(E.seg(t, a0, a1));

    // ---- the window and its clip ------------------------------------------------------
    const ct = Math.min(t + CLIP_LEAD, 7.999);
    s.win.set({ screen: s.clip.frameAt(ct) });
    let po = 0, pf = 0;
    for (const [F, n] of TOOLBAR.pops) {
      const k = ct * 60 - (F - 0.5); // the screen shows frame F from k = 0
      if (k >= -1 && k < n) [po, pf] = [k < 0 ? 1 : 1 - E.sineInOut(k / n), F - 1];
    }
    const [b0, b1] = TOOLBAR.bridge;
    if (ct * 60 >= b0 - 1.5 && ct * 60 < b1 - 0.5) [po, pf] = [1, b0 - 1];
    s.patch.set({ map: po > 0 ? s.clip.frameAt(pf / 60) : null, opacity: po });
    const b = bob(t);
    s.win.group.position.set(0, b, 0);

    // ---- camera -----------------------------------------------------------------------
    // The first frame is exactly P0 (the page, close): the flight out starts on the cut.
    let P = mix(s.P0, s.C1, out(E.seg(t, 0, 2.3)));
    P = mix(P, s.C1b, E.sineInOut(E.seg(t, 1.9, 7.9)));
    if (s.page) {
      P = mix(P, s.Q, rush(E.seg(t, T.push[0], T.push[1])));
      P = mix(P, s.Qb, sm(T.hold[0], T.hold[1]));
      P = mix(P, s.C2, E.quintInOut(E.seg(t, T.pull[0], T.pull[1])));
      P = mix(P, s.C3, sm(T.orbit[0], T.orbit[1]));
    }
    const d = cam.drift(t, 5, { amp: 0.6, rate: 0.07 });
    const creep = 1 - 0.03 * E.sineIn(E.seg(t, 12.4, 16.2)); // settled, never still: a slow push to the cut
    cam.orbit(camera, { target: [P.x, P.y, 0], dist: P.d * d.dist * creep, az: P.az + d.az, el: P.el + d.el, roll: P.roll + d.roll, fov: 30 });

    // ---- the handoff (capture → layered page), the language layers, the toggle ---------
    if (s.page) {
      const pa = sm(T.swap[0], T.swap[1]);
      const wa = 1 - sm(T.swap[1], T.swap[1] + 0.12);
      s.win.set({ opacity: wa });
      s.win.mesh.visible = wa > 0.001;
      s.shadow.visible = wa > 0.001;
      s.shadow.material.opacity = WIN_SHADOW * wa;

      s.page.set({ alpha: pa, ...layers(t, E), light: [0.1, -0.16], shadow: 0.2 });

      // The toggle floats in over the page's top margin just before its first click.
      const ca = E.quintOut(E.seg(t, T.chip[0], T.chip[1] + 0.35));
      const tc = E.clamp((t - s.toggleAt) * TOGGLE_RATE, ...TOGGLE_HOLD);
      s.chip.set({ screen: s.toggleClip.frameAt(tc), opacity: ca, shadowOpacity: 0.16 * ca });
      s.chip.group.visible = ca > 0.001;
      s.chip.group.position.set(s.chipHome[0], s.chipHome[1] - 0.05 * (1 - ca), 0.1 + 0.12 * ca);
    }

    // ---- light: a burst on the drop -----------------------------------------------------
    const burst = Math.exp(-Math.max(0, t) / 0.45);
    s.glow[2].copy(s.glow[0]).lerp(s.glow[1], burst);
    // The glow sits a little tighter than the day default, so the lower left falls off
    // and the window's edge separates from the cream.
    ctx.backdrop.userData.set({ glow: s.glow[2], glowAmount: 0.55 + 0.45 * burst, radius: 0.5 + 0.6 * burst });
    post.exposure = 1 + 0.25 * Math.exp(-Math.max(0, t) / 0.26);
    // Blur samples for the fast moves only: the drop (fewer on the cut, so its first frame
    // stays crisp), the push and the pull. The hold, with the split, has none.
    const fast = (t > T.push[0] && t < T.push[1]) || (t > T.pull[0] && t < T.pull[1]);
    post.samples = t < 0.25 ? 8 : t < 1.0 ? 20 : fast ? 16 : 0;
    // A shallow focus on the typing while the camera glides (never with fast-move blur).
    const dofK = sm(1.1, 1.8) * (1 - sm(T.push[0] - 0.3, T.push[0]));
    if (dofK > 0.001) {
      s.v.set(s.stem[0], s.stem[1] + b, 0);
      post.dof = { focus: camera.position.distanceTo(s.v), aperture: 110 * dofK * (ctx.renderH / 1080), maxBlur: 6 * (ctx.renderH / 1080) };
    } else post.dof = null;
    s.dust.set({ time: 16 + t, focus: P.d, bright: 0.4, fov: 30, H: ctx.renderH });

    // ---- type ------------------------------------------------------------------------
    s.head.set(t, T.head, T.exit);
    s.sub.set(t, T.sub, T.exit + 0.05);
    s.langs[0].set(t, T.en);
    s.langs[1].set(t, T.zh);
    s.langs[2].set(t, T.both);
    // The word for the language on the page reads in full ink; "English." steps back for 中文.
    const dimEn = 1 - 0.68 * sm(T.zh - 0.1, T.zh + 0.3) + 0.68 * sm(T.both - 0.1, T.both + 0.3);
    s.langs[0].el.style.opacity = dimEn.toFixed(4);
    s.langsSub.set(t, T.langsSub);
  },
};

export default scene;
