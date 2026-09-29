import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import type { WorksheetSummary } from '@/storage/types';
import {
  activeFilters,
  addTarget,
  bankIsStale,
  classTags,
  clearFilter,
  coverage,
  DEFAULT_FILTERS,
  filterRows,
  isThin,
  mixLabel,
  sinceIso,
  traySummary,
  treeCounts,
} from './bankPage';

const choice = createMcqQuestion().type;
const parts = createStructuredQuestion().type;
const ready = { state: 'ready' as const, done: 1, total: 1 };

describe('coverage', () => {
  it('counts each question once per coarse topic, types stacked in registry order', () => {
    const rows = [
      row({ rootId: 'a', typeId: choice, tags: ['C.ped', 'C.equilibrium'] }),
      row({ rootId: 'a', typeId: choice, tags: ['C.ped'], docId: 'other' }), // a copy
      row({ rootId: 'b', typeId: parts, tags: ['C', 'D'] }),
      row({ rootId: 'c', typeId: choice, tags: ['free tag'] }),
    ];
    const result = coverage(rows);
    const c = result.bars.find((bar) => bar.code === 'C')!;
    expect(c.total).toBe(2);
    expect(c.byType).toEqual([
      { typeId: choice, count: 1 },
      { typeId: parts, count: 1 },
    ]);
    expect(result.bars.find((bar) => bar.code === 'D')!.total).toBe(1);
    expect(result.bars.map((bar) => bar.code)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'EL1', 'EL2']);
    expect(result.untagged).toBe(1);
    expect(result.total).toBe(3);
    expect(result.max).toBe(2);
    expect(result.typeIds).toEqual([choice, parts]);
  });

  it('a question tagged in any copy is not untagged', () => {
    const rows = [row({ rootId: 'a', tags: [] }), row({ rootId: 'a', tags: ['E'], docId: 'd2' })];
    expect(coverage(rows).untagged).toBe(0);
    expect(treeCounts(rows).get('untagged') ?? 0).toBe(0);
  });

  it('marks thin topics against the tallest bar, never when nothing is tagged', () => {
    expect(isThin(1, 10)).toBe(true);
    expect(isThin(3, 10)).toBe(false);
    expect(isThin(9, 50)).toBe(true);
    expect(isThin(0, 0)).toBe(false);
    const result = coverage([row({ tags: [] })]);
    expect(result.bars.every((bar) => !bar.thin)).toBe(true);
  });
});

describe('treeCounts', () => {
  it('counts distinct questions; a coarse topic includes its fine codes', () => {
    const rows = [
      row({ rootId: 'a', tags: ['C.ped'] }),
      row({ rootId: 'a', tags: ['C.ped'], docId: 'copy' }),
      row({ rootId: 'b', tags: ['C'] }),
      row({ rootId: 'c', tags: [] }),
      row({ rootId: 'd', tags: ['not a code'] }),
    ];
    const counts = treeCounts(rows);
    expect(counts.get('all')).toBe(4);
    expect(counts.get('C')).toBe(2);
    expect(counts.get('C.ped')).toBe(1);
    expect(counts.get('untagged')).toBe(2);
    expect(counts.get('D')).toBeUndefined();
  });
});

describe('filterRows', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const rows = [
    row({ rootId: 'a', typeId: choice, marks: 1, tags: ['C.ped'], searchText: 'elasticity', docKind: 'paper' }),
    row({ rootId: 'b', typeId: parts, marks: 6, tags: [], searchText: 'harvest', docKind: 'bank' }),
    // `a` used with 5A in March 2026, `b` used with 5A in 2024.
    row({ rootId: 'a', docId: 'used', classTag: '5A', docUpdatedAt: '2026-03-01T00:00:00.000Z' }),
    row({ rootId: 'b', docId: 'old', classTag: '5a ', docUpdatedAt: '2024-03-01T00:00:00.000Z' }),
  ];
  const ids = (list: ReturnType<typeof filterRows>) => [...new Set(list.map((r) => r.rootId))];

  it('untagged, source, type and marks', () => {
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'untagged' }))).toEqual(['b']);
    expect(filterRows(rows, { ...DEFAULT_FILTERS, source: 'bank' }).map((r) => r.rootId)).toEqual(['b']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, typeId: parts }))).toEqual(['b']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, marks: '5-8' }))).toEqual(['b']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'C' }))).toEqual(['a']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, text: 'harv' }))).toEqual(['b']);
  });

  it('"not used with <class> since…" drops every copy used in that window', () => {
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, notUsedWith: '5A' }, now))).toEqual([]);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, notUsedWith: '5A', since: 'year' }, now))).toEqual(['a', 'b']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, notUsedWith: '5A', since: '12m' }, now))).toEqual(['b']);
  });

  it('school years start in September', () => {
    expect(sinceIso('year', new Date(2026, 8, 29))).toBe(new Date(2026, 8, 1).toISOString());
    expect(sinceIso('year', new Date(2026, 1, 3))).toBe(new Date(2025, 8, 1).toISOString());
    expect(sinceIso('ever', now)).toBeUndefined();
  });

  it('names each active filter so the empty state can clear it', () => {
    const filters = { ...DEFAULT_FILTERS, topic: 'C.ped', typeId: choice, notUsedWith: '5A' };
    expect(activeFilters(filters).map((f) => f.label)).toEqual([
      'C · Price elasticity of demand',
      'MCQ',
      'not used with 5A',
    ]);
    expect(clearFilter(filters, 'notUsedWith')).toEqual({ ...filters, notUsedWith: undefined, since: 'ever' });
    expect(clearFilter(filters, 'topic').topic).toBe('all');
    expect(activeFilters(DEFAULT_FILTERS)).toEqual([]);
  });

  it('lists class tags once per class, papers only', () => {
    expect(classTags(rows)).toEqual(['5A']);
  });
});

describe('traySummary', () => {
  it('sums marks, minutes by the paper-summary pace, and the topic mix', () => {
    const summary = traySummary([
      row({ typeId: choice, marks: 1, tags: ['C.ped'] }),
      row({ typeId: choice, marks: 1, tags: ['C.ped', 'C.intervention'] }),
      row({ typeId: parts, marks: 6, tags: ['C.ped', 'free'] }),
    ]);
    expect(summary.count).toBe(3);
    expect(summary.marks).toBe(8);
    // Two MCQs at 60/45 min each, six structured marks at 1.2: 2.67 + 7.2 → 10.
    expect(summary.minutes).toBe(10);
    expect(summary.mix).toEqual([
      { code: 'C.ped', count: 3 },
      { code: 'C.intervention', count: 1 },
    ]);
    expect(mixLabel(summary.mix)).toBe('C.ped ×3, C.intervention ×1');
    expect(mixLabel([1, 2, 3, 4, 5].map((n) => ({ code: `X${n}`, count: 1 })))).toBe('X1 ×1, X2 ×1, X3 ×1 +2 more');
  });
});

describe('freshness and targets', () => {
  const summary = (id: string, updatedAt: string, questionCount = 1): WorksheetSummary => ({ id, title: id, updatedAt, questionCount });

  it('is stale when a document was saved since, went away, or a newer one appeared', () => {
    const rows = [row({ docId: 'a', docUpdatedAt: '2026-01-01' })];
    expect(bankIsStale(rows, [summary('a', '2026-01-01')], ready)).toBe(false);
    expect(bankIsStale(rows, [summary('a', '2026-02-01')], ready)).toBe(true);
    expect(bankIsStale(rows, [], ready)).toBe(true);
    expect(bankIsStale(rows, [summary('a', '2026-01-01'), summary('b', '2026-03-01')], ready)).toBe(true);
    // An empty newer document yields no rows: not a reason to rescan.
    expect(bankIsStale(rows, [summary('a', '2026-01-01'), summary('b', '2026-03-01', 0)], ready)).toBe(false);
    expect(bankIsStale(rows, [], { state: 'scanning', done: 0, total: 1 })).toBe(false);
  });

  it('adds to the document open last, else the newest paper, never a bank', () => {
    const summaries = [summary('bank', '3'), summary('new', '2'), summary('old', '1')];
    const rows = [row({ docId: 'bank', docKind: 'bank' })];
    expect(addTarget(summaries, rows, 'old')?.id).toBe('old');
    expect(addTarget(summaries, rows, 'gone')?.id).toBe('new');
    expect(addTarget(summaries, rows, 'bank')?.id).toBe('new');
    expect(addTarget([], rows, undefined)).toBeUndefined();
  });
});
