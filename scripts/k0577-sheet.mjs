#!/usr/bin/env node
/**
 * k-0577: one run of `evals/graphs.eval.ts` (or the offline catalogue) → PNGs and a contact
 * sheet. Usage: `node scripts/k0577-sheet.mjs <runDir> [title]`. Reads `<runDir>/summary.json`
 * and `<runDir>/svg/<id>.<en|zh>.svg`; writes `<runDir>/png/` and `<runDir>/sheet.png`.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const dir = path.resolve(process.argv[2] ?? '.');
const title = process.argv[3] ?? path.basename(dir);
const summary = JSON.parse(readFileSync(path.join(dir, 'summary.json'), 'utf8'));
mkdirSync(path.join(dir, 'png'), { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ deviceScaleFactor: 1 });
const svgDir = path.join(dir, 'svg');
for (const file of existsSync(svgDir) ? readdirSync(svgDir).filter((f) => f.endsWith('.svg')) : []) {
  await page.setContent(`<html><body style="margin:0;background:#fff">${readFileSync(path.join(svgDir, file), 'utf8')}</body></html>`);
  const el = await page.$('svg');
  await el.screenshot({ path: path.join(dir, 'png', file.replace(/\.svg$/, '.png')) });
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const cells = summary.rows
  .map((row) => {
    const img = (lang) => (existsSync(path.join(dir, 'png', `${row.id}.${lang}.png`)) ? `<img src="png/${row.id}.${lang}.png">` : `<div class="none">no figure</div>`);
    const notes = [
      row.score !== undefined ? `<b>score ${row.score}/4</b>` : '',
      row.kind ? `${row.kind}${row.template ? ` ${row.template}` : ''}${row.scene ? ` ${row.scene}` : ''}` : '',
      row.charged !== undefined ? `${row.charged} credits, ${row.calls} call(s)` : '',
      row.missingLabels?.length ? `missing: ${row.missingLabels.join(', ')}` : '',
      ...(row.issues ?? []).map(esc),
      row.review ? `<i>${esc(row.review)}</i>` : '',
    ].filter(Boolean);
    return `<section><h3>${esc(row.id)} · ${esc(row.type)} · <span class="${row.status}">${esc(row.status)}</span></h3><div class="pair">${img('en')}${img('zh')}</div><small>${notes.join('<br>')}</small></section>`;
  })
  .join('\n');
const html = `<html><head><meta charset="utf-8"><style>body{font:13px system-ui;margin:16px;background:#fff;width:1460px}h1{font-size:18px}main{display:grid;grid-template-columns:1fr 1fr;gap:16px}section{border:1px solid #ddd;padding:8px}h3{margin:0 0 6px;font-size:13px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}img{width:100%}.none{height:120px;display:grid;place-items:center;background:#f6f6f6;color:#999}.failed,.error{color:#b00}.look{color:#a60}.ok{color:#070}small{color:#333}</style></head><body><h1>${esc(title)}${summary.total !== undefined ? ` · ${summary.total} credits` : ''}</h1><main>${cells}</main></body></html>`;
writeFileSync(path.join(dir, 'sheet.html'), html);
await page.setViewportSize({ width: 1500, height: 900 });
await page.goto(`file://${path.join(dir, 'sheet.html')}`);
await page.screenshot({ path: path.join(dir, 'sheet.png'), fullPage: true });
await browser.close();
console.log(`sheet → ${path.join(dir, 'sheet.png')}`);
