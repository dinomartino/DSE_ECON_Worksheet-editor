import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import {
  ANSWER_DIAGRAM_WIDTH_PX,
  createDiagramBlock,
  createStructuredQuestion,
  createTableBlock,
  createWorksheet,
  newId,
} from '@/model/factories';
import type { MarkPoint } from '@/model/markSchemeTypes';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { ContentBlock, ParagraphBlock, TableBlock } from '@/model/types';
import { withFlow } from '@/test/fixtures';

/**
 * k-0595's browser fixture (`scripts/point-figures-verify.mjs`): a part whose marking points
 * hold their own figures — (1) a demand-shift diagram, (1) a table — plus a table still in the
 * answer beside the scheme (the "external" figure), and the paper (teacher) and answer key as
 * .docx (EN, 中). Written to $POINT_DIR (default /tmp/point-figures-verify).
 */

const para = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });
const point = (en: string, zh: string, marks: number, blocks?: ContentBlock[]): MarkPoint => ({
  id: newId(),
  text: bi(en, zh),
  marks,
  ...(blocks ? { blocks } : {}),
});
function table(rows: Array<[string, string, string, string]>): TableBlock {
  const block = createTableBlock(rows.length, 2);
  rows.forEach(([en1, zh1, en2, zh2], index) => {
    block.rows[index].cells[0].text = bi(en1, zh1);
    block.rows[index].cells[1].text = bi(en2, zh2);
  });
  return block;
}

it('emits the point figures fixture', async () => {
  const question = createStructuredQuestion();
  question.blocks = [para('Household incomes in Hong Kong rose in 2025.', '2025 年香港家庭收入上升。')];
  const diagram = { ...createDiagramBlock('demand-shift', ANSWER_DIAGRAM_WIDTH_PX), id: newId() };
  question.parts = [
    {
      id: newId(),
      blocks: [para('With the aid of a diagram, explain the effect on the market for taxi rides.', '試以圖解釋這對的士服務市場的影響。')],
      marks: 4,
      answer: bi('Taxi rides are a normal good.', '的士服務是正常物品。'),
      answerBlocks: [
        table([
          ['Before', '之前', 'After', '之後'],
          ['P1, Q1', 'P1, Q1', 'P2, Q2', 'P2, Q2'],
        ]),
      ],
      scheme: {
        routes: [
          {
            id: newId(),
            groups: [
              {
                id: newId(),
                points: [
                  point('Correct diagram: D shifts rightward from D1 to D2, new equilibrium labelled.', '正確圖表：需求曲線由 D1 右移至 D2，標示新均衡點。', 1, [diagram]),
                  point('Equilibrium price rises from P1 to P2.', '均衡價格由 P1 上升至 P2。', 1),
                  point('Equilibrium quantity rises from Q1 to Q2.', '均衡數量由 Q1 上升至 Q2。', 1),
                  point('Total revenue rises, as shown:', '總收入上升，如下：', 1, [
                    table([
                      ['Total revenue', '總收入', 'P2 × Q2 > P1 × Q1', 'P2 × Q2 > P1 × Q1'],
                    ]),
                  ]),
                ],
              },
            ],
          },
        ],
      },
    },
  ];
  const worksheet = withFlow({ ...createWorksheet(), name: 'Point figures harness' }, [question]);
  const dir = process.env.POINT_DIR ?? '/tmp/point-figures-verify';
  writeFileSync(`${dir}/point.worksheet.json`, JSON.stringify(serializeWorksheet(worksheet)));
  for (const language of ['en', 'zh'] as const) {
    writeFileSync(`${dir}/point-key-${language}.docx`, Buffer.from(await exportAnswerKeyDocxBuffer(worksheet, language)));
    writeFileSync(
      `${dir}/point-teacher-${language}.docx`,
      Buffer.from(await exportDocxBuffer(worksheet, { language, version: 'teacher' })),
    );
  }
});
