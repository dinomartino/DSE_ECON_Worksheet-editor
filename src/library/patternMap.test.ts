import { describe, expect, it } from 'vitest';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import { row } from './testKit';
import { likelyType, listPatterns, rowHasPatternName, startingSubTopics, subTopicList, subTopicTallies } from './patterns';
import { NO_FILTERS, activeFilters, blockingFilter, clearFilter, tabPatternChoices, visibleGroups, type TabFilters } from './tabFilters';

const MCQ = createMcqQuestion().type;
const LQ = createStructuredQuestion().type;
const f = (patch: Partial<TabFilters>): TabFilters => ({ ...NO_FILTERS, ...patch });
const ctx = { openDocId: 'open' };

// Three PED questions (one LQ), one market-intervention one, a coarse-only one; one PED MCQ has two copies.
const rows = [
  row({ docId: 'a', rootId: 'q1', typeId: MCQ, tags: ['C', 'C.ped', 'C.ped::PED and total revenue'] }),
  row({ docId: 'b', rootId: 'q1', typeId: MCQ, tags: ['C', 'C.ped', 'C.ped::PED and total revenue'] }),
  row({ docId: 'a', rootId: 'q2', typeId: MCQ, tags: ['C.ped'] }),
  row({ docId: 'a', rootId: 'q3', typeId: LQ, tags: ['C.ped', 'C.ped::PED and total revenue'] }),
  row({ docId: 'a', rootId: 'q4', typeId: MCQ, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q5', typeId: LQ, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q6', typeId: LQ, tags: ['C.intervention'] }),
  row({ docId: 'a', rootId: 'q7', typeId: MCQ, tags: ['D'] }),
  row({ docId: 'open', rootId: 'q8', typeId: MCQ, tags: ['C.ped', 'C.ped::Calculate PED'] }),
];

describe('the 題型 map’s tallies', () => {
  it('counts each sub-topic’s questions once per question, and those without a 題型 there, by type', () => {
    const tallies = subTopicTallies(rows);
    expect(tallies.get('C.ped')).toEqual({ topic: 'C.ped', questions: 4, without: 1, withoutByType: { [MCQ]: 1 } });
    expect(tallies.get('C.intervention')).toEqual({ topic: 'C.intervention', questions: 3, without: 3, withoutByType: { [MCQ]: 1, [LQ]: 2 } });
    // A coarse topic holds no 題型: it is never a tally.
    expect(tallies.has('C')).toBe(false);
    expect(tallies.has('D')).toBe(false);
  });

  it('starts where the most questions lack a 題型, and a new 題型 there takes their usual type', () => {
    const tallies = subTopicTallies(rows);
    expect(startingSubTopics(tallies).map((tally) => tally.topic)).toEqual(['C.intervention', 'C.ped']);
    expect(startingSubTopics(tallies, 1).map((tally) => tally.topic)).toEqual(['C.intervention']);
    expect(likelyType(tallies.get('C.intervention'), [MCQ, LQ])).toBe(LQ);
    expect(likelyType(tallies.get('C.ped'), [MCQ, LQ])).toBe(MCQ);
    expect(likelyType(undefined, [MCQ, LQ])).toBe(MCQ);
  });

  it('lists a sub-topic’s 題型 as one list: by name, MCQ before LQ for a shared name', () => {
    const items = listPatterns(rows, { patterns: [{ topic: 'C.ped', typeId: LQ, name: 'Explain TR with a diagram' }] });
    expect(subTopicList(items, 'C.ped').map((item) => [item.name, item.typeId, item.count])).toEqual([
      ['Calculate PED', MCQ, 1],
      ['Explain TR with a diagram', LQ, 0],
      ['PED and total revenue', MCQ, 1],
      ['PED and total revenue', LQ, 1],
    ]);
  });
});

describe('the editor 題庫 tab’s 題型 filter', () => {
  it('matches a row by name under the sub-topic, whatever its type, ignoring case', () => {
    expect(rowHasPatternName(rows[0], 'C.ped', 'ped AND total revenue')).toBe(true);
    expect(rowHasPatternName(rows[0], 'C.pes', 'PED and total revenue')).toBe(false);
    expect(rowHasPatternName(rows[2], 'C.ped', 'PED and total revenue')).toBe(false);
  });

  it('offers the names questions outside the open paper carry, with their types', () => {
    expect(tabPatternChoices(rows, 'C.ped', '', 'open')).toEqual([{ name: 'PED and total revenue', typeIds: [MCQ, LQ], count: 2 }]);
    expect(tabPatternChoices(rows, 'C.ped', LQ, 'open')).toEqual([{ name: 'PED and total revenue', typeIds: [LQ], count: 1 }]);
    // Under a coarse topic, or one with no 題型 in use: nothing to offer.
    expect(tabPatternChoices(rows, 'C', '', 'open')).toEqual([]);
    expect(tabPatternChoices(rows, 'C.intervention', '', 'open')).toEqual([]);
  });

  it('narrows the list, by type too when one is set', () => {
    const roots = (filters: TabFilters) => visibleGroups(rows, filters, ctx).map((entry) => entry.group.rootId);
    expect(roots(f({ topic: 'C.ped', pattern: 'PED and total revenue' }))).toEqual(['q1', 'q3']);
    expect(roots(f({ topic: 'C.ped', typeId: LQ, pattern: 'PED and total revenue' }))).toEqual(['q3']);
    // A 題型 left over under a coarse topic narrows nothing.
    expect(roots(f({ topic: 'C', pattern: 'PED and total revenue' }))).toHaveLength(6);
  });

  it('is a filter of its own: listed, cleared alone, and cleared with its topic', () => {
    const filters = f({ topic: 'C.ped', pattern: 'PED and total revenue' });
    expect(activeFilters(filters, ctx)).toEqual(['pattern', 'topic']);
    expect(activeFilters(f({ topic: 'C', pattern: 'x' }), ctx)).toEqual(['topic']);
    expect(clearFilter(filters, 'pattern')).toEqual(f({ topic: 'C.ped' }));
    expect(clearFilter(filters, 'topic')).toEqual(NO_FILTERS);
    expect(blockingFilter(rows, f({ topic: 'C.ped', typeId: LQ, pattern: 'Nothing like it' }), ctx)).toBe('pattern');
  });
});
