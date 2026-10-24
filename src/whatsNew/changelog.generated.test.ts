import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseChangelog } from './changelog';
import { CHANGELOG_MD } from './changelog.generated';

describe('the bundled changelog', () => {
  it('is an exact copy of CHANGELOG.md — if this fails, run `npm run changelog`', () => {
    const source = readFileSync(path.resolve(__dirname, '../../CHANGELOG.md'), 'utf8');
    expect(CHANGELOG_MD === source, 'src/whatsNew/changelog.generated.ts is stale: run `npm run changelog`').toBe(true);
  });
});

describe('CHANGELOG.md', () => {
  // A merge that brings the same branch in twice can paste its entry twice; What's new and
  // the release body would then list it twice (it happened to "Start every question").
  it('lists no entry twice in one section', () => {
    const { unreleased, releases } = parseChangelog(CHANGELOG_MD);
    for (const section of [unreleased, ...releases]) {
      const entries = section.groups.flatMap((group) => group.items.map((item) => item.en));
      const twice = entries.filter((entry, index) => entries.indexOf(entry) !== index);
      expect(twice, `${section.version} repeats an entry`).toEqual([]);
    }
  });
});
