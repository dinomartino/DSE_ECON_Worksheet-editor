import { writeFileSync } from 'node:fs';
import { exportAnswerKeyDocxBuffer } from '@/export/docx';
import { it } from 'vitest';
import { createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { createMarkEc } from '@/model/markScheme';
import type { MarkPoint } from '@/model/markSchemeTypes';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { ParagraphBlock } from '@/model/types';
import { withFlow } from '@/test/fixtures';

/**
 * k-0470's browser fixture (`scripts/drq-scheme-verify.mjs`): a DRQ whose (a) is marked
 * point by point, (b) in HKEAA's paragraph style, and (c) an essay part with the standard
 * EC table, and its HKEAA-style answer key as .docx (EN, 中). Written to $DRQ_DIR
 * (default /tmp/drq-scheme-verify).
 */

const para = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });
const point = (en: string, zh: string, marks?: number): MarkPoint => ({
  id: newId(),
  text: bi(en, zh),
  ...(marks !== undefined ? { marks } : {}),
});

it('emits the DRQ scheme fixture', async () => {
  const question = createStructuredQuestion();
  question.blocks = [
    para(
      'Source A: Hong Kong’s fiscal balance went from a surplus in 2018-19 to a deficit in 2022-23.',
      '資料A：香港的財政結餘由2018-19年度的盈餘轉為2022-23年度的赤字。',
    ),
  ];
  const a = question.parts[0];
  a.blocks = [para('With reference to Source A, explain why the fiscal balance worsened.', '參考資料A，解釋財政結餘為何轉差。')];
  a.marks = 4;
  a.scheme = {
    routes: [
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            max: 4,
            points: [
              point(
                'In an economic downturn, firms’ profits and workers’ salaries fall, so revenue from profits tax and salaries tax decreases.',
                '經濟下滑時，企業利潤及工資下降，利得稅及薪俸稅收入減少。',
                2,
              ),
              point(
                'The number of unemployed rises, so government expenditure on welfare benefits increases.',
                '失業人數上升，政府的福利開支增加。',
                2,
              ),
            ],
          },
        ],
      },
    ],
  };

  const b = { ...createStructuredQuestion().parts[0] };
  b.blocks = [para('Explain how a bank run may lead to deposit contraction.', '解釋擠提如何可能導致存款收縮。')];
  b.marks = 3;
  b.scheme = {
    display: 'paragraph',
    routes: [
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            points: [
              point('The withdrawal of bank deposits may result in a reserve shortage.', '提取銀行存款可能導致儲備不足。', 1),
              point('Banks would need to call back loans to fulfil legal reserve requirements.', '銀行須收回貸款以符合法定儲備要求。', 1),
              point(
                'The public would further withdraw deposits, and the process would go on, resulting in deposit contraction.',
                '公眾會進一步提取存款，過程不斷重複，導致存款收縮。',
                1,
              ),
            ],
          },
        ],
      },
    ],
  };

  const c = { ...createStructuredQuestion().parts[0] };
  c.blocks = [para('Discuss whether importing workers would help the catering industry.', '討論輸入勞工能否幫助餐飲業。')];
  c.marks = 14;
  c.scheme = {
    display: 'paragraph',
    routes: [
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            points: [
              point('Importation of workers would increase labour supply and lower the equilibrium wage rate.', '輸入勞工會增加勞力供應，令均衡工資率下降。', 4),
              point('The cost of production for the catering industry would decrease. Supply increases.', '餐飲業的生產成本會下降。供應上升。', 4),
              point('Equilibrium quantity increases; total revenue would increase if demand rose more than supply.', '均衡數量上升；若需求升幅大於供應，總收益會上升。', 4),
            ],
          },
        ],
      },
    ],
    ec: createMarkEc(),
  };
  question.parts = [a, b, c];

  const worksheet = withFlow(createWorksheet(), [question]);
  worksheet.title = bi('DRQ — marking scheme styles', '資料回應題 — 評分方式');
  worksheet.answerKeyLayout = { preset: 'hkeaa' };
  const dir = process.env.DRQ_DIR ?? '/tmp/drq-scheme-verify';
  writeFileSync(`${dir}/drq.worksheet.json`, JSON.stringify(serializeWorksheet(worksheet)));
  for (const language of ['en', 'zh'] as const) {
    writeFileSync(`${dir}/drq-key-${language}.docx`, Buffer.from(await exportAnswerKeyDocxBuffer(worksheet, language)));
  }
});
