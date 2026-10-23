/**
 * Not a unit test: writes the hand-testing documents in `test-fixtures/manual/`.
 *
 *   EMIT_MANUAL_FIXTURES=1 npx vitest run scripts/emit-manual-fixtures.test.ts
 *
 * Unlike `src/test/corpus/`, these are not frozen evidence: regenerate them freely when
 * a build changes what a document holds. `src/test/manualFixtures.test.ts` opens each
 * through `parseWorksheet` (the app's own load path) so they are known to open.
 * All names, schools and numbers in them are invented.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createImageBlock, createMcqQuestion, createParagraphBlock, createPart, createStructuredQuestion, createTableBlock, createWorksheet, newId } from '@/model/factories';
import { createPageBreakElement, createSectionElement, createTextElement } from '@/model/flow';
import { stringifyWorksheet } from '@/storage/document';
import { bi } from '@/model/text';
import { TINY_PNG, withFlow } from '@/test/fixtures';
import { buildOptionLayoutPaper } from '@/test/optionLayoutFixture';
import type { LayoutElement, McqQuestion, Question, Worksheet } from '@/model/types';

const OUT = 'test-fixtures/manual';

/** Every generated id becomes a stable slug, so a regenerated file diffs cleanly. */
function stable(json: string, prefix: string): string {
  const ids = new Set<string>();
  for (const m of json.matchAll(/"id": "([^"]+)"/g)) ids.add(m[1]);
  let out = json;
  let n = 0;
  for (const id of ids) out = out.split(`"${id}"`).join(`"${prefix}${String((n += 1)).padStart(3, '0')}"`);
  return out;
}

const STEMS: Array<[string, string]> = [
  ['Which change shifts the demand curve for tea to the right?', '以下哪項會令茶的需求曲線右移？'],
  ['A fall in the price of a substitute will cause', '代替品價格下跌會導致'],
  ['The opportunity cost of studying tonight is', '今晚温習的機會成本是'],
  ['Which of the following is a public good?', '以下哪項屬公共物品？'],
  ['Price elasticity of demand is high when', '當以下情況出現，需求價格彈性較大：'],
  ['A minimum wage above the market wage leads to', '高於市場工資的最低工資會引致'],
];

function mc(n: number): McqQuestion {
  const [en, zh] = STEMS[n % STEMS.length];
  const q = createMcqQuestion();
  q.blocks = [createParagraphBlock(n % 2 ? bi(`${en} (Q${n + 1})`, '') : bi('', `${zh}（第${n + 1}題）`))];
  q.options = ['A', 'B', 'C', 'D'].map((l, i) => ({
    id: newId(),
    text: n % 2 ? bi(`Option ${l}${i}`, '') : bi('', `選項${l}${i}`),
  }));
  q.answerIndex = n % 4;
  return q;
}

function paper(title: string, titleZh: string, items: Array<Question | LayoutElement>): Worksheet {
  const w = createWorksheet();
  w.title = bi(title, titleZh);
  w.name = title;
  return withFlow(w, items, { replaceLayout: true });
}

const brk = createPageBreakElement;
const section = () => createSectionElement(bi('Section A: Multiple Choice Questions', '甲部：多項選擇題'));

function repro(): Worksheet {
  const qs = Array.from({ length: 24 }, (_, i) => mc(i));
  return paper('Issue 4 repro', '問題四重現', [
    section(),
    createTextElement(bi('There are 24 questions in this test.', '本測驗共有24題。')),
    ...qs.slice(0, 4), brk(), qs[4], brk(), ...qs.slice(5),
  ]);
}

function manyBreaks(): Worksheet {
  const qs = Array.from({ length: 8 }, (_, i) => mc(i));
  return paper('Issue 4 many breaks', '問題四多分頁', [
    brk(), qs[0], qs[1], brk(), qs[2], brk(), brk(), qs[3], brk(), qs[4], qs[5], qs[6], brk(), qs[7], brk(),
  ]);
}

function mixed(): Worksheet {
  const long = (en: string, zh: string) => createParagraphBlock(bi(en.repeat(6), zh.repeat(6)));
  const combo = createMcqQuestion();
  combo.blocks = [createParagraphBlock(bi('Which of the following statements about inflation are correct?', '以下關於通脹的陳述哪些正確？'))];
  combo.statements = [
    bi('Inflation reduces the purchasing power of money.', '通脹降低貨幣的購買力。'),
    bi('Inflation always benefits borrowers.', '通脹必定令借款人得益。'),
    bi('Inflation is a sustained rise in the general price level.', '通脹是整體物價水平持續上升。'),
  ];
  combo.options = [['(1) and (2) only', '只有(1)和(2)'], ['(1) and (3) only', '只有(1)和(3)'], ['(2) and (3) only', '只有(2)和(3)'], ['(1), (2) and (3)', '(1)、(2)和(3)']]
    .map(([en, zh]) => ({ id: newId(), text: bi(en, zh) }));
  combo.answerIndex = 1;

  const longMc = mc(2);
  longMc.blocks = [long('Mr. Chan Tai Man, an economics teacher at Sample Secondary School, explains that firms respond to higher costs. ', '陳大文老師在樣本中學教授經濟，他解釋廠商如何回應成本上升。')];

  const tableMc = mc(3);
  const table = createTableBlock(3, 3);
  const cells = [['Year', 'Price ($)', 'Quantity'], ['2024', '10', '500'], ['2025', '12', '450']];
  table.rows.forEach((row, r) => row.cells.forEach((cell, c) => { cell.text = bi(cells[r][c], ''); }));
  tableMc.blocks = [createParagraphBlock(bi('Refer to the table. The price elasticity of demand is', '參照下表，需求價格彈性為')), table];

  const imageMc = mc(4);
  const image = createImageBlock(TINY_PNG, 240, 120);
  image.altText = bi('Placeholder for a supply and demand graph', '供求圖表位置');
  image.caption = bi('Figure 1 (placeholder)', '圖一（佔位）');
  imageMc.blocks = [createParagraphBlock(bi('In Figure 1, the new equilibrium is at', '圖一中，新的均衡點在')), image];

  const essay = createStructuredQuestion();
  essay.blocks = [long('Contact Ms. Wong Siu Ming (wong.sm@example.org, 2345 6789) of Sample Secondary School, 12 Example Road, Kowloon. ', '請聯絡樣本中學黃小明老師（wong.sm@example.org，電話 2345 6789）。')];
  const part = createPart();
  part.blocks = [createParagraphBlock(bi('Explain one cause of the change in price.', '解釋價格轉變的一個原因。'))];
  part.marks = 4;
  essay.parts = [part];

  return paper('Sample Secondary School Mock Exam 2025-26', '樣本中學模擬考試 2025-26', [
    section(), mc(0), mc(1), combo, longMc, tableMc, imageMc, brk(),
    createSectionElement(bi('Section B: Structured Questions', '乙部：結構題')), essay,
  ]);
}

/**
 * Four MC questions whose options ask for different layouts, two already set by hand, and a New
 * page after the second so the thumbnail strip has two pages to show (k-0178).
 */
function optionLayoutMix(): Worksheet {
  const { worksheet, short, mid } = buildOptionLayoutPaper('diagram');
  worksheet.name = 'Option layout mix';
  worksheet.questions = worksheet.questions.map((q) =>
    q.id === short.id ? { ...q, optionLayout: 'columns2' as const } : q.id === mid.id ? { ...q, optionLayout: 'inline' as const } : q,
  );
  const newPage = createPageBreakElement();
  const after = worksheet.flow.findIndex((item) => item.id === mid.id) + 1;
  worksheet.layout = [...worksheet.layout, newPage];
  worksheet.flow = [...worksheet.flow.slice(0, after), { type: 'layout', id: newPage.id }, ...worksheet.flow.slice(after)];
  return worksheet;
}

/**
 * Space between questions on every paper shape (k-0178 #2): a classroom worksheet, which keeps one
 * blank line between questions until a teacher asks for more. Ten MC questions (long enough that
 * a page ends inside the run, so a gap meets a page break), then three structured questions: the
 * first straight under an MC (another kind), the second under the first (a like pair), the third
 * under a text note. Every stem is in both languages.
 */
function questionGapMix(): Worksheet {
  const gapMc = (n: number): McqQuestion => {
    const [en, zh] = STEMS[n % STEMS.length];
    const q = createMcqQuestion();
    q.blocks = [createParagraphBlock(bi(`${en} (Q${n + 1})`, `${zh}（第${n + 1}題）`))];
    q.options = ['A', 'B', 'C', 'D'].map((l, i) => ({ id: newId(), text: bi(`Option ${l}${i}`, `選項${l}${i}`) }));
    q.answerIndex = n % 4;
    return q;
  };
  const gapLong = (n: number) => {
    const q = createStructuredQuestion();
    q.blocks = [createParagraphBlock(bi(`Structured question ${n}: a monopolist raises its price.`, `結構題 ${n}：一間壟斷廠商提高售價。`))];
    const a = createPart();
    a.blocks = [createParagraphBlock(bi('State one reason why demand is price inelastic.', '指出需求缺乏價格彈性的一個原因。'))];
    a.marks = 2;
    const b = createPart();
    b.blocks = [createParagraphBlock(bi('Explain the effect on total revenue.', '解釋對總收益的影響。'))];
    b.marks = 3;
    q.parts = [a, b];
    return q;
  };
  return paper('Question gap mix', '題目間距', [
    section(),
    ...Array.from({ length: 10 }, (_, i) => gapMc(i)),
    gapLong(1),
    gapLong(2),
    createTextElement(bi('Answer all parts of Question 13.', '請回答第13題的所有分題。')),
    gapLong(3),
  ]);
}

/**
 * Keep a question together, or start it on a new page (k-0178 #3): a classroom worksheet of
 * structured questions, long enough that page 1 ends inside Q3 (so, left alone, Q3 is cut across two
 * pages), with a section heading above Q4 (so a new page for Q4 takes its heading along) and an MC
 * at the end. Nothing is set: it prints as any paper saved before this feature does.
 */
function pageFlowMix(): Worksheet {
  const part = (en: string, zh: string, marks: number, lines: number) => {
    const p = createPart();
    p.blocks = [createParagraphBlock(bi(en, zh))];
    p.marks = marks;
    p.answerSpace = lines;
    return p;
  };
  const question = (n: number, topic: [string, string], lines: number, parts: Array<[string, string, number]>) => {
    const q = createStructuredQuestion();
    q.blocks = [createParagraphBlock(bi(`Question ${n}: ${topic[0]}`, `第 ${n} 題：${topic[1]}`))];
    q.parts = parts.map(([en, zh, marks]) => part(en, zh, marks, lines));
    return q;
  };
  const demand: [string, string] = ['The market for private tuition in Hong Kong has grown for ten years.', '香港私人補習市場在過去十年持續增長。'];
  const one = question(1, demand, 2, [
    ['State two factors that may have increased the demand for private tuition, and explain one of them.', '指出可能令私人補習需求增加的兩個因素，並解釋其中一個。', 4],
    ['Explain, with the aid of a diagram, how the equilibrium price and quantity of tuition change.', '借助圖表，解釋補習的均衡價格和數量如何改變。', 5],
  ]);
  const two = question(2, ['A tutoring centre raises its fee by 10% and its revenue falls.', '一間補習社將收費提高10%，但收益下降。'], 3, [
    ['What can be said about the price elasticity of demand for the centre’s lessons? Give a reason.', '就該補習社課堂的需求價格彈性可作何推論？試給出理由。', 3],
    ['Explain why a fall in total revenue does not always mean a fall in profit.', '解釋為何總收益下降不一定令利潤下降。', 4],
  ]);
  const three = question(3, ['The government considers a subsidy for low-income families to buy tuition.', '政府考慮資助低收入家庭購買補習服務。'], 5, [
    ['Explain, with the aid of a diagram, the effect of the subsidy on the market for tuition.', '借助圖表，解釋資助對補習市場的影響。', 5],
    ['Who bears more of the benefit of the subsidy, the buyers or the sellers? Explain your answer.', '買家和賣家，誰得益較多？解釋你的答案。', 4],
    ['Give one reason why the subsidy may be criticised on the ground of efficiency.', '就效率而言，給出該資助可能受到批評的一個理由。', 3],
  ]);
  const four = question(4, ['Rents of tutoring centres in Mong Kok rise sharply.', '旺角補習社的租金大幅上升。'], 3, [
    ['State the effect of the rise in rent on the supply of tuition in the short run.', '指出租金上升在短期內對補習供應的影響。', 2],
    ['Explain why the effect may differ in the long run.', '解釋為何長期的影響可能不同。', 3],
  ]);
  const five = question(5, ['A new online platform lowers the cost of tuition.', '一個新的網上平台令補習成本下降。'], 3, [
    ['Explain the effect on the market for face-to-face tuition.', '解釋對面授補習市場的影響。', 3],
    ['Name one possible external cost of the growth of tuition and explain it.', '指出補習增長可能帶來的一項外部成本並解釋。', 3],
  ]);
  const finalMc = createMcqQuestion();
  finalMc.blocks = [createParagraphBlock(bi('Which of the following is a likely effect of a subsidy to buyers of tuition?', '以下哪項最可能是對補習買家提供資助的影響？'))];
  finalMc.options = [
    ['The equilibrium price rises', '均衡價格上升'],
    ['The equilibrium price falls', '均衡價格下降'],
    ['The supply curve shifts left', '供應曲線左移'],
    ['The demand curve shifts left', '需求曲線左移'],
  ].map(([en, zh]) => ({ id: newId(), text: bi(en, zh) }));
  finalMc.answerIndex = 0;
  return paper('Page flow mix', '題目分頁', [
    createSectionElement(bi('Section A: Structured Questions', '甲部：結構題')),
    one, two, three,
    createSectionElement(bi('Section B: Further Questions', '乙部：延伸題')),
    four, five, finalMc,
  ]);
}

/**
 * Justify in table cells (k-0178 #4): a classroom worksheet whose tables hold sentences, so a cell
 * wraps and a justified one reads differently from a flush-left one. Q1: a policy table, a bold
 * centred heading row and then a short term beside a three-line description. Q2: a table of
 * numbers (one line a cell, the right-hand column flush right) and a table whose top cell spans
 * both columns. Q3: an MC whose table holds a sentence in each language, for bilingual mode, on a
 * second page (a New page after Q2, so the page rail has two thumbnails to draw).
 * Nothing is justified: every cell prints as in any paper saved before this feature.
 */
function tableJustifyMix(): Worksheet {
  const grid = (rows: Array<Array<[string, string]>>, widths?: number[]) => {
    const table = createTableBlock(rows.length, rows[0].length);
    rows.forEach((row, r) => row.forEach(([en, zh], c) => { table.rows[r].cells[c].text = bi(en, zh); }));
    if (widths) table.columnWidths = widths;
    return table;
  };

  const policies = grid(
    [
      [['Policy', '政策'], ['How it works', '運作方式']],
      [
        ['Minimum wage', '最低工資'],
        ['The government sets a legal lowest wage that employers may pay. If it is set above the equilibrium wage, the quantity of labour supplied exceeds the quantity demanded and unemployment results.',
          '政府訂定僱主可支付的法定最低工資。若最低工資高於均衡工資，勞工供應量會超過需求量，引致失業。'],
      ],
      [
        ['Price ceiling', '價格上限'],
        ['The government sets a legal highest price that sellers may charge. If it is set below the equilibrium price, the quantity demanded exceeds the quantity supplied and a shortage results.',
          '政府訂定賣方可收取的法定最高價格。若價格上限低於均衡價格，需求量會超過供應量，引致短缺。'],
      ],
      [
        ['Subsidy to producers', '生產者補貼'],
        ['The government pays producers a sum for each unit sold. This lowers their cost of production, shifts the supply curve to the right, lowers the price and raises the quantity traded.',
          '政府就每單位售出的貨品向生產者付款。這降低生產成本，令供應曲線右移，價格下降，成交量上升。'],
      ],
    ],
    [0.28, 0.72],
  );
  policies.headerRows = 1;
  for (const cell of policies.rows[0].cells) {
    cell.align = 'center';
    cell.format = { bold: true };
  }

  const one = createStructuredQuestion();
  one.blocks = [createParagraphBlock(bi('Study the table about three government policies and answer the questions that follow.', '細閱下表所列的三項政府政策，並回答以下問題。')), policies];
  const onePart = createPart();
  onePart.blocks = [createParagraphBlock(bi('Using the table, explain why a price ceiling can lead to a shortage.', '根據上表，解釋為何價格上限會引致短缺。'))];
  onePart.marks = 3;
  one.parts = [onePart];

  const numbers = grid(
    [
      [['Year', '年份'], ['Price ($)', '價格（元）'], ['Quantity', '數量']],
      [['2024', '2024'], ['10', '10'], ['500', '500']],
      [['2025', '2025'], ['12', '12'], ['450', '450']],
    ],
  );
  for (const row of numbers.rows.slice(1)) for (const cell of row.cells.slice(1)) cell.align = 'right';

  const spanning = grid(
    [
      [
        ['A rise in the price of a good changes the quantity demanded of that good along its demand curve, but a change in income shifts the whole curve.',
          '貨品價格上升，會令該貨品的需求量沿需求曲線變動；而收入改變，則會令整條曲線移位。'],
        ['', ''],
      ],
      [
        ['Movement along the curve', '沿曲線移動'],
        ['Shift of the curve', '曲線移位'],
      ],
    ],
    [0.5, 0.5],
  );
  spanning.rows[0].cells[0].colSpan = 2;
  spanning.rows[0].cells[1].covered = true;

  const two = createStructuredQuestion();
  two.blocks = [createParagraphBlock(bi('Refer to the two tables below.', '參照以下兩個表格。')), numbers, spanning];
  const twoPart = createPart();
  twoPart.blocks = [createParagraphBlock(bi('Calculate the total revenue in 2025.', '計算2025年的總收益。'))];
  twoPart.marks = 2;
  two.parts = [twoPart];

  const quote = grid(
    [
      [
        ['A subsidy lowers the cost of production, so the supply curve of the good shifts to the right and its equilibrium price falls.',
          '補貼降低生產成本，因此該貨品的供應曲線右移，均衡價格下降。'],
      ],
      [
        ['The tax raises the cost of production, so the supply curve shifts to the left and the equilibrium price rises.',
          '稅項提高生產成本，因此供應曲線左移，均衡價格上升。'],
      ],
    ],
  );
  const three = createMcqQuestion();
  three.blocks = [createParagraphBlock(bi('Which of the following is correct about the two policies in the table?', '就表中的兩項政策，以下哪項正確？')), quote];
  three.options = [
    ['Both policies raise the equilibrium price', '兩項政策均令均衡價格上升'],
    ['Only the subsidy lowers the equilibrium price', '只有補貼令均衡價格下降'],
    ['Only the tax lowers the equilibrium price', '只有稅項令均衡價格下降'],
    ['Neither policy changes the equilibrium price', '兩項政策均不改變均衡價格'],
  ].map(([en, zh]) => ({ id: newId(), text: bi(en, zh) }));
  three.answerIndex = 1;

  return paper('Table justify mix', '表格兩端對齊', [
    createSectionElement(bi('Section A: Structured Questions', '甲部：結構題')),
    one,
    two,
    brk(),
    createSectionElement(bi('Section B: Multiple Choice', '乙部：多項選擇題')),
    three,
  ]);
}

it('emits the manual test documents', () => {
  if (!process.env.EMIT_MANUAL_FIXTURES) return;
  mkdirSync(OUT, { recursive: true });
  const files: Array<[string, Worksheet]> = [
    ['issue-4-repro', repro()],
    ['issue-4-many-breaks', manyBreaks()],
    ['mixed-for-anonymiser', mixed()],
    ['option-layout-mix', optionLayoutMix()],
    ['question-gap-mix', questionGapMix()],
    ['page-flow-mix', pageFlowMix()],
    ['table-justify-mix', tableJustifyMix()],
  ];
  for (const [name, w] of files) writeFileSync(`${OUT}/${name}.json`, `${stable(stringifyWorksheet(w), 'm-')}\n`);
});
