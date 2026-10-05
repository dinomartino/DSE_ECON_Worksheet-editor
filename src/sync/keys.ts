import type { Place } from './types';

/**
 * Logical keys. v1 syncs documents (`<id>.worksheet.json`) and Trash
 * (`trash/<id>.worksheet.json`); `graphs/…`, `folders.json` and `patterns.json` are
 * reserved for later and ignored here.
 */

export const WORKSHEET_SUFFIX = '.worksheet.json';
const TRASH_PREFIX = 'trash/';

export function documentKey(id: string, place: Place): string {
  return `${place === 'trash' ? TRASH_PREFIX : ''}${id}${WORKSHEET_SUFFIX}`;
}

/**
 * What a key may hold: a document at `place`, with `stem` the id its name claims.
 * Undefined for anything that is not a document key. Provider conflict copies keep
 * `.worksheet` inside a changed name ("x.worksheet (1).json", "x.worksheet-PC.json",
 * "x (conflict copy).worksheet.json"), so they qualify, with no `stem` unless the name
 * still looks canonical. The id inside the file decides in the end (`plan.ts`).
 */
export function classifyKey(key: string): { place: Place; stem?: string } | undefined {
  const place: Place = key.startsWith(TRASH_PREFIX) ? 'trash' : 'live';
  const name = place === 'trash' ? key.slice(TRASH_PREFIX.length) : key;
  if (name.length === 0 || name.includes('/') || name.startsWith('.')) return undefined;
  if (!name.endsWith('.json') || !name.includes('.worksheet')) return undefined;
  if (!name.endsWith(WORKSHEET_SUFFIX)) return { place };
  const stem = name.slice(0, -WORKSHEET_SUFFIX.length);
  return stem.length > 0 ? { place, stem } : { place };
}
