/**
 * Not a unit test: writes the frozen MC-question corpus `src/test/corpus/v1-mcq.json`.
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V1_MCQ_CORPUS=1 npx vitest run scripts/emit-v1-mcq-corpus.test.ts
 *
 * Outside stores (DSE Mentor's app bank, the KP_ECON question bank) keep questions in
 * this editor's MC type and rely on "a saved file always opens". This file proves it for
 * MC questions: statements, options, a picture option, a table and a picture in the stem,
 * answer, explanation, tags, provenance, lineage, a shared stimulus, and a picture with a
 * Chinese source (`srcZh`). Frozen as of the build that wrote it: NEVER regenerate it to
 * make a test pass; a later schema version gets a file of its own. (Written at schemaVersion
 * 1 because nothing in it needs 2; it includes `srcZh`, added after v1 shipped, so future builds
 * must keep reading that field too.)
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createImageBlock, createMcqQuestion, createParagraphBlock, createTableBlock } from '@/model/factories';
import { createStimulusElement } from '@/model/flow';
import { copyQuestion } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { McqQuestion } from '@/model/types';

const OUT = 'src/test/corpus/v1-mcq.json';

/** 1x1 PNGs (a few hundred bytes at most): red for English, blue for the Chinese source. */
const PNG_EN =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const PNG_ZH =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg==';

function withIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `mc${String(slugs.size + 1).padStart(3, '0')}`);
    }
  };
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    }
    return typeof value === 'string' ? (slugs.get(value) ?? value) : value;
  };
  collect(doc);
  return rewrite(doc) as Record<string, unknown>;
}

function mcq(stem: [string, string], options: [string, string][], answerIndex: number): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi(...stem))];
  question.options.forEach((option, i) => (option.text = bi(...options[i])));
  question.answerIndex = answerIndex;
  return question;
}

it('emits the frozen MC corpus', () => {
  if (process.env.EMIT_V1_MCQ_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${OUT}. It is never regenerated; set ` +
        'EMIT_V1_MCQ_CORPUS=1 only when deliberately cutting it.',
    );
  }
  const worksheet = createWorksheetFrom({ documentType: 'paper1' });
  worksheet.title = bi('MC corpus', '多項選擇題語料');

  // 1. Combination MC: statements (1)(2)(3), four options, answer, explanation, tags, provenance, lineage.
  const q1 = mcq(
    ['Which of the following statements about a price ceiling are correct?', '以下有關價格上限的陳述，哪些正確？'],
    [['(1) only', '只有(1)'], ['(1) and (2) only', '只有(1)和(2)'], ['(2) and (3) only', '只有(2)和(3)'], ['(1), (2) and (3)', '(1)、(2)和(3)']],
    1,
  );
  q1.statements = [
    bi('It may cause a shortage.', '可能引致短缺。'),
    bi('It must be set below the equilibrium price to bind.', '必須定於均衡價格以下才有效。'),
    bi('It raises the equilibrium price.', '提高均衡價格。'),
  ];
  q1.explanation = bi('(3) is wrong: a binding ceiling holds price below equilibrium.', '(3)錯誤：有效的價格上限令價格低於均衡價格。');
  q1.tags = ['C.ped', 'price ceiling'];
  q1.tagsAt = '2026-11-01T00:00:00.000Z';
  q1.provenance = bi('Modelled on DSE 2022 Paper 1', '仿照 2022 年文憑試卷一');
  const q1Copy = copyQuestion(q1, 'doc-source');
  delete q1Copy.lineage?.copiedAt;

  // 2. A table and a picture (with a Chinese source) in the stem; a picture option.
  const q2 = mcq(
    ['Refer to the table and the diagram. What happens to total revenue?', '參閱表格及圖。總收益會怎樣？'],
    [['Rises', '上升'], ['Falls', '下降'], ['Unchanged', '不變'], ['Cannot tell', '無法判斷']],
    0,
  );
  const table = createTableBlock(2, 2);
  table.rows.forEach((row, r) => row.cells.forEach((cell, c) => (cell.text = bi(`R${r + 1}C${c + 1}`, `行${r + 1}列${c + 1}`))));
  const picture = createImageBlock(PNG_EN, 20, 10);
  picture.srcZh = PNG_ZH;
  picture.caption = bi('Market for tea', '茶葉市場');
  picture.altText = bi('Demand and supply of tea', '茶葉的需求與供應');
  q2.blocks.push(table, picture);
  q2.options[1].blocks = [Object.assign(createImageBlock(PNG_EN, 10, 10), { altText: bi('Option picture', '選項圖片') })];
  q2.options[1].rationale = bi('Wrong diagram.', '圖不對。');

  // 3. A plain MC following the same shared stimulus.
  const q3 = mcq(['What is the opportunity cost?', '機會成本是甚麼？'], [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], 3);

  const stimulus = createStimulusElement();
  stimulus.blocks = [createParagraphBlock(bi('Study the following passage and answer Questions 2 and 3.', '細閱以下文字，回答第 2 及 3 題。'))];
  worksheet.layout = [stimulus];
  worksheet.questions = [q1Copy, q2, q3];
  worksheet.flow = [
    { type: 'question', id: q1Copy.id },
    { type: 'layout', id: stimulus.id },
    { type: 'question', id: q2.id },
    { type: 'question', id: q3.id },
  ];

  const doc = withIds(serializeWorksheet(worksheet));
  doc.createdAt = '2026-11-16T00:00:00.000Z';
  doc.updatedAt = '2026-11-16T00:00:00.000Z';
  doc.id = 'v1-mcq-corpus';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
