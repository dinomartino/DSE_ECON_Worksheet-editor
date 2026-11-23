/**
 * Draws a Word chart (`word/charts/chartN.xml`) as an SVG picture, offline (k-0498).
 * It reads the chart's cached numbers and styles, never the embedded workbook.
 *
 * Drawn: pie and doughnut charts (slice colours, outlines, data labels with manual
 * offsets, legend); clustered, stacked and percent-stacked column and bar charts; line
 * charts with markers. Each has the title, legend, axes with titles, gridlines and data
 * labels the chart asks for, and the plot rectangle from its manual layout when it has one.
 *
 * Returns `null` when the chart cannot be drawn faithfully: 3-D, radar, bubble, stock,
 * surface, scatter, area and of-pie charts, a plot area with more than one chart type, a
 * stacked line chart, a series with no cached values, `cx:` chartex parts, or any error.
 * It never throws.
 */
import {
  colorOf, escXml, fillAttrs, fillOf, fontStack, num, strokeAttrs, strokeOf, SvgDefs, svgDocument, textWidth, isSans,
  type Fill, type Stroke, type Theme,
} from './drawingml';
import { child, childrenNamed, find, textOf, type XmlElement } from './xml';

const PX_PER_PT = 96 / 72;
const GRAY = '#595959';
const GRID = '#d9d9d9';
const AXIS = '#bfbfbf';

type Rect = { x: number; y: number; w: number; h: number };
type Anchor = 'start' | 'middle' | 'end';

interface TextStyle {
  /** px. */
  size: number;
  bold: boolean;
  color: string;
  font: string;
}

interface Ctx {
  theme: Theme;
  defs: SvgDefs;
  W: number;
  H: number;
  /** Chart-wide text: 10 pt, the chart's own colour or black. */
  base: TextStyle;
  /** Colour for axes, titles and legends: the chart's own colour or Word's soft gray. */
  soft: string;
}

interface LegendEntry {
  label: string;
  fill?: Fill;
  stroke?: Stroke;
  /** A line sample with an optional marker, for line charts. */
  line?: boolean;
  marker?: string;
}

interface Model {
  legend: LegendEntry[];
  /** `free` is the room left after the title and legend; `manual` is the chart's own plot rectangle. */
  draw(free: Rect, manual: { rect: Rect; inner: boolean } | undefined): string;
}

// ---- small readers ----

const val = (el: XmlElement | undefined): string | undefined => el?.attrs.val;
const flag = (el: XmlElement | undefined, dflt: boolean): boolean => (el ? !/^(0|false)$/i.test(el.attrs.val ?? '1') : dflt);
const numVal = (el: XmlElement | undefined, dflt: number): number => {
  const n = parseFloat(el?.attrs.val ?? '');
  return Number.isFinite(n) ? n : dflt;
};
const optNum = (el: XmlElement | undefined): number | undefined => {
  const n = parseFloat(el?.attrs.val ?? '');
  return Number.isFinite(n) ? n : undefined;
};

const solid = (hex: string): Fill => ({ kind: 'solid', color: { hex, alpha: 1 } });

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * f).toString(16).padStart(2, '0');
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

/** The theme accent for the i-th series or point; after six it cycles, a little darker each time. */
function accent(theme: Theme, i: number): string {
  const hex = `#${theme.colors[`accent${(i % 6) + 1}`] ?? '156082'}`;
  const round = Math.floor(i / 6);
  return round ? shade(hex, 0.75 ** round) : hex;
}

/** `a:ln` over a default: undefined for no line, the default for a line with no colour of its own. */
function lineStroke(ln: XmlElement | undefined, dflt: Stroke | undefined, theme: Theme): Stroke | undefined {
  if (!ln) return dflt;
  if (fillOf(ln, theme)?.kind === 'none') return undefined;
  const own = strokeOf(ln, undefined, theme);
  if (own) return own;
  if (!dflt) return undefined;
  return ln.attrs.w ? { ...dflt, width: Math.max(0.75, +ln.attrs.w / 9525) } : dflt;
}

function styleFrom(base: TextStyle, rpr: XmlElement | undefined, theme: Theme): TextStyle {
  if (!rpr) return base;
  const sz = parseFloat(rpr.attrs.sz ?? '');
  const color = colorOf(child(rpr, 'a:solidFill'), theme)?.hex;
  const latin = child(rpr, 'a:latin')?.attrs.typeface;
  const ea = child(rpr, 'a:ea')?.attrs.typeface;
  let font = base.font;
  if (latin) {
    const name = latin === '+mn-lt' ? theme.fonts.minor : latin === '+mj-lt' ? theme.fonts.major : latin;
    font = fontStack(name, ea && !ea.startsWith('+') ? ea : theme.fonts.minorEa);
  }
  return {
    size: Number.isFinite(sz) && sz > 0 ? (sz / 100) * PX_PER_PT : base.size,
    bold: rpr.attrs.b !== undefined ? /^(1|true)$/i.test(rpr.attrs.b) : base.bold,
    color: color ?? base.color,
    font,
  };
}

const txStyle = (base: TextStyle, txPr: XmlElement | undefined, theme: Theme): TextStyle => styleFrom(base, txPr ? find(txPr, 'a:defRPr') : undefined, theme);

// ---- cached data ----

interface Cache {
  pts: Array<string | undefined>;
  format?: string;
}

function readCache(ref: XmlElement | undefined): Cache | undefined {
  if (!ref) return undefined;
  const holder = child(ref, 'c:numRef') ?? child(ref, 'c:strRef') ?? child(ref, 'c:multiLvlStrRef') ?? child(ref, 'c:numLit') ?? child(ref, 'c:strLit');
  if (!holder) return undefined;
  let cache: XmlElement | undefined = holder.name.endsWith('Lit') ? holder : child(holder, 'c:numCache') ?? child(holder, 'c:strCache') ?? child(holder, 'c:multiLvlStrCache');
  if (cache?.name === 'c:multiLvlStrCache') cache = child(cache, 'c:lvl');
  if (!cache) return undefined;
  const pts: Array<string | undefined> = [];
  for (const p of childrenNamed(cache, 'c:pt')) {
    const idx = parseInt(p.attrs.idx ?? '', 10);
    const v = child(p, 'c:v');
    if (Number.isInteger(idx) && idx >= 0 && idx < 10000 && v) pts[idx] = textOf(v);
  }
  const count = Math.min(10000, Math.max(parseInt(child(cache, 'c:ptCount')?.attrs.val ?? '0', 10) || 0, pts.length));
  const format = child(cache, 'c:formatCode');
  return { pts: Array.from({ length: count }, (_, i) => pts[i]), format: format ? textOf(format) : undefined };
}

interface Series {
  el: XmlElement;
  name: string;
  cats: string[];
  vals: Array<number | null>;
  format?: string;
}

function readSeries(ser: XmlElement, i: number): Series | undefined {
  const valCache = readCache(child(ser, 'c:val'));
  if (!valCache) return undefined;
  const vals = valCache.pts.map((p) => {
    const n = p === undefined ? NaN : parseFloat(p);
    return Number.isFinite(n) ? n : null;
  });
  if (!vals.some((v) => v !== null)) return undefined;
  const catCache = readCache(child(ser, 'c:cat'));
  const n = Math.max(vals.length, catCache?.pts.length ?? 0);
  const cats = Array.from({ length: n }, (_, k) => catCache?.pts[k] ?? (catCache ? '' : String(k + 1)));
  const tx = child(ser, 'c:tx');
  const txCache = readCache(tx);
  const direct = child(tx, 'c:v');
  const name = (txCache?.pts[0] ?? (direct ? textOf(direct) : '')).trim() || `Series ${i + 1}`;
  return { el: ser, name, cats, vals, format: valCache.format };
}

// ---- numbers ----

/** A number in a simple Excel format: General, 0, 0.0, 0%, #,##0, with a literal prefix or suffix such as "$". */
export function formatNumber(v: number, code?: string): string {
  const plain = () => String(+v.toPrecision(10));
  if (!code) return plain();
  let sec = code.split(';')[0].replace(/\[\$([^\]-]*)[^\]]*\]/g, '$1').replace(/\[[^\]]*\]/g, '');
  if (/^general$/i.test(sec.trim())) return plain();
  sec = sec.replace(/_./g, '').replace(/\*./g, '');
  const m = /[#0?][#0?,]*(?:\.[#0?]*)?/.exec(sec);
  if (!m) return plain();
  const clean = (s: string) => s.replace(/["\\]/g, '');
  const prefix = clean(sec.slice(0, m.index));
  const suffix = clean(sec.slice(m.index + m[0].length));
  const dot = m[0].indexOf('.');
  const decimals = dot < 0 ? 0 : m[0].length - dot - 1;
  const percent = sec.includes('%');
  const x = percent ? v * 100 : v;
  let body = Math.abs(x).toFixed(Math.min(decimals, 10));
  if (m[0].includes(',')) {
    const [whole, frac] = body.split('.');
    body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (frac !== undefined ? `.${frac}` : '');
  }
  const sign = x < 0 && +body !== 0 ? '-' : '';
  return `${sign}${prefix}${body}${suffix}`;
}

function niceStep(raw: number): number {
  if (!(raw > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(raw));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

interface Scale {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

function makeScale(lo: number, hi: number, axis: XmlElement | undefined, target: number): Scale {
  const scaling = child(axis, 'c:scaling');
  const fMin = optNum(child(scaling, 'c:min'));
  const fMax = optNum(child(scaling, 'c:max'));
  let min = fMin ?? Math.min(lo, 0);
  let max = fMax ?? Math.max(hi, 0);
  if (!(max > min)) max = min + 1;
  let step = optNum(child(axis, 'c:majorUnit')) ?? niceStep((max - min) / target);
  if (!(step > 0) || (max - min) / step > 200) step = niceStep((max - min) / target);
  if (fMin === undefined) min = Math.floor(min / step + 1e-9) * step;
  if (fMax === undefined) max = Math.ceil(max / step - 1e-9) * step;
  if (!(max > min)) max = min + step;
  const ticks: number[] = [];
  for (let i = 0; i <= 400; i++) {
    const t = +(min + i * step).toPrecision(12);
    if (t > max + step * 1e-6) break;
    ticks.push(t);
  }
  return { min, max, step, ticks };
}

// ---- text ----

function textEl(lines: string[], x: number, y: number, st: TextStyle, anchor: Anchor = 'middle', rotate = 0): string {
  const lh = st.size * 1.2;
  const y0 = y - ((lines.length - 1) * lh) / 2 + st.size * 0.35;
  const head = `<text font-family="${escXml(st.font)}" font-size="${num(st.size)}"${st.bold ? ' font-weight="bold"' : ''} fill="${st.color}" text-anchor="${anchor}"`;
  const rot = rotate ? ` transform="rotate(${num(rotate)} ${num(x)} ${num(y)})"` : '';
  if (lines.length === 1) return `${head}${rot} x="${num(x)}" y="${num(y0)}">${escXml(lines[0])}</text>`;
  return `${head}${rot}>${lines.map((l, i) => `<tspan x="${num(x)}" y="${num(y0 + i * lh)}">${escXml(l)}</tspan>`).join('')}</text>`;
}

/** Lines of a title's rich text, and its style. */
function richText(holder: XmlElement | undefined, base: TextStyle, theme: Theme): { lines: string[]; style: TextStyle } | undefined {
  const rich = holder ? find(holder, 'c:rich') : undefined;
  if (!rich) return undefined;
  const lines: string[] = [];
  let style = base;
  let first = true;
  for (const p of childrenNamed(rich, 'a:p')) {
    let text = '';
    for (const c of p.children) {
      if (typeof c === 'string') continue;
      if (c.name === 'a:br') text += '\n';
      else if (c.name === 'a:r' || c.name === 'a:fld') {
        const t = child(c, 'a:t');
        if (t) text += textOf(t);
        if (first && c.name === 'a:r') {
          style = styleFrom(styleFrom(base, find(child(p, 'a:pPr') ?? p, 'a:defRPr'), theme), child(c, 'a:rPr'), theme);
          first = false;
        }
      }
    }
    lines.push(...text.split('\n'));
  }
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  if (!lines.some((l) => l.trim())) return undefined;
  if (first) style = styleFrom(base, find(rich, 'a:defRPr'), theme);
  return { lines, style };
}

function wrap(text: string, maxW: number, st: TextStyle): string[] {
  const spaced = text.includes(' ');
  const units = spaced ? text.split(' ') : [...text];
  const join = spaced ? ' ' : '';
  const out: string[] = [];
  let cur = '';
  for (const u of units) {
    const next = cur ? cur + join + u : u;
    if (cur && textWidth(next, st.size, { sans: isSans(st.font), bold: st.bold }) > maxW) {
      out.push(cur);
      cur = u;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out.length ? out : [''];
}

const tw = (text: string, st: TextStyle) => textWidth(text, st.size, { sans: isSans(st.font), bold: st.bold });

// ---- data labels ----

interface LabelSpec {
  showVal: boolean;
  showPct: boolean;
  showCat: boolean;
  showSer: boolean;
  sep?: string;
  pos?: string;
  format?: string;
  linked: boolean;
  style: TextStyle;
  dx: number;
  dy: number;
  custom?: string[];
}

function labelSpec(ser: XmlElement, group: XmlElement, idx: number, ctx: Ctx): LabelSpec | undefined {
  const lbls = child(ser, 'c:dLbls') ?? child(group, 'c:dLbls');
  if (!lbls) return undefined;
  const point = childrenNamed(lbls, 'c:dLbl').find((d) => parseInt(val(child(d, 'c:idx')) ?? '', 10) === idx);
  if (flag(child(point, 'c:delete'), false) || (!point && flag(child(lbls, 'c:delete'), false))) return undefined;
  const pick = (name: string) => child(point, name) ?? child(lbls, name);
  const on = (name: string) => flag(pick(name), false);
  const spec: LabelSpec = {
    showVal: on('c:showVal'),
    showPct: on('c:showPercent'),
    showCat: on('c:showCatName'),
    showSer: on('c:showSerName'),
    sep: pick('c:separator') ? textOf(pick('c:separator')!) : undefined,
    pos: val(pick('c:dLblPos')),
    format: pick('c:numFmt')?.attrs.formatCode,
    linked: pick('c:numFmt')?.attrs.sourceLinked === '1',
    style: txStyle(ctx.base, child(point, 'c:txPr') ?? child(lbls, 'c:txPr'), ctx.theme),
    dx: 0,
    dy: 0,
  };
  const ml = child(child(point, 'c:layout'), 'c:manualLayout');
  if (ml) {
    spec.dx = numVal(child(ml, 'c:x'), 0) * ctx.W;
    spec.dy = numVal(child(ml, 'c:y'), 0) * ctx.H;
  }
  const rich = child(point, 'c:tx');
  const custom = rich ? richText(rich, spec.style, ctx.theme) : undefined;
  if (custom) spec.custom = custom.lines;
  if (!spec.custom && !spec.showVal && !spec.showPct && !spec.showCat && !spec.showSer) return undefined;
  return spec;
}

function labelLines(spec: LabelSpec, s: { ser: string; cat: string; v: number | null; pct?: number; format?: string }): string[] {
  if (spec.custom) return spec.custom;
  const parts: string[] = [];
  if (spec.showSer) parts.push(s.ser);
  if (spec.showCat) parts.push(s.cat);
  if (spec.showVal && s.v !== null) {
    const code = spec.format && !spec.linked ? spec.format : s.format;
    parts.push(formatNumber(s.v, code));
  }
  if (spec.showPct && s.pct !== undefined) {
    const code = spec.format?.includes('%') ? spec.format : '0%';
    parts.push(formatNumber(s.pct, code));
  }
  if (!parts.length) return [];
  if (spec.sep === undefined || spec.sep === '\n') return parts;
  return [parts.join(spec.sep)];
}

// ---- pie and doughnut ----

function pieModel(ctx: Ctx, group: XmlElement, doughnut: boolean): Model | undefined {
  const sers = childrenNamed(group, 'c:ser');
  if (!sers.length || (doughnut && sers.length > 1)) return undefined;
  const series = readSeries(sers[0], 0);
  if (!series) return undefined;
  const { theme, defs } = ctx;
  const n = series.vals.length;
  const values = series.vals.map((v) => (v !== null && v > 0 ? v : 0));
  const total = values.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return undefined;
  const vary = flag(child(group, 'c:varyColors'), true);
  const dPts = new Map<number, XmlElement>();
  for (const d of childrenNamed(series.el, 'c:dPt')) dPts.set(parseInt(val(child(d, 'c:idx')) ?? '-1', 10), d);
  const white: Stroke = { color: { hex: '#ffffff', alpha: 1 }, width: 1.5, cap: 'butt' };
  const fills: Array<Fill | undefined> = [];
  const strokes: Array<Stroke | undefined> = [];
  for (let i = 0; i < n; i++) {
    const dPtSp = child(dPts.get(i), 'c:spPr');
    const serSp = child(series.el, 'c:spPr');
    fills.push(fillOf(dPtSp, theme) ?? fillOf(serSp, theme) ?? solid(accent(theme, vary ? i : 0)));
    const ln = child(dPtSp, 'a:ln') ?? child(serSp, 'a:ln');
    strokes.push(lineStroke(ln, white, theme));
  }
  const hole = Math.min(0.9, Math.max(0.1, numVal(child(group, 'c:holeSize'), 50) / 100));
  const first = numVal(child(group, 'c:firstSliceAng'), 0);
  const specs = series.vals.map((_, i) => labelSpec(series.el, group, i, ctx));
  const sumIdx = (i: number) => values.slice(0, i).reduce((a, b) => a + b, 0);
  const placeOf = (i: number, spec: LabelSpec): 'in' | 'ctr' | 'out' => {
    const p = spec.pos;
    if (doughnut) return 'ctr';
    if (p === 'outEnd') return 'out';
    if (p === 'ctr') return 'ctr';
    if (p === 'inEnd') return 'in';
    return values[i] / total >= 0.1 ? 'in' : 'out';
  };
  return {
    legend: series.cats.slice(0, n).map((label, i) => ({ label, fill: fills[i] })),
    draw(free, manual) {
      // Room outside the pie only for labels set outside; Word keeps the pie large for best-fit ones.
      const hasOut = specs.some((s, i) => s && values[i] > 0 && s.pos === 'outEnd');
      const box = manual?.rect ?? free;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      const pad = manual ? 0 : 6 + (hasOut ? Math.min(box.w, box.h) * 0.14 : 0);
      const r = Math.max(10, Math.min(box.w, box.h) / 2 - pad);
      const ri = doughnut ? r * hole : 0;
      const at = (rad: number, a: number) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
      let out = '';
      const labels: string[] = [];
      for (let i = 0; i < n; i++) {
        if (values[i] <= 0) continue;
        const a0 = ((first + (sumIdx(i) / total) * 360) * Math.PI) / 180;
        const sweep = (values[i] / total) * 2 * Math.PI;
        const a1 = a0 + sweep;
        const large = sweep > Math.PI ? 1 : 0;
        const P = (p: number[]) => `${num(p[0])} ${num(p[1])}`;
        let d: string;
        if (sweep >= 2 * Math.PI - 1e-6) {
          const ring = (rad: number, flip: boolean) =>
            `M ${num(cx)} ${num(cy - rad)} A ${num(rad)} ${num(rad)} 0 1 ${flip ? 0 : 1} ${num(cx)} ${num(cy + rad)} A ${num(rad)} ${num(rad)} 0 1 ${flip ? 0 : 1} ${num(cx)} ${num(cy - rad)} Z`;
          d = doughnut ? `${ring(r, false)} ${ring(ri, true)}` : ring(r, false);
        } else if (doughnut) {
          d = `M ${P(at(r, a0))} A ${num(r)} ${num(r)} 0 ${large} 1 ${P(at(r, a1))} L ${P(at(ri, a1))} A ${num(ri)} ${num(ri)} 0 ${large} 0 ${P(at(ri, a0))} Z`;
        } else {
          d = `M ${num(cx)} ${num(cy)} L ${P(at(r, a0))} A ${num(r)} ${num(r)} 0 ${large} 1 ${P(at(r, a1))} Z`;
        }
        out += `<path class="slice" d="${d}" fill-rule="evenodd" ${fillAttrs(fills[i], defs)} ${strokeAttrs(strokes[i])}/>`;
        const spec = specs[i];
        if (!spec) continue;
        const lines = labelLines(spec, { ser: series.name, cat: series.cats[i] ?? '', v: series.vals[i], pct: values[i] / total, format: series.format });
        if (!lines.length) continue;
        const mid = (a0 + a1) / 2;
        const where = placeOf(i, spec);
        const rad = where === 'out' ? r * 1.12 : doughnut ? (r + ri) / 2 : where === 'ctr' ? r * 0.5 : r * (spec.pos === undefined ? 0.65 : 0.7);
        const [px, py] = at(rad, mid);
        let anchor: Anchor = 'middle';
        let ly = py;
        if (where === 'out') {
          const s = Math.sin(mid);
          anchor = s > 0.3 ? 'start' : s < -0.3 ? 'end' : 'middle';
          ly = py - Math.cos(mid) * spec.style.size * 0.6;
        }
        labels.push(textEl(lines, px + spec.dx, ly + spec.dy, spec.style, anchor));
      }
      return out + labels.join('');
    },
  };
}

// ---- bar and line ----

interface Geo extends Rect {
  horizontal: boolean;
  n: number;
  min: number;
  max: number;
  catRev: boolean;
  valRev: boolean;
}

const catLen = (g: Geo) => (g.horizontal ? g.h : g.w);
const valFrac = (g: Geo, v: number) => (v - g.min) / (g.max - g.min);

/** The pixel point `off` along the category axis (from its start) and `f` of the way along the value axis. */
function pt(g: Geo, off: number, f: number): [number, number] {
  const o = g.catRev ? catLen(g) - off : off;
  const q = g.valRev ? 1 - f : f;
  return g.horizontal ? [g.x + q * g.w, g.y + g.h - o] : [g.x + o, g.y + g.h - q * g.h];
}

const MARKERS = new Set(['circle', 'square', 'diamond', 'triangle', 'x', 'plus', 'star', 'dash', 'dot']);

function markerSvg(symbol: string, x: number, y: number, size: number, fill: string, stroke: string, width: number): string {
  const h = size / 2;
  const f = `fill="${fill}" stroke="${stroke}" stroke-width="${num(width)}"`;
  switch (symbol) {
    case 'square':
      return `<rect class="marker" x="${num(x - h)}" y="${num(y - h)}" width="${num(size)}" height="${num(size)}" ${f}/>`;
    case 'diamond':
      return `<polygon class="marker" points="${num(x)},${num(y - h * 1.2)} ${num(x + h * 1.2)},${num(y)} ${num(x)},${num(y + h * 1.2)} ${num(x - h * 1.2)},${num(y)}" ${f}/>`;
    case 'triangle':
      return `<polygon class="marker" points="${num(x)},${num(y - h * 1.1)} ${num(x + h * 1.1)},${num(y + h)} ${num(x - h * 1.1)},${num(y + h)}" ${f}/>`;
    case 'x':
      return `<path class="marker" d="M ${num(x - h)} ${num(y - h)} L ${num(x + h)} ${num(y + h)} M ${num(x + h)} ${num(y - h)} L ${num(x - h)} ${num(y + h)}" fill="none" stroke="${stroke}" stroke-width="${num(width)}"/>`;
    case 'plus':
      return `<path class="marker" d="M ${num(x - h)} ${num(y)} L ${num(x + h)} ${num(y)} M ${num(x)} ${num(y - h)} L ${num(x)} ${num(y + h)}" fill="none" stroke="${stroke}" stroke-width="${num(width)}"/>`;
    case 'dash':
      return `<rect class="marker" x="${num(x - h)}" y="${num(y - h / 3)}" width="${num(size)}" height="${num((size * 2) / 3)}" ${f}/>`;
    default:
      return `<circle class="marker" cx="${num(x)}" cy="${num(y)}" r="${num(symbol === 'dot' ? h * 0.6 : h)}" ${f}/>`;
  }
}

interface Axes {
  cat?: XmlElement;
  val: XmlElement;
}

function cartesianModel(ctx: Ctx, group: XmlElement, plotArea: XmlElement, kind: 'bar' | 'line'): Model | undefined {
  const { theme, defs } = ctx;
  const valAxis = child(plotArea, 'c:valAx');
  if (!valAxis) return undefined;
  const axes: Axes = { cat: child(plotArea, 'c:catAx') ?? child(plotArea, 'c:dateAx'), val: valAxis };
  const series: Series[] = [];
  for (const [i, el] of childrenNamed(group, 'c:ser').entries()) {
    const s = readSeries(el, i);
    if (!s) return undefined;
    series.push(s);
  }
  if (!series.length) return undefined;
  const grouping = val(child(group, 'c:grouping')) ?? (kind === 'bar' ? 'clustered' : 'standard');
  if (kind === 'line' && grouping !== 'standard') return undefined;
  if (kind === 'bar' && !['clustered', 'stacked', 'percentStacked', 'standard'].includes(grouping)) return undefined;
  const horizontal = kind === 'bar' && val(child(group, 'c:barDir')) === 'bar';
  const stacked = kind === 'bar' && (grouping === 'stacked' || grouping === 'percentStacked');
  const percent = grouping === 'percentStacked';
  const n = Math.max(...series.map((s) => s.vals.length), series[0].cats.length);
  const m = series.length;
  const cats = Array.from({ length: n }, (_, i) => series[0].cats[i] ?? String(i + 1));
  const varied = kind === 'bar' && m === 1 && flag(child(group, 'c:varyColors'), false) && !fillOf(child(series[0].el, 'c:spPr'), theme);

  // Stacked runs: [base, end] per series and category, in value units (fractions when percent).
  const runs: Array<Array<[number, number] | null>> = series.map(() => Array.from({ length: n }, () => null));
  let lo = 0;
  let hi = 0;
  let any = false;
  for (let i = 0; i < n; i++) {
    let pos = 0;
    let neg = 0;
    const sum = percent ? series.reduce((a, s) => a + Math.abs(s.vals[i] ?? 0), 0) : 1;
    for (let si = 0; si < m; si++) {
      const raw = series[si].vals[i] ?? null;
      if (raw === null) continue;
      const v = percent ? (sum ? raw / sum : 0) : raw;
      let run: [number, number];
      if (stacked) {
        run = v >= 0 ? [pos, pos + v] : [neg, neg + v];
        if (v >= 0) pos += v;
        else neg += v;
      } else run = [0, v];
      runs[si][i] = run;
      lo = Math.min(lo, run[0], run[1]);
      hi = Math.max(hi, run[0], run[1]);
      any = true;
    }
  }
  if (!any) return undefined;
  if (percent) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 1);
  }

  const soft: TextStyle = { ...ctx.base, color: ctx.soft };
  const valDeleted = flag(child(axes.val, 'c:delete'), false);
  const catDeleted = !axes.cat || flag(child(axes.cat, 'c:delete'), false);
  const valStyle = txStyle(soft, child(axes.val, 'c:txPr'), theme);
  const catStyle = txStyle(soft, child(axes.cat, 'c:txPr'), theme);
  const valFmt = child(axes.val, 'c:numFmt');
  const catRev = val(child(child(axes.cat, 'c:scaling'), 'c:orientation')) === 'maxMin';
  const valRev = val(child(child(axes.val, 'c:scaling'), 'c:orientation')) === 'maxMin';
  const midCat = val(child(axes.val, 'c:crossBetween')) === 'midCat' && kind === 'line';
  const axisCode = (): string | undefined => {
    const code = valFmt?.attrs.formatCode;
    const own = code && valFmt?.attrs.sourceLinked !== '1' ? code : series[0].format ?? code;
    return percent && (!own || /^general$/i.test(own)) ? '0%' : own;
  };
  const axTitle = (axis: XmlElement | undefined) => {
    const t = child(axis, 'c:title');
    return t ? richText(child(t, 'c:tx'), soft, theme) : undefined;
  };
  const valTitle = valDeleted ? undefined : axTitle(axes.val);
  const catTitle = catDeleted ? undefined : axTitle(axes.cat);
  const lineOf = (axis: XmlElement | undefined) => lineStroke(child(child(axis, 'c:spPr'), 'a:ln'), { color: { hex: AXIS, alpha: 1 }, width: 1, cap: 'butt' }, theme);
  const gridOf = (axis: XmlElement | undefined) => {
    const g = child(axis, 'c:majorGridlines');
    return g ? lineStroke(child(child(g, 'c:spPr'), 'a:ln'), { color: { hex: GRID, alpha: 1 }, width: 1, cap: 'butt' }, theme) : undefined;
  };
  const tickMark = (axis: XmlElement | undefined) => val(child(axis, 'c:majorTickMark')) ?? 'out';

  // Series looks.
  const lookOf = series.map((s, si) => {
    const sp = child(s.el, 'c:spPr');
    const dPts = new Map<number, XmlElement>();
    for (const d of childrenNamed(s.el, 'c:dPt')) dPts.set(parseInt(val(child(d, 'c:idx')) ?? '-1', 10), d);
    return { sp, dPts, color: accent(theme, si) };
  });
  const barFill = (si: number, i: number): Fill | undefined => {
    const { sp, dPts, color } = lookOf[si];
    return fillOf(child(dPts.get(i), 'c:spPr'), theme) ?? fillOf(sp, theme) ?? solid(varied ? accent(theme, i) : color);
  };
  const barStroke = (si: number, i: number) => lineStroke(child(child(lookOf[si].dPts.get(i), 'c:spPr'), 'a:ln') ?? child(lookOf[si].sp, 'a:ln'), undefined, theme);
  const lineLook = (si: number) => {
    const ln = child(lookOf[si].sp, 'a:ln');
    const color = lookOf[si].color;
    const dflt: Stroke = { color: { hex: color, alpha: 1 }, width: 3, cap: 'round' };
    const stroke = lineStroke(ln, dflt, theme);
    return stroke ? { ...stroke, cap: 'round' as const } : undefined;
  };
  const markerOf = (si: number): { symbol: string; size: number; fill: string; stroke: string } | undefined => {
    const mk = child(series[si].el, 'c:marker');
    let symbol = mk ? val(child(mk, 'c:symbol')) ?? 'auto' : flag(child(group, 'c:marker'), false) ? 'circle' : 'none';
    if (symbol === 'none') return undefined;
    if (!MARKERS.has(symbol)) symbol = 'circle';
    const sp = child(mk, 'c:spPr');
    const f = fillOf(sp, theme);
    const color = lineLook(si)?.color.hex ?? lookOf[si].color;
    const ln = lineStroke(child(sp, 'a:ln'), { color: { hex: color, alpha: 1 }, width: 0.75, cap: 'butt' }, theme);
    return {
      symbol,
      size: Math.min(72, Math.max(2, numVal(child(mk, 'c:size'), 5))) * PX_PER_PT,
      fill: f?.kind === 'solid' ? f.color.hex : f?.kind === 'none' ? 'none' : color,
      stroke: ln?.color.hex ?? 'none',
    };
  };

  const legend: LegendEntry[] = varied
    ? cats.map((label, i) => ({ label, fill: barFill(0, i) }))
    : series.map((s, si) =>
        kind === 'bar'
          ? { label: s.name, fill: barFill(si, -1), stroke: barStroke(si, -1) }
          : { label: s.name, line: true, stroke: lineLook(si), marker: markerOf(si)?.symbol, fill: solid(markerOf(si)?.fill ?? lookOf[si].color) },
      );

  return {
    legend,
    draw(free, manual) {
      const target = Math.max(3, Math.min(10, Math.floor((horizontal ? free.w : free.h) / 40)));
      const scale = makeScale(lo, hi, axes.val, target);
      const code = axisCode();
      const valLabels = scale.ticks.map((t) => formatNumber(t, code));
      const lh = (st: TextStyle) => st.size * 1.2;
      // Insets for what sits outside the plot.
      let left = 6;
      const right = 12;
      const top = 8;
      let bottom = 6;
      const widest = (labels: string[], st: TextStyle) => Math.max(0, ...labels.map((l) => tw(l, st)));
      const freeW = manual ? manual.rect.w : free.w;
      let catLines: string[][] = [];
      let rotate = false;
      let catBoxH = 0;
      let catBoxW = 0;
      if (horizontal) {
        if (!catDeleted) {
          const maxW = free.w * 0.35;
          catLines = cats.map((c) => wrap(c, maxW, catStyle));
          catBoxW = Math.max(...catLines.map((ls) => Math.max(...ls.map((l) => tw(l, catStyle)))));
          left += catBoxW + 8;
        }
        if (!valDeleted) bottom += lh(valStyle) + 8;
      } else {
        if (!valDeleted) left += widest(valLabels, valStyle) + 8;
        if (!catDeleted) {
          const slot = Math.max(20, (freeW - left - right) / n);
          catLines = cats.map((c) => wrap(c, slot * 0.95, catStyle));
          rotate = catLines.some((ls) => ls.some((l) => tw(l, catStyle) > slot));
          if (rotate) {
            catLines = cats.map((c) => [c]);
            catBoxH = widest(cats, catStyle) * 0.72 + catStyle.size * 0.6;
          } else catBoxH = Math.max(...catLines.map((ls) => ls.length)) * lh(catStyle);
          bottom += catBoxH + 8;
        }
      }
      const vtH = valTitle ? valTitle.lines.length * lh(valTitle.style) + 6 : 0;
      const ctH = catTitle ? catTitle.lines.length * lh(catTitle.style) + 6 : 0;
      if (horizontal) {
        left += ctH;
        bottom += vtH;
      } else {
        left += vtH;
        bottom += ctH;
      }
      let g: Geo;
      if (manual) {
        const r = manual.rect;
        g = manual.inner
          ? { ...r, horizontal, n, min: scale.min, max: scale.max, catRev, valRev }
          : { x: r.x + left, y: r.y + top, w: r.w - left - 6, h: r.h - top - bottom, horizontal, n, min: scale.min, max: scale.max, catRev, valRev };
      } else {
        g = { x: free.x + left, y: free.y + top, w: free.w - left - right, h: free.h - top - bottom, horizontal, n, min: scale.min, max: scale.max, catRev, valRev };
      }
      g.w = Math.max(20, g.w);
      g.h = Math.max(20, g.h);
      const out: string[] = [];
      const plotFill = fillOf(child(plotArea, 'c:spPr'), theme);
      if (plotFill && plotFill.kind !== 'none') out.push(`<rect x="${num(g.x)}" y="${num(g.y)}" width="${num(g.w)}" height="${num(g.h)}" ${fillAttrs(plotFill, defs)}/>`);

      // Gridlines.
      const vGrid = gridOf(axes.val);
      if (vGrid) {
        for (const t of scale.ticks) {
          const [x1, y1] = pt(g, 0, valFrac(g, t));
          const [x2, y2] = pt(g, catLen(g), valFrac(g, t));
          out.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" ${strokeAttrs(vGrid)}/>`);
        }
      }
      const slotLen = catLen(g) / n;
      const cGrid = gridOf(axes.cat);
      if (cGrid) {
        for (let i = 0; i <= n; i++) {
          const [x1, y1] = pt(g, i * slotLen, 0);
          const [x2, y2] = horizontal ? [g.x + g.w, y1] : [x1, g.y];
          const [xs, ys] = horizontal ? [g.x, y1] : [x1, g.y + g.h];
          out.push(`<line x1="${num(xs)}" y1="${num(ys)}" x2="${num(x2)}" y2="${num(y2)}" ${strokeAttrs(cGrid)}/>`);
        }
      }

      // Series.
      const f0 = Math.min(1, Math.max(0, valFrac(g, 0)));
      const labels: string[] = [];
      const addLabel = (si: number, i: number, cx: number, cy: number, box: Rect, endUp: boolean) => {
        const spec = labelSpec(series[si].el, group, i, ctx);
        if (!spec) return;
        const raw = series[si].vals[i] ?? null;
        const lines = labelLines(spec, { ser: series[si].name, cat: cats[i], v: raw, format: series[si].format });
        if (!lines.length) return;
        const st = spec.style;
        const pos = spec.pos ?? (kind === 'line' ? 'r' : stacked ? 'ctr' : 'outEnd');
        let x = cx;
        let y = cy;
        let anchor: Anchor = 'middle';
        const half = st.size * 0.6 * lines.length;
        if (kind === 'line') {
          if (pos === 't') y = cy - 6 - half;
          else if (pos === 'b') y = cy + 6 + half;
          else if (pos === 'l') [x, anchor] = [cx - 7, 'end'];
          else if (pos === 'r') [x, anchor] = [cx + 7, 'start'];
        } else if (horizontal) {
          const right = g.valRev ? !endUp : endUp;
          const [near, far] = right ? [box.x + box.w, box.x] : [box.x, box.x + box.w];
          y = box.y + box.h / 2;
          if (pos === 'outEnd') [x, anchor] = [near + (right ? 4 : -4), right ? 'start' : 'end'];
          else if (pos === 'inEnd') [x, anchor] = [near + (right ? -4 : 4), right ? 'end' : 'start'];
          else if (pos === 'inBase') [x, anchor] = [far + (right ? 4 : -4), right ? 'start' : 'end'];
          else x = box.x + box.w / 2;
        } else {
          const up = g.valRev ? !endUp : endUp;
          const [near, far] = up ? [box.y, box.y + box.h] : [box.y + box.h, box.y];
          x = box.x + box.w / 2;
          if (pos === 'outEnd') y = near + (up ? -3 - half : 3 + half);
          else if (pos === 'inEnd') y = near + (up ? 3 + half : -3 - half);
          else if (pos === 'inBase') y = far + (up ? -3 - half : 3 + half);
          else y = box.y + box.h / 2;
        }
        labels.push(textEl(lines, x + spec.dx, y + spec.dy, st, anchor));
      };

      if (kind === 'bar') {
        const overlapEl = child(group, 'c:overlap');
        const overlap = stacked ? 1 : Math.min(1, Math.max(-1, numVal(overlapEl, 0) / 100));
        const gap = Math.max(0, numVal(child(group, 'c:gapWidth'), 150)) / 100;
        const k = stacked ? 1 : m;
        const barW = slotLen / (k - (k - 1) * overlap + gap);
        for (let si = 0; si < m; si++) {
          for (let i = 0; i < n; i++) {
            const run = runs[si][i];
            if (!run) continue;
            const off0 = i * slotLen + (gap * barW) / 2 + (stacked ? 0 : si * barW * (1 - overlap));
            const clampF = (v: number) => Math.min(1, Math.max(0, valFrac(g, v)));
            const [xa, ya] = pt(g, off0, clampF(run[0]));
            const [xb, yb] = pt(g, off0 + barW, clampF(run[1]));
            const box: Rect = { x: Math.min(xa, xb), y: Math.min(ya, yb), w: Math.abs(xb - xa), h: Math.abs(yb - ya) };
            const v = runs[si][i]![1] - runs[si][i]![0];
            out.push(`<rect class="bar" x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" ${fillAttrs(barFill(si, i), defs)} ${strokeAttrs(barStroke(si, i))}/>`);
            addLabel(si, i, box.x + box.w / 2, box.y + box.h / 2, box, v >= 0);
          }
        }
      } else {
        for (let si = 0; si < m; si++) {
          const stroke = lineLook(si);
          const mk = markerOf(si);
          const segs: Array<Array<[number, number]>> = [[]];
          const at = (i: number) => (midCat && n > 1 ? (i / (n - 1)) * catLen(g) : (i + 0.5) * slotLen);
          for (let i = 0; i < n; i++) {
            const v = series[si].vals[i] ?? null;
            if (v === null) {
              if (segs[segs.length - 1].length) segs.push([]);
              continue;
            }
            segs[segs.length - 1].push(pt(g, at(i), valFrac(g, v)));
          }
          if (stroke) {
            for (const seg of segs) {
              if (seg.length > 1) out.push(`<polyline class="line" points="${seg.map((p) => `${num(p[0])},${num(p[1])}`).join(' ')}" fill="none" ${strokeAttrs(stroke)}/>`);
            }
          }
          for (let i = 0; i < n; i++) {
            const v = series[si].vals[i] ?? null;
            if (v === null) continue;
            const [x, y] = pt(g, at(i), valFrac(g, v));
            if (mk) out.push(markerSvg(mk.symbol, x, y, mk.size, mk.fill, mk.stroke, 0.75));
            addLabel(si, i, x, y, { x, y, w: 0, h: 0 }, true);
          }
        }
      }

      // Axes: lines, tick marks, labels, titles.
      const catAxisLine = lineOf(axes.cat);
      const valAxisLine = lineOf(axes.val);
      const [zx, zy] = pt(g, 0, f0);
      if (!catDeleted && catAxisLine) {
        out.push(horizontal ? `<line x1="${num(zx)}" y1="${num(g.y)}" x2="${num(zx)}" y2="${num(g.y + g.h)}" ${strokeAttrs(catAxisLine)}/>` : `<line x1="${num(g.x)}" y1="${num(zy)}" x2="${num(g.x + g.w)}" y2="${num(zy)}" ${strokeAttrs(catAxisLine)}/>`);
      }
      if (!valDeleted && valAxisLine) {
        out.push(horizontal ? `<line x1="${num(g.x)}" y1="${num(g.y + g.h)}" x2="${num(g.x + g.w)}" y2="${num(g.y + g.h)}" ${strokeAttrs(valAxisLine)}/>` : `<line x1="${num(g.x)}" y1="${num(g.y)}" x2="${num(g.x)}" y2="${num(g.y + g.h)}" ${strokeAttrs(valAxisLine)}/>`);
      }
      const tick = (x: number, y: number, mark: string, axisLine: Stroke | undefined, vertical: boolean) => {
        if (!axisLine || mark === 'none') return;
        const a = mark === 'in' ? 4 : -4;
        const b = mark === 'cross' ? 4 : mark === 'in' ? 0 : 0;
        const d = vertical ? `M ${num(x - a)} ${num(y)} L ${num(x + b)} ${num(y)}` : `M ${num(x)} ${num(y + a)} L ${num(x)} ${num(y - b)}`;
        out.push(`<path d="${d}" fill="none" ${strokeAttrs(axisLine)}/>`);
      };
      if (!valDeleted) {
        const mark = tickMark(axes.val);
        scale.ticks.forEach((t, i) => {
          const [x, y] = pt(g, 0, valFrac(g, t));
          if (horizontal) {
            out.push(textEl([valLabels[i]], x, g.y + g.h + 6 + valStyle.size * 0.6, valStyle));
            tick(x, g.y + g.h, mark === 'out' ? 'out' : mark, valAxisLine, false);
          } else {
            out.push(textEl([valLabels[i]], g.x - 7, y, valStyle, 'end'));
            tick(g.x, y, mark, valAxisLine, true);
          }
        });
      }
      if (!catDeleted) {
        const mark = tickMark(axes.cat);
        for (let i = 0; i < n; i++) {
          const off = midCat && n > 1 ? (i / (n - 1)) * catLen(g) : (i + 0.5) * slotLen;
          const [x, y] = pt(g, off, 0);
          if (horizontal) out.push(textEl(catLines[i], g.x - 7, y, catStyle, 'end'));
          else if (rotate) out.push(textEl(catLines[i], x, g.y + g.h + 6, catStyle, 'end', -45));
          else out.push(textEl(catLines[i], x, g.y + g.h + 6 + (catLines[i].length * lh(catStyle)) / 2, catStyle));
        }
        for (let i = 0; i <= n; i++) {
          const [x, y] = pt(g, i * slotLen, 0);
          if (horizontal) tick(g.x, y, mark, catAxisLine, true);
          else tick(x, g.y + g.h, mark, catAxisLine, false);
        }
      }
      const box = manual ? manual.rect : free;
      if (valTitle) {
        if (horizontal) out.push(textEl(valTitle.lines, g.x + g.w / 2, box.y + box.h - valTitle.lines.length * lh(valTitle.style) / 2 - 2, valTitle.style));
        else out.push(textEl(valTitle.lines, box.x + (valTitle.lines.length * lh(valTitle.style)) / 2 + 2, g.y + g.h / 2, valTitle.style, 'middle', -90));
      }
      if (catTitle) {
        if (horizontal) out.push(textEl(catTitle.lines, box.x + (catTitle.lines.length * lh(catTitle.style)) / 2 + 2, g.y + g.h / 2, catTitle.style, 'middle', -90));
        else out.push(textEl(catTitle.lines, g.x + g.w / 2, box.y + box.h - (catTitle.lines.length * lh(catTitle.style)) / 2 - 2, catTitle.style));
      }
      return out.join('') + labels.join('');
    },
  };
}

// ---- the chart ----

function manualRect(layout: XmlElement | undefined, ctx: Ctx, auto: Rect): { rect: Rect; inner: boolean } | undefined {
  const ml = child(layout, 'c:manualLayout');
  if (!ml) return undefined;
  const w = optNum(child(ml, 'c:w'));
  const h = optNum(child(ml, 'c:h'));
  if (w === undefined || h === undefined || w <= 0 || h <= 0) return undefined;
  const x = numVal(child(ml, 'c:x'), 0);
  const y = numVal(child(ml, 'c:y'), 0);
  const rect: Rect = {
    x: val(child(ml, 'c:xMode')) === 'edge' ? x * ctx.W : auto.x + x * ctx.W,
    y: val(child(ml, 'c:yMode')) === 'edge' ? y * ctx.H : auto.y + y * ctx.H,
    w: w * ctx.W,
    h: h * ctx.H,
  };
  return { rect, inner: val(child(ml, 'c:layoutTarget')) === 'inner' };
}

const UNSUPPORTED = /^c:(bar3D|pie3D|line3D|area3D|surface|surface3D|radar|bubble|stock|ofPie|scatter|area)Chart$/;
const SUPPORTED = new Set(['c:pieChart', 'c:doughnutChart', 'c:barChart', 'c:lineChart']);

function draw(chartSpace: XmlElement, theme: Theme, W: number, H: number): string | null {
  if (chartSpace.name !== 'c:chartSpace' || !(W > 0) || !(H > 0)) return null;
  const chart = child(chartSpace, 'c:chart');
  const plotArea = child(chart, 'c:plotArea');
  if (!chart || !plotArea) return null;
  const groups = plotArea.children.filter((c): c is XmlElement => typeof c !== 'string' && /^c:\w+Chart$/.test(c.name));
  if (groups.length !== 1 || UNSUPPORTED.test(groups[0].name) || !SUPPORTED.has(groups[0].name)) return null;
  const group = groups[0];

  const defs = new SvgDefs();
  const rootStyle = txStyle(
    { size: 10 * PX_PER_PT, bold: false, color: `#${theme.colors.dk1 ?? '000000'}`, font: fontStack(theme.fonts.minor, theme.fonts.minorEa) },
    child(chartSpace, 'c:txPr'),
    theme,
  );
  const explicit = colorOf(child(find(child(chartSpace, 'c:txPr') ?? chartSpace, 'a:defRPr') ?? chartSpace, 'a:solidFill'), theme)?.hex;
  const ctx: Ctx = { theme, defs, W, H, base: rootStyle, soft: explicit ?? GRAY };

  let model: Model | undefined;
  if (group.name === 'c:pieChart') model = pieModel(ctx, group, false);
  else if (group.name === 'c:doughnutChart') model = pieModel(ctx, group, true);
  else model = cartesianModel(ctx, group, plotArea, group.name === 'c:barChart' ? 'bar' : 'line');
  if (!model) return null;

  const mx = W * 0.04;
  const my = H * 0.04;
  const soft: TextStyle = { ...ctx.base, color: ctx.soft };
  let body = '';

  // Background and border.
  // A white ground is the paper's own: left transparent, so the app stores the picture as PNG, never JPEG.
  const fill = fillOf(child(chartSpace, 'c:spPr'), theme);
  const bg = fill?.kind === 'solid' && fill.color.hex === '#ffffff' ? undefined : fill;
  const border = lineStroke(child(child(chartSpace, 'c:spPr'), 'a:ln'), undefined, theme);
  if ((bg && bg.kind !== 'none') || border) {
    body += `<rect x="0" y="0" width="${num(W)}" height="${num(H)}" ${fillAttrs(bg && bg.kind !== 'none' ? bg : undefined, defs)} ${strokeAttrs(border)}/>`;
  }

  // Title.
  let top = my;
  const bottomEdge = H - my;
  let titleDraw = '';
  const titleEl = child(chart, 'c:title');
  if (titleEl) {
    const titleBase: TextStyle = { ...soft, size: 14 * PX_PER_PT };
    let t = richText(child(titleEl, 'c:tx'), titleBase, theme);
    if (!t && !child(titleEl, 'c:tx')) {
      const sers = findSeriesNames(group);
      if (sers.length === 1) t = { lines: [sers[0]], style: txStyle(titleBase, child(titleEl, 'c:txPr'), theme) };
    }
    if (t) {
      const h = t.lines.length * t.style.size * 1.2;
      titleDraw = textEl(t.lines, W / 2, my + h / 2, t.style);
      if (!flag(child(titleEl, 'c:overlay'), false)) top += h + 8;
    }
  }

  // Legend.
  let left = mx;
  let right = W - mx;
  let bottom = bottomEdge;
  let legendDraw = '';
  const legendEl = child(chart, 'c:legend');
  if (legendEl) {
    const hidden = new Set(childrenNamed(legendEl, 'c:legendEntry').filter((e) => flag(child(e, 'c:delete'), false)).map((e) => parseInt(val(child(e, 'c:idx')) ?? '-1', 10)));
    const entries = model.legend.filter((_, i) => !hidden.has(i));
    const st = txStyle(soft, child(legendEl, 'c:txPr'), theme);
    const pos = val(child(legendEl, 'c:legendPos')) ?? 'r';
    if (entries.length) {
      const sample = 22;
      const rowH = st.size * 1.5;
      const widthOf = (e: LegendEntry) => (e.line ? sample : 10) + 5 + tw(e.label, st);
      let items: Array<{ e: LegendEntry; x: number; y: number }> = [];
      let lw: number;
      let lh: number;
      if (pos === 't' || pos === 'b') {
        const maxW = W - 2 * mx;
        let x = 0;
        let row = 0;
        let rowW = 0;
        lw = 0;
        for (const e of entries) {
          const w = widthOf(e) + 14;
          if (x > 0 && x + w > maxW) {
            x = 0;
            row++;
          }
          items.push({ e, x, y: row * rowH });
          x += w;
          rowW = Math.max(rowW, x - 14);
          lw = rowW;
        }
        lh = (row + 1) * rowH;
      } else {
        lw = Math.max(...entries.map(widthOf));
        lh = entries.length * rowH;
        items = entries.map((e, i) => ({ e, x: 0, y: i * rowH }));
      }
      let ox: number;
      let oy: number;
      if (pos === 'l') {
        ox = mx;
        left += lw + 12;
        oy = (top + bottom) / 2 - lh / 2;
      } else if (pos === 't') {
        ox = (W - lw) / 2;
        oy = top;
        top += lh + 6;
      } else if (pos === 'b') {
        ox = (W - lw) / 2;
        oy = bottom - lh;
        bottom -= lh + 6;
      } else {
        ox = W - mx - lw;
        right -= lw + 12;
        oy = pos === 'tr' ? top : (top + bottom) / 2 - lh / 2;
      }
      for (const { e, x, y } of items) {
        const cy = oy + y + rowH / 2;
        const sx = ox + x;
        if (e.line) {
          if (e.stroke) legendDraw += `<line x1="${num(sx)}" y1="${num(cy)}" x2="${num(sx + sample)}" y2="${num(cy)}" ${strokeAttrs(e.stroke)}/>`;
          if (e.marker) legendDraw += markerSvg(e.marker, sx + sample / 2, cy, 6, e.fill?.kind === 'solid' ? e.fill.color.hex : '#888888', 'none', 0);
        } else {
          legendDraw += `<rect x="${num(sx)}" y="${num(cy - 5)}" width="10" height="10" ${fillAttrs(e.fill, defs)} ${strokeAttrs(e.stroke)}/>`;
        }
        legendDraw += textEl([e.label], sx + (e.line ? sample : 10) + 5, cy, st, 'start');
      }
    }
  }

  const free: Rect = { x: left, y: top, w: Math.max(40, right - left), h: Math.max(40, bottom - top) };
  const manual = manualRect(child(plotArea, 'c:layout'), ctx, free);
  body += model.draw(free, manual) + titleDraw + legendDraw;
  return svgDocument(W, H, body, defs);
}

function findSeriesNames(group: XmlElement): string[] {
  return childrenNamed(group, 'c:ser').map((s, i) => readSeries(s, i)?.name ?? '');
}

/** The chart as an SVG document `widthPx`×`heightPx`, or `null` when it cannot be drawn faithfully. */
export function drawChart(chartSpace: XmlElement, theme: Theme, widthPx: number, heightPx: number): string | null {
  try {
    return draw(chartSpace, theme, widthPx, heightPx);
  } catch {
    return null;
  }
}
