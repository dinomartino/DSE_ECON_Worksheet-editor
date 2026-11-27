/**
 * Not a unit test: writes the frozen corpus of the v4 flow figures (k-0588).
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V4_FLOW_CORPUS=1 npx vitest run scripts/emit-v4-flow-corpus.test.ts
 *
 * A flow chart using a dashed arrow, a loop (`route`), the grid layout or the key is
 * written at schema 4 (`migrations.ts:V4_FLOW_VERSION`). This file carries the HKDSE
 * figures that need them (2026 P1 Q5 circular flow, 2014 P1 Q10 and 2024 P1 Q6 stage
 * charts) beside a plain value-added chain (2021 P1 Q23), each in an MC stem, so
 * `flowCompat.test.ts` can prove a later build keeps them, and
 * `scripts/flow-release-corpus.test.ts` (run in each release's own checkout) can record
 * what that release does when a teacher opens it. Never regenerate it.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createDiagramBlock, createMcqQuestion, createParagraphBlock, createWorksheet } from '@/model/factories';
import { serializeWorksheet } from '@/model/migrations';
import { diagramSize } from '@/render/diagram';
import { bi } from '@/model/text';
import type { Diagram } from '@/model/diagram';
import type { BiText, McqQuestion } from '@/model/types';
import { dse2014q10, dse2021q23, dse2024q6, dse2026q5 } from '@/test/flowFixtures';

const OUT = 'src/test/corpus/v4-flow-figures.json';

function question(stem: BiText, diagram: Diagram, options: BiText[], answer: number, id: string): McqQuestion {
  const q = createMcqQuestion();
  const block = createDiagramBlock('flow', 460);
  const placed = { ...block, id: `${id}-figure`, diagram: { ...diagram, templateId: 'flow' } };
  q.id = id;
  q.blocks = [createParagraphBlock(stem), { ...placed, ...diagramSize(placed.diagram, placed.widthPx, 'en') }];
  q.blocks[0].id = `${id}-stem`;
  q.options = q.options.map((option, i) => ({ ...option, id: `${id}-o${i}`, text: options[i] }));
  q.answerIndex = answer;
  return q;
}

it('emits the frozen v4 flow figures corpus', () => {
  if (process.env.EMIT_V4_FLOW_CORPUS !== '1') {
    throw new Error(`Refusing to rewrite the frozen corpus ${OUT}. Set EMIT_V4_FLOW_CORPUS=1 only when deliberately cutting it.`);
  }
  const worksheet = createWorksheet();
  worksheet.id = 'v4-flow-figures-corpus';
  worksheet.title = bi('MC practice: flow figures', '多項選擇題練習：流程圖');
  const questions = [
    question(
      bi('The diagram below shows the circular flow of a two-sector economy. Which of the following correctly describes Flow X and Flow Y?', '下圖顯示一個兩部門經濟的循環流程。以下哪項正確描述流量 X 和流量 Y？'),
      dse2026q5(),
      [bi('X: factor payments; Y: goods and services', 'X：生產要素收入；Y：物品和服務'), bi('X: consumption expenditure; Y: goods and services', 'X：消費開支；Y：物品和服務'), bi('X: factor payments; Y: factor services', 'X：生產要素收入；Y：生產要素服務'), bi('X: consumption expenditure; Y: factor services', 'X：消費開支；Y：生產要素服務')],
      1,
      'q-circular',
    ),
    question(
      bi('Which of the following correctly describes the flows E and F?', '以下哪項正確描述流量 E 和 F？'),
      dse2014q10(),
      [bi('E only', '只有 E'), bi('F only', '只有 F'), bi('Both E and F', 'E 和 F'), bi('Neither E nor F', 'E 和 F 皆不是')],
      2,
      'q-stages',
    ),
    question(
      bi('Refer to the diagram. Which of the following could be P and Q?', '參閱上圖。以下哪項可以是 P 和 Q？'),
      dse2024q6(),
      [bi('(1) only', '只有 (1)'), bi('(2) only', '只有 (2)'), bi('(1) and (3) only', '只有 (1) 和 (3)'), bi('(2) and (3) only', '只有 (2) 和 (3)')],
      0,
      'q-households',
    ),
    question(
      bi('Refer to the chain below. What is the total value added?', '參閱下面的生產鏈。總增加價值是多少？'),
      dse2021q23(),
      [bi('$1 450', '$1 450'), bi('$1 550', '$1 550'), bi('$1 650', '$1 650'), bi('$1 750', '$1 750')],
      0,
      'q-chain',
    ),
  ];
  worksheet.questions = questions;
  worksheet.flow = questions.map((q) => ({ type: 'question' as const, id: q.id }));
  const doc = serializeWorksheet(worksheet);
  if (doc.schemaVersion !== 4) throw new Error(`Expected a v4 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-11-27T00:00:00.000Z';
  doc.updatedAt = '2026-11-27T00:00:00.000Z';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
