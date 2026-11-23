#!/usr/bin/env node
/**
 * Sample AI-made diagrams as PNG (k-0515): runs `scripts/diagram-gen-samples.test.ts` to
 * draw every case in `src/diagramGen/fixtures.ts` as SVG, then rasterizes each in Chrome
 * and builds one contact sheet. Usage: `node scripts/diagram-gen-samples.mjs [outDir]`
 * (default `out-diagram-gen/`).
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = path.resolve(process.argv[2] ?? 'out-diagram-gen');
execFileSync('npx', ['vitest', 'run', 'scripts/diagram-gen-samples.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DIAGRAM_OUT: out },
});

const svgs = readdirSync(out).filter((f) => f.endsWith('.svg')).sort();
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const file of svgs) {
  const svg = readFileSync(path.join(out, file), 'utf8');
  await page.setContent(`<html><body style="margin:0;background:#fff">${svg}</body></html>`);
  const el = await page.$('svg');
  await el.screenshot({ path: path.join(out, file.replace(/\.svg$/, '.png')) });
}

// One sheet of every case for a quick look.
const index = JSON.parse(readFileSync(path.join(out, 'index.json'), 'utf8'));
const cells = index
  .map(
    (row) => `<figure><img src="${row.file.replace(/\.svg$/, '.png')}"><figcaption><b>${row.id}</b> · ${row.file.split('.')[1]} · ${row.status}${
      row.issues.length ? `<br><small>${row.issues.map((s) => s.replace(/</g, '&lt;')).join('<br>')}</small>` : ''
    }</figcaption></figure>`,
  )
  .join('\n');
const html = `<html><head><style>body{font:13px system-ui;margin:16px;background:#fff}main{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}figure{margin:0;border:1px solid #ddd;padding:8px}img{width:100%}figcaption{margin-top:6px;color:#333}</style></head><body><main>${cells}</main></body></html>`;
writeFileSync(path.join(out, 'sheet.html'), html);
await page.setViewportSize({ width: 1500, height: 900 });
await page.goto(`file://${path.join(out, 'sheet.html')}`);
await page.screenshot({ path: path.join(out, 'contact-sheet.png'), fullPage: true });
await browser.close();
console.log(`${svgs.length} diagrams → ${out}`);
