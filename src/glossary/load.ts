import type { Glossary, TermPreferences } from './types';
import type { RawGlossary } from './parse';
import { currentTermPreferences, preferencesKey } from '@/settings/termPreferences';

/**
 * A glossary that matches nothing, pins nothing and checks nothing: what every caller
 * sees until the data is loaded, and a safe stand-in in tests.
 */
export function emptyGlossary(): Glossary {
  return {
    meta: { source: '', publisher: '', year: 0, entries: 0 },
    entries: [],
    matchEn: () => [],
    matchEnAll: () => [],
    matchZh: () => [],
    checkEnToZh: () => [],
    checkZhToEn: () => [],
    pin: () => [],
    autoFix: (_sourceEn, zh) => ({ runs: zh, fixes: [] }),
    preferences: { choices: {}, related: {} },
    choosable: [],
    related: () => [],
    terms: [],
    edbKeyFor: () => undefined,
  };
}

/** Built glossaries kept, newest last: the defaults and a few recent preference sets. */
const KEEP = 4;

/**
 * The glossary under the teacher's term preferences (Settings → Translation terms; the
 * stored ones when omitted), built once per set of preferences. The data is reached only
 * through a dynamic import here, so it is its own chunk and never in first load.
 */
export function loadGlossary(preferences: TermPreferences = currentTermPreferences()): Promise<Glossary> {
  const key = preferencesKey(preferences);
  let loading = built.get(key);
  if (!loading) {
    loading = Promise.all([import('./glossary'), import('./data/edb-economics-2020.json')]).then(
      ([{ createGlossary }, data]) =>
        createGlossary((data as { default?: RawGlossary }).default ?? (data as unknown as RawGlossary), undefined, preferences),
    );
    built.set(key, loading);
    if (built.size > KEEP) built.delete(built.keys().next().value!);
    // A failed load (an offline chunk fetch) is not cached: the next caller tries again.
    const failed = loading;
    failed.catch(() => {
      if (built.get(key) === failed) built.delete(key);
    });
  }
  return loading;
}

const built = new Map<string, Promise<Glossary>>();
