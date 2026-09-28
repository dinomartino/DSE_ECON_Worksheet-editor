// ============================================================================
//  DEMO CONTENT: edit this file to change what the demo types.
//  Every string is original example text. Never paste HKEAA past-paper items.
//  [English, 中文] pairs; `answer` is the option letter; `lines` = dotted lines.
// ============================================================================

/** The worksheet the demo builds, in page order: Section A MCQs, then Section B. */
export const QUIZ_NAME = 'S4 Demand and Supply Quiz';

export const MCQS = [
  {
    stem: ['Which of the following is a positive statement?', '以下哪一項是實證陳述？'],
    options: [
      ['The government should raise the minimum wage.', '政府應該提高最低工資。'],
      ['Rent control is unfair to landlords.', '租金管制對業主不公平。'],
      ['A higher tobacco tax will reduce cigarette consumption.', '提高煙草稅會減少香煙的消費量。'],
      ['University education ought to be free.', '大學教育應該免費。'],
    ],
    answer: 'C',
  },
  {
    stem: [
      'Which of the following would shift the demand curve for umbrellas to the right?',
      '以下哪一項會令雨傘的需求曲線向右移？',
    ],
    options: [
      ['A fall in the price of umbrellas', '雨傘價格下跌'],
      ['A forecast of a week of heavy rain', '天文台預測未來一星期有大雨'],
      ['A rise in the cost of making umbrellas', '製造雨傘的成本上升'],
      // Keep EN+中 under 75 characters, or the Kahoot export shows a length warning.
      ['Better technology for making umbrellas', '製造雨傘的技術改進'],
    ],
    answer: 'B',
  },
  {
    stem: ['Which of the following is an example of a free good?', '以下哪一項是免費物品的例子？'],
    options: [
      ['Seawater at a beach', '海灘上的海水'],
      ['Tap water in Hong Kong', '香港的自來水'],
      ['A free sample of shampoo', '免費的洗頭水樣本'],
      ['Books in a public library', '公共圖書館的書籍'],
    ],
    answer: 'A',
  },
];

export const STRUCTURED = {
  stem: ['The government imposes a per-unit tax on sugary drinks.', '政府向含糖飲品徵收從量稅。'],
  parts: [
    {
      text: [
        'With the aid of a diagram, explain how the tax affects the equilibrium price and quantity of sugary drinks.',
        '試以圖解釋該稅項如何影響含糖飲品的均衡價格和數量。',
      ],
      marks: 4,
      lines: 6,
      scheme: [
        'Supply falls (shifts left) by the amount of the tax; equilibrium price rises and quantity falls. Diagram with labelled axes and both equilibria.',
        '供給減少（向左移），幅度等於稅額；均衡價格上升，均衡數量下降。圖表須標示坐標軸及兩個均衡點。',
      ],
    },
    {
      text: [
        'If the demand for sugary drinks is price-inelastic, do consumers or producers bear the larger share of the tax? Explain.',
        '若含糖飲品的需求缺乏價格彈性，消費者還是生產者承擔較大部分的稅款？試解釋。',
      ],
      marks: 3,
      lines: 5,
      scheme: [
        'Consumers. Inelastic demand means price rises by more than half the tax, so the larger share falls on buyers.',
        '消費者。需求缺乏彈性，價格上升幅度大於稅額的一半，故消費者承擔較大部分。',
      ],
    },
  ],
};

/** Extra saved documents, so the start screen shows a library: [template, name]. */
export const LIBRARY = [
  ['Paper 1 mock · MCQ', 'S6 Mock Exam Paper 1'],
  ['Paper 2 mock · booklet', 'S6 Mock Exam Paper 2'],
  ['LQ worksheet', 'S5 Market Failure LQ'],
];

/** Typed into the Send feedback dialog for its screenshot (never sent). */
export const FEEDBACK = {
  kind: 'Idea',
  message:
    'It would help if the answer key could also list the syllabus topic for each question, so I can see which topics the class found hardest.',
};

/**
 * The diagram film (`npm run demo:diagrams`): a worksheet seeded off camera, and the
 * supply-and-demand diagram drawn on camera from blank axes. `draw` is unit space
 * (0–1 along each axis, y up); the seed projects it to canvas pixels with `diagramPlot`.
 */
export const DIAGRAMS = {
  title: 'S5 Market Intervention: Diagrams',
  stem: 'The government imposes a per-unit tax of $t on each packet of cigarettes sold.',
  part: {
    text: 'With the aid of a diagram, explain the effect of the tax on the price paid by buyers, the quantity traded and total welfare.',
    marks: 6,
    lines: 6,
  },
  draw: {
    demand: { label: 'D', from: { x: 0.1, y: 0.9 }, to: { x: 0.86, y: 0.14 } },
    supply: { label: 'S', from: { x: 0.1, y: 0.14 }, to: { x: 0.8, y: 0.78 } },
    /** S moved up by this share of the price axis: the tax. Its copy must stay on the plot. */
    taxPercent: 20,
  },
};

/**
 * The ✦ AI film (`npm run demo:ai`): a bilingual worksheet seeded off camera with some
 * 中文 missing. `zh: null` is a text whose 中文 is missing; `fill` is the 中文 the canned
 * provider returns for it (EDB glossary terms: the seed test proves they all check).
 * `planted` is the one teacher-written 中文 term Check terms flags, and its EDB fix.
 * Layout: part (c) must sit high enough on the page (no instructions line, one answer
 * line for (a) and (b)) for the page to scroll it to the middle, so its finding card
 * clears the AI bar at the foot of the window; the film fails if it does not.
 */
export const AI = {
  title: ['S4 Economics: Rent Control', '中四經濟：租金管制'],
  mcq: {
    stem: {
      en: 'The government sets a price ceiling on rents below the equilibrium rent. Which of the following will result?',
      zh: null,
      fill: '政府為租金設定低於均衡租金的價格上限。以下哪一項會因此出現？',
    },
    options: [
      ['A shortage of flats for rent', '出租單位短缺'],
      ['More flats offered for rent', '更多單位放租'],
      ['A fall in the demand for flats', '單位的需求下降'],
      ['A higher rent paid by tenants', '租客支付更高的租金'],
    ],
    answer: 0,
  },
  structured: {
    stem: [
      'Under rent control, the rent of a flat may not exceed $8,000 a month, below the equilibrium rent of $10,000.',
      '在租金管制下，單位的月租不得超過8,000元，低於10,000元的均衡租金。',
    ],
    parts: [
      {
        en: 'Explain why rent control leads to a shortage of flats.',
        zh: null,
        fill: '解釋為何租金管制會導致單位短缺。',
        marks: 2,
        lines: 1,
      },
      {
        en: 'Suggest a way, other than price, that landlords may use to choose tenants.',
        zh: null,
        fill: '除價格外，建議一個業主可用以挑選租客的方法。',
        marks: 2,
        lines: 1,
      },
      {
        en: 'How does rent control affect consumer surplus? Explain.',
        zh: '租金管制對消費者剩餘有何影響？試加以解釋。',
        marks: 4,
        lines: 3,
      },
    ],
  },
  planted: { wrong: '消費者剩餘', fix: '消費者盈餘' },
};
