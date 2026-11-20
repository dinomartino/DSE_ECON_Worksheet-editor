import { writeFileSync } from 'node:fs';
import { exportAnswerKeyDocxBuffer } from '@/export/docx';
import { it } from 'vitest';
import { createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { createSchemeFromPattern, type SchemePatternId } from '@/model/markSchemePatterns';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { BiText, ParagraphBlock, QuestionPart } from '@/model/types';
import { withFlow } from '@/test/fixtures';

/**
 * k-0475's browser fixture (`scripts/drq-build-verify.mjs`): a made-up five-part DRQ in the
 * shape of a recent Paper 2 one — (a) 2, (b) 2, (c) 4, (d) 7 with a diagram, (e) a 14-mark
 * essay — twice: `drq-empty` with no schemes (to build from the right panel), and
 * `drq-filled` with each part's scheme started from its pattern and typed, plus its
 * HKEAA-style answer key as .docx (EN, 中). Written to $DRQ_DIR.
 */

const para = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });

const PARTS: Array<{ marks: number; en: string; zh: string; pattern: SchemePatternId }> = [
  { marks: 2, pattern: 'reasons', en: 'With reference to Source A, give ONE reason why bike rentals rose in 2025.', zh: '參考資料A，舉出一個單車租用量在2025年上升的原因。' },
  { marks: 2, pattern: 'paragraph', en: 'Is the city’s spending on bike lanes counted in its GDP? Explain.', zh: '該市在單車徑上的開支是否計入本地生產總值？解釋。' },
  { marks: 4, pattern: 'reasons', en: 'With reference to Source B, explain TWO reasons why the bike-sharing market is not perfectly competitive.', zh: '參考資料B，解釋兩個共享單車市場並非完全競爭的原因。' },
  { marks: 7, pattern: 'explainDiagram', en: 'With the help of a diagram, explain how the parking fee affects the shortage of bike parking spaces.', zh: '借助圖表，解釋泊車費如何影響單車泊位的短缺。' },
  { marks: 14, pattern: 'essay', en: 'With reference to the sources and your own knowledge in Economics, discuss how EACH policy may achieve its objective and the factors that may limit it.', zh: '參考以上資料及你的經濟學知識，討論每項政策如何達成其目標，以及可能限制其成效的因素。' },
];

/** Each part's scheme words, in pattern order (headings already come from the pattern). */
const WORDS: BiText[][] = [
  [
    bi('More tourists arrived and rented bikes.', '更多旅客到訪並租用單車。'),
    bi('The rental price fell after a new firm entered.', '新公司加入後租金下降。'),
  ],
  [bi('Yes. The lanes are new capital goods produced in the year, so they count as government investment expenditure.', '是。單車徑是當年生產的新資本財貨，計入政府投資開支。')],
  [
    bi('Bikes differ in quality and design: products are not homogeneous.', '單車的質素及設計不同：產品並非同質。'),
    bi('Riders do not know every firm’s price: information is not perfect.', '使用者不知道每間公司的價格：資訊並不完全。'),
    bi('Firms need licences to operate: entry is restricted.', '公司須持牌經營：進入市場受限制。'),
  ],
  [
    bi('The fee is set below the equilibrium price, so quantity demanded exceeds quantity supplied. A higher fee reduces quantity demanded and the shortage narrows.', '泊車費低於均衡價格，需求量大於供應量。提高泊車費令需求量減少，短缺收窄。'),
    bi('the fee (P) is set below equilibrium price', '泊車費 (P) 低於均衡價格'),
    bi('original shortage', '原短缺'),
    bi('fee rises to P1', '泊車費上升至 P1'),
    bi('final shortage < original shortage', '最終短缺 < 原短缺'),
  ],
  [
    bi('Policy X: lower fares raise ridership, so traffic congestion falls.', '政策X：降低車費令使用人數上升，交通擠塞減少。'),
    bi('Policy Y: a tax on private cars raises the cost of driving, so some drivers switch to bikes.', '政策Y：私家車稅提高駕駛成本，部分司機改用單車。'),
    bi('If demand for car travel is price inelastic, few drivers switch.', '若私家車出行的需求缺乏價格彈性，轉用單車的人很少。'),
    bi('Bad weather limits how far bikes can replace cars.', '惡劣天氣限制單車取代私家車的程度。'),
  ],
];

function filled(scheme: MarkScheme, words: BiText[]): MarkScheme {
  let next = 0;
  return {
    ...scheme,
    routes: scheme.routes.map((route) => ({
      ...route,
      groups: route.groups.map((group) => ({
        ...group,
        points: group.points
          .map((point) => ({ ...point, text: words[next++] ?? point.text }))
          .filter((point) => point.text.en.length > 0),
      })),
    })),
  };
}

function drq(withSchemes: boolean) {
  const question = createStructuredQuestion();
  question.blocks = [
    para('Source A: Bike rentals in City K rose from 2.1 million in 2024 to 3.4 million in 2025.', '資料A：K市的單車租用量由2024年的210萬次上升至2025年的340萬次。'),
  ];
  question.parts = PARTS.map((spec, index): QuestionPart => {
    const part = { ...createStructuredQuestion().parts[0], id: newId() };
    part.blocks = [para(spec.en, spec.zh)];
    part.marks = spec.marks;
    if (withSchemes) part.scheme = filled(createSchemeFromPattern(spec.pattern, spec.marks), WORDS[index]);
    return part;
  });
  const worksheet = withFlow(createWorksheet(), [question]);
  worksheet.title = bi('DRQ — City K bike sharing', '資料回應題 — K市共享單車');
  worksheet.answerKeyLayout = { preset: 'hkeaa' };
  return worksheet;
}

it('emits the DRQ build fixtures', async () => {
  const dir = process.env.DRQ_DIR ?? '/tmp/drq-build-verify';
  writeFileSync(`${dir}/drq-empty.worksheet.json`, JSON.stringify(serializeWorksheet(drq(false))));
  const full = drq(true);
  writeFileSync(`${dir}/drq-filled.worksheet.json`, JSON.stringify(serializeWorksheet(full)));
  for (const language of ['en', 'zh'] as const) {
    writeFileSync(`${dir}/drq-filled-key-${language}.docx`, Buffer.from(await exportAnswerKeyDocxBuffer(full, language)));
  }
});
