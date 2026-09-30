// Every hook, run as Claude Code runs it: JSON on stdin, JSON (or nothing) on stdout, exit 0.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { ROOT } from '../bin/lib/util.mjs';
import { env, mockApi, runHook } from './helpers.mjs';

const servers = [];
const api = async (behave) => {
  const s = await mockApi(behave);
  servers.push(s);
  return s;
};
after(() => Promise.all(servers.map((s) => s.close())));

const pre = (tool, file, input) => JSON.stringify({ hook_event_name: 'PreToolUse', cwd: ROOT, tool_name: tool, tool_input: { file_path: join(ROOT, file), ...input } });
const worktree = (file) => `/Users/x/proj/.claude/worktrees/agent-1/${file}`;
const json = (r) => (r.stdout ? JSON.parse(r.stdout) : null);

const TYPES_EDIT = { old_string: '  examGapLines?: number;\n', new_string: '  examGapLines?: number;\n  /** Sum of all marks, kept current. */\n  totalMarks?: number;\n' };
const BUTTON = {
  old_string: '      {showZh && editable("zh", prompt("Double-click to add 中文"))}\n',
  new_string: '      {showZh && editable("zh", prompt("Double-click to add 中文"))}\n      <button type="button" onClick={onRemove}>Remove</button>\n',
};

// ---------- guard ----------

test('guard: frozen corpus is blocked without an API call', async () => {
  const s = await api();
  const r = await runHook('guard-hook.mjs', pre('Edit', 'src/test/corpus/v1-published.json', { old_string: 'a', new_string: 'b' }), env(s.url));
  assert.equal(r.code, 0);
  assert.equal(json(r).hookSpecificOutput.permissionDecision, 'deny');
  assert.match(json(r).hookSpecificOutput.permissionDecisionReason, /frozen-corpus/);
  assert.equal(s.requests.length, 0);
});

test('guard: worktree paths match the same rules', async () => {
  const input = JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: worktree('src/components/X.tsx'), content: "import { invoke } from '@tauri-apps/api/core';\n" } });
  const r = await runHook('guard-hook.mjs', input, env(null, { key: false }));
  assert.match(json(r).hookSpecificOutput.permissionDecisionReason, /tauri-static-import/);
});

test('guard: a Jev block rule denies above the threshold', async () => {
  const s = await api(() => ({ noul: (id) => (id === 'derived-not-stored' ? 0.95 : 0.1) }));
  const r = await runHook('guard-hook.mjs', pre('Edit', 'src/model/types.ts', TYPES_EDIT), env(s.url));
  const out = json(r).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /derived-not-stored/);
  assert.deepEqual(Object.keys(s.requests[0].body.questions), ['derived-not-stored']);
  assert.ok(s.requests[0].body.state.change.added.includes('totalMarks'));
});

test('guard: below the threshold only the deterministic reminder remains', async () => {
  const s = await api(() => ({ noul: () => 0.1 }));
  const r = await runHook('guard-hook.mjs', pre('Edit', 'src/model/types.ts', TYPES_EDIT), env(s.url));
  const out = json(r).hookSpecificOutput;
  assert.equal(out.permissionDecision, undefined);
  assert.match(out.additionalContext, /known-keys.*`totalMarks`/);
});

test('guard: a Jev remind rule adds context and allows', async () => {
  const s = await api(() => ({ noul: () => 0.9 }));
  const r = await runHook('guard-hook.mjs', pre('Edit', 'src/components/preview/Preview.tsx', BUTTON), env(s.url));
  const out = json(r).hookSpecificOutput;
  assert.equal(out.permissionDecision, undefined);
  assert.match(out.additionalContext, /print-hide/);
});

test('guard: allow prints nothing', async () => {
  const s = await api(() => ({ noul: () => 0.05 }));
  const r = await runHook('guard-hook.mjs', pre('Edit', 'src/components/preview/Preview.tsx', BUTTON), env(s.url));
  assert.equal(r.stdout, '');
  const none = await runHook('guard-hook.mjs', pre('Edit', 'README.md', { old_string: 'a', new_string: 'b' }), env(s.url));
  assert.equal(none.stdout, '');
});

test('guard: no key skips Jev rules silently', async () => {
  const r = await runHook('guard-hook.mjs', pre('Edit', 'src/components/preview/Preview.tsx', BUTTON), env(null, { key: false }));
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});

test('guard: API down (500) or hanging fails open', async () => {
  const down = await api(() => ({ status: 500 }));
  const r1 = await runHook('guard-hook.mjs', pre('Edit', 'src/components/preview/Preview.tsx', BUTTON), env(down.url));
  assert.equal(r1.code, 0);
  assert.equal(r1.stdout, '');
  const hang = await api(() => 'hang');
  const r2 = await runHook('guard-hook.mjs', pre('Edit', 'src/components/preview/Preview.tsx', BUTTON), env(hang.url));
  assert.equal(r2.code, 0);
  assert.equal(r2.stdout, '');
  assert.ok(r2.ms < 7000, `took ${r2.ms} ms`);
});

test('guard: malformed input fails open', async () => {
  for (const stdin of ['', 'not json', '{}', '{"tool_name":"Edit"}', '{"tool_name":"Edit","tool_input":{"file_path":42}}', JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'ls' } })]) {
    const r = await runHook('guard-hook.mjs', stdin, env(null, { key: false }));
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '', stdin);
  }
});

// ---------- pointers ----------

const prompt = (p) => JSON.stringify({ hook_event_name: 'UserPromptSubmit', cwd: ROOT, prompt: p });
const LONG = 'a new Worksheet field saves fine but vanishes on reload, why?';

test('pointers: confident hits become one compact block', async () => {
  const s = await api((body) => ({ noul: (id) => (id === 'c0' || id === 'c1' ? 0.95 : 0.2) }));
  const r = await runHook('pointers-hook.mjs', prompt(LONG), env(s.url));
  const out = json(r).hookSpecificOutput;
  assert.equal(out.hookEventName, 'UserPromptSubmit');
  const lines = out.additionalContext.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /^\S+:\d+-\d+ {2}\S/);
});

test('pointers: quiet for short, slash, unconfident, no key, down, hanging', async () => {
  const low = await api(() => ({ noul: () => 0.3 }));
  for (const p of ['fix it', '/review the diff please and tell me more']) assert.equal((await runHook('pointers-hook.mjs', prompt(p), env(low.url))).stdout, '');
  assert.equal(low.requests.length, 0);
  assert.equal((await runHook('pointers-hook.mjs', prompt(LONG), env(low.url))).stdout, '');
  assert.equal((await runHook('pointers-hook.mjs', prompt(LONG), env(null, { key: false }))).stdout, '');
  const down = await api(() => ({ status: 500 }));
  assert.equal((await runHook('pointers-hook.mjs', prompt(LONG), env(down.url))).stdout, '');
  const hang = await api(() => 'hang');
  const r = await runHook('pointers-hook.mjs', prompt(LONG), env(hang.url));
  assert.equal(r.stdout, '');
  assert.equal(r.code, 0);
  assert.ok(r.ms < 4500, `took ${r.ms} ms`);
});

test('pointers: accepts user_prompt, drops pasted blocks, survives junk', async () => {
  const s = await api(() => ({ noul: () => 0.9 }));
  const pasted = `${LONG}\n<pasted_content id="1">\n${'x '.repeat(5000)}\n</pasted_content id="1">`;
  const r = await runHook('pointers-hook.mjs', JSON.stringify({ hook_event_name: 'UserPromptSubmit', user_prompt: pasted }), env(s.url));
  assert.ok(json(r));
  assert.ok(!JSON.stringify(s.requests[0].body.state).includes('x x x'));
  for (const junk of ['', '[]', 'nope', '{"prompt": 5}']) assert.equal((await runHook('pointers-hook.mjs', junk, env(s.url))).stdout, '');
});

// ---------- lint filter ----------

const bash = (command) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command, description: 'Run lint' } });

test('lint filter: rewrites only a bare npm run lint', async () => {
  const r = await runHook('lint-filter-hook.mjs', bash('npm run lint'), env(null, { key: false }));
  const out = json(r).hookSpecificOutput;
  assert.match(out.updatedInput.command, /^npm run lint 2>&1 \| node ".*lint-delta\.mjs" --stdin$/);
  assert.equal(out.updatedInput.description, 'Run lint');
  assert.equal(out.permissionDecision, undefined);
  for (const cmd of ['npm run lint -- --fix', 'npm run lint | tail -5', 'npm test', 'npm run lint && rm -rf x']) {
    assert.equal((await runHook('lint-filter-hook.mjs', bash(cmd), env(null))).stdout, '', cmd);
  }
  assert.equal((await runHook('lint-filter-hook.mjs', 'garbage', env(null))).stdout, '');
});
