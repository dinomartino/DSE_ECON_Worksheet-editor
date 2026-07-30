'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Word's table grid picker: hover to size, click to insert.
 *
 * Inserting a table used to mean clicking "+ Table" and getting a fixed 3×3, which is
 * the wrong size for every table in the reference papers — they run 13×2, 8×2 and 4×3.
 * So the first thing a teacher did after inserting was click "+ Row" ten times, and the
 * control that was supposed to create the table only created a starting point for
 * repairing it.
 *
 * This is the affordance Word has trained them on, copied deliberately down to the live
 * caption ("5 × 3 table"): the grid *is* the size input, so the number of rows is chosen
 * by pointing at rows rather than by typing into a field whose effect is invisible until
 * committed. Recognition rather than recall is the whole point — the reason to imitate a
 * competitor here is that the muscle memory already exists.
 *
 * Three details that matter:
 *
 * - **The grid grows as you reach the edge.** A fixed 10×8 would cap the common case
 *   badly: the GDP table is 13 rows, so a teacher aiming at it would hit the bottom of
 *   the grid and have to fall back to "+ Row" anyway. Hovering the last row or column
 *   adds another, up to a sane ceiling, so the picker can name the size the paper needs.
 * - **Keyboard reaches every size.** Arrow keys move the size and Enter commits, because
 *   a grid of hover targets is unusable without a pointer and this is the only way to
 *   insert a table.
 * - **Nothing is created until the click.** Hover only previews, so backing out costs no
 *   undo entry.
 */

/*
 * Starting grid, and how far it may grow.
 *
 * The start is what a teacher sees before moving: big enough that the common sizes are
 * one gesture away, small enough not to be a wall of squares. The ceiling is set by the
 * largest table in the reference papers — the GDP table's 13 rows — plus room to spare;
 * beyond that, "Add row" in the panel is the better tool and a grid tall enough for 40
 * rows would not fit the sidebar anyway.
 */
const START_ROWS = 8;
const START_COLUMNS = 5;
const MAX_ROWS = 16;
const MAX_COLUMNS = 8;

export function TableSizePicker({
  onPick,
  onDismiss,
}: {
  onPick: (rows: number, columns: number) => void;
  /** Called on Escape, so the host can close the flyout holding this. */
  onDismiss?: () => void;
}) {
  // The size under the pointer. Zero means "nothing hovered yet", which is why the
  // caption reads as a prompt rather than as a 0×0 table.
  const [rows, setRows] = useState(0);
  const [columns, setColumns] = useState(0);
  // How much grid to draw. It only ever grows within a session, so the grid does not
  // shrink out from under the pointer as it moves back toward the origin.
  const [gridRows, setGridRows] = useState(START_ROWS);
  const [gridColumns, setGridColumns] = useState(START_COLUMNS);
  const rootRef = useRef<HTMLDivElement>(null);

  // Focus the grid on mount so the arrow keys work without a click first.
  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  const hover = (nextRows: number, nextColumns: number) => {
    const r = Math.max(1, Math.min(nextRows, MAX_ROWS));
    const c = Math.max(1, Math.min(nextColumns, MAX_COLUMNS));
    setRows(r);
    setColumns(c);
    // Reaching the last row or column reveals one more, so the grid can be extended by
    // continuing the same gesture rather than by finding a different control.
    if (r >= gridRows) setGridRows(Math.min(r + 1, MAX_ROWS));
    if (c >= gridColumns) setGridColumns(Math.min(c + 1, MAX_COLUMNS));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = (dr: number, dc: number) => {
      event.preventDefault();
      hover(Math.max(1, rows + dr), Math.max(1, columns + dc));
    };
    if (event.key === 'ArrowDown') return step(1, 0);
    if (event.key === 'ArrowUp') return step(-1, 0);
    if (event.key === 'ArrowRight') return step(0, 1);
    if (event.key === 'ArrowLeft') return step(0, -1);
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onPick(Math.max(1, rows), Math.max(1, columns));
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss?.();
    }
  };

  const chosen = rows > 0 && columns > 0;

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      role="grid"
      aria-label="Table size"
      onKeyDown={onKeyDown}
      onMouseLeave={() => {
        setRows(0);
        setColumns(0);
      }}
      className="rounded-lg p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {/* The caption is the readout the grid is otherwise missing: the cells say which
          size is *highlighted*, this says what it means, and it is what makes the control
          self-explanatory the first time. */}
      <p className="px-1 pb-1.5 text-[11px] font-medium text-ink" aria-live="polite">
        {chosen ? `${columns} × ${rows} table` : 'Drag to choose a size'}
      </p>

      <div className="flex flex-col gap-[3px]">
        {Array.from({ length: gridRows }, (_, rowIndex) => (
          <div key={rowIndex} role="row" className="flex gap-[3px]">
            {Array.from({ length: gridColumns }, (_, columnIndex) => {
              const active = rowIndex < rows && columnIndex < columns;
              return (
                <button
                  key={columnIndex}
                  type="button"
                  role="gridcell"
                  tabIndex={-1}
                  aria-selected={active}
                  aria-label={`${columnIndex + 1} by ${rowIndex + 1}`}
                  onMouseEnter={() => hover(rowIndex + 1, columnIndex + 1)}
                  onFocus={() => hover(rowIndex + 1, columnIndex + 1)}
                  onClick={() => onPick(rowIndex + 1, columnIndex + 1)}
                  className={`h-[15px] w-[15px] cursor-pointer rounded-[2px] border transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-surface hover:border-ink-subtle'
                  }`}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
