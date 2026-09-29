import { describe, expect, it } from 'vitest';
import { groupRows } from '@/library/group';
import { rowsOf } from '@/library/indexer';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith } from '@/library/testKit';
import { copyQuestion } from '@/model/lineage';
import { coverage, DEFAULT_FILTERS, filterRows, traySummary } from './bankPage';
import { railSections } from './bankScreen';

/**
 * One question, two copies tagged apart (as older builds and per-copy edits left them):
 * coverage, the rail, filters and the tray must all read the same union of topics.
 */
describe('divergent copies read one set of topics', () => {
  const original = choiceQuestion('Along a straight-line demand curve…', '', ['C.ped']);
  const copy = { ...copyQuestion(original, 'bank'), tags: undefined };
  const older = docWith([original], { updatedAt: '2025-01-01T00:00:00.000Z' });
  const newer = docWith([copy], { updatedAt: '2026-01-01T00:00:00.000Z' });
  const rows = withSharedTags([...rowsOf(newer), ...rowsOf(older)]);

  it('every reader files the question under C.ped', () => {
    expect(coverage(rows).bars.find((bar) => bar.code === 'C')?.total).toBe(1);
    expect(coverage(rows).untagged).toBe(0);
    expect(railSections(groupRows(rows), 'all').map((s) => s.key)).toEqual(['C']);
    expect(railSections(groupRows(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'C' })), 'C').map((s) => s.key)).toEqual([
      'C.ped',
    ]);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'C.ped' })).toHaveLength(2);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'untagged' })).toHaveLength(0);
    expect(traySummary([groupRows(rows)[0].rows[0]]).mix).toEqual([{ code: 'C.ped', count: 1 }]);
  });
});
