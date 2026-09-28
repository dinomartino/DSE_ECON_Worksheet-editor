import type { Glossary } from './types';

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
  // P-GLOSS replaces this body
  return Promise.resolve(emptyGlossary());
}
