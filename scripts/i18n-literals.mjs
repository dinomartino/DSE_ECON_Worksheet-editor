#!/usr/bin/env node
/**
 * English-only interface text, counted per file: the ratchet behind
 * `src/i18n/literals.test.ts`. A file may lose UI literals, never gain them.
 *
 *   node scripts/i18n-literals.mjs           report; exit 1 when a file grew
 *   node scripts/i18n-literals.mjs --write   shrink src/i18n/literals.baseline.json to today
 *   node scripts/i18n-literals.mjs --write --grow   also accept growth (a moved file only)
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASELINE = path.join(ROOT, 'src/i18n/literals.baseline.json');
export const RECIPE = "docs/RECIPES.md § Translate an area's interface text";

/**
 * Not scanned: printed text, which stays English (docs/design/ui-language.md). No
 * component is listed; the paper's own literals there (Preview.tsx's teacher banner) take
 * `i18n-ignore` once their file is translated.
 */
export const ALLOWLIST = [
  'src/render/', // the IR
  'src/export/', // .docx, clipboard, PDF
  'src/registry/', // question-type defaults that print
  'src/model/', // document defaults
  'src/test/', // fixtures
];

/** Props whose string value a teacher reads. Object keys of the same name count too. */
const TEXT_PROPS = new Set([
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'ariaLabel',
  'title',
  'placeholder',
  'alt',
  'label',
  'hint',
  'description',
]);

/** `src/**\/*.tsx` and `src/components/**\/*.ts`, minus tests, catalogues and the allowlist. */
export function scannedFiles(root = ROOT) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const rel = path.relative(root, full).split(path.sep).join('/');
      const isTsx = rel.endsWith('.tsx');
      const isComponentTs = rel.startsWith('src/components/') && rel.endsWith('.ts') && !rel.endsWith('.d.ts');
      if (!isTsx && !isComponentTs) continue;
      if (/\.test\.tsx?$/.test(rel) || /(^|[/.])messages\.ts$/.test(rel)) continue;
      if (ALLOWLIST.some((a) => rel === a || rel.startsWith(a))) continue;
      out.push(rel);
    }
  };
  walk(path.join(root, 'src'));
  return out.sort();
}

const UNITS = new Set(['px', 'pt', 'cm', 'mm']);

/**
 * Words, not symbols: a Latin word that is not all capitals or a unit. "⌘K", "· Q",
 * "PDF", "✦ AI", "A4", "12 pt" are not UI literals; "Copy", "MCQ only" are.
 */
export function isUiText(text) {
  const words = text.replace(/&(?:#\w+|\w+);/g, ' ').match(/\S*[A-Za-z]\S*/g) ?? [];
  return words.some((w) => {
    const letters = w.replace(/[^A-Za-z]/g, '');
    if (UNITS.has(letters)) return false;
    return letters.length > 1 && letters !== letters.toUpperCase();
  });
}

const IGNORE = /i18n-ignore:\s*([^\n]*?)\s*(?:\*\/\s*\}?)?\s*$/;

/** The reason on the literal's line, or on a comment-only line just above it. */
function ignoreReason(lines, line) {
  const own = IGNORE.exec(lines[line] ?? '');
  if (own?.[1]) return own[1];
  const above = (lines[line - 1] ?? '').trim();
  if (/^(\/\/|\/\*|\{\/\*)/.test(above)) {
    const m = IGNORE.exec(above);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** The string pieces an expression can evaluate to: literals, template text, both branches. */
function stringsOf(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node];
  if (ts.isTemplateExpression(node)) return [node];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return stringsOf(node.expression);
  if (ts.isConditionalExpression(node)) return [...stringsOf(node.whenTrue), ...stringsOf(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
      return [...stringsOf(node.left), ...stringsOf(node.right)];
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return stringsOf(node.right);
    if (op === ts.SyntaxKind.PlusToken) return [...stringsOf(node.left), ...stringsOf(node.right)];
  }
  return [];
}

function textOf(node) {
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ');
  }
  return node.text;
}

function propName(name) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isJsxNamespacedName?.(name)) return `${name.namespace.text}:${name.name.text}`;
  return null;
}

/** @typedef {{ line: number, text: string, kind: string, ignored?: string }} Literal */

/**
 * Every UI literal in one file (line is 1-based).
 * @param {string} source
 * @returns {Literal[]}
 */
export function literalsIn(source, fileName = 'x.tsx') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const lines = source.split('\n');
  /** @type {Literal[]} */
  const found = [];
  const add = (node, text, what, start = node.getStart(sf)) => {
    if (!isUiText(text)) return;
    const line = sf.getLineAndCharacterOfPosition(start).line;
    const reason = ignoreReason(lines, line);
    found.push({ line: line + 1, text: text.trim().replace(/\s+/g, ' '), kind: what, ...(reason ? { ignored: reason } : {}) });
  };
  const visit = (node) => {
    if (ts.isJsxText(node)) {
      const offset = node.getFullText(sf).search(/\S/);
      if (offset >= 0) add(node, node.text, 'jsx text', node.pos + offset);
    } else if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const s of stringsOf(node.expression)) add(s, textOf(s), 'jsx text');
    } else if (ts.isJsxAttribute(node) && node.initializer) {
      const name = propName(node.name);
      if (name && TEXT_PROPS.has(name)) {
        const init = node.initializer;
        const values = ts.isStringLiteral(init) ? [init] : init.expression ? stringsOf(init.expression) : [];
        for (const s of values) add(s, textOf(s), name);
      }
    } else if (ts.isPropertyAssignment(node)) {
      const name = propName(node.name);
      if (name && TEXT_PROPS.has(name)) for (const s of stringsOf(node.initializer)) add(s, textOf(s), name);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

/**
 * Every scanned file that has any UI literal.
 * @returns {Record<string, Literal[]>}
 */
export function scan(root = ROOT) {
  /** @type {Record<string, Literal[]>} */
  const out = {};
  for (const rel of scannedFiles(root)) {
    const list = literalsIn(readFileSync(path.join(root, rel), 'utf8'), rel);
    if (list.length) out[rel] = list;
  }
  return out;
}

export const counted = (list) => list.filter((l) => !l.ignored).length;

export function readBaseline(file = BASELINE) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/**
 * Files over their baseline, files under it, and the counts today.
 * @param {Record<string, Literal[]>} found
 * @param {Record<string, number>} baseline
 */
export function compare(found, baseline) {
  const grown = [];
  const shrunk = [];
  const counts = {};
  for (const [file, list] of Object.entries(found)) {
    const n = counted(list);
    if (n) counts[file] = n;
    const was = baseline[file] ?? 0;
    if (n > was) grown.push({ file, was, now: n, list: list.filter((l) => !l.ignored) });
    else if (n < was) shrunk.push(file);
  }
  for (const file of Object.keys(baseline)) if (!counts[file]) shrunk.push(file);
  return { grown, shrunk: [...new Set(shrunk)].sort(), counts };
}

/** Lines changed since HEAD (`+` in the message), or null outside git or for a committed file. */
function changedLines(file) {
  try {
    const diff = execFileSync('git', ['diff', '--unified=0', 'HEAD', '--', file], { cwd: ROOT, encoding: 'utf8' });
    const lines = new Set();
    for (const m of diff.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
      for (let i = 0; i < Number(m[2] ?? 1); i++) lines.add(Number(m[1]) + i);
    }
    return lines.size ? lines : null;
  } catch {
    return null;
  }
}

/** @param {{ file: string, was: number, now: number, list: Literal[] }[]} grown */
export function growthMessage(grown) {
  const parts = grown.map(({ file, was, now, list }) => {
    const changed = changedLines(file);
    const row = (l) => `  ${changed?.has(l.line) ? '+' : ' '} ${file}:${l.line}  ${l.kind}  ${JSON.stringify(l.text)}`;
    return (
      `${file}: ${now} English-only UI literals, baseline ${was} (+${now - was}). In this file${changed ? ' (+ changed since HEAD)' : ''}:\n` +
      list.map(row).join('\n')
    );
  });
  return [
    'New English-only interface text. Every new interface string ships in English and Hong Kong Chinese (CLAUDE.md).',
    ...parts,
    `Fix: put the text in the area's messages.ts with en + zh and read it through useMessages (${RECIPE}).`,
    'Printed text (paper, .docx, PDF, document defaults) stays English: if this is one, or a brand name, add `// i18n-ignore: <reason>` (or `{/* i18n-ignore: <reason> */}`) on its line.',
  ].join('\n\n');
}

function main() {
  const args = process.argv.slice(2);
  const found = scan();
  const baseline = readBaseline();
  const { grown, shrunk, counts } = compare(found, baseline ?? {});
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (args.includes('--write')) {
    if (baseline && grown.length && !args.includes('--grow')) {
      process.stderr.write(`${growthMessage(grown)}\n\nNot written. --write only shrinks the baseline; --grow accepts growth (a moved file).\n`);
      process.exit(1);
    }
    const sorted = Object.fromEntries(Object.keys(counts).sort().map((f) => [f, counts[f]]));
    writeFileSync(BASELINE, `${JSON.stringify(sorted, null, 2)}\n`);
    process.stdout.write(`Wrote ${path.relative(ROOT, BASELINE)}: ${Object.keys(sorted).length} files, ${total} literals.\n`);
    return;
  }
  const ignored = Object.entries(found).flatMap(([file, list]) => list.filter((l) => l.ignored).map((l) => `  ${file}:${l.line}  ${l.ignored}`));
  process.stdout.write(`${Object.keys(counts).length} files, ${total} English-only UI literals.\n`);
  if (ignored.length) process.stdout.write(`i18n-ignore (${ignored.length}):\n${ignored.join('\n')}\n`);
  if (!baseline) return;
  if (shrunk.length) process.stdout.write(`Baseline can shrink (${shrunk.length} files): node scripts/i18n-literals.mjs --write\n`);
  if (grown.length) {
    process.stderr.write(`${growthMessage(grown)}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
