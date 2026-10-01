import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { wordingProblems } from '@/i18n/wording';
import { parseChangelog, type ChangelogText } from './changelog';

/**
 * Every CHANGELOG entry carries its 繁體中文 as a `<!-- zh: … -->` comment, which What's
 * new shows in 中文, held to the same Hong Kong wording checks as the interface catalogues.
 */

/** true once the existing entries' translations have merged: then every entry needs one. */
const EVERY_ENTRY = false;

const log = parseChangelog(readFileSync(path.resolve(__dirname, '../../CHANGELOG.md'), 'utf8'));

/** The bullet's bold lead, else its opening words: enough to find it in the file. */
function lead(en: string): string {
  const text = /^\*\*(.+?)\*\*/.exec(en)?.[1] ?? en;
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}

const entries: { where: string; text: ChangelogText }[] = [
  ...[log.unreleased, ...log.releases].flatMap((section) =>
    section.groups.flatMap((group) =>
      group.items.map((text) => ({ where: `${section.version} › ${group.title} › "${lead(text.en)}"`, text })),
    ),
  ),
  ...log.earlier.flatMap((prose) =>
    prose.paragraphs.map((text) => ({ where: `${prose.heading} › "${lead(text.en)}"`, text })),
  ),
];

describe('the CHANGELOG’s 繁體中文', () => {
  it('has entries to check', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.skipIf(!EVERY_ENTRY)('every bullet and Earlier paragraph has one', () => {
    const missing = entries
      .filter(({ text }) => !text.zh)
      .map(
        ({ where }) =>
          `${where}: no 繁體中文. Add it under the bullet in CHANGELOG.md as an indented ` +
          '`<!-- zh: … -->` line, then `npm run changelog` (docs/RECIPES.md § Adding a changelog line).',
      );
    expect(missing).toEqual([]);
  });

  it('each is Hong Kong Chinese that keeps the English terms', () => {
    const found = entries.flatMap(({ where, text }) =>
      text.zh === undefined
        ? []
        : wordingProblems(text.en, text.zh).map(
            (problem) => `${where}: ${problem}. Fix its <!-- zh: … --> (docs/design/ui-language.md).`,
          ),
    );
    expect(found).toEqual([]);
  });
});
