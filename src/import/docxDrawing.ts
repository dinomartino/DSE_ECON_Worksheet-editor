/**
 * Word shape drawings as pictures (k-0498): a group of lines, arrows, rectangles, circles
 * and text-box labels (an economics graph drawn in Word) is drawn into one SVG, offline.
 *
 * Everything is flattened to paths in page pixels: group scaling, rotation and flips are
 * applied to the points, so line widths and arrowheads keep Word's size. Text boxes are
 * laid out here (wrap, alignment, insets, sub/superscript) with the browser's fonts.
 *
 * Anything it cannot draw faithfully (a picture or chart inside the group, an unknown
 * preset shape, a freeform with formulas, vertical CJK text, a shape with no position)
 * returns null: the importer then keeps its empty picture box and the import check asks
 * for the picture by hand, as before.
 */
import { readRunProps, type Styles } from './docxNumbering';
import {
  colorOf,
  EMU_PER_PX,
  escXml,
  fillAttrs,
  fillOf,
  fontStack,
  isSans,
  num,
  strokeAttrs,
  strokeOf,
  svgDocument,
  SvgDefs,
  textWidth,
  type Arrow,
  type Fill,
  type Stroke,
  type Theme,
} from './drawingml';
import { child, childrenNamed, elements, find, findAll, textOf, val, type XmlElement } from './xml';

export interface DrawContext {
  theme: Theme;
  styles: Styles;
  /** The document's default font (`w:docDefaults`), for runs that name none. */
  font?: string;
  fontEa?: string;
  /** The default paragraph spacing: after and before (twips), line (240ths, `auto`). */
  spacing?: { after: number; before: number; line: number };
}

/** One drawing placed in a shared frame (EMU): its `a:graphicData` content and box. */
export interface Piece {
  graphic: XmlElement;
  x: number;
  y: number;
  cx: number;
  cy: number;
  /** Stacking order (`wp:anchor relativeHeight`). */
  z: number;
}

export interface Drawn {
  svg: string;
  widthPx: number;
  heightPx: number;
  /** Its labels include the letters A–D: an MC question's picture options drawn as one figure. */
  optionLetters: boolean;
}

class CannotDraw extends Error {}
const fail = (why: string): never => {
  throw new CannotDraw(why);
};

// ---- geometry ----

type Matrix = [number, number, number, number, number, number];
type Pt = [number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const mul = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const translate = (x: number, y: number): Matrix => [1, 0, 0, 1, x, y];
const scale = (sx: number, sy: number): Matrix => [sx, 0, 0, sy, 0, 0];
const rotate = (deg: number): Matrix => {
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
};
const apply = (m: Matrix, [x, y]: Pt): Pt => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** A path in a shape's own box: subpaths of move/line/cubic/close. */
type Seg = { op: 'M' | 'L'; p: Pt } | { op: 'C'; p: [Pt, Pt, Pt] } | { op: 'Z' };
interface SubPath {
  segs: Seg[];
  fill: boolean;
  stroke: boolean;
  /** Open ends get arrowheads. */
  open: boolean;
}

const KAPPA = 0.5522847498;

function ellipsePath(cx: number, cy: number, rx: number, ry: number): Seg[] {
  const k = KAPPA;
  return [
    { op: 'M', p: [cx + rx, cy] },
    { op: 'C', p: [[cx + rx, cy + ry * k], [cx + rx * k, cy + ry], [cx, cy + ry]] },
    { op: 'C', p: [[cx - rx * k, cy + ry], [cx - rx, cy + ry * k], [cx - rx, cy]] },
    { op: 'C', p: [[cx - rx, cy - ry * k], [cx - rx * k, cy - ry], [cx, cy - ry]] },
    { op: 'C', p: [[cx + rx * k, cy - ry], [cx + rx, cy - ry * k], [cx + rx, cy]] },
    { op: 'Z' },
  ];
}

/** An elliptical arc as cubic curves, from parametric angle `t0` sweeping `dt` (radians, clockwise on screen). */
function arcSegs(cx: number, cy: number, rx: number, ry: number, t0: number, dt: number): Seg[] {
  const out: Seg[] = [];
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
  const step = dt / n;
  const h = (4 / 3) * Math.tan(step / 4);
  for (let i = 0; i < n; i++) {
    const a = t0 + i * step;
    const b = a + step;
    const p0: Pt = [cx + rx * Math.cos(a), cy + ry * Math.sin(a)];
    const p3: Pt = [cx + rx * Math.cos(b), cy + ry * Math.sin(b)];
    const c1: Pt = [p0[0] - h * rx * Math.sin(a), p0[1] + h * ry * Math.cos(a)];
    const c2: Pt = [p3[0] + h * rx * Math.sin(b), p3[1] - h * ry * Math.cos(b)];
    out.push({ op: 'C', p: [c1, c2, p3] });
  }
  return out;
}

/** DrawingML's angle on an ellipse (the visual angle) → the parametric angle. */
const parametric = (deg: number, rx: number, ry: number) => {
  const r = (deg * Math.PI) / 180;
  return Math.atan2(rx * Math.sin(r), ry * Math.cos(r));
};

const poly = (pts: Pt[], close = true): Seg[] => [{ op: 'M', p: pts[0] }, ...pts.slice(1).map((p) => ({ op: 'L' as const, p })), ...(close ? [{ op: 'Z' as const }] : [])];

function adjOf(geom: XmlElement): Record<string, number> {
  const out: Record<string, number> = {};
  for (const gd of childrenNamed(child(geom, 'a:avLst'), 'a:gd')) {
    const m = /^val\s+(-?\d+)$/.exec(gd.attrs.fmla ?? '');
    if (gd.attrs.name && m) out[gd.attrs.name] = +m[1];
  }
  return out;
}

const closed = (segs: Seg[], fill = true): SubPath => ({ segs, fill, stroke: true, open: false });
const line = (segs: Seg[]): SubPath => ({ segs, fill: false, stroke: true, open: true });

/** A preset shape's outline in its box (w × h). */
function presetPath(prst: string, w: number, h: number, adj: Record<string, number>): SubPath[] {
  const ss = Math.min(w, h);
  const a = (name: string, dflt: number) => (adj[name] ?? dflt) / 100000;
  switch (prst) {
    case 'line':
    case 'straightConnector1':
      return [line([{ op: 'M', p: [0, 0] }, { op: 'L', p: [w, h] }])];
    case 'bentConnector2':
      return [line(poly([[0, 0], [w, 0], [w, h]], false))];
    case 'bentConnector3': {
      const x1 = w * a('adj1', 50000);
      return [line(poly([[0, 0], [x1, 0], [x1, h], [w, h]], false))];
    }
    case 'curvedConnector3': {
      const x1 = w * a('adj1', 50000);
      return [
        line([
          { op: 'M', p: [0, 0] },
          { op: 'C', p: [[x1 / 2, 0], [x1, h / 4], [x1, h / 2]] },
          { op: 'C', p: [[x1, (h * 3) / 4], [(w + x1) / 2, h], [w, h]] },
        ]),
      ];
    }
    case 'rect':
    case 'flowChartProcess':
    case 'snip1Rect':
      if (prst === 'snip1Rect') {
        const d = ss * a('adj', 16667);
        return [closed(poly([[0, 0], [w - d, 0], [w, d], [w, h], [0, h]]))];
      }
      return [closed(poly([[0, 0], [w, 0], [w, h], [0, h]]))];
    case 'roundRect':
    case 'flowChartAlternateProcess':
    case 'flowChartTerminator': {
      const r = prst === 'flowChartTerminator' ? ss / 2 : ss * a('adj', 16667);
      return [
        closed([
          { op: 'M', p: [r, 0] },
          { op: 'L', p: [w - r, 0] },
          ...arcSegs(w - r, r, r, r, -Math.PI / 2, Math.PI / 2),
          { op: 'L', p: [w, h - r] },
          ...arcSegs(w - r, h - r, r, r, 0, Math.PI / 2),
          { op: 'L', p: [r, h] },
          ...arcSegs(r, h - r, r, r, Math.PI / 2, Math.PI / 2),
          { op: 'L', p: [0, r] },
          ...arcSegs(r, r, r, r, Math.PI, Math.PI / 2),
          { op: 'Z' },
        ]),
      ];
    }
    case 'ellipse':
    case 'flowChartConnector':
      return [closed(ellipsePath(w / 2, h / 2, w / 2, h / 2))];
    case 'triangle': {
      const x = w * a('adj', 50000);
      return [closed(poly([[x, 0], [w, h], [0, h]]))];
    }
    case 'rtTriangle':
      return [closed(poly([[0, 0], [w, h], [0, h]]))];
    case 'diamond':
    case 'flowChartDecision':
      return [closed(poly([[w / 2, 0], [w, h / 2], [w / 2, h], [0, h / 2]]))];
    case 'parallelogram': {
      const x = ss * a('adj', 25000);
      return [closed(poly([[x, 0], [w, 0], [w - x, h], [0, h]]))];
    }
    case 'trapezoid': {
      const x = ss * a('adj', 25000);
      return [closed(poly([[x, 0], [w - x, 0], [w, h], [0, h]]))];
    }
    case 'homePlate': {
      const x = w - ss * a('adj', 50000);
      return [closed(poly([[0, 0], [x, 0], [w, h / 2], [x, h], [0, h]]))];
    }
    case 'chevron': {
      const d = ss * a('adj', 50000);
      return [closed(poly([[0, 0], [w - d, 0], [w, h / 2], [w - d, h], [0, h], [d, h / 2]]))];
    }
    case 'rightArrow':
    case 'leftArrow': {
      const y1 = h / 2 - (h * a('adj1', 50000)) / 2;
      const y2 = h / 2 + (h * a('adj1', 50000)) / 2;
      const x1 = w - ss * a('adj2', 50000);
      const pts: Pt[] = [[0, y1], [x1, y1], [x1, 0], [w, h / 2], [x1, h], [x1, y2], [0, y2]];
      return [closed(poly(prst === 'rightArrow' ? pts : pts.map(([x, y]) => [w - x, y])))];
    }
    case 'downArrow':
    case 'upArrow': {
      const x1 = w / 2 - (w * a('adj1', 50000)) / 2;
      const x2 = w / 2 + (w * a('adj1', 50000)) / 2;
      const y1 = h - ss * a('adj2', 50000);
      const pts: Pt[] = [[x1, 0], [x1, y1], [0, y1], [w / 2, h], [w, y1], [x2, y1], [x2, 0]];
      return [closed(poly(prst === 'downArrow' ? pts : pts.map(([x, y]) => [x, h - y])))];
    }
    case 'leftRightArrow': {
      const y1 = h / 2 - (h * a('adj1', 50000)) / 2;
      const y2 = h / 2 + (h * a('adj1', 50000)) / 2;
      const x1 = ss * a('adj2', 50000);
      return [closed(poly([[0, h / 2], [x1, 0], [x1, y1], [w - x1, y1], [w - x1, 0], [w, h / 2], [w - x1, h], [w - x1, y2], [x1, y2], [x1, h]]))];
    }
    case 'upDownArrow': {
      const x1 = w / 2 - (w * a('adj1', 50000)) / 2;
      const x2 = w / 2 + (w * a('adj1', 50000)) / 2;
      const y1 = ss * a('adj2', 50000);
      return [closed(poly([[w / 2, 0], [w, y1], [x2, y1], [x2, h - y1], [w, h - y1], [w / 2, h], [0, h - y1], [x1, h - y1], [x1, y1], [0, y1]]))];
    }
    case 'arc': {
      const st = (adj.adj1 ?? 16200000) / 60000;
      const en = (adj.adj2 ?? 0) / 60000;
      let sweep = en - st;
      while (sweep <= 0) sweep += 360;
      const rx = w / 2;
      const ry = h / 2;
      const t0 = parametric(st, rx, ry);
      let t1 = parametric(st + sweep, rx, ry);
      while (t1 <= t0) t1 += Math.PI * 2;
      const start: Pt = [rx + rx * Math.cos(t0), ry + ry * Math.sin(t0)];
      const arc = arcSegs(rx, ry, rx, ry, t0, t1 - t0);
      return [
        { segs: [{ op: 'M', p: start }, ...arc, { op: 'L', p: [rx, ry] }, { op: 'Z' }], fill: true, stroke: false, open: false },
        line([{ op: 'M', p: start }, ...arc]),
      ];
    }
    case 'leftBracket':
    case 'rightBracket': {
      const r = Math.min(h * a('adj', 8333), h / 2);
      const segs: Seg[] = [{ op: 'M', p: [w, 0] }, ...arcSegs(w, r, w, r, -Math.PI / 2, -Math.PI / 2), { op: 'L', p: [0, h - r] }, ...arcSegs(w, h - r, w, r, Math.PI, -Math.PI / 2)];
      return [line(prst === 'leftBracket' ? segs : mirrorX(segs, w))];
    }
    case 'leftBrace':
    case 'rightBrace': {
      const r = Math.min(h * a('adj1', 8333), h / 4);
      const mid = h * a('adj2', 50000);
      const x = w / 2;
      const segs: Seg[] = [
        { op: 'M', p: [w, 0] },
        ...arcSegs(w, r, x, r, -Math.PI / 2, -Math.PI / 2),
        { op: 'L', p: [x, mid - r] },
        ...arcSegs(0, mid - r, x, r, 0, Math.PI / 2),
        ...arcSegs(0, mid + r, x, r, -Math.PI / 2, Math.PI / 2),
        { op: 'L', p: [x, h - r] },
        ...arcSegs(w, h - r, x, r, Math.PI, -Math.PI / 2),
      ];
      return [line(prst === 'leftBrace' ? segs : mirrorX(segs, w))];
    }
    default:
      return fail(`preset ${prst}`);
  }
}

function mirrorX(segs: Seg[], w: number): Seg[] {
  const m = ([x, y]: Pt): Pt => [w - x, y];
  return segs.map((s) => (s.op === 'Z' ? s : s.op === 'C' ? { op: 'C', p: [m(s.p[0]), m(s.p[1]), m(s.p[2])] } : { op: s.op, p: m(s.p) }));
}

/** A freeform (`a:custGeom`) with plain numbers; formulas cannot be drawn. */
function customPath(geom: XmlElement, w: number, h: number): SubPath[] {
  const out: SubPath[] = [];
  const nums = (v: string | undefined) => (v !== undefined && /^-?\d+(\.\d+)?$/.test(v) ? +v : fail('freeform formula'));
  for (const path of childrenNamed(child(geom, 'a:pathLst'), 'a:path')) {
    const pw = +(path.attrs.w ?? 0) || w;
    const ph = +(path.attrs.h ?? 0) || h;
    const sx = pw ? w / pw : 1;
    const sy = ph ? h / ph : 1;
    const pt = (el: XmlElement | undefined): Pt => (el ? [nums(el.attrs.x) * sx, nums(el.attrs.y) * sy] : fail('freeform point'));
    const segs: Seg[] = [];
    let cur: Pt = [0, 0];
    let start: Pt = [0, 0];
    let isClosed = false;
    for (const c of elements(path)) {
      const pts = childrenNamed(c, 'a:pt');
      switch (c.name) {
        case 'a:moveTo':
          cur = start = pt(pts[0]);
          segs.push({ op: 'M', p: cur });
          break;
        case 'a:lnTo':
          cur = pt(pts[0]);
          segs.push({ op: 'L', p: cur });
          break;
        case 'a:cubicBezTo': {
          const [c1, c2, p] = [pt(pts[0]), pt(pts[1]), pt(pts[2])];
          segs.push({ op: 'C', p: [c1, c2, p] });
          cur = p;
          break;
        }
        case 'a:quadBezTo': {
          const [q, p] = [pt(pts[0]), pt(pts[1])];
          segs.push({ op: 'C', p: [[cur[0] + (2 / 3) * (q[0] - cur[0]), cur[1] + (2 / 3) * (q[1] - cur[1])], [p[0] + (2 / 3) * (q[0] - p[0]), p[1] + (2 / 3) * (q[1] - p[1])], p] });
          cur = p;
          break;
        }
        case 'a:arcTo': {
          const rx = nums(c.attrs.wR) * sx;
          const ry = nums(c.attrs.hR) * sy;
          const st = nums(c.attrs.stAng) / 60000;
          const sw = nums(c.attrs.swAng) / 60000;
          const t0 = parametric(st, rx, ry);
          const t1 = parametric(st + sw, rx, ry);
          let dt = t1 - t0;
          if (sw > 0 && dt < 0) dt += Math.PI * 2;
          if (sw < 0 && dt > 0) dt -= Math.PI * 2;
          const cx = cur[0] - rx * Math.cos(t0);
          const cy = cur[1] - ry * Math.sin(t0);
          const arc = arcSegs(cx, cy, rx, ry, t0, dt);
          segs.push(...arc);
          const last = arc[arc.length - 1];
          if (last && last.op === 'C') cur = last.p[2];
          break;
        }
        case 'a:close':
          segs.push({ op: 'Z' });
          cur = start;
          isClosed = true;
          break;
        default:
      }
    }
    if (!segs.length) continue;
    const fill = path.attrs.fill !== 'none';
    const stroke = !/^(0|false)$/.test(path.attrs.stroke ?? '');
    out.push({ segs, fill: fill && isClosed, stroke, open: !isClosed });
  }
  return out.length ? out : fail('empty freeform');
}

// ---- writing ----

interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
const grow = (b: Bounds, [x, y]: Pt, pad = 0) => {
  b.x0 = Math.min(b.x0, x - pad);
  b.y0 = Math.min(b.y0, y - pad);
  b.x1 = Math.max(b.x1, x + pad);
  b.y1 = Math.max(b.y1, y + pad);
};

const ptStr = ([x, y]: Pt) => `${num(x)} ${num(y)}`;

function pathD(segs: Seg[], m: Matrix, bounds: Bounds, pad: number): string {
  return segs
    .map((s) => {
      if (s.op === 'Z') return 'Z';
      const pts = s.op === 'C' ? s.p.map((p) => apply(m, p)) : [apply(m, s.p)];
      for (const p of pts) grow(bounds, p, pad);
      return `${s.op}${pts.map(ptStr).join(' ')}`;
    })
    .join('');
}

/** Ends of an open path in page px, with the direction each end points. */
function ends(segs: Seg[], m: Matrix): { start: [Pt, Pt]; end: [Pt, Pt] } | null {
  const pts: Pt[] = [];
  for (const s of segs) {
    if (s.op === 'Z') return null;
    if (s.op === 'C') pts.push(...s.p.map((p) => apply(m, p)));
    else pts.push(apply(m, s.p));
  }
  const far = (from: number, dir: number): Pt | null => {
    for (let i = from + dir; i >= 0 && i < pts.length; i += dir) if (Math.hypot(pts[i][0] - pts[from][0], pts[i][1] - pts[from][1]) > 0.01) return pts[i];
    return null;
  };
  const a = far(0, 1);
  const b = far(pts.length - 1, -1);
  if (!a || !b) return null;
  return { start: [pts[0], a], end: [pts[pts.length - 1], b] };
}

/** An arrowhead at `tip`, pointing away from `from`: its SVG and how far the line should stop short. */
function arrowHead(arrow: Arrow, tip: Pt, from: Pt, stroke: Stroke, bounds: Bounds): { svg: string; back: number } {
  // Word sizes arrowheads from the line width, but never smaller than for a 2 pt line.
  const lw = Math.max(stroke.width, 2.5);
  const len = arrow.length * lw;
  const wid = arrow.width * lw;
  const d = Math.hypot(tip[0] - from[0], tip[1] - from[1]) || 1;
  const ux = (tip[0] - from[0]) / d;
  const uy = (tip[1] - from[1]) / d;
  const at = (along: number, across: number): Pt => [tip[0] - ux * along - uy * across, tip[1] - uy * along + ux * across];
  const color = `${stroke.color.hex}"${stroke.color.alpha < 1 ? ` fill-opacity="${num(stroke.color.alpha)}"` : ''}`;
  const draw = (pts: Pt[]) => {
    for (const p of pts) grow(bounds, p, lw);
    return pts.map(ptStr).join(' ');
  };
  switch (arrow.kind) {
    case 'arrow': {
      const pts = [at(len, wid / 2), tip, at(len, -wid / 2)];
      return { svg: `<polyline points="${draw(pts)}" fill="none" stroke="${stroke.color.hex}" stroke-width="${num(stroke.width)}" stroke-linejoin="miter" stroke-linecap="round"/>`, back: stroke.width / 2 };
    }
    case 'stealth':
      return { svg: `<polygon points="${draw([tip, at(len, wid / 2), at(len * 0.6, 0), at(len, -wid / 2)])}" fill="${color}/>`, back: len * 0.6 };
    case 'oval': {
      const c = tip;
      draw([at(-len / 2, wid / 2), at(len / 2, -wid / 2)]);
      const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
      return { svg: `<ellipse cx="${num(c[0])}" cy="${num(c[1])}" rx="${num(len / 2)}" ry="${num(wid / 2)}" transform="rotate(${num(angle)} ${num(c[0])} ${num(c[1])})" fill="${color}/>`, back: 0 };
    }
    case 'diamond':
      return { svg: `<polygon points="${draw([at(-len / 2, 0), at(0, wid / 2), at(len / 2, 0), at(0, -wid / 2)])}" fill="${color}/>`, back: 0 };
    default:
      return { svg: `<polygon points="${draw([tip, at(len, wid / 2), at(len, -wid / 2)])}" fill="${color}/>`, back: len * 0.8 };
  }
}

/** Shorten an open path's first or last segment by `by` px (so the line stops inside its arrowhead). */
function shorten(segs: Seg[], m: Matrix, atEnd: boolean, by: number): Seg[] {
  if (by <= 0) return segs;
  const inv = invert(m);
  if (!inv) return segs;
  const out = segs.map((s) => (s.op === 'Z' ? s : s.op === 'C' ? { op: 'C' as const, p: [...s.p] as [Pt, Pt, Pt] } : { op: s.op, p: s.p }));
  const idx = atEnd ? out.length - 1 : 0;
  const seg = out[idx];
  if (seg.op === 'Z') return segs;
  const endPt = seg.op === 'C' ? seg.p[2] : seg.p;
  const near = atEnd ? (seg.op === 'C' ? seg.p[1] : prevPoint(out, idx)) : nextPoint(out, idx);
  if (!near) return segs;
  const a = apply(m, endPt);
  const b = apply(m, near);
  const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (d <= by) return segs;
  const moved = apply(inv, [a[0] + ((b[0] - a[0]) * by) / d, a[1] + ((b[1] - a[1]) * by) / d]);
  if (seg.op === 'C') seg.p[2] = moved;
  else out[idx] = { op: seg.op, p: moved };
  return out;
}

const segEnd = (s: Seg | undefined): Pt | undefined => (!s || s.op === 'Z' ? undefined : s.op === 'C' ? s.p[2] : s.p);
const prevPoint = (segs: Seg[], i: number) => segEnd(segs[i - 1]);
function nextPoint(segs: Seg[], i: number): Pt | undefined {
  const n = segs[i + 1];
  if (!n || n.op === 'Z') return undefined;
  return n.op === 'C' ? n.p[0] : n.p;
}

function invert(m: Matrix): Matrix | null {
  const det = m[0] * m[3] - m[1] * m[2];
  if (Math.abs(det) < 1e-12) return null;
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

// ---- text boxes ----

interface Run {
  text: string;
  sizePx: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  vert?: 'superscript' | 'subscript';
  color?: string;
  font?: string;
  ea?: string;
}
interface Para {
  runs: Run[];
  align: 'start' | 'middle' | 'end';
  before: number;
  after: number;
  lineFactor: number;
}

const PT_PX = 96 / 72;

function readParagraphs(content: XmlElement, ctx: DrawContext, defaultColor: string | undefined): Para[] {
  const out: Para[] = [];
  const paragraphs = elements(content).flatMap((el) => (el.name === 'w:p' ? [el] : el.name === 'w:tbl' ? fail('table in a text box') : el.name === 'w:sdt' ? childrenNamed(child(el, 'w:sdtContent'), 'w:p') : []));
  for (const p of paragraphs) {
    const pPr = child(p, 'w:pPr');
    const style = ctx.styles.get(val(child(pPr, 'w:pStyle')) ?? ctx.styles.defaultParagraph);
    const base = { ...ctx.styles.defaults, ...style?.run };
    const jc = val(child(pPr, 'w:jc')) ?? style?.jc;
    const spacing = child(pPr, 'w:spacing');
    const rule = spacing?.attrs['w:lineRule'];
    const lineAttr = spacing?.attrs['w:line'];
    const line = lineAttr !== undefined && (!rule || rule === 'auto') ? +lineAttr / 240 : (ctx.spacing?.line ?? 240) / 240;
    const runs: Run[] = [];
    const walk = (nodes: XmlElement[]) => {
      for (const el of nodes) {
        if (el.name === 'w:r') {
          const rPr = child(el, 'w:rPr');
          const props = { ...base, ...ctx.styles.get(val(child(rPr, 'w:rStyle')))?.run, ...readRunProps(rPr) };
          if (props.hidden) continue;
          const fonts = child(rPr, 'w:rFonts');
          const colorVal = val(child(rPr, 'w:color'));
          const color = colorVal && /^[0-9a-f]{6}$/i.test(colorVal) ? `#${colorVal.toLowerCase()}` : defaultColor;
          const fmt: Omit<Run, 'text'> = {
            sizePx: (props.size ?? 10.5) * PT_PX,
            ...(props.bold ? { bold: true } : {}),
            ...(props.italic ? { italic: true } : {}),
            ...(props.underline ? { underline: true } : {}),
            ...(props.vertAlign ? { vert: props.vertAlign } : {}),
            ...(color ? { color } : {}),
            font: props.font ?? ctx.font,
            ea: fonts?.attrs['w:eastAsia'] ?? ctx.fontEa,
          };
          let text = '';
          for (const c of elements(el)) {
            if (c.name === 'w:t') text += textOf(c);
            else if (c.name === 'w:tab') text += '    ';
            else if (c.name === 'w:br' || c.name === 'w:cr') text += '\n';
            else if (c.name === 'w:sym') text += '•';
            else if (c.name === 'w:drawing' || c.name === 'w:pict' || c.name === 'w:object') fail('picture in a text box');
          }
          if (text) runs.push({ text, ...fmt });
        } else if (el.name === 'w:hyperlink' || el.name === 'w:ins' || el.name === 'w:smartTag' || el.name === 'w:fldSimple' || el.name === 'w:customXml') walk(elements(el));
        else if (el.name === 'mc:AlternateContent') {
          const choice = child(el, 'mc:Fallback') ?? child(el, 'mc:Choice');
          if (choice) walk(elements(choice));
        } else if (el.name === 'm:oMath' || el.name === 'm:oMathPara') runs.push({ text: textOf(el), sizePx: (base.size ?? 10.5) * PT_PX, italic: true, ...(defaultColor ? { color: defaultColor } : {}), font: base.font ?? ctx.font });
      }
    };
    walk(elements(p));
    // An empty paragraph still takes a line, at its mark's size.
    const markSize = readRunProps(child(pPr, 'w:rPr')).size ?? base.size ?? 10.5;
    out.push({
      runs: runs.length ? runs : [{ text: '', sizePx: markSize * PT_PX }],
      align: jc === 'center' ? 'middle' : jc === 'right' || jc === 'end' ? 'end' : 'start',
      before: twipsPx(spacing?.attrs['w:before'] ?? (out.length ? undefined : '0'), ctx.spacing?.before ?? 0),
      after: twipsPx(spacing?.attrs['w:after'], ctx.spacing?.after ?? 0),
      lineFactor: Math.max(0.5, line),
    });
  }
  return out;
}

const twipsPx = (v: string | undefined, dflt: number) => ((v !== undefined && Number.isFinite(+v) ? +v : dflt) / 20) * PT_PX;

interface Line {
  runs: Run[];
  width: number;
  size: number;
  align: Para['align'];
  /** Space before this line (a paragraph's before / the previous one's after). */
  gap: number;
  factor: number;
}

/** Break paragraphs into lines no wider than `max` px (no limit when 0). */
function layoutLines(paras: Para[], max: number): Line[] {
  const lines: Line[] = [];
  let pendingGap = 0;
  for (const p of paras) {
    let cur: Line = { runs: [], width: 0, size: 0, align: p.align, gap: pendingGap + p.before, factor: p.lineFactor };
    const flush = () => {
      cur.size ||= Math.max(...p.runs.map((r) => r.sizePx));
      // Trailing spaces do not count toward the line's width.
      const last = cur.runs[cur.runs.length - 1];
      if (last && /\s+$/.test(last.text)) {
        const trimmed = last.text.replace(/\s+$/, '');
        cur.width -= measure({ ...last, text: last.text.slice(trimmed.length) });
        cur.runs[cur.runs.length - 1] = { ...last, text: trimmed };
      }
      lines.push(cur);
      cur = { runs: [], width: 0, size: 0, align: p.align, gap: 0, factor: p.lineFactor };
    };
    for (const run of p.runs) {
      const parts = run.text.split('\n');
      parts.forEach((part, k) => {
        if (k > 0) flush();
        // Words (with their trailing space) or single CJK characters.
        const tokens = part.match(/[⺀-鿿豈-﫿＀-￯]|[^\s⺀-鿿豈-﫿＀-￯]+\s*|\s+/g) ?? [];
        for (const t of tokens) {
          const w = measure({ ...run, text: t });
          const ink = measure({ ...run, text: t.replace(/\s+$/, '') });
          if (max > 0 && cur.runs.length && cur.width + ink > max + 0.5 && !/^\s+$/.test(t)) flush();
          const last = cur.runs[cur.runs.length - 1];
          if (last && sameRun(last, run)) last.text += t;
          else cur.runs.push({ ...run, text: t });
          cur.width += w;
          cur.size = Math.max(cur.size, run.sizePx);
        }
        if (!tokens.length) cur.size = Math.max(cur.size, run.sizePx);
      });
    }
    flush();
    pendingGap = p.after;
  }
  return lines;
}

const sameRun = (a: Run, b: Run) => a.sizePx === b.sizePx && a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.vert === b.vert && a.color === b.color && a.font === b.font;

function measure(run: Run): number {
  const size = run.vert ? run.sizePx * 0.65 : run.sizePx;
  return textWidth(run.text, size, { bold: run.bold, sans: isSans(run.font) });
}

/** Word's single line height for a font size, by family. */
const lineHeight = (size: number, font?: string, factor = 1) => size * (isSans(font) ? 1.22 : 1.15) * factor;

interface BoxText {
  svg: string;
}

/**
 * A text box's text, laid out in a `w` × `h` px frame whose top-left corner sits at
 * `origin` with rotation `angle` (degrees).
 */
function drawText(wsp: XmlElement, content: XmlElement, ctx: DrawContext, frame: { origin: Pt; angle: number; w: number; h: number }, defaultColor: string | undefined, bounds: Bounds): BoxText {
  const bodyPr = child(wsp, 'wps:bodyPr');
  const vert = bodyPr?.attrs.vert ?? 'horz';
  if (vert !== 'horz' && vert !== 'vert' && vert !== 'vert270') fail(`text ${vert}`);
  const ins = (k: string, d: number) => (bodyPr?.attrs[k] !== undefined ? +bodyPr.attrs[k] : d) / EMU_PER_PX;
  let w = frame.w;
  let h = frame.h;
  let angle = frame.angle;
  let origin = frame.origin;
  if (vert !== 'horz') {
    // Turn the frame so the text runs along its long side.
    const turn = vert === 'vert' ? 90 : -90;
    const r = rotate(frame.angle);
    origin = vert === 'vert' ? addPt(frame.origin, apply(r, [frame.w, 0])) : addPt(frame.origin, apply(r, [0, frame.h]));
    angle = frame.angle + turn;
    [w, h] = [h, w];
  }
  const l = ins('lIns', 91440);
  const r = ins('rIns', 91440);
  const t = ins('tIns', 45720);
  const b = ins('bIns', 45720);
  const wrap = bodyPr?.attrs.wrap !== 'none';
  const paras = readParagraphs(content, ctx, defaultColor);
  if (paras.every((p) => p.runs.every((x) => !x.text.trim()))) return { svg: '' };
  const lines = layoutLines(paras, wrap ? Math.max(1, w - l - r) : 0);
  // Heights: each line's own, plus the gaps between paragraphs.
  const heights = lines.map((ln) => lineHeight(ln.size, ln.runs[0]?.font, ln.factor));
  const total = lines.reduce((s, ln, k) => s + ln.gap + heights[k], 0);
  const anchor = bodyPr?.attrs.anchor ?? 't';
  const inner = h - t - b;
  let y = t + (anchor === 'ctr' ? (inner - total) / 2 : anchor === 'b' ? inner - total : 0);
  const out: string[] = [];
  lines.forEach((ln, k) => {
    y += ln.gap;
    const baseline = y + ln.size * 0.891;
    y += heights[k];
    if (!ln.runs.some((x) => x.text.trim())) return;
    const x = ln.align === 'middle' ? l + (w - l - r) / 2 : ln.align === 'end' ? w - r : l;
    const first = ln.runs[0];
    let shift = 0;
    const spans = ln.runs
      .map((run) => {
        const want = run.vert === 'subscript' ? run.sizePx * 0.15 : run.vert === 'superscript' ? -run.sizePx * 0.35 : 0;
        const dy = want - shift;
        shift = want;
        const size = run.vert ? run.sizePx * 0.65 : run.sizePx;
        const attrs = [
          dy ? `dy="${num(dy)}"` : '',
          `font-size="${num(size)}"`,
          run.font !== first.font || run.ea !== first.ea ? `font-family="${escXml(fontStack(run.font, run.ea))}"` : '',
          run.bold ? 'font-weight="bold"' : '',
          run.italic ? 'font-style="italic"' : '',
          run.underline ? 'text-decoration="underline"' : '',
          run.color && run.color !== first.color ? `fill="${run.color}"` : '',
        ].filter(Boolean);
        return `<tspan ${attrs.join(' ')}>${escXml(run.text)}</tspan>`;
      })
      .join('');
    out.push(`<text x="${num(x)}" y="${num(baseline)}" text-anchor="${ln.align}" font-family="${escXml(fontStack(first.font, first.ea))}" fill="${first.color ?? '#000000'}" xml:space="preserve">${spans}</text>`);
    // Bounds: the line's ink, roughly.
    const left = ln.align === 'middle' ? x - ln.width / 2 : ln.align === 'end' ? x - ln.width : x;
    const rot = rotate(angle);
    for (const p of [[left, baseline - ln.size], [left + ln.width, baseline + ln.size * 0.25]] as Pt[]) grow(bounds, addPt(origin, apply(rot, p)));
  });
  if (!out.length) return { svg: '' };
  const transform = `translate(${num(origin[0])} ${num(origin[1])})${angle ? ` rotate(${num(angle)})` : ''}`;
  return { svg: `<g transform="${transform}">${out.join('')}</g>` };
}

const addPt = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];

// ---- shapes and groups ----

interface Writer {
  ctx: DrawContext;
  defs: SvgDefs;
  out: string[];
  bounds: Bounds;
}

interface Xfrm {
  off: Pt;
  ext: Pt;
  rot: number;
  flipH: boolean;
  flipV: boolean;
  chOff?: Pt;
  chExt?: Pt;
}

function xfrmOf(el: XmlElement | undefined): Xfrm | undefined {
  if (!el) return undefined;
  const off = child(el, 'a:off');
  const ext = child(el, 'a:ext');
  if (!off || !ext) return undefined;
  const pt = (e: XmlElement | undefined, a: string, b: string): Pt | undefined => (e ? [+(e.attrs[a] ?? 0), +(e.attrs[b] ?? 0)] : undefined);
  return {
    off: pt(off, 'x', 'y')!,
    ext: pt(ext, 'cx', 'cy')!,
    rot: +(el.attrs.rot ?? 0) / 60000,
    flipH: /^(1|true)$/.test(el.attrs.flipH ?? ''),
    flipV: /^(1|true)$/.test(el.attrs.flipV ?? ''),
    chOff: pt(child(el, 'a:chOff'), 'x', 'y'),
    chExt: pt(child(el, 'a:chExt'), 'cx', 'cy'),
  };
}

/** Rotation and flips about the centre of a w × h box at the origin. */
function turnAbout(w: number, h: number, x: Xfrm): Matrix {
  if (!x.rot && !x.flipH && !x.flipV) return IDENTITY;
  return mul(translate(w / 2, h / 2), mul(rotate(x.rot), mul(scale(x.flipH ? -1 : 1, x.flipV ? -1 : 1), translate(-w / 2, -h / 2))));
}

/** One shape; `m` maps its parent's coordinates to page px. `box` overrides its own position (a lone shape fills its drawing). */
function drawShape(wsp: XmlElement, m: Matrix, w: Writer, box?: { x: number; y: number; cx: number; cy: number }): void {
  const nv = child(wsp, 'wps:cNvPr');
  if (/^(1|true)$/.test(nv?.attrs.hidden ?? '')) return;
  const spPr = child(wsp, 'wps:spPr');
  const x = xfrmOf(child(spPr, 'a:xfrm')) ?? (box ? { off: [0, 0] as Pt, ext: [box.cx, box.cy] as Pt, rot: 0, flipH: false, flipV: false } : fail('shape without a position'));
  const [cw, ch] = box ? [box.cx, box.cy] : x.ext;
  const place = box ? translate(box.x, box.y) : translate(x.off[0], x.off[1]);
  const local = mul(m, mul(place, turnAbout(cw, ch, x)));
  const style = child(wsp, 'wps:style');
  const { ctx, defs, out, bounds } = w;

  // Outline and fill.
  const prst = child(spPr, 'a:prstGeom');
  const cust = child(spPr, 'a:custGeom');
  const paths = prst ? presetPath(prst.attrs.prst ?? 'rect', cw, ch, adjOf(prst)) : cust ? customPath(cust, cw, ch) : presetPath('rect', cw, ch, {});
  const stroke = strokeOf(child(spPr, 'a:ln'), child(style, 'a:lnRef'), ctx.theme);
  const fillRef = child(style, 'a:fillRef');
  const refFill: Fill | undefined = +(fillRef?.attrs.idx ?? 0) > 0 ? (colorOf(fillRef, ctx.theme) ? { kind: 'solid', color: colorOf(fillRef, ctx.theme)! } : undefined) : undefined;
  const fill = fillOf(spPr, ctx.theme, colorOf(fillRef, ctx.theme)) ?? refFill ?? { kind: 'none' };
  const pad = (stroke?.width ?? 0) / 2;
  for (const sub of paths) {
    let segs = sub.segs;
    const heads: string[] = [];
    if (sub.open && stroke && sub.stroke && (stroke.head || stroke.tail)) {
      const e = ends(segs, local);
      if (e) {
        if (stroke.head) {
          const a = arrowHead(stroke.head, e.start[0], e.start[1], stroke, bounds);
          heads.push(a.svg);
          segs = shorten(segs, local, false, a.back);
        }
        if (stroke.tail) {
          const a = arrowHead(stroke.tail, e.end[0], e.end[1], stroke, bounds);
          heads.push(a.svg);
          segs = shorten(segs, local, true, a.back);
        }
      }
    }
    const d = pathD(segs, local, bounds, sub.stroke && stroke ? pad : 0);
    const f = sub.fill ? fill : undefined;
    const s = sub.stroke ? stroke : undefined;
    if ((f && f.kind !== 'none') || s) out.push(`<path d="${d}" ${fillAttrs(f, defs)} ${strokeAttrs(s)}/>`);
    out.push(...heads);
  }

  // Text.
  const content = find(child(wsp, 'wps:txbx') ?? { name: '', attrs: {}, children: [] }, 'w:txbxContent');
  if (content) {
    const fontColor = colorOf(child(style, 'a:fontRef'), ctx.theme);
    // The frame in page px: its corners through the shape's transform. Word never mirrors
    // text: a horizontal flip leaves it be, a vertical one turns the frame upside down.
    const turn = x.rot + (x.flipV ? 180 : 0);
    const plain = mul(m, mul(place, turn ? mul(translate(cw / 2, ch / 2), mul(rotate(turn), translate(-cw / 2, -ch / 2))) : IDENTITY));
    const o = apply(plain, [0, 0]);
    const ex = apply(plain, [cw, 0]);
    const ey = apply(plain, [0, ch]);
    const frame = { origin: o, angle: (Math.atan2(ex[1] - o[1], ex[0] - o[0]) * 180) / Math.PI, w: Math.hypot(ex[0] - o[0], ex[1] - o[1]), h: Math.hypot(ey[0] - o[0], ey[1] - o[1]) };
    const text = drawText(wsp, content, ctx, frame, fontColor?.hex, bounds);
    if (text.svg) out.push(text.svg);
  }
}

/** A group's children; `m` maps the group's parent coordinates to page px. */
function drawGroup(grp: XmlElement, m: Matrix, w: Writer, box?: { x: number; y: number; cx: number; cy: number }): void {
  const props = child(grp, 'wpg:grpSpPr');
  const x = xfrmOf(child(props, 'a:xfrm'));
  if (!x) return fail('group without a position');
  const [ow, oh] = box ? [box.cx, box.cy] : x.ext;
  const place = box ? translate(box.x, box.y) : translate(x.off[0], x.off[1]);
  const chOff = x.chOff ?? [0, 0];
  const chExt = x.chExt ?? x.ext;
  const toChild = mul(scale(chExt[0] ? ow / chExt[0] : 1, chExt[1] ? oh / chExt[1] : 1), translate(-chOff[0], -chOff[1]));
  drawChildren(grp, mul(m, mul(place, mul(turnAbout(ow, oh, x), toChild))), w);
}

function drawChildren(parent: XmlElement, m: Matrix, w: Writer): void {
  for (const c of elements(parent)) {
    switch (c.name) {
      case 'wps:wsp':
        drawShape(c, m, w);
        break;
      case 'wpg:grpSp':
        drawGroup(c, m, w);
        break;
      case 'mc:AlternateContent': {
        const choice = child(c, 'mc:Choice');
        const requires = (choice?.attrs.Requires ?? '').split(/\s+/);
        const pick = choice && requires.every((r) => ['wps', 'wpg', 'wpc', 'a14', 'wp14', 'w14'].includes(r)) ? choice : child(c, 'mc:Fallback');
        if (pick) drawChildren(pick, m, w);
        break;
      }
      case 'wpg:cNvGrpSpPr':
      case 'wpg:grpSpPr':
      case 'wpg:cNvPr':
      case 'wpc:bg':
      case 'wpc:whole':
      case 'a:extLst':
        break;
      default:
        // A picture, chart, SmartArt or ink inside the drawing.
        fail(`group child ${c.name}`);
    }
  }
}

function drawPiece(piece: Piece, m: Matrix, w: Writer): void {
  const g = piece.graphic;
  const box = { x: piece.x, y: piece.y, cx: piece.cx, cy: piece.cy };
  switch (g.name) {
    case 'wpg:wgp':
      drawGroup(g, m, w, box);
      break;
    case 'wps:wsp':
      drawShape(g, m, w, box);
      break;
    case 'wpc:wpc':
      // A drawing canvas: its shapes sit in the canvas's own EMU, top-left at the drawing.
      drawChildren(g, mul(m, translate(piece.x, piece.y)), w);
      break;
    default:
      fail(`graphic ${g.name}`);
  }
}

/** The graphic content of a `w:drawing` (`wpg:wgp`, `wps:wsp`, `wpc:wpc`, `pic:pic`, `c:chart`…). */
export function graphicOf(drawing: XmlElement): XmlElement | undefined {
  const data = find(drawing, 'a:graphicData');
  return data ? elements(data)[0] : undefined;
}

/** Can this drawing be drawn here at all (shapes, not pictures or charts)? A quick test before pooling. */
export function isShapeGraphic(g: XmlElement | undefined): boolean {
  return !!g && (g.name === 'wpg:wgp' || g.name === 'wps:wsp' || g.name === 'wpc:wpc');
}

/** Pad around the drawing so edge strokes and arrowheads are not cut (px). */
const PAD = 2;

/**
 * Draw pieces (one drawing, or a diagram's floating shapes pooled together) into one
 * picture. The picture is the pieces' frame, grown to whatever ink spills over it.
 * Null when anything in them cannot be drawn.
 */
export function drawPieces(pieces: readonly Piece[], ctx: DrawContext): Drawn | null {
  if (!pieces.length) return null;
  const minX = Math.min(...pieces.map((p) => p.x));
  const minY = Math.min(...pieces.map((p) => p.y));
  const maxX = Math.max(...pieces.map((p) => p.x + p.cx));
  const maxY = Math.max(...pieces.map((p) => p.y + p.cy));
  const toPx = mul(scale(1 / EMU_PER_PX, 1 / EMU_PER_PX), translate(-minX, -minY));
  const frame = { x0: 0, y0: 0, x1: (maxX - minX) / EMU_PER_PX, y1: (maxY - minY) / EMU_PER_PX };
  const w: Writer = { ctx, defs: new SvgDefs('k'), out: [], bounds: { ...frame } };
  try {
    for (const piece of [...pieces].sort((a, b) => a.z - b.z)) drawPiece(piece, toPx, w);
  } catch (e) {
    if (e instanceof CannotDraw) return null;
    throw e;
  }
  if (!w.out.length) return null;
  const b = w.bounds;
  const x0 = Math.floor(b.x0 - PAD);
  const y0 = Math.floor(b.y0 - PAD);
  const width = Math.ceil(b.x1 + PAD) - x0;
  const height = Math.ceil(b.y1 + PAD) - y0;
  const body = `<g transform="translate(${-x0} ${-y0})">${w.out.join('')}</g>`;
  const labels = new Set(pieces.flatMap((p) => findAll(p.graphic, 'w:txbxContent').map((box) => textOf(box).replace(/\s+/g, ''))));
  const letters = ['A', 'B', 'C', 'D'].filter((l) => [l, `${l}.`, `(${l})`, `${l})`].some((t) => labels.has(t))).length;
  return { svg: svgDocument(width, height, body, w.defs), widthPx: width, heightPx: height, optionLetters: letters >= 3 };
}

