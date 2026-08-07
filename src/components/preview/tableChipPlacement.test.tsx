import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRef } from 'react';
import { TableGridControls } from './TableGridControls';

/**
 * No table chip may sit where a cell gesture lands.
 *
 * The delete-column chip used to be placed *inside* the first row (`top: 9px`),
 * centred on its column, on the argument that there was no second lane above a table.
 * That spot is dead centre of a first-row cell — so the **second** click of the
 * double-click that opens that cell for editing hit "Delete this column" instead, and
 * the teacher lost a column of their table by trying to type in it. The model really
 * changed: a 2×2 became 2×1, and Escape did not bring it back.
 *
 * The row controls already had the answer — the row delete sits at `left: -33`, a lane
 * beyond its inserts at `-16`, out in the margin and clear of every cell. The column
 * delete now mirrors it, above the table.
 *
 * Rendered rather than grepped, because the bug was a *number*: the chip's own
 * offsets are what has to stay outside the table box, and only rendering resolves them.
 */

/** Every chip's inline `top`, in the layer's own (unscaled) pixels. */
function chipTops(): { label: string; top: number }[] {
  const markup = renderToStaticMarkup(
    <TableGridControls
      columnOffsets={[0.5]}
      columnCount={2}
      rowCount={2}
      scale={1}
      tableRef={createRef<HTMLTableElement>()}
      onInsertRow={() => {}}
      onRemoveRow={() => {}}
      onInsertColumn={() => {}}
      onRemoveColumn={() => {}}
    />,
  );

  return [...markup.matchAll(/<button[^>]*>/g)]
    .map((match) => match[0])
    .map((tag) => ({
      label: /aria-label="([^"]*)"/.exec(tag)?.[1] ?? '',
      top: Number(/top:([-\d.]+)px/.exec(tag)?.[1] ?? NaN),
    }))
    .filter((chip) => Number.isFinite(chip.top));
}

describe('table chips stay out of the cells', () => {
  /*
   * The column chips render off `at.column`, which starts at -1 (nothing pointed at).
   * Server rendering therefore only produces the row chips unless the pointer state is
   * primed — so this asserts on whichever chips do render, and the geometry test below
   * covers the specific regression from the source.
   */
  it('never places a chip inside the table box', () => {
    for (const { label, top } of chipTops()) {
      // The table's own box starts at 0. A chip at a positive `top` overlaps row 1 —
      // exactly where a cell's click and double-click gestures land.
      expect(
        top,
        `"${label}" sits ${top}px into the table, on top of a cell — a click meant ` +
          `for that cell will hit this chip instead`,
      ).toBeLessThanOrEqual(0);
    }
  });

  it('gives the column delete its own lane, clear of the insert chips', () => {
    // Read from source: the column chips need pointer state that server rendering has
    // no way to produce, and these two numbers are the whole invariant.
    const source = readSource();
    const insertTop = /aria-label=\{`Insert column before[\s\S]*?top: px\((-?\d+)\)/.exec(source);
    const deleteTop = /aria-label=\{`Delete column[\s\S]*?top: px\((-?\d+)\)/.exec(source);

    expect(insertTop, 'the insert-column chip moved or was renamed').not.toBeNull();
    expect(deleteTop, 'the delete-column chip moved or was renamed').not.toBeNull();

    const insert = Number(insertTop![1]);
    const del = Number(deleteTop![1]);

    expect(del, 'the delete-column chip is inside row 1, over a cell').toBeLessThan(0);
    expect(
      del,
      'the delete-column chip shares the insert lane — they would overlap',
    ).toBeLessThan(insert);
  });
});

function readSource(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('node:fs').readFileSync(
    'src/components/preview/TableGridControls.tsx',
    'utf8',
  );
}
