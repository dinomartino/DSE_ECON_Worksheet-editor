import type { RenderNode, TableNode } from '@/render/ir';

/**
 * An item's nodes as the sheets draw and the paginator breaks them: a question's dotted
 * answer space becomes one node per line, and a table one node per run of rows.
 *
 * The `.docx` writes that space as one paragraph per line with no `keepNext`, so Word
 * breaks between any two lines; as one node the preview could only move it whole, and a
 * Paper 2 booklet ran sheets longer than its export. Only an answer space that a question
 * owns is split: a flow element's (`elementId`) keeps its resize handle and its own
 * overflow split, and a fill is sized by the paginator and never broken.
 *
 * A table is cut the same way, for the same reason: Word breaks a table between any two
 * rows (each row is `w:cantSplit`), and a preview that moved it whole put a long table on
 * the next sheet while the export started it on this one (`tablePieces`).
 *
 * Cached per node array, so an unchanged question keeps one identity (`ItemBody`'s memo).
 */
export function pageNodes(nodes: RenderNode[]): RenderNode[] {
  const cached = CACHE.get(nodes);
  if (cached) return cached;
  const flat = nodes.flatMap((node): RenderNode[] =>
    splits(node)
      ? Array.from({ length: node.lines }, () => ({ ...node, lines: 1 }))
      : node.kind === 'table'
        ? tablePieces(node)
        : [node],
  );
  // Nothing cut keeps the input's identity, as before tables were cut at all.
  const split = flat.length === nodes.length ? nodes : flat;
  CACHE.set(nodes, split);
  return split;
}

const CACHE = new WeakMap<RenderNode[], RenderNode[]>();

function splits(node: RenderNode): node is Extract<RenderNode, { kind: 'answerSpace' }> {
  return node.kind === 'answerSpace' && !node.elementId && !node.fill && node.lines > 1;
}

/**
 * A table as the runs of rows Word may break between.
 *
 * A run never ends inside a vertical merge (the merged cell is drawn once), and the
 * heading rows (`headerRows`) keep with the row under them, as does any row the IR keeps
 * with the next (`rowKeepNext`), and every row of a table that itself keeps with the next
 * (it is part of a chain kept whole); the last run keeps with what follows if the table does.
 * A caption above prints with the first run, one below with the last — Word keeps an
 * above caption with the table (`w:keepNext`). A table that cannot break is returned as is.
 */
export function tablePieces(node: TableNode): TableNode[] {
  const runs: Array<[number, number]> = [];
  let start = 0;
  let end = -1;
  node.rows.forEach((row, r) => {
    if (r > end && end >= start) {
      runs.push([start, end]);
      start = r;
    }
    end = Math.max(end, r);
    for (const cell of row) {
      if (!cell.covered) end = Math.max(end, r + cell.rowSpan - 1);
    }
  });
  if (end >= start) runs.push([start, Math.min(end, node.rows.length - 1)]);
  if (runs.length < 2) return [node];

  const heading = node.headerRows ?? 0;
  return runs.map(([from, to], index) => {
    const first = index === 0;
    const last = index === runs.length - 1;
    return {
      ...joinedRows(node, from, to),
      // A table inside a keep chain (a classroom MC is kept whole) keeps its rows
      // together too; the paginator still cuts a chain taller than a sheet.
      keepNext: last
        ? node.keepNext
        : Boolean(node.keepNext) || to < heading || Boolean(node.rowKeepNext?.[to]),
      piece: { source: node, rowOffset: from, first, last },
    };
  });
}

/**
 * Rows `from`..`to` of a table as a table of their own, the caption only where its side
 * is included. `headerRows` still counts the whole table's rows: a continuation's heading
 * is drawn separately (`bodyViews`), never by the run itself.
 */
export function joinedRows(source: TableNode, from: number, to: number): TableNode {
  const captioned =
    source.captionPlacement === 'above' ? from === 0 : to === source.rows.length - 1;
  const node: TableNode = {
    ...source,
    rows: source.rows.slice(from, to + 1),
    rowHeights: source.rowHeights.slice(from, to + 1),
    ...(source.rowKeepNext ? { rowKeepNext: source.rowKeepNext.slice(from, to + 1) } : {}),
    caption: captioned ? source.caption : undefined,
  };
  delete node.piece;
  return node;
}

/** One thing an item body draws: a node, or consecutive pieces of one table joined. */
export type BodyEntry =
  | { kind: 'node'; node: RenderNode; index: number }
  | {
      kind: 'table';
      /** The joined rows, drawn as one table. */
      node: TableNode;
      /** First node index, the React key. */
      index: number;
      source: TableNode;
      rowOffset: number;
      /** More of the table's rows go on beyond this slice. */
      continues: boolean;
      /** The table's rows start above this slice. */
      continued: boolean;
      /** Rows per piece, in order — how the probe measures each piece (`data-table-pieces`). */
      pieceRows: number[];
    };

/**
 * The entries an item body draws for a slice of its nodes: pieces of one table that land
 * together are joined back into a single table, so selection, resizing and the grid chips
 * work across them as on any table. Only a sheet boundary separates two pieces.
 */
export function bodyEntries(nodes: Array<{ node: RenderNode; index: number }>): BodyEntry[] {
  const out: BodyEntry[] = [];
  for (const { node, index } of nodes) {
    const piece = node.kind === 'table' ? node.piece : undefined;
    if (!piece || node.kind !== 'table') {
      out.push({ kind: 'node', node, index });
      continue;
    }
    const prev = out[out.length - 1];
    if (prev?.kind === 'table' && prev.source === piece.source) {
      prev.pieceRows.push(node.rows.length);
      const to = prev.rowOffset + prev.pieceRows.reduce((sum, n) => sum + n, 0) - 1;
      prev.node = joinedRows(piece.source, prev.rowOffset, to);
      prev.continues = !piece.last;
      continue;
    }
    out.push({
      kind: 'table',
      node: joinedRows(piece.source, piece.rowOffset, piece.rowOffset + node.rows.length - 1),
      index,
      source: piece.source,
      rowOffset: piece.rowOffset,
      continues: !piece.last,
      continued: !piece.first,
      pieceRows: [node.rows.length],
    });
  }
  return out;
}
