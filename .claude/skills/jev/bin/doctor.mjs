#!/usr/bin/env node
// Health check for the jev skill: key, API, data files, doc index, hook registration.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { docCandidates, memoryCandidates } from './lib/docs.mjs';
import { ask, hasKey } from './lib/jev.mjs';
import { globToRegExp, loadData, ROOT, SKILL_DIR } from './lib/util.mjs';

let failed = 0;
const line = (status, name, detail) => {
  if (status === 'FAIL') failed++;
  process.stdout.write(`${status.padEnd(4)}  ${name.padEnd(10)} ${detail}\n`);
};

async function main() {
  const key = hasKey();
  line(key ? 'ok' : 'warn', 'key', key ? 'found (env TYPESAFE_API_KEY or ~/.claude/jev.env)' : 'Jev key not found: hooks stay silent, CLIs fall back');

  if (key) {
    const res = await ask('The build is green.', { ping: { type: 'noul', instructions: 'Is this good news?' } }, { timeoutMs: 8000 });
    line(res ? 'ok' : 'FAIL', 'api', res ? `reachable, ${res.ms} ms, ${res.usage.input_tokens} input tokens` : 'no answer (network, key or service)');
  }

  const data = {};
  for (const name of ['find.json', 'rules.json', 'verify.json', 'lint-baseline.json']) {
    try {
      data[name] = loadData(name);
      line('ok', 'data', name);
    } catch (err) {
      line('FAIL', 'data', `${name}: ${err.message}`);
    }
  }
  if (data['rules.json']) {
    const bad = [];
    for (const r of data['rules.json'].rules) {
      for (const field of ['pattern', 'unless', 'when', 'skipIf']) {
        try {
          if (r[field]) new RegExp(r[field], r.flags ?? '');
        } catch {
          bad.push(`${r.id}.${field}`);
        }
      }
      for (const g of [...(r.globs ?? []), ...(r.exclude ?? [])]) {
        try {
          globToRegExp(g);
        } catch {
          bad.push(`${r.id} glob ${g}`);
        }
      }
      if (r.kind === 'jev' && !r.question?.instructions) bad.push(`${r.id} has no question`);
    }
    line(bad.length ? 'FAIL' : 'ok', 'rules', bad.length ? bad.join(', ') : `${data['rules.json'].rules.length} rules compile`);
  }
  if (data['lint-baseline.json']) line('ok', 'lint', `baseline ${data['lint-baseline.json'].problems.length} problems (${data['lint-baseline.json'].generated})`);

  if (data['find.json']) {
    const docs = docCandidates(data['find.json']);
    const by = {};
    for (const c of docs) by[c.path] = (by[c.path] ?? 0) + 1;
    const missing = data['find.json'].sources.filter((s) => !by[s.path]).map((s) => s.path);
    line(missing.length ? 'FAIL' : 'ok', 'index', `${docs.length} sections: ${Object.entries(by).map(([p, n]) => `${p.split('/').pop()} ${n}`).join(', ')}${missing.length ? `; missing ${missing.join(', ')}` : ''}`);
    line('ok', 'memory', `${memoryCandidates().length} memories`);
  }

  const settingsPath = join(ROOT, '.claude', 'settings.json');
  try {
    const hooks = JSON.parse(readFileSync(settingsPath, 'utf8')).hooks ?? {};
    const want = [
      ['UserPromptSubmit', 'pointers-hook.mjs'],
      ['PreToolUse', 'guard-hook.mjs'],
      ['PreToolUse', 'lint-filter-hook.mjs'],
    ];
    for (const [event, script] of want) {
      const entries = (hooks[event] ?? []).flatMap((m) => m.hooks ?? []);
      const found = entries.some((h) => `${h.command ?? ''} ${(h.args ?? []).join(' ')}`.includes(script));
      const exists = existsSync(join(SKILL_DIR, 'bin', script));
      line(found && exists ? 'ok' : 'FAIL', 'hook', `${event} → ${script}${found ? '' : ' not registered'}${exists ? '' : ' (script missing)'}`);
    }
  } catch (err) {
    line('FAIL', 'hook', `${settingsPath}: ${err.message}`);
  }
  process.exit(failed ? 1 : 0);
}

main();
