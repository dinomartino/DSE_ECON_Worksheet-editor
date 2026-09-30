#!/usr/bin/env node
// PreToolUse hook on Bash: a bare `npm run lint` is piped through lint-delta.mjs, so the
// 43 known problems print as one line. `npm run lint` exits 1 on the baseline's errors, and a
// failed Bash call reaches only PostToolUseFailure, which cannot replace output; hence a
// rewrite before the run instead of a filter after it. Anything else passes untouched.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readStdin } from './lib/util.mjs';

const BARE_LINT = /^\s*npm run lint\s*(?:2>&1\s*)?$/;
const DELTA = join(dirname(fileURLToPath(import.meta.url)), 'lint-delta.mjs');

export function rewrite(input, delta = DELTA) {
  if (!input || typeof input !== 'object') return null;
  const event = input.hook_event_name ?? input.hookEventName;
  if (event && event !== 'PreToolUse') return null;
  const toolInput = input.tool_input ?? input.toolInput;
  if ((input.tool_name ?? input.toolName) !== 'Bash' || typeof toolInput?.command !== 'string') return null;
  if (!BARE_LINT.test(toolInput.command) || /["$`\\]/.test(delta)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: { ...toolInput, command: `npm run lint 2>&1 | node "${delta}" --stdin` },
    },
  };
}

async function main() {
  setTimeout(() => process.exit(0), 3000).unref();
  try {
    const out = rewrite(JSON.parse(await readStdin(1000)));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    /* fail open */
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('lint-filter-hook.mjs')) main();
