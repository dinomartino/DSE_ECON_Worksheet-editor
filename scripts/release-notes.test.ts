/**
 * The release-body script, run as RELEASING.md runs it. A harness like the other
 * `scripts/*.test.ts`: `npx vitest run scripts/release-notes.test.ts` (not in `npm test`;
 * the parser it shares is covered there by `src/whatsNew/changelog.test.ts`).
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(__dirname, 'release-notes.mjs');

function run(markdown: string, ...args: string[]) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-notes-'));
  const file = path.join(dir, 'CHANGELOG.md');
  writeFileSync(file, markdown);
  const result = spawnSync(process.execPath, [SCRIPT, ...args, '--file', file], { encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const CLOSED = `# Changelog

## Unreleased

## 0.4.0 — 2026-10-01

### Added
- **Shaded areas** on diagrams: consumer
  surplus and more.

### Fixed
- A fix.

## 0.3.0 — 2026-09-24

### Added
- Old.
`;

describe('scripts/release-notes.mjs', () => {
  it('prints the section body as written, without its heading', () => {
    const { status, stdout } = run(CLOSED, 'v0.4.0');
    expect(status).toBe(0);
    expect(stdout).toBe(
      '### Added\n- **Shaded areas** on diagrams: consumer\n  surplus and more.\n\n### Fixed\n- A fix.\n',
    );
  });

  it('fails clearly when the version has no section', () => {
    const { status, stdout, stderr } = run(CLOSED, 'v0.5.0');
    expect(status).toBe(1);
    expect(stdout).toBe('');
    expect(stderr).toContain('no "## 0.5.0 — YYYY-MM-DD" section');
    expect(stderr).toContain('rename "## Unreleased"');
  });

  it('fails when Unreleased still has entries, unless told this is a reprint', () => {
    const open = CLOSED.replace('## Unreleased\n', '## Unreleased\n\n### Added\n- Forgotten.\n');
    const refused = run(open, 'v0.4.0');
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain('"## Unreleased" still has entries');
    const reprint = run(open, 'v0.3.0', '--allow-unreleased');
    expect(reprint.status).toBe(0);
    expect(reprint.stdout).toBe('### Added\n- Old.\n');
  });

  it('needs a version', () => {
    expect(run(CLOSED).status).toBe(1);
  });
});
