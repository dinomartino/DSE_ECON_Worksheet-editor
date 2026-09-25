/**
 * Not a unit test: writes real .docx files to scratch so they can be opened in
 * Word by hand. Run with `npx vitest run scripts/emit-samples.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import {
  answerKeyFileName,
  docxFileName,
  exportAnswerKeyDocxBuffer,
  exportDocxBuffer,
} from '@/export/docx';
import { createAnswerDiagram, createParagraphBlock, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { buildAcceptanceWorksheet, TINY_PNG } from '@/test/fixtures';
import { buildMarkSchemeWorksheet } from '@/test/markSchemeFixture';
import type { OutputMode, StructuredQuestion } from '@/model/types';

const OUT = process.env.SAMPLE_DIR ?? '/tmp/econ-samples';

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
    const bytes = await exportDocxBuffer(worksheet, mode);
    const path = `${OUT}/${docxFileName(worksheet, mode)}`;
    writeFileSync(path, bytes);
    console.log(`${bytes.length} bytes -> ${path}`);
  }
});

it('emits a paper with versions A–C, and its answer key', async () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = { ...buildAcceptanceWorksheet(), versions: { count: 3, seed: 2026 } };
  for (const variant of ['A', 'B', 'C']) {
    for (const version of ['student', 'teacher'] as const) {
      const mode: OutputMode = { language: 'en', version, variant };
      const bytes = await exportDocxBuffer(worksheet, mode);
      const path = `${OUT}/${docxFileName(worksheet, mode)}`;
      writeFileSync(path, bytes);
      console.log(`${bytes.length} bytes -> ${path}`);
    }
  }
  for (const language of ['en', 'bilingual'] as const) {
    const bytes = await exportAnswerKeyDocxBuffer(worksheet, language);
    const path = `${OUT}/${answerKeyFileName(worksheet, language)}`;
    writeFileSync(path, bytes);
    console.log(`${bytes.length} bytes -> ${path}`);
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
    const bytes = await exportDocxBuffer(worksheet, mode);
    const path = `${OUT}/mark-scheme-${mode.language}-${mode.version}.docx`;
    writeFileSync(path, bytes);
    console.log(`${bytes.length} bytes -> ${path}`);
  }
  const bytes = await exportAnswerKeyDocxBuffer(worksheet, 'bilingual');
  const path = `${OUT}/mark-scheme-answer-key.docx`;
  writeFileSync(path, bytes);
  console.log(`${bytes.length} bytes -> ${path}`);
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
        answerDiagram: { ...createAnswerDiagram(), id: 'sample-answer-diagram' },
        answerGraph: { lines: 16, width: 'half' },
      },
    ],
  };
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  // Node has no canvas to rasterise with, so a stand-in PNG takes the diagram's slot;
  // the browser's Export rasterises the real figure into the same place.
  const images = new Map([['sample-answer-diagram', TINY_PNG]]);
  for (const version of ['teacher', 'student'] as const) {
    const bytes = await exportDocxBuffer(worksheet, { language: 'bilingual', version }, images);
    const path = `${OUT}/answer-diagram-${version}.docx`;
    writeFileSync(path, bytes);
    console.log(`${bytes.length} bytes -> ${path}`);
  }
  const bytes = await exportAnswerKeyDocxBuffer(worksheet, 'bilingual', [], images);
  const path = `${OUT}/answer-diagram-answer-key.docx`;
  writeFileSync(path, bytes);
  console.log(`${bytes.length} bytes -> ${path}`);
});
