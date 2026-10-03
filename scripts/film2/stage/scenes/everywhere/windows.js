// Three generic, flat window frames (FILM.md §2: no logos, no real OS icons): a browser
// (navigation chevrons, an empty address pill), a Mac-style window (three neutral dots, a
// centred title) and a Windows-style window (left title, line-drawn minimise / maximise /
// close). Each holds the real app's footage in its body. Drawn here, never product pixels.
import { h, s, C, FONT, PAPER_SHADOW } from '../../lib/dom.js';

const stroke = { fill: 'none', stroke: C.inkSubtle, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

function frame(parent, { x, y, w, bodyH, barH, radius }) {
  const el = h('div', { style: {
    position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${barH + bodyH}px`,
    borderRadius: `${radius}px`, background: C.panel, border: `1px solid ${C.lineStrong}`, boxShadow: PAPER_SHADOW,
    overflow: 'hidden', boxSizing: 'border-box', transformOrigin: '50% 50%',
  } }, parent);
  const bar = h('div', { style: {
    position: 'absolute', left: 0, right: 0, top: 0, height: `${barH}px`, background: C.raised, borderBottom: `1px solid ${C.line}`,
  } }, el);
  const body = h('div', { style: { position: 'absolute', left: 0, right: 0, top: `${barH}px`, bottom: 0, overflow: 'hidden', background: C.paper } }, el);
  return { el, bar, body, w, h: barH + bodyH };
}

const title = (bar, text, style) => h('span', { text, style: {
  position: 'absolute', top: 0, bottom: 0, display: 'flex', alignItems: 'center', font: `500 15px ${FONT.sans}`, color: C.inkMuted, ...style,
} }, bar);

/** A browser: chevrons and a reload arc on the left, an address pill (no address) centred. */
export function browser(parent, { x, y, w }) {
  const barH = 52;
  const f = frame(parent, { x, y, w, bodyH: (w * 900) / 1440, barH, radius: 14 });
  const g = s('svg', { width: w, height: barH, style: { position: 'absolute', left: 0, top: 0 } }, f.bar);
  s('path', { d: 'M30 20L24 26L30 32', ...stroke }, g);
  s('path', { d: 'M50 20L56 26L50 32', ...stroke, stroke: C.lineStrong }, g);
  s('path', { d: 'M86 21.5A7 7 0 1 0 88.5 26M86 17.5V21.5H90', ...stroke }, g);
  const pw = Math.round(w * 0.46);
  s('rect', { x: (w - pw) / 2, y: 11, width: pw, height: 30, rx: 15, fill: C.sunken }, g);
  s('rect', { x: (w - pw) / 2 + 22, y: 23.5, width: Math.round(pw * 0.32), height: 5, rx: 2.5, fill: C.lineStrong }, g);
  return f;
}

/** A Mac-style window: three neutral dots, the title centred. */
export function macWindow(parent, { x, y, w, name }) {
  const barH = 40;
  const f = frame(parent, { x, y, w, bodyH: (w * 900) / 1440, barH, radius: 12 });
  const g = s('svg', { width: 80, height: barH, style: { position: 'absolute', left: 0, top: 0 } }, f.bar);
  [0, 1, 2].forEach((i) => s('circle', { cx: 22 + i * 20, cy: barH / 2, r: 6, fill: C.lineStrong }, g));
  title(f.bar, name, { left: 0, right: 0, justifyContent: 'center' });
  return f;
}

/** A Windows-style window: square-ish corners, the title on the left, three line controls right. */
export function winWindow(parent, { x, y, w, name }) {
  const barH = 40;
  const f = frame(parent, { x, y, w, bodyH: (w * 900) / 1440, barH, radius: 6 });
  title(f.bar, name, { left: '18px' });
  const cw = 46;
  const g = s('svg', { width: cw * 3, height: barH, style: { position: 'absolute', right: 0, top: 0 } }, f.bar);
  const cy = barH / 2;
  s('path', { d: `M${cw / 2 - 6} ${cy}H${cw / 2 + 6}`, ...stroke }, g);
  s('rect', { x: cw * 1.5 - 5.5, y: cy - 5.5, width: 11, height: 11, ...stroke }, g);
  s('path', { d: `M${cw * 2.5 - 5.5} ${cy - 5.5}L${cw * 2.5 + 5.5} ${cy + 5.5}M${cw * 2.5 + 5.5} ${cy - 5.5}L${cw * 2.5 - 5.5} ${cy + 5.5}`, ...stroke }, g);
  return f;
}
