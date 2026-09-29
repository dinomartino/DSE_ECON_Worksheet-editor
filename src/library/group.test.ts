import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import { bi } from '@/model/text';
import type { ContentBlock } from '@/model/types';
import { classRefs } from './cohort';
import { groupRows } from './group';
import { lastUse, usedIn, usedWith } from './history';
import { rowsOf } from './indexer';
import { choiceQuestion, docWith, row } from './testKit';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

describe('groupRows', () => {
  it('groups copies by rootId and counts distinct contents as versions', () => {
    const original = choiceQuestion('Which is a free good?');
    const same = copyQuestion(original, 'bank');
    const edited = copyQuestion(original, 'bank');
    edited.blocks = [{ ...edited.blocks[0], text: bi('Which is a FREE good?', '') } as ContentBlock];
    const bank = docWith([original], { kind: 'bank', createdAt: at(1), updatedAt: at(1) });
    const p1 = docWith([same], { createdAt: at(2), updatedAt: at(2), classes: ['5A'] });
    const p2 = docWith([edited, choiceQuestion('Unrelated')], { createdAt: at(3), updatedAt: at(3), classes: ['5B'] });
    const rows = [bank, p1, p2].flatMap((doc) => rowsOf(doc));

    const groups = groupRows(rows);
    expect(groups).toHaveLength(2);
    const group = groups.find((g) => g.rootId === original.id)!;
    expect(group.rows.map((r) => r.docId)).toEqual([p2.id, p1.id, bank.id]);
    expect(group.versions).toBe(2);
    expect(group.usedIn.map((u) => u.docId)).toEqual([p2.id, p1.id]);
    expect(group.usedIn[1]).toEqual({ docId: p1.id, docTitle: 'Untitled', usedOn: at(2), classes: ['5A'], number: 1 });
  });

  it('is deterministic whatever the input order', () => {
    const rows = [
      row({ rootId: 'b', docId: 'd1', usedOn: at(1) }),
      row({ rootId: 'a', docId: 'd1', usedOn: at(1) }),
      row({ rootId: 'c', docId: 'd2', usedOn: at(5) }),
    ];
    const forward = groupRows(rows).map((g) => g.rootId);
    expect(forward).toEqual(['c', 'a', 'b']);
    expect(groupRows([...rows].reverse()).map((g) => g.rootId)).toEqual(forward);
  });

  it('leads with the copy used most recently, however recently another was edited', () => {
    // A 2024 paper tagged from the bank today: newer updatedAt, older use date.
    const curated = row({ rootId: 'r', docId: 'old', usedOn: '2024-11-03', docUpdatedAt: '2026-09-29T08:00:00.000Z', classes: ['4A'] });
    const recent = row({ rootId: 'r', docId: 'new', usedOn: '2025-11-03', docUpdatedAt: '2025-11-04T00:00:00.000Z', classes: ['5A'] });
    const [group] = groupRows([curated, recent]);
    expect(group.rows.map((r) => r.docId)).toEqual(['new', 'old']);
    expect(group.usedIn.map((u) => u.docId)).toEqual(['new', 'old']);
  });

  it('dates a paper by when it was sat, else when it was made; never by its last edit', () => {
    const q = choiceQuestion('Stem');
    const edited = docWith([q], { createdAt: '2024-10-01T00:00:00.000Z', updatedAt: '2026-09-29T00:00:00.000Z' });
    expect(rowsOf(edited)[0].usedOn).toBe('2024-10-01T00:00:00.000Z');
    const sat = docWith([q], { createdAt: '2024-10-01T00:00:00.000Z', satOn: '2024-11-15', updatedAt: '2026-09-29T00:00:00.000Z' });
    expect(rowsOf(sat)[0].usedOn).toBe('2024-11-15');
    // Re-indexing after a later save leaves the use date where it was.
    expect(rowsOf({ ...sat, updatedAt: '2027-01-01T00:00:00.000Z' })[0].usedOn).toBe('2024-11-15');
  });
});

describe('history', () => {
  const rows = [
    row({ rootId: 'r', docId: 'old', usedOn: '2025-11-03', classes: ['5A'], number: 4 }),
    row({ rootId: 'r', docId: 'old', usedOn: '2025-11-03', classes: ['5A'], number: 9 }),
    row({ rootId: 'r', docId: 'new', usedOn: '2026-01-08' }),
    row({ rootId: 'r', docId: 'bank', docKind: 'bank', usedOn: '2026-01-09', classes: ['5A'] }),
    row({ rootId: 'other', docId: 'new', usedOn: '2026-01-08' }),
  ];
  const [group] = groupRows(rows.filter((r) => r.rootId === 'r'));

  it('lists each paper once, newest first, drafts included, never a bank', () => {
    expect(usedIn('r', rows).map((u) => [u.docId, u.number])).toEqual([
      ['new', undefined],
      ['old', 4],
    ]);
  });

  it('finds the use with a class, case- and space-insensitive', () => {
    expect(usedWith(group, [{ key: '5a' }])?.docId).toBe('old');
    expect(usedWith(group, classRefs([' 5 a '], '2025-11-03'))?.docId).toBe('old');
    expect(usedWith(group, [{ key: '5b' }])).toBeUndefined();
    expect(usedWith(group, [])).toBeUndefined();
  });

  it('matches the same students a year on, and not the year below', () => {
    // 5A in 2025-26 and 6A in 2026-27 sit the DSE in 2027.
    expect(usedWith(group, classRefs(['6A'], '2026-10-01'))?.docId).toBe('old');
    expect(usedWith(group, classRefs(['5A'], '2026-10-01'))).toBeUndefined();
  });

  it('never counts a draft (a paper with no classes) as a use', () => {
    const drafts = groupRows([row({ rootId: 'd', docId: 'draft', usedOn: '2026-01-08' })])[0];
    expect(drafts.usedIn).toHaveLength(1);
    expect(usedWith(drafts, classRefs(['5A'], '2026-01-08'))).toBeUndefined();
    expect(lastUse(drafts)).toBeUndefined();
    expect(lastUse(group)?.docId).toBe('old');
  });
});
