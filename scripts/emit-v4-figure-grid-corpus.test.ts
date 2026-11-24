/**
 * Not a unit test: writes the frozen corpus of schema v4's figure grid (k-0545).
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V4_GRID_CORPUS=1 npx vitest run scripts/emit-v4-figure-grid-corpus.test.ts
 *
 * v4 marks a document holding a stem figure grid (`FigureGridBlock`), a block kind no build
 * before it knows. This file carries an MC question in the HKDSE "Which of the following
 * diagrams…" form (four editable diagrams, two to a row, labels (1)–(4)), a three-to-a-row
 * grid with a picture in one cell, and an MC question with a diagram under every option
 * (`McqOption.blocks`, which v1 already prints), so `backwardCompat.test.ts` can prove a
 * later migration keeps them. Never regenerate it; a v5 gets files of its own.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import {
  createDiagramBlock,
  createFigureGridBlock,
  createImageBlock,
  createMcqQuestion,
  createParagraphBlock,
} from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import { TINY_PNG } from '@/test/fixtures';
import type { DiagramBlock, McqQuestion } from '@/model/types';

const OUT = 'src/test/corpus/v4-figure-grid.json';

/** Generated ids to stable slugs; every string equal to one follows it. */
function withStableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `fg${String(slugs.size + 1).padStart(3, '0')}`);
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

const small = (templateId: string, title: ReturnType<typeof bi>): DiagramBlock => {
  const block = createDiagramBlock(templateId, 260);
  return { ...block, diagram: { ...block.diagram, title } };
};

const mcq = (stem: ReturnType<typeof bi>, options: Array<ReturnType<typeof bi>>, answer: number): McqQuestion => {
  const q = createMcqQuestion();
  q.blocks = [createParagraphBlock(stem)];
  q.options = q.options.map((option, i) => ({ ...option, text: options[i] }));
  q.answerIndex = answer;
  return q;
};

it('emits the frozen v4 figure grid corpus', () => {
  if (process.env.EMIT_V4_GRID_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${OUT}. It is never regenerated; set ` +
        'EMIT_V4_GRID_CORPUS=1 only when deliberately cutting it.',
    );
  }

  const worksheet = createWorksheetFrom({ documentType: 'classroom' });
  worksheet.title = bi('MC practice: diagrams', '多項選擇題練習：圖表');

  const grid = mcq(
    bi('Which of the following diagrams show a progressive tax?', '以下哪些圖表顯示累進稅？'),
    [bi('(1) and (2) only', '只有 (1) 和 (2)'), bi('(1) and (3) only', '只有 (1) 和 (3)'), bi('(2) and (4) only', '只有 (2) 和 (4)'), bi('(3) and (4) only', '只有 (3) 和 (4)')],
    1,
  );
  grid.blocks = [
    ...grid.blocks,
    createFigureGridBlock([
      small('proportional-tax', bi('Tax payment against income', '稅款與收入')),
      small('supply-demand', bi('Average tax rate against income', '平均稅率與收入')),
      small('demand-shift', bi('Marginal tax rate against income', '邊際稅率與收入')),
      small('ad-as', bi('Tax payment against income', '稅款與收入')),
    ]),
  ];

  const three = mcq(
    bi('Refer to the figures below. Which one shows a fall in demand?', '參閱下列各圖。哪一個顯示需求下降？'),
    [bi('(1)', '(1)'), bi('(2)', '(2)'), bi('(3)', '(3)'), bi('None of them', '以上皆不是')],
    0,
  );
  const picture = createImageBlock(TINY_PNG, 120, 90);
  three.blocks = [
    ...three.blocks,
    createFigureGridBlock([small('demand-shift', bi('', '')), small('supply-demand', bi('', '')), { ...picture, altText: bi('A sketch', '草圖') }], 3),
  ];

  const options = mcq(
    bi('The government sets a price ceiling below the equilibrium price. Which diagram shows the shortage?', '政府把價格上限定於均衡價格以下。哪一個圖表顯示短缺？'),
    [bi('', ''), bi('', ''), bi('', ''), bi('', '')],
    2,
  );
  options.options = options.options.map((option, i) => ({
    ...option,
    blocks: [small(['supply-demand', 'import-quota', 'demand-shift', 'tariff'][i], bi('', ''))],
  }));
  options.optionLayout = 'columns2';

  worksheet.questions = [...worksheet.questions, grid, three, options];
  worksheet.flow = [...worksheet.flow, ...[grid, three, options].map((q) => ({ type: 'question' as const, id: q.id }))];

  const doc = withStableIds(serializeWorksheet(worksheet));
  if (doc.schemaVersion !== 4) throw new Error(`Expected a v4 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-11-24T00:00:00.000Z';
  doc.updatedAt = '2026-11-24T00:00:00.000Z';
  doc.id = 'v4-figure-grid-corpus';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
