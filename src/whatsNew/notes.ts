import { parseChangelog } from './changelog';
import { CHANGELOG_MD } from './changelog.generated';

/** CHANGELOG.md as bundled into this build (see `scripts/sync-changelog.mjs`). */
export const CHANGELOG = parseChangelog(CHANGELOG_MD);

/**
 * Show the Unreleased section too — dev builds only. Next inlines `NODE_ENV` at build
 * time, so this is a constant in the bundle, not a runtime read.
 */
export const SHOW_UNRELEASED = process.env.NODE_ENV !== 'production';
