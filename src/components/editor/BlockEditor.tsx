'use client';

import { useRef, useState } from 'react';
import {
  createDiagramBlock,
  createImageBlock,
  createParagraphBlock,
  createTableBlock,
  createTableCell,
  newId,
} from '@/model/factories';
import { DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { emptyBiText, plain, serializeRuns, parseRuns } from '@/model/text';
import type { ContentBlock, ImageBlock, TableBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, Eyebrow, IconButton, NumberField } from '@/components/ui';
import { Menu } from '@/components/ui/Menu';
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
}

export function BlockEditor({ blocks, onChange, label }: Props) {
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
      {label && <Eyebrow>{label}</Eyebrow>}

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
        <Button size="sm" variant="subtle" onClick={() => onChange([...blocks, createTableBlock()])}>
          + Table
        </Button>
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

const CELL_INPUT =
 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-ink outline-none hover:border-line focus:border-accent focus:bg-surface focus:ring-1 focus:ring-accent';

function TableBlockEditor({
  block,
  onChange,
}: {
  block: TableBlock;
  onChange: (block: TableBlock) => void;
}) {
  const language = useWorksheetStore((s) => s.mode.language);
  const showEn = language === 'en' || language === 'bilingual';
  const showZh = language === 'zh' || language === 'bilingual';
  const columnCount = Math.max(...block.rows.map((row) => row.cells.length), 1);

  // Which cell's toolbar is showing. Keeping it to one cell at a time is the whole
  // point: previously every cell rendered an align select and two merge buttons,
  // so a 3x3 table put 27 controls in a 380px column.
  const [activeCell, setActiveCell] = useState<string | undefined>();

  const setCell = (
    rowIndex: number,
    cellIndex: number,
    patch: Partial<TableBlock['rows'][0]['cells'][0]>,
  ) => {
    const rows = block.rows.map((row, r) =>
      r === rowIndex
        ? {
            ...row,
            cells: row.cells.map((cell, c) => (c === cellIndex ? { ...cell, ...patch } : cell)),
          }
        : row,
    );
    onChange({ ...block, rows });
  };

  const addRow = () =>
    onChange({
      ...block,
      rows: [
        ...block.rows,
        { id: newId(), cells: Array.from({ length: columnCount }, () => createTableCell()) },
      ],
    });

  const removeRow = (rowIndex: number) =>
    onChange({ ...block, rows: block.rows.filter((_, r) => r !== rowIndex) });

  const addColumn = () =>
    onChange({
      ...block,
      rows: block.rows.map((row) => ({ ...row, cells: [...row.cells, createTableCell()] })),
    });

  const removeColumn = (cellIndex: number) =>
    onChange({
      ...block,
      rows: block.rows.map((row) => ({
        ...row,
        cells: row.cells.filter((_, c) => c !== cellIndex),
      })),
    });

  /**
   * Merge right / down by growing the span and flagging the absorbed neighbour as
   * covered, which is exactly what the exporter's gridSpan/vMerge logic expects.
   */
  const mergeRight = (rowIndex: number, cellIndex: number) => {
    const row = block.rows[rowIndex];
    const neighbour = row.cells[cellIndex + 1];
    if (!neighbour || neighbour.covered) return;
    const rows = block.rows.map((r, ri) =>
      ri !== rowIndex
        ? r
        : {
            ...r,
            cells: r.cells.map((cell, ci) => {
              if (ci === cellIndex)
                return { ...cell, colSpan: (cell.colSpan ?? 1) + (neighbour.colSpan ?? 1) };
              if (ci === cellIndex + 1) return { ...cell, covered: true };
              return cell;
            }),
          },
    );
    onChange({ ...block, rows });
  };

  const mergeDown = (rowIndex: number, cellIndex: number) => {
    const below = block.rows[rowIndex + 1]?.cells[cellIndex];
    if (!below || below.covered) return;
    const rows = block.rows.map((r, ri) => {
      if (ri === rowIndex) {
        return {
          ...r,
          cells: r.cells.map((cell, ci) =>
            ci === cellIndex ? { ...cell, rowSpan: (cell.rowSpan ?? 1) + (below.rowSpan ?? 1) } : cell,
          ),
        };
      }
      if (ri === rowIndex + 1) {
        return {
          ...r,
          cells: r.cells.map((cell, ci) => (ci === cellIndex ? { ...cell, covered: true } : cell)),
        };
      }
      return r;
    });
    onChange({ ...block, rows });
  };

  const unmerge = (rowIndex: number, cellIndex: number) => {
    const cell = block.rows[rowIndex].cells[cellIndex];
    const colSpan = cell.colSpan ?? 1;
    const rowSpan = cell.rowSpan ?? 1;
    const rows = block.rows.map((r, ri) => ({
      ...r,
      cells: r.cells.map((c, ci) => {
        if (ri === rowIndex && ci === cellIndex) return { ...c, colSpan: 1, rowSpan: 1 };
        const withinCols = ci > cellIndex && ci < cellIndex + colSpan && ri === rowIndex;
        const withinRows = ri > rowIndex && ri < rowIndex + rowSpan && ci === cellIndex;
        if (withinCols || withinRows) return { ...c, covered: false };
        return c;
      }),
    }));
    onChange({ ...block, rows });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <NumberField
          label="Header rows"
          value={block.headerRowCount}
          onChange={(headerRowCount) => onChange({ ...block, headerRowCount })}
        />
        <span className="ml-auto flex gap-1">
          <Button size="sm" variant="subtle" onClick={addRow}>
            + Row
          </Button>
          <Button size="sm" variant="subtle" onClick={addColumn}>
            + Column
          </Button>
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border border-line ">
        <table className="w-full border-collapse text-xs">
          <tbody>
            {block.rows.map((row, rowIndex) => {
              const isHeader = rowIndex < block.headerRowCount;
              return (
                <tr key={row.id} className="group/row">
                  {row.cells.map((cell, cellIndex) => {
                    if (cell.covered) {
                      return (
                        <td
                          key={cell.id}
                          className="border border-dashed border-line bg-surface-hover/70 p-1 text-center align-middle text-[10px] text-ink-subtle "
                        >
                          merged
                          <button
                            type="button"
                            className="ml-1 underline hover:text-ink-muted"
                            onClick={() => unmerge(rowIndex, cellIndex)}
                          >
                            undo
                          </button>
                        </td>
                      );
                    }

                    const key = `${rowIndex}:${cellIndex}`;
                    const isActive = activeCell === key;

                    return (
                      <td
                        key={cell.id}
                        className={`border border-line p-1 align-top  ${
                          isHeader ? 'bg-surface-sunken ' : ''
                        }`}
                        colSpan={cell.colSpan ?? 1}
                        rowSpan={cell.rowSpan ?? 1}
                        onFocus={() => setActiveCell(key)}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                            setActiveCell((current) => (current === key ? undefined : current));
                          }
                        }}
                        style={{ textAlign: cell.align ?? 'left' }}
                      >
                        {/* Cell inputs follow the selected language mode (§5.2). */}
                        {showEn && (
                          <input
                            className={CELL_INPUT}
                            lang="en"
                            placeholder="EN"
                            aria-label={`Row ${rowIndex + 1} column ${cellIndex + 1} English`}
                            value={serializeRuns(cell.text.en)}
                            onChange={(event) =>
                              setCell(rowIndex, cellIndex, {
                                text: { ...cell.text, en: parseRuns(event.target.value) },
                              })
                            }
                          />
                        )}
                        {showZh && (
                          <input
                            className={CELL_INPUT}
                            lang="zh-HK"
                            placeholder="中文"
                            aria-label={`Row ${rowIndex + 1} column ${cellIndex + 1} 中文`}
                            value={serializeRuns(cell.text.zh)}
                            onChange={(event) =>
                              setCell(rowIndex, cellIndex, {
                                text: { ...cell.text, zh: parseRuns(event.target.value) },
                              })
                            }
                          />
                        )}

                        {/* Formatting appears only for the focused cell. */}
                        {isActive && (
                          <div className="mt-1 flex items-center gap-0.5 border-t border-line pt-1 ">
                            {(['left', 'center', 'right'] as const).map((align) => (
                              <button
                                key={align}
                                type="button"
                                title={`Align ${align}`}
                                aria-label={`Align ${align}`}
                                aria-pressed={(cell.align ?? 'left') === align}
                                onClick={() => setCell(rowIndex, cellIndex, { align })}
                                className={`rounded px-1 text-[10px] ${
                                  (cell.align ?? 'left') === align
                                    ? 'bg-accent-soft text-accent-ink '
                                    : 'text-ink-subtle hover:bg-surface-hover '
                                }`}
                              >
                                {align[0].toUpperCase()}
                              </button>
                            ))}
                            <span className="mx-0.5 h-3 w-px bg-line" />
                            <button
                              type="button"
                              className="rounded px-1 text-[10px] text-ink-subtle hover:bg-surface-hover "
                              title="Merge with cell to the right"
                              aria-label="Merge right"
                              onClick={() => mergeRight(rowIndex, cellIndex)}
                            >
                              →
                            </button>
                            <button
                              type="button"
                              className="rounded px-1 text-[10px] text-ink-subtle hover:bg-surface-hover "
                              title="Merge with cell below"
                              aria-label="Merge down"
                              onClick={() => mergeDown(rowIndex, cellIndex)}
                            >
                              ↓
                            </button>
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="w-6 p-0 text-center align-middle">
                    <span className="opacity-0 transition-opacity group-hover/row:opacity-100">
                      <IconButton
                        label={`Delete row ${rowIndex + 1}`}
                        variant="danger"
                        onClick={() => removeRow(rowIndex)}
                      >
                        <span aria-hidden>✕</span>
                      </IconButton>
                    </span>
                  </td>
                </tr>
              );
            })}
            <tr>
              {Array.from({ length: columnCount }, (_, cellIndex) => (
                <td key={cellIndex} className="p-0 text-center">
                  <IconButton
                    label={`Delete column ${cellIndex + 1}`}
                    variant="danger"
                    onClick={() => removeColumn(cellIndex)}
                  >
                    <span aria-hidden>✕</span>
                  </IconButton>
                </td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>

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
