/**
 * Not a unit test: emits the cover-verification fixtures for the visual harness
 * (`scripts/cover-verify.mjs`). One document per paper style, written twice — as the
 * exported `.docx` (the synchronous buffer path; a cover holds no diagrams, so the
 * image map is empty) and as the `.worksheet.json` the harness seeds into the
 * browser's localStorage. Both faces of the same worksheet object, so the three
 * backends are measured against one source document.
 *
 * Run with `COVER_DIR=... npx vitest run scripts/cover-fixtures.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { exportDocxBuffer } from '@/export/docx';
import { createCoverPage } from '@/model/cover';
import { createMcqQuestion, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import { stringifyWorksheet } from '@/storage';
import type { LanguageMode } from '@/model/types';

const OUT = process.env.COVER_DIR ?? '/tmp/cover-verify';
// `cover-verify.mjs --language=bilingual` exports the bilingual cover instead.
const LANGUAGE = (process.env.COVER_LANGUAGE ?? 'en') as LanguageMode;
/*
 * `cover-verify.mjs --examiner-grid=short|long` turns on the cover's marks grid and gives
 * the body enough questions to fill it: a short paper fits one band, a long one wraps.
 */
const GRID = process.env.COVER_EXAMINER_GRID as 'short' | 'long' | undefined;
const GRID_QUESTIONS = { short: { mcq: 8, writeIn: 5 }, long: { mcq: 45, writeIn: 16 } } as const;

it('emits cover fixtures', async () => {
  mkdirSync(OUT, { recursive: true });
  const styles = [
    ['p1', 'mcq'],
    ['p2', 'writeIn'],
  ] as const;
  for (const [name, paperStyle] of styles) {
    const worksheet = createWorksheet();
    worksheet.title = bi(`Cover harness ${name.toUpperCase()}`, '');
    worksheet.cover = createCoverPage({ paperStyle });
    // A question after the cover, so the body section (and the continuous sectPr
    // boundary between them) is exercised rather than exporting a cover-only file.
    worksheet.questions.push(paperStyle === 'mcq' ? createMcqQuestion() : createStructuredQuestion());
    if (GRID) {
      worksheet.cover.examinerGrid = true;
      for (let index = 1; index < GRID_QUESTIONS[GRID][paperStyle]; index += 1) {
        const question = paperStyle === 'mcq' ? createMcqQuestion() : createStructuredQuestion();
        // Varied marks on the booklet, so a column that printed the wrong question's
        // marks would show it.
        if (question.type === 'structured') question.parts[0].marks = 2 + (index % 9);
        worksheet.questions.push(question);
      }
    }
    const bytes = await exportDocxBuffer(worksheet, { language: LANGUAGE, version: 'student' });
    writeFileSync(`${OUT}/cover-${name}.docx`, bytes);
    writeFileSync(`${OUT}/cover-${name}.worksheet.json`, stringifyWorksheet(worksheet));
    console.log(`${bytes.length} bytes -> ${OUT}/cover-${name}.docx`);
  }
});
