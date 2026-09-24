import { createStructuredQuestion, createSubPart, createWorksheet, newId } from '@/model/factories';
import { createMarkEc } from '@/model/markScheme';
import type { MarkPoint } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import type { ParagraphBlock, Worksheet } from '@/model/types';
import { withFlow } from './fixtures';

const para = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });

const point = (en: string, zh: string, marks?: number, alternatives: Array<[string, string]> = []): MarkPoint => ({
  id: newId(),
  text: bi(en, zh),
  ...(marks !== undefined ? { marks } : {}),
  ...(alternatives.length > 0 ? { alternatives: alternatives.map(([a, b]) => bi(a, b)) } : {}),
});

/**
 * A Paper 2 question carrying every piece of HKEAA marking notation: `/`, OR routes,
 * "any TWO @1" with "first two only", `max`, levels and EC. Used by the sample export
 * and the browser screenshot.
 */
export function buildMarkSchemeWorksheet(): Worksheet {
  const question = createStructuredQuestion();
  question.blocks = [
    para(
      'The government imposes a per-unit tax on cigarettes.',
      '政府向香煙徵收從量稅。',
    ),
  ];

  const a = question.parts[0];
  a.blocks = [para('Explain how the tax affects the equilibrium price of cigarettes.', '解釋該稅項如何影響香煙的均衡價格。')];
  a.marks = 3;
  a.answer = bi('Answers are for reference only.', '答案僅供參考。');
  a.scheme = {
    routes: [
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            points: [
              point('Supply decreases', '供應減少', 1, [['the supply curve shifts upward', '供應曲線向上移']]),
              point('At the original price there is a shortage', '在原來價格下出現短缺', 1),
              point('The equilibrium price rises', '均衡價格上升', 1),
            ],
          },
        ],
      },
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            points: [
              point(
                'Diagram: parallel upward shift of S by the tax, new equilibrium at a higher price',
                '圖示：供應曲線按稅額平行上移，新均衡價格較高',
                3,
              ),
            ],
          },
        ],
      },
    ],
  };

  const b = { ...createStructuredQuestion().parts[0], marks: undefined };
  b.blocks = [para('Refer to the tax above.', '參考上述稅項。')];
  const [i, ii] = [createSubPart(), createSubPart()];
  i.blocks = [para('Give TWO reasons why the government may impose this tax.', '列出兩個政府可能徵收此稅的原因。')];
  i.marks = 2;
  i.scheme = {
    routes: [
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            take: 2,
            each: 1,
            firstOnly: true,
            max: 2,
            points: [
              point('To raise tax revenue', '增加稅收'),
              point('To reduce consumption of a harmful good', '減少有害物品的消費'),
              point('To internalise the external cost of smoking', '將吸煙的外部成本內部化'),
              point('Any other relevant point', '其他合理答案'),
            ],
          },
        ],
      },
    ],
  };
  ii.blocks = [para('Discuss whether the tax is an efficient way to reduce smoking.', '討論該稅項是否減少吸煙的有效方法。')];
  ii.marks = 8;
  ii.scheme = {
    routes: [
      {
        id: newId(),
        groups: [
          {
            id: newId(),
            points: [
              point('Demand for cigarettes is price-inelastic', '香煙的需求缺乏價格彈性'),
              point('Deadweight loss vs. the external cost corrected', '無謂損失與所糾正的外部成本'),
            ],
          },
        ],
      },
    ],
    levels: [
      { id: newId(), min: 1, max: 2, descriptor: bi('Few relevant points, little explanation.', '只有少量相關論點，解釋不足。') },
      { id: newId(), min: 3, max: 4, descriptor: bi('Relevant points with some explanation.', '論點相關並有一些解釋。') },
      { id: newId(), min: 5, max: 6, descriptor: bi('Balanced discussion with a reasoned conclusion.', '討論全面，結論有理據。') },
    ],
    ec: createMarkEc(),
  };
  b.subParts = [i, ii];
  question.parts = [a, b];

  const worksheet = withFlow(createWorksheet(), [question]);
  worksheet.title = bi('Taxation — structured question', '稅項 — 結構式題目');
  return worksheet;
}
