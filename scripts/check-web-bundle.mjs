#!/usr/bin/env node
// postbuild: fail the build if Tauri code reached the web bundle's static graph.
//
// A sanctioned `await import('@tauri-apps/…')` becomes a chunk of its own, fetched alone
// by a loader and only when called. A static import instead ships the Tauri chunk with
// the page's own scripts, or loads it together with app chunks. A Tauri chunk is one
// holding an IPC command string (`plugin:fs|read_text_file`); our own code has none.
//   node scripts/check-web-bundle.mjs [outDir]
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const out = process.argv[2] ?? 'out';
const TAURI = /plugin:[a-z][a-z-]*\|[a-z_]+/;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const files = walk(out);
const chunkPath = (file) => relative(out, file).replaceAll('\\', '/').replace(/^_next\//, '');
const scripts = files.filter((file) => file.endsWith('.js'));
const tauri = new Set(scripts.filter((file) => TAURI.test(readFileSync(file, 'utf8'))).map(chunkPath));
const problems = [];

// 1. Loaded by a page up front (HTML, or the RSC payload's client references).
for (const file of files.filter((f) => f.endsWith('.html') || f.endsWith('.txt'))) {
  const text = readFileSync(file, 'utf8');
  for (const chunk of tauri) {
    if (text.includes(chunk)) problems.push(`${relative(out, file)} loads Tauri chunk ${chunk}`);
  }
}

// 2. Loaded together with app code: every chunk list a loader fetches as one group.
let groupsWithTauri = 0;
for (const file of scripts) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[((?:\s*"static\/chunks\/[^"]+\.js"\s*,?)+)\]/g)) {
    const group = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const tauriInGroup = group.filter((chunk) => tauri.has(chunk));
    if (tauriInGroup.length === 0) continue;
    groupsWithTauri += 1;
    const app = group.filter((chunk) => !tauri.has(chunk));
    if (app.length > 0) {
      problems.push(`${tauriInGroup.join(', ')} is loaded statically with ${app.join(', ')} (from ${chunkPath(file)})`);
    }
  }
}

// The desktop build's own dynamic imports must be found, or this check has gone blind.
if (tauri.size === 0 || groupsWithTauri === 0) {
  problems.push(
    'found no dynamically loaded Tauri chunk — the bundle format changed; update scripts/check-web-bundle.mjs',
  );
}

if (problems.length > 0) {
  console.error('check-web-bundle: @tauri-apps reached the web bundle’s static graph:');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('Reach Tauri only through `await import()` inside a function (§ Desktop shell).');
  process.exit(1);
}
console.log(`check-web-bundle: ${tauri.size} Tauri chunks, all loaded on demand`);
