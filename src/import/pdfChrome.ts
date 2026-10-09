/**
 * A PDF's page chrome, from geometry alone: the rows `layoutPdf` drops as running headers
 * and footers (same text, same place, most pages) become the header and footer; a number
 * that counts up page by page is the page number; page 1's rows in the header's place,
 * when the other pages' header is not on page 1, are page 1's own header; and page 1's
 * leading rows that read as a heading are the masthead. Pure: positioned items in.
 */
import { repeatKey } from './normalize';
import {
  PAGE_MARK,
  PAGES_MARK,
  mastheadSpan,
  mastheadVerdict,
  rowIsEmpty,
  rowOf,
  zoneAt,
  type ChromeLeftover,
  type ChromeRow,
  type ChromeStyle,
  type ChromeZone,
  type DetectedChrome,
  type MastheadVerdict,
  type PageChrome,
  type Segment,
} from './pageChrome';
import type { PdfItem } from './pdfLayout';

export interface ChromeRowIn {
  y: number;
  size: number;
  items: PdfItem[];
  /** A picture region: never chrome, and it ends the masthead. */
  figure?: unknown;
}

export interface ChromeInput {
  pages: ReadonlyArray<{ width: number; height: number; rows: readonly ChromeRowIn[] }>;
  /** Rows `layoutPdf` drops as running headers, footers and page numbers. */
  noise: ReadonlySet<ChromeRowIn>;
  /** How far (pt) one running line may move between pages: 3 for a PDF, more for scanned pages. */
  tolerance?: number;
}

const text = (row: ChromeRowIn) => row.items.map((it) => it.str.trim()).join(' ');
const left = (row: ChromeRowIn) => Math.min(...row.items.map((it) => it.x));
const right = (row: ChromeRowIn) => Math.max(...row.items.map((it) => it.x + it.w));

function percentile(values: number[], p: number, fallback: number): number {
  if (!values.length) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

/** The body's type size: the size most of the text is set in. */
function bodySizeOf(pages: ChromeInput['pages']): number {
  const weight = new Map<number, number>();
  for (const p of pages) for (const r of p.rows) for (const it of r.items) weight.set(Math.round(it.size * 2) / 2, (weight.get(Math.round(it.size * 2) / 2) ?? 0) + it.str.length);
  return [...weight.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 11;
}

/** Items in word groups, split where the gap is wide (a tab's worth). */
function groups(row: ChromeRowIn): PdfItem[][] {
  const items = [...row.items].filter((it) => it.str.trim()).sort((a, b) => a.x - b.x);
  const out: PdfItem[][] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    const prev = last?.[last.length - 1];
    if (prev && it.x - (prev.x + prev.w) <= Math.max(1.5 * Math.max(it.size, prev.size), 10)) last.push(it);
    else out.push([it]);
  }
  return out;
}

const joined = (items: readonly PdfItem[]) =>
  items.reduce((s, it, k) => s + (k && it.x - (items[k - 1].x + items[k - 1].w) > it.size * 0.15 ? ' ' : '') + it.str, '').trim();

/** A row as zoned segments, against the text column `[l, r]`. `marks` replaces items' texts (page numbers). */
function segmentsOf(row: ChromeRowIn, l: number, r: number, bodySize: number, texts?: Map<PdfItem, string>): Segment[] {
  const width = Math.max(r - l, 1);
  const mid = (l + r) / 2;
  return groups(row).map((g) => {
    const x0 = g[0].x;
    const x1 = Math.max(...g.map((it) => it.x + it.w));
    const zone: ChromeZone =
      Math.abs((x0 + x1) / 2 - mid) <= width * 0.08 ? 'center' : x0 <= l + width * 0.05 ? 'left' : x1 >= r - width * 0.05 ? 'right' : zoneAt(((x0 + x1) / 2 - l) / width);
    const size = Math.round(Math.max(...g.map((it) => it.size)) * 2) / 2;
    const style: ChromeStyle = {
      ...(g.every((it) => it.bold) ? { bold: true } : {}),
      ...(g.every((it) => it.italic) ? { italic: true } : {}),
      ...(Math.abs(size - bodySize) >= 0.6 ? { size } : {}),
    };
    return { text: joined(g.map((it) => ({ ...it, str: texts?.get(it) ?? it.str }))), zone, style };
  });
}

interface Group {
  edge: 'top' | 'bottom';
  y: number;
  size: number;
  entries: Array<{ page: number; row: ChromeRowIn }>;
}

/** The noise rows grouped: one group per running line, with every page it is on. */
function runningGroups(input: ChromeInput): Group[] {
  const out: Group[] = [];
  const tolerance = input.tolerance ?? 3;
  input.pages.forEach((page, k) => {
    for (const row of page.rows) {
      if (!input.noise.has(row) || !row.items.length) continue;
      const edge = row.y > page.height / 2 ? 'top' : 'bottom';
      const key = repeatKey(text(row));
      const hit = out.find((g) => g.edge === edge && Math.abs(g.y - row.y) <= tolerance && repeatKey(text(g.entries[0].row)) === key);
      if (hit) hit.entries.push({ page: k, row });
      else out.push({ edge, y: row.y, size: row.size, entries: [{ page: k, row }] });
    }
  });
  return out;
}

/**
 * Page number marks for one instance of a running row: a number that differs between two
 * pages by as much as the pages do is the page; a number after "of" or "/" equal to the
 * page count is the count.
 */
function markNumbers(group: Group, at: { page: number; row: ChromeRowIn }, pageCount: number): Map<PdfItem, string> {
  const out = new Map<PdfItem, string>();
  const other = group.entries.find((e) => e.page !== at.page && e.row.items.length === at.row.items.length);
  at.row.items.forEach((it, k) => {
    const mine = [...it.str.matchAll(/\d+/g)];
    const theirs = other ? [...other.row.items[k].str.matchAll(/\d+/g)] : [];
    let s = it.str;
    let done = false;
    for (let j = mine.length - 1; j >= 0; j--) {
      const n = +mine[j][0];
      const isPage = other ? theirs.length === mine.length && +theirs[j][0] - n === other.page - at.page && n !== +theirs[j][0] : n === at.page + 1 && /^\D{0,8}\d{1,3}\D{0,8}$/.test(it.str.trim());
      const isCount = !isPage && n === pageCount && /(of|\/|／|共)\s*$/i.test(it.str.slice(0, mine[j].index));
      if (isPage || isCount) {
        s = s.slice(0, mine[j].index) + (isPage ? PAGE_MARK : PAGES_MARK) + s.slice(mine[j].index! + mine[j][0].length);
        done = true;
      }
    }
    if (done) out.set(it, s);
  });
  return out;
}

export interface PdfChrome {
  chrome?: PageChrome;
  /** Page-1 rows taken as page 1's header or footer, or as the masthead: out of the body. */
  taken: Set<ChromeRowIn>;
}

export function pdfChrome(input: ChromeInput): PdfChrome {
  const taken = new Set<ChromeRowIn>();
  const pages = input.pages;
  if (!pages.length) return { taken };
  const bodySize = bodySizeOf(pages);
  const body = pages.flatMap((p) => p.rows.filter((r) => !input.noise.has(r) && r.items.length));
  const l = percentile(body.map(left), 0.03, 0);
  const r = percentile(body.map(right), 0.97, pages[0].width);
  const pageCount = pages.length;
  const unsupported: ChromeLeftover[] = [];

  const all = runningGroups(input);
  // Lone page numbers count on every page they are on; a line repeated on most pages.
  // `layoutPdf` already decided these repeat; a stray lone number on one page of many is not a footer.
  const running = all.filter((g) => g.entries.length >= 2 || pageCount === 1);

  const toRows = (list: readonly Group[], where: 'header' | 'footer'): ChromeRow[] => {
    const rows: ChromeRow[] = [];
    for (const g of [...list].sort((a, b) => b.y - a.y)) {
      const at = g.entries.find((e) => e.page > 0) ?? g.entries[0];
      const got = rowOf(segmentsOf(at.row, l, r, bodySize, markNumbers(g, at, pageCount)));
      if ('tooMany' in got) {
        unsupported.push({ where, text: got.tooMany, reason: 'tooMany' });
        continue;
      }
      if (got.pageCount) unsupported.push({ where, text: got.pageCount, reason: 'pageCount' });
      rows.push(...got.rows.filter((row) => !rowIsEmpty(row)));
    }
    return rows;
  };
  const plainRows = (list: readonly ChromeRowIn[], where: 'header' | 'footer'): ChromeRow[] =>
    list.flatMap((row) => {
      const got = rowOf(segmentsOf(row, l, r, bodySize));
      if ('tooMany' in got) {
        unsupported.push({ where, text: got.tooMany, reason: 'tooMany' });
        return [];
      }
      return got.rows.filter((row) => !rowIsEmpty(row));
    });

  const chrome: PageChrome = { unsupported };
  const first = pages[0];
  const firstRows = first.rows.filter((row) => !input.noise.has(row) && row.items.length && !row.figure);
  for (const edge of ['top', 'bottom'] as const) {
    const where = edge === 'top' ? 'header' : 'footer';
    const list = running.filter((g) => g.edge === edge);
    if (!list.length) continue;
    const rows = toRows(list, where);
    if (rows.length) chrome[where] = { rows };
    if (pageCount < 2 || list.every((g) => g.entries.some((e) => e.page === 0))) continue;
    // Page 1 differs: its rows where the running ones print are its own header (or footer).
    const reach = Math.max(...list.map((g) => g.size)) * 1.6;
    const edgeY = edge === 'top' ? Math.min(...list.map((g) => g.y)) - reach : Math.max(...list.map((g) => g.y)) + reach;
    const own = firstRows.filter((row) => (edge === 'top' ? row.y >= edgeY : row.y <= edgeY)).sort((a, b) => b.y - a.y);
    for (const row of own) taken.add(row);
    const shared = list.filter((g) => g.entries.some((e) => e.page === 0));
    const variant: DetectedChrome = { rows: [...toRows(shared, where), ...plainRows(own, where)] };
    chrome[edge === 'top' ? 'firstPageHeader' : 'firstPageFooter'] = variant;
  }

  // The masthead: page 1's leading rows, top down, that read as a heading.
  const leading = firstRows.filter((row) => !taken.has(row)).sort((a, b) => b.y - a.y);
  const verdicts: MastheadVerdict[] = [];
  for (const row of leading) {
    const segs = segmentsOf(row, l, r, bodySize);
    const v = mastheadVerdict(segs.map((s) => s.text).join('   '), {
      centred: segs.length === 1 && segs[0].zone === 'center',
      bold: row.items.every((it) => it.bold),
      large: row.size >= bodySize + 1.5,
    });
    verdicts.push(v);
    if (v === 'stop') break;
  }
  const span = mastheadSpan(verdicts);
  const masthead: ChromeRow[] = [];
  for (const row of leading.slice(0, span)) {
    taken.add(row);
    const got = rowOf(segmentsOf(row, l, r, bodySize), { split: true });
    if (!('tooMany' in got)) masthead.push(...got.rows.filter((row) => !rowIsEmpty(row)));
  }
  if (masthead.length) chrome.masthead = masthead;

  const any = chrome.header || chrome.footer || chrome.firstPageHeader || chrome.firstPageFooter || chrome.masthead || unsupported.length;
  return { taken, ...(any ? { chrome } : {}) };
}
