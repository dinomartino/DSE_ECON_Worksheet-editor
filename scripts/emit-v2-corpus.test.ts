/**
 * Not a unit test: writes the frozen schema-v2 corpus (a worksheet and a saved graph).
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V2_CORPUS=1 npx vitest run scripts/emit-v2-corpus.test.ts
 *
 * v2 is the first version written only when used (§ `writtenSchemaVersion`): a document
 * with a diagram answer layer or an `answerKeyLayout`. These files carry both, in every
 * place a diagram can sit, so `backwardCompat.test.ts` can prove a later migration keeps
 * them. Never regenerate them; a v3 gets files of its own.
 *
 * Every generated id becomes a stable slug, and every string equal to one (anchors, area
 * edges, derive sources) follows it, so the cross-references stay intact.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { Diagram } from '@/model/diagram';
import {
  createDiagramBlock,
  createFigureRowBlock,
  createParagraphBlock,
  createPart,
  createSourceBlock,
  createStructuredQuestion,
} from '@/model/factories';
import { graphFromBlock, serializeGraph } from '@/model/graph';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import { ppfAnswerDiagram } from '@/test/answerLayerFixture';
import type { DiagramBlock, Worksheet } from '@/model/types';
import { diagramSize } from '@/render/diagram';

const WORKSHEET_OUT = 'src/test/corpus/v2-published.json';
const GRAPH_OUT = 'src/test/corpus/graph-v2.json';

function withStableIds(doc: Record<string, unknown>, prefix: string): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `${prefix}${String(slugs.size + 1).padStart(3, '0')}`);
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

/** Supply and demand with an answer in every list, and dependents that lean on it. */
function marketAnswer(): Diagram {
  return {
    title: bi('Figure 1', '圖 1'),
    x: { title: bi('Quantity', '數量') },
    y: { title: bi('Price', '價格') },
    curves: [
      { id: 'd0', points: [{ x: 0.1, y: 0.9 }, { x: 0.9, y: 0.1 }], shape: 'straight', label: bi('D₀', 'D₀'), labelAt: 'end' },
      { id: 's0', points: [{ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }], shape: 'straight', label: bi('S', 'S'), labelAt: 'end' },
      { id: 'd1', points: [{ x: 0.25, y: 0.95 }, { x: 0.95, y: 0.25 }], shape: 'straight', label: bi('D₁', 'D₁'), labelAt: 'end', answer: true },
      { id: 'mr1', points: [{ x: 0.25, y: 0.95 }, { x: 0.6, y: 0.25 }], shape: 'straight', derive: { kind: 'marginalRevenue', of: 'd1' } },
    ],
    points: [
      { id: 'e0', at: { x: 0.5, y: 0.5 }, anchor: { cross: ['d0', 's0'] }, label: bi('E₀', 'E₀'), dot: true },
      { id: 'e1', at: { x: 0.6, y: 0.6 }, anchor: { cross: ['d1', 's0'] }, label: bi('E₁', 'E₁'), dot: true, dropTo: ['x', 'y'] },
      { id: 'p1', at: { x: 0.7, y: 0.5 }, answer: true, label: bi('A', 'A') },
    ],
    labels: [{ id: 'why', at: { x: 0.75, y: 0.85 }, text: bi('Income rises', '收入上升'), answer: true }],
    arrows: [{ id: 'shift', from: { x: 0.55, y: 0.3 }, to: { x: 0.68, y: 0.43 }, answer: true }],
    areas: [
      { id: 'cs0', band: { edges: [{ curve: 'd0' }, { level: { point: 'e0' } }], from: 0, to: { point: 'e0' } } },
      { id: 'cs1', band: { edges: [{ curve: 'd1' }, { level: { point: 'e1' } }], from: 0, to: { point: 'e1' } } },
      { id: 'gain', band: { edges: [{ curve: 'd0' }, { level: { point: 'e0' } }], from: 0, to: { point: 'e0' } }, answer: true },
    ],
    spans: [
      { id: 'gap', from: { point: 'e0' }, to: { point: 'e1' }, style: 'arrow', along: 'x' },
      { id: 'own', from: { x: 0.2, y: 0.2 }, to: { x: 0.3, y: 0.2 }, style: 'bracket', answer: true },
    ],
  };
}

function block(diagram: Diagram, alt: string): DiagramBlock {
  const base = createDiagramBlock('blank');
  return { ...base, diagram, ...diagramSize(diagram, base.widthPx, 'bilingual'), altText: bi(alt, alt) };
}

it('emits the frozen schema-v2 corpus', () => {
  if (process.env.EMIT_V2_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${WORKSHEET_OUT} and ${GRAPH_OUT}. They are never ` +
        'regenerated; set EMIT_V2_CORPUS=1 only when deliberately cutting them.',
    );
  }

  const worksheet: Worksheet = createWorksheetFrom({ documentType: 'lqMock', seedSample: true });
  worksheet.title = bi('S5 Economics Mock Examination', '中五經濟科模擬試');
  worksheet.instructions = bi('Answer ALL questions in Section A.', '甲部所有題目均須作答。');

  // An answered diagram in a stem's source, a part, and a figure row (§ `answeredDiagrams`).
  const question = createStructuredQuestion();
  const source = createSourceBlock('A');
  source.blocks = [createParagraphBlock(bi('The market for rice.', '白米市場。')), block(marketAnswer(), 'Rice market')];
  question.blocks = [createParagraphBlock(bi('Study Source A.', '細閱資料 A。')), source];

  const partA = createPart();
  partA.blocks = [
    createParagraphBlock(bi('Draw the effect of a rise in income in Figure 1.', '在圖 1 中繪畫收入上升的影響。')),
    block(marketAnswer(), 'Figure 1'),
  ];
  partA.marks = 4;
  partA.answer = bi('Demand rises: D shifts right to D₁.', '需求上升：D 向右移至 D₁。');

  const partB = createPart();
  partB.blocks = [
    createParagraphBlock(bi('Construct the PPF in Diagram 1.', '在圖 1 中繪畫生產可能曲線。')),
    createFigureRowBlock(block(ppfAnswerDiagram(), 'Diagram 1')),
  ];
  partB.marks = 2;
  question.parts = [partA, partB];

  worksheet.questions = [...worksheet.questions, question];
  worksheet.flow = [...worksheet.flow, { type: 'question', id: question.id }];

  // The Suggested answers preset, a change to it, and both text overrides.
  worksheet.answerKeyLayout = {
    preset: 'suggested',
    title: bi('Suggested answers', '參考答案'),
    subtitle: bi('S5 Mock 2026', '中五模擬試 2026'),
    showMcStems: true,
  };

  const doc = withStableIds(serializeWorksheet(worksheet), 'id');
  if (doc.schemaVersion !== 2) throw new Error(`Expected a v2 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-10-03T00:00:00.000Z';
  doc.updatedAt = '2026-10-03T00:00:00.000Z';
  doc.id = 'v2-published-corpus';

  const graph = graphFromBlock(block(marketAnswer(), 'Rice market'), 'bilingual', undefined, 'graph-corpus-v2', '2026-10-03T00:00:00.000Z');
  const graphDoc = withStableIds(serializeGraph({ ...graph, name: 'Rice market, income rise' }), 'g');
  graphDoc.id = 'graph-corpus-v2';
  if (graphDoc.schemaVersion !== 2) throw new Error(`Expected a v2 graph, got ${String(graphDoc.schemaVersion)}.`);

  mkdirSync('src/test/corpus', { recursive: true });
  writeFileSync(WORKSHEET_OUT, `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(GRAPH_OUT, `${JSON.stringify(graphDoc, null, 2)}\n`);
  console.log(`wrote ${WORKSHEET_OUT} and ${GRAPH_OUT}`);
});
