/**
 * sync-version.mjs against a temp copy of the repo layout (the script finds its root from
 * its own location). A harness like the other `scripts/*.test.ts`:
 * `npx vitest run scripts/sync-version.test.ts`.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SCRIPT = path.resolve(__dirname, 'sync-version.mjs');

const CARGO_TOML = `[package]
name = "my-app"
version = "0.5.0"

[dependencies]
serde = "1"
`;
const LOCK = `version = 4

[[package]]
name = "my-app-helper"
version = "0.5.0"

[[package]]
name = "my-app"
version = "0.5.0"
dependencies = [
 "serde",
]

[[package]]
name = "serde"
version = "0.5.0"
`;

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'sync-version-'));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, 'src-tauri'));
  copyFileSync(SCRIPT, path.join(root, 'scripts', 'sync-version.mjs'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.7.0' }));
  writeFileSync(path.join(root, 'src-tauri', 'tauri.conf.json'), '{\n  "version": "0.5.0"\n}\n');
  writeFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), CARGO_TOML);
  writeFileSync(path.join(root, 'src-tauri', 'Cargo.lock'), LOCK);
  return root;
}

const run = (root: string) =>
  spawnSync(process.execPath, [path.join(root, 'scripts', 'sync-version.mjs')], { encoding: 'utf8' });

describe('sync-version', () => {
  it('rewrites only the app package block in Cargo.lock', () => {
    const root = setup();
    const result = run(root);
    expect(result.status).toBe(0);
    expect(readFileSync(path.join(root, 'src-tauri', 'Cargo.lock'), 'utf8')).toBe(
      LOCK.replace('name = "my-app"\nversion = "0.5.0"', 'name = "my-app"\nversion = "0.7.0"'),
    );
    expect(readFileSync(path.join(root, 'src-tauri', 'Cargo.toml'), 'utf8')).toContain('version = "0.7.0"');
  });

  it('is idempotent', () => {
    const root = setup();
    run(root);
    expect(run(root).stdout).toContain('already in sync');
  });
});
