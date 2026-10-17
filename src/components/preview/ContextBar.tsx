'use client';

import { useEffect, useState } from 'react';
import {
  CELL_SHADES,
  cellsInRange,
  distributeColumns,
  distributeRows,
  isMerged,
  locateCell,
  mergeDown,
  mergeRange,
  mergeRight,
  patchCell,
  patchCells,
  rangeGridSpan,
  resolveTableAlign,
  setTableAlign,
  styleCells,
  unmerge,
} from '@/model/table';
import { findFigureBlock, findTableBlock } from '@/model/edits';
import type {
  CellShade,
  CellVAlign,
  DiagramBlock,
  ImageBlock,
  TableAlign,
  TableBlock,
  TableBorders,
  Worksheet,
} from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { ptToTwips } from '@/model/page';
import {
  DOCK_GAP_PX,
  DOCK_INSET_PX,
  DockShield,
  TOOLBAR_ACTIVE,
  TOOLBAR_BTN,
  TOOLBAR_ENTER,
  TOOLBAR_IDLE,
  useFormatBarStep,
} from './FormatToolbar';
import { useMessages } from '@/i18n/language';
import { CONTEXT_BAR_MESSAGES } from './ContextBar.messages';

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
/** A group's name, before its buttons: quieter than the bar's own label. */
const GROUP = 'ml-1 mr-0.5 text-[10px] font-medium text-[#8a847a]';

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

/**
 * A small ruled table, drawn rather than typed: `▦` renders as a dense filled block in
 * the toolbar font and reads as noise at 12 px.
 */
function TableGlyph() {
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className="mr-px shrink-0"
    >
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
      <path d="M1.5 4.5h9M1.5 7.5h9M6 1.5v9" />
    </svg>
  );
}

/**
 * A cell with its text lines at the top, middle or bottom — Word's own pictures for
 * vertical alignment, drawn because no character reads as one at 12 px.
 */
function VAlignGlyph({ at }: { at: 'top' | 'center' | 'bottom' }) {
  const y = at === 'top' ? 3.5 : at === 'center' ? 5.5 : 7.5;
  return (
    <svg
      aria-hidden
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      className="shrink-0"
    >
      <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
      <path d={`M3.5 ${y}h5M3.5 ${y + 1.5}h5`} />
    </svg>
  );
}

/** A grey swatch, or a crossed empty one for "none". */
function ShadeSwatch({ shade }: { shade?: CellShade }) {
  return (
    <span
      aria-hidden
      className="relative inline-block h-3 w-3 shrink-0 rounded-[2px] border border-[#8a847a]"
      style={{ backgroundColor: shade ? `#${shade}` : 'transparent' }}
    >
      {!shade && (
        <svg width="10" height="10" viewBox="0 0 10 10" className="absolute inset-0">
          <path d="M1 9L9 1" stroke="#c0574b" strokeWidth="1" />
        </svg>
      )}
    </span>
  );
}

/** How dark each shade is, as Word names its greys ("White, Background 1, Darker 5%"…). */
const SHADE_PERCENT: Record<CellShade, number> = { F2F2F2: 5, D9D9D9: 15, BFBFBF: 25 };

/**
 * Each row's **rendered** height in twips, read from the page — what Distribute Rows
 * evens out, since content can make a row taller than its stored floor. Scoped to
 * `#print-root` (the paginator's probe holds a second copy); the scale is the table's
 * on-screen width over its layout width, the same page-pixel conversion the row drag
 * uses. A row the page does not show measures NaN and the verb falls back to its floor.
 */
function measureRowTwips(blockId: string, rowIndices: number[]): number[] {
  // A long table prints in pieces, one per sheet, each knowing its first row's index
  // (`data-row-offset`); a continuation's repeated heading is a copy and is skipped.
  const tables = Array.from(
    document.querySelectorAll<HTMLTableElement>(
      `#print-root table[data-table-block="${CSS.escape(blockId)}"]:not([data-heading-copy])`,
    ),
  );
  return rowIndices.map((index) => {
    for (const table of tables) {
      const row = table.rows[index - Number(table.dataset.rowOffset ?? 0)];
      if (!row) continue;
      const scale =
        table.offsetWidth > 0 ? table.getBoundingClientRect().width / table.offsetWidth : 1;
      const px = row.getBoundingClientRect().height / (scale || 1);
      return ptToTwips((px * 72) / 96);
    }
    return Number.NaN;
  });
}

/**
 * Merge a swept range and leave the caret's cell on the merged cell — the sweep's
 * other cells are covered now, so a selection still naming them would highlight
 * nothing. Shared by the bar and the page's right-click menu.
 */
export function mergeSweep(block: TableBlock, range: Parameters<typeof mergeRange>[1]) {
  const next = mergeRange(block, range);
  if (next === block) return;
  const top = range.reduce((best, rect) =>
    rect.r0 < best.r0 || (rect.r0 === best.r0 && rect.c0 < best.c0) ? rect : best,
  );
  const store = useWorksheetStore.getState();
  store.replaceBlock(block.id, next);
  const cellId = next.rows[top.rowIndex]?.cells[top.cellIndex]?.id;
  store.setActiveCell(cellId ? { blockId: block.id, cellId } : undefined);
}

function TableRow({ block }: { block: TableBlock }) {
  const m = useMessages(CONTEXT_BAR_MESSAGES);
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
  // The grid rows and columns the sweep covers — Distribute acts on exactly these.
  const covered = rangeGridSpan(range);

  // A structural edit can delete the very cell the bar is aimed at (§ the panel's
  // `apply`); pointing at nothing beats pointing at a ghost.
  const apply = (next: TableBlock) => {
    // A verb with nothing to change hands the block back; committing it would still
    // cost the teacher an undo press.
    if (next === block) return;
    const store = useWorksheetStore.getState();
    store.replaceBlock(block.id, next);
    if (activeCell && !locateCell(next, activeCell.cellId)) store.setActiveCell(undefined);
  };

  return (
    <>
      <span className={LABEL}>
        {m.table}
        {multi
          ? m.cellCount(range.length)
          : at
            ? ` · R${at.rowIndex + 1}C${at.cellIndex + 1}`
            : ''}
      </span>

      {cell && at && (
        <>
          <span className={DIVIDER} aria-hidden />
          <span className={GROUP}>{m.groupCellText}</span>
          {(['left', 'center', 'right'] as const).map((align) => {
            // Over a sweep the buttons act on every caught cell in one commit, and
            // read pressed only when the whole range agrees — Word's mixed-selection
            // rule, the same one the panel followed.
            const subject = multi ? rangeCells : [cell];
            const pressed = subject.every((c) => (c.align ?? 'left') === align);
            return (
              <BarButton
                key={align}
                label={align === 'left' ? m.alignCellLeft : align === 'center' ? m.alignCellCenter : m.alignCellRight}
                pressed={pressed}
                onClick={() =>
                  apply(
                    multi
                      ? patchCells(block, range, { align })
                      : patchCell(block, at.rowIndex, at.cellIndex, { align }),
                  )
                }
              >
                {/* "T" for the text in the cell; a table glyph marks the buttons that move the table. */}
                {align === 'left' ? 'T⇤' : align === 'center' ? 'T↔' : 'T⇥'}
              </BarButton>
            );
          })}

          {/* Vertical placement, Word's Align Top / Center / Bottom. Centred is the
              unstored default, so choosing it clears the field. */}
          {(['top', 'center', 'bottom'] as const).map((vAlign) => {
            const subject = multi ? rangeCells : [cell];
            const pressed = subject.every((c) => (c.vAlign ?? 'center') === vAlign);
            const stored: CellVAlign | undefined = vAlign === 'center' ? undefined : vAlign;
            const label =
              vAlign === 'top'
                ? m.vAlignCellTop
                : vAlign === 'center'
                  ? m.vAlignCellCenter
                  : m.vAlignCellBottom;
            return (
              <BarButton
                key={vAlign}
                label={label}
                pressed={pressed}
                onClick={() =>
                  apply(styleCells(block, multi ? range : [at], { vAlign: stored }))
                }
              >
                <VAlignGlyph at={vAlign} />
              </BarButton>
            );
          })}

          <span className={DIVIDER} aria-hidden />
          <span className={GROUP}>{m.groupShading}</span>
          {([undefined, ...CELL_SHADES] as Array<CellShade | undefined>).map((shade) => {
            const subject = multi ? rangeCells : [cell];
            return (
              <BarButton
                key={shade ?? 'none'}
                label={shade ? m.shadeGrey(SHADE_PERCENT[shade]) : m.shadeNone}
                pressed={subject.every((c) => c.shading === shade)}
                onClick={() =>
                  apply(styleCells(block, multi ? range : [at], { shading: shade }))
                }
              >
                <ShadeSwatch shade={shade} />
              </BarButton>
            );
          })}

          {/* Word's Distribute Rows / Columns, over the swept range only. Each shows
              when the range covers two or more of its rows or grid columns. */}
          {multi && (covered.rows.length > 1 || covered.columns.length > 1) && (
            <>
              <span className={DIVIDER} aria-hidden />
              {covered.rows.length > 1 && (
                <BarButton
                  label={m.distributeRowsTitle}
                  onClick={() =>
                    apply(
                      distributeRows(
                        block,
                        covered.rows,
                        measureRowTwips(block.id, covered.rows),
                      ),
                    )
                  }
                >
                  {m.distributeRows}
                </BarButton>
              )}
              {covered.columns.length > 1 && (
                <BarButton
                  label={m.distributeColumnsTitle}
                  onClick={() => apply(distributeColumns(block, covered.columns))}
                >
                  {m.distributeColumns}
                </BarButton>
              )}
            </>
          )}

          {/* Over a sweep, Word's Merge Cells: the whole rectangle into its top-left
              cell, every text kept. On one cell, the neighbour merges or Split. */}
          <span className={DIVIDER} aria-hidden />
          {multi ? (
            <BarButton label={m.mergeCellsTitle} onClick={() => mergeSweep(block, range)}>
              {m.mergeCells}
            </BarButton>
          ) : isMerged(cell) ? (
            <BarButton
              label={m.splitCell}
              onClick={() => apply(unmerge(block, at.rowIndex, at.cellIndex))}
            >
              {m.split}
            </BarButton>
          ) : (
            <>
              <BarButton
                label={m.mergeRightTitle}
                onClick={() => apply(mergeRight(block, at.rowIndex, at.cellIndex))}
              >
                {m.mergeRight}
              </BarButton>
              <BarButton
                label={m.mergeDownTitle}
                onClick={() => apply(mergeDown(block, at.rowIndex, at.cellIndex))}
              >
                {m.mergeDown}
              </BarButton>
            </>
          )}

          <span className={DIVIDER} aria-hidden />
        </>
      )}

      <span className={GROUP}>{m.groupTablePosition}</span>
      {(['left', 'center', 'right'] as TableAlign[]).map((align) => (
        <BarButton
          key={align}
          label={align === 'left' ? m.alignTableLeft : align === 'center' ? m.alignTableCenter : m.alignTableRight}
          pressed={resolveTableAlign(block) === align}
          onClick={() => apply(setTableAlign(block, align))}
        >
          {/* The table glyph: these move the whole table, the T buttons its text. */}
          <TableGlyph />
          {align === 'left' ? '⇤' : align === 'center' ? '↔' : '⇥'}
        </BarButton>
      ))}

      <span className={DIVIDER} aria-hidden />
      <span className={GROUP}>{m.groupLines}</span>

      {(
        [
          ['all', m.grid, m.gridTitle],
          ['box', m.box, m.boxTitle],
          ['headerRule', m.tAccount, m.tAccountTitle],
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
  const m = useMessages(CONTEXT_BAR_MESSAGES);
  const replaceBlock = useWorksheetStore((s) => s.replaceBlock);
  return (
    <>
      <span className={LABEL}>{block.kind === 'diagram' ? m.diagram : m.image}</span>
      {(['left', 'center', 'right'] as const).map((align) => (
        <BarButton
          key={align}
          label={align === 'left' ? m.positionLeft : align === 'center' ? m.positionCenter : m.positionRight}
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
          <BarButton label={m.editDrawing} onClick={onOpen}>
            {m.draw}
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
  const m = useMessages(CONTEXT_BAR_MESSAGES);
  const activeCell = useWorksheetStore((s) => s.activeCell);

  // The finest selection wins, like Delete: a cell click clears the figure selection
  // on the page, so at most one of these resolves.
  const table = activeCell ? findTableBlock(worksheet, activeCell.blockId) : undefined;
  const figure =
    !table && figureBlockId ? findFigureBlock(worksheet, figureBlockId) : undefined;

  const [dock, setDock] = useState<{ left: number; width: number; top: number }>();
  // The format bar's measured height plus the seam: it wraps to two rows when narrow.
  const formatBarStep = useFormatBarStep();

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
      setDock({ left: paper.left, width: paper.width, top: view.top + DOCK_INSET_PX });
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
      aria-label={table ? m.tableTools : m.figureTools}
      className={`fixed z-50 flex flex-wrap items-center gap-0.5 rounded-xl border border-[#454138] bg-[#211f1d]/95 px-1.5 py-1 shadow-xl backdrop-blur ${TOOLBAR_ENTER}`}
      style={{
        left: dock.left,
        width: dock.width,
        // Under the format bar when both dock, where the format bar would be otherwise.
        top: dock.top + (belowFormatBar ? formatBarStep : 0),
      }}
      // The same focus rule as the format bar: the page keeps the selection the bar
      // is acting on; form controls (none today) would keep their own behaviour.
      onMouseDown={(event) => event.preventDefault()}
    >
      <DockShield gapPx={belowFormatBar ? DOCK_GAP_PX : DOCK_INSET_PX} />
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
