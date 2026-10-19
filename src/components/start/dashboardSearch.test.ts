import { describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
import { choiceQuestion, docWith, partsQuestion, row } from '@/library/testKit';
import { createParagraphBlock, createPart } from '@/model/factories';
import { bi } from '@/model/text';
import type { StructuredQuestion } from '@/model/types';
import { summarize } from '@/storage/document';
import type { WorksheetSummary } from '@/storage';
import { cardMarks, DEFAULT_QUERY, questionHits, snippetOf, visibleSummaries } from './dashboard';

/** F5: the dashboard search finds words inside questions, through the 題庫's own rows. */

function paperOf(id: string, title: string, questions: Parameters<typeof docWith>[0]) {
  const worksheet = docWith(questions, { id, title: bi(title, '') });
  return { worksheet, summary: summarize(worksheet) };
}

const unit3 = paperOf('u3', 'Unit 3', [
  choiceQuestion('Which of the following is a free good?', '以下哪項是免費物品？'),
  choiceQuestion('The price elasticity of demand for rice is 0.4.', '白米的需求價格彈性為 0.4。'),
]);
const mock = paperOf('mock', 'Mock 2026 Paper 1', [choiceQuestion('A tax on petrol raises its price.', '對汽油徵稅令其價格上升。')]);
const summaries = [unit3.summary, mock.summary];
const rows = [...rowsOf(unit3.worksheet, unit3.summary), ...rowsOf(mock.worksheet, mock.summary)];

const shown = (search: string) =>
  visibleSummaries(summaries, { ...DEFAULT_QUERY, search }, undefined, questionHits(rows, search, 'en')).map(
    (summary) => summary.id,
  );

describe('questionHits', () => {
  it('finds a document by the text of a question, in English and in 中文', () => {
    expect(shown('elasticity')).toEqual(['u3']);
    expect(shown('ELASTICITY demand')).toEqual(['u3']);
    expect(shown('需求價格彈性')).toEqual(['u3']);
    expect(shown('汽油')).toEqual(['mock']);
    expect(shown('elasticity petrol')).toEqual([]);
  });

  it('still finds by name, with or without question rows', () => {
    expect(shown('mock 2026')).toEqual(['mock']);
    expect(visibleSummaries(summaries, { ...DEFAULT_QUERY, search: 'unit' }).map((s) => s.id)).toEqual(['u3']);
    expect(visibleSummaries(summaries, { ...DEFAULT_QUERY, search: 'petrol' })).toEqual([]);
    expect(questionHits(undefined, 'petrol').size).toBe(0);
    expect(questionHits(rows, '   ').size).toBe(0);
  });

  it('names the first matching question and marks the matched words as printed', () => {
    const hit = questionHits(rows, 'elasticity', 'en').get('u3')!;
    expect(hit.number).toBe(2);
    expect(hit.snippet).toEqual({ before: 'The price ', hit: 'elasticity', after: ' of demand for rice is 0.4.' });
    const zh = questionHits(rows, '彈性', 'zh-HK').get('u3')!;
    expect(zh.snippet?.hit).toBe('彈性');
    expect(zh.snippet?.before).toBe('白米的需求價格');
    // Words found together are marked together.
    expect(questionHits(rows, 'price elasticity', 'en').get('u3')?.snippet?.hit).toBe('price elasticity');
  });

  it('gives no snippet when the title alone explains the match', () => {
    expect(questionHits(rows, 'mock', 'en').get('mock')).toEqual({ number: 1 });
    // One word from the title, one from the question: the question's word is shown.
    expect(questionHits(rows, 'mock petrol', 'en').get('mock')?.snippet?.hit).toBe('petrol');
  });

  it('finds words outside the stem, showing them only where their case is known', () => {
    const question = partsQuestion('A market for rice.', '白米市場。') as StructuredQuestion;
    question.parts = [{ ...createPart(), blocks: [createParagraphBlock(bi('Explain the deadweight loss.', '解釋無謂損失。'))] }];
    const paper = paperOf('lq', 'LQ practice', [question]);
    const lqRows = rowsOf(paper.worksheet, paper.summary);
    // In a part: 中文 has no case, so the line is shown as printed.
    expect(questionHits(lqRows, '無謂損失', 'en').get('lq')?.snippet).toMatchObject({ hit: '無謂損失' });
    // English outside the stem was lower-cased by the index: the question's opening words instead, unmarked.
    expect(questionHits(lqRows, 'deadweight', 'en').get('lq')?.snippet).toEqual({
      before: '',
      hit: '',
      after: 'A market for rice.',
    });
  });

  it('cuts a long excerpt to a few words around the match', () => {
    const long = `${'Word '.repeat(40)}inflation ${'more '.repeat(40)}`.trim();
    const snippet = snippetOf(row({ excerpt: { en: long, zh: '' }, searchText: long.toLowerCase() }), ['inflation'], 'en')!;
    expect(snippet.before.startsWith('…')).toBe(true);
    expect(snippet.hit).toBe('inflation');
    expect(snippet.after.endsWith('…')).toBe(true);
    expect((snippet.before + snippet.hit + snippet.after).length).toBeLessThanOrEqual(92);
  });
});

describe('cardMarks (F4)', () => {
  const base: WorksheetSummary = { id: 'a', title: 'A', updatedAt: '2026-10-01T00:00:00Z' };

  it('shows a paper’s derived total, and nothing for a bank, a 0 or a row without one', () => {
    expect(cardMarks({ ...base, totalMarks: 48 })).toBe(48);
    expect(cardMarks({ ...base, totalMarks: 48, kind: 'bank' })).toBeUndefined();
    expect(cardMarks({ ...base, totalMarks: 0 })).toBeUndefined();
    expect(cardMarks(base)).toBeUndefined();
    // A damaged row: one odd field shows no figure, never a crash.
    expect(cardMarks({ ...base, totalMarks: '48' as unknown as number })).toBeUndefined();
    expect(cardMarks({ ...base, totalMarks: Number.NaN })).toBeUndefined();
  });

  it('is what summarize records: the paper’s marks as the cover totals them', () => {
    const question = partsQuestion('A market.') as StructuredQuestion;
    question.parts = [{ ...createPart(), marks: 6 }, { ...createPart(), marks: 4 }];
    const mcq = { ...choiceQuestion('Which?'), marks: 1 };
    expect(summarize(docWith([question, mcq])).totalMarks).toBe(11);
    expect(summarize(docWith([])).totalMarks).toBe(0);
  });
});
