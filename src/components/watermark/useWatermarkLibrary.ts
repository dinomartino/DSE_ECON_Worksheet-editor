'use client';

import { useCallback } from 'react';
import { useSettings } from '@/settings/store';
import {
  MAX_SAVED_WATERMARKS,
  WATERMARK_SETTINGS,
  defaultWatermark,
  type SavedWatermark,
  type WatermarkSettings,
} from '@/settings/watermarks';
import type { PreparedWatermark } from './preparePicture';

export type AddResult = { ok: true; entry: SavedWatermark } | { ok: false; reason: 'full' | 'storage' };

const newId = () =>
  `wm-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/** Whether the browser really kept the library just written (a full quota keeps it in memory only). */
function persisted(id: string): boolean {
  try {
    return window.localStorage.getItem(WATERMARK_SETTINGS.storageKey)?.includes(`"${id}"`) ?? false;
  } catch {
    return false;
  }
}

/** The saved watermarks and the verbs on them (Settings → Watermarks, the toolbar, Setup). */
export function useWatermarkLibrary() {
  const [settings, update] = useSettings(WATERMARK_SETTINGS);

  const add = useCallback(
    (picture: PreparedWatermark, fields: Pick<SavedWatermark, 'name' | 'kind' | 'text'>): AddResult => {
      if (settings.library.length >= MAX_SAVED_WATERMARKS) return { ok: false, reason: 'full' };
      const entry: SavedWatermark = {
        id: newId(),
        name: fields.name.trim(),
        kind: fields.kind,
        ...(fields.kind === 'text' && fields.text ? { text: fields.text } : {}),
        ...picture,
        createdAt: new Date().toISOString(),
      };
      update({ library: [...settings.library, entry], lastUsedId: entry.id });
      if (!persisted(entry.id)) {
        // Taken back out: an entry that would vanish on the next launch is worse than none.
        update({ library: settings.library, lastUsedId: settings.lastUsedId });
        return { ok: false, reason: 'storage' };
      }
      return { ok: true, entry };
    },
    [settings, update],
  );

  const rename = useCallback(
    (id: string, name: string) =>
      update({ library: settings.library.map((entry) => (entry.id === id ? { ...entry, name: name.trim() } : entry)) }),
    [settings, update],
  );

  const remove = useCallback(
    (id: string) =>
      update({
        library: settings.library.filter((entry) => entry.id !== id),
        ...(settings.lastUsedId === id ? { lastUsedId: '' } : {}),
      }),
    [settings, update],
  );

  const markUsed = useCallback((id: string) => update({ lastUsedId: id }), [update]);

  return {
    library: settings.library,
    lastUsed: defaultWatermark(settings as WatermarkSettings),
    add,
    rename,
    remove,
    markUsed,
  };
}
