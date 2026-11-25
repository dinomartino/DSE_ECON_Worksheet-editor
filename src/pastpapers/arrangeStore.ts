import { useCallback, useSyncExternalStore } from 'react';
import { EMPTY_ARRANGEMENT, parseArrangement, type Arrangement } from './arrange';

/**
 * Where the teacher's arrangement of the Past paper bank is kept (k-0556): this computer's
 * localStorage, one entry per bank address (the built-in bank and another address keep their
 * own), never a document, never a backup, never sent anywhere. Blocked storage = the
 * arrangement lasts until the window closes.
 */

export const ARRANGE_KEY = 'econgen.pastPaperArrange.v1';

type Stored = Record<string, Arrangement>;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storage = (): StorageLike | undefined => {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

let cache: Stored | undefined;
const listeners = new Set<() => void>();

/** Every bank's arrangement as stored; anything malformed reads as none. */
export function readArrangements(from: StorageLike | undefined = storage()): Stored {
  if (cache) return cache;
  let raw: unknown;
  try {
    raw = JSON.parse(from?.getItem(ARRANGE_KEY) ?? '{}');
  } catch {
    raw = {};
  }
  const out: Stored = {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    for (const [base, value] of Object.entries(raw as Record<string, unknown>)) out[base] = parseArrangement(value);
  }
  cache = out;
  return out;
}

/** Keep one bank's arrangement (an empty one is removed). */
export function writeArrangement(base: string, arrangement: Arrangement, to: StorageLike | undefined = storage()) {
  const next: Stored = { ...readArrangements(to) };
  if (Object.keys(arrangement.topics).length === 0) delete next[base];
  else next[base] = arrangement;
  cache = next;
  try {
    to?.setItem(ARRANGE_KEY, JSON.stringify(next));
  } catch {
    // Full or blocked: the arrangement holds for this window only.
  }
  for (const listener of listeners) listener();
}

/** Forget the cached read (tests). */
export function resetArrangeCache() {
  cache = undefined;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The arrangement of the bank at `base`, and a setter. */
export function useArrangement(base: string | undefined): [Arrangement, (next: Arrangement) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => (base ? readArrangements()[base] ?? EMPTY_ARRANGEMENT : EMPTY_ARRANGEMENT),
    () => EMPTY_ARRANGEMENT,
  );
  const set = useCallback((next: Arrangement) => {
    if (base) writeArrangement(base, next);
  }, [base]);
  return [value, set];
}
