import { create } from 'zustand';
import { roundMinutes } from '@/model/paperSummary';
import { isPatternTag } from '@/model/patterns';
import { topicOf } from '@/model/topics';
import { listQuestionTypes } from '@/registry';
import type { BankRow } from '@/library/types';
import { rowKey, rowMinutes, typeName } from './bankPage';

/**
 * The bank screen's cart: the questions picked for a new worksheet, in the order they will
 * print. A per-viewer convenience, never document data: it lives in this tab's
 * sessionStorage (so it survives Open in worksheet, Home and a reload) and holds only
 * stable references, a copy being `(docId, questionId)`. Storage can be missing, full or
 * blocked, so every read and write is guarded and the cart still works in memory.
 */

/** One pick: a question in a saved document. */
export interface CartPick {
  docId: string;
  questionId: string;
}

export const CART_KEY = 'econgen.bankCart';
const OPEN_KEY = 'econgen.bankCartOpen';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const pickKey = (pick: CartPick) => rowKey(pick);

/** Stored picks, validated one by one: a malformed entry is dropped, never the list. Duplicates keep the first. */
export function parseCart(raw: string | null | undefined): CartPick[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  const list = value && typeof value === 'object' && Array.isArray((value as { picks?: unknown }).picks) ? (value as { picks: unknown[] }).picks : [];
  const seen = new Set<string>();
  const out: CartPick[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const { docId, questionId } = entry as Partial<CartPick>;
    if (typeof docId !== 'string' || typeof questionId !== 'string' || !docId || !questionId) continue;
    const pick = { docId, questionId };
    if (seen.has(pickKey(pick))) continue;
    seen.add(pickKey(pick));
    out.push(pick);
  }
  return out;
}

export function serializeCart(picks: readonly CartPick[]): string {
  return JSON.stringify({ picks: picks.map(({ docId, questionId }) => ({ docId, questionId })) });
}

export function readCart(storage: Store | undefined): CartPick[] {
  try {
    return parseCart(storage?.getItem(CART_KEY));
  } catch {
    return [];
  }
}

export function writeCart(storage: Store | undefined, picks: readonly CartPick[]): void {
  try {
    if (picks.length === 0) storage?.removeItem(CART_KEY);
    else storage?.setItem(CART_KEY, serializeCart(picks));
  } catch {
    // Full or blocked: the cart carries on in memory for this visit.
  }
}

/** This tab's sessionStorage, or nothing (server render, blocked storage). */
function sessionStore(): Store | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Whether the list under the tray is shown: remembered per viewer, open at first. */
export function readCartOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeCartOpen(open: boolean): void {
  try {
    window.localStorage.setItem(OPEN_KEY, open ? '1' : '0');
  } catch {
    // Not remembered; harmless.
  }
}

/* ------------------------------------------------------------------------------------ */
/* Pure edits                                                                           */
/* ------------------------------------------------------------------------------------ */

/**
 * Tick or untick a question. Picks are questions, not copies: when any copy of the row's
 * question (same `rootId`) is in the cart, every such pick comes out; otherwise the row
 * goes on the end. `rootOf` names the question behind a pick (undefined when not indexed).
 */
export function togglePick(
  picks: readonly CartPick[],
  row: Pick<BankRow, 'docId' | 'questionId' | 'rootId'>,
  rootOf: (key: string) => string | undefined,
): CartPick[] {
  const key = rowKey(row);
  const same = (pick: CartPick) => pickKey(pick) === key || rootOf(pickKey(pick)) === row.rootId;
  if (picks.some(same)) return picks.filter((pick) => !same(pick));
  return [...picks, { docId: row.docId, questionId: row.questionId }];
}

export function removePick(picks: readonly CartPick[], key: string): CartPick[] {
  return picks.filter((pick) => pickKey(pick) !== key);
}

/** The pick moved to sit just before `beforeKey`, or to the end without one. Unknown keys change nothing. */
export function movePick(picks: readonly CartPick[], key: string, beforeKey?: string): CartPick[] {
  const moving = picks.find((pick) => pickKey(pick) === key);
  if (!moving || beforeKey === key) return [...picks];
  const rest = picks.filter((pick) => pickKey(pick) !== key);
  const at = beforeKey === undefined ? -1 : rest.findIndex((pick) => pickKey(pick) === beforeKey);
  if (at < 0) return [...rest, moving];
  return [...rest.slice(0, at), moving, ...rest.slice(at)];
}

/**
 * One step up or down among the keys on screen (`shown`, in order). Returns the
 * `beforeKey` for `movePick`, or null when the pick is already at that end.
 */
export function stepTarget(shown: readonly string[], key: string, delta: -1 | 1): string | undefined | null {
  const at = shown.indexOf(key);
  if (at < 0) return null;
  if (delta < 0) return at === 0 ? null : shown[at - 1];
  if (at === shown.length - 1) return null;
  return shown[at + 2];
}

/** Type rank in the registry's order (MCQ, then LQ); a type this build does not know goes last. */
function typeRank(typeId: string | undefined): number {
  const at = listQuestionTypes().findIndex((type) => type.id === typeId);
  return at < 0 ? Number.MAX_SAFE_INTEGER : at;
}

/** Grouped by type in registry order ("MCQ before LQ"), each group keeping its order. */
export function sortByType(picks: readonly CartPick[], typeOf: (key: string) => string | undefined): CartPick[] {
  return picks
    .map((pick, index) => ({ pick, index, rank: typeRank(typeOf(pickKey(pick))) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ pick }) => pick);
}

/** Already in type order: the sort would change nothing. */
export function isSortedByType(typeIds: readonly string[]): boolean {
  return typeIds.every((typeId, i) => i === 0 || typeRank(typeIds[i - 1]) <= typeRank(typeId));
}

/** The label of the sort: the registry's types in order, "MCQ before LQ". */
export function sortLabel(): string {
  return listQuestionTypes()
    .map((type) => typeName(type.id))
    .join(' before ');
}

/** Picks whose question is still saved; the rest are counted, to say so once. */
export function prunePicks(picks: readonly CartPick[], exists: (key: string) => boolean): { kept: CartPick[]; dropped: number } {
  const kept = picks.filter((pick) => exists(pickKey(pick)));
  return { kept, dropped: picks.length - kept.length };
}

/* ------------------------------------------------------------------------------------ */
/* Totals                                                                               */
/* ------------------------------------------------------------------------------------ */

export interface CartTotals {
  count: number;
  marks: number;
  minutes: number;
  /** Each type present, in registry order: "3 MCQ, 2 LQ". */
  byType: { typeId: string; label: string; count: number }[];
}

export function cartTotals(rows: readonly Pick<BankRow, 'typeId' | 'marks'>[]): CartTotals {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.typeId, (counts.get(row.typeId) ?? 0) + 1);
  return {
    count: rows.length,
    marks: rows.reduce((sum, row) => sum + row.marks, 0),
    minutes: roundMinutes(rows.reduce((sum, row) => sum + rowMinutes(row), 0)),
    byType: [...counts]
      .sort(([a], [b]) => typeRank(a) - typeRank(b))
      .map(([typeId, count]) => ({ typeId, label: typeName(typeId), count })),
  };
}

/** "3 MCQ, 2 LQ". */
export function typeSplitLabel(totals: Pick<CartTotals, 'byType'>): string {
  return totals.byType.map(({ label, count }) => `${count} ${label}`).join(', ');
}

/** The row's first topic by name ("C · Law of demand"), "+1" for each more; free tags and 題型 are left out. */
export function cartTopicLabel(tags: readonly string[]): string | undefined {
  const topics = tags.filter((tag) => !isPatternTag(tag) && topicOf(tag));
  if (topics.length === 0) return undefined;
  const first = topicOf(topics[0])!;
  const name = `${first.parent ?? first.code} · ${first.en}`;
  return topics.length > 1 ? `${name} +${topics.length - 1}` : name;
}

/* ------------------------------------------------------------------------------------ */
/* The store                                                                            */
/* ------------------------------------------------------------------------------------ */

export interface BankCart {
  picks: CartPick[];
  /** The list as it was before Clear (or before its last pick was removed), for Undo; memory only. */
  cleared: CartPick[] | null;
  toggle: (row: Pick<BankRow, 'docId' | 'questionId' | 'rootId'>, rootOf: (key: string) => string | undefined) => void;
  remove: (key: string) => void;
  move: (key: string, beforeKey?: string) => void;
  sortByType: (typeOf: (key: string) => string | undefined) => void;
  /** Empty the list, keeping it for Undo. */
  clear: () => void;
  undoClear: () => void;
  /** Forget the Undo (the tray was closed or left). */
  dismissUndo: () => void;
  /** Empty the list after it was used (New worksheet from these, Add to): no Undo. */
  reset: () => void;
  /** Drop picks whose question is gone; returns how many. */
  prune: (exists: (key: string) => boolean) => number;
}

/** A cart over the given storage; the app's one is `useBankCart`. */
export function createBankCart(storage: () => Store | undefined = sessionStore) {
  const store = create<BankCart>((set, get) => ({
    picks: readCart(storage()),
    cleared: null,
    toggle: (row, rootOf) => set({ picks: togglePick(get().picks, row, rootOf), cleared: null }),
    remove: (key) => {
      const before = get().picks;
      const picks = removePick(before, key);
      set({ picks, cleared: picks.length === 0 && before.length > 0 ? before : null });
    },
    move: (key, beforeKey) => set({ picks: movePick(get().picks, key, beforeKey), cleared: null }),
    sortByType: (typeOf) => set({ picks: sortByType(get().picks, typeOf), cleared: null }),
    clear: () => {
      const before = get().picks;
      if (before.length > 0) set({ picks: [], cleared: before });
    },
    undoClear: () => {
      const cleared = get().cleared;
      if (cleared) set({ picks: cleared, cleared: null });
    },
    dismissUndo: () => {
      if (get().cleared) set({ cleared: null });
    },
    reset: () => set({ picks: [], cleared: null }),
    prune: (exists) => {
      const { kept, dropped } = prunePicks(get().picks, exists);
      if (dropped > 0) set({ picks: kept });
      return dropped;
    },
  }));
  store.subscribe((state, previous) => {
    if (state.picks !== previous.picks) writeCart(storage(), state.picks);
  });
  return store;
}

export const useBankCart = createBankCart();
