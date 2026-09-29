import { vi } from 'vitest';
import type { StoreChangeListener } from '@/storage/changes';

/** Test-only helpers for the persistent bank index and the change feed. */

/** A `localStorage` the web store accepts under node (own enumerable keys, like a browser). */
export function fakeLocalStorage(): Storage {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, String(v)),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  };
  return new Proxy(storage as unknown as Storage, {
    ownKeys: () => [...map.keys()],
    getOwnPropertyDescriptor: (_t, p) =>
      map.has(String(p)) ? { configurable: true, enumerable: true, value: map.get(String(p)) } : undefined,
    get: (target, p) => (p in target ? (target as never)[p] : (map.get(String(p)) as never)),
  });
}

/** Install a fresh fake `window.localStorage`; call in `beforeEach`. */
export function installLocalStorage(): Storage {
  const storage = fakeLocalStorage();
  vi.stubGlobal('window', { localStorage: storage });
  return storage;
}

/** A private change feed: `emit` for `withChangeFeed`, `subscribe` for the index. */
export function localFeed() {
  const listeners = new Set<StoreChangeListener>();
  const events: Parameters<StoreChangeListener>[0][] = [];
  return {
    events,
    emit: ((change, worksheet) => {
      events.push(change);
      for (const listener of listeners) listener(change, worksheet);
    }) as StoreChangeListener,
    subscribe(listener: StoreChangeListener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
