import type { BiDraft } from '@/generate/types';
import { toRuns } from '@/generate/validate';
import { createParagraphBlock, createTableBlock } from '@/model/factories';
import type { ContentBlock, TableBlock } from '@/model/types';
import type { Side } from '@/model/textSlots';

/**
 * A table the model writes in a stem (k-0531): lines of cells joined by "|" ("Price ($) |
 * Quantity demanded | Quantity supplied", then one row per line), as the prompt asks and as
 * an example's table is shown to it (`source.ts:tableLines`). Markdown's outer pipes and its
 * `|---|---|` rule are read too, since a model may write them anyway. The stem becomes the
 * words before the table, a real table, and the words after it, so the card, the paper, the
 * print and the `.docx` draw a table instead of printing the pipes.
 *
 * English and 中文 must be laid out alike (the same number of tables) to be paired; when
 * they are not, the stem stays one paragraph, exactly as before, so nothing is lost.
 */

type Segment = { kind: 'text'; lines: string[] } | { kind: 'table'; rows: string[][] };

/** A markdown rule row: "|---|:---:|". */
const RULE = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;

/** The cells of a table line, or null when the line is not one (fewer than two cells). */
export function cellsOf(line: string): string[] | null {
  if (!line.includes('|')) return null;
  const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());
  return cells.length >= 2 && cells.some(Boolean) ? cells : null;
}

/** One side's stem as text and table segments, in order. A single pipe line is text, not a table. */
export function segmentsOf(text: string): Segment[] {
  const out: Segment[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0;
  while (i < lines.length) {
    const rows: string[][] = [];
    let j = i;
    for (; j < lines.length; j += 1) {
      if (RULE.test(lines[j]) && lines[j].includes('-')) continue;
      const cells = cellsOf(lines[j]);
      if (!cells) break;
      rows.push(cells);
    }
    if (rows.length >= 2) {
      out.push({ kind: 'table', rows });
      i = j;
      continue;
    }
    const last = out.at(-1);
    if (last?.kind === 'text') last.lines.push(lines[i]);
    else out.push({ kind: 'text', lines: [lines[i]] });
    i += 1;
  }
  return out
    .map((segment) => (segment.kind === 'text' ? { ...segment, lines: trimLines(segment.lines) } : segment))
    .filter((segment) => segment.kind === 'table' || segment.lines.length > 0);
}

function trimLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start += 1;
  while (end > start && !lines[end - 1].trim()) end -= 1;
  return lines.slice(start, end);
}

const shapeOf = (segments: readonly Segment[]) => segments.map((s) => s.kind).join(',');

/** Whether a stem holds a table the paper can draw (on either side). */
export const hasStemTable = (stem: BiDraft): boolean => (['en', 'zh'] as const).some((side) => segmentsOf(stem[side]).some((s) => s.kind === 'table'));

function tableOf(sides: Partial<Record<Side, string[][]>>): TableBlock {
  const all = Object.values(sides);
  const rows = Math.max(...all.map((r) => r.length));
  const columns = Math.max(...all.flatMap((r) => r.map((cells) => cells.length)));
  const table = createTableBlock(rows, columns);
  table.align = 'center';
  table.rows.forEach((row, r) =>
    row.cells.forEach((cell, c) => {
      cell.align = 'center';
      cell.text = { en: toRuns(sides.en?.[r]?.[c] ?? ''), zh: toRuns(sides.zh?.[r]?.[c] ?? '') };
    }),
  );
  return table;
}

/**
 * The stem's blocks: one paragraph when it holds no table (or English and 中文 hold
 * differently shaped ones), else its words and tables in order.
 */
export function stemBlocks(stem: BiDraft): ContentBlock[] {
  const whole = (): ContentBlock[] => [createParagraphBlock({ en: toRuns(stem.en), zh: toRuns(stem.zh) })];
  const en = stem.en.trim() ? segmentsOf(stem.en) : null;
  const zh = stem.zh.trim() ? segmentsOf(stem.zh) : null;
  const sides = [en, zh].filter((s): s is Segment[] => s !== null);
  if (!sides.some((segments) => segments.some((s) => s.kind === 'table'))) return whole();
  if (en && zh && shapeOf(en) !== shapeOf(zh)) return whole();
  const lead = (en ?? zh)!;
  return lead.map((segment, i): ContentBlock => {
    const pair = { en: en?.[i], zh: zh?.[i] };
    if (segment.kind === 'table') {
      const rows = (s?: Segment) => (s?.kind === 'table' ? s.rows : undefined);
      return tableOf({ ...(rows(pair.en) ? { en: rows(pair.en) } : {}), ...(rows(pair.zh) ? { zh: rows(pair.zh) } : {}) });
    }
    const words = (s?: Segment) => (s?.kind === 'text' ? s.lines.join('\n') : '');
    return createParagraphBlock({ en: toRuns(words(pair.en)), zh: toRuns(words(pair.zh)) });
  });
}
