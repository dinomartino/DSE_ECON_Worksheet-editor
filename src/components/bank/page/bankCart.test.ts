import { describe, expect, it } from 'vitest';
import { row } from '@/library/testKit';
import { createMcqQuestion, createStructuredQuestion } from '@/model/factories';
import {
  CART_KEY,
  cartTopicLabel,
  cartTotals,
  createBankCart,
  isSortedByType,
  movePick,
  parseCart,
  prunePicks,
  readCart,
  serializeCart,
  sortByType,
  sortLabel,
  stepTarget,
  togglePick,
  typeSplitLabel,
  writeCart,
  type CartPick,
} from './bankCart';
import { rowKey } from './bankPage';

const MCQ = createMcqQuestion().type;
const LQ = createStructuredQuestion().type;

const p = (docId: string, questionId: string): CartPick => ({ docId, questionId });
const keys = (picks: readonly CartPick[]) => picks.map((pick) => pick.questionId);

/** An in-memory Storage, optionally throwing on every call. */
function memory(throwing = false) {
  const map = new Map<string, string>();
  const guard = () => {
    if (throwing) throw new Error('SecurityError');
  };
  return {
    map,
    getItem: (key: string) => (guard(), map.get(key) ?? null),
    setItem: (key: string, value: string) => (guard(), void map.set(key, value)),
    removeItem: (key: string) => (guard(), void map.delete(key)),
  };
}

describe('parseCart', () => {
  it('round-trips and keeps the order', () => {
    const picks = [p('d1', 'q2'), p('d1', 'q1'), p('d2', 'q9')];
    expect(parseCart(serializeCart(picks))).toEqual(picks);
  });

  it('drops malformed entries one by one, never the list', () => {
    const raw = JSON.stringify({ picks: [p('d', 'a'), null, 7, { docId: 'd' }, { docId: '', questionId: 'x' }, { docId: 'd', questionId: 3 }, p('d', 'b')] });
    expect(keys(parseCart(raw))).toEqual(['a', 'b']);
  });

  it('reads nothing from empty, broken or foreign values', () => {
    for (const raw of [null, undefined, '', 'not json', '[]', '{}', '{"picks":"x"}', 'null', '42']) expect(parseCart(raw)).toEqual([]);
  });

  it('keeps the first of duplicate entries', () => {
    expect(keys(parseCart(serializeCart([p('d', 'a'), p('d', 'b'), p('d', 'a')])))).toEqual(['a', 'b']);
  });

  it('stores only references, nothing else a row carries', () => {
    const stored = JSON.parse(serializeCart([{ ...p('d', 'a'), excerpt: 'x' } as CartPick]));
    expect(stored).toEqual({ picks: [{ docId: 'd', questionId: 'a' }] });
  });
});

describe('storage that throws or is missing', () => {
  it('reads as empty and writes nothing, without throwing', () => {
    const broken = memory(true);
    expect(readCart(broken)).toEqual([]);
    expect(() => writeCart(broken, [p('d', 'a')])).not.toThrow();
    expect(readCart(undefined)).toEqual([]);
    expect(() => writeCart(undefined, [p('d', 'a')])).not.toThrow();
  });

  it('a cart over throwing storage still works in memory', () => {
    const cart = createBankCart(() => memory(true));
    cart.getState().toggle(row({ docId: 'd', questionId: 'a', rootId: 'a' }), () => undefined);
    expect(keys(cart.getState().picks)).toEqual(['a']);
  });
});

describe('togglePick', () => {
  const a = row({ docId: 'd1', questionId: 'a', rootId: 'root' });
  const aCopy = row({ docId: 'd2', questionId: 'a2', rootId: 'root' });
  const b = row({ docId: 'd1', questionId: 'b', rootId: 'b' });
  const roots = new Map([a, aCopy, b].map((r) => [rowKey(r), r.rootId]));
  const rootOf = (key: string) => roots.get(key);

  it('adds to the end, and takes the same row back out', () => {
    const once = togglePick([], a, rootOf);
    const twice = togglePick(once, b, rootOf);
    expect(keys(twice)).toEqual(['a', 'b']);
    expect(keys(togglePick(twice, a, rootOf))).toEqual(['b']);
  });

  it('treats copies of one question as one pick', () => {
    const picked = togglePick([], aCopy, rootOf);
    expect(togglePick(picked, a, rootOf)).toEqual([]);
  });
});

describe('movePick and stepTarget', () => {
  const list = [p('d', 'a'), p('d', 'b'), p('d', 'c'), p('d', 'd')];
  const k = (id: string) => rowKey(p('d', id));

  it('moves before a key, or to the end', () => {
    expect(keys(movePick(list, k('d'), k('a')))).toEqual(['d', 'a', 'b', 'c']);
    expect(keys(movePick(list, k('a'), k('c')))).toEqual(['b', 'a', 'c', 'd']);
    expect(keys(movePick(list, k('a')))).toEqual(['b', 'c', 'd', 'a']);
  });

  it('changes nothing for an unknown key or itself', () => {
    expect(keys(movePick(list, k('zz'), k('a')))).toEqual(['a', 'b', 'c', 'd']);
    expect(keys(movePick(list, k('b'), k('b')))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('steps one place up or down, and stops at the ends', () => {
    const shown = list.map((pick) => rowKey(pick));
    const step = (id: string, delta: -1 | 1) => {
      const before = stepTarget(shown, k(id), delta);
      return before === null ? null : keys(movePick(list, k(id), before));
    };
    expect(step('c', -1)).toEqual(['a', 'c', 'b', 'd']);
    expect(step('b', 1)).toEqual(['a', 'c', 'b', 'd']);
    expect(step('c', 1)).toEqual(['a', 'b', 'd', 'c']);
    expect(step('a', -1)).toBeNull();
    expect(step('d', 1)).toBeNull();
  });
});

describe('sortByType', () => {
  it('puts MCQ before LQ and keeps each group in its order', () => {
    const types: Record<string, string> = { a: LQ, b: MCQ, c: LQ, d: MCQ, e: 'from-a-newer-build' };
    const list = ['e', 'a', 'b', 'c', 'd'].map((id) => p('x', id));
    const sorted = sortByType(list, (key) => types[key.split('\u0000')[1]]);
    expect(keys(sorted)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });

  it('knows when there is nothing to sort', () => {
    expect(isSortedByType([MCQ, MCQ, LQ])).toBe(true);
    expect(isSortedByType([LQ, MCQ])).toBe(false);
    expect(sortLabel()).toBe('MCQ before LQ');
  });
});

describe('prunePicks', () => {
  it('drops picks whose question is gone and counts them', () => {
    const list = [p('d', 'a'), p('gone', 'b'), p('d', 'c')];
    const live = new Set([rowKey(p('d', 'a')), rowKey(p('d', 'c'))]);
    const { kept, dropped } = prunePicks(list, (key) => live.has(key));
    expect(keys(kept)).toEqual(['a', 'c']);
    expect(dropped).toBe(1);
  });
});

describe('totals and labels', () => {
  it('counts, sums marks and splits by type in registry order', () => {
    const totals = cartTotals([row({ typeId: LQ, marks: 7 }), row({ typeId: MCQ, marks: 1 }), row({ typeId: MCQ, marks: 1 })]);
    expect(totals.count).toBe(3);
    expect(totals.marks).toBe(9);
    expect(typeSplitLabel(totals)).toBe('2 MCQ, 1 LQ');
  });

  it('names the first topic in words', () => {
    expect(cartTopicLabel(['C.ped'])).toBe('C · Price elasticity of demand');
    expect(cartTopicLabel(['C.ped', 'E', 'homework'])).toBe('C · Price elasticity of demand +1');
    expect(cartTopicLabel(['homework'])).toBeUndefined();
  });
});

describe('the cart store', () => {
  const r = (id: string, typeId: string = MCQ) => row({ docId: 'd', questionId: id, rootId: id, typeId });

  it('persists every change and reads it back in a new cart (a reload)', () => {
    const storage = memory();
    const cart = createBankCart(() => storage);
    for (const id of ['a', 'b', 'c']) cart.getState().toggle(r(id), () => undefined);
    cart.getState().move(rowKey(r('c')), rowKey(r('a')));
    const again = createBankCart(() => storage);
    expect(keys(again.getState().picks)).toEqual(['c', 'a', 'b']);
    expect(storage.map.has(CART_KEY)).toBe(true);
  });

  it('clear keeps the list for Undo; any other change forgets it', () => {
    const storage = memory();
    const cart = createBankCart(() => storage);
    cart.getState().toggle(r('a'), () => undefined);
    cart.getState().toggle(r('b'), () => undefined);
    cart.getState().clear();
    expect(cart.getState().picks).toEqual([]);
    expect(storage.map.has(CART_KEY)).toBe(false);
    cart.getState().undoClear();
    expect(keys(cart.getState().picks)).toEqual(['a', 'b']);
    cart.getState().clear();
    cart.getState().toggle(r('c'), () => undefined);
    expect(cart.getState().cleared).toBeNull();
  });

  it('removing the last pick offers Undo too; reset (after use) does not', () => {
    const cart = createBankCart(() => memory());
    cart.getState().toggle(r('a'), () => undefined);
    cart.getState().remove(rowKey(r('a')));
    expect(keys(cart.getState().cleared ?? [])).toEqual(['a']);
    cart.getState().undoClear();
    cart.getState().reset();
    expect(cart.getState().picks).toEqual([]);
    expect(cart.getState().cleared).toBeNull();
  });

  it('sorts and prunes through the store', () => {
    const storage = memory();
    const cart = createBankCart(() => storage);
    const rows = [r('a', LQ), r('b', MCQ), r('gone', MCQ)];
    for (const one of rows) cart.getState().toggle(one, () => undefined);
    const byKey = new Map(rows.map((one) => [rowKey(one), one]));
    cart.getState().sortByType((key) => byKey.get(key)?.typeId);
    expect(keys(cart.getState().picks)).toEqual(['b', 'gone', 'a']);
    expect(cart.getState().prune((key) => key !== rowKey(r('gone')))).toBe(1);
    expect(keys(createBankCart(() => storage).getState().picks)).toEqual(['b', 'a']);
    expect(cart.getState().prune(() => true)).toBe(0);
  });
});
