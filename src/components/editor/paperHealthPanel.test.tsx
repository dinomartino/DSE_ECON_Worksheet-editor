import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createMcqQuestion, createParagraphBlock, createWorksheet, newId } from '@/model/factories';
import { bi } from '@/model/text';
import type { McqQuestion } from '@/model/types';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';
import { formatRefs, PaperHealthPanel } from './PaperHealthPanel';

function mcq(answer: number, stem: string): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi(stem, stem))];
  question.options = [0, 1, 2, 3].map((i) => ({ id: newId(), text: bi(`${stem} ${i}`, `${stem}${i}`) }));
  question.answerIndex = answer;
  return question;
}

describe('PaperHealthPanel', () => {
  it('reads an all-clear paper as one quiet line, hidden from print', () => {
    const worksheet = withFlow(
      createWorksheet(),
      Array.from({ length: 8 }, (_, i) => mcq(i % 4, `s${i}`)),
      { replaceLayout: true },
    );
    const markup = renderToStaticMarkup(<PaperHealthPanel worksheet={worksheet} />);
    expect(markup).toContain('8 questions · 8 marks · ~11 min estimate');
    expect(markup).toContain('nothing to check');
    expect(markup).toContain('data-print-hide');
    expect(markup).not.toContain('<ul');
  });

  it('lists findings with question numbers, the letter counts and section totals', () => {
    const markup = renderToStaticMarkup(
      <PaperHealthPanel worksheet={buildAcceptanceWorksheet()} language="bilingual" />,
    );
    expect(markup).toContain('7 questions · 24 marks');
    expect(markup).toContain('Section A 5 · Section B 19');
    expect(markup).toContain('5 questions in a row have answer C.<span class="text-ink-subtle"> Section A Q1–Q5');
    expect(markup).toContain('data-print-hide');
    // Chrome takes semantic tokens, never literal hex.
    expect(markup).not.toMatch(/#[0-9a-f]{3,6}/i);
  });
});

describe('formatRefs', () => {
  const ref = (number: number, prefix = '') => ({ questionId: `q${prefix}${number}`, number, label: `${prefix}Q${number}` });

  it('collapses consecutive numbers and states a section prefix once per run', () => {
    expect(formatRefs([ref(2), ref(5), ref(6), ref(7), ref(9)])).toBe('Q2, Q5–Q7, Q9');
    expect(formatRefs([ref(4, 'Section A '), ref(5, 'Section A '), ref(1, 'Section B ')])).toBe(
      'Section A Q4–Q5, Section B Q1',
    );
    expect(formatRefs([ref(1), ref(3), ref(5), ref(7)], 2)).toBe('Q1, Q3 +2 more');
  });
});
