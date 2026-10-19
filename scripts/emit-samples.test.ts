/**
 * Not a unit test: plans the sample .docx files that `npm run samples`
 * (`scripts/emit-samples.mjs`) then exports through the app's own Export dialog in a
 * real browser, so each file breaks its pages where the preview does (§ `joinWithPageBreaks`)
 * — the sheets are measured, and only a browser can measure them.
 *
 * Writes each document as `<OUT>/.plan/<n>.worksheet.json` and the files to make from it
 * as `<OUT>/.plan/plan.json`. Run alone: `npx vitest run scripts/emit-samples.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { afterAll, expect, it } from 'vitest';
import { answerKeyFileName, docxFileName } from '@/export/docx';
import { createAnswerDiagram, createParagraphBlock, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import type { LanguageMode, OutputMode, StructuredQuestion, Worksheet } from '@/model/types';
import { presetFor } from '@/ai/providers';
import { loadGlossary } from '@/glossary/load';
import { applyTranslationBatch } from '@/model/translationApply';
import { defaultTranslateOptions, planTranslation } from '@/translate/plan';
import { runTranslation, writesFor } from '@/translate/run';
import { oneSided, referenceClient } from '@/translate/testKit';

const OUT = process.env.SAMPLE_DIR ?? '/tmp/econ-samples';
const PLAN = `${OUT}/.plan`;

/** One file to export: the document (by its plan file), what, and where it goes. */
interface PlannedSample {
  doc: string;
  title: string;
  out: string;
  what: 'paper' | 'answerKey';
  language: LanguageMode;
  version?: OutputMode['version'];
  variant?: string;
}

const planned: PlannedSample[] = [];
const docs = new Map<Worksheet, { doc: string; title: string }>();

/** The document's plan file, written once; its own id and a title the start screen can find. */
function docOf(worksheet: Worksheet): { doc: string; title: string } {
  const known = docs.get(worksheet);
  if (known) return known;
  const n = docs.size + 1;
  const entry = { doc: `${n}.worksheet.json`, title: `Sample ${n}` };
  mkdirSync(PLAN, { recursive: true });
  writeFileSync(`${PLAN}/${entry.doc}`, JSON.stringify({ ...worksheet, id: `sample-${n}` }));
  docs.set(worksheet, entry);
  return entry;
}

function planPaper(worksheet: Worksheet, mode: OutputMode, out: string): void {
  planned.push({
    ...docOf(worksheet),
    out,
    what: 'paper',
    language: mode.language,
    version: mode.version,
    ...(mode.variant ? { variant: mode.variant } : {}),
  });
}

function planKey(worksheet: Worksheet, language: LanguageMode, out: string): void {
  planned.push({ ...docOf(worksheet), out, what: 'answerKey', language });
}

afterAll(() => {
  mkdirSync(PLAN, { recursive: true });
  writeFileSync(`${PLAN}/plan.json`, JSON.stringify(planned, null, 2));
  console.log(`${planned.length} files planned -> ${PLAN}/plan.json`);
});

it('emits sample documents', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = buildAcceptanceWorksheet();
  const modes: OutputMode[] = [
    { language: 'bilingual', version: 'student' },
    { language: 'bilingual', version: 'teacher' },
    { language: 'en', version: 'student' },
    { language: 'zh', version: 'teacher' },
  ];
  for (const mode of modes) {
    planPaper(worksheet, mode, `${OUT}/${docxFileName(worksheet, mode)}`);
  }
});

it('emits a paper whose MC options are justified', async () => {
  const dir = `${OUT}/option-justify`;
  mkdirSync(dir, { recursive: true });
  const worksheet = buildAcceptanceWorksheet();
  worksheet.questions = worksheet.questions.map((question) =>
    question.type === 'mcq' ? { ...question, optionAlign: 'justify' as const } : question,
  );
  for (const version of ['student', 'teacher'] as const) {
    const mode: OutputMode = { language: 'bilingual', version };
    planPaper(worksheet, mode, `${dir}/${docxFileName(worksheet, mode)}`);
  }
});

it('emits a paper whose body text is justified (Document setup)', async () => {
  const dir = `${OUT}/justify-text`;
  mkdirSync(dir, { recursive: true });
  const worksheet = { ...buildAcceptanceWorksheet(), justifyText: true };
  for (const version of ['student', 'teacher'] as const) {
    const mode: OutputMode = { language: 'bilingual', version };
    planPaper(worksheet, mode, `${dir}/${docxFileName(worksheet, mode)}`);
  }
});

it('emits a paper with versions A–C, and its answer key', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = { ...buildAcceptanceWorksheet(), versions: { count: 3, seed: 2026 } };
  for (const variant of ['A', 'B', 'C']) {
    for (const version of ['student', 'teacher'] as const) {
      const mode: OutputMode = { language: 'en', version, variant };
      planPaper(worksheet, mode, `${OUT}/${docxFileName(worksheet, mode)}`);
    }
  }
  for (const language of ['en', 'bilingual'] as const) {
    planKey(worksheet, language, `${OUT}/${answerKeyFileName(worksheet, language)}`);
  }
});

it('emits a structured paper with an HKEAA marking scheme, and its answer key', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = buildMarkSchemeWorksheet();
  // The worksheet itself, so a browser harness can open the same document.
  writeFileSync(`${OUT}/mark-scheme.worksheet.json`, JSON.stringify(worksheet));
  const modes: OutputMode[] = [
    { language: 'bilingual', version: 'teacher' },
    { language: 'en', version: 'student' },
  ];
  for (const mode of modes) {
    planPaper(worksheet, mode, `${OUT}/mark-scheme-${mode.language}-${mode.version}.docx`);
  }
  planKey(worksheet, 'bilingual', `${OUT}/mark-scheme-answer-key.docx`);
});

it('emits an essay with its own answer and marking scheme, and its answer key', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = createWorksheet();
  worksheet.title = bi('Minimum wage', '最低工資');
  worksheet.layout = [];
  const question: StructuredQuestion = {
    id: 'q-essay',
    type: 'structured',
    blocks: [createParagraphBlock(bi('Discuss whether Hong Kong should raise its minimum wage.', '討論香港應否提高最低工資。'))],
    parts: [],
    marks: 8,
    answer: bi('Answers are for reference only.', '答案僅供參考。'),
    scheme: {
      routes: [{ id: 'r', groups: [{ id: 'g', take: 2, each: 2, points: [
        { id: 'p1', text: bi('Higher income for low-paid workers', '低收入工人收入增加') },
        { id: 'p2', text: bi('Unemployment may rise', '失業可能上升') },
      ] }] }],
      levels: [{ id: 'l1', min: 1, max: 4, descriptor: bi('Relevant points, little analysis.', '論點相關，分析不足。') }],
      ec: { max: 2, descriptors: [{ id: 'e1', marks: 2, text: bi('Clear and logical.', '清晰而有條理。') }] },
    },
    answerSpace: 12,
  };
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  for (const version of ['teacher', 'student'] as const) {
    planPaper(worksheet, { language: 'bilingual', version }, `${OUT}/essay-${version}.docx`);
  }
  planKey(worksheet, 'bilingual', `${OUT}/essay-answer-key.docx`);
});

it('emits a long question with a model answer diagram, and its answer key', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = createWorksheet();
  worksheet.title = bi('Price ceilings', '價格上限');
  worksheet.layout = [];
  const question: StructuredQuestion = {
    id: 'q-answer-diagram',
    type: 'structured',
    blocks: [createParagraphBlock(bi('The government imposes a price ceiling on rice.', '政府對白米實施價格上限。'))],
    parts: [
      {
        id: 'part-a',
        blocks: [createParagraphBlock(bi('With the aid of a diagram, explain the shortage.', '試用圖解釋短缺。'))],
        marks: 4,
        answer: bi('Qd rises, Qs falls: a shortage Qd − Qs.', '需求量上升，供應量下降，出現短缺。'),
        answerDiagram: {
          ...createAnswerDiagram(),
          id: 'sample-answer-diagram',
          altText: bi('A price ceiling below equilibrium: a shortage', '低於均衡價格的價格上限：短缺'),
        },
        // A custom height, as a drag or the number field leaves it.
        answerGraph: { lines: 23, width: 'half' },
      },
    ],
  };
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  // The worksheet itself, so a browser harness can open the same document.
  writeFileSync(`${OUT}/answer-diagram.worksheet.json`, JSON.stringify(worksheet));
  // The browser's Export rasterises the real figure and the blank axes.
  for (const version of ['teacher', 'student'] as const) {
    planPaper(worksheet, { language: 'bilingual', version }, `${OUT}/answer-diagram-${version}.docx`);
  }
  planKey(worksheet, 'bilingual', `${OUT}/answer-diagram-answer-key.docx`);
});

it('emits an English-only paper filled by the translation pipeline', async () => {
  mkdirSync(OUT, { recursive: true });
  // The fixture's own Chinese is the canned model, so the whole pipeline runs offline:
  // plan → run (decode, validate, normalise, the real glossary) → writes → one apply → export.
  const original = buildAcceptanceWorksheet();
  // A subscript and a blank, so the sample shows both survive the wire.
  const structured = original.questions.find((q): q is StructuredQuestion => q.type === 'structured')!;
  const blank = { text: ' '.repeat(12), underline: true };
  structured.blocks.push(createParagraphBlock({
    en: [{ text: 'At E' }, { text: '0', vertAlign: 'subscript' }, { text: ', the price is $' }, blank, { text: '.' }],
    zh: [{ text: '在E' }, { text: '0', vertAlign: 'subscript' }, { text: '時，價格為$' }, blank, { text: '。' }],
  }));
  const english = oneSided(original, 'en');
  const mode: OutputMode = { language: 'zh', version: 'teacher' };
  const plan = planTranslation(english, { kind: 'paper' }, defaultTranslateOptions(mode, true));
  const deps = { client: referenceClient(original), preset: presetFor('gemini'), model: 'canned', glossary: await loadGlossary() };
  const outcome = await runTranslation(plan, deps, new AbortController().signal, () => {});
  const writes = writesFor(plan, outcome, new Set(plan.jobs.keys()), true);
  const { worksheet, report } = applyTranslationBatch(english, writes);
  console.log(`translated: ${report.applied} applied, ${report.skipped.length} skipped, ${plan.jobs.size} jobs`);
  expect(report.applied).toBeGreaterThan(0);
  expect(report.skipped).toEqual([]);
  for (const language of ['zh', 'bilingual'] as const) {
    planPaper(worksheet, { language, version: 'teacher' }, `${OUT}/translated-${language}.docx`);
  }
});
