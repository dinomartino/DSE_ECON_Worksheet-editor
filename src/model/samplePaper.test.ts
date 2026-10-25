import { describe, expect, it } from 'vitest';
import '@/registry';
import { documentShape } from './documentShape';
import { questionMarks } from './marks';
import { migrate, serializeWorksheet } from './migrations';
import { createSamplePaper, SAMPLE_PAPER_NAME } from './samplePaper';
import { collectTexts } from './textWalk';
import { isBiTextEmpty, plain } from './text';
import { resolveFlow } from './flow';
import type { McqQuestion, StructuredQuestion } from './types';
import { renderAnswerKey } from '@/render/answerKey';
import { renderWorksheet } from '@/render/worksheet';

describe('the sample paper (k-0201)', () => {
  const paper = createSamplePaper();

  it('is a Classroom worksheet: 3 MC in Section A, then one structured question in Section B', () => {
    expect(documentShape(paper)).toBe('classroom');
    const flow = resolveFlow(paper).map((item) => (item.type === 'question' ? item.question.type : item.element.kind));
    expect(flow).toEqual(['section', 'mcq', 'mcq', 'mcq', 'section', 'structured']);
  });

  it('has a table and a printed diagram, a model answer diagram, marks and a scheme of mark points', () => {
    const lq = paper.questions[3] as StructuredQuestion;
    expect(lq.blocks.some((block) => block.kind === 'table')).toBe(true);
    expect(lq.parts.some((part) => part.blocks.some((block) => block.kind === 'diagram'))).toBe(true);
    expect(lq.parts.some((part) => part.answerDiagram?.kind === 'diagram')).toBe(true);
    for (const part of lq.parts) {
      expect(part.marks).toBeGreaterThan(0);
      // Mark points only: a model answer beside them repeated the same facts.
      expect(part.answer).toBeUndefined();
      const points = part.scheme!.routes[0].groups[0].points;
      // The scheme's points add up to the part's marks.
      expect(points.reduce((sum, point) => sum + (point.marks ?? 0), 0)).toBe(part.marks);
    }
    const total = paper.questions.reduce((sum, question) => sum + questionMarks(question), 0);
    expect(total).toBe(11);
    // Every MC has its key and an explanation; the second is a (1)(2)(3) combination item.
    const mc = paper.questions.slice(0, 3) as McqQuestion[];
    expect(mc.map((q) => q.answerIndex)).toEqual([1, 1, 3]);
    expect(mc.every((q) => !isBiTextEmpty(q.explanation) && q.options.length === 4)).toBe(true);
    expect(mc[1].statements).toHaveLength(3);
  });

  it('is written in both languages: no text has one side only', () => {
    const oneSided = collectTexts(paper).filter(
      (slot) => slot.text.en.length + slot.text.zh.length > 0 && (isBiTextEmpty({ en: slot.text.en, zh: [] }) || isBiTextEmpty({ en: [], zh: slot.text.zh })),
    );
    expect(oneSided.map((slot) => `${slot.path}: ${plain(slot.text.en)} | ${plain(slot.text.zh)}`)).toEqual([]);
  });

  it('stays out of the 題庫, and is named for the list in the interface language', () => {
    expect(paper.bankHidden).toBe(true);
    expect(paper.name).toBe(SAMPLE_PAPER_NAME.en);
    expect(createSamplePaper('zh').name).toBe(SAMPLE_PAPER_NAME.zh);
  });

  it('is a fresh copy each time: no id is shared with another opening', () => {
    const ids = (worksheet: typeof paper) => JSON.stringify(worksheet).match(/"id":"[^"]+"/g) ?? [];
    const second = new Set(ids(createSamplePaper()));
    expect(ids(paper).filter((id) => second.has(id))).toEqual([]);
  });

  it('saves and reopens unchanged, and renders in every language and version', () => {
    const reopened = migrate(JSON.parse(JSON.stringify(serializeWorksheet(paper))));
    expect(serializeWorksheet(reopened)).toEqual(serializeWorksheet(paper));
    for (const language of ['en', 'zh', 'bilingual'] as const) {
      for (const version of ['student', 'teacher'] as const) {
        expect(() => renderWorksheet(paper, { language, version })).not.toThrow();
      }
      expect(renderAnswerKey(paper, language).length).toBeGreaterThan(0);
    }
  });
});
