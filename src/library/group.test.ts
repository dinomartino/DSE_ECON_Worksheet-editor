import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import { bi } from '@/model/text';
import type { ContentBlock } from '@/model/types';
import { groupRows } from './group';
import { usedIn, usedWithClass } from './history';
import { rowsOf } from './indexer';
import { choiceQuestion, docWith, row } from './testKit';

const at = (day: number) => `2026-01-${String(day).padStart(2, '0')}T00:00:00.000Z`;

describe('groupRows', () => {
  it('groups copies by rootId and counts distinct contents as versions', () => {
    const original = choiceQuestion('Which is a free good?');
    const same = copyQuestion(original, 'bank');
    const edited = copyQuestion(original, 'bank');
    edited.blocks = [{ ...edited.blocks[0], text: bi('Which is a FREE good?', '') } as ContentBlock];
    const bank = docWith([original], { kind: 'bank', updatedAt: at(1) });
    const p1 = docWith([same], { updatedAt: at(2), classTag: '5A' });
    const p2 = docWith([edited, choiceQuestion('Unrelated')], { updatedAt: at(3), classTag: '5B' });
    const rows = [bank, p1, p2].flatMap((doc) => rowsOf(doc));

    const groups = groupRows(rows);
    expect(groups).toHaveLength(2);
    const group = groups.find((g) => g.rootId === original.id)!;
    expect(group.rows.map((r) => r.docId)).toEqual([p2.id, p1.id, bank.id]);
    expect(group.versions).toBe(2);
    expect(group.usedIn.map((u) => u.docId)).toEqual([p2.id, p1.id]);
    expect(group.usedIn[1]).toEqual({ docId: p1.id, docTitle: 'Untitled', docUpdatedAt: at(2), classTag: '5A', number: 1 });
  });

  it('is deterministic whatever the input order', () => {
    const rows = [
      row({ rootId: 'b', docId: 'd1', docUpdatedAt: at(1) }),
      row({ rootId: 'a', docId: 'd1', docUpdatedAt: at(1) }),
      row({ rootId: 'c', docId: 'd2', docUpdatedAt: at(5) }),
    ];
    const forward = groupRows(rows).map((g) => g.rootId);
    expect(forward).toEqual(['c', 'a', 'b']);
    expect(groupRows([...rows].reverse()).map((g) => g.rootId)).toEqual(forward);
  });
});

describe('history', () => {
  const rows = [
    row({ rootId: 'r', docId: 'old', docUpdatedAt: at(1), classTag: '5A 2025-26', number: 4 }),
    row({ rootId: 'r', docId: 'old', docUpdatedAt: at(1), classTag: '5A 2025-26', number: 9 }),
    row({ rootId: 'r', docId: 'new', docUpdatedAt: at(8) }),
    row({ rootId: 'r', docId: 'bank', docKind: 'bank', docUpdatedAt: at(9) }),
    row({ rootId: 'other', docId: 'new', docUpdatedAt: at(8) }),
  ];

  it('lists each paper once, newest first, never a bank', () => {
    expect(usedIn('r', rows).map((u) => [u.docId, u.number])).toEqual([
      ['new', undefined],
      ['old', 4],
    ]);
  });

  it('finds the use with a class, trimmed and case-insensitive', () => {
    const [group] = groupRows(rows.filter((r) => r.rootId === 'r'));
    expect(usedWithClass(group, '5a 2025-26')?.docId).toBe('old');
    expect(usedWithClass(group, '5B')).toBeUndefined();
    expect(usedWithClass(group, '')).toBeUndefined();
    expect(usedWithClass(group, undefined)).toBeUndefined();
  });
});
