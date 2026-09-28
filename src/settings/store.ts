import type { SettingsEnv, SettingsSchema, StorageLike } from './types';

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

export function createSettingsStore(storage: () => StorageLike | null, env: SettingsEnv): SettingsStore {
  // P-SETTINGS replaces this body
  void storage;
  const defaults = new Map<string, object>();
  const read = <T extends object>(schema: SettingsSchema<T>): Readonly<T> => {
    let value = defaults.get(schema.storageKey) as Readonly<T> | undefined;
    if (!value) {
      value = schema.defaults(env);
      defaults.set(schema.storageKey, value);
    }
    return value;
  };
  return {
    read,
    write: (schema) => read(schema),
    reset: () => {},
    subscribe: () => () => {},
    persistent: () => false,
  };
}

/** Bound lazily to window.localStorage and isDesktop(). */
// P-SETTINGS replaces this binding (today: defaults only, nothing persisted)
export const appSettings: SettingsStore = createSettingsStore(() => null, { desktop: false });

export function useSettings<T extends object>(
  schema: SettingsSchema<T>,
): readonly [Readonly<T>, (patch: Partial<T>) => void] {
  // P-SETTINGS replaces this body
  return [appSettings.read(schema), () => {}] as const;
}
