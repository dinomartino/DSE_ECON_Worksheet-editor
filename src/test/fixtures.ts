import {
  createImageBlock,
  createMcqQuestion,
  createParagraphBlock,
  createStructuredQuestion,
  createTableBlock,
  createWorksheet,
  newId,
} from '@/model/factories';
import { bi } from '@/model/text';
import type {
  LayoutElement,
  McqQuestion,
  Question,
  StructuredQuestion,
  Worksheet,
} from '@/model/types';

/**
 * Put questions and layout elements into a worksheet, in the order given.
 *
 * Tests used to assign `worksheet.sections[0].questions = [...]`, which stated both the
 * content and its position in one line. With one flat flow that takes three lists kept
 * in step, so this does the bookkeeping: pass the items in printed order and the
 * `questions`, `layout` and `flow` lists all follow.
 *
 * Existing layout — the section headings `createWorksheet` ships — is kept, and the new
 * items land after it unless `replaceLayout` is set.
 */
export function withFlow(
  worksheet: Worksheet,
  items: Array<Question | LayoutElement>,
  options: { replaceLayout?: boolean } = {},
): Worksheet {
  const isQuestion = (item: Question | LayoutElement): item is Question => 'type' in item;
  const keptLayout = options.replaceLayout ? [] : worksheet.layout;

  worksheet.questions = items.filter(isQuestion);
  worksheet.layout = [...keptLayout, ...items.filter((item) => !isQuestion(item))] as LayoutElement[];
  worksheet.flow = [
    ...keptLayout.map((element) => ({ type: 'layout' as const, id: element.id })),
    ...items.map((item) => ({
      type: isQuestion(item) ? ('question' as const) : ('layout' as const),
      id: item.id,
    })),
  ];
  return worksheet;
}

/** A 1x1 red PNG, so image-embedding tests carry real bytes. */
export const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function mcq(stemEn: string, stemZh: string): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi(stemEn, stemZh))];
  question.options = [
    { id: newId(), text: bi('Price rises', '價格上升') },
    { id: newId(), text: bi('Price falls', '價格下跌') },
    { id: newId(), text: bi('Quantity falls', '數量減少') },
    { id: newId(), text: bi('No change', '沒有變化') },
  ];
  question.answerIndex = 2;
  question.explanation = bi('Demand shifts left.', '需求曲線向左移。');
  return question;
}

/**
 * The §11.1 acceptance fixture: 5 MCQs (one with nested statements, a table in the
 * stem, and an image) plus 2 structured questions with parts a-c and sub-parts.
 */
export function buildAcceptanceWorksheet(): Worksheet {
  const worksheet = createWorksheet();
  worksheet.title = bi('S5 Economics Test', '中五經濟科測驗');

  /*
   * A header, stated here rather than inherited.
   *
   * `createWorksheet` ships none — an empty default would print nothing, and the header
   * it used to carry only repeated the title. This fixture is what the export suite
   * asserts `word/header1.xml` against, so the part it checks for has to be something
   * the fixture asked for.
   */
  worksheet.header = {
    enabled: true,
    rule: true,
    showOnFirstPage: true,
    bands: [
      {
        id: newId(),
        zones: {
          left: [],
          center: [{ kind: 'text', id: newId(), text: bi('S5 Economics Test', '中五經濟科測驗') }],
          right: [],
        },
      },
    ],
  };

  const mcqs: McqQuestion[] = [
    mcq('What happens when demand falls?', '當需求下降時會發生甚麼？'),
    mcq('The GDP deflator measures:', 'GDP平減物價指數量度：'),
    mcq('An increase in supply causes:', '供應增加會導致：'),
    mcq('Opportunity cost refers to:', '機會成本是指：'),
    mcq('Which is a public good?', '以下哪項是公共物品？'),
  ];

  // Question 2 gets nested statements, a table and an image in its stem.
  const table = createTableBlock(3, 3);
  table.rows[0].cells[0].text = bi('Price ($)', '價格（元）');
  table.rows[0].cells[1].text = bi('Quantity demanded', '需求量');
  table.rows[0].cells[2].text = bi('Quantity supplied', '供應量');
  table.rows[1].cells[0].text = bi('10', '10');
  table.rows[1].cells[1].text = bi('100', '100');
  table.rows[1].cells[2].text = bi('40', '40');
  table.rows[2].cells[0].text = bi('20', '20');
  table.rows[2].cells[1].text = bi('80', '80');
  table.rows[2].cells[2].text = bi('80', '80');
  table.caption = bi('Table 1: Market schedule', '表一：市場表');

  // A merged header cell, to exercise gridSpan on export.
  const mergedTable = createTableBlock(2, 2);
  mergedTable.rows[0].cells[0].colSpan = 2;
  mergedTable.rows[0].cells[0].text = bi('Merged header', '合併標題');
  mergedTable.rows[0].cells[1].covered = true;

  const image = createImageBlock(TINY_PNG, 200, 150);
  image.altText = bi('Demand curve diagram', '需求曲線圖');
  image.caption = bi('Figure 1', '圖一');

  mcqs[1].blocks = [
    createParagraphBlock(bi('Study the table below. GDP平減物價指數(GDP deflator) rises.', '參閱下表。GDP平減物價指數上升。')),
    table,
    image,
  ];
  mcqs[1].statements = [
    bi('Real GDP falls', '實質本地生產總值下降'),
    bi('Nominal GDP rises', '名義本地生產總值上升'),
    bi('The price level rises', '物價水平上升'),
  ];

  mcqs[2].blocks = [createParagraphBlock(bi('An increase in supply causes:', '供應增加會導致：')), mergedTable];

  const structured: StructuredQuestion[] = [
    createStructuredQuestion(),
    createStructuredQuestion(),
  ];

  structured[0].blocks = [
    createParagraphBlock(bi('Consider a competitive market.', '考慮一個競爭市場。')),
  ];
  // Opted in, so the acceptance fixture exercises the question total. It is off by
  // default (parts carry their own marks), and `structured[1]` is left at the default
  // so both paths are covered.
  structured[0].showTotalMarks = true;
  structured[0].parts = [
    {
      id: newId(),
      blocks: [createParagraphBlock(bi('Define equilibrium price.', '定義均衡價格。'))],
      marks: 3,
      answer: bi('The price where Qd = Qs.', '需求量等於供應量時的價格。'),
    },
    {
      id: newId(),
      blocks: [createParagraphBlock(bi('Explain two determinants of demand.', '解釋兩項需求的決定因素。'))],
      subParts: [
        {
          id: newId(),
          blocks: [createParagraphBlock(bi('State the first determinant.', '指出第一項決定因素。'))],
          marks: 2,
          answer: bi('Income.', '收入。'),
        },
        {
          id: newId(),
          blocks: [createParagraphBlock(bi('State the second determinant.', '指出第二項決定因素。'))],
          marks: 2,
          answer: bi('Price of related goods.', '相關物品的價格。'),
        },
        {
          id: newId(),
          blocks: [createParagraphBlock(bi('Explain the effect on the curve.', '解釋對曲線的影響。'))],
          marks: 3,
          answer: bi('The curve shifts.', '曲線移動。'),
        },
      ],
    },
    {
      id: newId(),
      blocks: [createParagraphBlock(bi('Evaluate a price ceiling.', '評估價格上限。'))],
      marks: 5,
      answer: bi('Shortage results.', '造成短缺。'),
    },
  ];

  structured[1].blocks = [createParagraphBlock(bi('The government imposes a tax.', '政府徵稅。'))];
  structured[1].parts = [
    {
      id: newId(),
      blocks: [createParagraphBlock(bi('Draw the effect.', '繪圖說明影響。'))],
      marks: 4,
      answer: bi('Supply shifts left.', '供應曲線向左移。'),
    },
  ];

  /*
   * Place the questions under the two section markers the factory ships.
   *
   * The flow is written explicitly rather than relying on the append fallback: the
   * fallback would put every question after *both* headings, which is precisely the
   * arrangement this fixture exists to rule out — Section B's heading has to sit
   * between the MCQs and the structured questions for numbering to restart there.
   */
  const [sectionA, sectionB] = worksheet.layout.filter((element) => element.kind === 'section');
  worksheet.questions = [...mcqs, ...structured];
  worksheet.flow = [
    { type: 'layout', id: sectionA.id },
    ...mcqs.map((question) => ({ type: 'question' as const, id: question.id })),
    { type: 'layout', id: sectionB.id },
    ...structured.map((question) => ({ type: 'question' as const, id: question.id })),
  ];
  return worksheet;
}
