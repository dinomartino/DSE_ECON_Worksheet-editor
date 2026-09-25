import { parseChangelog } from './changelog';
import { CHANGELOG_MD } from './changelog.generated';

/** CHANGELOG.md as bundled into this build (see `scripts/sync-changelog.mjs`). */
export const CHANGELOG = parseChangelog(CHANGELOG_MD);

/**
 * Show the Unreleased section too — dev builds only. Next inlines `NODE_ENV` at build
 * time, so this is a constant in the bundle, not a runtime read.
 */
export const SHOW_UNRELEASED = process.env.NODE_ENV !== 'production';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-09-24" → "24 September 2026", without the viewer's time zone moving the day. */
export function formatReleaseDate(date: string | undefined): string | undefined {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null;
  if (!match) return date;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month} ${match[1]}` : date;
}
