import { readFileSync } from 'node:fs';
import { parseWorksheet } from '@/storage/document';
import type { CellAlign, McqQuestion, Question, StructuredQuestion, TableBlock, Worksheet } from '@/model/types';

/**
 * The papers behind the `table-justify/` samples (`npm run samples`): what a teacher sees when the text
 * of a table cell is justified. The paper is `test-fixtures/manual/table-justify-mix.json`, the one
 * opened by hand and by `scripts/table-justify-verify.mjs`, so the file the user opens in Word is the
 * paper they set up in the app. Read from the repository root, where the samples run.
 *
 * Its tables, in order: Q1's policy table (a bold centred heading row, then a term beside a sentence
 * that wraps), Q2's table of numbers (flush right) and its table with a cell spanning both columns,
 * and the MC's table of two sentences. Left alone every cell is flush left, centred or flush right.
 */

/** Which of the paper's wrapping cells to justify; `{}` is the paper as saved, the control. */
export interface TableJustifyAsks {
  /** The three sentences of Q1's policy table (its second column). */
  policies?: boolean;
  /** The sentence spanning both columns of Q2's second table. */
  spanning?: boolean;
  /** The two sentences of the MC's table. */
  mcq?: boolean;
}

/** The table at `index` among a question's blocks, with `cells` of it justified. */
function justified(question: Question, index: number, pick: (table: TableBlock) => Array<[number, number]>): Question {
  const blocks = (question as StructuredQuestion | McqQuestion).blocks!.map((block, at) => {
    if (at !== index || block.kind !== 'table') return block;
    const chosen = new Set(pick(block).map(([row, cell]) => `${row}:${cell}`));
    return {
      ...block,
      rows: block.rows.map((row, r) => ({
        ...row,
        cells: row.cells.map((cell, c) => (chosen.has(`${r}:${c}`) ? { ...cell, align: 'justify' as CellAlign } : cell)),
      })),
    };
  });
  return { ...question, blocks } as Question;
}

export function buildTableJustifyPaper(asks: TableJustifyAsks = {}, extra: Partial<Worksheet> = {}): Worksheet {
  const worksheet = parseWorksheet(readFileSync('test-fixtures/manual/table-justify-mix.json', 'utf8'));
  const [policies, tables, mcq] = worksheet.questions;
  return {
    ...worksheet,
    ...extra,
    questions: [
      asks.policies ? justified(policies, 1, () => [[1, 1], [2, 1], [3, 1]]) : policies,
      asks.spanning ? justified(tables, 2, () => [[0, 0]]) : tables,
      asks.mcq ? justified(mcq, 1, () => [[0, 0], [1, 0]]) : mcq,
    ],
  };
}
