import { describe, expect, it } from 'vitest';
import { listQuestionTypes } from '@/registry';
import { withFlow } from '@/test/fixtures';
import {
  createMcqQuestion,
  createParagraphBlock,
  createStructuredQuestion,
  createWorksheet,
  newId,
} from './factories';
import { summarizePaper, summaryParts, targetMisses, targetOf } from './paperSummary';
import { bi } from './text';
import type { McqQuestion, StructuredQuestion, Worksheet } from './types';

function mcq(): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi('Which?', '哪項？'))];
  question.options = [0, 1, 2, 3].map((i) => ({ id: newId(), text: bi(`o${i}`, `選${i}`) }));
  question.answerIndex = 0;
  return question;
}

function structured(marks: number): StructuredQuestion {
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi('A market.', '一個市場。'))];
  question.parts = [{ id: newId(), blocks: [createParagraphBlock(bi('Explain.', '解釋。'))], marks }];
  return question;
}

function paper(mcqs: number, ...written: number[]): Worksheet {
  const questions = [...Array.from({ length: mcqs }, mcq), ...written.map(structured)];
  return withFlow(createWorksheet(), questions, { replaceLayout: true });
}

const text = (worksheet: Worksheet, language: 'en' | 'zh' | 'bilingual' = 'en', pages?: number) =>
  summaryParts(summarizePaper(worksheet), language, pages)
    .map((part) => part.text)
    .join(' · ');

describe('summarizePaper', () => {
  it('asks every registered type for a short label and a pace', () => {
    for (const definition of listQuestionTypes()) {
      expect(definition.summary?.label.en, definition.id).toBeTruthy();
      expect(definition.summary?.label.zh, definition.id).toBeTruthy();
    }
  });

  it('counts per type, sums marks and times MCQs per item and written work per mark', () => {
    // 38 MCQs at 60/45 min + 14 marks at 1.2 = 50.7 + 16.8 → 67.5 → 65.
    const summary = summarizePaper(paper(38, 8, 6));
    expect(summary.counts.map((c) => [c.typeId, c.actual])).toEqual([
      ['mcq', 38],
      ['structured', 2],
    ]);
    expect(summary.marks).toEqual({ actual: 52 });
    expect(summary.minutes).toEqual({ actual: 65 });
  });

  it('rounds to the minute under half an hour', () => {
    expect(summarizePaper(paper(12)).minutes.actual).toBe(16);
    expect(summarizePaper(paper(0, 5)).minutes.actual).toBe(6);
  });

  it('leaves out an empty question\'s time but still counts it', () => {
    const worksheet = paper(1);
    worksheet.questions.push(createMcqQuestion());
    const summary = summarizePaper(worksheet);
    expect(summary.counts[0].actual).toBe(2);
    expect(summary.minutes.actual).toBe(1);
  });

  it('measures against a target, listing a targeted type the paper has none of', () => {
    const worksheet = paper(38, 8, 6);
    worksheet.target = { marks: 50, minutes: 65, counts: { mcq: 45, structured: 2 } };
    const summary = summarizePaper(worksheet);
    expect(summary.counts.map((c) => c.status)).toEqual(['under', 'met']);
    expect(summary.marks).toEqual({ actual: 52, target: 50, status: 'over' });
    expect(summary.minutes.status).toBe('met');

    const mcqOnly = paper(3);
    mcqOnly.target = { counts: { structured: 4 } };
    expect(text(mcqOnly)).toBe('3 MCQ · 0/4 structured · 3 marks · ~4 min');
  });

  it('is the same for every shuffled version', () => {
    const worksheet = paper(10, 4);
    const versioned = { ...worksheet, versions: { count: 3, seed: 7 } };
    expect(summarizePaper(versioned)).toEqual(summarizePaper(worksheet));
  });
});

describe('targetOf', () => {
  it('drops unusable values and reports no target when nothing is left', () => {
    expect(targetOf({})).toBeUndefined();
    expect(targetOf({ target: {} })).toBeUndefined();
    expect(targetOf({ target: { marks: 0, minutes: -5, counts: { mcq: 0 } } })).toBeUndefined();
    const raw = { marks: '50', minutes: 60.4, counts: { mcq: 45, x: Number.NaN } };
    expect(targetOf({ target: raw as never })).toEqual({ minutes: 60, counts: { mcq: 45 } });
  });
});

describe('summaryParts', () => {
  it('reads in English, singular where it must, with the page count when known', () => {
    expect(text(paper(38, 8, 6), 'en', 3)).toBe('38 MCQ · 2 structured · 52 marks · ~65 min · 3 pages');
    expect(text(paper(1), 'bilingual', 1)).toBe('1 MCQ · 1 mark · ~1 min · 1 page');
    expect(text(paper(0))).toBe('0 marks');
  });

  it('reads in Chinese in zh mode', () => {
    const worksheet = paper(38, 8, 6);
    worksheet.target = { marks: 50, counts: { mcq: 45 } };
    expect(text(worksheet, 'zh', 3)).toBe('選擇題 38/45 · 結構題 2 · 52/50 分 · 約 65 分鐘 · 3 頁');
  });

  it('shows progress against a target, and the misses the paper check reports', () => {
    const worksheet = paper(38, 8, 6);
    worksheet.target = { marks: 50, minutes: 60, counts: { mcq: 45 } };
    expect(text(worksheet)).toBe('38/45 MCQ · 2 structured · 52/50 marks · ~65/60 min');
    expect(targetMisses(summarizePaper(worksheet))).toEqual({
      over: ['52/50 marks', '~65/60 min'],
      under: ['38/45 MCQ'],
    });
  });
});
