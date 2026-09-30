#!/usr/bin/env node
// UserPromptSubmit hook: injects a few confident doc pointers. Fails open and silent.
import { docCandidates, formatHit, memoryCandidates, rank } from './lib/docs.mjs';
import { hasKey } from './lib/jev.mjs';
import { loadData, readStdin } from './lib/util.mjs';

/** The prompt without pasted blocks, or null when the hook should stay quiet. */
export function promptOf(input, hook) {
  if (!input || typeof input !== 'object') return null;
  const event = input.hook_event_name ?? input.hookEventName;
  if (event && event !== 'UserPromptSubmit') return null;
  let prompt = input.prompt ?? input.user_prompt ?? input.userPrompt;
  if (typeof prompt !== 'string') return null;
  prompt = prompt.replace(/<pasted_content id="([^"]*)">[\s\S]*?<\/pasted_content id="\1">/g, ' ').trim();
  if (prompt.length < hook.minPromptChars || prompt.startsWith('/')) return null;
  return prompt.slice(0, hook.maxPromptChars);
}

export async function pointers(input, cfg = loadData('find.json')) {
  const hook = cfg.hook;
  const prompt = promptOf(input, hook);
  if (!prompt || !hasKey()) return null;
  const candidates = docCandidates(cfg);
  if (cfg.memory) candidates.push(...memoryCandidates());
  const budget = Math.max(500, hook.budgetMs - 300);
  const res = await rank(prompt, candidates, { ...cfg, timeoutMs: Math.min(cfg.timeoutMs, budget) });
  if (res.mode !== 'jev') return null;
  const hits = res.hits.filter((h) => h.score >= hook.minNoul).slice(0, hook.max);
  if (!hits.length) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: `${hook.header}\n${hits.map((h) => formatHit(h, false)).join('\n')}`,
    },
  };
}

async function main() {
  const cfg = (() => {
    try {
      return loadData('find.json');
    } catch {
      return null;
    }
  })();
  setTimeout(() => process.exit(0), cfg?.hook?.budgetMs ?? 3000).unref();
  try {
    const out = await pointers(JSON.parse(await readStdin(1000)), cfg);
    if (out) process.stdout.write(JSON.stringify(out));
  } catch {
    /* fail open */
  }
  process.exit(0);
}

if (process.argv[1]?.endsWith('pointers-hook.mjs')) main();
