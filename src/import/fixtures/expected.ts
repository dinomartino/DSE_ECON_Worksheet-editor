/**
 * What each synthetic fixture should import as. Invented questions only: the repo is
 * public, so no real paper text. Text fields are prefixes of the imported plain text.
 */
export interface ExpectedSub {
  text: string;
  marks?: number;
  answerSpace?: number;
}

export interface ExpectedPart extends ExpectedSub {
  before?: string;
  subParts?: ExpectedSub[];
}

export interface ExpectedQuestion {
  stem: string;
  kind: 'mc' | 'structured';
  options?: string[];
  statements?: number;
  /** 0 = A. */
  answer?: number;
  marks?: number;
  answerSpace?: number;
  parts?: ExpectedPart[];
  side?: 'en' | 'zh';
}

export interface ExpectedFixture {
  file: string;
  /** Word plain/HTML must stay ≥95%, PDF-style ≥80%; OCR is reported, and must say `scan`. */
  category: 'word' | 'pdf' | 'ocr' | 'empty';
  kind: 'ok' | 'scan' | 'empty';
  questions: ExpectedQuestion[];
  /** The lead stimulus's first words, when the paste opens with a shared stem. */
  lead?: string;
}

const MC_COMBO = ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'];

export const FIXTURES: ExpectedFixture[] = [
  {
    file: '01-word-plain-mc.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'A café owner in Mong Kok', kind: 'mc', statements: 3, options: MC_COMBO },
      { stem: 'Which of the following is an example of a free good?', kind: 'mc', options: ['sunlight', 'a free newspaper', 'tap water', 'a free sample'] },
      { stem: 'The statutory minimum wage (法定最低工資)', kind: 'mc', statements: 3, options: ['(1) only', '(1) and (2) only', '(2) and (3) only', '(1), (2) and (3)'], side: 'en' },
      { stem: 'Mr Lee is a sole proprietor', kind: 'mc', options: ['Mr Lee has limited', 'The bakery can issue', 'The bakery must publish', 'Mr Lee enjoys'] },
    ],
  },
  {
    file: '02-word-plain-typed-instructions.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'Tom spends his Saturday evening', kind: 'mc', options: ['$400', '$600', '$1', 'the enjoyment'] },
      { stem: 'Which of the following will shift the demand curve', kind: 'mc', options: ['a fall in the price', 'a rise in the price of petrol', 'an improvement', 'a rise in the cost'] },
      { stem: 'Which of the following is a positive statement?', kind: 'mc', options: ['The government should', "Hong Kong's unemployment", 'Rents in Hong Kong', 'Public housing'] },
    ],
  },
  {
    file: '03-word-plain-structured.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      {
        stem: 'Ann and Ben share a flat',
        kind: 'structured',
        parts: [
          { text: 'Ann cooks for both', marks: 3 },
          { text: 'The two of them buy groceries', marks: 2, answerSpace: 6 },
        ],
      },
      {
        stem: 'The table below shows the output of a small farm.',
        kind: 'structured',
        parts: [
          { text: 'Calculate the marginal product', marks: 1 },
          { text: 'Explain whether the data show', marks: 3 },
          {
            text: 'Explain whether',
            before: 'Suppose the farm now rents',
            marks: 4,
            subParts: [{ text: 'the marginal product of the third worker' }, { text: 'the average product of labour', answerSpace: 4 }],
          },
        ],
      },
      {
        stem: '',
        kind: 'structured',
        parts: [
          { text: 'Define opportunity cost.', marks: 2 },
          { text: 'Give ONE example', marks: 2 },
        ],
      },
    ],
  },
  {
    file: '04-word-plain-sources.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      {
        stem: 'Hong Kong plans to charge for municipal solid waste by weight. Source A: How the charge works Households buy',
        kind: 'structured',
        parts: [
          { text: 'Refer to Source A.', subParts: [{ text: 'Explain how the charge affects', marks: 3 }, { text: 'Explain why some households', marks: 2 }] },
          { text: 'Refer to Sources B and C.', marks: 3 },
          { text: 'With reference to the sources', before: 'For part (c), set out', marks: 12, answerSpace: 8 },
        ],
      },
    ],
  },
  {
    file: '05-pdf-preview-detached.txt',
    category: 'pdf',
    kind: 'ok',
    questions: [
      {
        stem: 'Refer to the following table about two bakeries:',
        kind: 'mc',
        options: ['Bakery Y uses more ovens', "Bakery Y's bakers have", 'Bakery X makes a wider range', 'Bakery X pays its bakers a fixed monthly salary while Bakery Y pays them a piece rate according to the number of loaves'],
      },
      { stem: 'A firm changes from paying its salespersons a fixed salary to paying them a commission. The firm will most likely', kind: 'mc', options: ['sales rise …… service quality falls', 'sales rise …… service quality rises', 'sales fall …… service quality falls', 'sales fall …… service quality rises'] },
      { stem: 'Which of the following statements about a private limited company', kind: 'mc', statements: 3, options: MC_COMBO },
      { stem: 'The table shows the total cost of a firm at different levels of output. After the shop was re-opened, the owner expected the local government to', kind: 'mc', options: ['$25', '$50', '$40', '$30'] },
      { stem: 'The government of a small economy imposes a quota', kind: 'mc', options: ['Local rice farmers will gain.', 'Local rice farmers will lose.', 'Local consumers will gain.', 'The government will gain'] },
    ],
  },
  {
    file: '06-pdf-layout-partb.txt',
    category: 'pdf',
    kind: 'ok',
    questions: [
      { stem: 'A cinema in Kwun Tong charges $90 for a ticket on weekdays and $120 at weekends. Explain why the cinema', kind: 'structured', marks: 3 },
      {
        stem: 'Mary is deciding whether to take a summer job',
        kind: 'structured',
        parts: [
          { text: 'State her opportunity cost', marks: 1 },
          { text: 'Suppose the elderly centre closes for the summer. Explain whether her opportunity cost of working', marks: 3 },
        ],
      },
      {
        stem: 'The table below shows the price and quantity demanded of bubble tea.',
        kind: 'structured',
        parts: [
          { text: 'Calculate the price elasticity', marks: 2 },
          { text: 'Explain whether a fall in price', marks: 3 },
        ],
      },
      { stem: 'Explain TWO reasons why the supply of hospital beds in Hong Kong is inelastic in the short run.', kind: 'structured', marks: 4 },
    ],
  },
  {
    file: '07-pdf-column-blocks.txt',
    category: 'pdf',
    kind: 'ok',
    questions: [
      { stem: 'Which of the following will increase the supply of fresh milk?', kind: 'mc', statements: 3, options: MC_COMBO },
      { stem: 'The price of durians rises.', kind: 'mc', options: ['The demand for durians falls.', 'The quantity demanded of durians falls.', 'The supply of durians rises.', 'The quantity supplied'] },
      { stem: 'Distinguish between a change in demand', kind: 'structured', marks: 3 },
      { stem: 'Explain why a rise in the price of coffee', kind: 'structured', marks: 2 },
      { stem: 'Explain why water is cheap', kind: 'structured', marks: 3 },
      { stem: 'State TWO functions of money.', kind: 'structured', marks: 2 },
    ],
  },
  {
    file: '08-ocr-mc.txt',
    category: 'ocr',
    kind: 'scan',
    questions: [
      { stem: 'Which of the following is a normative statement', kind: 'mc', options: ['The government should', "Hong Kong's GDP", 'Higher rents', 'The unemployment rate'] },
      { stem: 'Peter buys a lunch box for $45.', kind: 'mc', options: ['$35', '$45', '$55', '$10'] },
      { stem: 'Which of the following are factors of production', kind: 'mc', statements: 3, options: ['（1） and （2） only', '（1） and （3） only', '（2） and （3） only', '（1），（2） and （3）'] },
    ],
  },
  {
    file: '09-zh-word-plain.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: '下列哪項屬於公共財品？', kind: 'mc', options: ['燈塔', '公共圖書館', '公立醫院', '公共屋邨'], side: 'zh' },
      { stem: '下列哪些因素會令外賣飯盒的供應增加？', kind: 'mc', statements: 3, options: ['只有（1）和（2）', '只有（1）和（3）', '只有（2）和（3）', '（1）、（2）和（3）'], side: 'zh' },
      {
        stem: '陳先生在旺角經營一間文具店。',
        kind: 'structured',
        side: 'zh',
        parts: [
          { text: '解釋為甚麼陳先生的文具店', marks: 2 },
          { text: '陳先生考慮把文具店', subParts: [{ text: '寫出一個', marks: 1 }, { text: '解釋為甚麼他可能', marks: 2 }] },
        ],
      },
      { stem: '解釋為甚麼香港的的士市場', kind: 'structured', marks: 4, side: 'zh' },
    ],
  },
  {
    file: '10-html-ol-lists.html',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'Which of the following are examples of division of labour?', kind: 'mc', statements: 3, options: ['(1) and (2) only', '(1) and (3) only', '(2) and (3) only', '(1), (2) and (3)'] },
      { stem: 'A rise in the price of beef will most likely', kind: 'mc', options: ['raise the demand for pork.', 'lower the demand for pork.', 'raise the supply of beef.', 'lower the supply of pork.'] },
      {
        stem: 'The MTR raises its fares by 3%.',
        kind: 'structured',
        parts: [
          { text: 'Explain why the demand for MTR rides', marks: 2 },
          { text: 'Explain how the fare rise', marks: 3 },
        ],
      },
    ],
  },
  {
    file: '11-html-word-msolist.html',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'Which of the following would cause a movement along', kind: 'mc', options: ['a rise in the price of petrol', 'a rise in taxi fares', 'a new MTR line', 'a fall in the income'], answer: 1 },
      { stem: 'Which of the following describes the ‘invisible hand’', kind: 'mc', options: ['The government sets', 'Firms agree', 'Prices coordinate the decisions', 'Consumers queue'], answer: 2 },
      {
        stem: 'The table shows the weekly output of a printing shop.',
        kind: 'structured',
        parts: [
          { text: 'Calculate the average product of labour.', marks: 2 },
          { text: 'Explain ONE reason why the shop may not hire', marks: 3, answerSpace: 3 },
        ],
      },
      { stem: 'Which of the following is a function of money?', kind: 'mc', options: ['a store of value', 'a source of income', 'a means of production', 'a measure of wealth'] },
    ],
  },
  {
    file: '12-answer-key-grid.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'Which of the following is a characteristic of a public good?', kind: 'mc', options: ['Its consumption', 'People can be excluded', 'It is non-excludable.', 'It must be provided'], answer: 2 },
      { stem: 'If the price of a good rises by 10%', kind: 'mc', options: ['perfectly inelastic.', 'perfectly elastic.', 'elastic.', 'inelastic.'], answer: 3 },
      { stem: 'Which of the following is a stock concept?', kind: 'mc', options: ['the money supply', "Hong Kong's GDP", 'the monthly wage', 'the daily output'], answer: 0 },
      { stem: 'A firm earns zero economic profit.', kind: 'mc', options: ['its total revenue', 'its accounting profit', 'it covers all', 'it will leave'], answer: 2 },
      { stem: "Which of the following will be included in Hong Kong's GDP?", kind: 'mc', options: ['a second-hand flat', 'a meal cooked', 'government transfer', 'shares bought'], answer: 1 },
    ],
  },
  {
    file: '13-inline-answers.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'Which of the following is a feature of a market economy?', kind: 'mc', options: ['The government decides', 'Most resources', 'Prices guide the allocation of resources.', 'Goods are distributed'], answer: 2 },
      { stem: 'A tax on cigarettes is most likely to', kind: 'mc', options: ['raise the quantity', 'raise the price', 'lower government revenue.', 'shift the demand curve'], answer: 1 },
      { stem: 'Which of the following is an example of a positive externality?', kind: 'mc', options: ['a factory', 'a smoker', 'a neighbour', 'a resident'], answer: 3 },
    ],
  },
  {
    file: '14-shared-stem.txt',
    category: 'word',
    kind: 'ok',
    lead: 'Year',
    questions: [
      { stem: 'Between 2024 and 2025, the demand for lunch boxes is', kind: 'mc', options: ['perfectly inelastic.', 'inelastic.', 'unitary elastic.', 'elastic.'] },
      { stem: 'Which of the following could explain the fall', kind: 'mc', options: ['a rise in the price of rice', 'a rise in the income', 'a fall in the price of sandwiches', 'a fall in the rent'] },
      { stem: 'Which of the following is a direct tax in Hong Kong?', kind: 'mc', options: ['salaries tax', 'duty on liquor', 'first registration', 'air passenger'] },
      { stem: 'Questions 4 and 5 refer to the following information. In 2025, the government raised the duty', kind: 'mc', options: ['a specific tax.', 'a progressive tax.', 'a proportional tax.', 'a direct tax.'] },
      { stem: 'Smokers bear a large share of the duty', kind: 'mc', options: ['perfectly elastic.', 'elastic.', 'inelastic.', 'unitary elastic.'] },
    ],
  },
  {
    file: '15-mixed-labels.txt',
    category: 'word',
    kind: 'ok',
    questions: [
      { stem: 'Which of the following is NOT a factor of production?', kind: 'mc', options: ['a fishing boat', 'the land of a farm', 'the skill of a chef', 'a bank loan', 'an entrepreneur'] },
      { stem: 'The government is considering the following measures:', kind: 'mc', statements: 3, options: ['1 only', '2 only', '1 and 3 only', '2 and 3 only'] },
      {
        stem: 'A bubble tea shop raises the price of its drinks by 20%.',
        kind: 'structured',
        parts: [
          { text: 'State the law of demand.', marks: 2 },
          { text: "Explain how the shop's total revenue", marks: 3 },
          { text: 'Suggest ONE way', marks: 2 },
        ],
      },
    ],
  },
  {
    file: '16-zh-ocr.txt',
    category: 'ocr',
    kind: 'scan',
    questions: [
      { stem: '下表顯示某麵包店的總產量。', kind: 'structured', marks: 2, side: 'zh' },
      { stem: '解釋為甚麼香港的電費受到規管。', kind: 'structured', side: 'zh', parts: [{ text: '舉出一個理由。' }, { text: '解釋你的答案。', marks: 3 }] },
    ],
  },
  { file: '17-empty.txt', category: 'empty', kind: 'empty', questions: [] },
];
