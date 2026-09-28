import { useEffect, useState } from 'react';
import { loadGlossary } from './load';
import type { Glossary } from './types';

/** The glossary once loaded, else null. Starts the load on mount; a result that arrives
 *  after unmount, or a failed load, is ignored (callers then show no term findings). */
export function useGlossary(): Glossary | null {
  const [glossary, setGlossary] = useState<Glossary | null>(null);
  useEffect(() => {
    let live = true;
    loadGlossary().then(
      (loaded) => {
        if (live) setGlossary(loaded);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);
  return glossary;
}
