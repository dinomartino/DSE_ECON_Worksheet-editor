#!/usr/bin/env node
// Prints one version's CHANGELOG.md section as Markdown — the GitHub release body:
//   node scripts/release-notes.mjs vX.Y.Z > /tmp/notes.md
// Exits 1 if that version has no section, or if `## Unreleased` still has entries (the
// changelog was not closed before tagging). --allow-unreleased skips the second check,
// for reprinting an older release's notes. --file <path> reads another changelog.
//
// The parser is src/whatsNew/changelog.ts, shared with the app. Node strips its types;
// on a Node that needs the flag for that, this script re-runs itself with it.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

if (!process.features.typescript) {
  const run = spawnSync(
    process.execPath,
    ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit' },
  );
  process.exit(run.status ?? 1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const { findRelease, hasEntries, parseChangelog, sectionMarkdown, normalizeVersion } = await import(
  join(repoRoot, 'src', 'whatsNew', 'changelog.ts')
);

const args = process.argv.slice(2);
const fileAt = args.indexOf('--file');
const file = fileAt === -1 ? join(repoRoot, 'CHANGELOG.md') : resolve(args[fileAt + 1] ?? '');
const allowUnreleased = args.includes('--allow-unreleased');
const version = args.find((a, i) => !a.startsWith('--') && (fileAt === -1 || i !== fileAt + 1));

function fail(message) {
  console.error(`release-notes: ${message}`);
  process.exit(1);
}

if (!version) fail('usage: node scripts/release-notes.mjs vX.Y.Z [--allow-unreleased] [--file CHANGELOG.md]');

let markdown;
try {
  markdown = readFileSync(file, 'utf8');
} catch {
  fail(`cannot read ${file}`);
}

const wanted = normalizeVersion(version);
const today = new Date().toISOString().slice(0, 10);
const changelog = parseChangelog(markdown);
const closeHint =
  `Close the changelog first: rename "## Unreleased" to "## ${wanted} — ${today}", ` +
  'start a fresh empty "## Unreleased" above it, and commit (RELEASING.md, "Cutting a release").';

if (!findRelease(changelog, wanted)) {
  fail(`CHANGELOG.md has no "## ${wanted} — YYYY-MM-DD" section.\n${closeHint}`);
}
if (hasEntries(changelog.unreleased) && !allowUnreleased) {
  fail(
    `"## Unreleased" still has entries, and a release is cut only from a closed changelog.\n` +
      `Releasing ${wanted} now? Move those entries into its section, leave "## Unreleased" empty, and commit.\n` +
      `Reprinting the notes of ${wanted}, already released? Add --allow-unreleased.`,
  );
}

const body = sectionMarkdown(markdown, wanted);
if (!body) fail(`the ${wanted} section is empty`);
process.stdout.write(`${body}\n`);
