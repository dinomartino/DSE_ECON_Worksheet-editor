/**
 * Not a unit test: writes the legacy-answer goldens (u-0c5q). Run once, on the build
 * BEFORE answers held blocks (develop e01f01c2), deliberately:
 *   EMIT_LEGACY_ANSWER_GOLDENS=1 npx vitest run scripts/emit-legacy-answer-goldens.test.ts
 *
 * The document is an old-shape paper: answer text + one `answerDiagram` on an essay, a leaf
 * part, two sub-parts and a part's aggregate row. The goldens are what that build printed
 * (page IR in every mode, every answer-key preset in every language, the .docx body), so
 * `legacyAnswer.test.ts` can prove the new build prints it exactly the same. Never
 * regenerate it from a later build.
 */
import { writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { it } from 'vitest';
import { createAnswerDiagram, createParagraphBlock, createPart, createStructuredQuestion, createSubPart, createWorksheet } from '@/model/factories';
import { createMarkScheme } from '@/model/markScheme';
import { serializeWorksheet, migrate } from '@/model/migrations';
import { ANSWER_KEY_PRESET_IDS } from '@/model/answerKeyLayout';
import { bi } from '@/model/text';
import { renderWorksheet } from '@/render/worksheet';
import { renderAnswerKey } from '@/render/answerKey';
import { exportAnswerKeyDocxBuffer, exportDocxBuffer } from '@/export/docx';
import type { StructuredQuestion, Worksheet } from '@/model/types';

const DIR = 'src/test/legacyAnswer';

function stableIds(doc: Record<string, unknown>): Record<string, unknown> {
  const slugs = new Map<string, string>();
  const collect = (value: unknown, key?: string): void => {
    if (Array.isArray(value)) return value.forEach((entry) => collect(entry));
    if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) collect(v, k);
    else if (typeof value === 'string' && key === 'id' && value && !slugs.has(value)) slugs.set(value, `la${String(slugs.size + 1).padStart(3, '0')}`);
  };
  const rewrite = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v)]));
    return typeof value === 'string' ? (slugs.get(value) ?? value) : value;
  };
  collect(doc);
  return rewrite(doc) as Record<string, unknown>;
}

function build(): Worksheet {
  const scheme = () => {
    const s = createMarkScheme();
    s.routes[0].groups[0].points[0].text = bi('Demand rises', '需求上升');
    s.routes[0].groups[0].points[0].marks = 1;
    return s;
  };
  const essay: StructuredQuestion = {
    ...createStructuredQuestion(),
    blocks: [createParagraphBlock(bi('Explain with a diagram why the price rises.', '試以圖解釋價格為何上升。'))],
    parts: [],
    marks: 6,
    answer: bi('Demand increases, so price rises.', '需求增加，所以價格上升。'),
    answerDiagram: createAnswerDiagram(),
    scheme: scheme(),
  };
  const a = createPart();
  a.blocks = [createParagraphBlock(bi('Draw a diagram.', '繪圖。'))];
  a.marks = 4;
  a.answer = bi('Shift demand right.', '需求曲線右移。');
  a.answerDiagram = createAnswerDiagram();
  a.scheme = scheme();
  const b = createPart();
  b.blocks = [createParagraphBlock(bi('Consider the market.', '考慮市場。'))];
  const i = createSubPart();
  i.blocks = [createParagraphBlock(bi('Show the surplus.', '顯示過剩。'))];
  i.marks = 2;
  i.answer = bi('Area above the price.', '價格以上的面積。');
  i.answerDiagram = createAnswerDiagram();
  const ii = createSubPart();
  ii.blocks = [createParagraphBlock(bi('Show the shortage.', '顯示短缺。'))];
  ii.marks = 2;
  ii.answerDiagram = createAnswerDiagram();
  b.subParts = [i, ii];
  b.answer = bi('Overall the market clears.', '整體市場出清。');
  b.answerDiagram = createAnswerDiagram();
  const c = createPart();
  c.blocks = [createParagraphBlock(bi('Explain.', '解釋。'))];
  c.marks = 2;
  c.answer = bi('Because of scarcity.', '因為稀少。');
  const parted: StructuredQuestion = {
    ...createStructuredQuestion(),
    blocks: [createParagraphBlock(bi('Read the data.', '閱讀資料。'))],
    parts: [a, b, c],
  };
  return {
    ...createWorksheet(),
    title: bi('Legacy answers', '舊式答案'),
    questions: [essay, parted],
    flow: [{ type: 'question', id: essay.id }, { type: 'question', id: parted.id }],
  };
}

async function documentXml(buffer: ArrayBuffer | Buffer | Uint8Array): Promise<string> {
  return (await JSZip.loadAsync(buffer)).file('word/document.xml')!.async('string');
}

it.runIf(process.env.EMIT_LEGACY_ANSWER_GOLDENS === '1')('emits the legacy answer document and goldens', async () => {
  const stored = stableIds(serializeWorksheet(build()) as Record<string, unknown>);
  stored.createdAt = '2026-11-27T00:00:00.000Z';
  stored.updatedAt = '2026-11-27T00:00:00.000Z';
  writeFileSync(`${DIR}/legacy-answer-diagram.json`, `${JSON.stringify(stored, null, 2)}\n`);
  const worksheet = migrate(structuredClone(stored));
  const goldens: Record<string, unknown> = {};
  for (const language of ['en', 'zh', 'bilingual'] as const) {
    for (const version of ['student', 'teacher'] as const) {
      goldens[`page:${language}:${version}`] = renderWorksheet(worksheet, { language, version }).items;
      goldens[`docx:${language}:${version}`] = await documentXml(await exportDocxBuffer(worksheet, { language, version }, new Map()));
    }
    for (const preset of ANSWER_KEY_PRESET_IDS) {
      const keyed = { ...worksheet, answerKeyLayout: { preset } } as Worksheet;
      goldens[`key:${preset}:${language}`] = renderAnswerKey(keyed, language);
      goldens[`keydocx:${preset}:${language}`] = await documentXml(await exportAnswerKeyDocxBuffer(keyed, language, [], new Map()));
    }
  }
  writeFileSync(`${DIR}/goldens.json`, `${JSON.stringify(goldens)}\n`);
});
