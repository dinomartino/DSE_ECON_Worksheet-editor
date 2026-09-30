import { describe, expect, it } from 'vitest';
import { saveStatusView } from './SaveStatus';

const view = (over: Partial<Parameters<typeof saveStatusView>[0]>) =>
  saveStatusView({ readOnly: false, dirty: false, stalled: false, ...over });

describe('saveStatusView', () => {
  it('a clean document is saved, quietly, with the time in the tooltip once known', () => {
    expect(view({})).toMatchObject({ state: 'saved', word: 'Saved', detail: 'All changes saved', visible: false });
    expect(view({ lastSavedAt: '2026-09-30T02:05:00Z' }).detail).toMatch(/^All changes saved at \d/);
  });

  it('edits waiting for autosave read as saving, never as a warning', () => {
    expect(view({ dirty: true })).toMatchObject({ state: 'saving', word: 'Saving', visible: false });
  });

  it('edits autosave has not written in time say so in words, with the way out', () => {
    const stalled = view({ dirty: true, stalled: true });
    expect(stalled).toMatchObject({ state: 'stalled', word: 'Not saved yet', visible: true });
    expect(stalled.detail).toContain('Save now');
    // Stalled only matters while there is something unsaved.
    expect(view({ stalled: true }).state).toBe('saved');
  });

  it('read-only wins over everything and is always a word', () => {
    expect(view({ readOnly: true, dirty: true, stalled: true })).toMatchObject({
      state: 'readOnly',
      word: 'Read-only',
      visible: true,
    });
  });

  it('teacher-facing words carry no em dash and no trailing ellipsis', () => {
    const all = [view({}), view({ dirty: true }), view({ dirty: true, stalled: true }), view({ readOnly: true })];
    for (const { word, detail } of all) {
      expect(word + detail).not.toContain('—');
      expect(word).not.toMatch(/…$/);
    }
  });
});
