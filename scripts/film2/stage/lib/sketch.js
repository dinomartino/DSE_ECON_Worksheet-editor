// The four kinds of paper as flat sketches: geometry and colours lifted from
// src/components/start/PaperSketch.tsx (copied, never imported; viewBox 0 0 120 170).
// Illustration only, never presented as the product's pixels.
import { s, h, show, C, PAPER_SHADOW } from './dom.js';
import { clamp } from './ease.js';
import { f } from './tween.js';

const HEAD = C.sketchHead, TEXT = C.sketchText, RULE = C.sketchRule, ACCENT = C.sketchAccent;
export const KINDS = ['classroom', 'lqWorksheet', 'paper1', 'lqMock'];

// Each item: [tag, attrs]. Bars are rects with rx = h/2.
const bar = (x, y, w, ht = 2.6, fill = TEXT) => ['rect', { x, y, width: w, height: ht, rx: ht / 2, fill }];
const dotted = (y, x1 = 20, x2 = 108) => ['line', { x1, x2, y1: y, y2: y, stroke: RULE, 'stroke-width': 0.9, 'stroke-dasharray': '0.1 2', 'stroke-linecap': 'round' }];
const rule = (x1, x2, y, sw = 0.8, stroke = RULE) => ['line', { x1, x2, y1: y, y2: y, stroke, 'stroke-width': sw }];
const options = (y, pick) => [0, 1, 2, 3].flatMap((i) => {
  const x = i % 2 === 0 ? 20 : 64;
  const oy = y + Math.floor(i / 2) * 6;
  return [
    ['circle', { cx: x + 1.6, cy: oy + 1.3, r: 1.7, fill: pick === i ? ACCENT : 'none', stroke: pick === i ? ACCENT : RULE, 'stroke-width': 0.8 }],
    bar(x + 5, oy, i % 2 === 0 ? 30 : 26, 2.4),
  ];
});
const boxes = (x, y) => Array.from({ length: 7 }, (_, i) => ['rect', { x: x + i * 6.2, y, width: 5.2, height: 6, fill: 'none', stroke: RULE, 'stroke-width': 0.7 }]);

export const SKETCHES = {
  classroom: [
    bar(30, 13, 60, 5, HEAD), bar(42, 22, 36), bar(12, 32, 38, 2), bar(70, 32, 38, 2), rule(12, 108, 38.5, 0.8, TEXT),
    bar(12, 45, 5, 2.6, HEAD), bar(20, 45, 86), bar(20, 51, 58), ...options(58),
    bar(12, 77, 5, 2.6, HEAD), bar(20, 77, 80), ...options(84, 2),
    bar(12, 103, 5, 2.6, HEAD), bar(20, 103, 88), bar(20, 109, 46),
    ['path', { d: 'M21 117v29h36', fill: 'none', stroke: HEAD, 'stroke-width': 0.9 }],
    ['path', { d: 'M25 120l28 22M25 142l28-22', fill: 'none', stroke: HEAD, 'stroke-width': 1, 'stroke-linecap': 'round' }],
    ['circle', { cx: 39, cy: 131, r: 2.3, fill: ACCENT }],
    ...[121, 129, 137, 145].map((y) => rule(64, 108, y)), rule(20, 108, 154),
  ],
  lqWorksheet: [
    bar(30, 13, 60, 5, HEAD), bar(40, 22, 40),
    bar(12, 35, 5, 2.6, HEAD), bar(20, 35, 88), bar(20, 41, 82), bar(20, 47, 48), bar(94, 47, 14, 2.2, RULE),
    ...[58, 66, 74, 82, 90].map((y) => dotted(y)),
    bar(12, 102, 5, 2.6, HEAD), bar(20, 102, 86), bar(20, 108, 54), bar(94, 108, 14, 2.2, RULE),
    ...[119, 127, 135, 143, 151, 159].map((y) => dotted(y)),
  ],
  paper1: [
    bar(12, 12, 22, 3, HEAD), bar(12, 18, 32, 2.2), ...boxes(65, 12),
    bar(26, 36, 68, 6, HEAD), bar(41, 47, 38, 5, HEAD), bar(44, 57, 32, 2.4),
    ['rect', { x: 12, y: 68, width: 96, height: 62, rx: 1.5, fill: 'none', stroke: TEXT, 'stroke-width': 0.8 }],
    bar(18, 74, 34, 3, HEAD),
    ...[82, 88.5, 95, 101.5, 108, 114.5, 121].map((y, i) => bar(18, y, [84, 78, 82, 70, 80, 64, 74][i], 2.2)),
    bar(12, 142, 40, 2.4), bar(12, 148, 30, 2.4),
    ...[0, 1, 2, 3].map((i) => ['circle', { cx: 72 + i * 9, cy: 146, r: 2.6, fill: i === 1 ? ACCENT : 'none', stroke: i === 1 ? ACCENT : RULE, 'stroke-width': 0.8 }]),
  ],
  lqMock: [
    ['rect', { x: 7, y: 7, width: 106, height: 156, fill: 'none', stroke: TEXT, 'stroke-width': 0.8 }],
    ['rect', { x: 2.2, y: 40, width: 1.8, height: 11, rx: 0.9, fill: HEAD }],
    ['rect', { x: 2.2, y: 119, width: 1.8, height: 11, rx: 0.9, fill: HEAD }],
    bar(13, 13, 22, 3, HEAD), bar(13, 19, 30, 2.2), ...boxes(63, 13),
    bar(26, 33, 68, 6, HEAD), bar(41, 44, 38, 5, HEAD), bar(36, 54, 48, 2.4),
    ...[68, 74, 80, 86, 92, 98, 104, 110, 116, 122].map((y, i) => bar(13, y, [56, 50, 54, 44, 52, 38, 55, 48, 52, 30][i], 2.2)),
    ['rect', { x: 77, y: 66, width: 30, height: 64, fill: 'none', stroke: RULE, 'stroke-width': 0.7 }],
    ['rect', { x: 77, y: 66, width: 30, height: 8, fill: '#efebe3', stroke: RULE, 'stroke-width': 0.7 }],
    ['line', { x1: 90, x2: 90, y1: 66, y2: 130, stroke: RULE, 'stroke-width': 0.7 }],
    ...[82, 90, 98, 106, 114, 122].map((y) => ['line', { x1: 77, x2: 107, y1: y, y2: y, stroke: RULE, 'stroke-width': 0.6 }]),
    bar(13, 139, 40, 3, HEAD), bar(13, 146, 86, 2.2), bar(13, 152, 60, 2.2),
  ],
};

/**
 * A sketched page, `w` px wide (A4-ish 120:170), top-left at (x, y), on white with the
 * paper shadow. → { el, svg, items, write(p) }: write(p) lays the page's marks down in
 * reading order (bars grow from their left end), p 0..1.
 */
export function sketch(parent, kind, { x = 0, y = 0, w = 300, shadow = PAPER_SHADOW, radius = 3 } = {}) {
  const ht = (w * 170) / 120;
  const el = h('div', { class: 'sketch', style: {
    position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${f(ht, 2)}px`,
    background: C.paper, boxShadow: shadow, borderRadius: `${radius}px`, overflow: 'hidden', transformOrigin: '50% 50%',
  } }, parent);
  const svg = s('svg', { viewBox: '0 0 120 170', width: w, height: f(ht, 2), style: { display: 'block' } }, el);
  const items = SKETCHES[kind].map(([tag, a]) => s(tag, a, svg));
  const widths = items.map((it) => (it.tagName === 'rect' && it.getAttribute('rx') != null && it.getAttribute('fill') !== 'none' ? Number(it.getAttribute('width')) : null));
  function write(p) {
    const n = items.length;
    items.forEach((it, i) => {
      const q = clamp(p * (n + 3) - i, 0, 1) ** 0.8;
      if (widths[i] != null) {
        it.setAttribute('width', f(widths[i] * q, 3));
        it.style.visibility = q > 0 ? 'visible' : 'hidden';
      } else show(it, q);
    });
  }
  return { el, svg, items, write, w, h: ht };
}
