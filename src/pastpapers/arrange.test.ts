import { beforeEach, describe, expect, it } from 'vitest';
import { arrangeLists, defaultLists, moveKeys, parseArrangement, resetTopic, stepKeys, storedFrom, type ArrangeRow } from './arrange';
import { ARRANGE_KEY, readArrangements, resetArrangeCache, writeArrangement } from './arrangeStore';

const rows: ArrangeRow[] = [
  { key: 'a1', topicId: 'a' },
  { key: 'a2', topicId: 'a' },
  { key: 'a3', topicId: 'a' },
  { key: 'b1', topicId: 'b' },
  { key: 'b2', topicId: 'b' },
  { key: 'c1', topicId: 'c' },
];
const ids = ['a', 'b', 'c'];
const plain = (lists: Map<string, string[]>) => Object.fromEntries(lists);

describe('arrangeLists', () => {
  it('is the bank order with nothing stored', () => {
    expect(plain(arrangeLists(rows, ids, { topics: {} }))).toEqual({ a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1'] });
  });

  it('follows a stored list, and a question listed elsewhere leaves its own topic', () => {
    const lists = arrangeLists(rows, ids, { topics: { a: ['a3', 'a1'], b: ['b2', 'a2', 'b1'] } });
    expect(plain(lists)).toEqual({ a: ['a3', 'a1'], b: ['b2', 'a2', 'b1'], c: ['c1'] });
  });

  it('drops keys the bank no longer has, places each question once, and adds new ones at the end', () => {
    const more = [...rows, { key: 'a4', topicId: 'a' }];
    const lists = arrangeLists(more, ids, { topics: { a: ['gone', 'a2', 'a1'], c: ['a2', 'c1'] } });
    expect(plain(lists)).toEqual({ a: ['a2', 'a1', 'a3', 'a4'], b: ['b1', 'b2'], c: ['c1'] });
  });

  it('gives back the questions of a topic the bank dropped', () => {
    const lists = arrangeLists(rows, ids, { topics: { gone: ['a1', 'b1'] } });
    expect(plain(lists)).toEqual({ a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1'] });
  });
});

describe('moving', () => {
  const lists = arrangeLists(rows, ids, { topics: {} });
  const defaults = defaultLists(rows, ids);

  it('reorders inside a topic, storing only that topic', () => {
    const next = moveKeys(lists, ['a3'], 'a', 'a1');
    expect(next.get('a')).toEqual(['a3', 'a1', 'a2']);
    expect(storedFrom(next, defaults)).toEqual({ topics: { a: ['a3', 'a1', 'a2'] } });
  });

  it('moves several questions into another topic, in the order given, at the end without a target', () => {
    const next = moveKeys(lists, ['a1', 'c1'], 'b');
    expect(plain(next)).toEqual({ a: ['a2', 'a3'], b: ['b1', 'b2', 'a1', 'c1'], c: [] });
    // Read back from what is stored, the arrangement is the same.
    expect(plain(arrangeLists(rows, ids, storedFrom(next, defaults)))).toEqual(plain(next));
  });

  it('a move back to the bank order stores nothing', () => {
    const there = moveKeys(lists, ['a3'], 'a', 'a1');
    const back = moveKeys(there, ['a3'], 'a');
    expect(storedFrom(back, defaults)).toEqual({ topics: {} });
  });

  it('reset brings a topic back: its order, its questions moved out, and others moved in go home', () => {
    const moved = storedFrom(moveKeys(moveKeys(lists, ['a1'], 'b', 'b1'), ['c1'], 'a', 'a2'), defaults);
    const reset = resetTopic(moved, 'a', rows);
    expect(plain(arrangeLists(rows, ids, reset))).toEqual({ a: ['a1', 'a2', 'a3'], b: ['b1', 'b2'], c: ['c1'] });
  });
});

describe('stepKeys (keyboard)', () => {
  const lists = arrangeLists(rows, ids, { topics: {} });
  const shown = ids.map((topicId) => ({ topicId, keys: lists.get(topicId) ?? [] }));

  it('moves one place up and down inside a topic', () => {
    expect(stepKeys(lists, shown, ['a2'], -1)?.get('a')).toEqual(['a2', 'a1', 'a3']);
    expect(stepKeys(lists, shown, ['a2'], 1)?.get('a')).toEqual(['a1', 'a3', 'a2']);
  });

  it('crosses into the next topic at the edges, and stops at the very top and bottom', () => {
    expect(plain(stepKeys(lists, shown, ['a3'], 1)!)).toEqual({ a: ['a1', 'a2'], b: ['a3', 'b1', 'b2'], c: ['c1'] });
    expect(plain(stepKeys(lists, shown, ['b1'], -1)!)).toEqual({ a: ['a1', 'a2', 'a3', 'b1'], b: ['b2'], c: ['c1'] });
    expect(stepKeys(lists, shown, ['a1'], -1)).toBeUndefined();
    expect(stepKeys(lists, shown, ['c1'], 1)).toBeUndefined();
  });

  it('moves a selection as one block past the questions shown (hidden ones keep their place)', () => {
    const filtered = [{ topicId: 'a', keys: ['a1', 'a3'] }, { topicId: 'b', keys: ['b1', 'b2'] }, { topicId: 'c', keys: ['c1'] }];
    expect(stepKeys(lists, filtered, ['a3'], -1)?.get('a')).toEqual(['a3', 'a1', 'a2']);
    expect(stepKeys(lists, shown, ['b1', 'b2'], -1)?.get('a')).toEqual(['a1', 'a2', 'a3', 'b1', 'b2']);
  });
});

describe('stored arrangement', () => {
  beforeEach(() => resetArrangeCache());

  it('reads malformed values as none, keeping what is readable', () => {
    expect(parseArrangement('x')).toEqual({ topics: {} });
    expect(parseArrangement({ topics: { a: ['a1', 3, ''], b: 'no' } })).toEqual({ topics: { a: ['a1'] } });
  });

  it('keeps one arrangement per bank address and removes an empty one', () => {
    const map = new Map<string, string>();
    const io = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    writeArrangement('https://one/', { topics: { a: ['a2', 'a1'] } }, io);
    writeArrangement('https://two/', { topics: { b: ['b2'] } }, io);
    resetArrangeCache();
    expect(readArrangements(io)).toEqual({ 'https://one/': { topics: { a: ['a2', 'a1'] } }, 'https://two/': { topics: { b: ['b2'] } } });
    writeArrangement('https://one/', { topics: {} }, io);
    expect(JSON.parse(map.get(ARRANGE_KEY)!)).toEqual({ 'https://two/': { topics: { b: ['b2'] } } });
  });
});
