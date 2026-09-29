import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import { rowsOf } from './indexer';
import { searchRows } from './search';
import { tagsByRoot, withSharedTags } from './sharedTags';
import { choiceQuestion, docWith, row } from './testKit';

describe('tagsByRoot', () => {
  it('unions every copy’s tags, once each, in the order the rows give them', () => {
    const rows = [
      row({ rootId: 'r', tags: ['C.ped', 'mock'] }),
      row({ rootId: 'r', tags: ['A', 'C.ped'] }),
      row({ rootId: 'r', tags: [] }),
      row({ rootId: 'other', tags: ['J', 'J'] }),
    ];
    const byRoot = tagsByRoot(rows);
    expect(byRoot.get('r')).toEqual(['C.ped', 'mock', 'A']);
    expect(byRoot.get('other')).toEqual(['J']);
  });
});

describe('withSharedTags', () => {
  it('gives every copy the union, and returns an agreeing row as the same object', () => {
    const lone = row({ rootId: 'lone', tags: ['B'] });
    const a = row({ rootId: 'r', tags: ['C'] });
    const b = row({ rootId: 'r', tags: [] });
    const out = withSharedTags([lone, a, b]);
    expect(out[0]).toBe(lone);
    expect(out[1]).toBe(a);
    expect(out[2]).not.toBe(b);
    expect(out[2].tags).toEqual(['C']);
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
});
