import { beforeEach, describe, expect, it } from 'vitest';
import { createStructuredQuestion, createWorksheet } from '@/model/factories';
import { useWorksheetStore } from '@/store/worksheetStore';
import { withFlow } from '@/test/fixtures';
import { openAi, useAiMenu } from './menuStore';

describe('useAiMenu', () => {
  beforeEach(() => {
    useAiMenu.getState().close();
    const q = createStructuredQuestion();
    useWorksheetStore.getState().replaceWorksheet(withFlow(createWorksheet(), [q]));
  });

  it('opens on the editor selection when no scope is given', () => {
    openAi();
    expect(useAiMenu.getState().open).toEqual({ scope: { kind: 'paper' }, scopeLabel: 'Whole paper' });
    const id = useWorksheetStore.getState().worksheet.questions[0].id;
    useWorksheetStore.getState().select(id);
    openAi({ anchor: { x: 4, y: 5 }, preselect: 'check.terms' });
    expect(useAiMenu.getState().open).toEqual({
      scope: { kind: 'questions', ids: [id] },
      scopeLabel: 'Question 1',
      anchor: { x: 4, y: 5 },
      preselect: 'check.terms',
    });
  });

  it('keeps a given scope and label, and closes', () => {
    openAi({ scope: { kind: 'paper' }, scopeLabel: 'Everything' });
    expect(useAiMenu.getState().open?.scopeLabel).toBe('Everything');
    useAiMenu.getState().close();
    expect(useAiMenu.getState().open).toBeNull();
  });
});
