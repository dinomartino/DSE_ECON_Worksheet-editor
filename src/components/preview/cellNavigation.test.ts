import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { TableNode } from '@/render/ir';
import { cellInDirection } from './Preview';

/**
 * Arrow keys leave a cell at the text's edge for the cell above or below in the same
 * grid column (docs/Tables vs Word.md, phase 1). A merged cell is entered from any slot
 * it covers, and a cell spanning rows steps past its own rows.
 */

type Spec = { id: string; colSpan?: number; rowSpan?: number } | 'covered';

function rows(spec: Spec[][]): TableNode['rows'] {
  return spec.map((row) =>
    row.map((cell) =>
      cell === 'covered'
        ? ({ covered: true, colSpan: 1, rowSpan: 1 } as TableNode['rows'][number][number])
        : ({
            covered: false,
            colSpan: cell.colSpan ?? 1,
            rowSpan: cell.rowSpan ?? 1,
            edit: { kind: 'tableCell', blockId: 't', cellId: cell.id },
          } as TableNode['rows'][number][number]),
    ),
  );
}

describe('cellInDirection', () => {
  const plain = rows([
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'c' }, { id: 'd' }],
  ]);

  it('moves up and down one row in the same column', () => {
    expect(cellInDirection(plain, 'a', 'down')?.cellId).toBe('c');
    expect(cellInDirection(plain, 'd', 'up')?.cellId).toBe('b');
  });

  it('stops at the table edge', () => {
    expect(cellInDirection(plain, 'a', 'up')).toBeUndefined();
    expect(cellInDirection(plain, 'c', 'down')).toBeUndefined();
  });

  it('enters a merged cell from a slot it covers', () => {
    const merged = rows([
      [{ id: 'h', colSpan: 2 }, 'covered'],
      [{ id: 'x' }, { id: 'y' }],
    ]);
    expect(cellInDirection(merged, 'y', 'up')?.cellId).toBe('h');
    expect(cellInDirection(merged, 'h', 'down')?.cellId).toBe('x');
  });

  it('steps past a cell spanning rows', () => {
    const tall = rows([
      [{ id: 'side', rowSpan: 2 }, { id: 'p' }],
      ['covered', { id: 'q' }],
      [{ id: 'foot' }, { id: 'r' }],
    ]);
    expect(cellInDirection(tall, 'side', 'down')?.cellId).toBe('foot');
    expect(cellInDirection(tall, 'foot', 'up')?.cellId).toBe('side');
  });
});

describe('a table cell types like Word', () => {
  const source = readFileSync('src/components/preview/InlineEditable.tsx', 'utf8');

  it('opens on the first click', () => {
    expect(source).toMatch(/if \(cell\) \{\s*onSelect\?\.\(\);\s*beginEditing\(/);
  });

  it('makes Enter a line break inside the cell, not a commit', () => {
    expect(source).toMatch(
      /event\.key === 'Enter' && cell[\s\S]*?execCommand\('insertLineBreak'\)/,
    );
  });
});
