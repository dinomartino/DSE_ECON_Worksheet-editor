import { createMcqQuestion, createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { fractionRuns } from '@/model/fraction';
import { createSchemeFromPattern } from '@/model/markSchemePatterns';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import type { BiText, LayoutElement, McqQuestion, ParagraphBlock, Worksheet } from '@/model/types';
import { withFlow } from './fixtures';
import { buildMarkSchemeWorksheet } from './markSchemeFixture';

/**
 * A paper whose answer key has every shape of line, for Line spacing in the key (k-0483):
 * a section heading; six MC with a keyed letter, the first two with notes (an explanation
 * holding a stacked fraction, k-0479, and per-option reasons); the marking-scheme question
 * (answer, `/` alternatives, OR routes, an any-TWO group, levels, EC); and a data-response
 * question whose parts use k-0475's patterns (group headings, the EC table, a content max).
 * Used by `render/answerKeyLineSpacing.test.tsx` and, written out, by the browser harness
 * `scripts/key-line-spacing-verify.mjs` (`test-fixtures/manual/key-line-spacing-mix.json`).
 * Everything in it is invented.
 */

const para = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });

/** (Q₂ − Q₁) over Q₁, the elasticity fraction of k-0479, in a field's runs. */
const PED = fractionRuns(
  [{ text: 'Q' }, { text: '2', vertAlign: 'subscript' }, { text: ' − Q' }, { text: '1', vertAlign: 'subscript' }],
  [{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }],
);

/** A field's words with the elasticity fraction after them, on each side. */
export const withFraction = (en: string, zh: string): BiText => ({
  en: [{ text: en }, ...PED],
  zh: [{ text: zh }, ...PED],
});

/** Fill a pattern's empty points with words, in order (any left over stay empty, as a teacher's would). */
export function filled(scheme: MarkScheme, words: BiText[]): MarkScheme {
  let next = 0;
  return {
    ...scheme,
    routes: scheme.routes.map((route) => ({
      ...route,
      groups: route.groups.map((group) => ({
        ...group,
        points: group.points.map((point) => ({ ...point, text: words[next] ? words[next++] : point.text })),
      })),
    })),
  };
}

const STEMS: Array<[string, string]> = [
  ['Which change shifts the demand curve for tea to the right?', '以下哪項會令茶的需求曲線右移？'],
  ['Which of the following is a public good?', '以下哪項屬公共物品？'],
  ['A fall in the price of a substitute will cause', '代替品價格下跌會導致'],
  ['The opportunity cost of studying tonight is', '今晚温習的機會成本是'],
  ['Price elasticity of demand is high when', '當以下情況出現，需求價格彈性較大：'],
  ['A minimum wage above the market wage leads to', '高於市場工資的最低工資會引致'],
];

function mc(index: number): McqQuestion {
  const [en, zh] = STEMS[index];
  const question = createMcqQuestion();
  question.blocks = [para(en, zh)];
  question.options = ['A', 'B', 'C', 'D'].map((letter) => ({ id: newId(), text: bi(`Option ${letter}`, `選項 ${letter}`) }));
  question.answerIndex = [1, 2, 0, 3, 1, 2][index];
  return question;
}

export function buildKeyLineSpacingPaper(): Worksheet {
  const questions = STEMS.map((_, index) => mc(index));
  // The first MC carries notes: an explanation with a fraction, and why two options fit or not.
  questions[0].explanation = withFraction('Higher income raises demand for a normal good. Elasticity is ', '收入上升令正常貨品的需求增加。彈性是 ');
  questions[0].options[0].rationale = bi('A is wrong: a fall in price moves along the curve.', 'A 錯：價格下跌只是沿曲線移動。');
  questions[0].options[1].rationale = bi('B is right: a rise in income shifts demand to the right.', 'B 對：收入上升令需求曲線右移。');
  questions[1].explanation = bi('A public good is non-rival and non-excludable.', '公共物品具非競爭性和非排他性。');

  const [structured] = buildMarkSchemeWorksheet().questions;

  const drq = createStructuredQuestion();
  drq.blocks = [
    para(
      'Source A: Hong Kong’s fiscal balance went from a surplus in 2018-19 to a deficit in 2022-23.',
      '資料A：香港的財政結餘由2018-19年度的盈餘轉為2022-23年度的赤字。',
    ),
  ];
  const part = (id: string, marks: number, prompt: BiText, scheme: MarkScheme) => ({
    ...createStructuredQuestion().parts[0],
    id,
    marks,
    blocks: [{ kind: 'paragraph' as const, id: newId(), text: prompt }],
    scheme,
  });
  drq.parts = [
    part(
      'reasons',
      4,
      bi('Suggest TWO reasons why the fiscal balance worsened.', '試提出兩個財政結餘轉差的原因。'),
      filled(createSchemeFromPattern('reasons', 4), [
        bi('Profits tax and salaries tax fall in a downturn.', '經濟下滑時，利得稅及薪俸稅收入減少。'),
        bi('Government spending rises to support the economy.', '政府增加開支支援經濟。'),
        bi('Land sales revenue falls with property prices.', '地價收入隨樓價下跌。'),
      ]),
    ),
    part(
      'diagram',
      7,
      bi('Explain, with the aid of a diagram, the effect of a subsidy on tea.', '試借助圖解釋津貼對茶葉市場的影響。'),
      filled(createSchemeFromPattern('explainDiagram', 7), [
        bi('The subsidy lowers firms’ costs, so supply increases and the price falls.', '津貼降低廠商成本，供應增加，價格下跌。'),
        bi('S shifts rightward to S₁ by the amount of the subsidy.', 'S 右移至 S₁，幅度等於津貼額。'),
        bi('New equilibrium: lower price P₁, larger quantity Q₁.', '新均衡：價格下降至 P₁，數量增至 Q₁。'),
      ]),
    ),
    part(
      'essay',
      14,
      bi('Discuss whether the government should raise tax on private cars.', '討論政府應否提高私家車稅。'),
      filled(createSchemeFromPattern('essay', 14), [
        withFraction('Demand for car travel is inelastic: ', '私家車出行需求缺乏彈性：'),
        bi('A higher tax shifts some drivers to public transport.', '稅項提高令部分司機改乘公共交通。'),
        bi('The tax raises revenue for the government.', '稅項增加政府收入。'),
        bi('Low-income drivers are hurt more by the tax.', '低收入司機受稅項影響較大。'),
      ]),
    ),
  ];

  const heading: LayoutElement = {
    id: 'key-spacing-a',
    kind: 'section',
    text: bi('Section A', '甲部'),
    restartNumbering: false,
  };
  const worksheet = withFlow(createWorksheet(), [heading, ...questions, structured, drq], { replaceLayout: true });
  worksheet.title = bi('Key line spacing mix', '評卷行距示例');
  worksheet.name = 'Key line spacing mix';
  return worksheet;
}
