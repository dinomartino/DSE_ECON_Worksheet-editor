'use client';

import { useEffect, useRef, useState } from 'react';
import {
  createDiagramBlock,
  createImageBlock,
  createParagraphBlock,
  createTableBlock,
} from '@/model/factories';
import {
  columnCountOf,
  insertColumn,
  insertRow,
  isMerged,
  locateCell,
  mergeDown,
  mergeRight,
  patchCell,
  removeColumn,
  removeRow,
  unmerge,
} from '@/model/table';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { emptyBiText, plain } from '@/model/text';
import { RichTextEditable } from '@/components/preview/RichTextEditable';
import type { ContentBlock, ImageBlock, TableBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, Eyebrow, GroupHeader, IconButton, NumberField } from '@/components/ui';
import { Menu } from '@/components/ui/Menu';
import { TableSizePicker } from '@/components/ui/TableSizePicker';
import { BiTextField } from './BiTextField';
import { DiagramEditor } from './DiagramEditor';

/**
 * Content-block editing (§5.3): insert paragraph / table / image in any order,
 * reorder, delete. Used at every level — question stem, part, sub-part — so tables
 * and images are insertable everywhere (§3.3).
 *
 * A paragraph is by far the common case, so it renders as a bare field with its
 * controls appearing on hover; only tables and images get a titled frame. Previously
 * every block wore the same grey box and the same ↑↓✕ triple, which made a stem of
 * three paragraphs look like a deeply nested structure.
 */

interface Props {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  label?: string;
  /** One-line explanation beside `label`, for a group whose name is not self-evident. */
  labelHint?: string;
}

export function BlockEditor({ blocks, onChange, label, labelHint }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  const replace = (index: number, block: ContentBlock) => {
    const next = [...blocks];
    next[index] = block;
    onChange(next);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const remove = (index: number) => onChange(blocks.filter((_, i) => i !== index));

  const handleImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const src = String(reader.result);
      const img = new Image();
      img.onload = () => {
        // Fit to a sensible default width, aspect ratio preserved (§5.3).
        const maxWidth = 420;
        const scale = img.width > maxWidth ? maxWidth / img.width : 1;
        const block = createImageBlock(
          src,
          Math.round(img.width * scale),
          Math.round(img.height * scale),
        );
        block.naturalWidthPx = img.width;
        block.naturalHeightPx = img.height;
        onChange([...blocks, block]);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const controls = (index: number) => (
    <span className="flex shrink-0 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/block:opacity-100">
      <IconButton label="Move block up" onClick={() => move(index, -1)} disabled={index === 0}>
        <span aria-hidden>↑</span>
      </IconButton>
      <IconButton
        label="Move block down"
        onClick={() => move(index, 1)}
        disabled={index === blocks.length - 1}
      >
        <span aria-hidden>↓</span>
      </IconButton>
      <IconButton label="Delete block" variant="danger" onClick={() => remove(index)}>
        <span aria-hidden>✕</span>
      </IconButton>
    </span>
  );

  return (
    <div className="space-y-2">
      {label && <GroupHeader title={label} hint={labelHint} />}

      {blocks.map((block, index) => {
        if (block.kind === 'paragraph') {
          return (
            <div key={block.id} className="group/block flex items-start gap-1">
              <div className="min-w-0 flex-1">
                <BiTextField
                  value={block.text}
                  onChange={(text) => replace(index, { ...block, text })}
                />
              </div>
              <div className="pt-1">{controls(index)}</div>
            </div>
          );
        }

        return (
          <div
            key={block.id}
            className="group/block rounded-lg border border-line bg-surface "
          >
            <header className="flex items-center gap-2 px-2 py-1">
              <Eyebrow>{block.kind}</Eyebrow>
              <span className="flex-1" />
              {controls(index)}
            </header>
            <div className="px-2 pb-2">
              {block.kind === 'table' ? (
                <TableBlockEditor block={block} onChange={(next) => replace(index, next)} />
              ) : block.kind === 'diagram' ? (
                <DiagramEditor block={block} onChange={(next) => replace(index, next)} />
              ) : (
                <ImageBlockEditor block={block} onChange={(next) => replace(index, next)} />
              )}
            </div>
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="subtle"
          onClick={() => onChange([...blocks, createParagraphBlock(emptyBiText())])}
        >
          + Paragraph
        </Button>
        <TableInsertButton
          onPick={(rows, columns) => onChange([...blocks, createTableBlock(rows, columns)])}
        />
        <Button size="sm" variant="subtle" onClick={() => fileInput.current?.click()}>
          + Image
        </Button>
        {/* Templates are offered at insert time rather than after: a teacher who wants
            an AD–AS diagram should not have to insert blank axes and then convert. */}
        <Menu
          label="Insert diagram"
          align="left"
          trigger={<span className="text-[11px] font-medium">+ Diagram ▾</span>}
          items={DIAGRAM_TEMPLATES.map((template) => ({
            label: plain(template.name.en),
            onSelect: () => onChange([...blocks, createDiagramBlock(template.id)]),
          }))}
        />
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) handleImageFile(file);
            event.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/**
 * "+ Table", opening Word's grid picker rather than inserting a blind 3×3.
 *
 * The old button created a fixed 3×3 — the wrong size for every table in the reference
 * papers (13×2, 8×2, 4×3) — so inserting was always followed by a run of "+ Row" clicks.
 * Choosing the size first is both fewer actions and the interaction a teacher already
 * knows from Word.
 */
function TableInsertButton({ onPick }: { onPick: (rows: number, columns: number) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <Button
        size="sm"
        variant="subtle"
        aria-expanded={open}
        aria-haspopup="grid"
        onClick={() => setOpen((current) => !current)}
      >
        + Table
      </Button>
      {open && (
        /*
         * Opens **downward and rightward**, deliberately.
         *
         * Upward put a 20-row grid straight through the sidebar's tab bar, which sits a
         * couple of hundred pixels above: the tabs overlapped the top rows and, being
         * later in the stack, swallowed their pointer events — so the caption was clipped
         * off and the tallest sizes could not be hovered at all. Downward there is open
         * panel below, and `right-0` keeps the wider sizes from running off the 380px
         * column into the page.
         */
        <div className="absolute right-0 top-full z-40 mt-1 rounded-xl border border-line bg-surface-raised p-1.5 shadow-2xl">
          <TableSizePicker
            onDismiss={() => setOpen(false)}
            onPick={(rows, columns) => {
              onPick(rows, columns);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * The table panel: **structure only**. Text is typed on the page.
 *
 * This used to render a second full grid of text inputs — so a 13-row table put 26
 * rich-text fields into a 380px column, each a few characters wide, duplicating cells
 * that were already editable on the page via the `tableCell` edit target. Two places to
 * type the same content, and the sidebar's was the illegible one: a teacher could not see
 * the column widths, the wrapping or the borders that make a table readable.
 *
 * Word's division is the one that works, and the one a teacher arrives already knowing:
 * **structure from a panel, content in the document.** So this offers the verbs that have
 * no representation on the page — insert a row above, delete a column, merge — and points
 * at the page for everything else.
 *
 * Every verb acts on the cell the page reports through `activeCell`. With no cell chosen
 * the per-cell controls are hidden rather than disabled-and-mysterious, and the
 * whole-table actions (append a row or column) still work, so the panel is never inert.
 */
function TableBlockEditor({
  block,
  onChange,
}: {
  block: TableBlock;
  onChange: (block: TableBlock) => void;
}) {
  const activeCell = useWorksheetStore((s) => s.activeCell);
  const setActiveCell = useWorksheetStore((s) => s.setActiveCell);

  const rowCount = block.rows.length;
  const columnCount = columnCountOf(block);

  /*
   * Which cell the verbs apply to.
   *
   * Resolved from the store's `activeCell` only when it names a cell *in this table* —
   * two tables in one question each render a panel, and a cell selected in the other one
   * must not make this panel act on a position it does not have. `locateCell` returning
   * undefined also covers the stale case, where the row holding the active cell has since
   * been deleted.
   */
  const at =
    activeCell?.blockId === block.id ? locateCell(block, activeCell.cellId) : undefined;
  const cell = at ? block.rows[at.rowIndex]?.cells[at.cellIndex] : undefined;

  // Acting through one helper keeps the active cell pointing at a live position: a
  // structural edit can delete the very row the panel is aimed at.
  const apply = (next: TableBlock) => {
    onChange(next);
    if (at && !locateCell(next, activeCell!.cellId)) setActiveCell(undefined);
  };

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <span className="text-xs tabular-nums text-ink-muted">
          {rowCount} {rowCount === 1 ? 'row' : 'rows'} × {columnCount}{' '}
          {columnCount === 1 ? 'column' : 'columns'}
        </span>
        {at && (
          <span className="ml-auto text-[11px] tabular-nums text-ink-subtle">
            cell R{at.rowIndex + 1}C{at.cellIndex + 1}
          </span>
        )}
      </div>

      {/* Rows and columns. Insert-above and insert-left need a position, so they are
          offered only with a cell chosen; append never does, which is why the fallback
          is a plain "Add" rather than a greyed-out pair of directional buttons. */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-1">
          <span className="w-14 shrink-0 text-[11px] text-ink-subtle">Rows</span>
          {at ? (
            <>
              <Button size="sm" variant="subtle" onClick={() => apply(insertRow(block, at.rowIndex))}>
                Above
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => apply(insertRow(block, at.rowIndex + 1))}
              >
                Below
              </Button>
              <IconButton
                label={`Delete row ${at.rowIndex + 1}`}
                variant="danger"
                disabled={rowCount <= 1}
                onClick={() => apply(removeRow(block, at.rowIndex))}
              >
                <span aria-hidden>✕</span>
              </IconButton>
            </>
          ) : (
            <Button size="sm" variant="subtle" onClick={() => apply(insertRow(block, rowCount))}>
              Add row
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="w-14 shrink-0 text-[11px] text-ink-subtle">Columns</span>
          {at ? (
            <>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => apply(insertColumn(block, at.cellIndex))}
              >
                Left
              </Button>
              <Button
                size="sm"
                variant="subtle"
                onClick={() => apply(insertColumn(block, at.cellIndex + 1))}
              >
                Right
              </Button>
              <IconButton
                label={`Delete column ${at.cellIndex + 1}`}
                variant="danger"
                disabled={columnCount <= 1}
                onClick={() => apply(removeColumn(block, at.cellIndex))}
              >
                <span aria-hidden>✕</span>
              </IconButton>
            </>
          ) : (
            <Button
              size="sm"
              variant="subtle"
              onClick={() => apply(insertColumn(block, columnCount))}
            >
              Add column
            </Button>
          )}
        </div>
      </div>

      {cell && at ? (
        <div className="space-y-1.5 border-t border-line pt-2">
          <div className="flex items-center gap-1">
            <span className="w-14 shrink-0 text-[11px] text-ink-subtle">Align</span>
            {(['left', 'center', 'right'] as const).map((align) => (
              <button
                key={align}
                type="button"
                title={`Align ${align}`}
                aria-label={`Align ${align}`}
                aria-pressed={(cell.align ?? 'left') === align}
                onClick={() => apply(patchCell(block, at.rowIndex, at.cellIndex, { align }))}
                className={`cursor-pointer rounded px-1.5 py-0.5 text-[11px] ${
                  (cell.align ?? 'left') === align
                    ? 'bg-accent-soft text-accent-ink'
                    : 'text-ink-subtle hover:bg-surface-hover'
                }`}
              >
                {align === 'left' ? 'L' : align === 'center' ? 'C' : 'R'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <span className="w-14 shrink-0 text-[11px] text-ink-subtle">Merge</span>
            {isMerged(cell) ? (
              <Button
                size="sm"
                variant="subtle"
                onClick={() => apply(unmerge(block, at.rowIndex, at.cellIndex))}
              >
                Split
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => apply(mergeRight(block, at.rowIndex, at.cellIndex))}
                >
                  → Right
                </Button>
                <Button
                  size="sm"
                  variant="subtle"
                  onClick={() => apply(mergeDown(block, at.rowIndex, at.cellIndex))}
                >
                  ↓ Down
                </Button>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Not a disabled control: the reason the per-cell verbs are missing is that
           nothing has been aimed at, and saying where to aim is more use than greying
           out four buttons whose names do not explain what they need. */
        <p className="border-t border-line pt-2 text-[11px] leading-snug text-ink-subtle">
          Click a cell in the table on the page to align or merge it — and to type, which
          happens there rather than here.
        </p>
      )}

      <BiTextField
        label="Caption"
        value={block.caption ?? emptyBiText()}
        onChange={(caption) => onChange({ ...block, caption })}
        rows={1}
      />
    </div>
  );
}

function ImageBlockEditor({
  block,
  onChange,
}: {
  block: ImageBlock;
  onChange: (block: ImageBlock) => void;
}) {
  const ratio =
    block.naturalWidthPx && block.naturalHeightPx
      ? block.naturalHeightPx / block.naturalWidthPx
      : block.heightPx / block.widthPx;

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={block.src}
          alt=""
          className="max-h-24 rounded border border-line object-contain "
        />
        <div className="space-y-1">
          <NumberField
            label="Width"
            min={40}
            value={block.widthPx}
            suffix="px"
            onChange={(widthPx) => {
              // Aspect ratio stays locked (§5.3).
              const next = Math.max(40, widthPx);
              onChange({ ...block, widthPx: next, heightPx: Math.round(next * ratio) });
            }}
          />
          <div className="text-[10px] text-ink-subtle">Height: {block.heightPx}px</div>
        </div>
      </div>
      <BiTextField
        label="Alt text"
        value={block.altText}
        onChange={(altText) => onChange({ ...block, altText })}
        rows={1}
      />
      <BiTextField
        label="Caption"
        value={block.caption ?? emptyBiText()}
        onChange={(caption) => onChange({ ...block, caption })}
        rows={1}
      />
    </div>
  );
}
