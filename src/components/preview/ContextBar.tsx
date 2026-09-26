'use client';

import { useEffect, useState } from 'react';
import {
  cellsInRange,
  isMerged,
  locateCell,
  mergeDown,
  mergeRight,
  patchCell,
  patchCells,
  resolveTableAlign,
  setTableAlign,
  unmerge,
} from '@/model/table';
import { findFigureBlock, findTableBlock } from '@/model/edits';
import type {
  DiagramBlock,
  ImageBlock,
  TableAlign,
  TableBlock,
  TableBorders,
  Worksheet,
} from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { TOOLBAR_ACTIVE, TOOLBAR_BTN, TOOLBAR_ENTER, TOOLBAR_IDLE } from './FormatToolbar';

/**
 * The contextual second toolbar row — Word's "Table Layout appears when you're in a
 * table", at this app's size (§ the paper owns the words, phase 2).
 *
 * Docked under the format bar when one is showing, in its place otherwise. It carries
 * the selection's *structural* verbs that have no page gesture: cell align, merge and
 * table rules for the active cell; alignment (and the way into the drawing canvas)
 * for a selected figure. Row/column insert and delete stay on the page's own grid
 * chips, and padding/captions in the sidebar — one verb, one place.
 *
 * Verbs act through `replaceBlock` by id, the canvases' own route, so the bar needs
 * no knowledge of the owning question and works on nested tables (a figure row's, a
 * source body's) for free.
 */

const LABEL = 'mr-1 pl-1 text-[10px] font-semibold uppercase tracking-wide text-[#a39d94]';
const DIVIDER = 'mx-0.5 h-5 w-px bg-[#3d3a35]';

function BarButton({
  label,
  pressed,
  onClick,
  children,
}: {
  label: string;
  pressed?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`${TOOLBAR_BTN} ${pressed ? TOOLBAR_ACTIVE : TOOLBAR_IDLE}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function TableRow({ block }: { block: TableBlock }) {
  const activeCell = useWorksheetStore((s) => s.activeCell);
  const cellSelection = useWorksheetStore((s) => s.cellSelection);

  const at =
    activeCell?.blockId === block.id ? locateCell(block, activeCell.cellId) : undefined;
  const cell = at ? block.rows[at.rowIndex]?.cells[at.cellIndex] : undefined;

  // The swept rectangle, re-derived exactly as the sidebar panel derives it, so the
  // bar acts on the cells the page shows caught (§ `cellSelection`).
  const range =
    cellSelection?.blockId === block.id
      ? cellsInRange(
          block.rows.map((row) => row.cells),
          cellSelection.anchorId,
          cellSelection.focusId,
          (_, rowIndex, cellIndex) => block.rows[rowIndex]?.cells[cellIndex]?.id,
        )
      : [];
  const rangeCells = range.map(
    (position) => block.rows[position.rowIndex].cells[position.cellIndex],
  );
  const multi = range.length > 1;

  // A structural edit can delete the very cell the bar is aimed at (§ the panel's
  // `apply`); pointing at nothing beats pointing at a ghost.
  const apply = (next: TableBlock) => {
    const store = useWorksheetStore.getState();
    store.replaceBlock(block.id, next);
    if (activeCell && !locateCell(next, activeCell.cellId)) store.setActiveCell(undefined);
  };

  return (
    <>
      <span className={LABEL}>
        Table
        {multi
          ? ` · ${range.length} cells`
          : at
            ? ` · R${at.rowIndex + 1}C${at.cellIndex + 1}`
            : ''}
      </span>

      {cell && at && (
        <>
          {(['left', 'center', 'right'] as const).map((align) => {
            // Over a sweep the buttons act on every caught cell in one commit, and
            // read pressed only when the whole range agrees — Word's mixed-selection
            // rule, the same one the panel followed.
            const subject = multi ? rangeCells : [cell];
            const pressed = subject.every((c) => (c.align ?? 'left') === align);
            return (
              <BarButton
                key={align}
                label={`Align cell ${align}`}
                pressed={pressed}
                onClick={() =>
                  apply(
                    multi
                      ? patchCells(block, range, { align })
                      : patchCell(block, at.rowIndex, at.cellIndex, { align }),
                  )
                }
              >
                {align === 'left' ? '⇤' : align === 'center' ? '↔' : '⇥'}
              </BarButton>
            );
          })}

          {/* Merge keeps a single subject; over a sweep it would silently act on the
              anchor alone, which is not what the highlight says — so it steps aside. */}
          {!multi && (
            <>
              <span className={DIVIDER} aria-hidden />
              {isMerged(cell) ? (
                <BarButton
                  label="Split merged cell"
                  onClick={() => apply(unmerge(block, at.rowIndex, at.cellIndex))}
                >
                  Split
                </BarButton>
              ) : (
                <>
                  <BarButton
                    label="Merge with the cell to the right"
                    onClick={() => apply(mergeRight(block, at.rowIndex, at.cellIndex))}
                  >
                    Merge →
                  </BarButton>
                  <BarButton
                    label="Merge with the cell below"
                    onClick={() => apply(mergeDown(block, at.rowIndex, at.cellIndex))}
                  >
                    Merge ↓
                  </BarButton>
                </>
              )}
            </>
          )}

          <span className={DIVIDER} aria-hidden />
        </>
      )}

      {(['left', 'center', 'right'] as TableAlign[]).map((align) => (
        <BarButton
          key={align}
          label={`Align table ${align}`}
          pressed={resolveTableAlign(block) === align}
          onClick={() => apply(setTableAlign(block, align))}
        >
          {align === 'left' ? 'T⇤' : align === 'center' ? 'T↔' : 'T⇥'}
        </BarButton>
      ))}

      <span className={DIVIDER} aria-hidden />

      {(
        [
          ['all', 'Grid', 'Rule every cell — an ordinary table'],
          ['box', 'Box', 'Rule the frame only — a boxed stimulus'],
          ['headerRule', 'T-account', 'Frame, a rule under the top row and one down the middle'],
        ] as Array<[TableBorders, string, string]>
      ).map(([value, word, title]) => (
        <BarButton
          key={value}
          label={title}
          pressed={(block.borders ?? 'all') === value}
          // `all` is written as nothing, so an untouched table exports byte-identically.
          onClick={() => apply({ ...block, borders: value === 'all' ? undefined : value })}
        >
          {word}
        </BarButton>
      ))}
    </>
  );
}

function FigureRow({
  block,
  onOpen,
}: {
  block: ImageBlock | DiagramBlock;
  onOpen?: () => void;
}) {
  const replaceBlock = useWorksheetStore((s) => s.replaceBlock);
  return (
    <>
      <span className={LABEL}>{block.kind === 'diagram' ? 'Diagram' : 'Image'}</span>
      {(['left', 'center', 'right'] as const).map((align) => (
        <BarButton
          key={align}
          label={`Position figure ${align}`}
          pressed={(block.align ?? 'center') === align}
          // Centre is written as nothing, so an untouched figure stays byte-identical
          // (§ `FigureAlignField`).
          onClick={() =>
            replaceBlock(block.id, {
              ...block,
              align: align === 'center' ? undefined : align,
            })
          }
        >
          {align === 'left' ? '⇤' : align === 'center' ? '↔' : '⇥'}
        </BarButton>
      ))}
      {onOpen && (
        <>
          <span className={DIVIDER} aria-hidden />
          <BarButton label="Edit the drawing" onClick={onOpen}>
            ✎ Draw
          </BarButton>
        </>
      )}
    </>
  );
}

/**
 * Measures its dock and renders the row for whichever context is live.
 *
 * Its own small measurement rather than sharing `ToolbarDock`'s: that one also
 * measures the selection's font size, and welding the two together would re-render
 * the format bar for context changes it does not care about.
 */
export function ContextDock({
  containerRef,
  worksheet,
  figureBlockId,
  onOpenBlock,
  belowFormatBar,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  worksheet: Worksheet;
  /** The picture selected on the page, if any (preview-local selection). */
  figureBlockId?: string;
  onOpenBlock?: (blockId: string) => void;
  /** True when the format bar is also docked, so this row sits under it. */
  belowFormatBar: boolean;
}) {
  const activeCell = useWorksheetStore((s) => s.activeCell);

  // The finest selection wins, like Delete: a cell click clears the figure selection
  // on the page, so at most one of these resolves.
  const table = activeCell ? findTableBlock(worksheet, activeCell.blockId) : undefined;
  const figure =
    !table && figureBlockId ? findFigureBlock(worksheet, figureBlockId) : undefined;

  const [dock, setDock] = useState<{ left: number; width: number; top: number }>();

  const live = Boolean(table || figure);
  useEffect(() => {
    if (!live) return;
    const container = containerRef.current;
    const sheet = container?.querySelector<HTMLElement>('#print-root .paper');
    if (!container || !sheet) return;
    const scroller = container.closest<HTMLElement>('.overflow-auto') ?? container;
    const measure = () => {
      const paper = sheet.getBoundingClientRect();
      const view = scroller.getBoundingClientRect();
      setDock({ left: paper.left, width: paper.width, top: view.top + 8 });
    };
    const frame = requestAnimationFrame(measure);
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const observer = new ResizeObserver(measure);
    observer.observe(sheet);
    observer.observe(scroller);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      observer.disconnect();
    };
  }, [live, containerRef]);

  if (!dock || !live) return null;

  // A pie chart opens no canvas — its slices are data, edited in the sidebar — so it
  // gets no Draw button rather than a dead one.
  const openable =
    figure?.kind === 'diagram' && !figure.diagram.pie ? onOpenBlock : undefined;

  return (
    <div
      role="toolbar"
      aria-label={table ? 'Table tools' : 'Figure tools'}
      className={`fixed z-50 flex flex-wrap items-center gap-0.5 rounded-xl border border-[#454138] bg-[#211f1d]/95 px-1.5 py-1 shadow-xl backdrop-blur ${TOOLBAR_ENTER}`}
      style={{
        left: dock.left,
        width: dock.width,
        // Under the format bar when both dock (the bars are one row tall each), where
        // the format bar would be otherwise.
        top: dock.top + (belowFormatBar ? 40 : 0),
      }}
      // The same focus rule as the format bar: the page keeps the selection the bar
      // is acting on; form controls (none today) would keep their own behaviour.
      onMouseDown={(event) => event.preventDefault()}
    >
      {table ? (
        <TableRow block={table} />
      ) : figure ? (
        <FigureRow
          block={figure}
          onOpen={openable ? () => openable(figure.id) : undefined}
        />
      ) : null}
    </div>
  );
}
