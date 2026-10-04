// Type: a bilingual block (English, Chinese under it), fitted to its box once at setup and
// revealed line by line from t. Fonts are loaded before any scene's setup (engine.js), so
// measuring here is deterministic. The doctor reads `el.fit` and `data-revealed` through
// film.text(). FILM.md §4 "Type system": use a preset, never literal sizes:
//   block(parent, { ...HEADLINE, ...ctx.copy.draw })     the 72 px one-line slot, top left (C1)
//   block(parent, { ...STATEMENT, ...ctx.copy.word })    112 px, text-led frames (C3; C2 via layout.js)
//   label(parent, { ...LABEL, en, zh, x, y })             22 px caps eyebrow (chapters, panel names)
// 中文 inside an English line is a PingFang HK 300 span at 0.9em (no tracking); Latin inside a
// Chinese line drops the Chinese tracking. A small zh line is never under 4.5:1 on cream.
import { h, show, C, FONT } from './dom.js';
import { prog, outSoft } from './ease.js';
import { f } from './tween.js';

/** The 72 px headline slot (composition C1): one line, cap top at y 96, x 96, zh 12 px under. */
export const HEADLINE = Object.freeze({
  preset: 'headline', x: 96, capTop: 96, w: 1728, align: 'left', valign: 'top', maxLines: 1,
  face: 'serif', size: 72, lh: 1.08, tracking: -0.012, color: C.ink,
  zhSize: 32, zhGap: 12, zhColor: C.inkMuted, zhTracking: 0.04, zhMaxLines: 1, rise: 12,
});
/** The 112 px statement. Defaults = C3 (centred on y 540, 1400 wide); C2: { ...STATEMENT, ...C2.statement }. */
export const STATEMENT = Object.freeze({
  preset: 'statement', x: 960, y: 540, w: 1400, align: 'center', valign: 'middle', maxLines: 2,
  face: 'serif', size: 112, lh: 1.04, tracking: -0.02, color: C.ink,
  zhSize: 48, zhGap: 20, zhColor: C.inkMuted, zhTracking: 0.04, zhMaxLines: 1, rise: 16,
});
/** The eyebrow: Inter 500 22 px caps +0.08em, zh 24 px after it on the same line, ink-muted. */
export const LABEL = Object.freeze({
  preset: 'label', size: 22, weight: 500, tracking: 0.08, color: C.inkMuted,
  zhSize: 24, zhWeight: 400, zhTracking: 0.04, zhColor: C.inkMuted, gap: 12, align: 'left',
});
/** The end card = the act-1 lockup geometry (lib/mark.js lockup) + the tagline slot under it. */
export const END_CARD = Object.freeze({
  cx: 960, top: 158, size: 360, en: 110, zh: 46, zhTracking: 0.3,
  tagline: Object.freeze({ gap: 60, face: 'sans', weight: 500, size: 38, zhSize: 26, zhTracking: 0.08, zhGap: 8, zhColor: C.inkMuted, maxLines: 1, w: 1400 }), // the act-1 and end taglines both read it
  push: [1.0, 1.2], // constant-speed drift about the card centre to the last frame (comment only; end.js owns it)
});
/**
 * The display number of a re-ink lift ("Total: 7 marks", the papers act): Newsreader 160,
 * lh 1, −0.02em, ink, the rolling figure in the dot's blue. One line, centred on the frame;
 * the only size above the statement. Spread it: { ...DISPLAY } or read DISPLAY.size.
 */
export const DISPLAY = Object.freeze({
  preset: 'display', face: 'serif', size: 160, lh: 1, tracking: -0.02, color: C.ink, figure: C.markBlue,
  x: 960, align: 'center', maxLines: 1, w: 1728,
});
/** Serif sizes the doctor accepts for headlines and statements (110 = the lockup wordmark). */
export const PRESET_SIZES = [HEADLINE.size, STATEMENT.size, END_CARD.en, DISPLAY.size];

const CJK = /[　-〿㐀-鿿豈-﫿＀-￯]+/gu;
const LATIN = /[A-Za-z0-9](?:[A-Za-z0-9 .\-'’&+]*[A-Za-z0-9])?/g;

/** WCAG contrast ratio of two #RRGGBB colours. */
export function contrast(a, b) {
  const lum = (hex) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
/** A zh colour that holds 4.5:1 on cream (ink-subtle #7F7973 does not: 3.6:1). */
const zhSafe = (color, size) => (/^#[0-9a-f]{6}$/i.test(color) && size < 40 && contrast(color, C.cream) < 4.5 ? C.inkMuted : color);

/**
 * Fills `el` with `text`: in an English line, CJK runs become PingFang HK 300 spans at 0.9em
 * with no tracking; in a Chinese line, Latin runs lose the Chinese tracking. The measuring
 * probe and the drawn line use the same spans, so the fit is exact.
 */
export function fillMixed(el, text, zhLine) {
  el.textContent = '';
  const str = String(text);
  let at = 0;
  for (const m of str.matchAll(zhLine ? LATIN : CJK)) {
    if (m.index > at) el.append(document.createTextNode(str.slice(at, m.index)));
    // `font` resets line-height to normal (PingFang's is tall): lineHeight 0 keeps the span
    // from growing the line box, so a line with 中文 in it sits exactly like one without.
    const sp = h('span', { text: m[0], style: zhLine ? { letterSpacing: '0' } : { font: `300 0.9em ${FONT.zh}`, lineHeight: '0', letterSpacing: '0' } }, el);
    if (!zhLine) sp.lang = 'zh-HK';
    at = m.index + m[0].length;
  }
  if (at < str.length) el.append(document.createTextNode(str.slice(at)));
}

/** px from a line box's top to the cap top of 'H' in `font` at line-height lh × size. */
function capOffset(font, size, lh) {
  const c = (capOffset.cv ??= document.createElement('canvas')).getContext('2d');
  c.font = font;
  const m = c.measureText('H');
  return (lh * size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent - m.actualBoundingBoxAscent;
}

/** Line-break tokens: Latin words stay whole, CJK breaks between characters. */
const tokens = (s, cjk) => (cjk ? s.match(/[A-Za-z0-9][A-Za-z0-9\-'’.]*|\s+|./gsu) ?? [] : s.split(/(\s+)/).filter(Boolean));
const NO_START = /^[、，。：；！？）」』·]/u;

/** Greedy wrap of `text` ("\n" = forced break) with `measure(str) → px`. */
function wrap(text, maxW, measure, cjk) {
  const out = [];
  for (const hard of String(text).split('\n')) {
    let line = '';
    for (const tok of tokens(hard, cjk)) {
      const next = line + tok;
      if (line.trim() && measure(next.trimEnd()) > maxW && !/^\s+$/.test(tok) && !NO_START.test(tok)) {
        out.push(line.trimEnd());
        line = tok.trimStart();
      } else line = next;
    }
    out.push(line.trim());
  }
  return out;
}

/**
 * A text block. Options (design px); spread a preset first: { ...HEADLINE, ...copy, ...overrides }.
 *   en, zh            the strings (either may be empty)
 *   x, y              anchor point; align 'center' | 'left' | 'right'; valign 'top' | 'middle' | 'bottom'
 *   capTop            instead of y: the first line's cap top lands here (HEADLINE: 96)
 *   w                 max line width; maxLines (en, default 2), zhMaxLines (default 1)
 *   size, face ('serif' | 'sans'), weight, tracking (em), lh, color
 *   zhSize (0.46 × size), zhWeight, zhTracking (em), zhColor, zhGap (px between)
 *   rise              px a line rises as it reveals; preset (a name the doctor reads)
 * Returns { el, fit, show(t, { at, out, stagger, dur, outDur }) }.
 */
export function block(parent, o) {
  const size0 = o.size ?? 96;
  const opt = {
    en: '', zh: '', x: 960, y: 540, align: 'center', valign: 'top', w: 1600, maxLines: 2, zhMaxLines: 1,
    face: 'serif', weight: 400, tracking: -0.01, lh: 1.12, color: C.ink,
    zhSize: Math.round(size0 * 0.46), zhWeight: 400, zhTracking: 0.04, zhColor: C.inkMuted,
    zhGap: Math.round(size0 * 0.2), rise: Math.round(size0 * 0.16), preset: null, capTop: null,
    ...o,
    size: size0,
  };
  opt.zhColor = zhSafe(opt.zhColor, opt.zhSize);
  const el = h('div', { class: 'tx', style: { position: 'absolute', width: `${opt.w}px`, textAlign: opt.align, whiteSpace: 'pre' } }, parent);
  const enFont = (k) => `${opt.weight} ${opt.size * k}px ${opt.face === 'sans' ? FONT.sans : FONT.serif}`;
  const zhFont = (k) => `${opt.zhWeight} ${opt.zhSize * k}px ${FONT.zh}`;
  const probe = h('span', { style: { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre' } }, el);
  const measurer = (font, track, zhLine) => (str) => {
    probe.style.font = font;
    probe.style.letterSpacing = `${track}em`;
    fillMixed(probe, str, zhLine);
    return probe.offsetWidth;
  };

  let k = 1, en = [], zh = [], fits = false;
  for (k = 1; k >= 0.8 - 1e-9; k = Math.round((k - 0.02) * 100) / 100) {
    const mEn = measurer(enFont(k), opt.tracking, false);
    const mZh = measurer(zhFont(k), opt.zhTracking, true);
    en = opt.en ? wrap(opt.en, opt.w, mEn, false) : [];
    zh = opt.zh ? wrap(opt.zh, opt.w, mZh, true) : [];
    fits = en.length <= opt.maxLines && zh.length <= opt.zhMaxLines &&
      en.every((l) => mEn(l) <= opt.w + 0.5) && zh.every((l) => mZh(l) <= opt.w + 0.5);
    if (fits) break;
  }
  k = Math.max(k, 0.8);
  probe.remove();

  const lines = [];
  const addLine = (text, zhLine, i) => {
    const ln = h('div', { class: `ln${zhLine ? ' zh' : ''}`, style: {
      font: zhLine ? zhFont(k) : enFont(k),
      letterSpacing: `${zhLine ? opt.zhTracking : opt.tracking}em`,
      lineHeight: zhLine ? '1.4' : String(opt.lh),
      color: zhLine ? opt.zhColor : opt.color,
      marginTop: zhLine && i === 0 && en.length ? `${f(opt.zhGap * k)}px` : '0',
      willChange: 'transform, opacity',
    } }, el);
    if (zhLine) ln.lang = 'zh-HK';
    // Wide tracking leaves a trailing space after the last character: balance it.
    const pad = zhLine && opt.zhTracking >= 0.1 && opt.align === 'center' ? `${opt.zhTracking}em` : '0';
    const sp = h('span', { class: 'i', style: { display: 'inline-block', paddingLeft: pad } }, ln);
    fillMixed(sp, text, zhLine);
    lines.push(ln);
  };
  en.forEach((l, i) => addLine(l, false, i));
  zh.forEach((l, i) => addLine(l, true, i));

  const height = el.offsetHeight;
  const left = opt.align === 'center' ? opt.x - opt.w / 2 : opt.align === 'right' ? opt.x - opt.w : opt.x;
  const top = opt.capTop != null && en.length
    ? opt.capTop - capOffset(enFont(k), opt.size * k, opt.lh)
    : opt.valign === 'middle' ? opt.y - height / 2 : opt.valign === 'bottom' ? opt.y - height : opt.y;
  el.style.left = `${f(left, 2)}px`;
  el.style.top = `${f(top, 2)}px`;
  el.fit = {
    en: opt.en, zh: opt.zh, maxWidth: opt.w, maxLines: opt.maxLines, fits, scale: k, lines: en.length + zh.length,
    rendered: [...en, ...zh], preset: opt.preset, size: opt.size, face: opt.face,
  };

  /** Reveal per line from `at` (stagger s apart, each over `dur`); fade out ending at `out`. */
  function showAt(t, { at = 0, out = null, stagger = 0.09, dur = 0.75, outDur = 0.4, ease = outSoft } = {}) {
    let all = true;
    lines.forEach((ln, i) => {
      const p = ease(prog(t, at + i * stagger, at + i * stagger + dur));
      if (p < 1) all = false;
      show(ln, p);
      ln.style.transform = p < 1 ? `translateY(${f((1 - p) * opt.rise * k, 2)}px)` : 'none';
    });
    const q = out == null ? 1 : 1 - outSoft(prog(t, out - outDur, out));
    show(el, q);
    el.style.transform = q < 1 ? `translateY(${f(-(1 - q) * opt.rise * 0.5, 2)}px)` : 'none';
    el.dataset.revealed = all && q >= 1 ? '1' : '0';
  }
  return { el, lines, fit: el.fit, height, top, left, show: showAt };
}

/**
 * An eyebrow label on one line: EN in caps (+0.08em), then zh `gap` px after it. (x, y) is the
 * baseline's left end (align 'left'), centre ('center') or right end. Empty strings draw nothing.
 * Returns { el, width, show(p) } (p 0..1: opacity, a 6 px rise).
 */
export function label(parent, o) {
  const opt = { ...LABEL, en: '', zh: '', x: 96, y: 984, ...o };
  const el = h('div', { class: 'tx', style: { position: 'absolute', whiteSpace: 'pre', lineHeight: '1' } }, parent);
  const ln = h('div', { class: 'ln' }, el);
  const sp = h('span', { class: 'i', style: { display: 'inline-block' } }, ln);
  if (opt.en) h('span', { text: opt.en.toUpperCase(), style: { font: `${opt.weight} ${opt.size}px ${FONT.sans}`, letterSpacing: `${opt.tracking}em`, color: opt.color } }, sp);
  if (opt.zh) {
    const z = h('span', { text: opt.zh, style: { font: `${opt.zhWeight} ${opt.zhSize}px ${FONT.zh}`, letterSpacing: `${opt.zhTracking}em`, color: zhSafe(opt.zhColor, opt.zhSize), marginLeft: opt.en ? `${opt.gap}px` : '0' } }, sp);
    z.lang = 'zh-HK';
  }
  const width = sp.offsetWidth, height = sp.offsetHeight;
  const left = opt.align === 'center' ? opt.x - width / 2 : opt.align === 'right' ? opt.x - width : opt.x;
  // The baseline of a line-height-1 box sits about 0.8 of its height down.
  el.style.left = `${f(left, 2)}px`;
  el.style.top = `${f(opt.y - height * 0.8, 2)}px`;
  el.fit = { en: opt.en, zh: opt.zh, maxWidth: Math.max(width, 1), maxLines: 1, fits: true, scale: 1, lines: 1, rendered: [[opt.en, opt.zh].filter(Boolean).join(' ')], preset: 'label', size: opt.size, face: 'sans' };
  const empty = !opt.en && !opt.zh;
  function showP(p) {
    const q = empty ? 0 : p;
    show(el, q);
    el.style.transform = q < 1 ? `translateY(${f((1 - q) * 6, 2)}px)` : 'none';
    el.dataset.revealed = q >= 1 ? '1' : '0';
  }
  showP(0);
  return { el, width, show: showP };
}
