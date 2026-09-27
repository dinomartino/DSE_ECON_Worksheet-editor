// write — bars 8–16, day (FILM.md §3). The drop cuts in mid-flight: the camera flies out of
// the page of the real app as the typing starts (16.0) and lands by the bar-9 downbeat in a
// close three-quarter view — window bleeding off right, "Type right on the page." in the
// cream on the left — then arcs toward front while the question and its options are typed.
// The 24.0 whoosh pushes into the question; the capture hands over to a layered page built
// from the real sheets and the camera swings wide as the English layer lifts off the paper.
// The real toolbar toggle clicks on the beats 26.0 / 27.0 / 28.0: English, then Chinese,
// then both, when the layers merge back onto the paper. Settled from 28.5 to the cut.
import { COPY } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { FONT_ZH } from '../lib/type.js';
import { layeredPage } from './write/page.js';

const C = COPY.write;
const WW = 3.2; // window width (world units) for the 1440×900 css px capture
// The page inside the capture: sheet px → clip frame px (130% zoom, DPR 2 vs sheet DPR 3).
const PAGE_IN_CLIP = { x: 84, y: 205, k: (2 * 1.3) / 3 };
// The toolbar's EN / 中文 / EN+中 toggle in the language-toggle capture (frame px).
const TOGGLE = { x0: 512, x1: 800, y0: 16, y1: 96 };
const TOGGLE_RATE = 1.5; // its clicks (clip 1.0, 2.5, 4.0) one second apart
// type-mcq's options paste ~50 ms after the half-beat; start the clip early so they land on it.
const CLIP_LEAD = 0.05;

const out = cubicBezier(0.1, 0.72, 0.2, 1); // the drop: already fast at the cut, long settle
const rush = cubicBezier(0.6, 0, 0.2, 1); // the push: from rest, fastest on the 24.0 whoosh

// Scene seconds (film − 16).
const T = {
  head: 2.0, sub: 3.0, exit: 7.3,
  push: [7.35, 8.5], swap: [8.15, 8.35], pull: [8.3, 9.85], orbit: [9.7, 15.85],
  chip: [9.15, 9.65],
  en: 9.96, zh: 10.96, both: 11.96, langsSub: 12.7,
};
const CLICKS = [10.0, 11.0, 12.0]; // EN, 中文, EN+中: each on a beat, the page answers at once
// The layers: bilingual → split (English lifts) → English → Chinese → both (merged).
const SPLIT = [8.7, 9.75];
const MOVE = { en: [10.0, 10.5], zh: [11.0, 11.5], bi: [12.0, 12.6] };
const UP = 0.22, LOW = 0.05, ZUP = 0.26, GHOST = 0.1, GBLUR = 8;
const STATES = [
  { en: { z: 0, reflow: 0, alpha: 1, blur: 0 }, zh: { z: 0, reflow: 0, alpha: 1, blur: 0 } },
  { en: { z: UP, reflow: 0, alpha: 1, blur: 0 }, zh: { z: 0, reflow: 0, alpha: 0.5, blur: 2.5 } },
  { en: { z: UP, reflow: 1, alpha: 1, blur: 0 }, zh: { z: 0, reflow: 0, alpha: GHOST, blur: GBLUR } },
  { en: { z: LOW, reflow: 1, alpha: GHOST, blur: GBLUR }, zh: { z: ZUP, reflow: 1, alpha: 1, blur: 0 } },
  { en: { z: 0, reflow: 0, alpha: 1, blur: 0 }, zh: { z: 0, reflow: 0, alpha: 1, blur: 0 } },
];
const STEPS = [SPLIT, MOVE.en, MOVE.zh, MOVE.bi];

const bob = (t) => 0.012 * Math.sin(t * 0.9);

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
    s.clip = await ctx.load.clip('type-mcq', { cache: 6, prefetch: 3 });
    ctx.placeClip('type-mcq', { at: -CLIP_LEAD, from: 0, rate: 1, dur: T.push[1] + CLIP_LEAD });
    s.win = lib.win.appWindow({ variant: 'mac', width: WW, shadow: false });
    scene.add(s.win.group);
    s.shadow = lib.floor.contactShadow({ w: WW * 0.9, h: s.win.height * 0.86, radius: 0.1, blur: 0.3, color: '#3A342E', opacity: 0.2 });
    s.shadow.position.set(0.04, -0.13, -0.38);
    s.win.group.add(s.shadow);
    s.css = (cx, cy) => [(cx / 1440 - 0.5) * WW, s.win.contentCenter.y + (0.5 - cy / 900) * s.win.screenHeight];
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
    s.C1 = pose(-1.1, 0.14, 3.8, -17, 5); // landed on bar 9: window right, type left
    s.C1b = pose(-1.2, 0.19, 3.45, -8, 3); // the slow arc toward front as the options land

    // The toggle: a crop of the real toolbar, clicked at 1.5× so its clicks land on beats.
    s.toggleClip = await ctx.load.clip('language-toggle', { cache: 4, prefetch: 2 });
    s.toggleAt = CLICKS[0] - 1.0 / TOGGLE_RATE;
    ctx.placeClip('language-toggle', { at: s.toggleAt, from: 0, rate: TOGGLE_RATE });
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
      // Bars 12–16: into the question, out wide to the layers, arc toward front and settle.
      // Close enough on question 1 that the swap never shows what differs below it.
      const q = s.pageAt(850, 835);
      s.Q = pose(q[0], q[1], 1.13, -1, 1.5);
      const pc = s.pageAt(1189, 1000);
      s.C2 = pose(pc[0] - 0.52, pc[1] + 0.2, 3.4, -32, 3);
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
    s.win.set({ screen: s.clip.frameAt(Math.min(t + CLIP_LEAD, 7.999)) });
    const b = bob(t);
    s.win.group.position.set(0, b, 0);

    // ---- camera -----------------------------------------------------------------------
    let P = mix(s.P0, s.C1, out(E.seg(t, -0.3, 2.3)));
    P = mix(P, s.C1b, E.sineInOut(E.seg(t, 1.9, 7.9)));
    if (s.page) {
      P = mix(P, s.Q, rush(E.seg(t, T.push[0], T.push[1])));
      P = mix(P, s.C2, E.quintInOut(E.seg(t, T.pull[0], T.pull[1])));
      P = mix(P, s.C3, sm(T.orbit[0], T.orbit[1]));
    }
    const d = cam.drift(t, 5, { amp: 0.6, rate: 0.07 });
    cam.orbit(camera, { target: [P.x, P.y, 0], dist: P.d * d.dist, az: P.az + d.az, el: P.el + d.el, roll: P.roll + d.roll, fov: 30 });

    // ---- the handoff (capture → layered page), the language layers, the toggle ---------
    if (s.page) {
      const pa = sm(T.swap[0], T.swap[1]);
      const wa = 1 - sm(T.swap[1], T.swap[1] + 0.12);
      s.win.set({ opacity: wa });
      s.win.mesh.visible = wa > 0.001;
      s.shadow.visible = wa > 0.001;
      s.shadow.material.opacity = 0.2 * wa;

      // Each step eases every layer property from one state to the next.
      let st = STATES[0];
      STEPS.forEach((w, i) => {
        const u = sm(w[0], w[1]);
        if (u <= 0) return;
        const A = st, B = STATES[i + 1];
        const lin = E.seg(t, w[0], w[1]); // reflow gets its own per-line ease in the page
        const blend = (a, c) => ({
          z: a.z + (c.z - a.z) * u,
          reflow: a.reflow + (c.reflow - a.reflow) * lin,
          alpha: a.alpha + (c.alpha - a.alpha) * u,
          blur: a.blur + (c.blur - a.blur) * u,
        });
        st = { en: blend(A.en, B.en), zh: blend(A.zh, B.zh) };
      });
      s.page.set({ alpha: pa, en: st.en, zh: st.zh, light: [0.1, -0.16], shadow: 0.2 });

      // The toggle floats in over the page's top margin just before its first click.
      const ca = E.quintOut(E.seg(t, T.chip[0], T.chip[1] + 0.35));
      const tc = Math.min(5.99, Math.max(0, (t - s.toggleAt) * TOGGLE_RATE));
      s.chip.set({ screen: s.toggleClip.frameAt(tc), opacity: ca, shadowOpacity: 0.16 * ca });
      s.chip.group.visible = ca > 0.001;
      s.chip.group.position.set(s.chipHome[0], s.chipHome[1] - 0.05 * (1 - ca), 0.1 + 0.12 * ca);
    }

    // ---- light: a burst on the drop -----------------------------------------------------
    const burst = Math.exp(-Math.max(0, t) / 0.45);
    s.glow[2].copy(s.glow[0]).lerp(s.glow[1], burst);
    ctx.backdrop.userData.set({ glow: s.glow[2], glowAmount: 0.55 + 0.45 * burst, radius: 0.6 + 0.5 * burst });
    post.exposure = 1 + 0.42 * Math.exp(-Math.max(0, t) / 0.26);
    post.samples = t < 1.0 ? 20 : t > T.push[0] && t < T.pull[1] ? 16 : 0;
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
