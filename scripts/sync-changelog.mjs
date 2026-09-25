#!/usr/bin/env node
// Copies CHANGELOG.md into src/whatsNew/changelog.generated.ts so the app can show
// "What's new" with no server and no Markdown loader. Run by `predev` and `prebuild`;
// the output is committed so tests and typecheck work from a clean checkout, and
// src/whatsNew/changelog.generated.test.ts fails CI when the copy is stale.
//   node scripts/sync-changelog.mjs           write the copy if it changed
//   node scripts/sync-changelog.mjs --check   exit 1 if the copy is stale
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(repoRoot, 'CHANGELOG.md');
const target = join(repoRoot, 'src', 'whatsNew', 'changelog.generated.ts');

/** The generated module for a given CHANGELOG.md text. */
export function generatedModule(markdown) {
  const body = markdown.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
  return (
    '// Generated from CHANGELOG.md by scripts/sync-changelog.mjs — do not edit.\n' +
    '// Run `npm run changelog` after changing CHANGELOG.md.\n' +
    `export const CHANGELOG_MD = \`${body}\`;\n`
  );
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const wanted = generatedModule(readFileSync(source, 'utf8'));
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (process.argv.includes('--check')) {
    if (current !== wanted) {
      console.error('sync-changelog: src/whatsNew/changelog.generated.ts is stale — run `npm run changelog`');
      process.exit(1);
    }
    console.log('sync-changelog: up to date');
  } else if (current !== wanted) {
    writeFileSync(target, wanted);
    console.log('sync-changelog: CHANGELOG.md → src/whatsNew/changelog.generated.ts');
  } else {
    console.log('sync-changelog: already in sync');
  }
}
