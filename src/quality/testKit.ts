/** Test-only: a small paper for the quality check, and reply builders. Never imported by app code. */
import type { CompletionRequest } from '@/ai/types';
import { createMcqQuestion, createParagraphBlock, createPart, createStructuredQuestion, createSubPart, createTableBlock, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';

const para = (en: string, zh = '') => createParagraphBlock(bi(en, zh));

/**
 * Q1 an MCQ with an unemphasised "not" (key C); Q2 a combination MCQ whose option C names
 * a statement (4) that isn't there; Q3 structured, (b)'s scheme totals 3 against 4 printed
 * marks; Q4 blank.
 */
export function qualityWorksheet(): Worksheet {
  const q1: McqQuestion = {
    ...createMcqQuestion(),
    id: 'Q1',
    blocks: [para('Which of the following is not a factor of production?', '下列哪一項不是生產要素？')],
    options: ['Land', 'Labour', 'Money', 'Capital'].map((en, i) => ({ id: `Q1o${i}`, text: bi(en, ['土地', '勞動', '貨幣', '資本'][i]) })),
    answerIndex: 2,
  };
  const q2: McqQuestion = {
    ...createMcqQuestion(),
    id: 'Q2',
    blocks: [para('Which of the following would shift the demand curve for beef?')],
    statements: [bi('a rise in the price of pork', ''), bi('a fall in income', ''), bi('a fall in the price of beef', '')],
    options: ['(1) and (2) only', '(1) and (3) only', '(2) and (4) only', '(1), (2) and (3)'].map((en, i) => ({ id: `Q2o${i}`, text: bi(en, '') })),
    answerIndex: 0,
  };
  const table = createTableBlock(2, 2);
  table.rows[0].cells[0].text = bi('Year', '年份');
  table.rows[0].cells[1].text = bi('Price', '價格');
  table.rows[1].cells[0].text = bi('2024', '2024');
  table.rows[1].cells[1].text = bi('40', '40');
  const q3: StructuredQuestion = {
    ...createStructuredQuestion(),
    id: 'Q3',
    blocks: [para('The table shows the price of a good.', '下表顯示某物品的價格。'), table],
    parts: [
      { ...createPart(), id: 'Q3a', blocks: [para('Explain what is meant by price.', '解釋何謂價格。')], marks: 1 },
      {
        ...createPart(), id: 'Q3b', blocks: [para('Explain why the price rose.', '解釋價格為何下跌。')], marks: 4,
        scheme: { routes: [{ id: 'r', groups: [{ id: 'g', points: [{ id: 'p1', text: bi('Demand rose', ''), marks: 3 }] }] }] },
      },
      {
        ...createPart(), id: 'Q3c', blocks: [para('With reference to the table:')], marks: undefined,
        subParts: [
          { ...createSubPart(), id: 'Q3ci', blocks: [para('State the price in 2024.')], marks: 1 },
          { ...createSubPart(), id: 'Q3cii', blocks: [para('Explain one reason for it.')], marks: 2 },
        ],
      },
    ],
  };
  const q4 = { ...createStructuredQuestion(), id: 'Q4' };
  return { ...createWorksheet(), id: 'W1', questions: [q1, q2, q3, q4] };
}

/** The payload a request carries. */
export function payloadOf(req: CompletionRequest): {
  questions: Array<{ key: string; format: string; entries: Array<{ key: string; role: string; en?: string; zh?: string; marks?: number; marksTotal?: boolean; keyed?: boolean }> }>;
} {
  return JSON.parse(req.turns[req.turns.length - 1].content);
}

export interface FindingSpec { key: string; issue?: string; severity?: string; text?: string; suggestion?: string }

export const findingsReply = (items: FindingSpec[]): string =>
  JSON.stringify({
    items: items.map((item) => ({
      issue: 'ambiguous', severity: 'look', text: 'Worth a look.', suggestion: '', ...item,
    })),
  });
