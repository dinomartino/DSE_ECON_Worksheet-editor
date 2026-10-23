import {
  createDiagramBlock,
  createImageBlock,
  createMcqQuestion,
  createParagraphBlock,
  createStructuredQuestion,
  createWorksheet,
  newId,
} from '@/model/factories';
import { bi } from '@/model/text';
import type { McqQuestion, StructuredQuestion, Worksheet } from '@/model/types';
import { TINY_PNG, withFlow } from './fixtures';

/**
 * A paper for the option-layout work (`registry/mcqLayouts.test.ts`,
 * `registry/mcqLayoutsSurfaces.test.tsx`, `components/editor/optionLayoutAction.test.ts`, and
 * the real-Word samples in `scripts/emit-samples.test.ts`): four MC questions whose options
 * ask for different layouts, then a structured question, which has no options to lay out.
 *
 *   1. short options (the longest is 16 characters): suit a row
 *   2. mid-length options (the longest is 27): suit two to a row
 *   3. full sentences (the longest is 66): only stacked reads well, and set in a row they
 *      do not fit, so the paper prints them in a grid
 *   4. figure options: never in a row
 *
 * Every question is authored without a layout, as an untouched paper is.
 */

export interface OptionLayoutPaper {
  worksheet: Worksheet;
  short: McqQuestion;
  mid: McqQuestion;
  long: McqQuestion;
  figures: McqQuestion;
  structured: StructuredQuestion;
}

type Side = readonly [en: string, zh: string];

/** An MC question with the given options (English, 中文) under a stem. */
export function optionLayoutMcq(stem: Side, options: readonly Side[], extra: Partial<McqQuestion> = {}): McqQuestion {
  return {
    ...createMcqQuestion(),
    blocks: [createParagraphBlock(bi(stem[0], stem[1]))],
    options: options.map(([en, zh]) => ({ id: newId(), text: bi(en, zh) })),
    answerIndex: 1,
    ...extra,
  };
}

/** The same question with a figure under each option: a placeholder picture, or a real diagram. */
export function withFigures(question: McqQuestion, kind: 'image' | 'diagram' = 'image'): McqQuestion {
  const templates = ['supply-demand', 'demand-shift', 'ad-as', 'ppc'];
  return {
    ...question,
    options: question.options.map((option, index) => ({
      ...option,
      blocks: [kind === 'image' ? createImageBlock(TINY_PNG, 120, 90) : createDiagramBlock(templates[index % templates.length], 200)],
    })),
  };
}

export function buildOptionLayoutPaper(figures: 'image' | 'diagram' = 'image'): OptionLayoutPaper {
  const short = optionLayoutMcq(
    ['Which of the following will shift the demand curve for tablet computers to the right?', '以下哪項會令平板電腦的需求曲線向右移？'],
    [
      ['(1) only', '只有 (1)'],
      ['(2) only', '只有 (2)'],
      ['(1) and (2) only', '只有 (1) 和 (2)'],
      ['(1), (2) and (3)', '(1)、(2) 和 (3)'],
    ],
  );
  const mid = optionLayoutMcq(
    ['Income rises. For a normal good, what happens to the equilibrium price and quantity?', '收入上升。對於正常物品，均衡價格和數量會有甚麼變化？'],
    [
      ['Price rises, quantity rises', '價格上升，數量上升'],
      ['Price rises, quantity falls', '價格上升，數量下降'],
      ['Price falls, quantity rises', '價格下降，數量上升'],
      ['Price falls, quantity falls', '價格下降，數量下降'],
    ],
  );
  const long = optionLayoutMcq(
    ['A price ceiling is set below the equilibrium price. Why does a shortage result?', '價格上限定於均衡價格以下。為甚麼會出現短缺？'],
    [
      ['The quantity demanded rises while the quantity supplied falls', '需求量上升，而供應量下降'],
      ['Producers are not allowed to charge more than the legal price', '生產者不得以高於法定價格出售'],
      ['The government removes the tax on the good completely', '政府完全取消該貨品的稅項'],
      ['The government pays a subsidy to the producers of the good', '政府向該貨品的生產者發放津貼'],
    ],
  );
  const figures_ = withFigures(
    optionLayoutMcq(
      ['Which diagram shows the effect of an increase in the number of sellers?', '哪個圖表顯示賣方數目增加的影響？'],
      [
        ['', ''],
        ['', ''],
        ['', ''],
        ['', ''],
      ],
    ),
    figures,
  );
  const structured = createStructuredQuestion();
  structured.blocks = [createParagraphBlock(bi('Explain how a price ceiling affects the market for rice.', '解釋價格上限如何影響白米市場。'))];

  const worksheet = withFlow(createWorksheet(), [short, mid, long, figures_, structured]);
  worksheet.title = bi('Option layout', '選項排列');
  return { worksheet, short, mid, long, figures: figures_, structured };
}
