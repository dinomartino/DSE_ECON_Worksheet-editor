// Typography on the DOM overlay (1920×1080 design px). Styles are pure functions of t:
// build once in setup, then call set(t, t0, t1) every frame. Spec: FILM.md §4 Typography.
import { clamp, expoOut, quintIn } from './ease.js';

export const FONT_EN = '-apple-system, "SF Pro Display", system-ui, sans-serif';
export const FONT_TEXT = '-apple-system, "SF Pro Text", system-ui, sans-serif';
export const FONT_ZH = '"PingFang HK", "PingFang TC", -apple-system, sans-serif';

export const INK = {
  night: { ink: '#F5F5F7', secondary: '#86868B', accent: '#1E7FD4' },
  day: { ink: '#1D1D1F', secondary: '#6E6E73', accent: '#0D77C9' },
};
INK.mixed = INK.night;

export const REVEAL = { dur: 0.72, stagger: 0.06, rise: 0.35, blur: 10 };
export const EXIT = { dur: 0.28, rise: 0.12, blur: 8 };
export const GRADIENT = 'linear-gradient(100deg, #1E7FD4, #6CC4FF)';

const PRESETS = {
  headline: { size: 116, weight: 600, tracking: -0.035, font: FONT_EN, tone: 'ink', lh: 1.04 },
  sub: { size: 38, weight: 500, tracking: -0.01, font: FONT_EN, tone: 'secondary', lh: 1.2 },
  eyebrow: { size: 24, weight: 600, tracking: 0, font: FONT_TEXT, tone: 'accent', lh: 1.2 },
  small: { size: 30, weight: 500, tracking: -0.005, font: FONT_EN, tone: 'secondary', lh: 1.25 },
};

let styled = false;
function injectStyle() {
  if (styled) return;
  styled = true;
  const s = document.createElement('style');
  s.textContent = `
.tx{position:absolute;white-space:nowrap;-webkit-font-smoothing:antialiased;font-kerning:normal;
  font-optical-sizing:auto;text-rendering:geometricPrecision}
.tx .ln{display:block}
.tx .w{display:inline-block;overflow:hidden;vertical-align:top;
  padding:0.3em 0.28em 0.14em;margin:-0.3em -0.28em -0.14em}
.tx .i{display:inline-block;will-change:auto}
.tx .g{background:${GRADIENT};-webkit-background-clip:text;background-clip:text;color:transparent}`;
  document.head.appendChild(s);
}

/** Splits Chinese text into phrases that reveal as words (break after punctuation). */
export function zhWords(text) {
  return text.match(/[^，。、：；！？,.]+[，。、：；！？,.]*/g) ?? [text];
}

/**
 * One block of text: an English line (or lines, `\n`) and an optional Chinese line under
 * it. `x, y` place the block in design px; `align` is left|center|right and `valign`
 * top|middle|bottom of the whole block. `gradient` is the index of an EN word to fill with
 * the accent gradient (FILM.md allows it twice in the film).
 */
export function text(parent, spec) {
  injectStyle();
  const p = { ...PRESETS[spec.kind ?? 'headline'], ...spec };
  const tones = INK[p.world ?? 'night'];
  const color = p.color ?? tones[p.tone];
  const root = document.createElement('div');
  root.className = 'tx';
  const ax = { left: '0%', center: '-50%', right: '-100%' }[p.align ?? 'center'];
  const ay = { top: '0%', middle: '-50%', bottom: '-100%' }[p.valign ?? 'middle'];
  Object.assign(root.style, {
    left: `${p.x ?? 960}px`,
    top: `${p.y ?? 540}px`,
    transform: `translate(${ax}, ${ay})`,
    textAlign: p.align ?? 'center',
  });

  const words = [];
  const addLine = (str, style, isZh) => {
    const line = document.createElement('div');
    line.className = 'ln';
    Object.assign(line.style, style);
    const parts = isZh ? zhWords(str) : str.split(' ');
    parts.forEach((w, i) => {
      const outer = document.createElement('span');
      outer.className = 'w';
      const inner = document.createElement('span');
      inner.className = 'i';
      if (!isZh && p.gradient === words.length) inner.classList.add('g');
      inner.textContent = w;
      outer.appendChild(inner);
      line.appendChild(outer);
      if (!isZh && i < parts.length - 1) line.appendChild(document.createTextNode(' '));
      words.push({ el: inner, zh: isZh, index: words.length });
    });
    root.appendChild(line);
    return line;
  };

  const enStyle = {
    font: `${p.weight} ${p.size}px/${p.lh} ${p.font}`,
    letterSpacing: `${p.tracking}em`,
    color,
  };
  for (const line of String(p.en ?? '').split('\n')) if (line) addLine(line, enStyle, false);
  const enCount = words.length;
  if (p.zh) {
    const zhSize = p.zhSize ?? Math.round(p.size * (p.kind === 'headline' || !p.kind ? 0.42 : 0.9));
    addLine(p.zh, {
      font: `${p.zhWeight ?? 500} ${zhSize}px/1.3 ${FONT_ZH}`,
      letterSpacing: '0.02em',
      color: p.zhColor ?? color,
      opacity: p.zhOpacity ?? (p.kind === 'headline' || !p.kind ? 0.7 : 1),
      marginTop: `${p.zhGap ?? Math.round(zhSize * 0.55)}px`,
    }, true);
  }
  parent.appendChild(root);

  const zhDelay = p.zhDelay ?? 0.12 + enCount * REVEAL.stagger;
  const stagger = p.stagger ?? REVEAL.stagger;
  const rise = p.rise ?? REVEAL.rise;
  const dur = p.dur ?? REVEAL.dur;

  const base = `translate(${ax}, ${ay})`;
  return {
    el: root,
    words,
    /** Moves the block (design px) and scales it about its centre. */
    place({ x, y, scale = 1 } = {}) {
      if (x != null) root.style.left = `${x}px`;
      if (y != null) root.style.top = `${y}px`;
      root.style.transform = scale === 1 ? base : `${base} scale(${scale.toFixed(5)})`;
    },
    /** Reveal from t0, exit from t1 (defaults: never). Returns the block's max opacity. */
    set(t, t0, t1 = Infinity) {
      let any = 0;
      for (const w of words) {
        const start = w.zh ? t0 + zhDelay + (w.index - enCount) * stagger * 0.8 : t0 + w.index * stagger;
        const r = expoOut(clamp((t - start) / dur));
        const e = quintIn(clamp((t - t1) / EXIT.dur));
        const op = r * (1 - e);
        const y = rise * (1 - r) - EXIT.rise * e;
        const blur = REVEAL.blur * (1 - r) + EXIT.blur * e;
        applyWord(w.el, op, y, blur);
        any = Math.max(any, op);
      }
      root.style.visibility = any > 0.001 ? 'visible' : 'hidden';
      return any;
    },
    /** Direct control: every word at reveal progress r (0..1) and exit progress e. */
    pose(r, e = 0) {
      for (const w of words) applyWord(w.el, r * (1 - e), REVEAL.rise * (1 - r) - EXIT.rise * e, REVEAL.blur * (1 - r) + EXIT.blur * e);
      root.style.visibility = r * (1 - e) > 0.001 ? 'visible' : 'hidden';
    },
  };
}

function applyWord(el, opacity, riseEm, blur) {
  const s = el.style;
  s.opacity = opacity < 0.001 ? '0' : opacity > 0.999 ? '1' : opacity.toFixed(4);
  s.transform = Math.abs(riseEm) < 1e-4 ? 'none' : `translate3d(0, ${riseEm.toFixed(4)}em, 0)`;
  s.filter = blur < 0.05 ? 'none' : `blur(${blur.toFixed(3)}px)`;
}

export const headline = (parent, spec) => text(parent, { kind: 'headline', ...spec });
export const sub = (parent, spec) => text(parent, { kind: 'sub', ...spec });
export const eyebrow = (parent, spec) => text(parent, { kind: 'eyebrow', ...spec });
export const small = (parent, spec) => text(parent, { kind: 'small', ...spec });

/** Minimum time a block of `words` words should hold on screen (§4: 1.0 s + 0.3 s/word). */
export const readTime = (words) => 1.0 + 0.3 * words;
