#!/usr/bin/env node
// PreToolUse hook on Edit|Write: applies rules.json. Fails open: any problem, no output, exit 0.
import { changeOf, evaluate } from './lib/rules.mjs';
import { loadData, readStdin, repoPath, ROOT } from './lib/util.mjs';

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);

export async function guard(input, data = loadData('rules.json')) {
  if (!input || typeof input !== 'object') return null;
  const event = input.hook_event_name ?? input.hookEventName;
  if (event && event !== 'PreToolUse') return null;
  const tool = input.tool_name ?? input.toolName;
  const toolInput = input.tool_input ?? input.toolInput;
  if (!EDIT_TOOLS.has(tool) || !toolInput || typeof toolInput !== 'object') return null;
  const abs = toolInput.file_path ?? toolInput.filePath ?? toolInput.path;
  const rel = repoPath(abs, [input.cwd, process.env.CLAUDE_PROJECT_DIR, ROOT]);
  if (!rel) return null;
  const checkoutRoot = abs.endsWith(rel) ? abs.slice(0, abs.length - rel.length) : ROOT;
  const change = changeOf(tool, toolInput, abs);
  const result = await evaluate(data, { rel, change, checkoutRoot });
  if (result.blocks.length) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: result.blocks.map((b) => `[jev guard: ${b.id}] ${b.text}`).join('\n'),
      },
    };
  }
  if (result.reminds.length) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: result.reminds.map((r) => `[jev guard: ${r.id}] ${r.text}`).join('\n'),
      },
    };
  }
  return null;
}

/** `--trials`: run test/guard-trials.json against the live rules and print expected vs got. */
async function trials() {
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { hasKey } = await import('./lib/jev.mjs');
  const { SKILL_DIR } = await import('./lib/util.mjs');
  if (!hasKey()) process.stdout.write('Jev key not found: jev rules are skipped\n');
  const data = loadData('rules.json');
  let ok = 0;
  const cases = JSON.parse(readFileSync(join(SKILL_DIR, 'test', 'guard-trials.json'), 'utf8'));
  for (const t of cases) {
    const abs = join(ROOT, t.file);
    const result = await evaluate(data, { rel: t.file, change: changeOf(t.tool, t.input, abs), checkoutRoot: ROOT });
    const got = result.blocks.length ? 'block' : result.reminds.length ? 'remind' : 'allow';
    const ids = [...result.blocks, ...result.reminds].map((r) => r.id).join(',');
    const scores = result.jev ? Object.entries(result.jev.scores).map(([id, p]) => `${id}=${p?.toFixed(2)}`).join(' ') : '';
    const pass = got === t.expect && (!t.rule || ids.includes(t.rule));
    if (pass) ok++;
    process.stdout.write(`${pass ? 'ok  ' : 'FAIL'} ${t.expect.padEnd(6)} got ${got.padEnd(6)} ${ids.padEnd(26)} ${scores}  ${t.name}\n`);
  }
  process.stdout.write(`${ok}/${cases.length} as expected\n`);
}

async function main() {
  if (process.argv.includes('--trials')) return trials();
  setTimeout(() => process.exit(0), 8000).unref();
  try {
    const text = await readStdin(1500);
    const out = await guard(JSON.parse(text));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    /* fail open */
  }
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('guard-hook.mjs')) main();
