import { useCallback, useSyncExternalStore } from 'react';
import { isDesktop } from '@/platform';
import type { FieldValidator, SettingsEnv, SettingsSchema, StorageLike } from './types';

/**
 * The typed settings store. One JSON value per section, `{"v":1, …fields}` under its
 * `storageKey`; validated per field, so an invalid field reads as its default and the rest
 * survive; writes preserve unknown keys and never lower `v`. Secrets never go here.
 */
export interface SettingsStore {
  /** Memoised; stable identity until changed. */
  read<T extends object>(schema: SettingsSchema<T>): Readonly<T>;
  write<T extends object>(schema: SettingsSchema<T>, patch: Partial<T>): Readonly<T>;
  reset<T extends object>(schema: SettingsSchema<T>): void;
  subscribe<T extends object>(schema: SettingsSchema<T>, listener: () => void): () => void;
  /** False when storage is blocked. */
  persistent(): boolean;
}

type Raw = Record<string, unknown>;
interface Entry { schema: SettingsSchema<object>; raw: Raw; value: object; json: string }

const isPlainObject = (x: unknown): x is Raw => typeof x === 'object' && x !== null && !Array.isArray(x);

function storedVersion(raw: Raw, fallback: number): number {
  return typeof raw.v === 'number' && Number.isFinite(raw.v) ? raw.v : fallback;
}

function validate<T extends object>(schema: SettingsSchema<T>, raw: Raw, env: SettingsEnv): Readonly<T> {
  const defaults = schema.defaults(env);
  const out = {} as T;
  for (const name of Object.keys(schema.fields) as Array<keyof T & string>) {
    const valid = (schema.fields[name] as FieldValidator<T[typeof name]>)(raw[name]);
    out[name] = valid === undefined ? defaults[name] : valid;
  }
  return out;
}

/**
 * A record field is written as a whole, so keep the stored entries this build cannot
 * read (a newer build's provider, an invalid value) unless the patch names them.
 */
function keepUnreadable(stored: unknown, next: unknown, validator: FieldValidator<unknown>): unknown {
  if (!isPlainObject(stored) || !isPlainObject(next)) return next;
  const kept: Raw = {};
  for (const [key, value] of Object.entries(stored)) {
    if (key in next) continue;
    const readable = validator({ [key]: value });
    if (!isPlainObject(readable) || !(key in readable)) kept[key] = value;
  }
  return { ...kept, ...next };
}

export function createSettingsStore(storage: () => StorageLike | null, env: SettingsEnv): SettingsStore {
  const entries = new Map<string, Entry>();
  const listeners = new Map<string, Set<() => void>>();
  let blocked = false;
  let watching = false;

  const load = (key: string): Raw => {
    try {
      const store = storage();
      if (!store) {
        blocked = true;
        return {};
      }
      const text = store.getItem(key);
      if (text === null) return {};
      const parsed: unknown = JSON.parse(text);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };

  /** Written as-is; on failure the value lives in memory for the tab. */
  const save = (key: string, raw: Raw) => {
    try {
      const store = storage();
      if (!store) throw new Error('no storage');
      store.setItem(key, JSON.stringify(raw));
    } catch {
      blocked = true;
    }
  };

  const settle = <T extends object>(schema: SettingsSchema<T>, raw: Raw, previous?: Entry): Entry => {
    const value = validate(schema, raw, env);
    const json = JSON.stringify(value);
    const kept = previous && previous.json === json ? previous.value : value;
    const entry: Entry = { schema: schema as SettingsSchema<object>, raw, value: kept, json };
    entries.set(schema.storageKey, entry);
    return entry;
  };

  /** `previous` keeps the value's identity across a re-read that changes nothing. */
  const entryFor = <T extends object>(schema: SettingsSchema<T>, previous?: Entry): Entry => {
    const cached = entries.get(schema.storageKey);
    if (cached) return cached;
    let raw = load(schema.storageKey);
    const v = storedVersion(raw, schema.version);
    if (v < schema.version && schema.migrate) raw = { ...schema.migrate(raw, v), v: schema.version };
    return settle(schema, raw, previous);
  };

  const notify = (key: string) => {
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  };

  /** Writes the section's raw object and notifies only when the validated value changed. */
  const commit = <T extends object>(schema: SettingsSchema<T>, previous: Entry, raw: Raw): Readonly<T> => {
    raw.v = Math.max(storedVersion(previous.raw, schema.version), schema.version);
    save(schema.storageKey, raw);
    const next = settle(schema, raw, previous);
    if (next.value !== previous.value) notify(schema.storageKey);
    return next.value as Readonly<T>;
  };

  // Another tab wrote a section: re-read it. `key === null` is a storage.clear().
  const onStorage = (event: StorageEvent) => {
    for (const [key, previous] of [...entries]) {
      if (event.key !== null && event.key !== key) continue;
      entries.delete(key);
      if (entryFor(previous.schema, previous).value !== previous.value) notify(key);
    }
  };

  const write = <T extends object>(schema: SettingsSchema<T>, patch: Partial<T>): Readonly<T> => {
    const previous = entryFor(schema);
    const raw: Raw = { ...previous.raw };
    for (const [name, value] of Object.entries(patch)) {
      if (value === undefined || !(name in schema.fields)) continue;
      const validator = schema.fields[name as keyof T] as FieldValidator<unknown>;
      raw[name] = keepUnreadable(previous.raw[name], value, validator);
    }
    return commit(schema, previous, raw);
  };

  const reset = <T extends object>(schema: SettingsSchema<T>): void => {
    const previous = entryFor(schema);
    const raw: Raw = {};
    for (const [name, value] of Object.entries(previous.raw)) if (!(name in schema.fields)) raw[name] = value;
    commit(schema, previous, raw);
  };

  const subscribe = <T extends object>(schema: SettingsSchema<T>, listener: () => void): (() => void) => {
    if (!watching && typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      watching = true;
      window.addEventListener('storage', onStorage);
    }
    let set = listeners.get(schema.storageKey);
    if (!set) listeners.set(schema.storageKey, (set = new Set()));
    set.add(listener);
    return () => {
      set.delete(listener);
    };
  };

  return {
    read: <T extends object>(schema: SettingsSchema<T>) => entryFor(schema).value as Readonly<T>,
    write,
    reset,
    subscribe,
    persistent: () => {
      if (!blocked) {
        try {
          if (!storage()) blocked = true;
        } catch {
          blocked = true;
        }
      }
      return !blocked;
    },
  };
}

function browserStorage(): StorageLike | null {
  return typeof window === 'undefined' ? null : window.localStorage;
}

/** Bound lazily to window.localStorage and isDesktop(). */
export const appSettings: SettingsStore = createSettingsStore(browserStorage, {
  get desktop() {
    return isDesktop();
  },
});

const serverSnapshots = new WeakMap<object, object>();
function serverSnapshot<T extends object>(schema: SettingsSchema<T>): Readonly<T> {
  let value = serverSnapshots.get(schema) as Readonly<T> | undefined;
  if (!value) serverSnapshots.set(schema, (value = schema.defaults({ desktop: false })));
  return value;
}

export function useSettings<T extends object>(
  schema: SettingsSchema<T>,
): readonly [Readonly<T>, (patch: Partial<T>) => void] {
  const subscribe = useCallback((listener: () => void) => appSettings.subscribe(schema, listener), [schema]);
  const value = useSyncExternalStore(
    subscribe,
    () => appSettings.read(schema),
    () => serverSnapshot(schema),
  );
  const update = useCallback((patch: Partial<T>) => void appSettings.write(schema, patch), [schema]);
  return [value, update] as const;
}
