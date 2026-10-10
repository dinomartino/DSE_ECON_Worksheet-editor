/**
 * The import film's invented paper (scripts/demo/mockPaper.mjs) imports clean: every
 * question found, every MC answer and written scheme set from its answers file, the
 * header, footer and title block read, and nothing to check anywhere in the review.
 */
import { describe, expect, it } from 'vitest';
import { planChrome } from '@/import/chromePlan';
import type { McqQuestion, Question, StructuredQuestion } from '@/model/types';
import { MOCK, answersDocx, fullMarks, paperDocx } from '../../../scripts/demo/mockPaper.mjs';
import { readPaperFile, importedMarks, importLanguageMode } from './fileImport';
import { NO_LINKS, answerSource, answerSummary, examineFile, linkedAnswers, paperRead, paperReview, paperState } from './importBatch';
import { checkPlaces } from './pasteSession';
import { materialize } from './previewDoc';

const bytes = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

async function review() {
  const files = [
    examineFile('f0', MOCK.files.paper, await readPaperFile(MOCK.files.paper, bytes(await paperDocx()))),
    examineFile('f1', MOCK.files.answers, await readPaperFile(MOCK.files.answers, bytes(await answersDocx()))),
  ];
  const [paper] = files;
  const source = answerSource(paper, linkedAnswers(files, NO_LINKS)[paper.id], files);
  const result = paperReview(paperRead(paper), paperState('auto'), source?.sheet);
  return { files, paper, source, result };
}

describe('the import film’s mock paper', () => {
  it('reads as a paper and an answers file that link on their own', async () => {
    const { files, source } = await review();
    expect(files.map((f) => f.guess.role)).toEqual(['questions', 'answers']);
    expect(source?.name).toBe(MOCK.files.answers);
  });

  it('finds every question, sets every answer and scheme, and leaves nothing to check', async () => {
    const { result, source } = await review();
    const built = result.batch.builds.map(materialize) as Question[];
    const mc = built.filter((q): q is McqQuestion => q.type === 'mcq');
    const written = built.filter((q): q is StructuredQuestion => q.type === 'structured');
    expect(mc).toHaveLength(MOCK.mcqs.length);
    expect(written).toHaveLength(MOCK.written.length);
    expect(mc.map((q) => 'ABCD'[q.answerIndex ?? -1])).toEqual(MOCK.mcqs.map((q) => q[3]));
    expect(written.map((q) => q.parts.length)).toEqual(MOCK.written.map((q) => q.parts.length));
    const places = checkPlaces(result.analysis);
    expect(places.check).toEqual([]);
    expect(places.noAnswer).toEqual([]);
    const summary = answerSummary(result, source!.sheet);
    expect(summary).toMatchObject({ mc: MOCK.mcqs.length, mcSet: MOCK.mcqs.length, rows: [] });
    expect(summary.schemes).toBe(MOCK.written.reduce((n, q) => n + q.parts.length, 0));
    expect(source!.sheet.unknown).toEqual([]);
    expect(importedMarks(result.batch)).toBe(fullMarks());
  });

  it('reads the header, footer and title block with nothing left to retype', async () => {
    const { paper, result } = await review();
    const chrome = paper.outcome.kind === 'ok' ? paper.outcome.chrome : undefined;
    expect(chrome?.header?.rows.length).toBeGreaterThan(0);
    expect(chrome?.firstPageHeader?.rows.length).toBeGreaterThan(0);
    expect(chrome?.footer?.rows.length).toBeGreaterThan(0);
    expect(chrome?.masthead?.length).toBeGreaterThan(0);
    expect(chrome?.unsupported).toEqual([]);
    const plan = planChrome(chrome!, { documentType: 'classroom', language: importLanguageMode(result.analysis, 'en'), totalMarks: importedMarks(result.batch) });
    expect(plan.leftovers).toEqual([]);
  });
});
