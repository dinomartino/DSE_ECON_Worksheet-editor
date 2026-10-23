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

it('emits the manual test documents', () => {
  if (!process.env.EMIT_MANUAL_FIXTURES) return;
  mkdirSync(OUT, { recursive: true });
  const files: Array<[string, Worksheet]> = [
    ['issue-4-repro', repro()],
    ['issue-4-many-breaks', manyBreaks()],
    ['mixed-for-anonymiser', mixed()],
    ['option-layout-mix', optionLayoutMix()],
    ['question-gap-mix', questionGapMix()],
  ];
  for (const [name, w] of files) writeFileSync(`${OUT}/${name}.json`, `${stable(stringifyWorksheet(w), 'm-')}\n`);
});
