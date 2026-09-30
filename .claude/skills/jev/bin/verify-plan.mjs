#!/usr/bin/env node
// Which of the repo's checks does this diff need? Paths decide first, Jev answers the rest.
// Usage: verify-plan.mjs [base=develop]      base...HEAD plus the working tree
//        verify-plan.mjs --commit <sha>       one past commit
//        add --json for machine output
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { askBatched, hasKey, noul } from './lib/jev.mjs';
import { git, loadData, matchesAny } from './lib/util.mjs';

const cwd = process.cwd();

/** Changed files and a function returning each file's diff text. */
export function collect({ base, commit }) {
  const run = (args) => {
    try {
      return git(args, cwd);
    } catch {
      return '';
    }
  };
  if (commit) {
    const files = run(['diff', '--name-only', `${commit}^`, commit]).split('\n').filter(Boolean);
    return { label: `commit ${commit}`, files, diffOf: (f) => run(['diff', `${commit}^`, commit, '--', f]) };
  }
  const mergeBase = run(['merge-base', base, 'HEAD']).trim() || base;
  const tracked = run(['diff', '--name-only', mergeBase]).split('\n').filter(Boolean);
  const untracked = run(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean);
  const files = [...new Set([...tracked, ...untracked])];
  return {
    label: `${base}...HEAD + working tree`,
    files,
    diffOf: (f) => {
      if (tracked.includes(f)) return run(['diff', mergeBase, '--', f]);
      try {
        return `new file ${f}\n${readFileSync(join(cwd, f), 'utf8')}`;
      } catch {
        return '';
      }
    },
  };
}

function chunks(text, size) {
  if (text.length <= size) return [text];
  const [header, ...hunks] = text.split(/\n(?=@@ )/);
  const head = header.slice(0, 300);
  const out = [];
  let cur = '';
  for (const h of hunks.length ? hunks : [header.slice(300)]) {
    if (cur && cur.length + h.length > size) {
      out.push(`${head}\n${cur}`);
      cur = '';
    }
    cur += (cur ? '\n' : '') + h.slice(0, size);
  }
  if (cur) out.push(`${head}\n${cur}`);
  return out;
}

const inScope = (f, check, globs) => matchesAny(f, globs ?? []) && !matchesAny(f, check.ignore ?? []);

export async function plan(cfg, { files, diffOf }) {
  const useJev = hasKey();
  const results = cfg.checks.map((check) => ({ check, required: null, reason: '' }));
  const asks = new Map(); // file -> Set(question ids)
  for (const r of results) {
    const { check } = r;
    if (check.always) [r.required, r.reason] = [true, check.why];
    else if (check.satisfiedBy && files.some((f) => matchesAny(f, check.satisfiedBy))) [r.required, r.reason] = [false, 'already in this diff'];
    else {
      const hit = files.find((f) => inScope(f, check, check.triggers));
      if (hit) [r.required, r.reason] = [true, `path ${hit}`];
      else if (!check.questions?.length) [r.required, r.reason] = [false, 'no matching paths'];
      else {
        r.scoped = files.filter((f) => inScope(f, check, check.scope));
        if (!r.scoped.length) [r.required, r.reason] = [false, 'no files in scope'];
        else for (const f of r.scoped) for (const q of check.questions) asks.set(f, new Set([...(asks.get(f) ?? []), q]));
      }
    }
  }
  const pending = results.filter((r) => r.required === null);
  const answers = new Map(); // `${file}|${q}` -> max p, or null when unanswered
  let usage = { inputTokens: 0, requests: 0, ms: 0 };
  if (pending.length && useJev) {
    const jobs = [];
    for (const [file, qs] of asks) for (const text of chunks(diffOf(file), cfg.chunkChars)) jobs.push({ file, qs: [...qs], text });
    const kept = jobs.slice(0, cfg.maxChunks);
    const replies = await Promise.all(
      kept.map((job) =>
        askBatched(
          { file: job.file, diff: job.text },
          Object.fromEntries(job.qs.map((q) => [q, { type: 'noul', instructions: cfg.questions[q] }])),
          { size: 10, timeoutMs: cfg.timeoutMs },
        ),
      ),
    );
    kept.forEach((job, i) => {
      const reply = replies[i];
      if (reply) {
        usage.inputTokens += reply.inputTokens;
        usage.requests += reply.requests;
        usage.ms = Math.max(usage.ms, reply.ms);
      }
      for (const q of job.qs) {
        const key = `${job.file}|${q}`;
        const p = reply ? noul(reply.answers[q]) : null;
        const prev = answers.get(key);
        answers.set(key, p === null || prev === null ? null : Math.max(prev ?? 0, p));
      }
    });
    for (const job of jobs.slice(cfg.maxChunks)) for (const q of job.qs) answers.set(`${job.file}|${q}`, null);
  }
  for (const r of pending) {
    if (!useJev) {
      [r.required, r.reason] = [true, `no Jev key; ${r.scoped.length} file(s) in scope`];
      continue;
    }
    let worst = { p: -1, file: '', q: '' };
    let unanswered = null;
    for (const f of r.scoped)
      for (const q of r.check.questions) {
        const p = answers.get(`${f}|${q}`);
        if (p === null || p === undefined) unanswered = f;
        else if (p > worst.p) worst = { p, file: f, q };
      }
    if (unanswered) [r.required, r.reason] = [true, `no Jev answer for ${unanswered}`];
    else if (worst.p >= cfg.lowThreshold) [r.required, r.reason] = [true, `jev ${worst.q} p=${worst.p.toFixed(2)} (${worst.file})`];
    else [r.required, r.reason] = [false, `jev ${r.check.questions.join('/')} max p=${Math.max(0, worst.p).toFixed(2)}`];
  }
  return { results, usage: useJev ? usage : null, jev: useJev };
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const ci = args.indexOf('--commit');
  const commit = ci >= 0 ? args[ci + 1] : null;
  const base = args.find((a, i) => !a.startsWith('--') && i !== ci + 1) ?? 'develop';
  const cfg = loadData('verify.json');
  const diff = collect({ base, commit });
  if (!diff.files.length) {
    process.stdout.write(`verify plan: no changes in ${diff.label}\n`);
    return;
  }
  const { results, usage, jev } = await plan(cfg, diff);
  if (json) {
    process.stdout.write(JSON.stringify({ label: diff.label, files: diff.files, usage, checks: results.map((r) => ({ id: r.check.id, cmd: r.check.cmd, required: r.required, reason: r.reason })) }, null, 2) + '\n');
    return;
  }
  const width = Math.min(48, Math.max(...results.map((r) => r.check.cmd.length)) + 2);
  const row = (r) => `  ${r.check.cmd}${' '.repeat(Math.max(2, width - r.check.cmd.length))}${r.reason}${r.required && r.reason !== r.check.why ? `. ${r.check.why}` : ''}`;
  const lines = [`verify plan: ${diff.label}, ${diff.files.length} file(s)${jev ? '' : ' (Jev key not found: everything paths cannot rule out is required)'}`];
  lines.push('required:', ...results.filter((r) => r.required).map(row));
  lines.push('skippable:', ...results.filter((r) => !r.required).map(row));
  if (usage?.requests) lines.push(`(jev: ${usage.requests} request(s), ${usage.inputTokens} input tokens, ${usage.ms} ms)`);
  process.stdout.write(lines.join('\n') + '\n');
}

if (process.argv[1]?.endsWith('verify-plan.mjs'))
  main().catch((err) => {
    process.stderr.write(`verify-plan: ${err.message}\n`);
    process.exit(1);
  });
