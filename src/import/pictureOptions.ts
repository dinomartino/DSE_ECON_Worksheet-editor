/**
 * MC options that are pictures: each option letter paired with its picture by place, never
 * by order alone. Pure. A PDF or scan gives boxes (`pairByPlace`); a Word table gives cells
 * (`pairByCell`). Both return the sets in print order, so a reader can emit each letter
 * followed by its picture and the walker files the picture under that option.
 */
import type { Family } from './types';

/** A box in PDF points, y up from the page's bottom. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlacedLetter {
  value: number;
  family: Family;
  box: Box;
  size: number;
}

type Side = 'above' | 'below' | 'left' | 'corner';

/** Where `l` sits against picture `f`, and how far from it; null when it is not beside it. */
function placeOf(l: PlacedLetter, f: Box): { side: Side; gap: number } | null {
  const cx = l.box.x + l.box.w / 2;
  const cy = l.box.y + l.box.h / 2;
  const top = f.y + f.h;
  const reach = Math.max(l.size * 2.5, 12);
  const leftOf = l.box.x + l.box.w <= f.x + l.size;
  if (leftOf && cx < f.x && Math.abs(cy - top) <= l.size) {
    // At its top-left corner, level with the picture's first line.
    const gap = f.x - (l.box.x + l.box.w);
    return gap <= reach ? { side: 'corner', gap: Math.max(gap, 0) } : null;
  }
  if (cy > top) {
    // Over the picture, or at its top-left corner.
    if (cx < f.x - l.size * 3 || cx > f.x + f.w) return null;
    const gap = Math.hypot(Math.max(0, f.x - (l.box.x + l.box.w)), Math.max(0, l.box.y - top));
    return gap <= reach ? { side: 'above', gap } : null;
  }
  if (cy < f.y) {
    if (cx < f.x - l.size || cx > f.x + f.w + l.size) return null;
    const gap = f.y - (l.box.y + l.box.h);
    return gap <= reach ? { side: 'below', gap: Math.max(gap, 0) } : null;
  }
  // Level with it: on its left, overlapping its edge by at most a letter.
  if (!leftOf) return null;
  const gap = Math.max(0, f.x - (l.box.x + l.box.w));
  return gap <= reach ? { side: 'left', gap } : null;
}

/**
 * Letters (in reading order) and the page's pictures → sets of [letter index, picture
 * index], in letter order. Each letter takes its nearest picture; a set runs A, B, C… in
 * reading order, at least two letters, all on the same side of their pictures, each
 * picture taken once and nearest to its own letter.
 */
export function pairByPlace(letters: readonly PlacedLetter[], figures: readonly Box[]): Array<Array<[number, number]>> {
  const best = letters.map((l) => {
    let out: { figure: number; side: Side; gap: number } | undefined;
    figures.forEach((f, k) => {
      const at = placeOf(l, f);
      if (at && (!out || at.gap < out.gap)) out = { figure: k, ...at };
    });
    return out;
  });
  const sets: Array<Array<[number, number]>> = [];
  let k = 0;
  while (k < letters.length) {
    if (letters[k].value !== 1 || !best[k]) {
      k++;
      continue;
    }
    const set = [k];
    while (k + set.length < letters.length) {
      const j = k + set.length;
      const prev = letters[set[set.length - 1]];
      if (letters[j].value !== prev.value + 1 || letters[j].family !== prev.family || !best[j]) break;
      set.push(j);
    }
    k += set.length;
    const side = best[set[0]]!.side;
    const taken = new Set(set.map((i) => best[i]!.figure));
    if (set.length < 2 || taken.size !== set.length || set.some((i) => best[i]!.side !== side)) continue;
    // Each picture is nearest to its own letter: in a grid, letters under one row sit over the next.
    const own = set.every((i) =>
      letters.every((other, o) => o === i || !set.includes(o) || (placeOf(other, figures[best[i]!.figure])?.gap ?? Infinity) >= best[i]!.gap),
    );
    if (own) sets.push(set.map((i): [number, number] => [i, best[i]!.figure]));
  }
  return sets;
}

/** One table cell: its text, whether that text starts with an option label, and its pictures. */
export interface GridCell<T> {
  text: string;
  /** The option letter's value when the text is or starts with one ("A.", "B. Graph 2"). */
  option?: { value: number; family: Family; lone: boolean };
  pictures: readonly T[];
}

/**
 * A table of picture options → each label with its pictures, row by row: the pictures in
 * its own cell, else (a letter alone) the cell to its right, below or above that holds only
 * pictures. Null unless every cell is a label, pictures or empty, the letters run in order,
 * every label gets a picture and every picture a label.
 */
export function pairByCell<T>(grid: ReadonlyArray<ReadonlyArray<GridCell<T>>>): Array<{ row: number; col: number; pictures: T[] }> | null {
  const cells = grid.flatMap((row, r) => row.map((cell, c) => ({ cell, r, c })));
  if (cells.some(({ cell }) => cell.text.trim() && !cell.option)) return null;
  const labels = cells.filter(({ cell }) => cell.option);
  if (labels.length < 2 || !cells.some(({ cell }) => cell.pictures.length)) return null;
  // In order from any letter: the editor's own export is one table per row ("C." "D." in the second).
  const first = labels[0].cell.option!;
  if (labels.some(({ cell }, k) => cell.option!.value !== first.value + k || cell.option!.family !== first.family)) return null;
  const used = new Set<GridCell<T>>();
  const bare = (r: number, c: number) => {
    const cell = grid[r]?.[c];
    return cell && !cell.option && cell.pictures.length && !used.has(cell) ? cell : undefined;
  };
  const out: Array<{ row: number; col: number; pictures: T[] }> = [];
  for (const { cell, r, c } of labels) {
    const from = cell.pictures.length ? cell : cell.option!.lone ? (bare(r, c + 1) ?? bare(r + 1, c) ?? bare(r - 1, c)) : undefined;
    if (!from || used.has(from)) return null;
    used.add(from);
    out.push({ row: r, col: c, pictures: [...from.pictures] });
  }
  return cells.every(({ cell }) => !cell.pictures.length || used.has(cell)) ? out : null;
}
