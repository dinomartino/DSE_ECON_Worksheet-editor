import { describe, expect, it } from 'vitest';
import { groupRows } from '@/library/group';
import { rowsOf } from '@/library/indexer';
import { withSharedTags } from '@/library/sharedTags';
import { choiceQuestion, docWith, partedQuestion } from '@/library/testKit';
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

/**
 * One question with two parts on two sub-topics: every reader goes by its derived tags,
 * so it counts once under C and is found under either sub-topic.
 */
describe('a question tagged per part reads as every part’s topics', () => {
  const original = partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]);
  const copy = copyQuestion(original, 'bank');
  const rows = withSharedTags([...rowsOf(docWith([original])), ...rowsOf(docWith([copy]))]);

  it('counts once under its coarse topic, and every filter finds it', () => {
    expect(coverage(rows).bars.find((bar) => bar.code === 'C')?.total).toBe(1);
    expect(coverage(rows).untagged).toBe(0);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'C.ped' })).toHaveLength(2);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'C.intervention' })).toHaveLength(2);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'untagged' })).toHaveLength(0);
    expect(traySummary([groupRows(rows)[0].rows[0]]).mix).toEqual(
      expect.arrayContaining([
        { code: 'C.ped', count: 1 },
        { code: 'C.intervention', count: 1 },
      ]),
    );
  });

  it('is listed under both sub-topics on the rail, each entry naming the other', () => {
    const sections = railSections(groupRows(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'C' })), 'C');
    expect(sections.map((s) => [s.key, s.entries.map((e) => e.alsoIn)])).toEqual([
      ['C.ped', [['Market intervention']]],
      ['C.intervention', [['Price elasticity of demand']]],
    ]);
  });

  it('leaves Untagged as soon as any part has a topic', () => {
    const one = partedQuestion([{}, { tags: ['C.ped'] }, {}]);
    const oneRows = withSharedTags(rowsOf(docWith([one])));
    expect(coverage(oneRows).untagged).toBe(0);
    expect(filterRows(oneRows, { ...DEFAULT_FILTERS, topic: 'untagged' })).toHaveLength(0);
    const none = withSharedTags(rowsOf(docWith([partedQuestion([{}, {}], ['mock'])])));
    expect(coverage(none).untagged).toBe(1);
  });
});
