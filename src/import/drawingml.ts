/**
 * DrawingML basics for drawing Word's shapes and charts as pictures (k-0498): the theme
 * (colours, line widths, fonts), colours with their modifiers, fills and outlines, and a
 * small SVG writer. Pure, so the drawing runs in tests and workers; the app turns the
 * SVG into a PNG later (`readDocx` → `prepareImage`).
 */
import { child, elements, find, type XmlElement } from './xml';

export const EMU_PER_PX = 9525;
export const EMU_PER_PT = 12700;

// ---- the theme ----

export interface Theme {
  /** dk1, lt1, dk2, lt2, accent1…6, hlink, folHlink → `rrggbb`. */
  colors: Record<string, string>;
  /** The format scheme's three line widths (EMU), for `a:lnRef idx` 1–3. */
  lineWidths: number[];
  fonts: { major: string; minor: string; majorEa: string; minorEa: string };
}

/** Word's own Office theme, for a file without one. */
export const OFFICE_THEME: Theme = {
  colors: {
    dk1: '000000', lt1: 'ffffff', dk2: '0e2841', lt2: 'e8e8e8',
    accent1: '156082', accent2: 'e97132', accent3: '196b24', accent4: '0f9ed5', accent5: 'a02b93', accent6: '4ea72e',
    hlink: '467886', folHlink: '96607d',
  },
  lineWidths: [6350, 12700, 19050],
  fonts: { major: 'Aptos Display', minor: 'Aptos', majorEa: '', minorEa: '' },
};

export function readTheme(root: XmlElement | undefined): Theme {
  if (!root) return OFFICE_THEME;
  const scheme = find(root, 'a:clrScheme');
  const colors: Record<string, string> = { ...OFFICE_THEME.colors };
  for (const c of scheme ? elements(scheme) : []) {
    const name = c.name.slice(2);
    const sys = child(c, 'a:sysClr');
    const rgb = child(c, 'a:srgbClr');
    const hex = sys?.attrs.lastClr ?? (sys?.attrs.val === 'window' ? 'ffffff' : sys ? '000000' : rgb?.attrs.val);
    if (hex && /^[0-9a-f]{6}$/i.test(hex)) colors[name] = hex.toLowerCase();
  }
  const lnList = find(root, 'a:lnStyleLst');
  const widths = lnList ? elements(lnList).map((ln) => +(ln.attrs.w ?? 0)).filter((w) => w > 0) : [];
  const font = (which: string, script: string) => find(root, which) && child(find(root, which), script)?.attrs.typeface;
  return {
    colors,
    lineWidths: widths.length >= 3 ? widths : OFFICE_THEME.lineWidths,
    fonts: {
      major: font('a:majorFont', 'a:latin') || OFFICE_THEME.fonts.major,
      minor: font('a:minorFont', 'a:latin') || OFFICE_THEME.fonts.minor,
      majorEa: font('a:majorFont', 'a:ea') || '',
      minorEa: font('a:minorFont', 'a:ea') || '',
    },
  };
}

// ---- colours ----

export interface Color {
  /** `#rrggbb`. */
  hex: string;
  /** 0–1. */
  alpha: number;
}

const PRESET: Record<string, string> = {
  black: '000000', white: 'ffffff', red: 'ff0000', green: '008000', blue: '0000ff', yellow: 'ffff00', gray: '808080', grey: '808080',
  darkGray: 'a9a9a9', lightGray: 'd3d3d3', orange: 'ffa500', purple: '800080', navy: '000080', silver: 'c0c0c0', maroon: '800000',
};
const SCHEME_ALIAS: Record<string, string> = { tx1: 'dk1', bg1: 'lt1', tx2: 'dk2', bg2: 'lt2' };
const COLOR_TAGS = new Set(['a:srgbClr', 'a:schemeClr', 'a:scrgbClr', 'a:prstClr', 'a:sysClr', 'a:hslClr']);

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function rgbToHsl([r, g, b]: number[]): number[] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb([h, s, l]: number[]): number[] {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  return [hue(h + 1 / 3), hue(h), hue(h - 1 / 3)];
}

const hexOf = (rgb: number[]) => `#${rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, '0')).join('')}`;

/** The colour element inside `el` (or `el` itself), with its modifiers applied. `placeholder` is a style reference's colour (`phClr`). */
export function colorOf(el: XmlElement | undefined, theme: Theme, placeholder?: Color): Color | undefined {
  if (!el) return undefined;
  const c = COLOR_TAGS.has(el.name) ? el : elements(el).find((e) => COLOR_TAGS.has(e.name));
  if (!c) return undefined;
  let rgb: number[];
  let alpha = 1;
  const v = c.attrs.val ?? '';
  switch (c.name) {
    case 'a:srgbClr':
      if (!/^[0-9a-f]{6}$/i.test(v)) return undefined;
      rgb = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
      break;
    case 'a:scrgbClr':
      rgb = ['r', 'g', 'b'].map((k) => toSrgb(clamp01(+(c.attrs[k] ?? 0) / 100000)));
      break;
    case 'a:prstClr':
      rgb = [0, 2, 4].map((i) => parseInt((PRESET[v] ?? '000000').slice(i, i + 2), 16) / 255);
      break;
    case 'a:sysClr': {
      const hex = c.attrs.lastClr ?? (v === 'window' ? 'ffffff' : '000000');
      rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
      break;
    }
    case 'a:hslClr':
      rgb = hslToRgb([+(c.attrs.hue ?? 0) / 21600000, +(c.attrs.sat ?? 0) / 100000, +(c.attrs.lum ?? 0) / 100000]);
      break;
    default: {
      if (v === 'phClr') {
        if (!placeholder) return undefined;
        rgb = [1, 3, 5].map((i) => parseInt(placeholder.hex.slice(i, i + 2), 16) / 255);
        alpha = placeholder.alpha;
        break;
      }
      const hex = theme.colors[SCHEME_ALIAS[v] ?? v];
      if (!hex) return undefined;
      rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    }
  }
  for (const m of elements(c)) {
    const n = +(m.attrs.val ?? 0) / 100000;
    switch (m.name) {
      case 'a:tint':
        rgb = rgb.map((x) => toSrgb(toLinear(x) * n + (1 - n)));
        break;
      case 'a:shade':
        rgb = rgb.map((x) => toSrgb(toLinear(x) * n));
        break;
      case 'a:lumMod':
      case 'a:lumOff':
      case 'a:satMod':
      case 'a:satOff':
      case 'a:hueOff': {
        const hsl = rgbToHsl(rgb);
        if (m.name === 'a:lumMod') hsl[2] = clamp01(hsl[2] * n);
        else if (m.name === 'a:lumOff') hsl[2] = clamp01(hsl[2] + n);
        else if (m.name === 'a:satMod') hsl[1] = clamp01(hsl[1] * n);
        else if (m.name === 'a:satOff') hsl[1] = clamp01(hsl[1] + n);
        else hsl[0] = (hsl[0] + +(m.attrs.val ?? 0) / 21600000 + 1) % 1;
        rgb = hslToRgb(hsl);
        break;
      }
      case 'a:alpha':
        alpha = clamp01(n);
        break;
      case 'a:gray': {
        const y = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
        rgb = [y, y, y];
        break;
      }
      case 'a:inv':
        rgb = rgb.map((x) => 1 - x);
        break;
      default:
    }
  }
  return { hex: hexOf(rgb), alpha };
}

// ---- fills and outlines ----

/** What fills an area: none, a colour, or a linear gradient (stops 0–1, angle in degrees, clockwise from →). */
export type Fill = { kind: 'none' } | { kind: 'solid'; color: Color } | { kind: 'gradient'; stops: Array<{ at: number; color: Color }>; angle: number };

/** The fill a properties element (`spPr`, a chart's `c:spPr`) says, or undefined when it says none of its own. */
export function fillOf(props: XmlElement | undefined, theme: Theme, placeholder?: Color): Fill | undefined {
  if (!props) return undefined;
  for (const f of elements(props)) {
    if (f.name === 'a:noFill') return { kind: 'none' };
    if (f.name === 'a:solidFill') {
      const color = colorOf(f, theme, placeholder);
      return color ? { kind: 'solid', color } : undefined;
    }
    if (f.name === 'a:gradFill') {
      const stops = elements(child(f, 'a:gsLst') ?? f)
        .filter((g) => g.name === 'a:gs')
        .map((g) => ({ at: +(g.attrs.pos ?? 0) / 100000, color: colorOf(g, theme, placeholder) }))
        .filter((s): s is { at: number; color: Color } => !!s.color)
        .sort((a, b) => a.at - b.at);
      if (!stops.length) return undefined;
      if (stops.length === 1) return { kind: 'solid', color: stops[0].color };
      return { kind: 'gradient', stops, angle: +(child(f, 'a:lin')?.attrs.ang ?? 0) / 60000 };
    }
    if (f.name === 'a:pattFill') {
      const color = colorOf(child(f, 'a:fgClr'), theme, placeholder);
      return color ? { kind: 'solid', color } : undefined;
    }
    if (f.name === 'a:blipFill' || f.name === 'a:grpFill') return undefined;
  }
  return undefined;
}

export type ArrowKind = 'triangle' | 'stealth' | 'arrow' | 'oval' | 'diamond';
export interface Arrow {
  kind: ArrowKind;
  /** Multiples of the line width (Word's sm/med/lg). */
  width: number;
  length: number;
}

export interface Stroke {
  color: Color;
  /** px. */
  width: number;
  /** As multiples of the width, for `stroke-dasharray`. */
  dash?: number[];
  cap: 'butt' | 'round' | 'square';
  head?: Arrow;
  tail?: Arrow;
}

const DASH: Record<string, number[]> = {
  dot: [1, 1], sysDot: [1, 1], sysDash: [3, 1], dash: [4, 3], lgDash: [8, 3], dashDot: [4, 3, 1, 3],
  lgDashDot: [8, 3, 1, 3], lgDashDotDot: [8, 3, 1, 3, 1, 3], sysDashDot: [3, 1, 1, 1], sysDashDotDot: [3, 1, 1, 1, 1, 1],
};
const ARROW_SIZE: Record<string, number> = { sm: 2, med: 3, lg: 5 };

function arrowOf(el: XmlElement | undefined): Arrow | undefined {
  const type = el?.attrs.type;
  if (!type || type === 'none') return undefined;
  const kind = (['triangle', 'stealth', 'arrow', 'oval', 'diamond'] as const).find((k) => k === type) ?? 'triangle';
  return { kind, width: ARROW_SIZE[el.attrs.w ?? 'med'] ?? 3, length: ARROW_SIZE[el.attrs.len ?? 'med'] ?? 3 };
}

/**
 * The outline: `a:ln` over the style's `a:lnRef` (theme width, its colour). Undefined
 * when nothing is drawn.
 */
export function strokeOf(ln: XmlElement | undefined, lnRef: XmlElement | undefined, theme: Theme): Stroke | undefined {
  const idx = +(lnRef?.attrs.idx ?? 0);
  const refColor = colorOf(lnRef, theme);
  const fill = fillOf(ln, theme, refColor);
  let color: Color | undefined;
  if (fill?.kind === 'none') return undefined;
  if (fill?.kind === 'solid') color = fill.color;
  else if (fill?.kind === 'gradient') color = fill.stops[0].color;
  else if (idx > 0) color = refColor;
  if (!color) return undefined;
  const w = ln?.attrs.w !== undefined ? +ln.attrs.w : idx > 0 ? theme.lineWidths[Math.min(idx, theme.lineWidths.length) - 1] ?? 12700 : 9525;
  const dashName = child(ln, 'a:prstDash')?.attrs.val;
  const dash = dashName && dashName !== 'solid' ? DASH[dashName] : undefined;
  const capAttr = ln?.attrs.cap;
  const head = arrowOf(child(ln, 'a:headEnd'));
  const tail = arrowOf(child(ln, 'a:tailEnd'));
  return {
    color,
    // Word draws a hairline (0) one pixel wide.
    width: Math.max(w / EMU_PER_PX, 0.75),
    ...(dash ? { dash } : {}),
    cap: capAttr === 'rnd' ? 'round' : capAttr === 'sq' ? 'square' : dash ? 'butt' : 'butt',
    ...(head ? { head } : {}),
    ...(tail ? { tail } : {}),
  };
}

// ---- text ----

/** Times New Roman's advance widths (thousandths of an em), ASCII 32–126. */
const SERIF = [
  250, 333, 408, 500, 500, 833, 778, 180, 333, 333, 500, 564, 250, 333, 250, 278, 500, 500, 500, 500, 500, 500, 500, 500, 500, 500, 278, 278, 564, 564, 564, 444,
  921, 722, 667, 667, 722, 611, 556, 722, 722, 333, 389, 722, 611, 889, 722, 722, 556, 722, 667, 556, 611, 722, 722, 944, 722, 722, 611, 333, 278, 333, 469, 500,
  333, 444, 500, 444, 500, 444, 333, 500, 500, 278, 278, 500, 278, 778, 500, 500, 500, 500, 333, 389, 278, 500, 500, 722, 500, 500, 444, 480, 200, 480, 541,
];

/** A rough width of `text` in px at `sizePx`, enough to wrap a label and size a legend. */
export function textWidth(text: string, sizePx: number, opts: { bold?: boolean; sans?: boolean } = {}): number {
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) units += SERIF[code - 32];
    else if (code >= 0x2e80) units += 1000;
    else units += 560;
  }
  return (units / 1000) * sizePx * (opts.sans ? 1.04 : 1) * (opts.bold ? 1.06 : 1);
}

const GENERIC: Record<string, string> = { serif: 'serif', sans: 'sans-serif' };
const SANS = /arial|calibri|helvetica|aptos|segoe|verdana|tahoma|gothic|hei|黑/i;

/** A CSS font list for a Word font name: the font, close stand-ins, a CJK face and the generic family. */
export function fontStack(name: string | undefined, ea?: string): string {
  const sans = SANS.test(name ?? '');
  const own = [name, ea].filter((f): f is string => !!f && !f.startsWith('+'));
  const stand = sans ? ['Arial', 'Helvetica', 'Liberation Sans'] : ['Times New Roman', 'Times', 'Liberation Serif'];
  const cjk = sans ? ['PingFang HK', 'Microsoft JhengHei', 'Noto Sans CJK TC'] : ['PMingLiU', 'MingLiU', 'Songti TC', 'Noto Serif CJK TC'];
  const list = [...new Set([...own, ...stand, ...cjk])].map((f) => (/^[\w-]+$/.test(f) ? f : `'${f.replace(/'/g, '')}'`));
  return [...list, GENERIC[sans ? 'sans' : 'serif']].join(', ');
}

export const isSans = (name: string | undefined) => SANS.test(name ?? '');

// ---- SVG ----

export const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A number for SVG: two decimals, no trailing zeros. */
export const num = (n: number) => {
  const r = Math.round(n * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
};

/** Collects `<defs>` (gradients) with unique ids while a picture is written. */
export class SvgDefs {
  private items: string[] = [];
  private n = 0;

  constructor(private prefix = 'g') {}

  /** The paint for a fill: a colour, or a gradient defined here. */
  paint(fill: Fill | undefined): { paint: string; opacity?: number } {
    if (!fill || fill.kind === 'none') return { paint: 'none' };
    if (fill.kind === 'solid') return { paint: fill.color.hex, ...(fill.color.alpha < 1 ? { opacity: fill.color.alpha } : {}) };
    const id = `${this.prefix}${++this.n}`;
    const rad = (fill.angle * Math.PI) / 180;
    const dx = Math.cos(rad) / 2;
    const dy = Math.sin(rad) / 2;
    const stops = fill.stops.map((s) => `<stop offset="${num(s.at)}" stop-color="${s.color.hex}"${s.color.alpha < 1 ? ` stop-opacity="${num(s.color.alpha)}"` : ''}/>`).join('');
    this.items.push(`<linearGradient id="${id}" x1="${num(0.5 - dx)}" y1="${num(0.5 - dy)}" x2="${num(0.5 + dx)}" y2="${num(0.5 + dy)}">${stops}</linearGradient>`);
    return { paint: `url(#${id})` };
  }

  toString(): string {
    return this.items.length ? `<defs>${this.items.join('')}</defs>` : '';
  }
}

/** Fill attributes for an SVG element. */
export function fillAttrs(fill: Fill | undefined, defs: SvgDefs): string {
  const { paint, opacity } = defs.paint(fill);
  return `fill="${paint}"${opacity !== undefined ? ` fill-opacity="${num(opacity)}"` : ''}`;
}

/** Stroke attributes for an SVG element; `stroke="none"` without one. */
export function strokeAttrs(stroke: Stroke | undefined): string {
  if (!stroke) return 'stroke="none"';
  const dash = stroke.dash ? ` stroke-dasharray="${stroke.dash.map((d) => num(d * stroke.width)).join(' ')}"` : '';
  return `stroke="${stroke.color.hex}"${stroke.color.alpha < 1 ? ` stroke-opacity="${num(stroke.color.alpha)}"` : ''} stroke-width="${num(stroke.width)}" stroke-linecap="${stroke.cap}" stroke-linejoin="round"${dash}`;
}

/**
 * The finished picture: `width`×`height` px on the page, drawn `scale` times larger so it
 * stays sharp once rasterised. No ground, as in Word: the transparency also keeps the
 * app's downsizer on PNG (an opaque picture may be stored as JPEG, which blurs line art).
 */
export function svgDocument(width: number, height: number, body: string, defs: SvgDefs, scale = 3): string {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(w * scale)}" height="${Math.round(h * scale)}" viewBox="0 0 ${num(w)} ${num(h)}">${defs}${body}</svg>`;
}

/** An SVG as a `data:` URL (base64, so non-ASCII labels survive). */
export function svgDataUrl(svg: string): string {
  const bytes = new TextEncoder().encode(svg);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/svg+xml;base64,${btoa(binary)}`;
}
