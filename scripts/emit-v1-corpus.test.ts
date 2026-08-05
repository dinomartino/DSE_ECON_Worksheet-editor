/**
 * Not a unit test: regenerates the frozen schema-v1 corpus fixture.
 *
 * Run deliberately, and essentially never again:
 *   npx vitest run scripts/emit-v1-corpus.test.ts
 *
 * The corpus it writes (`src/test/corpus/v1-published.json`) stands in for the
 * documents real teachers have saved from the published build. Its whole value is
 * that it is a **fixed artifact**: a fixture this build regenerates proves only that
 * the build agrees with itself, which is exactly the check that cannot catch a
 * migration that silently drops a field.
 *
 * So: once a schema version has shipped, its corpus is frozen. Do not re-run this to
 * "update" the file after a model change — that would rewrite the evidence instead of
 * migrating it. A new schema version gets a new corpus file beside this one, and the
 * old one stays exactly as it is.
 *
 * Ids are rewritten to stable, readable slugs so the file diffs meaningfully and does
 * not churn on every regeneration (`newId` is nanoid — random by design).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { it } from 'vitest';
import {
  createDiagramBlock,
  createImageBlock,
  createParagraphBlock,
  createPart,
  createStructuredQuestion,
  createSubPart,
  createTableBlock,
} from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { serializeWorksheet } from '@/model/migrations';
import { bi } from '@/model/text';
import { TINY_PNG } from '@/test/fixtures';
import type { StructuredQuestion, Worksheet } from '@/model/types';

const OUT = 'src/test/corpus/v1-published.json';

/**
 * Replace every generated id with a stable slug, in first-encounter order.
 *
 * Keyed on the *value*, so an id referenced from `flow` maps to the same slug as its
 * definition in `questions` — the cross-references are the part of the document a
 * migration is most likely to break, and randomised ids would hide that in diff noise.
 */
function withStableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const seen = new Map<string, string>();
  const slug = (id: string) => {
    const existing = seen.get(id);
    if (existing) return existing;
    const next = `id${String(seen.size + 1).padStart(3, '0')}`;
    seen.set(id, next);
    return next;
  };

  const walk = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map((entry) => walk(entry));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, walk(v, k)]),
      );
    }
    // `id` fields and the flow's references to them are the only id-shaped strings.
    if (typeof value === 'string' && (key === 'id' || key === 'blockId') && value.length > 0) {
      return slug(value);
    }
    return value;
  };

  return walk(doc) as Record<string, unknown>;
}

/** A structured question carrying the shapes the model grew last: interlude, shared marks, answer space. */
function richStructured(): StructuredQuestion {
  const question = createStructuredQuestion();
  question.blocks = [
    createParagraphBlock(bi('The government imposes a per-unit tax.', '政府徵收從量稅。')),
  ];
  question.showTotalMarks = true;

  const balanceSheet = createTableBlock(3, 4);
  balanceSheet.borders = 'headerRule';
  balanceSheet.rows[0].cells[0].colSpan = 2;
  balanceSheet.rows[0].cells[0].text = bi('Assets', '資產');
  balanceSheet.rows[0].cells[1].covered = true;
  balanceSheet.rows[0].cells[2].colSpan = 2;
  balanceSheet.rows[0].cells[2].text = bi('Liabilities', '負債');
  balanceSheet.rows[0].cells[3].covered = true;
  balanceSheet.rows[1].cells[0].text = bi('Reserves', '儲備');
  balanceSheet.rows[1].cells[1].text = bi('200', '200');
  balanceSheet.rows[1].cells[2].text = bi('Deposits', '存款');
  balanceSheet.rows[1].cells[3].text = bi('1 000', '1 000');
  balanceSheet.rows[2].cells[0].text = bi('Loans', '貸款');
  balanceSheet.rows[2].cells[1].text = bi('800', '800');

  const partA = createPart();
  partA.blocks = [createParagraphBlock(bi('Define tax incidence.', '定義稅項歸宿。'))];
  partA.marks = 3;
  partA.answer = bi('Who ultimately bears the tax.', '最終承擔稅項的一方。');
  partA.answerSpace = 4;

  // Deliberately unmarked: this pair shares one label, printed on the second (§ absent
  // marks is not zero). A corpus that marked every sub-part could not catch a migration
  // that "helpfully" defaulted an absent mark to 0.
  const firstSub = createSubPart();
  firstSub.blocks = [createParagraphBlock(bi('State the direction of the change.', '指出變動的方向。'))];
  delete firstSub.marks;
  firstSub.answerSpace = 2;

  const secondSub = createSubPart();
  secondSub.blocks = [createParagraphBlock(bi('Explain the mechanism.', '解釋其機制。'))];
  secondSub.marks = 5;
  secondSub.answer = bi('Reserves fall, so lending contracts.', '儲備下降，貸款收縮。');
  secondSub.answerSpace = 6;

  // The mid-question interlude: a revised scenario the parts below it depend on.
  const partB = createPart();
  partB.blocksBefore = [
    createParagraphBlock(
      bi('Suppose the central bank now sells $200 million of bonds.', '假設中央銀行現售出二億元債券。'),
    ),
    balanceSheet,
  ];
  partB.blocks = [createParagraphBlock(bi('Explain the effect on the money supply.', '解釋對貨幣供應的影響。'))];
  delete partB.marks;
  partB.subParts = [firstSub, secondSub];

  question.parts = [partA, partB];
  return question;
}

it('emits the frozen schema-v1 corpus', () => {
  // `lqMock` is the widest document this app makes: cover, page furniture, sections
  // with derived totals, a QAB footer and a 10pt base size. Everything else is a
  // subset of its surface, so one corpus covers the rest.
  const worksheet: Worksheet = createWorksheetFrom({ documentType: 'lqMock', seedSample: true });

  worksheet.title = bi('S5 Economics Mock Examination', '中五經濟科模擬試');
  worksheet.instructions = bi('Answer ALL questions in Section A.', '甲部所有題目均須作答。');

  // A diagram, so the corpus carries stored unit-space geometry (not a raster).
  const diagramBlock = createDiagramBlock('supply-demand');

  const image = createImageBlock(TINY_PNG, 200, 150);
  image.altText = bi('Market photograph', '市場照片');
  image.caption = bi('Figure 1', '圖一');
  image.captionPlacement = 'below';

  const extra = richStructured();
  extra.blocks = [...extra.blocks, diagramBlock, image];

  // Append beside whatever `lqMock` seeded, keeping both lists in step (§ flow invariant).
  worksheet.questions = [...worksheet.questions, extra];
  worksheet.flow = [...worksheet.flow, { type: 'question', id: extra.id }];

  const doc = withStableIds(serializeWorksheet(worksheet));
  // Timestamps would churn the file on every regeneration and carry no meaning here.
  doc.createdAt = '2026-01-01T00:00:00.000Z';
  doc.updatedAt = '2026-01-01T00:00:00.000Z';
  doc.id = 'v1-published-corpus';

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`wrote ${OUT}`);
});
