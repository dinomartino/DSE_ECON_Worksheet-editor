import { columnCountOf, insertColumn, insertRow, type CellRect } from './table';
import { plain, rt } from './text';
import type { LanguageMode, TableBlock } from './types';

/**
 * Tables on the clipboard, both ways (Tables vs Word, phase 2).
 *
 * In: a table copied from Word, Excel, Numbers or a web page arrives as `text/html`
 * holding a `<table>`, and Excel's also as tab-separated `text/plain`. Either becomes a
 * grid of plain strings that fills the cells from the caret's cell on — the old paste put
 * the whole table into one cell as text. Out: a swept range goes back as both, so it
 * pastes into Word as a table and into Excel as cells.
 *
 * Pure string work rather than `DOMParser`, like the importer's reader, so it runs in
 * tests and nothing pasted is ever put into the page.
 */

/** A grid of cell texts, row by row. A hard break inside a cell is `\n`. */
export type TextGrid = string[][];

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', hellip: '…', times: '×', middot: '·',
};

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** One cell's HTML as text: paragraphs and `<br>` become line breaks, the rest flows. */
function cellText(html: string): string {
  const withBreaks = html
    // Word wraps conditional comments and `<o:p>` around its paragraphs; none print.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\u0000')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\u0000')
    .replace(/<[^>]+>/g, '');
  return decode(withBreaks)
    .split('\u0000')
    // Source line breaks inside a paragraph are just spaces in HTML.
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line, index, lines) => line.length > 0 || (index > 0 && index < lines.length - 1))
    .join('\n')
    .replace(/\n+$/, '');
}

/**
 * The first `<table>` in clipboard HTML, as a grid. A cell spanning columns is followed
 * by empty strings for the columns it covers, so later cells keep their columns. Nested
 * tables are read as text. Undefined when there is no table, or it holds a single cell —
 * that is just text, and pastes as text.
 */
export function gridFromHtml(html: string): TextGrid | undefined {
  const start = html.search(/<table[\s>]/i);
  if (start < 0) return undefined;
  const body = html.slice(start);
  const rows: TextGrid = [];
  // Rows of the outermost table only: stop at the close tag that balances its open one.
  let depth = 0;
  let row: string[] | undefined;
  let cell: { from: number; span: number } | undefined;
  const tag = /<\/?(table|tr|td|th)\b([^>]*)>/gi;
  for (let m = tag.exec(body); m; m = tag.exec(body)) {
    const closing = m[0][1] === '/';
    const name = m[1].toLowerCase();
    if (name === 'table') {
      depth += closing ? -1 : 1;
      if (depth === 0) break;
      continue;
    }
    if (depth !== 1) continue;
    if (name === 'tr') {
      if (closing) {
        if (row) rows.push(row);
        row = undefined;
      } else {
        row = [];
      }
      continue;
    }
    if (!closing) {
      const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(m[2])?.[1] ?? 1);
      cell = { from: m.index + m[0].length, span: Math.max(1, Math.min(span, 63)) };
    } else if (cell) {
      row ??= [];
      row.push(cellText(body.slice(cell.from, m.index)));
      for (let i = 1; i < cell.span; i += 1) row.push('');
      cell = undefined;
    }
  }
  if (row && row.length > 0) rows.push(row);
  const cells = rows.reduce((sum, r) => sum + r.length, 0);
  return cells > 1 ? rows : undefined;
}

/**
 * Tab-separated text (Excel, Numbers, Word's plain copy of a table) as a grid. Excel
 * quotes a cell holding a tab, a line break or a quote mark, doubling the quote marks
 * inside. Undefined unless some line holds a tab: lines alone are paragraphs, and pasting
 * a paragraph into a cell must stay a paragraph.
 */
export function gridFromTabbed(text: string): TextGrid | undefined {
  if (!text.includes('\t')) return undefined;
  const source = text.replace(/\r\n?/g, '\n').replace(/\n$/, '');
  const rows: TextGrid = [[]];
  let field = '';
  let i = 0;
  let quoted = false;
  while (i < source.length) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i += 2;
        continue;
      }
      if (ch === '"') quoted = false;
      else field += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === '\t') {
      rows[rows.length - 1].push(field);
      field = '';
    } else if (ch === '\n') {
      rows[rows.length - 1].push(field);
      field = '';
      rows.push([]);
    } else {
      field += ch;
    }
    i += 1;
  }
  rows[rows.length - 1].push(field);
  return rows;
}

/** The clipboard's table, from its HTML when it has one, else its tabbed text. */
export function gridFromClipboard(data: { html?: string; text?: string }): TextGrid | undefined {
  return (data.html ? gridFromHtml(data.html) : undefined) ?? (data.text ? gridFromTabbed(data.text) : undefined);
}

/**
 * Fill cells from a grid, the grid's first cell landing on the given one — Word's
 * paste into a table, which overwrites cells rather than nesting a table. The table
 * grows rows and columns at its end to hold the grid. One language side is written, the
 * one being typed in; a covered cell takes nothing (its merge's own cell prints instead).
 */
export function fillCells(
  block: TableBlock,
  rowIndex: number,
  cellIndex: number,
  grid: TextGrid,
  side: 'en' | 'zh',
): TableBlock {
  const width = Math.max(0, ...grid.map((row) => row.length));
  let next = block;
  while (next.rows.length < rowIndex + grid.length) next = insertRow(next, next.rows.length);
  while (columnCountOf(next) < cellIndex + width) next = insertColumn(next, columnCountOf(next));
  return {
    ...next,
    rows: next.rows.map((row, r) => {
      const values = grid[r - rowIndex];
      if (!values) return row;
      return {
        ...row,
        cells: row.cells.map((cell, c) => {
          const value = values[c - cellIndex];
          if (value === undefined || cell.covered) return cell;
          return { ...cell, text: { ...cell.text, [side]: rt(value) } };
        }),
      };
    }),
  };
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A swept range as clipboard data: an HTML table (merges kept) for Word, tab-separated
 * text for Excel. The language shown on the page is the one copied; bilingual copies both
 * sides, English over Chinese, as the cell prints them.
 */
export function rangeToClipboard(
  block: TableBlock,
  range: ReadonlyArray<CellRect>,
  language: LanguageMode,
): { html: string; text: string } {
  const textOf = (rect: CellRect) => {
    const cell = block.rows[rect.rowIndex]?.cells[rect.cellIndex];
    if (!cell) return '';
    const en = plain(cell.text.en);
    const zh = plain(cell.text.zh);
    if (language === 'en') return en;
    if (language === 'zh') return zh;
    return [en, zh].filter((side) => side.trim()).join('\n');
  };
  const r0 = Math.min(...range.map((rect) => rect.r0));
  const r1 = Math.max(...range.map((rect) => rect.r1));
  const c0 = Math.min(...range.map((rect) => rect.c0));
  const c1 = Math.max(...range.map((rect) => rect.c1));
  const ordered = [...range].sort((a, b) => a.r0 - b.r0 || a.c0 - b.c0);

  const htmlRows: string[] = [];
  for (let r = r0; r <= r1; r += 1) {
    const cells = ordered
      .filter((rect) => rect.r0 === r)
      .map((rect) => {
        const spans =
          (rect.c1 > rect.c0 ? ` colspan="${rect.c1 - rect.c0 + 1}"` : '') +
          (rect.r1 > rect.r0 ? ` rowspan="${rect.r1 - rect.r0 + 1}"` : '');
        const body = escapeHtml(textOf(rect)).replace(/\n/g, '<br>');
        return `<td${spans} style="border:1px solid #000;padding:2pt 5pt">${body}</td>`;
      });
    htmlRows.push(`<tr>${cells.join('')}</tr>`);
  }
  const html =
    '<table style="border-collapse:collapse">' + htmlRows.join('') + '</table>';

  // Tabbed text: a merged cell's text in its first slot, the slots it covers empty.
  const grid: string[][] = Array.from({ length: r1 - r0 + 1 }, () =>
    Array.from({ length: c1 - c0 + 1 }, () => ''),
  );
  for (const rect of ordered) grid[rect.r0 - r0][rect.c0 - c0] = textOf(rect);
  const quote = (value: string) =>
    /[\t\n"]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const text = grid.map((row) => row.map(quote).join('\t')).join('\n');
  return { html, text };
}
