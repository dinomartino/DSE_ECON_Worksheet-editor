/**
 * App-wide Settings: per browser or computer, every worksheet, never in a document.
 * Each section owns one schema and one storage key under `econgen.settings.`.
 */

/** A section's id is its deep-link name. A plain string: a new section never edits this file. */
export type SettingsSectionId = string;
export interface SettingsEnv { desktop: boolean }
/** The value when valid, undefined when not (→ that field's default; other fields survive). Never throws. */
export type FieldValidator<V> = (raw: unknown) => V | undefined;
export interface SettingsSchema<T extends object> {
  section: SettingsSectionId;
  /** Bump only when a field's meaning or shape changes; add `migrate` for the step. */
  version: number;
  storageKey: `econgen.settings.${string}`;
  /** A function of the environment: a per-platform default is legitimate (rememberKey). */
  defaults: (env: SettingsEnv) => Readonly<T>;
  fields: { [K in keyof T]-?: FieldValidator<T[K]> };
  migrate?: (raw: Record<string, unknown>, fromVersion: number) => Record<string, unknown>;
}
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void }
