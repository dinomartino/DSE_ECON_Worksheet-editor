import { beforeEach, describe, expect, it } from 'vitest';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { Worksheet } from '@/model/types';
import { richStructured } from '@/test/idFixture';
import { resetNoticesForTest, runNoticeAction, useNoticeStore } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { SAVED_ELSEWHERE_NOTICE, takeSavedElsewhere } from './savedElsewhere';

const store = () => useWorksheetStore.getState();

/** The open paper: one question, tagged earlier. */
function openPaper(): Worksheet {
  const question = { ...richStructured(), tags: ['Demand'], tagsAt: '2026-10-01T00:00:00.000Z' };
  return { ...createWorksheet(), questions: [question] };
}

/** The same paper as another tab saved it: a ✦ Fill changed content and tags. */
function filledElsewhere(open: Worksheet): Worksheet {
  const [question] = open.questions;
  return {
    ...open,
    title: bi('Filled in the 題庫 tab', ''),
    questions: [{ ...question!, tags: ['Supply'], tagsAt: '2026-10-05T00:00:00.000Z' }],
    updatedAt: '2026-10-05T00:00:00.000Z',
  };
}

const neverLoads = async () => undefined;

beforeEach(() => {
  resetNoticesForTest();
  useWorksheetStore.setState({ worksheet: openPaper(), past: [], future: [], dirty: false, readOnly: false });
});

describe('takeSavedElsewhere (another tab saved the open paper)', () => {
  it('with nothing unsaved, takes the saved copy whole, drops history, and says nothing', () => {
    store().updateWorksheet({ title: bi('Mine, already saved', '') });
    useWorksheetStore.setState({ dirty: false });
    const saved = filledElsewhere(store().worksheet);

    expect(takeSavedElsewhere(saved, neverLoads)).toBe('whole');
    expect(store().worksheet).toBe(saved);
    // An undo back to the older copy would autosave over the newer one.
    expect(store().past).toEqual([]);
    expect(store().dirty).toBe(false);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });

  it('with unsaved edits, keeps them, takes the newer tags, and warns with Reload', async () => {
    const saved = filledElsewhere(store().worksheet);
    store().updateWorksheet({ title: bi('Unsaved here', '') });
    expect(store().dirty).toBe(true);

    expect(takeSavedElsewhere(saved, async () => saved)).toBe('tags');
    expect(store().worksheet.title).toEqual(bi('Unsaved here', ''));
    expect(store().worksheet.questions[0]!.tags).toEqual(['Supply']);
    expect(store().dirty).toBe(true);

    const notice = useNoticeStore.getState().notices.find((n) => n.id === SAVED_ELSEWHERE_NOTICE);
    expect(notice?.tone).toBe('warning');
    const reload = notice!.actions![0]!;
    expect(reload.label).toBe('Reload');

    runNoticeAction(notice!.id, reload);
    await Promise.resolve();
    await Promise.resolve();
    expect(store().worksheet).toBe(saved);
    expect(store().dirty).toBe(false);
  });

  it('ignores a save of another document', () => {
    const other = { ...filledElsewhere(store().worksheet), id: 'someone-else' };
    const before = store().worksheet;
    expect(takeSavedElsewhere(other, neverLoads)).toBe('other');
    expect(store().worksheet).toBe(before);
  });

  it('read-only takes nothing whole and raises no warning', () => {
    useWorksheetStore.setState({ readOnly: true });
    const before = store().worksheet;
    expect(takeSavedElsewhere(filledElsewhere(before), neverLoads)).toBe('tags');
    expect(store().worksheet).toBe(before);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });
});
