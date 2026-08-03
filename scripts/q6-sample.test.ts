/**
 * Not a unit test: writes a real .docx reproducing DSE 2019 P2 Q6 — a balance-sheet
 * T-account, a part, a mid-question interlude, then two more parts — so the exported
 * file can be opened and compared against the reference scan by hand.
 *
 * Run with `npx vitest run scripts/q6-sample.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { docxFileName, exportDocxBuffer } from '@/export/docx';
import { createWorksheet } from '@/model/factories';
import { buildTableFromTemplate } from '@/model/tableTemplates';
import { bi } from '@/model/text';
import type { ContentBlock, OutputMode, StructuredQuestion, TableBlock, Worksheet } from '@/model/types';

const OUT = process.env.SAMPLE_DIR ?? '/tmp/econ-samples';

function paragraph(id: string, text: string): ContentBlock {
  return { kind: 'paragraph', id, text: bi(text, text) };
}

/** The template with the reference's own figures typed in. */
function balanceSheet(id: string, figures: [string, string, string, string]): TableBlock {
  const table = { ...buildTableFromTemplate('balanceSheet'), id };
  const [reserves, loans, deposits, blank] = figures;
  // Only the figures: the template already labels Reserves / Loans / Deposits, which is
  // what a banking system's balance sheet always carries.
  const figuresByRow: Array<[string, string]> = [
    [reserves, deposits],
    [loans, blank],
  ];
  table.rows = table.rows.map((row, rowIndex) => {
    if (rowIndex === 0) return row;
    const [assetFigure, liabilityFigure] = figuresByRow[rowIndex - 1];
    return {
      ...row,
      cells: row.cells.map((cell, cellIndex) =>
        cellIndex === 1
          ? { ...cell, text: bi(assetFigure, assetFigure) }
          : cellIndex === 3
            ? { ...cell, text: bi(liabilityFigure, liabilityFigure) }
            : cell,
      ),
    };
  });
  return table;
}

export function buildQ6Worksheet(): Worksheet {
  const question: StructuredQuestion = {
    id: 'q6',
    type: 'structured',
    blocks: [
      paragraph(
        'stem',
        'The following table shows the balance sheet of a banking system. Initially, all banks do not hold excess reserves and the public holds $500 million cash.',
      ),
      balanceSheet('bs1', ['1 000', '4 000', '5 000', '']),
    ],
    parts: [
      {
        id: 'a',
        blocks: [paragraph('pa', 'Find the required reserve ratio.')],
        marks: 1,
      },
      {
        id: 'b',
        blocksBefore: [
          paragraph(
            'mid',
            'Suppose the central bank sells $200 million worth of government bonds to the public and the public continues to hold $500 million cash.',
          ),
        ],
        blocks: [paragraph('pb', 'Calculate the new monetary base. Show your workings.')],
        marks: 2,
      },
      {
        id: 'c',
        blocks: [
          paragraph(
            'pc',
            'Calculate the change in money supply after the process of credit creation / contraction has been completed. Show your workings.',
          ),
        ],
        marks: 3,
      },
    ],
  };

  const base = createWorksheet();
  return {
    ...base,
    title: bi('Q6 sample', 'Q6 sample'),
    questions: [question],
    flow: [{ type: 'question', id: question.id }],
  };
}

it('emits the Q6 sample', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = buildQ6Worksheet();
  const mode: OutputMode = { language: 'en', version: 'student' };
  const bytes = await exportDocxBuffer(worksheet, mode, new Map());
  const path = `${OUT}/${docxFileName(worksheet, mode)}`;
  writeFileSync(path, bytes);
  console.log(`${bytes.length} bytes -> ${path}`);
});
