'use client';

import { useEffect } from 'react';
import { APPEARANCE_SETTINGS, applyTheme, DARK_QUERY, resolveTheme } from '@/settings/appearance';
import { useSettings } from '@/settings/store';

/** Keeps `<html data-theme>` in step with the choice, and with the OS while it is `system`. */
export function AppearanceEffect() {
  const [{ theme }] = useSettings(APPEARANCE_SETTINGS);
  useEffect(() => {
    const root = document.documentElement;
    const query = typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null;
    const apply = () => applyTheme(root, resolveTheme(theme, query?.matches ?? false));
    apply();
    if (theme !== 'system' || !query) return;
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [theme]);
  return null;
}
