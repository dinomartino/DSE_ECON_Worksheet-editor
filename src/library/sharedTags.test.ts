import { describe, expect, it } from 'vitest';
import { copyQuestion } from '@/model/lineage';
import { rowsOf } from './indexer';
import { searchRows } from './search';
import { stateFor, tagStateOf } from '@/model/tagSlots';
import type { Question } from '@/model/types';
import { adoptTags, sharedState, sharedTags, sharedTagsByRoot, tagTime, withRowTags, withSharedTags } from './sharedTags';
import { choiceQuestion, docWith, partedQuestion, row } from './testKit';

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

describe('sharedState: per-part topics across copies', () => {
  const at = (question: Question, tagsAt?: string) => ({ state: tagStateOf(question), ...(tagsAt ? { tagsAt } : {}) });

  it('gives the newest copy’s whole state, mapped by part root onto a reordered copy', () => {
    const original = partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]);
    const copy = copyQuestion(original, 'bank');
    copy.parts.reverse(); // (b) now prints first in this copy
    copy.parts[1].tags = ['J.trade']; // the older copy's (a), which the newest says is C.ped
    const shared = sharedState([at(original, T2), at(copy, T1)]);
    expect(shared.tagsAt).toBe(T2);
    const shown = stateFor(tagStateOf(copy), shared.state);
    expect(shown.slots.map((slot) => [slot.label, slot.own])).toEqual([
      ['(a)', ['C.intervention']],
      ['(b)', ['C.ped']],
    ]);
  });

  it('pairs parts by position only between copies of the same shape', () => {
    // Copies made before part roots existed: no keys in common.
    const a = partedQuestion([{ tags: ['C.ped'] }, { tags: ['D'] }]);
    const sameShape = partedQuestion([{}, {}]);
    const extraPart = partedQuestion([{ tags: ['F'] }, {}, { tags: ['G'] }]);
    const winner = sharedState([at(a, T2)]).state;
    expect(stateFor(tagStateOf(sameShape), winner).slots.map((slot) => slot.own)).toEqual([['C.ped'], ['D']]);
    // Another shape keeps its own lists: a position means nothing across a structural edit.
    expect(stateFor(tagStateOf(extraPart), winner).slots.map((slot) => slot.own)).toEqual([['F'], undefined, ['G']]);
  });

  it('lets an edited version’s extra part keep its own list', () => {
    const original = partedQuestion([{ tags: ['C.ped'] }]);
    const edited = copyQuestion(original, 'bank');
    edited.parts.push({ ...partedQuestion([{ tags: ['E.equity'] }]).parts[0] });
    const shown = stateFor(tagStateOf(edited), sharedState([at(original, T2), at(edited, T1)]).state);
    expect(shown.slots.map((slot) => slot.own)).toEqual([['C.ped'], ['E.equity']]);
  });

  it('gives tied copies, and copies never stamped, their union list by list, older whole-question topics included', () => {
    const original = partedQuestion([{ tags: ['C.ped'] }, { subs: [undefined, ['D']] }]);
    const copy = copyQuestion(original, 'bank');
    copy.parts[0].tags = ['C.pes'];
    copy.parts[1].subParts![0].tags = ['E.equity'];
    for (const stamps of [[T1, T1], [undefined, undefined]]) {
      const shared = sharedState([at(original, stamps[0]), at(copy, stamps[1])]);
      expect(shared.state.slots.map((slot) => slot.own)).toEqual([['C.ped', 'C.pes'], undefined, ['E.equity'], ['D']]);
    }
    // A develop-era copy tagged on the whole question counts on every part of the union.
    const legacy = { ...partedQuestion([{}, {}]), tags: ['C.equilibrium', 'mock'] };
    const partOwn = partedQuestion([{ tags: ['C.ped'] }, {}]);
    const union = sharedState([at(legacy), at(partOwn)]).state;
    expect(union.tags).toEqual(['mock']);
    expect(union.slots.map((slot) => slot.own)).toEqual([['C.equilibrium', 'C.ped'], ['C.equilibrium']]);
  });

  it('is sharedTags for copies without parts', () => {
    const copies = [
      { state: { tags: ['C', 'mock'], slots: [] }, tagsAt: T1 },
      { state: { tags: ['D', 'C'], slots: [] }, tagsAt: T1 },
      { state: { tags: ['F'], slots: [] } },
    ];
    expect(sharedState(copies).state.tags).toEqual(sharedTags(copies.map((c) => ({ tags: c.state.tags, tagsAt: c.tagsAt }))).tags);
  });
});

describe('rows of a question tagged per part', () => {
  it('publish the derived tags, each part’s lists, and a shared stamp; an agreeing row stays the same object', () => {
    const original = { ...partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }], ['mock']), tagsAt: T2 };
    const stale = { ...copyQuestion(original, 'bank'), tagsAt: T1 };
    stale.parts[1].tags = ['J.trade'];
    const rows = withSharedTags([...rowsOf(docWith([original])), ...rowsOf(docWith([stale]))]);
    expect(rows[0].tags).toEqual(['C.ped', 'C.intervention', 'mock']);
    expect(rows[1].tags).toEqual(['C.ped', 'C.intervention', 'mock']);
    expect(rows[1].slots!.map((slot) => slot.tags)).toEqual([['C.ped'], ['C.intervention']]);
    expect(rows[1].tagsAt).toBe(T2);
    expect(searchRows(rows, { topic: 'J' })).toEqual([]);
    expect(searchRows(rows, { text: 'market intervention' })).toHaveLength(2);
    const again = withSharedTags(rows);
    again.forEach((row, i) => expect(row).toBe(rows[i]));
  });

  it('a copy taken from the bank starts with each part’s shown list, and its copy keeps the part keys', () => {
    const original = { ...partedQuestion([{ tags: ['C.ped'] }, { tags: ['C.intervention'] }]), tagsAt: T2 };
    const stale = { ...copyQuestion(original, 'bank'), tagsAt: T1 };
    stale.parts[0].tags = ['J.trade'];
    const doc = docWith([stale]);
    const rows = withSharedTags([...rowsOf(docWith([original])), ...rowsOf(doc)]);
    const picked = withRowTags(stale, rows[1]);
    expect(picked.parts.map((part) => part.tags)).toEqual([['C.ped'], ['C.intervention']]);
    expect(picked.tagsAt).toBe(T2);
    const inserted = copyQuestion(picked, doc.id);
    expect(tagStateOf(inserted).slots.map((slot) => slot.key)).toEqual(tagStateOf(original).slots.map((slot) => slot.key));
    expect(withRowTags(picked, rows[1])).toBe(picked);
  });
});
