/**
 * Develop builds between 0.8.5 and 0.8.6 stored a justified table cell as `align: 'justify'`.
 * It never shipped: a released build writes `align` straight into `w:jc`, where `justify` is not
 * a value Word accepts, so justify became its own flag (`TableCell.justify`). This is a tolerant
 * read, not a migration (no released document holds the old spelling): every table cell saying
 * `align: 'justify'` comes back as `justify: true` with no `align`. Pure; returns `doc` itself
 * when no cell needs it, and walks the whole document, since a table may sit in a question's
 * blocks, a part, an answer or a layout element.
 */
export function foldLegacyCellJustify<T>(doc: T): T {
  return fold(doc) as T;
}

function fold(value: unknown): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const out = value.map((item) => {
      const next = fold(item);
      if (next !== item) changed = true;
      return next;
    });
    return changed ? out : value;
  }
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  if (record.kind === 'table' && Array.isArray(record.rows)) {
    const rows = foldRows(record.rows);
    return rows === record.rows ? record : { ...record, rows };
  }
  let out: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(record)) {
    const next = fold(child);
    if (next !== child) (out ??= { ...record })[key] = next;
  }
  return out ?? record;
}

function foldRows(rows: unknown[]): unknown[] {
  let changed = false;
  const out = rows.map((row) => {
    if (!row || typeof row !== 'object' || !Array.isArray((row as { cells?: unknown }).cells)) return row;
    const cells = (row as { cells: unknown[] }).cells;
    let rowChanged = false;
    const nextCells = cells.map((cell) => {
      if (!cell || typeof cell !== 'object' || (cell as { align?: unknown }).align !== 'justify') return cell;
      rowChanged = true;
      const { align: _justify, ...rest } = cell as Record<string, unknown>;
      void _justify;
      return { ...rest, justify: true };
    });
    if (!rowChanged) return row;
    changed = true;
    return { ...(row as object), cells: nextCells };
  });
  return changed ? out : rows;
}
