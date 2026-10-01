import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { keywordRank, rank, sectionsOf, tokens } from '../bin/lib/docs.mjs';
import { addedLines, changeOf, evaluate, interfaceProps } from '../bin/lib/rules.mjs';
import { globToRegExp, loadData, matchesAny, repoPath } from '../bin/lib/util.mjs';
import { delta, parse, report } from '../bin/lint-delta.mjs';
import { plan } from '../bin/verify-plan.mjs';
import { env, mockApi } from './helpers.mjs';

const servers = [];
after(() => Promise.all(servers.map((s) => s.close())));
const withApi = async (behave, { key = true } = {}) => {
  const s = await mockApi(behave);
  servers.push(s);
  delete process.env.TYPESAFE_API_KEY;
  Object.assign(process.env, env(s.url, { key }));
  if (!key) delete process.env.TYPESAFE_API_KEY;
  return s;
};

// ---------- util ----------

test('globs', () => {
  assert.ok(globToRegExp('src/**/*.tsx').test('src/a/b/c.tsx'));
  assert.ok(globToRegExp('src/**/*.tsx').test('src/c.tsx'));
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
  assert.ok(globToRegExp('src/model/{types,flow}.ts').test('src/model/flow.ts'));
  assert.ok(globToRegExp('src/**/*.{ts,tsx}').test('src/x.tsx'));
  assert.ok(matchesAny('CHANGELOG.md', ['CHANGELOG.md']));
});

test('repoPath strips worktrees and roots, rejects outsiders', () => {
  assert.equal(repoPath('/a/Econ worksheet gen/.claude/worktrees/agent-9/src/x.ts', []), 'src/x.ts');
  assert.equal(repoPath('/a/proj/src/x.ts', ['/a/proj']), 'src/x.ts');
  assert.equal(repoPath('/etc/passwd', ['/a/proj']), null);
  assert.equal(repoPath(undefined, ['/a']), null);
});

// ---------- docs ----------

const MD = [
  '# Title',
  'intro line',
  '',
  '## Alpha',
  'alpha body about KNOWN_KEYS',
  '',
  '```',
  '## not a heading',
  '```',
  '### Beta',
  'beta body',
  '## Gamma',
  ...Array.from({ length: 12 }, (_, i) => `- **Item ${i}** gamma text ${i}`),
].join('\n');

test('sections: headings outside fences, h3 labelled under h2, long sections split', () => {
  const s = sectionsOf('x.md', MD, { maxLines: 5 });
  const heads = s.map((c) => c.heading);
  assert.deepEqual(heads.slice(0, 3), ['Title', 'Alpha', 'Alpha › Beta']);
  assert.equal(s[1].startLine, 4);
  assert.equal(s[1].endLine, 9);
  assert.ok(heads.includes('Gamma › Item 5'));
  const gamma = s.filter((c) => c.heading.startsWith('Gamma'));
  assert.ok(gamma.every((c) => c.endLine - c.startLine < 6));
});

test('glossary mode: one chunk per bullet', () => {
  const s = sectionsOf('g.md', '# Glossary\n\nwords\n\n- **IR** — the tree\n  more\n- **Band** — a row\n', { maxLines: 4, splitBullets: true });
  assert.deepEqual(s.map((c) => c.heading), ['Glossary', 'Glossary › IR', 'Glossary › Band']);
  assert.equal(s[1].startLine, 5);
  assert.equal(s[1].endLine, 6);
});

test('tokens split camelCase and snake_case, keep CJK', () => {
  assert.deepEqual(tokens('KNOWN_KEYS dataPrintHide'), ['known', 'key', 'data', 'print', 'hide']);
  assert.ok(tokens('題庫 bank').includes('題庫'));
});

test('keyword ranking and the no-key fallback', async () => {
  await withApi(() => null, { key: false });
  const cands = sectionsOf('x.md', MD, { maxLines: 40 });
  assert.equal(keywordRank('known keys', cands)[0].heading, 'Alpha');
  const res = await rank('known keys', cands, { shortlist: 5, excerptChars: 100, batchSize: 5, timeoutMs: 500, question: { instructions: 'q' } });
  assert.equal(res.mode, 'keyword-nokey');
});

test('Jev reorders the shortlist; request failure falls back to keywords', async () => {
  const s = await withApi(() => ({ noul: (id) => (id === 'c1' ? 0.9 : 0.1) }));
  const cands = sectionsOf('x.md', MD, { maxLines: 40 });
  const cfg = { shortlist: 5, excerptChars: 100, batchSize: 5, timeoutMs: 1000, question: { instructions: 'q', criteria: { true: 't', false: 'f' } } };
  const res = await rank('alpha beta', cands, cfg);
  assert.equal(res.mode, 'jev');
  assert.equal(res.hits[0].score, 0.9);
  assert.deepEqual(s.requests[0].body.state, { request: 'alpha beta' });
  await withApi(() => ({ status: 500 }));
  assert.equal((await rank('alpha beta', cands, cfg)).mode, 'keyword-jev-failed');
});

// ---------- rules ----------

test('addedLines is a multiset difference', () => {
  assert.equal(addedLines('a\nb\nb', 'a\nb\nb\nb\nc'), 'b\nc');
});

test('interfaceProps reads top-level properties only', () => {
  const src = 'export interface W {\n  /** doc: fake?: x */\n  a: string;\n  b?: { inner: number };\n  // c: gone\n  d?: Array<{ e: 1 }>;\n}\ninterface X { z: 1 }';
  assert.deepEqual([...interfaceProps(src, 'W')], ['a', 'b', 'd']);
  assert.equal(interfaceProps(src, 'Nope'), null);
});

test('tauri rules: static anywhere, type-only fine, dynamic only in owners', async () => {
  const data = loadData('rules.json');
  const run = async (rel, content) => (await evaluate({ ...data, rules: data.rules.filter((r) => r.kind !== 'jev') }, { rel, change: changeOf('Write', { content }, null), checkoutRoot: '/' })).blocks.map((b) => b.id);
  assert.deepEqual(await run('src/a.tsx', "import { x } from '@tauri-apps/api';"), ['tauri-static-import']);
  assert.deepEqual(await run('src/a.tsx', "import '@tauri-apps/api';"), ['tauri-static-import']);
  assert.deepEqual(await run('src/a.tsx', "import {\n  x,\n} from '@tauri-apps/api';"), ['tauri-static-import']);
  assert.deepEqual(await run('src/a.tsx', "export { x } from '@tauri-apps/api';"), ['tauri-static-import']);
  assert.deepEqual(await run('src/a.tsx', "import type { X } from '@tauri-apps/api';"), []);
  assert.deepEqual(await run('src/a.tsx', "import { type X } from '@tauri-apps/api';"), []);
  assert.deepEqual(await run('src/desktop/a.ts', "const m = await import('@tauri-apps/api');"), []);
  assert.deepEqual(await run('src/a.ts', "const m = await import('@tauri-apps/api');"), ['tauri-dynamic-import-scope']);
  assert.deepEqual(await run('scripts/a.mjs', "import { x } from '@tauri-apps/api';"), []);
  assert.deepEqual(await run('src/model/numbering.ts', "if (t === 'structured') {}"), ['no-type-branching']);
  assert.deepEqual(await run('src/model/numbering.test.ts', "if (t === 'structured') {}"), []);
});

test('ui-text rule: reminds on English JSX text and text props, not catalogue reads', async () => {
  const data = loadData('rules.json');
  const run = async (rel, content) => (await evaluate({ ...data, rules: data.rules.filter((r) => r.kind !== 'jev') }, { rel, change: changeOf('Write', { content }, null), checkoutRoot: '/' })).reminds.map((b) => b.id);
  const id = ['ui-text-both-languages'];
  assert.deepEqual(await run('src/components/a/A.tsx', '<span>Hello teacher</span>'), id);
  assert.deepEqual(await run('src/components/a/A.tsx', '<button aria-label="Close panel" />'), id);
  assert.deepEqual(await run('src/components/a/A.tsx', '<input placeholder={`Search ${n}`} />'), id);
  assert.deepEqual(await run('src/components/a/A.tsx', '  <p>\n    Start your worksheet\n  </p>'), id);
  assert.deepEqual(await run('src/components/a/A.tsx', '<span title={m.close}>{m.hello}</span>'), []);
  assert.deepEqual(await run('src/components/a/A.tsx', '<kbd>⌘K</kbd> <b>PDF</b>'), []);
  assert.deepEqual(await run('src/components/a/A.tsx', '<b>Econ Studio</b> {/* i18n-ignore: brand */}'), []);
  assert.deepEqual(await run('src/components/a/A.test.tsx', '<span>Hello teacher</span>'), []);
  assert.deepEqual(await run('src/render/a.tsx', '<span>Hello teacher</span>'), []);
});

// ---------- lint ----------

const LINT = `
> econgen@0.5.0 lint
> eslint

/r/src/a.tsx
  1:1  warning  'x' is defined but never used  @typescript-eslint/no-unused-vars
  9:3  error    Bad thing                      rule/b

/r/src/b.ts
  2:2  warning  'y' is defined but never used  @typescript-eslint/no-unused-vars

✖ 3 problems (1 error, 2 warnings)
`;

test('lint-delta parses stylish output and compares by file, rule and message', () => {
  const problems = parse(LINT, ['/r']);
  assert.equal(problems.length, 3);
  assert.equal(problems[1].rule, 'rule/b');
  const base = { problems: ["src/a.tsx|@typescript-eslint/no-unused-vars|'x' is defined but never used", 'src/a.tsx|rule/b|Bad thing', "src/b.ts|@typescript-eslint/no-unused-vars|'y' is defined but never used"] };
  assert.match(report(problems, base).text, /^eslint: 3 problems \(1 errors, 2 warnings\), all in the known baseline, none new\.$/);
  const moved = parse(LINT.replace('9:3', '40:1'), ['/r']);
  assert.equal(delta(moved, base).fresh.length, 0);
  const fresh = report(problems, { problems: base.problems.slice(0, 2) });
  assert.match(fresh.text, /src\/b\.ts\n {2}2:2 {2}warning/);
  assert.match(fresh.text, /1 new/);
  assert.equal(fresh.newErrors, 0);
  assert.equal(report(problems, { problems: [] }).newErrors, 1);
  assert.equal(parse('some other output'), null);
  assert.equal(parse(LINT.replace('✖ 3', '✖ 4'), ['/r']), null);
});

// ---------- verify-plan ----------

const CFG = {
  lowThreshold: 0.2,
  timeoutMs: 1000,
  chunkChars: 100,
  maxChunks: 10,
  questions: { ui: 'Does `diff` change UI?' },
  checks: [
    { id: 'test', cmd: 'npm test', always: true, why: 'always' },
    { id: 'desktop', cmd: 'desktop', triggers: ['src-tauri/**'], why: 'w' },
    { id: 'shot', cmd: 'shot', triggers: ['src/**/*.css'], scope: ['src/components/**'], questions: ['ui'], why: 'w' },
    { id: 'log', cmd: 'log', satisfiedBy: ['CHANGELOG.md'], scope: ['src/**'], questions: ['ui'], why: 'w' },
  ],
};
const byId = (res) => Object.fromEntries(res.results.map((r) => [r.check.id, r.required]));
const diff = (files) => ({ files, diffOf: (f) => `diff ${f}\n@@ one\n${'x'.repeat(150)}\n@@ two\nmore` });

test('verify-plan: paths first, then Jev, fail safe', async () => {
  await withApi(() => ({ noul: () => 0.05 }));
  assert.deepEqual(byId(await plan(CFG, diff(['docs/a.md']))), { test: true, desktop: false, shot: false, log: false });
  assert.deepEqual(byId(await plan(CFG, diff(['src/components/A.tsx']))), { test: true, desktop: false, shot: false, log: false });
  assert.deepEqual(byId(await plan(CFG, diff(['src/app/x.css', 'src-tauri/a.rs', 'CHANGELOG.md']))), { test: true, desktop: true, shot: true, log: false });
  const s = await withApi((body, n) => ({ noul: () => (n === 2 ? 0.5 : 0.05) }));
  const res = await plan(CFG, diff(['src/components/A.tsx']));
  assert.equal(s.requests.length, 2, 'large diff chunked');
  assert.deepEqual(byId(res), { test: true, desktop: false, shot: true, log: true });
  await withApi(() => ({ status: 500 }));
  assert.deepEqual(byId(await plan(CFG, diff(['src/components/A.tsx']))), { test: true, desktop: false, shot: true, log: true });
  await withApi(() => null, { key: false });
  const nokey = await plan(CFG, diff(['src/components/A.tsx']));
  assert.deepEqual(byId(nokey), { test: true, desktop: false, shot: true, log: true });
  assert.match(nokey.results[2].reason, /no Jev key/);
});
