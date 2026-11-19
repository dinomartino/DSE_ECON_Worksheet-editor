/**
 * Not a unit test: writes the frozen corpus of schema v3 (k-0469).
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V3_CORPUS=1 npx vitest run scripts/emit-v3-stakeholder-corpus.test.ts
 *
 * v3 marks a document holding a stakeholder diagram (`Diagram.stakeholder`), which every
 * build before it prints as empty axes. This file carries a data-response question with a
 * Source A table, a Source B stakeholder diagram (non-default links, a box with no view)
 * and a part asking about it, so `backwardCompat.test.ts` can prove a later migration
 * keeps them. Never regenerate it; a v4 gets files of its own.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import {
  createParagraphBlock,
  createPart,
  createSourceWith,
  createStructuredQuestion,
  createTableCell,
} from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { ContentBlock, TableBlock } from '@/model/types';

const OUT = 'src/test/corpus/v3-stakeholder.json';

/** Generated ids to stable slugs; every string equal to one follows it. */
function withStableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `sh${String(slugs.size + 1).padStart(3, '0')}`);
    }
  };
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    }
    return typeof value === 'string' ? (slugs.get(value) ?? value) : value;
  };
  collect(doc);
  return rewrite(doc) as Record<string, unknown>;
}

it('emits the frozen v3 stakeholder corpus', () => {
  if (process.env.EMIT_V3_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${OUT}. It is never regenerated; set ` +
        'EMIT_V3_CORPUS=1 only when deliberately cutting it.',
    );
  }

  const worksheet = createWorksheetFrom({ documentType: 'classroom' });
  worksheet.title = bi('DRQ practice: the minimum wage', '資料回應題練習：最低工資');

  const sourceA = createSourceWith('table', 'A');
  sourceA.label = bi('Source A: Hourly wages in Hong Kong', '資料A：香港時薪');
  const table = sourceA.blocks[0] as TableBlock;
  const cells = [
    ['Year', '2023', '2025'],
    ['Statutory minimum wage ($)', '40.0', '42.1'],
    ['Median hourly wage ($)', '80.0', '84.5'],
  ];
  const cellsZh = [
    ['年份', '2023', '2025'],
    ['法定最低工資（元）', '40.0', '42.1'],
    ['時薪中位數（元）', '80.0', '84.5'],
  ];
  table.rows = table.rows.map((row, r) => ({
    ...row,
    cells: row.cells.map((_, c) => createTableCell(bi(cells[r][c], cellsZh[r][c]))),
  }));

  const sourceB = createSourceWith('stakeholders', 'B');
  sourceB.label = bi('Source B: Views on raising the minimum wage', '資料B：對調高最低工資的意見');
  const diagram = sourceB.blocks[0] as Extract<ContentBlock, { kind: 'diagram' }>;
  const chart = diagram.diagram.stakeholder!;
  diagram.diagram = {
    ...diagram.diagram,
    title: bi('Stakeholders', '持份者'),
    stakeholder: {
      ...chart,
      links: 'toIssue',
      stakeholders: [
        ...chart.stakeholders,
        { id: 'unions', label: bi('Labour unions', '工會'), view: bi('', '') },
      ],
    },
  };

  const question = createStructuredQuestion();
  question.blocks = [
    createParagraphBlock(bi('Study Sources A and B.', '細閱資料A及B。')),
    sourceA,
    sourceB,
  ];
  const part = createPart();
  part.blocks = [
    createParagraphBlock(
      bi('With reference to Source B, explain how ONE stakeholder is affected.', '參考資料B，解釋一個持份者所受的影響。'),
    ),
  ];
  part.marks = 4;
  part.answer = bi('Employers: wage costs rise.', '僱主：工資成本上升。');
  question.parts = [part];

  worksheet.questions = [...worksheet.questions, question];
  worksheet.flow = [...worksheet.flow, { type: 'question', id: question.id }];

  const doc = withStableIds(serializeWorksheet(worksheet));
  if (doc.schemaVersion !== 3) throw new Error(`Expected a v3 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-11-19T00:00:00.000Z';
  doc.updatedAt = '2026-11-19T00:00:00.000Z';
  doc.id = 'v3-stakeholder-corpus';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
