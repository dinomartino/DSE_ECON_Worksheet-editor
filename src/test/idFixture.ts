import {
  createAnswerDiagram,
  createDiagramBlock,
  createFigureRowBlock,
  createMcqQuestion,
  createParagraphBlock,
  createPart,
  createSourceBlock,
  createStructuredQuestion,
  createSubPart,
  createTableBlock,
  OPTION_DIAGRAM_WIDTH_PX,
} from '@/model/factories';
import { createMarkEc, createMarkLevel, createMarkScheme } from '@/model/markScheme';
import { bi } from '@/model/text';
import type { McqQuestion, StructuredQuestion } from '@/model/types';

/**
 * Questions holding an id at every place one can live — for the re-id and repair tests
 * (`model/lineage.ts`, `model/dedupeIds.ts`).
 */

export function richStructured(): StructuredQuestion {
  const source = createSourceBlock();
  source.blocks = [createParagraphBlock(bi('Source text', '資料內容')), createTableBlock(2, 2)];
  const part = createPart();
  part.blocksBefore = [createParagraphBlock(bi('Interlude', '插段'))];
  part.blocks = [
    createParagraphBlock(bi('Part (a)', '(a) 部')),
    createFigureRowBlock(createDiagramBlock('supply-demand')),
  ];
  part.answerDiagram = createAnswerDiagram();
  part.answer = bi('Model answer', '參考答案');
  part.scheme = { ...createMarkScheme(), levels: [createMarkLevel()], ec: createMarkEc() };
  const sub = createSubPart();
  sub.blocks = [createParagraphBlock(bi('Sub-part (i)', '(i) 分題'))];
  sub.answerDiagram = createAnswerDiagram();
  sub.scheme = createMarkScheme();
  part.subParts = [sub];
  const table = createTableBlock(2, 3);
  table.rows[0].cells[0].text = bi('Price', '價格');
  return {
    ...createStructuredQuestion(),
    blocks: [createParagraphBlock(bi('Stem', '題幹')), table, source],
    parts: [part, createPart()],
  };
}

export function richMcq(): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi('Which diagram shows a surplus?', '哪一幅圖顯示過剩？'))];
  question.options = question.options.map((option, i) => ({
    ...option,
    text: bi(`Option ${'ABCD'[i]}`, `選項 ${'ABCD'[i]}`),
  }));
  question.options[0].blocks = [createDiagramBlock('supply-demand', OPTION_DIAGRAM_WIDTH_PX)];
  return question;
}
