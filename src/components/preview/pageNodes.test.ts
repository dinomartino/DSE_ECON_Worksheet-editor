import { describe, expect, it } from 'vitest';
import { rt } from '@/model/text';
import type { RenderNode, TableNode, TableNodeCell } from '@/render/ir';
import { bodyEntries, pageNodes, type BodyEntry } from './pageNodes';
import { breakAfterNodes } from './Preview';

const stem: RenderNode = { kind: 'text', style: 'Sub-question', text: { en: [], zh: [] }, keepNext: true };

describe('pageNodes', () => {
  it('draws a question’s answer space one line per node, so a sheet can break between lines as Word does', () => {
    const nodes: RenderNode[] = [stem, { kind: 'answerSpace', lines: 3 }];
    const split = pageNodes(nodes);
    expect(split).toEqual([stem, ...Array.from({ length: 3 }, () => ({ kind: 'answerSpace', lines: 1 }))]);
    // The part keeps with its first line; any line may end a sheet.
    expect(breakAfterNodes(split)).toEqual([1, 2]);
  });

  it('leaves a flow element’s space and a fill whole', () => {
    const nodes: RenderNode[] = [
      { kind: 'answerSpace', lines: 4, elementId: 'el' },
      { kind: 'answerSpace', lines: 4, elementId: 'fill', fill: true },
    ];
    expect(pageNodes(nodes)).toBe(nodes);
  });

  it('keeps one array per question, for the item memo', () => {
    const nodes: RenderNode[] = [stem, { kind: 'answerSpace', lines: 2 }];
    expect(pageNodes(nodes)).toBe(pageNodes(nodes));
  });
});

describe('a table on the page', () => {
  const cell = (text = '', rowSpan = 1, covered = false): TableNodeCell => ({
    text: { en: rt(text), zh: [] },
    colSpan: 1,
    rowSpan,
    align: 'left',
    covered,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  const table = (rows: TableNodeCell[][], extra: Partial<TableNode> = {}): TableNode => ({
    kind: 'table',
    rows,
    columnCount: rows[0].length,
    columnWidths: rows[0].map(() => 1 / rows[0].length),
    width: 1,
    indent: 0,
    align: 'left',
    borders: 'all',
    rowHeights: rows.map(() => undefined),
    blockId: 't',
    captionPlacement: 'above',
    ...extra,
  });
  const rows = (n: number) => Array.from({ length: n }, (_, r) => [cell(`r${r}`), cell()]);

  it('is cut into one node per row, any of which may end a sheet, as Word breaks a table', () => {
    const pieces = pageNodes([table(rows(3))]);
    expect(pieces).toHaveLength(3);
    expect(pieces.map((node) => (node as TableNode).piece?.rowOffset)).toEqual([0, 1, 2]);
    expect(breakAfterNodes(pieces)).toEqual([0, 1]);
  });

  it('never ends a piece inside a vertical merge', () => {
    const merged = [
      [cell('a', 2), cell()],
      [cell('', 1, true), cell()],
      [cell(), cell()],
    ];
    const pieces = pageNodes([table(merged)]) as TableNode[];
    expect(pieces.map((node) => node.rows.length)).toEqual([2, 1]);
  });

  it('keeps the heading rows with the row under them', () => {
    const pieces = pageNodes([table(rows(4), { headerRows: 2 })]);
    expect(breakAfterNodes(pieces)).toEqual([2]);
  });

  it('keeps a table whole inside a keep chain, and leaves one row alone', () => {
    expect(breakAfterNodes(pageNodes([table(rows(3), { keepNext: true }), stem]))).toEqual([]);
    const single = [table(rows(1))];
    expect(pageNodes(single)).toBe(single);
  });

  it('puts an above caption on the first piece and a below one on the last', () => {
    const caption = { en: rt('Table 1'), zh: [] };
    const above = pageNodes([table(rows(2), { caption })]) as TableNode[];
    expect(above.map((node) => Boolean(node.caption))).toEqual([true, false]);
    const below = pageNodes([table(rows(2), { caption, captionPlacement: 'below' })]) as TableNode[];
    expect(below.map((node) => Boolean(node.caption))).toEqual([false, true]);
  });

  it('draws pieces that share a sheet as one table, and says which go on elsewhere', () => {
    const pieces = pageNodes([stem, table(rows(4), { headerRows: 1 })]);
    const indexed = pieces.map((node, index) => ({ node, index }));
    const whole = bodyEntries(indexed);
    expect(whole.map((entry) => entry.kind)).toEqual(['node', 'table']);
    const joined = whole[1] as Extract<BodyEntry, { kind: 'table' }>;
    expect(joined.node.rows).toHaveLength(4);
    expect(joined.pieceRows).toEqual([1, 1, 1, 1]);
    expect([joined.continued, joined.continues]).toEqual([false, false]);

    // A sheet holding rows 3 and 4 only: a continuation that the heading is drawn over.
    const [tail] = bodyEntries(indexed.slice(3)) as Array<Extract<BodyEntry, { kind: 'table' }>>;
    expect(tail.rowOffset).toBe(2);
    expect(tail.node.rows.map((row) => row[0].text.en[0]?.text)).toEqual(['r2', 'r3']);
    expect([tail.continued, tail.continues]).toEqual([true, false]);
  });
});
