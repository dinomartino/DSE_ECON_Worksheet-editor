import { oneOf } from '@/settings/validators';
import type { FieldValidator, SettingsSchema } from '@/settings/types';

/**
 * Where the Past paper bank 歷屆試題庫 comes from (k-0443, plan k-0441 § 15).
 *
 * The bank is not in this repo and not in a teacher's documents: it is a set of static
 * files (`manifest.json` + `topics/<id>.json`) the editor downloads on demand from one
 * address. Two switches turn it off:
 *  - `BUILT_IN_SOURCE` below: the address every install uses. Empty = the feature is gone
 *    for every build made from here (no Library row, no tab, no download).
 *  - the data itself: `"enabled": false` in its `manifest.json` turns it off for every user
 *    at their next opening of the bank, with no release.
 * And per computer, Settings → Past paper bank: Built-in, Off, or another address
 * (`PAST_PAPER_SETTINGS`), which is how a local export is tried before anything is public.
 */

/**
 * The public data repo, served raw (GitHub sends `Access-Control-Allow-Origin: *`).
 * **Not created yet** (the user's go is pending, k-0441 decision 1): until it exists the
 * built-in source answers "not found", which the screen words as "can't be reached".
 */
export const BUILT_IN_SOURCE = 'https://raw.githubusercontent.com/dinomartino/dse-econ-question-bank/main/';

export type PastPaperMode = 'builtIn' | 'off' | 'custom';

export interface PastPaperSettings {
  mode: PastPaperMode;
  /** Used only with `mode: 'custom'`. */
  url: string;
}

/**
 * A source address: https anywhere; http only on this computer (a local export served by
 * `npm run dev` or any static server); or a path on the app's own origin (`/pastpaper-bank/`).
 * No credentials, no query. Stored as typed; `sourceUrl` adds the trailing slash.
 */
export const sourceAddress: FieldValidator<string> = (raw) => {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  if (value === '') return '';
  if (value.length > 2048 || /[\s{}]/.test(value)) return undefined;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.username || url.password || url.search) return undefined;
  if (url.protocol === 'https:') return value;
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return value;
  return undefined;
};

export const PAST_PAPER_SETTINGS: SettingsSchema<PastPaperSettings> = {
  section: 'pastPapers',
  version: 1,
  storageKey: 'econgen.settings.pastPapers',
  defaults: () => ({ mode: 'builtIn', url: '' }),
  fields: { mode: oneOf<PastPaperMode>(['builtIn', 'off', 'custom']), url: sourceAddress },
};

/** The feature exists in this build at all. */
export const pastPapersBuiltIn = (builtIn: string = BUILT_IN_SOURCE) => builtIn.trim() !== '';

/**
 * The base address files are read from (always ending in `/`), or undefined when the bank is
 * off: switched off here, no address typed, or no built-in source in this build. A build
 * without a built-in source ignores a stored custom address too: one constant removes it all.
 */
export function sourceUrl(settings: PastPaperSettings, builtIn: string = BUILT_IN_SOURCE): string | undefined {
  if (!pastPapersBuiltIn(builtIn) || settings.mode === 'off') return undefined;
  const base = settings.mode === 'custom' ? settings.url.trim() : builtIn.trim();
  if (!base || sourceAddress(base) === undefined) return undefined;
  return base.endsWith('/') ? base : `${base}/`;
}

/** A file of the pack at `base` (`topics/x.json`), refusing paths that climb out of it. */
export function fileUrl(base: string, file: string): string | undefined {
  if (!file || file.startsWith('/') || /(^|\/)\.\.(\/|$)/.test(file) || /^[a-z][a-z0-9+.-]*:/i.test(file) || file.includes('\\')) {
    return undefined;
  }
  return base + file;
}
