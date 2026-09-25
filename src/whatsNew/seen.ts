import { compareVersions, findRelease, hasEntries, normalizeVersion, type Changelog } from './changelog';

/**
 * Which version's notes this viewer has already been shown. Outside the
 * `econ-worksheet:` prefix (every key there is a document) and outside the index.
 */
export const LAST_SEEN_VERSION_KEY = 'econ-worksheet-last-seen-version';

export type LaunchDecision =
  /** Pop "What's new in `version`"; the dismissal records it. */
  | { kind: 'show'; version: string }
  /** Record `version` silently: a first run, a downgrade, or a version with no notes. */
  | { kind: 'record'; version: string }
  | { kind: 'none' };

/**
 * What to do on launch. A first-ever run shows nothing — but someone with saved work
 * and no record ran a build from before this key existed, so that is an update.
 */
export function decideWhatsNew(
  current: string | null | undefined,
  lastSeen: string | null | undefined,
  changelog: Changelog,
  returningUser: boolean,
): LaunchDecision {
  if (!current) return { kind: 'none' };
  const version = normalizeVersion(current);
  if (lastSeen && normalizeVersion(lastSeen) === version) return { kind: 'none' };
  if (!lastSeen && !returningUser) return { kind: 'record', version };

  const newer = !lastSeen || compareVersions(version, lastSeen) > 0;
  if (newer && hasEntries(findRelease(changelog, version))) return { kind: 'show', version };
  return { kind: 'record', version };
}

/** Best effort: storage blocked reads as "never seen" and writes do nothing. */
export function readLastSeen(): string | null {
  try {
    return window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
  } catch {
    return null;
  }
}

export function writeLastSeen(version: string): void {
  try {
    window.localStorage.setItem(LAST_SEEN_VERSION_KEY, normalizeVersion(version));
  } catch {
    // Blocked storage: the notes may show again next launch, which is harmless.
  }
}
