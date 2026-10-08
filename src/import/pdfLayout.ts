/**
 * PDF page geometry → reader lines. Pure: positioned text items in, `RawLine`s out, so
 * every layout rule is tested on plain arrays; pdf.js extraction is `readPdf.ts`.
 *
 * Per page: rows by baseline; running headers/footers (same text, same place, most pages)
 * dropped; two-column bands read column by column; items on one row re-attached by x
 * (detached option letters, hanging question numbers, right-aligned marks). Then rows in
 * aligned columns become table cells and wrapped lines are joined into paragraphs, so the
 * engine reads a PDF in `paragraph` mode and never joins twice.
 * Coordinates are PDF points, y up from the page's bottom; `y` is a baseline.
 */
import { normalizeRuns } from '@/model/text';
import { labelLevel, marksOnly, parseLabel, trailingMarks } from './labels';
import { labelZone, repeatKey, tidyText } from './normalize';
import type { RawLine, RawRun } from './readPlain';
import { joinRuns } from './walk';

export interface PdfItem {
  str: string;
  x: number;
  y: number;
  w: number;
  size: number;
  bold?: boolean;
  italic?: boolean;
  rotated?: boolean;
}

export interface PdfBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the operator list drew: a picture, a thin rule, or any other painted path. */
export interface PdfGraphic {
  kind: 'image' | 'rule' | 'shape';
  box: PdfBox;
  /** A path with curves or slanted segments (graph lines), not only boxes. */
  curved?: boolean;
}

export interface PdfPage {
  width: number;
  height: number;
  items: PdfItem[];
  graphics?: PdfGraphic[];
}

/** A reader line with its place; `figure` marks a picture region (a slot, or a crop). */
export interface PdfLine extends RawLine {
  page: number;
  x: number;
  y: number;
  figure?: PdfBox;
}

export interface PdfLayout {
  lines: PdfLine[];
  /** The first large-type line near the top of the first page. */
  heading?: string;
}

// ---- small helpers ----

const CJK = /[㐀-鿿豈-﫿＀-￯　-〿]/;
const PAGE_NUMBER = /^[-–—\s]*(?:page\s*)?\d{1,3}(?:\s*(?:\/|of)\s*\d{1,3})?[-–—\s]*$|^第\s*\d{1,3}\s*頁/i;
const ENDS_SENTENCE = /[.?!。？！:：;；]["'”’)]?$/;

const right = (it: PdfItem) => it.x + it.w;
const plain = (runs: readonly RawRun[]) => runs.map((r) => r.text).join('');

function percentile(values: number[], p: number, fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** A whole item that is only a label: "1." "(a)" "A." "(1)" "第3題". */
export function isLabelText(text: string): boolean {
  const t = text.trim();
  const label = t && parseLabel(labelZone(`${t} `));
  return !!label && label.text.trim().length >= t.length;
}

const contains = (box: PdfBox, x: number, y: number, pad = 0) =>
  x >= box.x - pad && x <= box.x + box.w + pad && y >= box.y - pad && y <= box.y + box.h + pad;

const overlaps = (a: PdfBox, b: PdfBox, pad = 0) =>
  a.x - pad <= b.x + b.w && b.x - pad <= a.x + a.w && a.y - pad <= b.y + b.h && b.y - pad <= a.y + a.h;

const union = (a: PdfBox, b: PdfBox): PdfBox => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

// ---- figures and rules ----

/**
 * Picture regions: images, and clusters of paths with a drawing in them (a curve or slant,
 * or a filled shape with no text on it). Rules alone are table borders and answer lines;
 * a path behind text is a shaded cell or a frame. A region that covers most of a page
 * that has text is a background (an OCR'd scan), not a figure.
 */
export function findFigures(page: PdfPage): { figures: PdfBox[]; rules: PdfBox[] } {
  const graphics = page.graphics ?? [];
  const rules = graphics.filter((g) => g.kind === 'rule').map((g) => g.box);
  const centres = page.items.filter((it) => it.str.trim()).map((it) => ({ x: it.x + it.w / 2, y: it.y + it.size * 0.3 }));
  const area = page.width * page.height;
  const isDrawing = (g: PdfGraphic) =>
    g.kind === 'image' || (g.kind === 'shape' && (g.curved || !centres.some((c) => contains(g.box, c.x, c.y))));
  // A filled box behind text (a shaded cell, a frame) or a page-sized path is never part of a picture.
  const drawn = graphics.filter((g) => g.kind === 'image' || g.kind === 'rule' || (isDrawing(g) && g.box.w * g.box.h < area * 0.9));

  // Union-find over graphics that touch.
  const parent = drawn.map((_, k) => k);
  const find = (k: number): number => (parent[k] === k ? k : (parent[k] = find(parent[k])));
  for (let a = 0; a < drawn.length; a++) {
    for (let b = a + 1; b < drawn.length; b++) if (overlaps(drawn[a].box, drawn[b].box, 3)) parent[find(a)] = find(b);
  }
  const groups = new Map<number, PdfGraphic[]>();
  for (let k = 0; k < drawn.length; k++) groups.set(find(k), [...(groups.get(find(k)) ?? []), drawn[k]]);

  const figures: PdfBox[] = [];
  for (const group of groups.values()) {
    if (!group.some(isDrawing)) continue;
    const box = group.map((g) => g.box).reduce(union);
    if (box.w < 24 || box.h < 24) continue;
    const inside = page.items.filter((it) => it.str.trim() && contains(box, it.x + it.w / 2, it.y + it.size * 0.3));
    if (box.w * box.h > area * 0.5 && inside.length > 0) continue;
    // Text covering much of it: a table or a text box with a border, not a picture.
    if (inside.reduce((sum, it) => sum + it.w * it.size, 0) > box.w * box.h * 0.2) continue;
    figures.push(box);
  }
  // Grow each figure by the axes beside it and its short labels ("P", "Quantity", "0"),
  // so a crop shows them and they stay out of the text. Lines that start with a label
  // ("A. …") are never taken.
  const labels = page.items.filter((it) => it.str.trim() && it.str.trim().length <= 24 && !isLabelText(it.str) && !it.rotated);
  for (let k = 0; k < figures.length; k++) {
    for (let grown = true; grown; ) {
      grown = false;
      for (const r of rules) {
        if (!contains(figures[k], r.x, r.y) && overlaps(figures[k], r, 12) && r.w < page.width * 0.6) {
          const next = union(figures[k], r);
          grown = next.w !== figures[k].w || next.h !== figures[k].h;
          figures[k] = next;
        }
      }
      for (const it of labels) {
        const box = { x: it.x, y: it.y - it.size * 0.25, w: it.w, h: it.size * 1.2 };
        if (!overlaps(figures[k], box, 8)) continue;
        const next = union(figures[k], box);
        if (next.w !== figures[k].w || next.h !== figures[k].h) {
          grown = true;
          figures[k] = next;
        }
      }
    }
  }
  // Merge figures that overlap after growing (a graph drawn in several clusters).
  for (let changed = true; changed; ) {
    changed = false;
    for (let a = 0; a < figures.length && !changed; a++) {
      for (let b = a + 1; b < figures.length && !changed; b++) {
        if (overlaps(figures[a], figures[b], 2)) {
          figures[a] = union(figures[a], figures[b]);
          figures.splice(b, 1);
          changed = true;
        }
      }
    }
  }
  return { figures, rules };
}

// ---- rows ----

interface Row {
  top: number;
  y: number;
  size: number;
  items: PdfItem[];
  figure?: PdfBox;
}

/** Group items by baseline (tolerance half the type size), each row sorted left to right. */
export function rowsOf(items: readonly PdfItem[]): Row[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Row[] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && row.top - it.y <= 0.5 * Math.max(it.size, row.size)) {
      row.items.push(it);
      row.size = Math.max(row.size, it.size);
    } else rows.push({ top: it.y, y: it.y, size: it.size, items: [it] });
  }
  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x);
    row.y = row.items.reduce((best, it) => (it.w > best.w ? it : best)).y;
  }
  return rows;
}

const rowText = (row: Row) => row.items.map((it) => it.str.trim()).join(' ');
const rowLeft = (row: Row) => (row.figure ? row.figure.x : Math.min(...row.items.map((it) => it.x)));
const rowRight = (row: Row) => (row.figure ? row.figure.x + row.figure.w : Math.max(...row.items.map(right)));

/** Rows that repeat in the same place on most pages, and lone page numbers, in the top or bottom band. */
function noiseRows(pages: ReadonlyArray<{ page: PdfPage; rows: Row[] }>): Set<Row> {
  const noise = new Set<Row>();
  const edge = (p: PdfPage, row: Row) => row.y > p.height * 0.9 || row.y < p.height * 0.1;
  const byKey = new Map<string, Array<{ page: number; row: Row }>>();
  pages.forEach(({ page, rows }, k) => {
    for (const row of rows) {
      if (!edge(page, row)) continue;
      if (PAGE_NUMBER.test(rowText(row))) noise.add(row);
      // A numbered line is content, however alike ("1. Define…", "2. Define…").
      const label = parseLabel(labelZone(`${row.items[0].str.trim()} `));
      if (label && labelLevel(label.family) === 'question') continue;
      const key = repeatKey(rowText(row));
      byKey.set(key, [...(byKey.get(key) ?? []), { page: k, row }]);
    }
  });
  const need = pages.length >= 3 ? Math.ceil(pages.length / 2) : 2;
  if (pages.length < 2) return noise;
  for (const entries of byKey.values()) {
    for (const e of entries) {
      const pagesHere = new Set(entries.filter((o) => Math.abs(o.row.y - e.row.y) <= 3).map((o) => o.page));
      if (pagesHere.size >= need) noise.add(e.row);
    }
  }
  return noise;
}

// ---- columns ----

interface Region {
  page: number;
  rows: Row[];
  /** `full` regions share the document's margins; a column keeps its own. */
  column: 'full' | 'left' | 'right';
}

/**
 * Split a page into regions in reading order. A gutter is an x no row crosses; a band of
 * rows that do not cross it is two columns only when both sides hold several lines of
 * prose (a table or an option row also leaves a gap, but its cells are short).
 */
export function regionsOf(rows: readonly Row[], page: number): Region[] {
  const text = rows.filter((r) => !r.figure);
  if (text.length < 5) return [{ page, rows: [...rows], column: 'full' }];
  const left = Math.min(...text.map(rowLeft));
  const rightEdge = Math.max(...text.map(rowRight));
  const width = rightEdge - left;
  const crosses = (row: Row, g: number) =>
    row.figure ? row.figure.x < g && row.figure.x + row.figure.w > g : row.items.some((it) => it.x < g - 1 && right(it) > g + 1);

  let best = { g: 0, count: Infinity, run: 0 };
  let run = 0;
  let prevCount = -1;
  for (let g = left + width * 0.3; g <= left + width * 0.7; g += 1) {
    const count = rows.filter((r) => crosses(r, g)).length;
    run = count === prevCount ? run + 1 : 1;
    prevCount = count;
    if (count < best.count || (count === best.count && run > best.run)) best = { g: g - (run - 1) / 2, count, run };
  }
  if (best.count > rows.length * 0.6) return [{ page, rows: [...rows], column: 'full' }];
  const g = best.g;

  const prose = (sideRows: Row[], from: number, to: number) =>
    sideRows.filter((r) => !r.figure && r.items.length && rowRight(r) - rowLeft(r) >= (to - from) * 0.5).length;
  const regions: Region[] = [];
  const pushFull = (rs: Row[]) => {
    const last = regions[regions.length - 1];
    if (last?.column === 'full') last.rows.push(...rs);
    else regions.push({ page, rows: [...rs], column: 'full' });
  };
  let band: Row[] = [];
  const flush = () => {
    if (!band.length) return;
    const split = (row: Row, side: 'left' | 'right'): Row | null => {
      if (row.figure) return (row.figure.x + row.figure.w / 2 < g) === (side === 'left') ? row : null;
      const items = row.items.filter((it) => (it.x + it.w / 2 < g) === (side === 'left'));
      return items.length ? { ...row, items, y: items.reduce((b, it) => (it.w > b.w ? it : b)).y } : null;
    };
    const l = band.map((r) => split(r, 'left')).filter((r): r is Row => !!r);
    const r = band.map((row) => split(row, 'right')).filter((row): row is Row => !!row);
    const twoColumns = band.length >= 5 && prose(l, left, g) >= 3 && prose(r, g, rightEdge) >= 3;
    if (twoColumns) regions.push({ page, rows: l, column: 'left' }, { page, rows: r, column: 'right' });
    else pushFull(band);
    band = [];
  };
  for (const row of rows) {
    if (crosses(row, g)) {
      flush();
      pushFull([row]);
    } else band.push(row);
  }
  flush();
  return regions;
}

// ---- lines ----

interface Seg {
  items: PdfItem[];
  x: number;
  right: number;
  runs: RawRun[];
}

interface VLine {
  kind: 'text' | 'cells' | 'marks' | 'figure';
  page: number;
  y: number;
  x: number;
  /** Where the body starts, after a label. */
  bodyX: number;
  right: number;
  size: number;
  runs: RawRun[];
  segs: Seg[];
  labelled: boolean;
  marks?: RawRun[];
  /** One of several items on a row: it never takes a wrapped line. */
  rowItem?: boolean;
  cells?: RawRun[][];
  figure?: PdfBox;
  column: Region['column'];
  /** The x its indent is read from: a row's first item, a table's left edge. */
  depthX?: number;
}

/** A drawn rule under the gap between `from` and `to` on baseline `y`: an answer blank. */
const blankIn = (rules: readonly PdfBox[], from: number, to: number, y: number, size: number) =>
  to - from > size * 0.5 && rules.some((r) => r.x < to && r.x + r.w > from && r.w >= size && r.y <= y + size * 0.3 && r.y >= y - size * 0.6);

function itemRuns(items: readonly PdfItem[], rules: readonly PdfBox[] = []): RawRun[] {
  const runs: RawRun[] = [];
  let prev: PdfItem | undefined;
  for (const it of items) {
    const str = tidyText(it.str);
    if (prev) {
      const gap = it.x - right(prev);
      const tight = CJK.test(prev.str.slice(-1)) && CJK.test(str[0] ?? '') && gap < prev.size * 0.6;
      if (blankIn(rules, right(prev), it.x, it.y, it.size)) runs.push({ text: ' ______ ' });
      else if (gap > prev.size * 0.15 && !tight && !/\s$/.test(prev.str) && !/^\s/.test(str)) runs.push({ text: ' ' });
    }
    runs.push({ text: str, ...(it.bold ? { bold: true } : {}), ...(it.italic ? { italic: true } : {}) });
    prev = it;
  }
  return normalizeRuns(runs) as RawRun[];
}

/** Where an item starts after a gap wider than a word space: a possible column. */
const softSplits = (row: Row): number[] =>
  row.items.filter((it, k) => k > 0 && it.x - right(row.items[k - 1]) >= row.size * 0.8).map((it) => it.x);

/**
 * Split points per row: a wide gap always; a narrower one when the row above or below
 * starts a column at the same x (a table whose first column is nearly full).
 */
function columnSplits(rows: readonly Row[]): Array<Set<number>> {
  const soft = rows.map(softSplits);
  return rows.map((row, k) => {
    const near = [rows[k - 1], rows[k + 1]].map((r, j) => (r && !r.figure && Math.abs(r.y - row.y) <= row.size * 2.5 ? soft[k - 1 + j * 2] : []));
    return new Set(soft[k].filter((x) => near.some((xs) => xs.some((o) => Math.abs(o - x) <= 2))));
  });
}

function segmentsOf(row: Row, splits: ReadonlySet<number>, rules: readonly PdfBox[]): Seg[] {
  const segs: PdfItem[][] = [];
  for (const it of row.items) {
    const seg = segs[segs.length - 1];
    const last = seg?.[seg.length - 1];
    if (last && it.x - right(last) < row.size * 1.5 && !splits.has(it.x)) seg.push(it);
    else segs.push([it]);
  }
  const out = segs.map((items) => ({ items, x: items[0].x, right: Math.max(...items.map(right)), runs: itemRuns(items, rules) }));
  // A label standing alone (a hanging number, a detached option letter) takes the text after it.
  for (let k = out.length - 2; k >= 0; k--) {
    if (!isLabelText(plain(out[k].runs)) || isLabelText(plain(out[k + 1].runs))) continue;
    const items = [...out[k].items, ...out[k + 1].items];
    out.splice(k, 2, { items, x: out[k].x, right: out[k + 1].right, runs: normalizeRuns([...out[k].runs, { text: ' ' }, ...out[k + 1].runs]) as RawRun[] });
  }
  return out;
}

/** Join segments of a lone row; a rule in the gap is an answer blank. */
function joinSegs(segs: readonly Seg[], y: number, size: number, rules: readonly PdfBox[]): RawRun[] {
  let runs: RawRun[] = [];
  segs.forEach((seg, k) => {
    if (k > 0) {
      runs.push({ text: blankIn(rules, segs[k - 1].right, seg.x, y, size) ? ' ______ ' : ' ' });
    }
    runs = runs.concat(seg.runs);
  });
  return normalizeRuns(runs) as RawRun[];
}

function lineOf(row: Row, region: Region, rules: readonly PdfBox[], splits: ReadonlySet<number>): VLine[] {
  const base = { page: region.page, y: row.y, size: row.size, column: region.column, labelled: false, segs: [] as Seg[] };
  if (row.figure) {
    const f = row.figure;
    return [{ ...base, kind: 'figure', x: f.x, bodyX: f.x, right: f.x + f.w, y: f.y + f.h, runs: [], figure: f }];
  }
  const segs = segmentsOf(row, splits, rules);
  let marks: RawRun[] | undefined;
  const last = segs[segs.length - 1];
  if (segs.length && marksOnly(plain(last.runs))) {
    marks = last.runs;
    segs.pop();
  }
  if (!segs.length) {
    return [{ ...base, kind: 'marks', x: last.x, bodyX: last.x, right: last.right, runs: [], marks }];
  }
  const labelled = (seg: Seg) => {
    const t = plain(seg.runs).trimStart();
    const label = parseLabel(labelZone(t));
    return label && label.length < t.length ? label : null;
  };
  const bodyX = (seg: Seg) => {
    const first = seg.items[0];
    if (isLabelText(first.str)) return seg.items[1]?.x ?? seg.x;
    // "1. Many students…" in one item: the label's share of its width.
    const label = parseLabel(labelZone(first.str.trimStart()));
    return label && label.length < first.str.length ? first.x + (first.w * label.length) / first.str.length : seg.x;
  };
  if (segs.length >= 2 && segs.every((s) => labelled(s))) {
    return segs.map((seg, k) => ({
      ...base,
      kind: 'text' as const,
      x: seg.x,
      bodyX: bodyX(seg),
      right: seg.right,
      runs: seg.runs,
      segs: [seg],
      labelled: true,
      rowItem: true,
      depthX: segs[0].x,
      ...(k === segs.length - 1 && marks ? { marks } : {}),
    }));
  }
  const first = segs[0];
  return [
    {
      ...base,
      kind: segs.length >= 2 ? 'cells' : 'text',
      x: first.x,
      bodyX: bodyX(first),
      right: segs[segs.length - 1].right,
      runs: segs.length >= 2 ? joinSegs(segs, row.y, row.size, rules) : first.runs,
      segs,
      labelled: !!labelled(first),
      ...(marks ? { marks } : {}),
    },
  ];
}

/** Cells of a table run, aligned to columns found across all its rows. */
function alignCells(rows: readonly VLine[]): RawRun[][][] {
  const spans = rows.flatMap((r) => r.segs.map((s) => ({ x: s.x, right: s.right }))).sort((a, b) => a.x - b.x);
  const columns: Array<{ x: number; right: number }> = [];
  for (const s of spans) {
    const col = columns.find((c) => s.x <= c.right + 2 && s.right >= c.x - 2);
    if (col) {
      col.x = Math.min(col.x, s.x);
      col.right = Math.max(col.right, s.right);
    } else columns.push({ ...s });
  }
  columns.sort((a, b) => a.x - b.x);
  return rows.map((row) => {
    const cells: RawRun[][] = columns.map(() => []);
    for (const seg of row.segs) {
      const mid = (seg.x + seg.right) / 2;
      let k = columns.findIndex((c) => mid >= c.x - 2 && mid <= c.right + 2);
      if (k < 0) k = columns.length - 1;
      cells[k] = cells[k].length ? (normalizeRuns([...cells[k], { text: ' ' }, ...seg.runs]) as RawRun[]) : seg.runs;
    }
    return cells;
  });
}

interface Geometry {
  bodySize: number;
  step: number;
  margin: number;
  colRight: number;
}

function geometryOf(lines: readonly VLine[], fallback?: Geometry): Geometry {
  const text = lines.filter((l) => l.kind === 'text');
  // The size most characters are set in.
  const sizes = text.flatMap((l) => l.segs.flatMap((s) => s.items.flatMap((it) => Array<number>(Math.min(it.str.length, 200)).fill(it.size))));
  const bodySize = percentile(sizes, 0.5, fallback?.bodySize ?? 11);
  const steps: number[] = [];
  for (let k = 1; k < lines.length; k++) {
    const d = lines[k - 1].y - lines[k].y;
    if (lines[k].page === lines[k - 1].page && d > bodySize * 0.9 && d < bodySize * 2) steps.push(Math.round(d * 2) / 2);
  }
  const counts = new Map<number, number>();
  for (const s of steps) counts.set(s, (counts.get(s) ?? 0) + 1);
  const mode = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
  return {
    bodySize,
    step: mode ?? fallback?.step ?? bodySize * 1.2,
    margin: percentile(text.map((l) => l.x), 0.03, fallback?.margin ?? 0),
    colRight: percentile(text.filter((l) => !l.rowItem).map((l) => l.right), 0.9, fallback?.colRight ?? 0),
  };
}

/** Tables, marks rows and wrapped lines inside one region. */
function settle(lines: VLine[], geo: Geometry): VLine[] {
  // Runs of rows with several cells, close together, are a table; a lone one is a line.
  for (let k = 0; k < lines.length; ) {
    if (lines[k].kind !== 'cells') {
      k++;
      continue;
    }
    let end = k + 1;
    while (end < lines.length && lines[end].kind === 'cells' && lines[end - 1].y - lines[end].y <= geo.step * 2) end++;
    const run = lines.slice(k, end);
    if (run.length >= 2) {
      const cells = alignCells(run);
      const left = Math.min(...run.map((l) => l.x));
      run.forEach((line, j) => {
        line.cells = cells[j];
        line.depthX = left;
        line.runs = normalizeRuns(cells[j].flatMap((c, n) => [...(n ? [{ text: '\t' }] : []), ...(c.length ? c : [])])) as RawRun[];
      });
    } else run[0].kind = 'text';
    k = end;
  }

  const out: VLine[] = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    // Marks alone on a row belong to the line just above.
    if (line.kind === 'marks') {
      if (prev && prev.kind !== 'figure' && !prev.marks && prev.y - line.y <= geo.step * 2) prev.marks = line.marks;
      else out.push({ ...line, kind: 'text', runs: line.marks ?? [] });
      continue;
    }
    if (prev && joins(prev, line, geo)) {
      prev.runs = joinRuns(prev.runs, line.runs) as RawRun[];
      prev.right = line.right;
      prev.y = line.y;
      prev.marks = line.marks;
      continue;
    }
    out.push(line);
  }
  return out;
}

/** `b` wraps `a`: close below it, at its body's indent, after a line that reached the margin. */
function joins(a: VLine, b: VLine, geo: Geometry): boolean {
  if (a.kind !== 'text' || b.kind !== 'text' || a.page !== b.page || a.marks || a.rowItem || b.rowItem || b.labelled) return false;
  if (a.y - b.y > geo.step * 1.45 || a.y <= b.y || Math.abs(a.size - b.size) > a.size * 0.2) return false;
  if (trailingMarks(plain(a.runs))) return false;
  const tol = a.size * 0.8;
  // Under the body of a labelled line; anywhere from the margin for a first-line indent.
  const from = a.labelled ? Math.min(a.x, a.bodyX) : Math.min(a.x, geo.margin);
  if (b.x < from - tol || b.x > a.bodyX + tol) return false;
  const width = Math.max(geo.colRight - geo.margin, a.size * 10);
  const slack = ENDS_SENTENCE.test(plain(a.runs).trim()) ? a.size * 2.5 : Math.max(width * 0.12, a.size * 4);
  return a.right >= geo.colRight - slack;
}

/** Lay out every page into reader lines, in reading order. */
export function layoutPdf(pages: readonly PdfPage[]): PdfLayout {
  const prepared = pages.map((page) => {
    const { figures, rules } = findFigures(page);
    const items = page.items.filter((it) => {
      if (it.rotated || !it.str.trim() || !(it.size > 0)) return false;
      if (it.x > page.width + 5 || right(it) < -5 || it.y < -5 || it.y > page.height + 5) return false;
      // Labels inside a figure (axes, curve names) are part of the picture.
      return !figures.some((f) => contains(f, it.x + it.w / 2, it.y + it.size * 0.3, 1));
    });
    return { page, rows: rowsOf(items), figures, rules };
  });
  const noise = noiseRows(prepared);
  const textPages = prepared.filter((p) => p.rows.length).length;

  const regions = prepared.flatMap(({ rows, figures, page }, k) => {
    const kept = rows.filter((r) => !noise.has(r));
    // In a document with no text at all (a scan), every page is a picture.
    const boxes = textPages ? figures : [{ x: 0, y: 0, w: page.width, h: page.height }];
    const figureRows: Row[] = boxes.map((f) => ({ top: f.y + f.h, y: f.y + f.h, size: 0, items: [], figure: f }));
    const all = [...kept, ...figureRows].sort((a, b) => b.top - a.top);
    return all.length ? regionsOf(all, k) : [];
  });

  const regionLines = regions.map((region) => ({
    region,
    lines: (() => {
      const splits = columnSplits(region.rows);
      return region.rows.flatMap((row, k) => lineOf(row, region, prepared[region.page].rules, splits[k]));
    })(),
  }));
  const docGeo = geometryOf(regionLines.filter((r) => r.region.column === 'full').flatMap((r) => r.lines));
  const settled = regionLines.map(({ region, lines }) => {
    const geo = region.column === 'full' ? docGeo : geometryOf(lines, docGeo);
    return { geo, lines: settle(lines, geo) };
  });

  const out: PdfLine[] = [];
  let heading: string | undefined;
  let lastPage = -1;
  for (const { geo, lines } of settled) {
    for (const line of lines) {
      const at = { page: line.page + 1, x: Math.round(line.x * 10) / 10, y: Math.round(line.y * 10) / 10 };
      const pageBreak = lastPage >= 0 && line.page !== lastPage;
      lastPage = line.page;
      if (line.kind === 'figure') {
        out.push({ ...at, runs: [], image: { src: '' }, figure: line.figure, ...(pageBreak ? { pageBreak } : {}) });
        continue;
      }
      const runs = line.marks ? (joinRuns(line.runs, line.marks) as RawRun[]) : line.runs;
      if (heading === undefined && out.length < 6 && line.size >= docGeo.bodySize * 1.15 && plain(runs).trim()) heading = plain(runs).trim();
      out.push({
        ...at,
        runs,
        marginDepth: Math.max(0, Math.round(((line.depthX ?? line.x) - geo.margin) / (geo.bodySize * 2))),
        ...(line.cells ? { cells: line.cells } : {}),
        ...(pageBreak ? { pageBreak } : {}),
      });
    }
  }
  return { lines: out, ...(heading ? { heading } : {}) };
}
