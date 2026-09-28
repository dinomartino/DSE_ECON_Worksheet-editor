import type { Glossary } from './types';
import type { RawGlossary } from './parse';

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
  };
}

/**
 * The glossary, loaded once. The data is reached only through a dynamic import here, so
 * it is its own chunk and never in first load.
 */
export function loadGlossary(): Promise<Glossary> {
  if (!loading) {
    loading = Promise.all([import('./glossary'), import('./data/edb-economics-2020.json')]).then(
      ([{ createGlossary }, data]) =>
        createGlossary((data as { default?: RawGlossary }).default ?? (data as unknown as RawGlossary)),
    );
    // A failed load (an offline chunk fetch) is not cached: the next caller tries again.
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

let loading: Promise<Glossary> | null = null;
