// DOM and SVG builders, the palette, and stroke draw-on. Setup builds elements once; update
// only writes attributes and styles from t.
import { clamp } from './ease.js';
import { f } from './tween.js';

const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'class') el.setAttribute('class', v);
    else el.setAttribute(k, String(v));
  }
  return el;
}

/** An HTML element: h('div', { class, style: {...}, text }, parent). */
export function h(tag, attrs, parent) {
  const el = apply(document.createElement(tag), attrs);
  parent?.appendChild(el);
  return el;
}

/** An SVG element: s('path', { d, stroke }, parent). */
export function s(tag, attrs, parent) {
  const el = apply(document.createElementNS(SVGNS, tag), attrs);
  parent?.appendChild(el);
  return el;
}

/** An absolutely placed <svg> in design px: svg(parent, { x, y, w, h, viewBox }). */
export function svg(parent, { x = 0, y = 0, w = 1920, h = 1080, viewBox, ...rest } = {}) {
  return s('svg', {
    viewBox: viewBox ?? `0 0 ${w} ${h}`,
    width: w,
    height: h,
    style: { position: 'absolute', left: `${x}px`, top: `${y}px`, overflow: 'visible' },
    ...rest,
  }, parent);
}

/**
 * Stroke draw-on for a path (or line, polyline, circle): drawn(p) shows the first p of its
 * length. Hidden at p = 0 (a zero-length dash still paints its round cap). `len` defaults to
 * the measured length; pass it when the path is not in the document yet.
 */
export function drawable(el, len) {
  const L = len ?? el.getTotalLength();
  el.setAttribute('stroke-dasharray', `${f(L)} ${f(L)}`);
  return (p) => {
    const q = clamp(p);
    el.setAttribute('stroke-dashoffset', f(L * (1 - q)));
    el.style.visibility = q > 0 ? 'visible' : 'hidden';
  };
}

/** Sets a transform from x, y (px), scale and an optional rotation (deg). */
export function place(el, { x = 0, y = 0, scale = 1, rot = 0, opacity } = {}) {
  const parts = [`translate(${f(x, 2)}px, ${f(y, 2)}px)`];
  if (Math.abs(scale - 1) > 1e-5) parts.push(`scale(${f(scale, 5)})`);
  if (rot) parts.push(`rotate(${f(rot, 3)}deg)`);
  el.style.transform = parts.join(' ');
  if (opacity != null) show(el, opacity);
}

/** Opacity with visibility: an element at 0 is not painted at all. */
export function show(el, o) {
  const q = clamp(o);
  el.style.opacity = f(q, 4);
  el.style.visibility = q > 0.0005 ? 'visible' : 'hidden';
}

// FILM.md §4: the warm studio palette. On paper, literal hex.
export const C = {
  desk: '#D2CDC2',
  cream: '#F1ECE3',
  raised: '#FAF6EF',
  sunken: '#E7E2D9',
  panel: '#FDFBF7',
  panelSunken: '#F5F1E9',
  paper: '#FFFFFF',
  ink: '#2A2620',
  inkMuted: '#5A544D',
  inkSubtle: '#7F7973',
  line: '#D8D4CB',
  lineStrong: '#BBB7AE',
  markTile: '#3A342E',
  markCream: '#FCFAF6',
  markBlue: '#1E7FD4',
  accent: '#0076CC',
  accentSoft: '#CDE9FF',
  accentInk: '#00559E',
  red: '#DC2626',
  ok: '#047857',
  sketchHead: '#948D80',
  sketchText: '#DCD7CD',
  sketchRule: '#C9C3B7',
  sketchAccent: '#2D6FC6',
};

/** The app's .paper-shadow (globals.css). */
export const PAPER_SHADOW = '0 1px 2px rgb(0 0 0 / .07), 0 8px 24px -6px rgb(0 0 0 / .13), 0 24px 48px -12px rgb(0 0 0 / .11)';

export const FONT = {
  serif: '"Newsreader", ui-serif, Georgia, serif',
  sans: '"Inter", -apple-system, "SF Pro Text", system-ui, sans-serif',
  zh: '"PingFang HK", "PingFang TC", "Noto Sans HK", "Heiti TC", sans-serif',
};
