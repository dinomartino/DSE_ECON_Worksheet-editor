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
