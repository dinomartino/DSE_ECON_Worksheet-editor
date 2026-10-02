import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createWorksheet } from '@/model/factories';
import { withAnswerKeyPreset, withAnswerKeySetting } from '@/model/answerKeyLayout';

// A server render reads zustand's initial state; read the live one so setState shows.
vi.mock('@/store/worksheetStore', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/store/worksheetStore')>();
  const store = real.useWorksheetStore;
  const live = <T,>(select: (s: ReturnType<typeof store.getState>) => T): T => select(store.getState());
  return { ...real, useWorksheetStore: Object.assign(live, store) };
});

const { useWorksheetStore } = await import('@/store/worksheetStore');
const { AnswerKeyLayoutPanel } = await import('./AnswerKeyLayoutPanel');

const initial = useWorksheetStore.getState();
afterEach(() => useWorksheetStore.setState(initial, true));

describe('the Layout tab', () => {
  it('shows every built style as a card, the section layouts and the switches', () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    const markup = renderToStaticMarkup(<AnswerKeyLayoutPanel />);
    expect(markup).toContain('Classic');
    expect(markup).toContain('HKEAA style');
    expect(markup).toMatch(/aria-checked="true"[^>]*>[\s\S]*?Classic/);
    for (const word of ['Grid', 'Table', 'List', 'Marks column', 'Question stems', 'The whole paper', 'Reset to preset']) {
      expect(markup).toContain(word);
    }
    // Nothing changed from the preset: reset is off.
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Reset to preset</);
  });

  it('changes go through one undoable commit each, and store only deltas', () => {
    useWorksheetStore.getState().replaceWorksheet(createWorksheet());
    const { updateAnswerKeyLayout } = useWorksheetStore.getState();
    updateAnswerKeyLayout((layout) => withAnswerKeyPreset(layout, 'hkeaa'));
    updateAnswerKeyLayout((layout) => withAnswerKeySetting(layout, 'showStems', true));
    expect(useWorksheetStore.getState().worksheet.answerKeyLayout).toEqual({ preset: 'hkeaa', showStems: true });
    expect(useWorksheetStore.getState().dirty).toBe(true);
    // The same value again is no commit.
    const past = useWorksheetStore.getState().past.length;
    updateAnswerKeyLayout((layout) => withAnswerKeySetting(layout, 'showStems', true));
    expect(useWorksheetStore.getState().past.length).toBe(past);
    useWorksheetStore.getState().undo();
    expect(useWorksheetStore.getState().worksheet.answerKeyLayout).toEqual({ preset: 'hkeaa' });
    useWorksheetStore.getState().undo();
    expect('answerKeyLayout' in useWorksheetStore.getState().worksheet).toBe(false);
  });

  it('four styles; Suggested answers hides what it fixes and shows its own switches', () => {
    useWorksheetStore.getState().replaceWorksheet({ ...createWorksheet(), answerKeyLayout: { preset: 'suggested' } });
    const markup = renderToStaticMarkup(<AnswerKeyLayoutPanel />);
    for (const word of ['Classic', 'HKEAA style', 'Suggested answers', 'Detailed table']) expect(markup).toContain(word);
    for (const word of ['MC question wording', 'Marks for each part', 'Marking points as answer points', 'Question stems']) {
      expect(markup).toContain(word);
    }
    for (const word of ['Notation legend', 'Note for markers', 'Source notes', 'Long questions', 'Marks column']) {
      expect(markup).not.toContain(word);
    }
    // Detailed table: the LQ layouts are back, the Suggested-only switches are not.
    useWorksheetStore.getState().replaceWorksheet({ ...createWorksheet(), answerKeyLayout: { preset: 'detailed' } });
    const table = renderToStaticMarkup(<AnswerKeyLayoutPanel />);
    for (const word of ['Long questions', 'Reasons', 'Notation legend', 'Note for markers']) expect(table).toContain(word);
    for (const word of ['MC question wording', 'Marking points as answer points']) expect(table).not.toContain(word);
  });

  it('a style from a newer build is named, and no card claims it', () => {
    useWorksheetStore.getState().replaceWorksheet({
      ...createWorksheet(),
      answerKeyLayout: { preset: 'omrSheet' as 'classic' },
    });
    const markup = renderToStaticMarkup(<AnswerKeyLayoutPanel />);
    expect(markup).toContain('newer version of Econ Studio');
    expect(markup).not.toMatch(/role="radio" aria-checked="true"[^>]*>(?:(?!<\/button>)[\s\S])*Classic/);
  });
});
