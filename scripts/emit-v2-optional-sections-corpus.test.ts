/**
 * Not a unit test: writes the frozen corpus of the later v2 triggers.
 *
 * Run once, deliberately (it refuses without the variable):
 *   EMIT_V2_OPTIONAL_CORPUS=1 npx vitest run scripts/emit-v2-optional-sections-corpus.test.ts
 *
 * v2 also marks a section's `answerCount` / `targetMarks` and an essay's own `answer` /
 * `scheme` (§ `writtenSchemaVersion`). This file carries each, beside the metadata that
 * stays at 1 (topics, lineage), so `backwardCompat.test.ts` can prove a later migration
 * keeps them. Never regenerate it; a v3 gets files of its own.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createParagraphBlock, createPart, createStructuredQuestion } from '@/model/factories';
import { copyQuestion } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import type { MarkScheme } from '@/model/markSchemeTypes';
import type { LayoutElement, StructuredQuestion } from '@/model/types';

const OUT = 'src/test/corpus/v2-optional-sections.json';

/** Generated ids to stable slugs; every string equal to one follows it. */
function withStableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) collect(v, k);
    } else if (typeof value === 'string' && key === 'id' && value.length > 0 && !slugs.has(value)) {
      slugs.set(value, `os${String(slugs.size + 1).padStart(3, '0')}`);
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

/** A level-marked essay scheme with two content points; ids unique per essay (`dedupeIds`). */
function essayScheme(topic: string, key: string): MarkScheme {
  return {
    routes: [
      {
        id: `${key}-route`,
        groups: [
          {
            id: `${key}-group`,
            points: [
              { id: `${key}-p1`, text: bi(`Define ${topic}`, `${topic}的定義`), marks: 2 },
              { id: `${key}-p2`, text: bi(`Explain one effect of ${topic}`, `解釋${topic}的一個影響`), marks: 4, alternatives: [bi('Or a diagram', '或繪圖說明')] },
            ],
          },
        ],
      },
    ],
    levels: [
      { id: `${key}-l1`, min: 1, max: 6, descriptor: bi('Limited discussion', '討論有限') },
      { id: `${key}-l2`, min: 7, max: 12, descriptor: bi('Balanced discussion', '討論平衡') },
    ],
  };
}

function essay(stem: [string, string], answer: [string, string], topic: string, key: string): StructuredQuestion {
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi(...stem))];
  question.parts = [];
  question.marks = 12;
  question.answer = bi(...answer);
  question.scheme = essayScheme(topic, key);
  question.answerSpace = 20;
  return question;
}

it('emits the frozen optional-sections corpus', () => {
  if (process.env.EMIT_V2_OPTIONAL_CORPUS !== '1') {
    throw new Error(
      `Refusing to rewrite the frozen corpus ${OUT}. It is never regenerated; set ` +
        'EMIT_V2_OPTIONAL_CORPUS=1 only when deliberately cutting it.',
    );
  }

  const worksheet = createWorksheetFrom({ documentType: 'lqMock' });
  worksheet.title = bi('S6 Economics Mock Paper 2', '中六經濟科模擬試卷二');
  type Section = Extract<LayoutElement, { kind: 'section' }>;
  const sections = worksheet.layout.filter((element): element is Section => element.kind === 'section');
  const [sectionA, sectionB, sectionC] = sections;
  // Section B: a marks target only. Section C: answer any ONE, with its own target.
  worksheet.layout = worksheet.layout.map((element) =>
    element.id === sectionB.id
      ? { ...element, targetMarks: 8 }
      : element.id === sectionC.id
        ? { ...element, answerCount: 1, targetMarks: 12 }
        : element,
  );

  // Section A keeps the template's question; B gets a tagged copy with parts.
  const structured = createStructuredQuestion();
  structured.blocks = [createParagraphBlock(bi('Study the market for taxis.', '細閱的士市場。'))];
  const partA = createPart();
  partA.blocks = [createParagraphBlock(bi('Explain one barrier to entry.', '解釋一項入行限制。'))];
  partA.marks = 3;
  partA.answer = bi('Licence quota.', '牌照配額。');
  partA.tags = ['E.monopoly'];
  const partB = createPart();
  partB.blocks = [createParagraphBlock(bi('Is the market contestable?', '市場是否可競爭？'))];
  partB.marks = 5;
  structured.parts = [partA, partB];
  const tagged = { ...copyQuestion(structured, 'doc-taxi'), tags: ['E', 'mock 2026'] };
  delete tagged.lineage?.copiedAt;

  const essays = [
    essay(['Discuss whether a minimum wage helps the low-paid.', '討論最低工資是否有助低收入人士。'], ['Raises wages of those employed; may cut employment.', '提高受僱者工資；或減少就業。'], 'a minimum wage', 'wage'),
    essay(['Evaluate a rent control in Hong Kong.', '評價香港的租金管制。'], ['Lower rent for tenants; shortage of flats.', '租戶租金下降；單位短缺。'], 'rent control', 'rent'),
  ];

  const intro = worksheet.layout.find((element) => element.kind === 'text' && element.text.en[0]?.text.startsWith('Answer any'));
  const flow: typeof worksheet.flow = [];
  for (const entry of worksheet.flow) {
    flow.push(entry);
    if (entry.id === sectionB.id) flow.push({ type: 'question', id: tagged.id });
    if (entry.id === intro?.id) essays.forEach((q) => flow.push({ type: 'question', id: q.id }));
  }
  worksheet.questions = [...worksheet.questions, tagged, ...essays];
  worksheet.flow = flow;
  void sectionA;

  const doc = withStableIds(serializeWorksheet(worksheet));
  if (doc.schemaVersion !== 2) throw new Error(`Expected a v2 document, got ${String(doc.schemaVersion)}.`);
  doc.createdAt = '2026-10-03T00:00:00.000Z';
  doc.updatedAt = '2026-10-03T00:00:00.000Z';
  doc.id = 'v2-optional-sections-corpus';
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
});
