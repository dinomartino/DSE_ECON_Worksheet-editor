import { describe, expect, it } from 'vitest';
import { pickFill } from './fill';
import { classRefs } from './cohort';
import { groupRows } from './group';
import { row } from './testKit';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

describe('pickFill', () => {
  // Bank copies of five questions, plus uses in papers.
  const rows = [
    ...['a', 'b', 'c', 'd', 'e'].map((id) =>
      row({ rootId: id, docId: 'bank', docKind: 'bank', usedOn: at(1), tags: id === 'e' ? ['G'] : id === 'd' ? ['C'] : ['C.ped'] }),
    ),
    row({ rootId: 'a', docId: 'p-old', usedOn: at(2), classes: ['5B'], tags: ['C.ped'] }),
    row({ rootId: 'b', docId: 'p-new', usedOn: at(6), classes: ['5A'], tags: ['C.ped'] }),
  ];
  const groups = groupRows(rows);

  it('picks the topic’s never-used questions first, then least recently used', () => {
    expect(pickFill(groups, { count: 4, topic: 'C.ped' }).map((g) => g.rootId)).toEqual(['c', 'a', 'b']);
  });

  it('prefers an exact tag over a sub-topic when filling by a coarse topic', () => {
    expect(pickFill(groups, { count: 5, topic: 'C' }).map((g) => g.rootId)).toEqual(['d', 'c', 'a', 'b']);
  });

  it('ranks questions used with the class last', () => {
    expect(pickFill(groups, { count: 3, topic: 'C.ped', usedWith: [{ key: '5a' }] }).map((g) => g.rootId)).toEqual(['c', 'a', 'b']);
    expect(pickFill(groups, { count: 3, topic: 'C.ped', usedWith: [{ key: '5b' }] }).map((g) => g.rootId)).toEqual(['c', 'b', 'a']);
  });

  it('ranks by cohort: this year’s 6A sat last year’s 5A and 5B papers', () => {
    // Both uses were in 2025-26 by form 5, so DSE 2027; 6A in 2026-27 is DSE 2027 too.
    expect(pickFill(groups, { count: 3, topic: 'C.ped', usedWith: classRefs(['6A'], '2026-10-01') }).map((g) => g.rootId)).toEqual(['c', 'a', 'b']);
    // A draft (no classes) is not a use: it only breaks ties after real uses.
    const withDraft = groupRows([...rows, row({ rootId: 'c', docId: 'draft', usedOn: at(9), tags: ['C.ped'] })]);
    expect(pickFill(withDraft, { count: 3, topic: 'C.ped', usedWith: [{ key: '5a' }] }).map((g) => g.rootId)).toEqual(['c', 'a', 'b']);
    expect(pickFill(withDraft, { count: 3, topic: 'C.ped' }).map((g) => g.rootId)).toEqual(['c', 'a', 'b']);
  });

  it('never returns a question already in the paper, and honours count and type', () => {
    expect(pickFill(groups, { count: 2, excludeRootIds: ['c', 'd'] }).map((g) => g.rootId)).toEqual(['e', 'a']);
    expect(pickFill(groups, { count: 0 })).toEqual([]);
    expect(pickFill(groups, { count: 5, typeId: 'other' })).toEqual([]);
  });

  it('is deterministic', () => {
    const first = pickFill(groups, { count: 5 }).map((g) => g.rootId);
    expect(pickFill(groupRows([...rows].reverse()), { count: 5 }).map((g) => g.rootId)).toEqual(first);
  });
});
