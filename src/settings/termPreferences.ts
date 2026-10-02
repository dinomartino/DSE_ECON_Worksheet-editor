import type { TermPreferences } from '@/glossary/types';
import type { FieldValidator, SettingsSchema } from './types';
import { appSettings } from './store';
import { cleanCustomTerm, cleanRenderings, type CustomTerm } from './termData';

/**
 * Settings → Translation terms 翻譯用語: the rendering a teacher writes for a term the EDB
 * glossary lists more than one way (entry key, verbatim → rendering), the keys whose choice
 * also applies to related terms, the teacher's own renderings of EDB terms (v2) and the terms
 * they added (v2). Stored like every section, never in a document; Export / Import CSV and
 * the app backup carry a copy. Each row is validated alone, so one bad row never costs the
 * rest, and a row this build can't read is kept on write. The glossary validates against
 * its data on every build (`src/glossary/choices.ts:sanitize`).
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

const renderingList: FieldValidator<readonly string[]> = (raw) => {
  const list = cleanRenderings(raw);
  return list.length ? list : undefined;
};
const customTerm: FieldValidator<CustomTerm> = (raw) => cleanCustomTerm(raw);

const EMPTY: TermPreferences = Object.freeze({
  choices: Object.freeze({}),
  related: Object.freeze({}),
  own: Object.freeze({}),
  terms: Object.freeze({}),
});

export const TERM_SETTINGS: SettingsSchema<TermPreferences> = {
  section: 'terms',
  version: 2,
  storageKey: 'econgen.settings.terms',
  defaults: () => EMPTY,
  fields: { choices: mapOf(rendering), related: mapOf(on), own: mapOf(renderingList), terms: mapOf(customTerm) },
  // v2 adds the teacher's own renderings and terms; v1 choices carry over unchanged.
  migrate: (raw, from) => (from < 2 ? { ...raw, own: raw.own ?? {}, terms: raw.terms ?? {} } : raw),
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
  const parts = [prefs.choices, prefs.related, prefs.own ?? {}, prefs.terms ?? {}].map(sorted);
  return parts.some((p) => p.length) ? JSON.stringify(parts) : '';
}
