import { isDesktop } from '@/platform';

/**
 * How full the web build's document storage is (k-0444). In a browser every document, the
 * index, Trash and the settings share one `localStorage` of about 5 MB per site (browsers
 * count UTF-16 code units: 5 Mi of them in Chrome, Edge and Firefox, about the same in
 * Safari), and a save that does not fit fails. Pictures are stored inside the documents as
 * text, so a worksheet of past-paper diagrams is what fills it. The desktop app saves files
 * on disk and has no such limit: there, nothing here applies.
 *
 * Read only: nothing here writes storage. Measured as key + value lengths, the unit the
 * browsers count.
 */

/** The share of storage browsers give a site, in UTF-16 code units. */
export const WEB_STORAGE_LIMIT = 5 * 1024 * 1024;
/** From here the teacher is told (the toolbar, the Past paper bank's Add). */
export const NEARLY_FULL = 0.8;

export interface StorageUse {
  used: number;
  limit: number;
  /** used / limit. */
  ratio: number;
}

function webStorage(): Storage | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** Code units held by `storage`. */
export function storageUsed(storage: Storage): number {
  let used = 0;
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key === null) continue;
    used += key.length + (storage.getItem(key)?.length ?? 0);
  }
  return used;
}

/**
 * The browser's document storage as it stands, plus `adding` more code units; undefined on
 * desktop or where storage cannot be read (nothing to warn about there).
 */
export function webStorageUse(adding = 0, storage: Storage | undefined = webStorage(), desktop = isDesktop()): StorageUse | undefined {
  if (desktop || !storage) return undefined;
  const used = storageUsed(storage) + Math.max(0, adding);
  return { used, limit: WEB_STORAGE_LIMIT, ratio: used / WEB_STORAGE_LIMIT };
}

/** Megabytes as the warnings print them ("4.3"): the limit then reads 5.0. */
export const megabytes = (units: number) => (units / (1024 * 1024)).toFixed(1);
