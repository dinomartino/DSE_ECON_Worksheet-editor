// The camera grammar (FILM.md §7 "Camera"): every footage or still picture is framed at one of
// three shot sizes, and a shot makes at most one move.
//   WIDE    the card at 0.62 of the frame (layout.WIDE), the whole UI, cream around it
//   MEDIUM  the C1 card (1728 × 744 at 1.2×) or C1 narrow ('narrow'); a HEADLINE above it
//   CLOSE   2.4–3.0× full-bleed: no card edge, no border, no shadow, no dim; the footage IS the frame
// A shot = { at, size, focus, safe?, zoom?, anchor?, move?, drift?, dim? } (scene seconds; source
// CSS px). It lasts until the next shot's `at` (a cut) or `end`. `move: { to: {size, focus, …},
// at?, dur? }` is the one move (push / pull, inOutSoft, default 4 pulses from the shot's start);
// without one the shot drifts (scale +drift over the shot, sineInOut, default 1.5 %, ≤ 3 %).
// `safe` is a rect that must stay wholly visible (no word cut by an edge): the camera shrinks
// and slides to keep it in, but never shows ground inside the card (coverage wins; `safeOk`).
// The dim (medium/wide only) is capped at 0.16 and eases in and out on inOutSoft.
//
//   const cam = lib.camera(ctx, { src: { w: 1440, h: 900 } });
//   const clip = await ctx.load.clip('type-mcq', cam.box, cam.content);   // or cam.image(url)
//   cam.shots([{ at: 0, size: 'medium', focus: [0, 0, 1440, 620] },
//              { at: P(8), size: 'close', focus: Q1, safe: Q1_TEXT, move: { to: { zoom: 2.8 } } }]);
//   update: cam.update(t); clip.at(...); cam.toScreen([x, y]) for dots and callouts.
import { h, show, C } from './dom.js';
import { clamp, lerp, prog, inOutSoft, sineInOut } from './ease.js';
import { f } from './tween.js';
import { focus as focusMask } from './focus.js';
import { C1, C1N, WIDE } from './layout.js';
import { PULSE } from '../../timeline.mjs';

export const SIZES = ['wide', 'medium', 'narrow', 'close'];
/** Shot-size rank: a cut must change it (narrow counts as medium). */
export const RANK = { wide: 0, medium: 1, narrow: 1, close: 2 };
export const CLOSE_ZOOM = [2.4, 3.0];
export const DIM_MAX = 0.16;
const FULL = { x: 0, y: 0, w: 1920, h: 1080 };
const MARGIN = { card: 24, close: 48 }; // the safe rect keeps this far from a visible edge

const rectOf = (r) => (Array.isArray(r) ? { x: r[0], y: r[1], w: r[2], h: r[3] } : r);

/** The app's paper shadow with its alphas scaled by k (0 = none). */
const shadow = (k) => (k <= 0.001 ? 'none'
  : `0 1px 2px rgb(0 0 0 / ${f(0.07 * k, 4)}), 0 8px 24px -6px rgb(0 0 0 / ${f(0.13 * k, 4)}), 0 24px 48px -12px rgb(0 0 0 / ${f(0.11 * k, 4)})`);

/** Clamp the pose so the content covers `rect` (no ground inside the card). Mutates q. */
function cover(q, rect, src) {
  q.s = Math.max(q.s, rect.w / src.w, rect.h / src.h);
  for (const [i, o, len] of [[0, rect.x, rect.w], [1, rect.y, rect.h]]) {
    const n = i ? src.h : src.w;
    const lo = (q.a[i] - o) / q.s; // content's near edge at or before the rect's
    const hi = n - (o + len - q.a[i]) / q.s; // content's far edge at or after the rect's
    q.c[i] = lo > hi ? n / 2 : clamp(q.c[i], lo, hi);
  }
  return q;
}

/** Whether the safe rect (CSS px) is inside rect (design px, inset by m) under pose q. */
function safeInside(q, safe, rect, m) {
  if (!safe) return true;
  const x0 = q.a[0] + q.s * (safe.x - q.c[0]), y0 = q.a[1] + q.s * (safe.y - q.c[1]);
  return x0 >= rect.x + m - 0.5 && y0 >= rect.y + m - 0.5 && x0 + q.s * safe.w <= rect.x + rect.w - m + 0.5 && y0 + q.s * safe.h <= rect.y + rect.h - m + 0.5;
}

/**
 * The framing of one shot spec (pure): { size, rect, radius, edge, pose: { a, c, s }, safeOk }.
 * spec: { size, focus?, safe?, zoom?, anchor?: [x, y] design px, card?: rect override }.
 */
export function frame(spec, src = { w: 1440, h: 900 }) {
  const size = spec.size ?? 'medium';
  if (!(size in RANK)) throw new Error(`camera: unknown shot size "${size}" (${SIZES.join(', ')})`);
  const fo = rectOf(spec.focus ?? [0, 0, src.w, src.h]);
  const safe = spec.safe ? rectOf(spec.safe) : null;
  const close = size === 'close';
  const rect = { ...(spec.card ?? (close ? FULL : size === 'wide' ? WIDE.card : size === 'narrow' ? C1N.card : C1.card)) };
  const m = close ? MARGIN.close : MARGIN.card;
  const coverS = Math.max(rect.w / src.w, rect.h / src.h);
  let s;
  if (spec.zoom) s = spec.zoom;
  else if (close) s = clamp(Math.min((rect.w - 2 * 96) / fo.w, (rect.h - 2 * 72) / fo.h), ...CLOSE_ZOOM);
  else if (size === 'medium') s = C1.scale;
  else if (size === 'narrow') s = clamp(Math.min((rect.w - 2 * m) / fo.w, (rect.h - 2 * m) / fo.h), coverS, 2);
  else s = coverS;
  if (safe) s = Math.min(s, (rect.w - 2 * m) / safe.w, (rect.h - 2 * m) / safe.h);
  const q = { a: spec.anchor ? [...spec.anchor] : [rect.x + rect.w / 2, rect.y + rect.h / 2], c: [fo.x + fo.w / 2, fo.y + fo.h / 2], s };
  if (safe) {
    for (const [i, o, len, p, n] of [[0, rect.x, rect.w, safe.x, safe.w], [1, rect.y, rect.h, safe.y, safe.h]]) {
      const lo = p + n - (o + len - m - q.a[i]) / q.s; // the safe rect's far edge inside
      const hi = p - (o + m - q.a[i]) / q.s; // its near edge inside
      q.c[i] = clamp(q.c[i], lo, Math.max(lo, hi));
    }
  }
  cover(q, rect, src);
  return { size, rect, radius: close ? 0 : 16, edge: close ? 0 : 1, pose: q, safeOk: safeInside(q, safe, rect, m), safe };
}

/** Between two framings at p (already eased): rect, radius, edge lerp; scale in log space. */
export function between(A, B, p, src) {
  const L = (k) => lerp(A.rect[k], B.rect[k], p);
  const rect = { x: L('x'), y: L('y'), w: L('w'), h: L('h') };
  const q = {
    a: [lerp(A.pose.a[0], B.pose.a[0], p), lerp(A.pose.a[1], B.pose.a[1], p)],
    c: [lerp(A.pose.c[0], B.pose.c[0], p), lerp(A.pose.c[1], B.pose.c[1], p)],
    s: Math.exp(lerp(Math.log(A.pose.s), Math.log(B.pose.s), p)),
  };
  return { size: p < 1 ? A.size : B.size, rect, radius: lerp(A.radius, B.radius, p), edge: lerp(A.edge, B.edge, p), pose: cover(q, rect, src), safeOk: p < 0.5 ? A.safeOk : B.safeOk };
}

/** Problems with a shot list (also reported by the doctor): same-size cuts, unreadable safe rects. */
export function lint(list, src = { w: 1440, h: 900 }) {
  const out = [];
  list.forEach((s, i) => {
    const A = frame(s, src);
    const B = s.move ? frame({ ...s, ...s.move.to }, src) : A;
    if (!A.safeOk || !B.safeOk) out.push(`shot ${i} (${f(s.at, 2)} s): its safe rect does not fit the ${B.size} frame`);
    if ((s.drift ?? 0) > 0.03) out.push(`shot ${i}: drift ${s.drift} is over 3 %`);
    const prev = list[i - 1];
    if (prev) {
      const pe = prev.move?.to?.size ?? prev.size;
      if (RANK[pe] === RANK[s.size]) out.push(`cut at ${f(s.at, 2)} s: ${pe} → ${s.size} (every cut changes the shot size)`);
    }
  });
  return out;
}

/**
 * A camera rig in `parent` (default ctx.el): a card that becomes the frame in CLOSE, a content
 * box of the source's CSS size inside it. Returns { el, card, content, box, image, shots,
 * update, toScreen, state }.
 */
export function camera(ctx, { src = { w: 1440, h: 900 }, parent = ctx.el, name = 'camera' } = {}) {
  const el = h('div', { class: 'cam', style: { position: 'absolute', inset: 0, pointerEvents: 'none' } }, parent);
  const card = h('div', { class: 'cam-card', style: { position: 'absolute', overflow: 'hidden', background: C.paper, boxSizing: 'border-box' } }, el);
  const content = h('div', { class: 'cam-content', style: { position: 'absolute', left: 0, top: 0, width: `${src.w}px`, height: `${src.h}px`, transformOrigin: '0 0' } }, card);
  const dim = focusMask(card, { max: DIM_MAX });
  const border = h('div', { style: { position: 'absolute', inset: 0, boxSizing: 'border-box', border: `1px solid ${C.line}`, pointerEvents: 'none' } }, card);
  let list = [];
  const state = { shot: null, frame: null };

  const rig = {
    el, card, content, src,
    box: { x: 0, y: 0, w: src.w, h: src.h },
    /** An <img> of the source's size inside the content box (a still: a page render, a frame). */
    image(url, style = {}) {
      return h('img', { src: url, style: { position: 'absolute', left: 0, top: 0, width: `${src.w}px`, height: `${src.h}px`, objectFit: 'cover', ...style } }, content);
    },
    /** Declare the shot list (sorted by `at`); registered for the doctor's shot budget. */
    shots(shots) {
      list = shots.map((s) => ({ drift: 0.015, ...s })).sort((a, b) => a.at - b.at);
      list.forEach((s, i) => {
        s.end ??= list[i + 1]?.at ?? ctx.dur + (ctx.window.end - ctx.to);
        s.A = frame(s, src);
        s.B = s.move ? frame({ ...s, ...s.move.to, focus: s.move.to.focus ?? s.focus, safe: s.move.to.safe ?? s.safe }, src) : s.A;
      });
      const problems = lint(list, src);
      ctx.registerShots?.(name, list.map((s) => ({ at: s.at, end: s.end, size: s.size, to: s.move?.to?.size ?? s.size, moveAt: s.at + (s.move?.at ?? 0) })), problems);
      return problems;
    },
    /** Pose the rig at scene time t. Returns the state { shot, frame }. */
    update(t) {
      const s = list.findLast((x) => t >= x.at) ?? list[0];
      if (!s) return state;
      let F;
      if (s.move) {
        const m0 = s.at + (s.move.at ?? 0);
        F = between(s.A, s.B, inOutSoft(prog(t, m0, m0 + (s.move.dur ?? 4 * PULSE))), src);
      } else {
        const k = 1 + (s.drift ?? 0) * sineInOut(prog(t, s.at, s.end));
        F = { ...s.A, pose: cover({ ...s.A.pose, a: [...s.A.pose.a], c: [...s.A.pose.c], s: s.A.pose.s * k }, s.A.rect, src) };
      }
      const { rect: r, pose: q } = F;
      Object.assign(card.style, {
        left: `${f(r.x, 2)}px`, top: `${f(r.y, 2)}px`, width: `${f(r.w, 2)}px`, height: `${f(r.h, 2)}px`,
        borderRadius: `${f(F.radius, 2)}px`, boxShadow: shadow(F.edge),
      });
      border.style.borderRadius = `${f(F.radius, 2)}px`;
      show(border, F.edge);
      content.style.transform = `translate(${f(q.a[0] - q.s * q.c[0] - r.x, 2)}px, ${f(q.a[1] - q.s * q.c[1] - r.y, 2)}px) scale(${f(q.s, 5)})`;
      state.shot = s;
      state.frame = F;
      // The dim: medium and wide only, ≤ 0.16, inOutSoft at both ends.
      const d = s.dim;
      const amt = d && F.size !== 'close' ? clamp(inOutSoft(prog(t, d.on, d.on + (d.dur ?? 2 * PULSE))) - inOutSoft(prog(t, d.off - (d.dur ?? 2 * PULSE), d.off))) : 0;
      if (amt > 0) {
        const dr = rectOf(d.rect);
        const [x0, y0] = rig.toScreen([dr.x, dr.y]);
        dim.set({ x: x0 - r.x, y: y0 - r.y, w: dr.w * q.s, h: dr.h * q.s, r: 12, amount: amt });
      } else dim.set({ amount: 0 });
      return state;
    },
    /** Source CSS px → design px at the current pose. */
    toScreen([x, y]) {
      const q = state.frame?.pose;
      return q ? [q.a[0] + q.s * (x - q.c[0]), q.a[1] + q.s * (y - q.c[1])] : [x, y];
    },
    state,
  };
  return rig;
}
