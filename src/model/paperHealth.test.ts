import { describe, expect, it } from 'vitest';
import { createCoverPage } from './cover';
import {
  createMcqQuestion,
  createParagraphBlock,
  createStructuredQuestion,
  createWorksheet,
  newId,
} from './factories';
import { createSectionElement } from './flow';
import { worksheetMarks } from './marks';
import { checkPaper, countWarnings, parseDuration } from './paperHealth';
import { bi } from './text';
import type { McqQuestion, StructuredQuestion, Worksheet } from './types';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';

function mcq(answer: number, stem = 'Which is correct?'): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi(stem, '哪項正確？'))];
  question.options = ['one', 'two', 'three', 'four'].map((word) => ({
    id: newId(),
    text: bi(`Option ${word} ${stem}`, `選項${word}${stem}`),
  }));
  question.answerIndex = answer;
  return question;
}

function structured(marks: number | undefined, answer = true): StructuredQuestion {
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi('A market.', '一個市場。'))];
  question.parts = [
    {
      id: newId(),
      blocks: [createParagraphBlock(bi('Explain.', '解釋。'))],
      marks,
      answer: answer ? bi('Because.', '因為。') : undefined,
    },
  ];
  return question;
}

/** A classroom sheet of the given questions, no sections. */
function sheet(...questions: Array<McqQuestion | StructuredQuestion>): Worksheet {
  return withFlow(createWorksheet(), questions, { replaceLayout: true });
}

/** A balanced, run-free key: A B C D A B C D … */
const cycle = (n: number) => Array.from({ length: n }, (_, i) => mcq(i % 4, `Q${i}`));

const ids = (report: ReturnType<typeof checkPaper>) => report.findings.map((f) => f.id);

describe('checkPaper', () => {
  it('reports an empty paper as zeros and all clear', () => {
    const report = checkPaper(sheet());
    expect(report).toMatchObject({ questionCount: 0, totalMarks: 0, minutes: 0, severity: 'ok', findings: [] });
    expect(report.letters.keyed).toBe(0);
  });

  it('is all clear on a balanced, keyed, marked paper', () => {
    const report = checkPaper(sheet(...cycle(12)));
    expect(report.findings).toEqual([]);
    expect(report.severity).toBe('ok');
    expect(report.letters.counts).toEqual({ A: 3, B: 3, C: 3, D: 3 });
    expect(countWarnings(report)).toBe(0);
  });

  describe('letter balance', () => {
    it('flags a letter above 40% of the key, naming its questions', () => {
      // 12 items: B keyed 6 times (50%).
      const keys = [1, 1, 0, 1, 2, 1, 3, 1, 0, 1, 2, 3];
      const report = checkPaper(sheet(...keys.map((k, i) => mcq(k, `s${i}`))));
      const over = report.findings.find((f) => f.id === 'letterBalance' && f.message.startsWith('B'));
      expect(over?.severity).toBe('warn');
      expect(over?.questions?.map((q) => q.number)).toEqual([1, 2, 4, 6, 8, 10]);
    });

    it('flags a letter below 10% of the key', () => {
      // 12 items, D never used.
      const keys = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2];
      const report = checkPaper(sheet(...keys.map((k, i) => mcq(k, `s${i}`))));
      expect(report.findings.some((f) => f.id === 'letterBalance' && f.message.startsWith('D is the answer to only 0'))).toBe(true);
    });

    it('does not judge fewer than 8 keyed MCQs', () => {
      const keys = [1, 1, 1, 0, 1, 1, 2];
      const report = checkPaper(sheet(...keys.map((k, i) => mcq(k, `s${i}`))));
      expect(report.letters.judged).toBe(false);
      expect(ids(report)).not.toContain('letterBalance');
    });

    it('widens the fair share for five-option items', () => {
      const items = cycle(10).map((q, i) => {
        q.options.push({ id: newId(), text: bi(`Option five ${i}`, `選項五${i}`) });
        return q;
      });
      const report = checkPaper(sheet(...items));
      expect(report.letters.letters).toEqual(['A', 'B', 'C', 'D', 'E']);
      // E is never the key: 0 of 10 against a fair 20%.
      expect(report.findings.find((f) => f.id === 'letterBalance')?.message).toMatch(/^E .* about 20%/);
    });
  });

  describe('letter runs', () => {
    it('warns on 4 consecutive identical keys', () => {
      const keys = [0, 1, 2, 2, 2, 2, 3];
      const report = checkPaper(sheet(...keys.map((k, i) => mcq(k, `s${i}`))));
      const run = report.findings.find((f) => f.id === 'letterRun');
      expect(run?.message).toBe('4 questions in a row have answer C.');
      expect(run?.questions?.map((q) => q.number)).toEqual([3, 4, 5, 6]);
    });

    it('ignores a run of 3, and a run broken by another question', () => {
      const three = checkPaper(sheet(mcq(2, 'a'), mcq(2, 'b'), mcq(2, 'c'), mcq(0, 'd')));
      expect(ids(three)).not.toContain('letterRun');
      const broken = checkPaper(sheet(mcq(2, 'a'), mcq(2, 'b'), structured(4), mcq(2, 'c'), mcq(2, 'd')));
      expect(ids(broken)).not.toContain('letterRun');
    });
  });

  describe('missing keys and content', () => {
    it('warns on an MCQ whose key points at no option', () => {
      const unkeyed = mcq(0, 'x');
      unkeyed.answerIndex = -1;
      const report = checkPaper(sheet(mcq(1, 'y'), unkeyed));
      const finding = report.findings.find((f) => f.id === 'unkeyed');
      expect(finding?.severity).toBe('warn');
      expect(finding?.questions?.map((q) => q.label)).toEqual(['Q2']);
    });

    it('notes structured parts with no teacher answer, never as a warning', () => {
      const report = checkPaper(sheet(structured(4), structured(3, false)));
      const finding = report.findings.find((f) => f.id === 'unanswered');
      expect(finding?.severity).toBe('note');
      expect(finding?.questions?.map((q) => q.number)).toEqual([2]);
      expect(report.severity).toBe('note');
    });

    it('treats a part answer as covering its sub-parts', () => {
      const question = structured(undefined, true);
      question.parts[0].subParts = [
        { id: newId(), blocks: [createParagraphBlock(bi('i', 'i'))], marks: 2 },
        { id: newId(), blocks: [createParagraphBlock(bi('ii', 'ii'))], marks: 2 },
      ];
      expect(ids(checkPaper(sheet(question)))).not.toContain('unanswered');
      question.parts[0].answer = undefined;
      question.parts[0].subParts[0].answer = bi('Yes.', '是。');
      const finding = checkPaper(sheet(question)).findings.find((f) => f.id === 'unanswered');
      expect(finding?.questions).toHaveLength(1);
    });

    it('warns on empty questions, blank options and duplicate options', () => {
      const blank = mcq(0, 'b');
      blank.options[3].text = bi('', '');
      const duplicate = mcq(0, 'd');
      duplicate.options[1].text = { ...duplicate.options[0].text };
      const report = checkPaper(sheet(createMcqQuestion(), blank, duplicate, createStructuredQuestion()));
      const by = (id: string) => report.findings.find((f) => f.id === id)?.questions?.map((q) => q.number);
      expect(by('emptyQuestion')).toEqual([1, 4]);
      expect(by('blankOptions')).toEqual([2]);
      expect(by('duplicateOptions')).toEqual([3]);
      // Empty placeholders are not also reported as unkeyed, unmarked or unanswered.
      expect(by('unanswered')).toBeUndefined();
    });
  });

  describe('marks', () => {
    it('totals marks by questionMarks and per section, with restarted labels', () => {
      const worksheet = buildAcceptanceWorksheet();
      const report = checkPaper(worksheet);
      expect(report.totalMarks).toBe(worksheetMarks(worksheet));
      expect(report.sections.map((s) => [s.label, s.questions, s.marks])).toEqual([
        ['Section A', 5, 5],
        ['Section B', 2, 19],
      ]);
      // The fixture keys every MCQ to C — exactly the drift the run check exists for.
      expect(ids(report)).toEqual(['letterRun']);
      // Section B restarts at 1, so a bare "Q1" would be ambiguous.
      const first = worksheet.questions[5] as StructuredQuestion;
      first.parts[0].answer = undefined;
      const finding = checkPaper(worksheet).findings.find((f) => f.id === 'unanswered');
      expect(finding?.questions?.map((q) => q.label)).toEqual(['Section B Q1']);
    });

    it('notes only a question with no marks anywhere — an absent sub-part mark is not zero', () => {
      const shared = structured(5);
      // Sub-parts carry no marks: the part's 5 is the shared label, not a missing mark.
      shared.parts[0].subParts = [
        { id: newId(), blocks: [createParagraphBlock(bi('i', 'i'))], answer: bi('a', 'a') },
        { id: newId(), blocks: [createParagraphBlock(bi('ii', 'ii'))], answer: bi('b', 'b') },
      ];
      const report = checkPaper(sheet(shared, structured(undefined)));
      expect(report.totalMarks).toBe(5);
      const unmarked = report.findings.find((f) => f.id === 'unmarked');
      expect(unmarked?.severity).toBe('note');
      expect(unmarked?.questions?.map((q) => q.number)).toEqual([2]);
    });
  });

  describe('time estimate', () => {
    it('runs a Paper 1 at 45 MCQs an hour', () => {
      const worksheet = sheet(...cycle(45));
      worksheet.cover = createCoverPage({ paperStyle: 'mcq' });
      const report = checkPaper(worksheet);
      expect(report.shape).toBe('paper1');
      expect(report.minutes).toBe(60);
      expect(report.statedMinutes).toBe(60);
      expect(ids(report)).not.toContain('timeMismatch');
    });

    it('notes a big mismatch with the stated time', () => {
      const worksheet = sheet(...cycle(12));
      worksheet.cover = createCoverPage({ paperStyle: 'mcq' });
      const report = checkPaper(worksheet);
      expect(report.minutes).toBe(16);
      expect(report.findings.find((f) => f.id === 'timeMismatch')?.message).toBe(
        'The estimate (~16 min) is shorter than the 60 min allowed.',
      );
    });

    it('charges written marks at 1.2 min on a classroom sheet and 1.5 on a Paper 2 mock', () => {
      const worksheet = sheet(structured(20), structured(20));
      expect(checkPaper(worksheet).minutes).toBe(50);
      worksheet.pageFurniture = { frame: true };
      expect(checkPaper(worksheet).shape).toBe('lqMock');
      expect(checkPaper(worksheet).minutes).toBe(60);
    });

    it('reads durations in English and Chinese, never a clock time', () => {
      expect(parseDuration('8:30 am – 9:30 am (1 hour)')).toBe(60);
      expect(parseDuration('10:15 am – 12:45 pm (2 hours 30 minutes)')).toBe(150);
      expect(parseDuration('Time allowed: 45 mins')).toBe(45);
      expect(parseDuration('兩小時三十分完卷\n（上午十時十五分至下午十二時四十五分）')).toBe(150);
      expect(parseDuration('一小時完卷')).toBe(60);
      expect(parseDuration('（上午十時十五分至下午十二時四十五分）')).toBeUndefined();
      expect(parseDuration('時限：四十五分鐘')).toBe(45);
    });
  });

  describe('untranslated strings', () => {
    it('counts with the registry hook, and warns only for a Chinese or bilingual edition', () => {
      const question = mcq(0, 'x');
      question.options[0].text = { en: question.options[0].text.en, zh: [] };
      question.blocks = [createParagraphBlock({ en: [], zh: question.blocks[0].kind === 'paragraph' ? question.blocks[0].text.zh : [] })];
      const worksheet = sheet(question);
      expect(checkPaper(worksheet).untranslated).toBe(2);
      expect(ids(checkPaper(worksheet, { language: 'en' }))).not.toContain('untranslated');
      const bilingual = checkPaper(worksheet, { language: 'bilingual' });
      expect(bilingual.findings.find((f) => f.id === 'untranslated')?.message).toBe(
        '2 strings are written in one language only.',
      );
      expect(ids(checkPaper(worksheet, { language: 'zh' }))).toContain('untranslated');
    });
  });

  it('orders warnings before notes', () => {
    const unkeyed = mcq(0, 'x');
    unkeyed.answerIndex = 9;
    const report = checkPaper(sheet(structured(3, false), unkeyed));
    expect(report.findings.map((f) => f.severity)).toEqual(['warn', 'note']);
    expect(report.severity).toBe('warn');
  });

  it('labels questions without a section prefix when numbering never restarts', () => {
    const unkeyed = mcq(0, 'b');
    const worksheet = sheet(mcq(0, 'a'), unkeyed);
    worksheet.layout = [createSectionElement(bi('Section A', '甲部'), false)];
    worksheet.flow = [{ type: 'layout', id: worksheet.layout[0].id }, ...worksheet.flow];
    unkeyed.answerIndex = -1;
    const report = checkPaper(worksheet);
    expect(report.findings.find((f) => f.id === 'unkeyed')?.questions?.[0].label).toBe('Q2');
    expect(report.sections).toEqual([{ sectionId: worksheet.layout[0].id, label: 'Section A', questions: 2, marks: 2 }]);
  });
});
