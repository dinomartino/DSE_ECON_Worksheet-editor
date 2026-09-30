#!/usr/bin/env node
// eslint output against lint-baseline.json: one line when nothing is new, else only the new problems.
// Usage: lint-delta.mjs            run `npm run lint` here and compare
//        lint-delta.mjs --stdin    compare eslint (stylish) output piped in
//        lint-delta.mjs --update   run lint and rewrite the baseline
// Unparseable input is printed unchanged. Exit 1 only when a new error appears.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadData, readStdin, repoPath, ROOT, SKILL_DIR } from './lib/util.mjs';

const PROBLEM = /^\s+(\d+):(\d+)\s+(error|warning)\s+(.+?)(?:\s{2,}(\S+))?\s*$/;
const SUMMARY = /^✖ (\d+) problems? \((\d+) errors?, (\d+) warnings?\)/m;

/** Problems from eslint's stylish output, or null when it does not look like eslint. */
export function parse(text, roots = [process.cwd(), ROOT]) {
  const problems = [];
  let file = null;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\x1b\[[0-9;]*m/g, '');
    if (/^\//.test(line) || /^[A-Za-z]:\\/.test(line)) {
      file = repoPath(line.trim(), roots) ?? line.trim();
      continue;
    }
    const m = file && line.match(PROBLEM);
    if (m) problems.push({ file, line: Number(m[1]), col: Number(m[2]), severity: m[3], message: m[4].trim(), rule: m[5] ?? '' });
  }
  const summary = text.replace(/\x1b\[[0-9;]*m/g, '').match(SUMMARY);
  if (!summary && !problems.length) return null;
  if (summary && Number(summary[1]) !== problems.length) return null;
  return problems;
}

const keyOf = (p) => `${p.file}|${p.rule}|${p.message}`;

/** Problems beyond the baseline's count for their (file, rule, message) key. */
export function delta(problems, baseline) {
  const left = new Map();
  for (const k of baseline.problems ?? []) left.set(k, (left.get(k) ?? 0) + 1);
  const fresh = [];
  for (const p of problems) {
    const k = keyOf(p);
    const n = left.get(k) ?? 0;
    if (n > 0) left.set(k, n - 1);
    else fresh.push(p);
  }
  const fixed = [...left.values()].reduce((a, b) => a + b, 0);
  return { fresh, fixed };
}

export function report(problems, baseline) {
  const errors = problems.filter((p) => p.severity === 'error').length;
  const total = `${problems.length} problems (${errors} errors, ${problems.length - errors} warnings)`;
  const { fresh, fixed } = delta(problems, baseline);
  const fixedNote = fixed ? `; ${fixed} baseline problem${fixed === 1 ? '' : 's'} gone (refresh: lint-delta.mjs --update)` : '';
  if (!fresh.length) return { text: `eslint: ${total}, all in the known baseline, none new${fixedNote}.`, newErrors: 0 };
  const byFile = new Map();
  for (const p of fresh) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p]);
  const lines = [];
  for (const [file, ps] of byFile) {
    lines.push(file);
    for (const p of ps) lines.push(`  ${p.line}:${p.col}  ${p.severity}  ${p.message}  ${p.rule}`);
  }
  lines.push(`eslint: ${total}; ${fresh.length} new (above), the rest are the known baseline${fixedNote}.`);
  return { text: lines.join('\n'), newErrors: fresh.filter((p) => p.severity === 'error').length };
}

function runLint() {
  const res = spawnSync('npm', ['run', 'lint'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { text: `${res.stdout ?? ''}${res.stderr ?? ''}`, status: res.status ?? 1 };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--update')) {
    const { text } = runLint();
    const problems = parse(text);
    if (!problems) {
      process.stderr.write('lint-delta: could not parse eslint output; baseline unchanged\n');
      process.exit(1);
    }
    const out = { generated: new Date().toISOString().slice(0, 10), note: 'Keys are file|rule|message; line numbers are ignored. Refresh with lint-delta.mjs --update.', problems: problems.map(keyOf).sort() };
    writeFileSync(join(SKILL_DIR, 'lint-baseline.json'), JSON.stringify(out, null, 2) + '\n');
    process.stdout.write(`lint-baseline.json: ${problems.length} problems\n`);
    return;
  }
  const { text, status } = args.includes('--stdin') ? { text: await readStdin(600000), status: null } : runLint();
  let problems = null;
  let baseline = null;
  try {
    problems = parse(text);
    baseline = loadData('lint-baseline.json');
  } catch {
    problems = null;
  }
  if (!problems) {
    process.stdout.write(text);
    process.exit(status ?? (/npm (?:ERR!|error)|^\w*Error:/m.test(text) ? 1 : 0));
  }
  const { text: out, newErrors } = report(problems, baseline);
  process.stdout.write(out + '\n');
  process.exit(newErrors ? 1 : 0);
}

if (process.argv[1]?.endsWith('lint-delta.mjs')) main();
