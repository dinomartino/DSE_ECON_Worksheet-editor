/**
 * DSE Paper 2's data-response question (DRQ) as the editor makes one (k-0480; the editor's
 * side is `model/drq.ts`, k-0474): two shapes the walk reads as plain text, settled on the
 * outline after it.
 *
 * - **A shared mark.** (i) and (ii) with one mark printed after (ii) (2024 (c), 2025 (b)):
 *   the walk puts it on (ii); the editor keeps it on the part, as the DRQ starter does, so
 *   it prints once after the last sub-part and the part's total is right.
 * - **The essay's strategy table.** "Strategy X  Increasing the penalty …" / "Scheme C …"
 *   rows, read as paragraphs (a scan has no ruling to see): two or more labelled rows in a
 *   run become the starter's two-column table. A line set to the right of its row is the
 *   row's text wrapping; one back at the row's left edge ends the table. A table the file
 *   drew with such labels down its first column takes the same look.
 *
 * Pure. Nothing is dropped: every word of the rows is in the table.
 */
import { sliceRichText } from '@/model/text';
import type { InlineRun } from '@/model/types';
import type { OutBlock, OutPart, Outline, SourceLine } from './types';

/** A row's label: "Strategy X", "Scheme C", "Suggestion 2", "Option I", 策略甲, 方案一. */
const ROW_LABEL =
  /^\s*((?:Strateg(?:y|ies)|Schemes?|Suggestions?|Options?|Polic(?:y|ies)|Measures?|Plans?|Proposals?)\s+(?:[A-Z]|\d{1,2}|[IVX]{1,4})\b\.?|(?:策略|方案|建議|措施|政策)\s*(?:[A-Z甲乙丙丁一二三四五六]|\d{1,2}))\s*[:：]?\s*/;
/** How far right of its row (pt) a line must start to be that row's text wrapping. */
const WRAP_INDENT = 15;

type Paragraph = Extract<OutBlock, { kind: 'paragraph' }>;

const plain = (runs: readonly InlineRun[]) => runs.map((r) => r.text).join('');
const CJK = /[㐀-鿿豈-﫿]/;

/** The shapes above, on every written question of the outline. */
export function shapeDrq(outline: Outline, lines: readonly SourceLine[]): void {
  for (const q of outline.questions) {
    if (q.kind !== 'written') continue;
    q.stem = withStrategyTables(q.stem, lines);
    for (const part of q.parts) {
      part.blocks = withStrategyTables(part.blocks, lines);
      for (const sub of part.subParts) sub.blocks = withStrategyTables(sub.blocks, lines);
      sharedMark(part);
    }
  }
}

/** One mark after the last of two or more sub-parts, none on the others: the part's. */
export function sharedMark(part: OutPart): void {
  const subs = part.subParts;
  if (part.marks !== undefined || subs.length < 2) return;
  const last = subs[subs.length - 1];
  if (last.marks === undefined || subs.slice(0, -1).some((s) => s.marks !== undefined)) return;
  part.marks = last.marks;
  delete last.marks;
}

/** The row label a paragraph opens with, and the text after it, or null. */
function rowLabel(block: OutBlock): { label: InlineRun[]; text: InlineRun[] } | null {
  if (block.kind !== 'paragraph') return null;
  const text = plain(block.runs);
  const m = ROW_LABEL.exec(text);
  if (!m || m[0].length >= text.trimEnd().length) return null;
  const labelEnd = m[0].indexOf(m[1]) + m[1].length;
  return { label: trimmed(sliceRichText(block.runs, 0, labelEnd)), text: trimmed(sliceRichText(block.runs, m[0].length, text.length)) };
}

function trimmed(runs: InlineRun[]): InlineRun[] {
  const text = plain(runs);
  const start = text.length - text.trimStart().length;
  return sliceRichText(runs, start, text.trimEnd().length);
}

const xOf = (block: OutBlock, lines: readonly SourceLine[]) => lines[block.lines[0]]?.x;

/** A table the file already drew: two columns, two rows or more, every first cell a row label alone. */
function isStrategyTable(block: OutBlock): boolean {
  if (block.kind !== 'table' || block.rows.length < 2) return false;
  return block.rows.every((row) => row.length === 2 && ROW_LABEL.exec(plain(row[0] ?? []))?.[0].trim() === plain(row[0] ?? []).trim() && plain(row[1] ?? []).trim() !== '');
}

/** Runs of two or more labelled rows (with their wrapped lines) as one strategy table each. */
export function withStrategyTables(blocks: readonly OutBlock[], lines: readonly SourceLine[]): OutBlock[] {
  const out: OutBlock[] = [];
  let k = 0;
  while (k < blocks.length) {
    const rows: Array<{ label: InlineRun[]; text: InlineRun[]; lines: number[] }> = [];
    let j = k;
    while (j < blocks.length) {
      const row = rowLabel(blocks[j]);
      if (!row) break;
      const x = xOf(blocks[j], lines);
      const taken = { ...row, lines: [...blocks[j].lines] };
      j++;
      // The row's text wrapping: paragraphs set to the right of the row's own left edge.
      while (j < blocks.length && blocks[j].kind === 'paragraph' && !rowLabel(blocks[j])) {
        const wx = xOf(blocks[j], lines);
        if (x === undefined || wx === undefined || wx < x + WRAP_INDENT) break;
        const more = (blocks[j] as Paragraph).runs;
        const gap = CJK.test(plain(taken.text).slice(-1)) && CJK.test(plain(more).charAt(0)) ? '' : ' ';
        taken.text = [...taken.text, { text: gap }, ...more];
        taken.lines.push(...blocks[j].lines);
        j++;
      }
      rows.push(taken);
    }
    if (rows.length >= 2) {
      out.push({ kind: 'table', lines: rows.flatMap((r) => r.lines), rows: rows.map((r) => [r.label, r.text]), look: 'strategy' });
      k = j;
    } else {
      out.push(isStrategyTable(blocks[k]) ? { ...(blocks[k] as Extract<OutBlock, { kind: 'table' }>), look: 'strategy' } : blocks[k]);
      k++;
    }
  }
  return out;
}
