import { useEffect, useState } from 'react';
import { useSettings } from '@/settings/store';
import { TERM_SETTINGS } from '@/settings/termPreferences';
import { loadGlossary } from './load';
import type { Glossary } from './types';

/** The glossary once loaded, else null; rebuilt when the term preferences change (the
 *  previous one stays until the new one is ready). Starts the load on mount, or once
 *  `enabled` turns true; a result that arrives after unmount or a newer change, or a failed
 *  load, is ignored (callers then show no term findings). */
export function useGlossary(enabled = true): Glossary | null {
  const [preferences] = useSettings(TERM_SETTINGS);
  const [glossary, setGlossary] = useState<Glossary | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    loadGlossary(preferences).then(
      (loaded) => {
        if (live) setGlossary(loaded);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [preferences, enabled]);
  return glossary;
}
