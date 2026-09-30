import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import { rowsOf } from './indexer';
import { searchRows } from './search';
import { adoptTags, sharedTags, sharedTagsByRoot, tagTime, withRowTags, withSharedTags } from './sharedTags';
import { choiceQuestion, docWith, row } from './testKit';

const T1 = '2026-09-01T00:00:00.000Z';
const T2 = '2026-09-02T00:00:00.000Z';
const T3 = '2026-09-03T00:00:00.000Z';

describe('sharedTags: the newest tag change wins', () => {
  it('with no copy stamped, is the union of every copy, as before stamping', () => {
    expect(sharedTags([{ tags: ['C.ped', 'mock'] }, { tags: ['A', 'C.ped'] }, { tags: [] }])).toEqual({ tags: ['C.ped', 'mock', 'A'] });
  });

  it('is the tags of the copy stamped last, so a removal sticks', () => {
    const copies = [
      { tags: ['C', 'C.ped'], tagsAt: T1 },
      { tags: ['C'], tagsAt: T3 },
      { tags: ['C', 'C.ped', 'D'], tagsAt: T2 },
    ];
    expect(sharedTags(copies)).toEqual({ tags: ['C'], tagsAt: T3 });
  });

  it('ranks an unstamped copy oldest: one stamped copy wins over any number of legacy ones', () => {
    expect(sharedTags([{ tags: ['C', 'mock'] }, { tags: ['D'], tagsAt: T1 }, { tags: ['F'] }])).toEqual({ tags: ['D'], tagsAt: T1 });
    // A removal down to nothing wins too.
    expect(sharedTags([{ tags: ['C'] }, { tags: [], tagsAt: T1 }])).toEqual({ tags: [], tagsAt: T1 });
  });

  it('gives the union of copies tied on the newest time, in any order', () => {
    const a = { tags: ['C', 'mock'], tagsAt: T2 };
    const b = { tags: ['D', 'C'], tagsAt: '2026-09-02T08:00:00+08:00' }; // the same instant
    const old = { tags: ['F'], tagsAt: T1 };
    expect(sharedTags([a, old, b]).tags).toEqual(['C', 'mock', 'D']);
    expect(new Set(sharedTags([b, a, old]).tags)).toEqual(new Set(['C', 'mock', 'D']));
  });

  it('reads an unreadable stamp as none', () => {
    expect(tagTime('yesterday')).toBeUndefined();
    expect(tagTime(42)).toBeUndefined();
    expect(tagTime(undefined)).toBeUndefined();
    expect(tagTime(T1)).toBe(Date.parse(T1));
    expect(sharedTags([{ tags: ['C'], tagsAt: 'yesterday' }, { tags: ['D'] }]).tags).toEqual(['C', 'D']);
  });
});

describe('sharedTagsByRoot', () => {
  it('resolves each root over its own rows', () => {
    const byRoot = sharedTagsByRoot([
      row({ rootId: 'r', tags: ['C.ped', 'mock'] }),
      row({ rootId: 'r', tags: ['A', 'C.ped'] }),
      row({ rootId: 'other', tags: ['J', 'J'] }),
      row({ rootId: 's', tags: ['C'], tagsAt: T1 }),
      row({ rootId: 's', tags: ['C', 'D'] }),
    ]);
    expect(byRoot.get('r')).toEqual({ tags: ['C.ped', 'mock', 'A'] });
    expect(byRoot.get('other')).toEqual({ tags: ['J'] });
    expect(byRoot.get('s')).toEqual({ tags: ['C'], tagsAt: T1 });
  });
});

describe('withSharedTags', () => {
  it('gives every copy the union when none is stamped, and returns an agreeing row as the same object', () => {
    const lone = row({ rootId: 'lone', tags: ['B'] });
    const a = row({ rootId: 'r', tags: ['C'] });
    const b = row({ rootId: 'r', tags: [] });
    const out = withSharedTags([lone, a, b]);
    expect(out[0]).toBe(lone);
    expect(out[1]).toBe(a);
    expect(out[2]).not.toBe(b);
    expect(out[2].tags).toEqual(['C']);
    expect(out[2].tagsAt).toBeUndefined();
    expect(b.tags).toEqual([]); // the input is untouched
  });

  it('makes the added topics searchable on the copy that lacked them', () => {
    const original = choiceQuestion('A price floor above equilibrium', '', ['C.intervention']);
    const copy = { ...copyQuestion(original, 'bank'), tags: undefined };
    const rows = withSharedTags([...rowsOf(docWith([original])), ...rowsOf(docWith([copy]))]);
    expect(rows[1].tags).toEqual(['C.intervention']);
    expect(searchRows(rows, { text: 'market intervention' })).toHaveLength(2);
    expect(searchRows(rows, { text: '市場干預' })).toHaveLength(2);
    expect(searchRows(rows, { topic: 'C' })).toHaveLength(2);
  });

  it('lets a removal stick: a stale copy no longer shows, filters or searches by the removed topic', () => {
    const original = { ...choiceQuestion('A price floor above equilibrium', '', ['C.intervention', 'D']), tagsAt: T1 };
    // The copy the removal reached, stamped later; the original (say, in a trashed paper since restored) kept it.
    const copy = { ...copyQuestion(original, 'bank'), tags: ['D'], tagsAt: T2 };
    const rows = withSharedTags([...rowsOf(docWith([original])), ...rowsOf(docWith([copy]))]);
    expect(rows.map((r) => r.tags)).toEqual([['D'], ['D']]);
    expect(rows.map((r) => r.tagsAt)).toEqual([T2, T2]);
    expect(searchRows(rows, { topic: 'C' })).toHaveLength(0);
    expect(searchRows(rows, { text: 'market intervention' })).toHaveLength(0);
    expect(searchRows(rows, { text: 'price floor' })).toHaveLength(2); // printed words stay
    expect(searchRows(rows, { topic: 'D' })).toHaveLength(2);
  });

  it('keeps a row’s text when it was not built by rowsOf, and adds the shared words', () => {
    const a = row({ rootId: 'r', tags: ['C'], searchText: 'hand made', tagsAt: T1 });
    const b = row({ rootId: 'r', tags: ['D'], searchText: '', tagsAt: T2 });
    const out = withSharedTags([a, b]);
    expect(out[0].searchText).toBe('hand made\nd\ncompetition and market structure\n競爭與市場結構');
  });
});

describe('adoptTags', () => {
  it('takes the set in its order, keeps a non-string tag, and is the same array when the set is already held', () => {
    const own = ['mock', 'C', 7 as unknown as string];
    expect(adoptTags(own, ['D', 'C', 'D'])).toEqual(['D', 'C', 7]);
    const same = ['C', 'D'];
    expect(adoptTags(same, ['D', 'C'])).toBe(same);
    expect(adoptTags(['C'], [])).toBeUndefined();
    expect(adoptTags(undefined, [])).toBeUndefined();
  });
});

describe('withRowTags', () => {
  it('starts a copy with the row’s set, once each, and is the same object when it already holds it', () => {
    const question = choiceQuestion('Along a straight-line demand curve…', '', ['C', 'mock']);
    expect(withRowTags(question, { tags: ['C.ped', 'C', 'C.ped', 'mock'] }).tags).toEqual(['C.ped', 'C', 'mock']);
    expect(withRowTags(question, { tags: ['mock', 'C'] })).toBe(question);
    const bare = choiceQuestion('Untagged');
    expect(withRowTags(bare, { tags: [] })).toBe(bare);
    expect(withRowTags(bare, { tags: ['D'] }).tags).toEqual(['D']);
  });

  it('drops a tag the newest change removed, and carries that change’s stamp', () => {
    const stale = { ...choiceQuestion('Along a straight-line demand curve…', '', ['C', 'C.ped']), tagsAt: T1 };
    const copy = withRowTags(stale, { tags: ['C'], tagsAt: T2 });
    expect(copy.tags).toEqual(['C']);
    expect(copy.tagsAt).toBe(T2);
    const emptied = withRowTags(stale, { tags: [], tagsAt: T2 });
    expect('tags' in emptied).toBe(false);
  });
});
