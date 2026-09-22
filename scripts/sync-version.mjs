#!/usr/bin/env node
// Single source of truth for the app version: package.json. Tauri reads its version from
// tauri.conf.json and Cargo reads its own from Cargo.toml, so both are rewritten in place
// rather than kept by hand — three numbers that disagree produce an updater that will not
// offer the release. Run by the `version` npm lifecycle hook, so `npm version <x>` carries
// the bump into the bundle and stages it in the same commit.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const confPath = join(repoRoot, 'src-tauri', 'tauri.conf.json');
const cargoPath = join(repoRoot, 'src-tauri', 'Cargo.toml');

const { version } = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
if (!version) throw new Error('package.json has no "version"');

/** Rewrite one file, preserving every byte but the version literal. */
function patch(path, pattern, replace) {
  const before = readFileSync(path, 'utf8');
  if (!pattern.test(before)) throw new Error(`no version field found in ${path}`);
  const after = before.replace(pattern, replace);
  if (after !== before) writeFileSync(path, after);
  return after !== before;
}

// tauri.conf.json: the top-level "version", not a nested one (anchored to line start + 2 spaces).
const confChanged = patch(confPath, /^ {2}"version": "[^"]*"/m, `  "version": "${version}"`);
// Cargo.toml: the first `version = "..."` after [package], never a dependency's.
const cargoChanged = patch(
  cargoPath,
  /(\[package\][\s\S]*?\n)version = "[^"]*"/,
  `$1version = "${version}"`,
);

const touched = [confChanged && 'tauri.conf.json', cargoChanged && 'Cargo.toml'].filter(Boolean);
console.log(
  touched.length
    ? `sync-version: ${version} → ${touched.join(', ')}`
    : `sync-version: ${version} already in sync`,
);
