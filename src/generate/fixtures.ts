/**
 * Test-only: a pasted source and canned model replies for "Questions from a source".
 * Never imported by app code.
 */
import type { BiDraft } from './types';

export const SOURCE_EN =
  'Hong Kong\'s government raised the tobacco tax by 32% in 2024. A packet of cigarettes now costs about $90.\n\n' +
  'Retailers reported that sales fell by 15% in the following quarter, while cross-border purchases rose.';

export const SOURCE_ZH =
  '香港政府於2024年將煙草稅提高32%，一包香煙現售約90元。零售商表示，其後一季的銷量下跌15%，而跨境購買則上升。' +
  '有經濟學家認為，需求的價格彈性決定了稅收承擔的分配，亦影響政府的稅收收入。部分吸煙者轉往內地購買香煙。';

type Sides = 'en' | 'zh' | 'both';
const pick = (sides: Sides) => (en: string, zh: string): BiDraft => ({ en: sides === 'zh' ? '' : en, zh: sides === 'en' ? '' : zh });

/** A valid MCQ; `combination` makes it an HKEAA combination-statement item. */
export function mcqReply(sides: Sides, opts: { combination?: boolean; stemEn?: string } = {}) {
  const t = pick(sides);
  if (opts.combination) {
    return {
      kind: 'mcq',
      stem: t(opts.stemEn ?? 'Which of the following about the tobacco tax is/are correct?', '以下有關煙草稅的描述，何者正確？'),
      statements: [t('(1) The price of cigarettes rose.', '(1) 香煙價格上升。'), t('Sales fell.', '銷量下跌。'), t('Cross-border purchases rose.', '跨境購買上升。')],
      options: [t('(1) and (2) only', '只有(1)及(2)'), t('(1) and (3) only', '只有(1)及(3)'), t('(2) and (3) only', '只有(2)及(3)'), t('(1), (2) and (3)', '(1)、(2)及(3)')],
      answer: 3,
      explanation: t('All three follow from the source.', '三項均見於資料。'),
      parts: [],
    };
  }
  return {
    kind: 'mcq',
    stem: t(opts.stemEn ?? 'After the tax rose by 32%, sales fell by 15%. Demand for cigarettes is', '稅項提高32%後，銷量下跌15%。香煙的需求'),
    statements: [],
    options: [t('A. price elastic.', '富價格彈性。'), t('B. price inelastic.', '缺乏價格彈性。'), t('C. perfectly elastic.', '完全富彈性。'), t('D. unitary elastic.', '單一彈性。')],
    answer: 1,
    explanation: t('Quantity fell by a smaller percentage than price rose.', '需求量的下跌百分比小於價格上升的百分比。'),
    parts: [],
  };
}

export function structuredReply(sides: Sides, marks: number[] = [2, 4, 4]) {
  const t = pick(sides);
  const stems: Array<[string, string]> = [
    ['(a) State **ONE** effect of the tax on retailers.', '(a) 寫出該稅項對零售商的**一個**影響。'],
    ['(b) With reference to the source, explain the change in sales.', '(b) 參考資料，解釋銷量的變化。'],
    ['(c) Discuss whether the tax will raise government revenue.', '(c) 討論該稅項會否增加政府收入。'],
  ];
  return {
    kind: 'structured',
    stem: t('Read the source and answer the questions.', '細閱資料，然後回答問題。'),
    statements: [],
    options: [],
    answer: 0,
    explanation: t('', ''),
    parts: marks.map((m, i) => ({
      stem: t(...(stems[i] ?? stems[0])),
      marks: m,
      answer: t('A model answer.', '參考答案。'),
      points: Array.from({ length: m }, (_, k) => ({ text: t(`Point ${k + 1}`, `要點${k + 1}`), marks: 1 })),
    })),
  };
}

export const replyText = (questions: unknown[]) => JSON.stringify({ questions });
