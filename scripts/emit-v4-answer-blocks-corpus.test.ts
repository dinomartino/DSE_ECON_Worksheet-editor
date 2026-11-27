/**
 * Not a unit test: writes the frozen corpus of schema v4's answer blocks (u-0c5q).
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V4_ANSWER_CORPUS=1 npx vitest run scripts/emit-v4-answer-blocks-corpus.test.ts
 *
 * v4 also marks a document whose model answer holds more than its text and one diagram
 * (`answerBlocks`). This file carries an essay whose answer is text, a table and a picture;
 * a leaf part whose answer is text, a paragraph, a table and two diagrams; a sub-part whose
 * answer opens with a figure grid (v4's fallback picture inside an answer); and a part with
 * the old shape (text + one model diagram), so `backwardCompat.test.ts` can prove a later
 * migration keeps them all. Never regenerate it; a v5 gets files of its own.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import {
  createAnswerDiagram,
  createFigureGridBlock,
  createImageBlock,
  createParagraphBlock,
  createPart,
  createStructuredQuestion,
  createSubPart,
  createTableBlock,
} from '@/model/factories';
import { withAnswerBlocks } from '@/model/answerBlocks';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import { TINY_PNG } from '@/test/fixtures';
import type { StructuredQuestion, TableBlock } from '@/model/types';

const OUT = 'src/test/corpus/v4-answer-blocks.json';

function withStableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `ab${String(slugs.size + 1).padStart(3, '0')}`);
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

function table(rows: Array<[string, string, string, string]>): TableBlock {
  const block = createTableBlock(rows.length, 2);
  rows.forEach(([en0, zh0, en1, zh1], r) => {
    block.rows[r].cells[0].text = bi(en0, zh0);
    block.rows[r].cells[1].text = bi(en1, zh1);
  });
  return block;
}

it('emits the frozen v4 answer blocks corpus', () => {
  if (process.env.EMIT_V4_ANSWER_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${OUT}. It is never regenerated; set ` +
        'EMIT_V4_ANSWER_CORPUS=1 only when deliberately cutting it.',
    );
  }

  const worksheet = createWorksheetFrom({ documentType: 'classroom' });
  worksheet.title = bi('LQ practice: answers with tables and diagrams', '長題目練習：附表格及圖表的答案');

  const essay: StructuredQuestion = withAnswerBlocks(
    {
      ...createStructuredQuestion(),
      blocks: [createParagraphBlock(bi('Compare the two firms’ total revenue.', '比較兩間公司的總收入。'))],
      parts: [],
      marks: 6,
      answer: bi('Firm A earns more:', 'A 公司收入較多：'),
    },
    [
      table([
        ['Firm', '公司', 'Total revenue ($)', '總收入（元）'],
        ['A', 'A', '1 200', '1 200'],
      ]),
      { ...createImageBlock(TINY_PNG, 120, 90), altText: bi('A sketch of the market', '市場草圖') },
    ],
  );

  const a = withAnswerBlocks(
    {
      ...createPart(),
      blocks: [createParagraphBlock(bi('With the aid of diagrams, explain the effect of a tax.', '試以圖解釋徵稅的影響。'))],
      marks: 6,
      answer: bi('Supply falls.', '供應下降。'),
    },
    [
      createParagraphBlock(bi('Price rises from P1 to P2:', '價格由 P1 升至 P2：')),
      table([
        ['Before', '徵稅前', 'P1', 'P1'],
        ['After', '徵稅後', 'P2', 'P2'],
      ]),
      createAnswerDiagram('supply-demand'),
      createAnswerDiagram('demand-shift'),
    ],
  );

  const sub = withAnswerBlocks(
    {
      ...createSubPart(),
      blocks: [createParagraphBlock(bi('Which figures show a shortage?', '哪些圖表顯示短缺？'))],
      marks: 2,
      answer: bi('(1) and (3).', '(1) 和 (3)。'),
    },
    [createFigureGridBlock([createAnswerDiagram('supply-demand', 240), createAnswerDiagram('demand-shift', 240), createAnswerDiagram('supply-demand', 240)], 3)],
  );
  const b = { ...createPart(), blocks: [createParagraphBlock(bi('Consider the market.', '考慮市場。'))], subParts: [sub] };

  const c = withAnswerBlocks(
    { ...createPart(), blocks: [createParagraphBlock(bi('Draw the new equilibrium.', '繪出新的均衡。'))], marks: 3, answer: bi('E2.', 'E2。') },
    [createAnswerDiagram()],
  );

  const parted: StructuredQuestion = {
    ...createStructuredQuestion(),
    blocks: [createParagraphBlock(bi('The government imposes a per-unit tax.', '政府徵收從量稅。'))],
    parts: [a, b, c],
  };

  worksheet.questions = [...worksheet.questions, essay, parted];
  worksheet.flow = [...worksheet.flow, ...[essay, parted].map((q) => ({ type: 'question' as const, id: q.id }))];

  const doc = withStableIds(serializeWorksheet(worksheet));
  if (doc.schemaVersion !== 4) throw new Error(`Expected a v4 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-11-27T00:00:00.000Z';
  doc.updatedAt = '2026-11-27T00:00:00.000Z';
  doc.id = 'v4-answer-blocks-corpus';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
