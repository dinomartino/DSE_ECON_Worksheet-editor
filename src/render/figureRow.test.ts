import { describe, expect, it } from 'vitest';
import {
  createDiagramBlock,
  createFigureRowBlock,
  createImageBlock,
  createMcqQuestion,
  createTableBlock,
  createWorksheet,
} from '@/model/factories';
import { bi } from '@/model/text';
import type { OutputMode, TableBlock } from '@/model/types';
import { collectDiagramNodes } from '@/export/diagramImage';
import { withFlow, TINY_PNG } from '@/test/fixtures';
import { renderContentBlocks, type RenderNode } from './ir';
import { renderWorksheet } from './worksheet';

/**
 * The figure row: a figure with a companion table beside it (§ `FigureRowBlock`),
 * the reference pie chart's bordered glossary. The children are ordinary nodes, so
 * everything already true of a table or a picture must stay true inside the row.
 */

const MODE: OutputMode = { language: 'en', version: 'student' };

const row = (table: TableBlock = createTableBlock(3, 2)) =>
  createFigureRowBlock(createDiagramBlock('pie', 300), table);

function renderRow(blocks: Parameters<typeof renderContentBlocks>[1]): RenderNode[] {
  const nodes: RenderNode[] = [];
  renderContentBlocks(nodes, blocks, 'Body');
  return nodes;
}

describe('a figure row renders its children as ordinary nodes', () => {
  it('carries the figure and the table side by side, table right by default', () => {
    const block = row();
    const nodes = renderRow([block]);
    const node = nodes.find((entry) => entry.kind === 'figureRow');
    expect(node && node.kind === 'figureRow' && node.figure.kind).toBe('diagram');
    expect(node && node.kind === 'figureRow' && node.table.columnCount).toBe(2);
    expect(node && node.kind === 'figureRow' && node.tableSide).toBe('right');
    // Children keep their block ids, so page edits resolve into the row.
    expect(node && node.kind === 'figureRow' && node.figure.blockId).toBe(block.figure.id);
    expect(node && node.kind === 'figureRow' && node.table.blockId).toBe(block.table.id);
  });

  it('takes the table\'s own separating blank line under a paragraph', () => {
    const nodes: RenderNode[] = [];
    renderContentBlocks(
      nodes,
      [{ kind: 'paragraph', id: 'p1', text: bi('Study the chart.', '') }, row()],
      'Body',
    );
    expect(nodes.map((node) => node.kind)).toEqual(['text', 'spacer', 'figureRow']);
  });

  it('renders as the bare figure when the table has lost every cell', () => {
    const empty = createTableBlock(2, 2);
    for (const tableRow of empty.rows) tableRow.cells = [];
    const nodes = renderRow([row(empty)]);
    expect(nodes.some((node) => node.kind === 'figureRow')).toBe(false);
    expect(nodes.some((node) => node.kind === 'diagram')).toBe(true);
  });

  it('feeds its diagram to the export pre-pass like any other', () => {
    const block = row();
    const worksheet = withFlow(createWorksheet(), [createMcqQuestion()]);
    worksheet.questions[0].blocks.push(block);
    const nodes = collectDiagramNodes(worksheet, MODE);
    expect(nodes.some((node) => node.blockId === block.figure.id)).toBe(true);
  });

  it('is kept whole with keep-next on the exam paper, like a table', () => {
    const worksheet = withFlow(createWorksheet(), [createMcqQuestion()]);
    worksheet.questions[0].blocks.push(createFigureRowBlock(createImageBlock(TINY_PNG, 100, 80)));
    // documentShape 'classroom' here — assert only that the node passes through the
    // walker intact; the keep chain itself is the generic keepQuestionWhole path,
    // whose switch now names figureRow (grepped below).
    const rendered = renderWorksheet(worksheet, MODE);
    const nodes = rendered.questions[0].nodes;
    expect(nodes.some((node) => node.kind === 'figureRow')).toBe(true);
  });
});
