// write — bars 8–16, day (FILM.md §3). The drop cuts in still moving forward, as the
// opening's push did: the window rushes toward the lens and settles by the bar-9 downbeat
// in a close three-quarter view — window bleeding off right, "Type right on the page." in
// the cream on the left — then arcs toward front while the question and its options are
// typed. The 24.0 whoosh pushes into the question; the capture hands over to a layered page
// built from the real sheets (the same document). The page's Chinese lifts off the paper
// toward the lens and re-seats on 25.0; one pull out wide. The real toolbar toggle clicks
// once a bar, 26.0 / 28.0 / 30.0, each with its headline word; the page answers on the
// click frame, as the app does (never two layouts at once), with a small push-in each time.
// Portrait (FILM-9x16.md): the same beats; headline and language words above, the window's
// page (then the layered page) filling the width below them. See LAYOUT.
import { COPY, cueAt, sceneStart } from '../../timeline.mjs';
import { cubicBezier } from '../lib/ease.js';
import { FONT_ZH } from '../lib/type.js';
import { layeredPage } from './write/page.js';
import { framePatch } from './write/patch.js';

const C = COPY.write;
const WW = 3.2; // window width (world units) for the 1440×900 css px capture
// Type boxes (design px from x = 128) that clear the window: beside the page, then the toggles.
const BOX_W = 600;
const LANG_W = 440;
const WIN_SHADOW = 0.5;
// The page inside the capture: sheet px → clip frame px (130% zoom, DPR 2 vs sheet DPR 3).
const PAGE_IN_CLIP = { x: 84, y: 205, k: (2 * 1.3) / 3 };
// The toolbar's EN / 中文 / EN+中 toggle in the language-toggle capture (frame px): the whole
// toolbar strip (it ends at 107), so the resting pointer (tail at 100) is never sliced.
const TOGGLE = { x0: 512, x1: 800, y0: 6, y1: 106 };
const TOGGLE_RATE = 0.75; // its clicks (clip 1.0, 2.5, 4.0) one bar apart
// Clip time held inside [from, to]: the pointer is already in the chip when it fades in
// (it enters from below until 0.75) and never leaves it (it exits from 4.6).
const TOGGLE_HOLD = [0.8, 4.4];
// type-mcq's options paste ~50 ms after the half-beat; start the clip early so they land on it.
const CLIP_LEAD = 0.05;
// The formatting toolbar (css px rect, shadow included). It animates in on focus (clip
// frames 44–50, shown as captured) and vanishes in one frame on Enter (272): a patch of the
// frame before fades it over 4 frames. Between Enter at 199 and focus at 217 (back to
// identical by 225) the patch holds frame 198's toolbar, so it never blinks.
const TOOLBAR = { x0: 16, x1: 1092, y0: 56, y1: 140, pops: [[272, 4]], bridge: [199, 226] };

// The drop: already fast at the cut (initial slope OUT0), long settle.
const out = cubicBezier(0.1, 0.72, 0.2, 1);
const OUT0 = 0.72 / 0.1;
const rush = cubicBezier(0.6, 0, 0.2, 1); // the push: from rest, fastest on the 24.0 whoosh
const nudge = cubicBezier(0.3, 0, 0.15, 1); // the push-in on each reflow: from rest

// Scene seconds (film − 16). The push into the page hangs off its whoosh cue (PUSH_AT); the
// language toggle's clicks, one per bar, come from its clip placement.
const PUSH_AT = cueAt('write.push') - sceneStart('write');
const CLICKS = [10.0, 12.0, 14.0]; // EN, 中文, EN+中: one per bar
const T = {
  drop: 2.3, head: 2.0, sub: 3.0, exit: PUSH_AT - 0.7,
  push: [PUSH_AT - 0.7, PUSH_AT + 0.35], swap: [PUSH_AT + 0.15, PUSH_AT + 0.35], close: [PUSH_AT + 0.35, PUSH_AT + 1.0],
  pull: [PUSH_AT + 0.95, PUSH_AT + 1.8], orbit: [9.4, 15.85],
  lift: [PUSH_AT + 0.32, PUSH_AT + 0.68], seat: [PUSH_AT + 0.68, PUSH_AT + 1.0], // the Chinese lifts toward the lens, re-seats on 25.0
  chip: [CLICKS[0] - 0.65, CLICKS[0] - 0.25],
  en: CLICKS[0] - 0.04, zh: CLICKS[1] - 0.04, both: CLICKS[2] - 0.04,
};
// The page answers half a frame before the click frame, so no frame (nor any motion-blur
// sub-frame of it) holds two layouts. The new layout settles from just above the paper.
const SWAP = 1 / 120;
const SETTLE_Z = 0.02, SETTLE = 0.35, SETTLE_BLUR = 2, SHARPEN = 0.18;
// The lifted Chinese shrinks about the camera target by most of its perspective growth
// (close-up distance D, per format), so it floats over its own place: depth shows as
// parallax and shadow.
const PUSH = 0.02; // camera distance per reflow

const bob = (t) => 0.012 * Math.sin(t * 0.9);

// Per-format layout (FILM-9x16.md). Poses are functions of the window's css() and the page's
// pageAt() (sheet px); landscape is the film as shipped. Portrait: the window's page fills
// the width under the headline, the push lands on question 1, the wide shot puts the page
// under the stacked language words.
const LAYOUT = {
  landscape: {
    LIFT: 0.13, D: 1.45, COMP: 0.8, SHADOW: 0.2,
    win: () => {
      const C1 = pose(-1.26, 0.14, 3.8, -17, 5); // landed on bar 9: window right, type left
      return {
        C1,
        P0: pose(C1.x, C1.y, C1.d * 1.4, -30, 7, -1.5), // the cut: farther, still rushing in
        C1b: pose(-1.33, 0.19, 3.45, -8, 3), // the slow arc toward front as the options land
      };
    },
    page: (at) => ({
      anchor: [900, 771],
      Q: pose(...at(900, 771), 1.4, -1, 1.5),
      Qb: pose(...at(900, 771), 1.5, -10, 1.5), // level: the lift parallax runs along the lines
      C2: pose(...at(530, 690), 2.65, -26, 3),
      C3: ((p) => pose(p[0], p[1] + 0.02, 2.8, -13, 2))(at(530, 690)),
    }),
    head: { x: 128, y: 468, size: 104, zhSize: 44, zhGap: 20, maxWidth: BOX_W, maxLines: 2 },
    sub: { x: 128, y: 736, size: 34, maxWidth: BOX_W },
    langs: { x: 128, ys: [388, 524, 660], size: 108, maxWidth: LANG_W },
  },
  portrait: {
    LIFT: 0.3, D: 3.9, COMP: 0.55, SHADOW: 0.36,
    // The capture hands over to the layers on one frame, at the push's fastest point (its
    // blur hides the selection going): never a dissolve of the two states.
    cut: PUSH_AT - 5 / 60 - SWAP,
    // Each click's framing of its layout (magnification, content shift in design px), from
    // the wide bilingual framing: English pedestals down, the narrower 中文 pushes in,
    // Both (the tallest) eases back so it clears the Reels caption and button column.
    reflow: [[1.02, -8, 90], [1.16, 60, 60], [1, 0, 0]],
    // The capture's page only (css px): the real page top, sidebar and inspector cut away.
    crop: { x0: 78, y0: 102, x1: 1040, y1: 840 },
    // Lands high (the page's content centred in the tall frame), pedestals down under the
    // headline as it rises (C1d, over lowAt), then the slow arc toward front.
    lowAt: [1.55, 2.45],
    win: (css) => {
      const C1 = pose(...css(462, 488), 5.5, -9, 4);
      return {
        C1,
        P0: pose(C1.x, C1.y - 0.25, C1.d * 1.45, -16, 13, -1.2),
        C1d: pose(...css(462, 326), 5.55, -7, 3.5),
        C1b: pose(...css(462, 326), 5.4, -3, 2),
      };
    },
    page: (at) => ({
      anchor: [885, 900],
      Q: pose(...at(885, 900), 3.9, 4, 1.5),
      Qb: pose(...at(885, 900), 4.1, -8, 1.5), // a yaw: lines interleave, so a pitch would slide 中 into EN
      C2: pose(...at(912, 507), 5.33, -13, 4),
      C3: pose(...at(912, 519), 5.5, -6, 2.5),
    }),
    head: { x: 90, y: 372, size: 100, zhSize: 42, zhGap: 18, maxWidth: 860, maxLines: 2 },
    sub: { x: 90, y: 566, size: 34, maxWidth: 860 },
    langs: { x: 90, ys: [320, 440, 560], size: 100, maxWidth: 520 },
  },
};

/** The four page layers at t (see write/page.js): each { z, alpha, blur, k }. */
function layers(t, E, { LIFT, D, COMP }) {
  const [c1, c2, c3] = CLICKS.map((c) => c - SWAP);
  const settle = (c, alpha) => ({
    z: SETTLE_Z * (1 - E.quintOut(E.seg(t, c, c + SETTLE))),
    alpha,
    blur: SETTLE_BLUR * (1 - E.sineOut(E.seg(t, c, c + SHARPEN))),
  });
  const hidden = { z: 0, alpha: 0, blur: 0 };
  if (t < c1) {
    const lift = LIFT * (nudge(E.seg(t, T.lift[0], T.lift[1])) - E.sineInOut(E.seg(t, T.seat[0], T.seat[1])));
    return { biEn: { z: 0, alpha: 1, blur: 0 }, biZh: { z: lift, alpha: 1, blur: 0, k: 1 - (COMP * lift) / D }, en: hidden, zh: hidden };
  }
  if (t < c2) return { biEn: hidden, biZh: hidden, en: settle(c1, 1), zh: hidden };
  if (t < c3) return { biEn: hidden, biZh: hidden, en: hidden, zh: settle(c2, 1) };
  return { biEn: settle(c3, 1), biZh: settle(c3, 1), en: hidden, zh: hidden };
}

/** Camera pose: target x/y (window-group space, z = 0), distance, azimuth, elevation, roll. */
const pose = (x, y, d, az, el, roll = 0) => ({ x, y, d, az, el, roll });
/** Blend of two poses; distance in log space so the image scale changes evenly. */
function mix(A, B, u) {
  if (u <= 0) return A;
  if (u >= 1) return B;
  return blend(A, B, u);
}
/** The same blend, unclamped (u < 0 extrapolates). */
function blend(A, B, u) {
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
    // The whole clip; its last frame holds through the push (update() clamps).
    ctx.placeClip('type-mcq', { at: -CLIP_LEAD, from: 0, rate: 1, dur: s.clip.duration });
    const L = (s.L = ctx.pick(LAYOUT));
    // The capture's css px shown: the whole window, or (portrait) its page only, at the same
    // world scale per css px, so the page layers and poses keep their sizes.
    const K = L.crop ?? { x0: 0, y0: 0, x1: 1440, y1: 900 };
    const kw = K.x1 - K.x0, kh = K.y1 - K.y0;
    if (L.crop) {
      s.win = lib.win.appWindow({ variant: 'none', width: (WW * kw) / 1440, aspect: kw / kh, shadow: false, border: '#CFC8BD' });
      s.win.set({ crop: [K.x0 / 1440, 1 - K.y1 / 900, kw / 1440, kh / 900] });
      s.win.material.uniforms.uRadius.value = 0.008;
    } else s.win = lib.win.appWindow({ variant: 'mac', width: WW, shadow: false });
    scene.add(s.win.group);
    // A soft warm shadow on an imagined wall behind: it breathes out past the window's left
    // and lower edges as the camera looks from the left, so the window reads as floating.
    s.shadow = lib.floor.contactShadow({ w: s.win.width * 0.96, h: s.win.height * 0.92, radius: 0.12, blur: 0.35, color: '#3A342E', opacity: WIN_SHADOW });
    s.shadow.position.set(-0.1, -0.2, -0.35);
    s.win.group.add(s.shadow);
    s.css = (cx, cy) => [((cx - K.x0) / kw - 0.5) * s.win.width, s.win.contentCenter.y + (0.5 - (cy - K.y0) / kh) * s.win.screenHeight];
    const R = TOOLBAR;
    if (!L.crop) { // the page crop starts below the formatting toolbar
      s.patch = framePatch({
        w: ((R.x1 - R.x0) / 1440) * WW,
        h: ((R.y1 - R.y0) / 900) * s.win.screenHeight,
        uv: [R.x0 / 1440, 1 - R.y1 / 900, R.x1 / 1440, 1 - R.y0 / 900],
      });
      s.patch.mesh.position.set(...s.css((R.x0 + R.x1) / 2, (R.y0 + R.y1) / 2), 0.001);
      s.win.group.add(s.patch.mesh);
    }
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
    Object.assign(s, L.win(s.css));

    // The toggle: a crop of the real toolbar, clicked at 0.75× so its clicks land a bar apart.
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
      // Bars 12–16: into the question (Section A and all of question 1, sheet px 443–1128),
      // a slow orbit while its Chinese lifts (parallax shows the depth), out wide, arc
      // toward front and settle. Wide: the typed page, chip to Section B (sheet px 100–1300),
      // beside (landscape) or under (portrait) the language words.
      const P = L.page(s.pageAt);
      s.anchor = s.page.local(...P.anchor);
      Object.assign(s, { Q: P.Q, Qb: P.Qb, C2: P.C2, C3: P.C3 });
    }

    const T_ = lib.type;
    // Half-width CJK punctuation (PingFang 'halt') on the head and 中文.
    s.head = T_.headline(ctx.el, { en: C.headline, zh: C.headlineZh, ...L.head, align: 'left', world: 'day', halt: true });
    s.sub = T_.sub(ctx.el, { en: C.sub, ...L.sub, align: 'left', world: 'day' });
    const { ys, ...G } = L.langs;
    const LG = { ...G, align: 'left', world: 'day' };
    s.langs = [
      T_.headline(ctx.el, { ...LG, en: C.langs[0], y: ys[0] }),
      T_.headline(ctx.el, { ...LG, en: C.langs[1], y: ys[1], font: FONT_ZH, tracking: 0.02, halt: true, kernStop: true }),
      T_.headline(ctx.el, { ...LG, en: C.langs[2], y: ys[2] }),
    ];
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
    s.patch?.set({ map: po > 0 ? s.clip.frameAt(pf / 60) : null, opacity: po });
    const b = bob(t);
    s.win.group.position.set(0, b, 0);

    // ---- camera -----------------------------------------------------------------------
    // The cut continues the opening's push: in toward C1, fastest at the cut. Sub-frames
    // before the cut extrapolate the move, so the first frame blurs like the next.
    let P = t < 0 ? blend(s.P0, s.C1, (OUT0 * t) / T.drop) : mix(s.P0, s.C1, out(E.seg(t, 0, T.drop)));
    if (s.C1d) P = mix(P, s.C1d, sm(...s.L.lowAt));
    P = mix(P, s.C1b, E.sineInOut(E.seg(t, 1.9, 7.9)));
    if (s.page) {
      P = mix(P, s.Q, rush(E.seg(t, T.push[0], T.push[1])));
      P = mix(P, s.Qb, sm(T.close[0], T.close[1]));
      P = mix(P, s.C2, E.quintInOut(E.seg(t, T.pull[0], T.pull[1])));
      P = mix(P, s.C3, sm(T.orbit[0], T.orbit[1]));
    }
    const d = cam.drift(t, 5, { amp: 0.6, rate: 0.07 });
    let push = 1, rx = 0, ry = 0;
    if (s.L.reflow) {
      let [m0, x0, y0] = [1, 0, 0];
      CLICKS.forEach((c, i) => {
        const u = nudge(E.seg(t, c - 0.06, c + 0.9));
        const [m, x, y] = s.L.reflow[i];
        push *= (m0 / m) ** u;
        rx += (x - x0) * u;
        ry += (y - y0) * u;
        [m0, x0, y0] = [m, x, y];
      });
    } else for (const c of CLICKS) push -= PUSH * nudge(E.seg(t, c - 0.06, c + 0.9));
    const creep = 1 - 0.02 * E.sineIn(E.seg(t, 14.6, 16.2)); // settled, never still: a slow push to the cut
    const dist = P.d * d.dist * push * creep;
    const wpx = (2 * dist * Math.tan(Math.PI / 12)) / ctx.H; // world units per design px
    cam.orbit(camera, { target: [P.x - rx * wpx, P.y + ry * wpx, 0], dist, az: P.az + d.az, el: P.el + d.el, roll: P.roll + d.roll, fov: 30 });

    // ---- the handoff (capture → layered page), the language layers, the toggle ---------
    if (s.page) {
      const cut = s.L.cut;
      const pa = cut != null ? +(t >= cut) : sm(T.swap[0], T.swap[1]);
      const wa = cut != null ? 1 - pa : 1 - sm(T.swap[1], T.swap[1] + 0.12);
      s.win.set({ opacity: wa });
      s.win.mesh.visible = wa > 0.001;
      s.shadow.visible = wa > 0.001;
      s.shadow.material.opacity = WIN_SHADOW * wa;

      s.page.set({ alpha: pa, ...layers(t, E, s.L), light: [0.1, -0.16], shadow: s.L.SHADOW, anchor: s.anchor });

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
    // Blur samples for the fast moves: the drop (from its first frame), the push and the pull.
    const fast = (t > T.push[0] && t < T.push[1]) || (t > T.pull[0] && t < T.pull[1]);
    post.samples = t < 1.0 ? 20 : fast ? 16 : 0;
    // A shallow focus on the typing while the camera glides (never with fast-move blur).
    const dofK = sm(1.1, 1.8) * (1 - sm(T.push[0] - 0.3, T.push[0]));
    if (dofK > 0.001) {
      s.v.set(s.stem[0], s.stem[1] + b, 0);
      post.dof = { focus: camera.position.distanceTo(s.v), aperture: 110 * dofK * (ctx.renderH / 1080), maxBlur: 6 * (ctx.renderH / 1080) };
    } else post.dof = null;
    s.dust.set({ time: ctx.start + t, focus: P.d, bright: 0.4, fov: 30, H: ctx.renderH });

    // ---- type ------------------------------------------------------------------------
    s.head.set(t, T.head, T.exit);
    s.sub.set(t, T.sub, T.exit + 0.05);
    s.langs[0].set(t, T.en);
    s.langs[1].set(t, T.zh);
    s.langs[2].set(t, T.both);
    // The word for the language on the page reads in full ink; "English." steps back for 中文.
    const dimEn = 1 - 0.68 * sm(T.zh - 0.1, T.zh + 0.3) + 0.68 * sm(T.both - 0.1, T.both + 0.3);
    s.langs[0].el.style.opacity = dimEn.toFixed(4);
  },
};

export default scene;
