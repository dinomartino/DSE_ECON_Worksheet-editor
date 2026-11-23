import { beforeEach, describe, expect, it } from 'vitest';
import { CHECKED_PATCH } from '@/components/editor/AiMadeNote';
import { contentKey } from '@/library/contentKey';
import { copyQuestion } from '@/model/lineage';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { McqQuestion } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { useWorksheetStore } from '@/store/worksheetStore';
import { INVENTED } from './fixtures';
import { materialize } from './deliver';
import { studioBuilds } from './insert';
import type { StudioDraft } from './types';

const [A] = INVENTED;
const store = () => useWorksheetStore.getState();

const draft: StudioDraft = {
  id: 'd1',
  draft: { kind: 'mcq', stem: A.stem, statements: A.statements, options: A.options, answerIndex: A.answer, explanation: A.explanation },
  angle: A.angle,
  status: 'ok',
  checks: [],
  attempt: 1,
};

/** The label's whole life: set when a draft is added, kept by every copy, cleared by Checked, never printed. */
describe('the AI-made label', () => {
  beforeEach(() => {
    store().replaceWorksheet(createWorksheetFrom({ documentType: 'paper1' }));
    store().setMode({ language: 'bilingual', version: 'student' });
  });

  function addDraft(): McqQuestion {
    const report = store().insertQuestionBatch(studioBuilds([draft], 'C.ped'), { worksheetId: store().worksheet.id });
    if (!report.ok) throw new Error(report.refused);
    return store().worksheet.questions.find((q) => q.id === report.questionIds[0]) as McqQuestion;
  }

  it('is on a question the studio added, and Checked takes it off as one undo step', () => {
    const made = addDraft();
    expect(made.aiMade).toBe(true);
    store().updateQuestion(made.id, CHECKED_PATCH);
    const checked = store().worksheet.questions.find((q) => q.id === made.id) as McqQuestion;
    expect(checked.aiMade).toBeUndefined();
    // What is saved has no trace of it.
    expect(JSON.stringify(checked)).not.toContain('aiMade');
    store().undo();
    expect((store().worksheet.questions.find((q) => q.id === made.id) as McqQuestion).aiMade).toBe(true);
  });

  it('is not a new version: the same words are the same question before and after Checked', () => {
    const made = addDraft();
    const before = contentKey(made);
    store().updateQuestion(made.id, CHECKED_PATCH);
    expect(contentKey(store().worksheet.questions.find((q) => q.id === made.id)!)).toBe(before);
  });

  it('travels with a copy (the bank, another paper), so an unchecked question stays marked', () => {
    const made = addDraft();
    expect(copyQuestion(made, 'other-doc').aiMade).toBe(true);
    const [build] = studioBuilds([draft], 'C.ped');
    expect(materialize(build)?.aiMade).toBe(true);
  });

  it('is on screen only: the paper renders the same with it and without it', () => {
    const made = addDraft();
    const mode = { language: 'bilingual', version: 'student' } as const;
    const withLabel = JSON.stringify(renderWorksheet(store().worksheet, mode));
    store().updateQuestion(made.id, CHECKED_PATCH);
    const without = JSON.stringify(renderWorksheet(store().worksheet, mode));
    // Same pages, same words, same numbering: the label reaches no backend.
    expect(withLabel).toBe(without);
    expect(withLabel).not.toContain('AI-made');
  });
});
