// Type: a bilingual block (English, Chinese under it), fitted to its box once at setup and
// revealed line by line from t. Fonts are loaded before any scene's setup (engine.js), so
// measuring here is deterministic. The doctor reads `el.fit` and `data-revealed`
// through film.text().
import { h, show, C, FONT } from './dom.js';
import { prog, outSoft } from './ease.js';
import { f } from './tween.js';

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
 * A text block. Options (design px):
 *   en, zh            the strings (either may be empty)
 *   x, y              anchor point; align 'center' | 'left' | 'right'; valign 'top' | 'middle' | 'bottom'
 *   w                 max line width; maxLines (en, default 2), zhMaxLines (default 1)
 *   size, face ('serif' | 'sans'), weight, tracking (em), lh, color
 *   zhSize (0.5 × size), zhWeight, zhTracking (em), zhColor, zhGap (px between)
 *   rise              px a line rises as it reveals
 * Returns { el, fit, show(t, { at, out, stagger, dur, outDur }) }.
 */
export function block(parent, o) {
  const size0 = o.size ?? 96;
  const opt = {
    en: '', zh: '', x: 960, y: 540, align: 'center', valign: 'top', w: 1600, maxLines: 2, zhMaxLines: 1,
    face: 'serif', weight: 400, tracking: -0.01, lh: 1.12, color: C.ink,
    zhSize: Math.round(size0 * 0.46), zhWeight: 400, zhTracking: 0.04, zhColor: C.inkMuted,
    zhGap: Math.round(size0 * 0.2), rise: Math.round(size0 * 0.16),
    ...o,
    size: size0,
  };
  const el = h('div', { class: 'tx', style: { position: 'absolute', width: `${opt.w}px`, textAlign: opt.align, whiteSpace: 'pre' } }, parent);
  const enFont = (k) => `${opt.weight} ${opt.size * k}px ${opt.face === 'sans' ? FONT.sans : FONT.serif}`;
  const zhFont = (k) => `${opt.zhWeight} ${opt.zhSize * k}px ${FONT.zh}`;
  const probe = h('span', { style: { position: 'absolute', visibility: 'hidden', whiteSpace: 'pre' } }, el);
  const measurer = (font, track) => (str) => {
    probe.style.font = font;
    probe.style.letterSpacing = `${track}em`;
    probe.textContent = str;
    return probe.offsetWidth;
  };

  let k = 1, en = [], zh = [], fits = false;
  for (k = 1; k >= 0.8 - 1e-9; k = Math.round((k - 0.02) * 100) / 100) {
    const mEn = measurer(enFont(k), opt.tracking);
    const mZh = measurer(zhFont(k), opt.zhTracking);
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
    h('span', { class: 'i', text: text, style: { display: 'inline-block', paddingLeft: pad } }, ln);
    lines.push(ln);
  };
  en.forEach((l, i) => addLine(l, false, i));
  zh.forEach((l, i) => addLine(l, true, i));

  const height = el.offsetHeight;
  const left = opt.align === 'center' ? opt.x - opt.w / 2 : opt.align === 'right' ? opt.x - opt.w : opt.x;
  const top = opt.valign === 'middle' ? opt.y - height / 2 : opt.valign === 'bottom' ? opt.y - height : opt.y;
  el.style.left = `${f(left, 2)}px`;
  el.style.top = `${f(top, 2)}px`;
  el.fit = { en: opt.en, zh: opt.zh, maxWidth: opt.w, maxLines: opt.maxLines, fits, scale: k, lines: en.length + zh.length };

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
