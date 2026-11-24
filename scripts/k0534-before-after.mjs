#!/usr/bin/env node
/**
 * The k-0534 before/after sheet. Usage: `node scripts/k0534-before-after.mjs [outDir]`
 * (default `Outbox/k-0534/before-after` beside the repo's workspace).
 *
 * - Before: the pre-k-0534 engine (develop a11491c5, checked out read-only in a temporary
 *   worktree) on each case's recorded old reply, with the narrated stem the old writer rule
 *   produced. Case 1 also shows the user's own screenshot of the real draft.
 * - After: `scripts/k0534-proof.test.ts`, the current studio engine (write → diagram → solve,
 *   and one follow-up) on recorded replies, English and 中文.
 * Recorded, not live: no model key is reachable from the build machine (see PLAN.md).
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { CASES } from './k0534-proof-cases.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] ?? path.join(ROOT, '../../../../Outbox/k-0534/before-after'));
const INBOX = path.resolve(OUT, '..');
const OLD_REV = 'a11491c5';
const OLD = path.join('/tmp', `k0534-old-${process.pid}`);
mkdirSync(OUT, { recursive: true });

// ---- after: the current engine ----
execFileSync('npx', ['vitest', 'run', 'scripts/k0534-proof.test.ts'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, K0534_OUT: OUT } });
const after = JSON.parse(readFileSync(path.join(OUT, 'after.json'), 'utf8'));

// ---- before: the old engine, in a throwaway worktree ----
const OLD_HARNESS = `
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { blockOf, evaluateReply } from '@/diagramGen/run';
import { diagramSvg } from '@/render/diagram';
import { CASES } from './k0534-proof-cases.mjs';
it('old', () => {
  const OUT = process.env.K0534_OUT;
  mkdirSync(OUT, { recursive: true });
  const before = {};
  for (const c of CASES) for (const side of ['en', 'zh']) {
    const e = evaluateReply(JSON.stringify(c.old), { sides: [side], key: 'Correct answer: ' + 'ABCD'[c.answer] });
    const block = e && blockOf(e, [side]);
    writeFileSync(path.join(OUT, 'before-' + c.id + '.' + side + '.svg'), block ? diagramSvg(block.diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language: side, scale: 2, answers: 'show' }) : '');
    before[c.id + '.' + side] = { issues: (e ? e.issues : []).map((i) => i.level + ': ' + i.text) };
  }
  writeFileSync(path.join(OUT, 'before.json'), JSON.stringify(before, null, 2));
});
`;
try {
  execFileSync('git', ['worktree', 'add', '--detach', OLD, OLD_REV], { cwd: ROOT, stdio: 'ignore' });
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(OLD, 'node_modules'));
  copyFileSync(path.join(ROOT, 'scripts/k0534-proof-cases.mjs'), path.join(OLD, 'scripts/k0534-proof-cases.mjs'));
  writeFileSync(path.join(OLD, 'scripts/k0534-old.test.ts'), OLD_HARNESS);
  execFileSync('npx', ['vitest', 'run', 'scripts/k0534-old.test.ts'], { cwd: OLD, stdio: 'inherit', env: { ...process.env, K0534_OUT: OUT } });
} finally {
  // Only what this script added is removed; then the worktree is clean and goes without --force.
  for (const f of ['node_modules', 'scripts/k0534-proof-cases.mjs', 'scripts/k0534-old.test.ts']) rmSync(path.join(OLD, f), { force: true });
  if (existsSync(OLD)) execFileSync('git', ['worktree', 'remove', OLD], { cwd: ROOT, stdio: 'ignore' });
}
const before = JSON.parse(readFileSync(path.join(OUT, 'before.json'), 'utf8'));

// ---- rasterise and lay out ----
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const png = async (name) => {
  const file = path.join(OUT, `${name}.svg`);
  if (!existsSync(file)) return '';
  const svg = readFileSync(file, 'utf8');
  if (!svg.trim()) return '';
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  await (await page.$('svg')).screenshot({ path: path.join(OUT, `${name}.png`) });
  rmSync(file);
  return `${name}.png`;
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
const sub = (s) => esc(s).replace(/([A-Z]+)_\{?(\d)\}?/g, '$1<sub>$2</sub>');
const options = (c, side, answer) =>
  `<ol type="A">${c.options[side].map((o, i) => `<li${i === answer ? ' class="key"' : ''}>${sub(o)}</li>`).join('')}</ol>`;
const checks = (a) =>
  [
    `<b>Diagram:</b> ${a.diagram ? a.diagram.status : 'none'}${a.diagram?.solved ? ` · key from the drawing: <b>${a.diagram.solved.labels.join(' to ')}</b> = option ${'ABCD'[a.diagram.solved.option]}` : ''}`,
    `<b>Checks:</b> ${a.checks.map((k) => `${k.id} ${k.state === 'pass' ? '✓' : k.state}`).join(' · ')}`,
    `<b>Requests:</b> ${a.requests.join(' → ')}`,
  ].join('<br>');

const sections = [];
for (const c of CASES) {
  const cells = [];
  for (const side of ['en', 'zh']) {
    const b = before[`${c.id}.${side}`];
    const a = after[`${c.id}.${side}`];
    const bImg = await png(`before-${c.id}.${side}`);
    const aImg = await png(`after-${c.id}.${side}`);
    cells.push(`
      <div class="cell before"><h4>Before · ${side === 'en' ? 'English' : '中文'}</h4>
        <p class="stem">${sub(c.before[side])}</p>${bImg ? `<img src="${bImg}">` : ''}${options(c, side, c.answer)}
        <p class="note"><b>What the new checks now catch:</b><br>${a.oldCaught.length ? a.oldCaught.map(esc).join('<br>') : '—'}</p>
        <p class="note muted">Old checks: ${b.issues.length ? b.issues.map(esc).join('<br>') : 'none raised'}</p></div>
      <div class="cell after"><h4>After · ${side === 'en' ? 'English' : '中文'}</h4>
        <p class="stem">${sub(a.stem[side])}</p>${aImg ? `<img src="${aImg}">` : ''}${options(c, side, a.answer)}
        <p class="note">${checks(a)}</p></div>`);
  }
  const real = c.beforeImage && existsSync(path.join(INBOX, c.beforeImage)) ? `<div class="real"><h4>The real draft (the user's screenshot)</h4><img src="../${c.beforeImage}"></div>` : '';
  const ref = c.referenceImage && existsSync(path.join(INBOX, c.referenceImage)) ? `<div class="real"><h4>The reference it was read from (HKDSE)</h4><img src="../${c.referenceImage}"></div>` : '';
  let follow = '';
  if (c.followUp) {
    const rows = [];
    for (const side of ['en', 'zh']) {
      const f = after[`followup-${c.id}.${side}`];
      const img = await png(`followup-${c.id}.${side}`);
      rows.push(`<div class="cell after"><h4>Follow-up · ${side === 'en' ? 'English' : '中文'}: “${esc(f.note)}”</h4>${img ? `<img src="${img}">` : ''}${options(c, side, f.answer)}
        <p class="note"><b>Stem unchanged:</b> ${f.stem[side] === after[`${c.id}.${side}`].stem[side] ? 'yes' : 'no'}<br>${checks(f)}<br><b>Writer told:</b> ${esc(f.rewriteNote)}</p></div>`);
    }
    follow = `<div class="row">${rows.join('')}</div>`;
  }
  sections.push(`<section id="${c.id}"><h2>${esc(c.title.en)} <span class="zh">${esc(c.title.zh)}</span></h2>${real || ref ? `<div class="row">${real}${ref}</div>` : ''}<div class="row">${cells.join('')}</div>${follow}</section>`);
}

const html = `<!doctype html><html><head><meta charset="utf-8"><title>k-0534 before / after</title><style>
body{font:14px/1.45 -apple-system,system-ui,"PingFang HK","Noto Sans CJK TC",sans-serif;margin:24px;background:#fff;color:#222;max-width:1900px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:18px;margin:28px 0 10px;border-top:2px solid #222;padding-top:12px}h2 .zh{color:#666;font-weight:normal;margin-left:8px}
h4{margin:0 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:.03em}
.row{display:flex;gap:14px;align-items:flex-start;margin-bottom:12px}.cell{flex:1;min-width:0;border:1px solid #ddd;border-radius:6px;padding:10px}
.before{background:#fff7f6}.before h4{color:#b42318}.after{background:#f5fbf6}.after h4{color:#18794e}
.cell img{width:100%;max-width:420px;display:block;margin:6px 0}.real{flex:1;border:1px dashed #bbb;padding:8px;border-radius:6px}.real img{width:100%;max-width:640px}
.stem{margin:0 0 6px}ol{margin:4px 0 6px 18px;padding:0}li.key{font-weight:bold}li.key::after{content:"  ← key";color:#18794e;font-weight:normal}
.note{font-size:12px;margin:6px 0 0}.muted{color:#888}.intro{color:#444;max-width:1100px}
</style></head><body>
<h1>k-0534 · AI diagrams in the Question studio: before / after</h1>
<p class="intro">Six multiple-choice questions with a figure, each in English and 中文. <b>Recorded model replies</b> (no live key on the build machine): “before” runs the old engine (develop ${OLD_REV}) on the kind of reply the old prompt asked for, with the narrated stem its writer rule produced; “after” runs today's studio engine end to end: write (with the new <code>figure</code> line) → diagram → blind solve, and one follow-up edit. Built by <code>scripts/k0534-before-after.mjs</code>.</p>
${sections.join('\n')}
</body></html>`;
writeFileSync(path.join(OUT, 'index.html'), html);
await page.setViewportSize({ width: 1900, height: 1000 });
await page.goto(`file://${path.join(OUT, 'index.html')}`);
await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });
for (const c of CASES) {
  const el = await page.$(`#${c.id}`);
  await el.screenshot({ path: path.join(OUT, `case-${c.id}.png`) });
}
await browser.close();
console.log(`sheet → ${path.join(OUT, 'index.html')}`);
