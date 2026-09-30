import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import type { WorksheetSummary } from '@/storage/types';
import {
  activeFilters,
  addTarget,
  classChoices,
  classChoiceText,
  clearFilter,
  coverage,
  barPx,
  barPercent,
  DEFAULT_FILTERS,
  filterRows,
  isThin,
  mixLabel,
  sinceDate,
  traySummary,
} from './bankPage';

const choice = createMcqQuestion().type;
const parts = createStructuredQuestion().type;

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
    expect(filterRows(rows, { ...DEFAULT_FILTERS, topic: 'untagged' })).toEqual([]);
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

describe('barPx', () => {
  it('draws to one scale, empty is flat, a lone question stays visible', () => {
    expect(barPx(10, 10, 40)).toBe(40);
    expect(barPx(5, 10, 40)).toBe(20);
    expect(barPx(0, 10, 40)).toBe(0);
    expect(barPx(0, 0, 40)).toBe(0);
    expect(barPx(1, 100, 40)).toBe(2);
  });

  it('gives a topic card its share of the biggest topic, so 1 question never looks like 27', () => {
    expect(barPercent(27, 27)).toBe(100);
    expect(barPercent(1, 27)).toBeCloseTo(3.7, 1);
    expect(barPercent(1, 200)).toBe(2);
    expect(barPercent(0, 27)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
  });

  it('untagged questions never set the scale', () => {
    const result = coverage([row({ rootId: 'a', tags: ['C'] }), ...['u1', 'u2', 'u3', 'u4'].map((rootId) => row({ rootId, tags: [] }))]);
    expect(result.untagged).toBe(4);
    expect(result.max).toBe(1);
  });
});

describe('filterRows', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const rows = [
    row({ rootId: 'a', typeId: choice, marks: 1, tags: ['C.ped'], searchText: 'elasticity', docKind: 'paper' }),
    row({ rootId: 'b', typeId: parts, marks: 6, tags: [], searchText: 'harvest', docKind: 'bank' }),
    // `a` sat by 5A in March 2026, `b` by 3A in March 2024: both DSE 2027. The 2024 paper was
    // tagged last week, which must not make it recent.
    row({ rootId: 'a', docId: 'used', classes: ['5A'], usedOn: '2026-03-01' }),
    row({ rootId: 'b', docId: 'old', classes: ['3a '], usedOn: '2024-03-01', docUpdatedAt: '2026-09-22T00:00:00.000Z' }),
    // A draft holding `b` this month: never a use.
    row({ rootId: 'b', docId: 'draft', usedOn: '2026-09-20' }),
  ];
  const dse2027 = classChoices(rows)[0];
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
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, notUsedWith: dse2027 }, now))).toEqual([]);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, notUsedWith: dse2027, since: 'year' }, now))).toEqual(['a', 'b']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, notUsedWith: dse2027, since: '12m' }, now))).toEqual(['b']);
  });

  it('school years start in September', () => {
    expect(sinceDate('year', new Date(2026, 8, 29))).toBe('2026-09-01');
    expect(sinceDate('year', new Date(2026, 1, 3))).toBe('2025-09-01');
    expect(sinceDate('12m', new Date(2026, 8, 29))).toBe('2025-09-29');
    expect(sinceDate('ever', now)).toBeUndefined();
  });

  it('names each active filter so the empty state can clear it', () => {
    const filters = { ...DEFAULT_FILTERS, topic: 'C.ped', typeId: choice, notUsedWith: dse2027 };
    expect(activeFilters(filters).map((f) => f.label)).toEqual([
      'C · Price elasticity of demand',
      'MCQ',
      'not used with DSE 2027',
    ]);
    expect(clearFilter(filters, 'notUsedWith')).toEqual({ ...filters, notUsedWith: undefined, since: 'ever' });
    expect(clearFilter(filters, 'topic').topic).toBe('all');
    expect(activeFilters(DEFAULT_FILTERS)).toEqual([]);
  });

  it('offers each cohort with the classes it has been, then classes with no form, papers only', () => {
    expect(classChoices(rows)).toEqual([{ id: 'dse:2027', label: 'DSE 2027', detail: '3a 23-24, 5A 25-26', target: { cohort: 2027 } }]);
    const more = [
      ...rows,
      row({ docId: 'u', classes: ['5B', '5A'], usedOn: '2025-12-01' }),
      row({ docId: 'v', classes: ['5A'], usedOn: '2026-10-01' }),
      row({ docId: 'w', classes: ['Econ X', 'econ x'], usedOn: '2026-10-01' }),
      row({ docId: 'bank', docKind: 'bank', classes: ['Bank class'], usedOn: '2026-10-01' }),
    ];
    expect(classChoices(more).map((c) => [c.label, c.detail])).toEqual([
      ['DSE 2027', '3a 23-24, 5A 5B 25-26'],
      ['DSE 2028', '5A 26-27'],
      ['Econ X', undefined],
    ]);
    expect(classChoices(more)[2].target).toEqual({ key: 'econx' });
  });

  it('words a choice short for the closed select and in full for the open list', () => {
    const [dse] = classChoices(rows);
    expect(classChoiceText(dse)).toEqual({
      closed: 'Not used with DSE 2027',
      open: 'Not used with DSE 2027 (3a 23-24, 5A 25-26)',
      note: 'Same students: 3a 23-24, 5A 25-26',
    });
    expect(classChoiceText({ id: 'class:econx', label: 'Econ X', target: { key: 'econx' } })).toEqual({
      closed: 'Not used with Econ X',
      open: 'Not used with Econ X',
    });
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
    expect(mixLabel(summary.mix)).toBe('Price elasticity of demand ×3, Market intervention ×1');
    expect(mixLabel([1, 2, 3, 4, 5].map((n) => ({ code: `X${n}`, count: 1 })))).toBe('X1 ×1, X2 ×1, X3 ×1 +2 more');
  });
});

describe('targets', () => {
  const summary = (id: string, updatedAt: string, questionCount = 1): WorksheetSummary => ({ id, title: id, updatedAt, questionCount });

  it('adds to the document open last, never a guessed one, never a bank', () => {
    const summaries = [summary('bank', '3'), summary('new', '2'), summary('old', '1')];
    const rows = [row({ docId: 'bank', docKind: 'bank' })];
    expect(addTarget(summaries, rows, 'old')?.id).toBe('old');
    // Nothing opened this session (or it is gone, or a bank): no guess.
    expect(addTarget(summaries, rows, 'gone')).toBeUndefined();
    expect(addTarget(summaries, rows, 'bank')).toBeUndefined();
    expect(addTarget(summaries, rows, undefined)).toBeUndefined();
    expect(addTarget([], rows, undefined)).toBeUndefined();
  });
});

describe('the missing-language filter', () => {
  const english = row({ rootId: 'e', missing: ['zh'], missingTeacher: ['zh'] });
  const answersOnly = row({ rootId: 'a', missingTeacher: ['zh'] });
  const done = row({ rootId: 'd' });
  const chinese = row({ rootId: 'c', missing: ['en'], missingTeacher: ['en'] });
  const rows = [english, answersOnly, done, chinese];
  const ids = (list: { rootId: string }[]) => list.map((r) => r.rootId);

  it('keeps questions lacking the side; teacher text counts only when asked', () => {
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, missing: 'zh' }))).toEqual(['e']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, missing: 'zh' }, undefined, { teacherText: true }))).toEqual(['e', 'a']);
    expect(ids(filterRows(rows, { ...DEFAULT_FILTERS, missing: 'en' }))).toEqual(['c']);
    expect(ids(filterRows(rows, DEFAULT_FILTERS))).toEqual(['e', 'a', 'd', 'c']);
  });

  it('is named, and clears, like any other filter', () => {
    const filters = { ...DEFAULT_FILTERS, missing: 'zh' as const };
    expect(activeFilters(filters)).toEqual([{ key: 'missing', label: 'Missing 中文' }]);
    expect(clearFilter(filters, 'missing').missing).toBeUndefined();
  });
});
