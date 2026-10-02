import type { TermPreferences } from '@/glossary/types';
import type { FieldValidator, SettingsSchema } from './types';
import { appSettings } from './store';

/**
 * Settings → Translation terms 翻譯用語: the rendering a teacher writes for a term the EDB
 * glossary lists more than one way (entry key, verbatim → rendering), and the keys whose
 * choice also applies to related terms. Stored like every section, never in a document or
 * a backup. This validates the shape only; the glossary validates against its data on
 * every build and ignores a stale row (`src/glossary/choices.ts:sanitizePreferences`).
 */

const MAX_ROWS = 2000;
const MAX_KEY = 200;
const MAX_VALUE = 80;

/** An open record of short string → `value`, keeping the valid rows. */
function mapOf<V>(value: FieldValidator<V>): FieldValidator<Record<string, V>> {
  return (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined;
    const out: Record<string, V> = {};
    let n = 0;
    for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
      if (n >= MAX_ROWS) break;
      if (!key || key.length > MAX_KEY) continue;
      const valid = value(v);
      if (valid === undefined) continue;
      out[key] = valid;
      n++;
    }
    return out;
  };
}

const rendering: FieldValidator<string> = (raw) =>
  typeof raw === 'string' && raw.length > 0 && raw.length <= MAX_VALUE ? raw : undefined;
const on: FieldValidator<true> = (raw) => (raw === true ? true : undefined);

const EMPTY: TermPreferences = Object.freeze({ choices: Object.freeze({}), related: Object.freeze({}) });

export const TERM_SETTINGS: SettingsSchema<TermPreferences> = {
  section: 'terms',
  version: 1,
  storageKey: 'econgen.settings.terms',
  defaults: () => EMPTY,
  fields: { choices: mapOf(rendering), related: mapOf(on) },
};

/** The stored preferences now (the defaults when storage is blocked or empty). */
export function currentTermPreferences(): TermPreferences {
  return appSettings.read(TERM_SETTINGS);
}

/** A stable identity for a set of preferences, '' for none: the glossary loader's cache key. */
export function preferencesKey(prefs: TermPreferences): string {
  const sorted = (r: Readonly<Record<string, unknown>>) =>
    Object.keys(r)
      .sort()
      .map((k) => [k, r[k]]);
  const choices = sorted(prefs.choices);
  const related = sorted(prefs.related);
  return choices.length || related.length ? JSON.stringify([choices, related]) : '';
}
