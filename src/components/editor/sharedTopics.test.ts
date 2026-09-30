import { describe, expect, it } from 'vitest';
import { rowsOf } from '@/library/indexer';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith, partedQuestion } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import { useWorksheetStore } from '@/store/worksheetStore';
import { openSharedTags, shownTagState, shownTags } from './sharedTopics';

const T1 = '2026-01-01T00:00:00.000Z';
const T2 = '2026-01-02T00:00:00.000Z';

describe('the topics the editor shows', () => {
  const original = { ...choiceQuestion('A price floor above equilibrium', '', ['C', 'D']), tagsAt: T1 };
  const stale = docWith([original, choiceQuestion('Unrelated', '', ['A'])]);
  const newest = docWith([{ ...copyQuestion(original, stale.id), tags: ['C'], tagsAt: T2 }]);
  const rows = withSharedTags([stale, newest].flatMap((doc) => rowsOf(doc)));

  it('shows a stale copy the newest set, and a lone question its own tags (same array)', () => {
    const shared = openSharedTags(rows, stale);
    expect(shownTags(stale.questions[0], shared)).toEqual(['C']);
    expect(shownTags(stale.questions[1], shared)).toBe(stale.questions[1].tags);
  });

  it('reads the open document’s live copies over its saved rows', () => {
    // Edited in the editor since the last save: the live copy is newest now.
    const live = { ...stale, questions: [{ ...original, tags: ['C', 'F'], tagsAt: '2026-01-03T00:00:00.000Z' }, stale.questions[1]] };
    expect(shownTags(live.questions[0], openSharedTags(rows, live))).toEqual(['C', 'F']);
  });

  it('keeps the union for copies saved before stamping', () => {
    const a = choiceQuestion('Explain a bumper harvest', '', ['C']);
    const docA = docWith([a]);
    const docB = docWith([{ ...copyQuestion(a, docA.id), tags: ['C', 'mock'] }]);
    const legacy = withSharedTags([docA, docB].flatMap((doc) => rowsOf(doc)));
    expect(shownTags(a, openSharedTags(legacy, docA))).toEqual(['C', 'mock']);
  });

  it('opens a develop-era question (topics on the whole of a question with parts) clean, showing every part with them', () => {
    const legacy = { ...partedQuestion([{}, { tags: ['D'] }]), tags: ['C.equilibrium', 'mock'], tagsAt: T1 };
    const doc = docWith([legacy]);
    const copyDoc = docWith([{ ...copyQuestion(legacy, doc.id), tagsAt: T1 }]);
    const published = withSharedTags([doc, copyDoc].flatMap((d) => rowsOf(d)));
    useWorksheetStore.getState().replaceWorksheet(doc);
    const opened = useWorksheetStore.getState();
    const shared = openSharedTags(published, opened.worksheet);
    expect(shownTags(legacy, shared)).toEqual(['C.equilibrium', 'D', 'mock']);
    // Shown with the older topics on the part that has none (copies tied: their union, normalized).
    expect(shownTagState(legacy, shared).slots.map((slot) => slot.own)).toEqual([['C.equilibrium'], ['D']]);
    const after = useWorksheetStore.getState();
    expect(after.dirty).toBe(false);
    expect(after.worksheet).toBe(doc);
    expect(after.worksheet.questions[0]).toBe(legacy);
    expect(after.past).toEqual([]);
  });

  it('never dirties or rewrites a document just for opening it', () => {
    useWorksheetStore.getState().replaceWorksheet(stale);
    const opened = useWorksheetStore.getState();
    const shared = openSharedTags(rows, opened.worksheet);
    expect(shownTags(opened.worksheet.questions[0], shared)).toEqual(['C']);
    const after = useWorksheetStore.getState();
    expect(after.dirty).toBe(false);
    expect(after.worksheet).toBe(stale);
    expect(after.worksheet.questions[0].tags).toEqual(['C', 'D']);
    expect(after.past).toEqual([]);
  });
});
