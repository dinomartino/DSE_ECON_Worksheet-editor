import { lineWidthTwips, splitRunLines } from '@/render/textWidth';
import { DEFAULT_TAB_STOP_TWIPS } from './tabStops';
import { resolveCellPadding } from './table';
import { plain } from './text';
import type { RichText, TableBlock, TableCell } from './types';

/**
 * A table sized to its words, as an exam paper sets one (user u-zhww: "by default it gets the
 * maximum width, which makes the whole question hard to read"). A table with no width of its
 * own spans the whole text column; this gives it one:
 *
 *  - each column as wide as its longest line (either language, a typed tab to the 0.5 in grid
 *    Word and the preview use), plus its padding and a little air, never under `MIN_COLUMN`;
 *  - a table that fits is that wide and no wider, centred under the question as on the paper;
 *  - one that does not fit takes the whole column: narrow columns keep their width, the rest
 *    share what is left by how much they hold (Word's own autofit idea);
 *  - figures in numeric columns centred, and a short heading row centred over its columns.
 *
 * Everything lands in the table's stored `width`, `columnWidths`, `align` and cell `align`,
 * so every backend (preview, `.docx`, clipboard) prints the same table, a copy carries it, and
 * a teacher's later resize simply overwrites it. A cell's own alignment is never replaced.
 */

export interface TableFitPlace {
  /** The width the table may use, twips: the text column, or an option's cell. */
  containerTwips: number;
  fontSize: number;
  latinFont: string;
  /** The largest share of the container it may take (an option's table leaves a gap). */
  maxFraction?: number;
  /** Centre a table narrower than its place (the stem's and a passage's tables); default true. */
  centre?: boolean;
}

/** Air beside the words, beyond the cell's padding: the paper's columns are not tight. */
const AIR_TWIPS = 288;
/** The narrowest column, twips, before its air (about 1.4 cm with its padding). */
const MIN_COLUMN_TWIPS = 792;
/** A heading cell this long or longer is a sentence, not a heading. */
const HEADING_CHARS = 30;

const NUMERIC = /^[\s$€£¥%()+\-–−.,/\d]*\d[\s$€£¥%()+\-–−.,/\d]*$/;

/** One line's width with its typed tabs taken to the default stops, as the cell prints it. */
function lineTwips(line: RichText, fontSize: number, latinFont: string): number {
  let x = 0;
  for (const run of line) {
    run.text.split('\t').forEach((piece, index) => {
      if (index > 0) x = (Math.floor(x / DEFAULT_TAB_STOP_TWIPS) + 1) * DEFAULT_TAB_STOP_TWIPS;
      if (piece) x += lineWidthTwips([{ ...run, text: piece }], fontSize, latinFont);
    });
  }
  return x;
}

/** The widest line a cell holds in either language. */
function cellTextTwips(cell: TableCell, fontSize: number, latinFont: string): number {
  let widest = 0;
  for (const side of [cell.text.en, cell.text.zh]) {
    for (const line of splitRunLines(side ?? [])) widest = Math.max(widest, lineTwips(line, fontSize, latinFont));
  }
  return widest;
}

const cellWords = (cell: TableCell) => (plain(cell.text.en).trim() || plain(cell.text.zh).trim());

/** Whether this table is one to size: untouched by a teacher, words only. */
export function tableFitApplies(block: TableBlock): boolean {
  if (block.width !== undefined || block.columnWidths !== undefined) return false;
  if (block.rows.length === 0 || block.rows[0].cells.length === 0) return false;
  // A grid of pictures (numbered diagrams) is laid out by its pictures, not its words.
  return !block.rows.some((row) => row.cells.some((cell) => cell.image));
}

/** Column widths that fit `room`: narrow columns keep theirs, the wide share the rest by need. */
function shareOut(natural: number[], room: number): number[] {
  const out = natural.map(() => 0);
  let open = natural.map((_, i) => i);
  let left = room;
  for (;;) {
    const share = left / open.length;
    const narrow = open.filter((i) => natural[i] <= share);
    if (narrow.length === 0 || narrow.length === open.length) {
      const need = open.reduce((n, i) => n + natural[i], 0);
      for (const i of open) out[i] = narrow.length === open.length ? natural[i] : (left * natural[i]) / need;
      return out;
    }
    for (const i of narrow) {
      out[i] = natural[i];
      left -= natural[i];
    }
    open = open.filter((i) => !narrow.includes(i));
  }
}

/** The table sized to its words (unchanged when `tableFitApplies` says no). */
export function fitTableToContent(block: TableBlock, place: TableFitPlace): TableBlock {
  if (!tableFitApplies(block)) return block;
  const columns = block.rows[0].cells.length;
  const natural = Array.from({ length: columns }, () => MIN_COLUMN_TWIPS);
  const spans: { from: number; span: number; need: number }[] = [];
  block.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      if (cell.covered) return;
      const pad = resolveCellPadding(block, r, c);
      // The words and padding only: the air is added below, and is the first thing given up.
      const need = cellTextTwips(cell, place.fontSize, place.latinFont) + pad.left + pad.right;
      const span = Math.max(1, Math.min(cell.colSpan ?? 1, columns - c));
      if (span === 1) natural[c] = Math.max(natural[c], need);
      else spans.push({ from: c, span, need });
    }),
  );
  // A merged cell wider than the columns it spans widens them, evenly.
  for (const { from, span, need } of spans) {
    const have = natural.slice(from, from + span).reduce((n, w) => n + w, 0);
    if (need > have) for (let i = from; i < from + span; i += 1) natural[i] += (need - have) / span;
  }

  // Roomy if it fits; else the air shrinks first, evenly, so no column drops under its words
  // (a typed tab that loses its room jams "Reserves300"); only then are the words shared out.
  const room = place.containerTwips * (place.maxFraction ?? 1);
  const tight = natural.reduce((n, w) => n + w, 0);
  const roomy = natural.map((w) => w + AIR_TWIPS);
  const widths =
    tight + AIR_TWIPS * columns <= room
      ? roomy
      : tight <= room
        ? natural.map((w) => w + (room - tight) / columns)
        : shareOut(natural, room);
  const tableTwips = widths.reduce((n, w) => n + w, 0);
  const fraction = Math.min(place.maxFraction ?? 1, tableTwips / place.containerTwips);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const columnWidths = widths.map((w) => round(w / tableTwips));
  columnWidths[columns - 1] = round(1 - columnWidths.slice(0, -1).reduce((n, w) => n + w, 0));

  // Figures centred in their column; a short heading row centred over the columns.
  const body = block.rows.slice(1);
  const numericColumn = Array.from({ length: columns }, (_, c) => {
    const words = body.map((row) => row.cells[c]).filter((cell) => cell && !cell.covered).map(cellWords).filter(Boolean);
    return words.length > 0 && words.every((w) => NUMERIC.test(w));
  });
  const headed =
    block.rows.length >= 2 &&
    block.rows[0].cells.every((cell) => {
      const words = cellWords(cell);
      return cell.covered || (!words.includes('\n') && words.length <= HEADING_CHARS);
    });
  const rows = block.rows.map((row, r) => ({
    ...row,
    cells: row.cells.map((cell, c) =>
      cell.align === undefined && !cell.justify && !cell.covered && (numericColumn[c] || (r === 0 && headed)) ? { ...cell, align: 'center' as const } : cell,
    ),
  }));

  const full = fraction >= (place.maxFraction ?? 1) - 0.005;
  const centre = (place.centre ?? true) && !full;
  return {
    ...block,
    rows,
    width: full && (place.maxFraction ?? 1) === 1 ? undefined : round(fraction),
    columnWidths,
    ...(centre ? { align: 'center' as const, indent: undefined } : {}),
  };
}

/** The page facts sizing needs (`render/ir.ts:PageMetrics`, restated to keep this module free of the renderer). */
export interface TableFitPage {
  textWidth: number;
  fontSize: number;
  latinFont: string;
}

/**
 * Where a table of this document sits, for sizing it: an MC option's table in a two-by-two
 * grid gets half the column (and leaves a gap), any other option's table stays left, and
 * a stem's or passage's table has the column and is centred when it is narrower.
 */
export function tableFitPlace(
  questions: readonly { type: string; optionLayout?: string; options?: readonly { blocks?: readonly { id: string }[] }[] }[],
  blockId: string,
  page: TableFitPage,
): TableFitPlace {
  const column: TableFitPlace = { containerTwips: page.textWidth, fontSize: page.fontSize, latinFont: page.latinFont };
  for (const question of questions) {
    if (!question.options?.some((option) => option.blocks?.some((block) => block.id === blockId))) continue;
    return question.optionLayout === 'columns2'
      ? { ...column, containerTwips: page.textWidth / 2, maxFraction: 0.9, centre: false }
      : { ...column, centre: false };
  }
  return column;
}

/** Fit to content on a table a teacher may already have sized: their width set aside, cells' own alignment kept. */
export function refitTable(block: TableBlock, place: TableFitPlace): TableBlock {
  const fresh: TableBlock = { ...block, width: undefined, columnWidths: undefined };
  const fitted = fitTableToContent(fresh, place);
  return fitted === fresh ? block : fitted;
}
