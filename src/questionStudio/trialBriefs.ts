import type { BiDraft } from '@/generate/types';
import type { LanguageMode } from '@/model/types';
import { sidesOf } from './session';
import type { Level, Shape, SourceQuestion, StudioRequest } from './types';

/**
 * The trial's 30 invented briefs (k-0499, decision 7a). Each is one request the Question
 * studio is asked once, on the teacher's own key, so the first numbers come from a fixed,
 * spread-out set and not only from what the teacher happens to ask: every one is a different
 * place in the syllabus (28 key points of Paper 1's compulsory part), and together they cover
 * both languages and either, plain and combination items, easier and harder, the key points
 * the guide limits ("NOT required") and the ones whose items are arithmetic.
 *
 * Invented, like every test fixture here: no wording of any past paper. The three example
 * questions a few briefs carry are written for this file. Ordered so that any ten in a row
 * are already a fair mix, because a trial that is stopped early still has to say something.
 */

export interface TrialBrief {
  /** `B01`…`B30`, the order they run in. */
  id: string;
  /** A syllabus key point code (`C.ped`). */
  keyPoint: string;
  /** Narrow it to some of its points (`C.ped#arc`). */
  points?: readonly string[];
  count: 1 | 3 | 5;
  level: Level;
  shape: Shape;
  language: LanguageMode;
  /** The Change line, in the teacher's words. */
  note?: string;
  /** Write like one of `TRIAL_EXAMPLES`. */
  example?: keyof typeof TRIAL_EXAMPLES;
  /** What this brief is there to find out, in a few words (the report's, not the interface's). */
  probe: string;
}

const bi = (en: string, zh: string): BiDraft => ({ en, zh });

const example = (id: string, stem: BiDraft, statements: BiDraft[], options: BiDraft[], answerIndex: number): SourceQuestion => ({
  id,
  label: 'Invented example',
  stem,
  statements,
  options,
  answerIndex,
  hasFigure: false,
});

/** Three questions written for the trial to write like: not from any paper, not from the bank. */
export const TRIAL_EXAMPLES = {
  plain: example(
    'trial-plain',
    bi(
      'A coffee shop cuts the price of its iced latte from $38 to $30 and sells more cups each day. Which of the following best explains the rise in the quantity of iced latte demanded?',
      '一間咖啡店把冰拿鐵的價格由 $38 減至 $30，每日售出的杯數增加。以下哪項最能解釋冰拿鐵需求量上升？',
    ),
    [],
    [
      bi("Consumers' incomes have risen.", '消費者的收入上升。'),
      bi('The price of hot latte, a substitute, has risen.', '熱拿鐵這種替代品的價格上升。'),
      bi('The lower price makes iced latte cheaper relative to other drinks.', '價格下降令冰拿鐵相對其他飲品變得便宜。'),
      bi('Consumers expect the price of iced latte to rise next month.', '消費者預期冰拿鐵的價格下月會上升。'),
    ],
    2,
  ),
  combination: example(
    'trial-combination',
    bi('Which of the following statements about a monopolistically competitive market is/are correct?', '以下有關壟斷競爭市場的陳述，哪項／哪些正確？'),
    [
      bi('Firms sell differentiated products.', '廠商出售有差異的產品。'),
      bi('Barriers to entry completely block new firms.', '進入障礙完全阻止新廠商加入。'),
      bi('Each firm faces a downward-sloping demand curve.', '每間廠商面對向右下傾斜的需求曲線。'),
    ],
    [bi('(1) only', '只有 (1)'), bi('(1) and (3) only', '只有 (1)、(3)'), bi('(2) and (3) only', '只有 (2)、(3)'), bi('(1), (2) and (3)', '(1)、(2) 及 (3)')],
    1,
  ),
  tax: example(
    'trial-tax',
    bi(
      'A unit tax is imposed on the sellers of a good. Compared with the situation before the tax, which of the following will happen in the market?',
      '政府向某物品的賣方徵收從量稅。與徵稅前比較，市場會出現以下哪項情況？',
    ),
    [],
    [bi('The supply curve shifts to the right.', '供應曲線向右移動。'), bi('The equilibrium quantity falls.', '均衡數量下降。'), bi('The demand curve shifts to the left.', '需求曲線向左移動。'), bi('The price paid by buyers falls.', '買家所付的價格下降。')],
    1,
  ),
} as const satisfies Record<string, SourceQuestion>;

const b = (id: number, brief: Omit<TrialBrief, 'id'>): TrialBrief => ({ id: `B${String(id).padStart(2, '0')}`, ...brief });

export const TRIAL_BRIEFS: readonly TrialBrief[] = [
  b(1, { keyPoint: 'C.ped', points: ['C.ped#arc'], count: 3, level: 'same', shape: 'plain', language: 'bilingual', probe: 'arc elasticity arithmetic, the same numbers in both languages' }),
  b(2, { keyPoint: 'A.scarcity', count: 3, level: 'same', shape: 'any', language: 'zh', probe: '中文 terms: scarcity, choice, opportunity cost' }),
  b(3, { keyPoint: 'J.trade', points: ['J.trade#advantage'], count: 3, level: 'same', shape: 'combination', language: 'en', probe: 'combination items on comparative advantage' }),
  b(4, { keyPoint: 'F.national-income', points: ['F.national-income#gni'], count: 3, level: 'harder', shape: 'plain', language: 'bilingual', probe: 'GDP and GNI arithmetic; the guide limits the components of GDP' }),
  b(5, { keyPoint: 'B.costs', points: ['B.costs#diminishing-returns'], count: 1, level: 'same', shape: 'plain', language: 'en', probe: 'limit: no link from diminishing returns to the U-shaped marginal cost curve' }),
  b(6, { keyPoint: 'H.banks', count: 3, level: 'easier', shape: 'any', language: 'bilingual', probe: 'easier level' }),
  b(7, { keyPoint: 'C.law-of-demand', count: 5, level: 'same', shape: 'any', language: 'bilingual', note: 'Set the questions in everyday Hong Kong shops and services.', example: 'plain', probe: 'writing like an example; the Change line' }),
  b(8, { keyPoint: 'G.ad', points: ['G.ad#determinants'], count: 3, level: 'same', shape: 'combination', language: 'zh', probe: 'combination items in 中文; limit: the size of an AD shift' }),
  b(9, { keyPoint: 'E.equity', count: 3, level: 'same', shape: 'plain', language: 'en', probe: 'limits on equity measures' }),
  b(10, { keyPoint: 'I.inflation', points: ['I.inflation#real-interest'], count: 3, level: 'harder', shape: 'plain', language: 'bilingual', probe: 'nominal and real interest rate arithmetic' }),
  b(11, { keyPoint: 'C.equilibrium', points: ['C.equilibrium#shifts'], count: 5, level: 'same', shape: 'any', language: 'en', note: 'Use a different market in each question.', probe: 'variety across five; shifts of demand and supply' }),
  b(12, { keyPoint: 'D.structure', count: 3, level: 'same', shape: 'combination', language: 'bilingual', example: 'combination', probe: 'writing like a combination example; market structures' }),
  b(13, { keyPoint: 'J.exchange-rate', points: ['J.exchange-rate#price-effects'], count: 3, level: 'same', shape: 'plain', language: 'bilingual', probe: 'exchange rate arithmetic; limit: no graphical analysis' }),
  b(14, { keyPoint: 'B.ownership', count: 3, level: 'easier', shape: 'any', language: 'zh', probe: '中文 terms: ownership of firms; three limits' }),
  b(15, { keyPoint: 'F.price-level', count: 1, level: 'same', shape: 'plain', language: 'bilingual', probe: 'price index arithmetic' }),
  b(16, { keyPoint: 'C.surplus', count: 3, level: 'same', shape: 'combination', language: 'en', probe: 'limits: indifference curves, marginal rate of substitution, marginal use value' }),
  b(17, { keyPoint: 'H.money-supply', points: ['H.money-supply#credit-creation'], count: 3, level: 'same', shape: 'plain', language: 'bilingual', probe: 'banking multiplier arithmetic; limit: changing the cash-deposit ratio' }),
  b(18, { keyPoint: 'I.unemployment', count: 3, level: 'same', shape: 'combination', language: 'zh', probe: 'combination items in 中文; types of unemployment' }),
  b(19, { keyPoint: 'C.individual-supply', count: 3, level: 'same', shape: 'plain', language: 'zh', probe: '中文 terms: supply and its determinants' }),
  b(20, { keyPoint: 'A.circular-flow', count: 3, level: 'easier', shape: 'any', language: 'bilingual', probe: 'easier level; flows of money and goods' }),
  b(21, { keyPoint: 'G.as', count: 3, level: 'harder', shape: 'combination', language: 'bilingual', probe: 'harder combination items; three limits on aggregate supply' }),
  b(22, { keyPoint: 'C.intervention', points: ['C.intervention#tax-subsidy'], count: 5, level: 'same', shape: 'plain', language: 'en', note: 'Each question should name the market and the size of the tax or subsidy.', example: 'tax', probe: 'writing like an example; unit tax and subsidy' }),
  b(23, { keyPoint: 'E.efficiency', points: ['E.efficiency#externalities'], count: 3, level: 'harder', shape: 'combination', language: 'zh', probe: 'externalities in 中文; limits: the Coase theorem' }),
  b(24, { keyPoint: 'I.fiscal', points: ['I.fiscal#effects'], count: 3, level: 'same', shape: 'any', language: 'bilingual', note: 'Set it in a Hong Kong policy context. Do not quote real figures.', probe: 'the Change line; no invented statistics presented as real' }),
  b(25, { keyPoint: 'C.pes', count: 1, level: 'harder', shape: 'plain', language: 'en', probe: 'harder level; elasticity of supply' }),
  b(26, { keyPoint: 'J.trade', points: ['J.trade#barriers'], count: 3, level: 'same', shape: 'combination', language: 'zh', probe: 'limits: tariff and quota effects on surplus; 中文' }),
  b(27, { keyPoint: 'G.equilibrium', count: 1, level: 'same', shape: 'any', language: 'bilingual', probe: 'three limits on output and price determination' }),
  b(28, { keyPoint: 'H.interest', count: 1, level: 'same', shape: 'plain', language: 'en', probe: 'interest rate determination' }),
  b(29, { keyPoint: 'F.unemployment', count: 3, level: 'same', shape: 'plain', language: 'bilingual', probe: 'unemployment rate arithmetic' }),
  b(30, { keyPoint: 'C.market-demand', count: 5, level: 'easier', shape: 'any', language: 'bilingual', note: 'No calculations. Every option is a full sentence.', probe: 'the Change line kept; easier level' }),
];

/** The request a brief makes (what the studio's Write sends for the same form). */
export function requestOfBrief(brief: TrialBrief): StudioRequest {
  return {
    keyPoint: brief.keyPoint,
    points: brief.points ?? [],
    examples: brief.example ? [TRIAL_EXAMPLES[brief.example]] : [],
    count: brief.count,
    level: brief.level,
    shape: brief.shape,
    sides: sidesOf(brief.language),
    note: brief.note ?? '',
  };
}

export const briefById = (id: string): TrialBrief | undefined => TRIAL_BRIEFS.find((brief) => brief.id === id);
