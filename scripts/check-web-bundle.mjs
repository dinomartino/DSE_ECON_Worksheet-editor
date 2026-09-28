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

// 3. The EDB glossary (about 20 KB gzip) is its own lazy chunk, never in first load.
// 不活躍合夥人 (sleeping partner) occurs once in the data and nowhere in `src/`; a
// minifier may write it as \u escapes.
const SENTINEL = ['不活躍合夥人', '\\u4e0d\\u6d3b\\u8e8d\\u5408\\u5925\\u4eba'];
const glossary = scripts
  .filter((file) => {
    const text = readFileSync(file, 'utf8');
    return SENTINEL.some((s) => text.includes(s) || text.toLowerCase().includes(s.toLowerCase()));
  })
  .map(chunkPath);
const glossaryProblems = [];
// Once UI code imports the glossary it must be in the bundle, or this check has gone blind.
const uiFiles = ['src/components', 'src/app'].flatMap((dir) => walk(dir)).filter((f) => /\.tsx?$/.test(f));
const uiUsesGlossary = uiFiles.some((file) => readFileSync(file, 'utf8').includes('@/glossary'));
if (glossary.length === 0 && uiUsesGlossary) {
  glossaryProblems.push('found no chunk holding the glossary — the sentinel or the bundle changed; update this check');
}
for (const file of files.filter((f) => f.endsWith('.html') || f.endsWith('.txt'))) {
  const text = readFileSync(file, 'utf8');
  for (const chunk of glossary) {
    if (text.includes(chunk)) glossaryProblems.push(`${relative(out, file)} loads the glossary chunk ${chunk}`);
  }
  if (SENTINEL.some((s) => text.includes(s))) glossaryProblems.push(`${relative(out, file)} inlines the glossary`);
}
for (const file of scripts) {
  const text = readFileSync(file, 'utf8');
  for (const match of text.matchAll(/\[((?:\s*"static\/chunks\/[^"]+\.js"\s*,?)+)\]/g)) {
    const group = [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (group.length > 1 && group.some((chunk) => glossary.includes(chunk))) {
      glossaryProblems.push(`the glossary is loaded together with ${group.join(', ')} (from ${chunkPath(file)})`);
    }
  }
}
if (glossaryProblems.length > 0) {
  console.error('check-web-bundle: the glossary left its lazy chunk:');
  for (const problem of glossaryProblems) console.error(`  - ${problem}`);
  console.error('Reach the data only through `loadGlossary()` in src/glossary/load.ts.');
  process.exit(1);
}
console.log(
  glossary.length
    ? `check-web-bundle: glossary in ${glossary.join(', ')}, loaded on demand`
    : 'check-web-bundle: glossary not in this build (no UI imports it yet)',
);
