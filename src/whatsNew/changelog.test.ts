import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  findRelease,
  hasEntries,
  parseChangelog,
  sectionMarkdown,
} from './changelog';

const REAL = readFileSync(path.resolve(__dirname, '../../CHANGELOG.md'), 'utf8');

const SAMPLE = `# Changelog

Rules paragraph — not notes.

## Unreleased

## 1.2.0 — 2026-10-01

### Added
- **Bold lead**: a line that
  wraps onto a second line.
- Plain \`code\` item.

### Fixed
* Star bullet.

## 1.1.0 - 2026-09-01

### Changed
- One change.

## Earlier (before versions)

First paragraph
continues here.

Second paragraph.
`;

describe('parseChangelog — the real CHANGELOG.md', () => {
  const log = parseChangelog(REAL);

  it('parses with no problems', () => {
    expect(log.problems).toEqual([]);
  });

  it('reads Unreleased and every release, newest first, with dates', () => {
    expect(log.unreleased.version).toBe('Unreleased');
    expect(log.releases.length).toBeGreaterThanOrEqual(2);
    for (const release of log.releases) {
      expect(release.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(release.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(hasEntries(release)).toBe(true);
    }
    const versions = log.releases.map((r) => r.version);
    expect([...versions].sort((a, b) => compareVersions(b, a))).toEqual(versions);
  });

  it('0.3.0 keeps its groups and inline Markdown, continuation lines joined', () => {
    const release = findRelease(log, 'v0.3.0');
    expect(release?.date).toBe('2026-09-24');
    expect(release?.groups.map((g) => g.title)).toEqual(['Added', 'Changed']);
    const added = release!.groups[0].items;
    expect(added[0]).toBe(
      '**Export dialog**: question paper, a separate **answer key** `.docx`, or both, in any ' +
        'language, with **include/omit the cover page and the answer space** toggles.',
    );
    expect(added.every((item) => !item.includes('\n'))).toBe(true);
  });

  it('0.2.0 and the Earlier prose are there', () => {
    expect(findRelease(log, '0.2.0')?.groups.map((g) => g.title)).toEqual(['Added', 'Changed']);
    expect(log.earlier.map((e) => e.heading)).toEqual([
      'Earlier (web app, July–September 2026)',
    ]);
    expect(log.earlier[0].paragraphs).toHaveLength(1);
  });
});

describe('parseChangelog — the format', () => {
  const log = parseChangelog(SAMPLE);

  it('an empty Unreleased has no entries', () => {
    expect(hasEntries(log.unreleased)).toBe(false);
    expect(log.problems).toEqual([]);
  });

  it('accepts * bullets, hyphen dates, and joins wrapped bullets', () => {
    const release = findRelease(log, '1.2.0')!;
    expect(release.groups).toEqual([
      {
        title: 'Added',
        items: ['**Bold lead**: a line that wraps onto a second line.', 'Plain `code` item.'],
      },
      { title: 'Fixed', items: ['Star bullet.'] },
    ]);
    expect(findRelease(log, '1.1.0')?.date).toBe('2026-09-01');
  });

  it('joins prose paragraphs line by line', () => {
    expect(log.earlier[0].paragraphs).toEqual(['First paragraph continues here.', 'Second paragraph.']);
  });

  it('reports what it cannot place, and never throws', () => {
    const odd = parseChangelog(
      '## Unreleased\n- orphan\n### Removed\n- gone\nloose text\n## 2.0.0\n### Added\n- x\n## Unreleased\n',
    );
    expect(odd.problems).toEqual([
      'line 2: a bullet outside Added, Changed or Fixed',
      'line 3: "Removed" is not Added, Changed or Fixed',
      'line 4: a bullet outside Added, Changed or Fixed',
      'line 5: "loose text" is not a bullet',
      'line 6: "## 2.0.0" has no date',
      'line 9: a second "## Unreleased"',
    ]);
    expect(findRelease(odd, '2.0.0')?.groups[0].items).toEqual(['x']);
    for (const input of ['', '\n\n', '###', '## ', '- a', '`**[', '## 1.0.0 — nope', '\r\n## Unreleased\r\n### Added\r\n- crlf\r\n']) {
      expect(() => parseChangelog(input)).not.toThrow();
    }
    expect(parseChangelog('\r\n## Unreleased\r\n### Added\r\n- crlf\r\n').unreleased.groups[0].items).toEqual(['crlf']);
    // Not a string at all (a corrupt bundle): still no throw.
    expect(() => parseChangelog(undefined as unknown as string)).not.toThrow();
  });
});

describe('sectionMarkdown', () => {
  it('returns a section verbatim, without its heading', () => {
    expect(sectionMarkdown(SAMPLE, 'v1.1.0')).toBe('### Changed\n- One change.');
    expect(sectionMarkdown(SAMPLE, '1.2.0')).toContain('- **Bold lead**: a line that\n  wraps');
    expect(sectionMarkdown(SAMPLE, 'Unreleased')).toBe('');
    expect(sectionMarkdown(SAMPLE, '9.9.9')).toBeUndefined();
  });
});

describe('compareVersions', () => {
  it('orders numerically, prereleases before their release', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('v1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.3.0-beta.1', '1.3.0')).toBeLessThan(0);
    expect(compareVersions('1.3.0-beta.10', '1.3.0-beta.2')).toBeGreaterThan(0);
    expect(compareVersions('garbage', '1.0.0')).toBe(0);
  });
});
