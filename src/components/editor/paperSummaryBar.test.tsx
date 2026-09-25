import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet, newId } from '@/model/factories';
import { bi } from '@/model/text';
import type { Question, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { PaperSummaryBar } from './PaperSummaryBar';

function paper(mcqs: number, written: number[]): Worksheet {
  const questions: Question[] = Array.from({ length: mcqs }, () => {
    const q = createMcqQuestion();
    q.blocks = [createParagraphBlock(bi('Which?', '哪項？'))];
    q.options = [0, 1, 2, 3].map((i) => ({ id: newId(), text: bi(`o${i}`, `選${i}`) }));
    q.answerIndex = 0;
    return q;
  });
  for (const marks of written) {
    const q = createStructuredQuestion();
    q.blocks = [createParagraphBlock(bi('A market.', '市場。'))];
    q.parts = [{ id: newId(), blocks: [createParagraphBlock(bi('Explain.', '解釋。'))], marks }];
    questions.push(q);
  }
  return withFlow(createWorksheet(), questions, { replaceLayout: true });
}

/** Visible text only: tags stripped, entities as typed. */
const visible = (markup: string) => markup.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');

describe('PaperSummaryBar', () => {
  it('reads counts, marks, minutes and pages in English, hidden from print', () => {
    const markup = renderToStaticMarkup(
      <PaperSummaryBar worksheet={paper(38, [8, 6])} language="en" pages={3} onOpen={() => {}} />,
    );
    expect(visible(markup)).toBe('38 MCQ · 2 structured · 52 marks · ~65 min · 3 pages');
    expect(markup).toContain('data-print-hide');
    expect(markup).toContain('<button');
    expect(markup).not.toContain('data-status');
    // Chrome takes semantic tokens, never literal hex.
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  it('reads in Chinese in zh mode', () => {
    const markup = renderToStaticMarkup(<PaperSummaryBar worksheet={paper(38, [8, 6])} language="zh" pages={3} />);
    expect(visible(markup)).toBe('選擇題 38 · 結構題 2 · 52 分 · 約 65 分鐘 · 3 頁');
    // Read-only: a label, not a button.
    expect(markup).not.toContain('<button');
  });

  it('tints a measure over its target in the warning tone, and one met in the ok tone', () => {
    const worksheet = paper(38, [8, 6]);
    worksheet.target = { marks: 50, minutes: 65, counts: { mcq: 45 } };
    const markup = renderToStaticMarkup(<PaperSummaryBar worksheet={worksheet} language="en" />);
    expect(visible(markup)).toBe('38/45 MCQ · 2 structured · 52/50 marks · ~65/65 min');
    expect(markup).toContain('<span data-status="under">38/45 MCQ</span>');
    expect(markup).toContain('<span data-status="over" class="text-warn-ink">52/50 marks</span>');
    expect(markup).toContain('<span data-status="met" class="text-ok">~65/65 min</span>');
    expect(markup).toContain('Over target: 52/50 marks');
    expect(markup).toContain('Under target: 38/45 MCQ');
  });

  it('shows a paper under every target without the warning tone', () => {
    const worksheet = paper(10, []);
    worksheet.target = { marks: 45, counts: { mcq: 45 } };
    const markup = renderToStaticMarkup(<PaperSummaryBar worksheet={worksheet} language="zh" />);
    expect(visible(markup)).toBe('選擇題 10/45 · 10/45 分 · 約 13 分鐘');
    expect(markup).not.toContain('text-warn-ink');
  });
});
