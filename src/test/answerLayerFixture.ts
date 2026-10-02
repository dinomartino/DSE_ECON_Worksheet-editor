import type { Diagram } from '@/model/diagram';
import { createDiagramBlock, createParagraphBlock, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { DiagramBlock, StructuredQuestion, Worksheet } from '@/model/types';
import { diagramSize } from '@/render/diagram';

/**
 * The teacher's E2 case: "construct the PPF on an empty diagram". Blank axes (Good X /
 * Good Y, 0–25, ticks every 5, "Diagram 1"), with the answer drawn on the answer layer:
 * the PPF from (0, 25) to (20, 0) and a labelled point on it.
 */
export function ppfAnswerDiagram(): Diagram {
  const ticks = (axis: string) =>
    [1, 2, 3, 4, 5].map((i) => ({ id: `${axis}${i * 5}`, at: i / 5, label: bi('', '') }));
  return {
    title: bi('Diagram 1', '圖 1'),
    x: { title: bi('Good X', 'X 物品'), max: 25, ticks: ticks('x') },
    y: { title: bi('Good Y', 'Y 物品'), max: 25, ticks: ticks('y') },
    curves: [
      {
        id: 'ppf',
        points: [
          { x: 0, y: 1 },
          { x: 0.8, y: 0 },
        ],
        shape: 'straight',
        label: bi('PPF', 'PPF'),
        labelAt: 'end',
        answer: true,
      },
    ],
    points: [
      {
        id: 'a',
        at: { x: 0.4, y: 0.5 },
        anchor: { on: 'ppf', x: { x: 0.4, y: 0 } },
        label: bi('A (10, 12.5)', 'A (10, 12.5)'),
        labelSide: 'upRight',
        dot: true,
        dropTo: ['x', 'y'],
        answer: true,
      },
    ],
    labels: [],
    arrows: [],
    showOrigin: true,
  };
}

/** A worksheet whose question part (d) holds that diagram — the shape of the teacher's screenshot. */
export function buildAnswerLayerWorksheet(): Worksheet {
  const worksheet = createWorksheet();
  worksheet.name = 'Answer layer';
  const base = createDiagramBlock('blank');
  const diagram = ppfAnswerDiagram();
  const block: DiagramBlock = {
    ...base,
    diagram,
    ...diagramSize(diagram, base.widthPx, 'bilingual'),
    altText: bi('Diagram 1', '圖 1'),
  };
  const question: StructuredQuestion = {
    id: 'q-ppf',
    type: 'structured',
    blocks: [createParagraphBlock(bi('Country A can produce Good X and Good Y.', 'A 國可生產 X 物品和 Y 物品。'))],
    parts: [
      {
        id: 'part-d',
        blocks: [
          createParagraphBlock(
            bi(
              'Construct the production possibility frontier of Country A in Diagram 1.',
              '在圖 1 中繪畫 A 國的生產可能曲線。',
            ),
          ),
          block,
        ],
        marks: 2,
      },
    ],
  };
  worksheet.questions = [question];
  return worksheet;
}
