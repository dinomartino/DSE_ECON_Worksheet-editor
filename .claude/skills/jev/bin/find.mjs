#!/usr/bin/env node
// Ranked pointers into the repo's docs (and optionally source) for one question.
// Usage: find.mjs "<question>" [--top N] [--json] [--code] [--grep a,b] [--no-memory] [--keyword]
//        find.mjs --eval [file] [--keyword]   hit rates over test/find-eval.json
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeCandidates, docCandidates, formatHit, memoryCandidates, rank } from './lib/docs.mjs';
import { hasKey } from './lib/jev.mjs';
import { loadData, SKILL_DIR } from './lib/util.mjs';

function parseArgs(argv) {
  const opts = { top: 5, json: false, code: false, grep: [], memory: true, keyword: false, eval: null, words: [], set: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--top') opts.top = Number(argv[++i]);
    else if (a === '--json') opts.json = true;
    else if (a === '--code') opts.code = true;
    else if (a === '--grep') opts.grep = argv[++i].split(',').filter(Boolean);
    else if (a === '--no-memory') opts.memory = false;
    else if (a === '--keyword') opts.keyword = true;
    else if (a === '--eval') opts.eval = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : join(SKILL_DIR, 'test', 'find-eval.json');
    else if (a.startsWith('--set=')) {
      const [k, v] = a.slice(6).split('=');
      opts.set[k] = Number.isNaN(Number(v)) ? v : Number(v);
    } else if (a === '--help' || a === '-h') {
      process.stdout.write(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 4).join('\n').replace(/^\/\/ ?/gm, '') + '\n');
      process.exit(0);
    } else if (a.startsWith('--')) {
      process.stderr.write(`find: unknown flag ${a}\n`);
      process.exit(2);
    } else opts.words.push(a);
  }
  return opts;
}

export async function find(question, opts, cfg) {
  const candidates = docCandidates(cfg);
  if (opts.memory && cfg.memory) candidates.push(...memoryCandidates());
  if (opts.code) candidates.push(...codeCandidates(question, opts.grep, cfg.code));
  return rank(question, candidates, cfg, { useJev: !opts.keyword });
}

const matches = (hit, e) =>
  hit.path.endsWith(e.path) && (!e.heading || hit.heading.toLowerCase().includes(e.heading.toLowerCase()));

async function evaluate(file, opts, cfg) {
  const cases = JSON.parse(readFileSync(file, 'utf8'));
  const modes = opts.keyword || !hasKey() ? [true] : [true, false];
  if (!hasKey()) process.stdout.write('Jev key not found: keyword ranking only\n');
  for (const keyword of modes) {
    let top1 = 0;
    let top3 = 0;
    const ms = [];
    const toks = [];
    const lines = [];
    for (const c of cases) {
      const started = Date.now();
      const res = await find(c.q, { ...opts, keyword, code: !!c.code, grep: c.grep ?? [] }, cfg);
      ms.push(Date.now() - started);
      if (res.usage) toks.push(res.usage.inputTokens);
      const rankOf = res.hits.findIndex((h) => c.expect.some((e) => matches(h, e)));
      if (rankOf === 0) top1++;
      if (rankOf >= 0 && rankOf < 3) top3++;
      lines.push(`${rankOf === -1 ? ' -' : String(rankOf + 1).padStart(2)}  ${c.q}${rankOf === -1 || rankOf > 2 ? `\n      got: ${res.hits[0] ? formatHit(res.hits[0]) : 'nothing'}` : ''}`);
    }
    ms.sort((a, b) => a - b);
    const mean = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
    process.stdout.write(`\n== ${keyword ? 'keyword' : 'jev'} (${cases.length} cases)\n${lines.join('\n')}\n`);
    process.stdout.write(
      `top-1 ${top1}/${cases.length}  top-3 ${top3}/${cases.length}  latency mean ${mean(ms)} ms, p50 ${ms[Math.floor(ms.length / 2)]} ms, max ${ms[ms.length - 1]} ms` +
        (toks.length ? `  input tokens/query mean ${mean(toks)}` : '') +
        '\n',
    );
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const cfg = { ...loadData('find.json'), ...opts.set };
  if (opts.eval) return evaluate(opts.eval, opts, cfg);
  const question = opts.words.join(' ').trim();
  if (!question) {
    process.stderr.write('usage: find.mjs "<question>" [--top N] [--json] [--code] [--grep a,b]\n');
    process.exit(2);
  }
  const res = await find(question, opts, cfg);
  // With --code, source files get their own top N so prose cannot crowd them out.
  const hits = opts.code
    ? [...res.hits.filter((h) => h.kind === 'code').slice(0, opts.top), ...res.hits.filter((h) => h.kind !== 'code').slice(0, opts.top)]
    : res.hits.slice(0, opts.top);
  if (opts.json) {
    process.stdout.write(JSON.stringify({ mode: res.mode, usage: res.usage, hits: hits.map(({ body, kw, prior, ...h }) => h) }, null, 2) + '\n');
    return;
  }
  if (res.mode === 'keyword-nokey') process.stdout.write('Jev key not found: keyword ranking\n');
  if (res.mode === 'keyword-jev-failed') process.stdout.write('Jev unavailable: keyword ranking\n');
  process.stdout.write(hits.length ? hits.map((h) => formatHit(h, res.mode === 'jev')).join('\n') + '\n' : 'no matches\n');
}

main().catch((err) => {
  process.stderr.write(`find: ${err.message}\n`);
  process.exit(1);
});
