import { createSectionElement } from './flow';
import { createDiagramBlock, createTableBlock, newId } from './factories';
import type { MarkScheme } from './markSchemeTypes';
import { createWorksheetFrom } from './newWorksheet';
import { parseRuns } from './text';
import type {
  BiText,
  ContentBlock,
  McqQuestion,
  ParagraphBlock,
  QuestionPart,
  StructuredQuestion,
  TableBlock,
  Worksheet,
} from './types';

/**
 * "Open a sample paper" (k-0201, research M3): a short, filled Classroom worksheet a teacher
 * can open, change and delete, so the first minutes start from a real paper rather than a
 * blank page. Demand and supply, DSE-style, bilingual: three MC (one a (1)(2)(3)
 * combination), one structured question with a table, a printed diagram to draw on and a
 * model answer diagram, marks, the MC answers and a marking scheme of mark points.
 *
 * Original wording, written for this app: not a past paper, nor adapted from one. **The user
 * checks the content before release** (STATUS → What to check). It is hidden from the 題庫
 * (`bankHidden`) so its questions never seed the bank as if a teacher had written them. A
 * fresh copy, with fresh ids, every time it is opened.
 */

/** `**bold**`, `_{sub}` markup on both sides (`parseRuns`). */
const t = (en: string, zh: string): BiText => ({ en: parseRuns(en), zh: parseRuns(zh) });

const paragraph = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: t(en, zh) });

const scheme = (points: Array<[string, string, number]>): MarkScheme => ({
  routes: [
    {
      id: newId(),
      groups: [{ id: newId(), points: points.map(([en, zh, marks]) => ({ id: newId(), text: t(en, zh), marks })) }],
    },
  ],
});

function mcq(stem: BiText, options: BiText[], answerIndex: number, explanation: BiText, statements?: BiText[]): McqQuestion {
  return {
    id: newId(),
    type: 'mcq',
    blocks: [{ kind: 'paragraph', id: newId(), text: stem }],
    ...(statements ? { statements } : {}),
    options: options.map((text) => ({ id: newId(), text })),
    answerIndex,
    explanation,
    marks: 1,
  };
}

/** The market for face masks: price, quantity demanded, quantity supplied. */
function maskTable(): TableBlock {
  const table = createTableBlock(6, 3);
  const rows: Array<[BiText, BiText, BiText]> = [
    [t('**Price ($ per box)**', '**價格（每盒 $）**'), t('**Quantity demanded (boxes)**', '**需求量（盒）**'), t('**Quantity supplied (boxes)**', '**供應量（盒）**')],
    ...[
      ['20', '600', '200'],
      ['30', '500', '300'],
      ['40', '400', '400'],
      ['50', '300', '500'],
      ['60', '200', '600'],
    ].map(([price, demanded, supplied]) => [t(price, price), t(demanded, demanded), t(supplied, supplied)] as [BiText, BiText, BiText]),
  ];
  return {
    ...table,
    rows: table.rows.map((row, r) => ({
      ...row,
      cells: row.cells.map((cell, c) => ({ ...cell, text: rows[r][c], align: 'center' as const })),
    })),
  };
}

function structured(): StructuredQuestion {
  // The key gives each part its mark points only: a model answer as well would state the
  // same facts twice, once as prose and again point by point.
  const part = (blocks: ContentBlock[], marks: number, answerSpace: number, points: MarkScheme, extra: Partial<QuestionPart> = {}): QuestionPart => ({
    id: newId(),
    blocks,
    marks,
    answerSpace,
    scheme: points,
    ...extra,
  });
  return {
    id: newId(),
    type: 'structured',
    blocks: [
      paragraph(
        'The table below shows the market demand and market supply of face masks in a town.',
        '下表顯示某市鎮口罩的市場需求及市場供應。',
      ),
      maskTable(),
    ],
    parts: [
      part(
        [paragraph('State the equilibrium price and the equilibrium quantity of face masks.', '寫出口罩的均衡價格及均衡數量。')],
        2,
        3,
        scheme([
          ['Equilibrium price: $40 per box', '均衡價格：每盒 $40', 1],
          ['Equilibrium quantity: 400 boxes', '均衡數量：400 盒', 1],
        ]),
      ),
      part(
        [
          paragraph(
            'Suppose the government sets a maximum price of $30 per box. Calculate the shortage of face masks. Show your working.',
            '假設政府把口罩的最高價格定為每盒 $30。計算口罩的短缺數量，並列出計算步驟。',
          ),
        ],
        2,
        4,
        scheme([
          ['Quantity demanded 500 boxes and quantity supplied 300 boxes at $30', '在 $30 時需求量為 500 盒、供應量為 300 盒', 1],
          ['Shortage = 500 − 300 = 200 boxes', '短缺 = 500 − 300 = 200 盒', 1],
        ]),
      ),
      part(
        [
          paragraph(
            'There is no maximum price. An outbreak of influenza then raises the demand for face masks. The diagram below shows the market before the outbreak.',
            '現時沒有最高價格。其後流感爆發，令口罩的需求增加。下圖顯示流感爆發前的市場。',
          ),
          createDiagramBlock('supply-demand', 300),
          paragraph(
            'With the aid of the diagram, explain the effect of the outbreak on the equilibrium price and the equilibrium quantity of face masks.',
            '試借助上圖，解釋流感爆發對口罩的均衡價格及均衡數量的影響。',
          ),
        ],
        4,
        6,
        scheme([
          ['Diagram: the demand curve shifts rightward (D_{0} to D_{1})', '圖表：需求曲線向右移（D_{0} 至 D_{1}）', 1],
          ['Diagram: the new equilibrium price and quantity are marked', '圖表：標示新的均衡價格及均衡數量', 1],
          ['At the original price there is a shortage, so the price is bid up', '在原有價格下出現短缺，價格被推高', 1],
          ['The equilibrium price rises and the equilibrium quantity rises', '均衡價格上升，均衡數量上升', 1],
        ]),
        { answerDiagram: createDiagramBlock('demand-shift', 300) },
      ),
    ],
  };
}

function questions(): { mc: McqQuestion[]; lq: StructuredQuestion } {
  const combination = (en: string, zh: string) => t(en, zh);
  return {
    mc: [
      mcq(
        t(
          'Other things being equal, which of the following would increase the demand for bubble tea in Hong Kong?',
          '假設其他因素不變，下列哪一項會令香港珍珠奶茶的需求增加？',
        ),
        [
          t('a fall in the price of bubble tea', '珍珠奶茶的價格下跌'),
          t('a rise in the price of milk tea, a substitute', '替代品港式奶茶的價格上升'),
          t('a rise in the price of tapioca pearls', '珍珠（木薯粉圓）的價格上升'),
          t('an improvement in the technology for making bubble tea', '製造珍珠奶茶的技術改進'),
        ],
        1,
        t(
          'A dearer substitute raises the demand for bubble tea. A is a movement along the demand curve; C and D change supply, not demand.',
          '替代品價格上升會令珍珠奶茶的需求增加。A 是沿需求曲線的移動；C 和 D 改變的是供應，而不是需求。',
        ),
      ),
      mcq(
        t(
          'The equilibrium price of fresh fish rises and its equilibrium quantity falls. Which of the following could be the cause(s)?',
          '鮮魚的均衡價格上升，而其均衡數量下跌。下列哪項可能是成因？',
        ),
        [
          combination('(1) and (2) only', '只有(1)及(2)'),
          combination('(1) and (3) only', '只有(1)及(3)'),
          combination('(2) and (3) only', '只有(2)及(3)'),
          combination('(1), (2) and (3)', '(1)、(2)及(3)'),
        ],
        1,
        t(
          '(1) and (3) decrease supply: the price rises and the quantity falls. (2) increases demand, which raises both the price and the quantity.',
          '(1) 和 (3) 令供應減少：價格上升，數量下跌。(2) 令需求增加，價格和數量都會上升。',
        ),
        [
          t('A typhoon damages many fishing boats.', '颱風損毀了大量漁船。'),
          t('Consumers’ incomes rise, and fresh fish is a normal good.', '消費者的收入上升，而鮮魚是正常物品。'),
          t('The wages of fishermen rise.', '漁民的工資上升。'),
        ],
      ),
      mcq(
        t('If the price of a good is above its equilibrium price, there will be', '若某物品的價格高於其均衡價格，市場會出現'),
        [
          t('a shortage, and the price tends to rise.', '短缺，價格有上升的趨勢。'),
          t('a shortage, and the price tends to fall.', '短缺，價格有下跌的趨勢。'),
          t('a surplus, and the price tends to rise.', '過剩，價格有上升的趨勢。'),
          t('a surplus, and the price tends to fall.', '過剩，價格有下跌的趨勢。'),
        ],
        3,
        t(
          'Above the equilibrium price, quantity supplied exceeds quantity demanded: a surplus, and sellers cut the price to sell it.',
          '價格高於均衡價格時，供應量大於需求量，出現過剩，賣家會減價出售。',
        ),
      ),
    ],
    lq: structured(),
  };
}

/** The document's name in the list, in the interface's language. */
export const SAMPLE_PAPER_NAME = {
  en: 'Sample paper: Demand and supply',
  zh: '示例試卷：需求與供應',
} as const;

/** A fresh copy of the sample paper, ready to open and save. */
export function createSamplePaper(language: 'en' | 'zh' = 'en'): Worksheet {
  const base = createWorksheetFrom({
    documentType: 'classroom',
    sections: false,
    seedSample: false,
    name: SAMPLE_PAPER_NAME[language],
    title: 'Demand and Supply',
    titleZh: '需求與供應',
  });
  // Each section says its marks; the questions number 1–4 straight through, as a short
  // worksheet does (Section B does not start again at 1).
  const sectionA = { ...createSectionElement(t('Section A: Multiple Choice', '甲部：多項選擇題')), showMarks: true };
  const sectionB = {
    ...createSectionElement(t('Section B: Structured Question', '乙部：結構性問題'), false),
    showMarks: true,
  };
  const { mc, lq } = questions();
  return {
    ...base,
    bankHidden: true,
    questions: [...mc, lq],
    layout: [...(base.layout ?? []), sectionA, sectionB],
    flow: [
      ...base.flow,
      { type: 'layout', id: sectionA.id },
      ...mc.map((question) => ({ type: 'question' as const, id: question.id })),
      { type: 'layout', id: sectionB.id },
      { type: 'question', id: lq.id },
    ],
  };
}
