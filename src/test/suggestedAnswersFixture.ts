import { createMcqQuestion, createStructuredQuestion, createSubPart, createWorksheet, newId } from '@/model/factories';
import type { MarkPoint } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import type { ParagraphBlock, Worksheet } from '@/model/types';
import { withFlow } from './fixtures';

/**
 * A paper whose marker-only text is all sentinels, for the Suggested answers leak tests.
 * Every string a student may see ends in `-OK`; every string only a marker may see is
 * a `…-SENTINEL` that must never reach the handout in any backend. Option reasons are
 * `RATIONALE-OPTION` (a teacher may switch them on). No Chinese text here contains 或,
 * so the OR notation's zh can be looked for as a bare character.
 */
export const LEAK_SENTINELS = {
  provenance: ['PROVENANCE-SENTINEL', '出處哨兵'],
  levels: ['LEVEL-ONE-SENTINEL', '等級一哨兵', 'LEVEL-TWO-SENTINEL', '等級二哨兵'],
  ec: ['EC-TOP-SENTINEL', '傳意上哨兵', 'EC-LOW-SENTINEL', '傳意下哨兵'],
  /** A second OR route: Suggested answers prints the first route only. */
  route: ['ROUTE-TWO-SENTINEL', '第二途徑哨兵'],
} as const;

const para = (en: string, zh: string): ParagraphBlock => ({ kind: 'paragraph', id: newId(), text: bi(en, zh) });
const point = (en: string, zh: string, marks?: number, alternatives: Array<[string, string]> = []): MarkPoint => ({
  id: newId(),
  text: bi(en, zh),
  ...(marks !== undefined ? { marks } : {}),
  ...(alternatives.length > 0 ? { alternatives: alternatives.map(([a, b]) => bi(a, b)) } : {}),
});

export function buildLeakWorksheet(): Worksheet {
  const mcq = createMcqQuestion();
  mcq.blocks = [para('MC-STEM-OK', '選擇題題幹')];
  mcq.answerIndex = 1;
  mcq.explanation = bi('EXPLANATION-OK', '解說好');
  mcq.options = mcq.options.map((option, index) => ({
    ...option,
    text: bi(`OPTION-${'ABCD'[index]}-OK`, `選項${'ABCD'[index]}`),
    rationale: bi(`RATIONALE-OPTION-${'ABCD'[index]}`, `選項分析${'ABCD'[index]}`),
  }));
  mcq.provenance = bi(LEAK_SENTINELS.provenance[0], LEAK_SENTINELS.provenance[1]);

  const question = createStructuredQuestion();
  question.blocks = [para('LQ-STEM-OK', '長題目題幹')];
  const a = question.parts[0];
  a.blocks = [para('PART-A-OK', '甲部分')];
  a.marks = 3;
  a.answer = bi('ANSWER-A-OK', '答案甲');
  a.scheme = {
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
              point('POINT-ONE-OK', '要點一', undefined, [['ALTERNATIVE-OK', '另一說法']]),
              point('POINT-TWO-OK', '要點二'),
              point('POINT-THREE-OK', '要點三'),
            ],
          },
          { id: newId(), points: [point('POINT-FOUR-OK', '要點四', 1)], max: 1 },
        ],
      },
      { id: newId(), groups: [{ id: newId(), points: [point(LEAK_SENTINELS.route[0], LEAK_SENTINELS.route[1], 3)] }] },
    ],
  };
  const b = { ...createStructuredQuestion().parts[0], marks: undefined, blocks: [para('PART-B-OK', '乙部分')] };
  const essay = createSubPart();
  essay.blocks = [para('ESSAY-OK', '論述題')];
  essay.marks = 8;
  essay.scheme = {
    routes: [{ id: newId(), groups: [{ id: newId(), points: [point('ESSAY-POINT-OK', '論述要點')] }] }],
    levels: [
      { id: newId(), min: 1, max: 3, descriptor: bi(LEAK_SENTINELS.levels[0], LEAK_SENTINELS.levels[1]) },
      { id: newId(), min: 4, max: 6, descriptor: bi(LEAK_SENTINELS.levels[2], LEAK_SENTINELS.levels[3]) },
    ],
    ec: {
      max: 2,
      descriptors: [
        { id: newId(), marks: 2, text: bi(LEAK_SENTINELS.ec[0], LEAK_SENTINELS.ec[1]) },
        { id: newId(), marks: 0, text: bi(LEAK_SENTINELS.ec[2], LEAK_SENTINELS.ec[3]) },
      ],
    },
  };
  b.subParts = [essay];
  question.parts = [a, b];

  const worksheet = withFlow(createWorksheet(), [mcq, question]);
  worksheet.title = bi('Mock', '模擬試');
  return worksheet;
}
