import { describe, expect, it } from 'vitest';
import { withFlow } from '@/test/fixtures';
import { collectAnswerKey } from '@/render/answerKey';
import { renderWorksheet } from '@/render/worksheet';
import { createMcqQuestion, createParagraphBlock, createStructuredQuestion, createWorksheet, newId } from './factories';
import { createSectionElement } from './flow';
import { sectionMarks, sectionMarksById, worksheetMarks } from './marks';
import { migrate, serializeWorksheet } from './migrations';
import { checkPaper } from './paperHealth';
import { summarizePaper, targetMisses } from './paperSummary';
import { bi, plain } from './text';
import type { LayoutElement, McqQuestion, StructuredQuestion, Worksheet } from './types';

type Section = Extract<LayoutElement, { kind: 'section' }>;

function mcq(): McqQuestion {
  const question = createMcqQuestion();
  question.blocks = [createParagraphBlock(bi('Which?', '哪項？'))];
  question.options = [0, 1, 2, 3].map((i) => ({ id: newId(), text: bi(`o${i}`, `選${i}`) }));
  question.answerIndex = 0;
  return question;
}

function lq(marks: number): StructuredQuestion {
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(bi('A market.', '一個市場。'))];
  question.parts = [{ id: newId(), blocks: [createParagraphBlock(bi('Explain.', '解釋。'))], marks }];
  return question;
}

/** Section A: 4 MCQs. Section B "answer any ONE": LQs of 10 and 12 marks. */
function paper(answerCount?: number): { worksheet: Worksheet; a: Section; b: Section } {
  const a = { ...createSectionElement(bi('Section A: MC', '甲部：多項選擇題')), showMarks: true };
  const b: Section = {
    ...createSectionElement(bi('Section B: Essays', '乙部：論述題')),
    showMarks: true,
    ...(answerCount !== undefined ? { answerCount } : {}),
  };
  const worksheet = withFlow(createWorksheet(), [a, mcq(), mcq(), mcq(), mcq(), b, lq(10), lq(12)], {
    replaceLayout: true,
  });
  return { worksheet, a, b };
}

describe('optional sections ("answer any ONE")', () => {
  it('count the best n questions in every total', () => {
    const { worksheet, b } = paper(1);
    expect(sectionMarks(worksheet, b.id)).toBe(12);
    expect(sectionMarksById(worksheet).get(b.id)).toBe(12);
    expect(worksheetMarks(worksheet)).toBe(16);
    expect(summarizePaper(worksheet).marks.actual).toBe(16);
    const report = checkPaper(worksheet);
    expect(report.totalMarks).toBe(16);
    expect(report.sections.find((s) => s.sectionId === b.id)).toMatchObject({ questions: 2, marks: 12, answerCount: 1 });
  });

  it('time only the n longest questions', () => {
    // 4 MCQs at 60/45 min + the 12-mark LQ at 1.2 min a mark = 5.33 + 14.4 → 20.
    expect(summarizePaper(paper(1).worksheet).minutes.actual).toBe(20);
    // Both LQs: 5.33 + 26.4 → 32 → 30.
    expect(summarizePaper(paper().worksheet).minutes.actual).toBe(30);
  });

  it('keep counting every question when the count is absent, all, or malformed', () => {
    for (const count of [undefined, 2, 3, 0, -1, 1.5]) {
      const { worksheet, b } = paper(count);
      expect(worksheetMarks(worksheet), String(count)).toBe(26);
      expect(sectionMarks(worksheet, b.id), String(count)).toBe(22);
    }
  });

  it('print the counted marks in the section heading and the answer key', () => {
    const { worksheet, b } = paper(1);
    const heading = renderWorksheet(worksheet, { language: 'en', version: 'student' }).items.find(
      (item) => item.type === 'layout' && item.layout.elementId === b.id,
    );
    const printed = JSON.stringify(heading?.type === 'layout' ? heading.layout.nodes : []);
    expect(printed).toContain('12 marks');
    expect(printed).not.toContain('22 marks');
    const key = collectAnswerKey(worksheet);
    expect(key.total).toBe(16);
    expect(key.groups.map((group) => group.total)).toEqual([0, 4, 12]);
  });

  it('measure a section against its own marks target', () => {
    const { worksheet, a, b } = paper(1);
    a.targetMarks = 4;
    b.targetMarks = 10;
    const summary = summarizePaper(worksheet);
    expect(summary.sections).toEqual([
      { sectionId: a.id, label: { en: 'Section A', zh: '甲部' }, marks: { actual: 4, target: 4, status: 'met' } },
      { sectionId: b.id, label: { en: 'Section B', zh: '乙部' }, marks: { actual: 12, target: 10, status: 'over' } },
    ]);
    expect(targetMisses(summary).over).toEqual(['Section B 12/10 marks']);
    expect(targetMisses(summary, 'zh').over).toEqual(['乙部 12/10 分']);
    const report = checkPaper(worksheet);
    expect(report.findings.find((f) => f.id === 'overTarget')?.message).toBe('Over target: Section B 12/10 marks.');
    expect(report.sections.find((s) => s.sectionId === b.id)?.targetMarks).toBe(10);
  });

  it('survive a save and reload', () => {
    const { worksheet, b } = paper(1);
    b.targetMarks = 12;
    const reloaded = migrate(JSON.parse(JSON.stringify(serializeWorksheet(worksheet))));
    const section = reloaded.layout.find((element) => element.id === b.id) as Section;
    expect(section).toMatchObject({ answerCount: 1, targetMarks: 12 });
    expect(worksheetMarks(reloaded)).toBe(16);
    expect(plain(section.text.en)).toBe('Section B: Essays');
  });
});
