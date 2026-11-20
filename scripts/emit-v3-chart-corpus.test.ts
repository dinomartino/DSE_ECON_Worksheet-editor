/**
 * Not a unit test: writes the frozen corpus of schema v3's data chart (k-0474).
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V3_CHART_CORPUS=1 npx vitest run scripts/emit-v3-chart-corpus.test.ts
 *
 * v3 also marks a document holding a data chart (`Diagram.chart`), which every build
 * before it prints as empty axes. This file carries a data-response question with a
 * Source A bar chart (a negative figure, a missing figure, pinned axis range) and a
 * Source B line graph (three series, an x title), so `backwardCompat.test.ts` can prove
 * a later migration keeps them. Never regenerate it; a v4 gets files of its own.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import {
  createDiagramBlock,
  createParagraphBlock,
  createPart,
  createSourceBlock,
  createStructuredQuestion,
} from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { diagramSize } from '@/render/diagram';
import { bi } from '@/model/text';
import type { DataChart } from '@/model/diagram';
import type { DiagramBlock } from '@/model/types';

const OUT = 'src/test/corpus/v3-chart.json';

/** Generated ids to stable slugs; every string equal to one follows it. */
function withStableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `ch${String(slugs.size + 1).padStart(3, '0')}`);
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

function chartBlock(templateId: string, chart: DataChart, title: ReturnType<typeof bi>): DiagramBlock {
  const block = createDiagramBlock(templateId);
  const diagram = { ...block.diagram, title, chart };
  return { ...block, align: 'center', diagram, ...diagramSize(diagram, block.widthPx, 'bilingual') };
}

it('emits the frozen v3 chart corpus', () => {
  if (process.env.EMIT_V3_CHART_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${OUT}. It is never regenerated; set ` +
        'EMIT_V3_CHART_CORPUS=1 only when deliberately cutting it.',
    );
  }

  const worksheet = createWorksheetFrom({ documentType: 'classroom' });
  worksheet.title = bi('DRQ practice: a small economy', '資料回應題練習：一個小型經濟體');

  const sourceA = createSourceBlock('A');
  sourceA.label = bi('Source A: Budget balance of Country X', '資料A：X國的財政預算結餘');
  sourceA.blocks = [
    chartBlock(
      'bar-chart',
      {
        kind: 'bar',
        categories: [bi('2021-22', '2021-22'), bi('2022-23', '2022-23'), bi('2023-24', '2023-24')],
        series: [{ id: 'balance', label: bi('Budget balance', '財政預算結餘'), values: [12000, -85000, null] }],
        yTitle: bi('$ million', '百萬元'),
        xTitle: bi('Fiscal year', '財政年度'),
        yMin: -100000,
        yMax: 50000,
        yStep: 25000,
      },
      bi('Budget balance', '財政預算結餘'),
    ),
  ];

  const sourceB = createSourceBlock('B');
  sourceB.label = bi('Source B: Unemployment rate by industry', '資料B：按行業劃分的失業率');
  sourceB.blocks = [
    chartBlock(
      'line-chart',
      {
        kind: 'line',
        categories: [bi('Q1', '第一季'), bi('Q2', '第二季'), bi('Q3', '第三季'), bi('Q4', '第四季')],
        series: [
          { id: 'retail', label: bi('Retail', '零售業'), values: [4.2, 5.1, 6.0, 6.4] },
          { id: 'finance', label: bi('Finance', '金融業'), values: [2.1, 2.3, null, 2.6] },
          { id: 'all', label: bi('All industries', '所有行業'), values: [3.0, 3.4, 3.9, 4.1] },
        ],
        yTitle: bi('%', '%'),
        xTitle: bi('Quarter', '季度'),
      },
      bi('', ''),
    ),
  ];

  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi('Study Sources A and B.', '細閱資料A及B。')), sourceA, sourceB];
  const part = createPart();
  part.blocks = [
    createParagraphBlock(
      bi('Refer to Source A. Describe the change in the budget balance.', '參考資料A，描述財政預算結餘的變化。'),
    ),
  ];
  part.marks = 2;
  question.parts = [part];

  worksheet.questions = [...worksheet.questions, question];
  worksheet.flow = [...worksheet.flow, { type: 'question', id: question.id }];

  const doc = withStableIds(serializeWorksheet(worksheet));
  if (doc.schemaVersion !== 3) throw new Error(`Expected a v3 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-11-20T00:00:00.000Z';
  doc.updatedAt = '2026-11-20T00:00:00.000Z';
  doc.id = 'v3-chart-corpus';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
