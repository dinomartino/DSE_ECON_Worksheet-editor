import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { chromium } from 'playwright-core';

/**
 * k-0544, hand-run, step 2 of 2: draws every picture set collected by
 * `scripts/studio-composite-sheet.test.ts` with the studio's own `composite.ts:drawComposite`, in
 * a real browser, and lays them out on a contact sheet to check by eye.
 *   node scripts/studio-composite-sheet.mjs <cells.json> <out dir>
 * Writes `<out>/<tag>-<lang>.png` (each composite as sent) and `<out>/contact-sheet-<lang>.png`.
 */
const [cellsFile = '/tmp/studio-composite-cells.json', outDir = 'composites'] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const sets = JSON.parse(readFileSync(cellsFile, 'utf8'));
const source = readFileSync(path.resolve('src/questionStudio/composite.ts'), 'utf8');
// ES module output with its `export` keywords dropped: plain declarations a page script can call.
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext } }).outputText.replace(/^export /gm, '');

const browser = await chromium.launch({ channel: 'chrome', executablePath: process.env.CHROME ?? '/opt/google/chrome/chrome' });
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');
await page.addScriptTag({ content: `${js}\nwindow.drawComposite = drawComposite;` });
const made = [];
for (const set of sets) {
  const url = await page.evaluate((cells) => window.drawComposite(cells), set.cells);
  if (!url) {
    console.error(`${set.tag} ${set.lang}: not drawn`);
    continue;
  }
  const name = `${set.tag.replace(/\//g, '-')}-${set.lang}`;
  writeFileSync(path.join(outDir, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
  made.push({ ...set, name, url, kb: Math.round((url.length * 3) / 4 / 1024) });
}
// The contact sheet: each composite at a fixed width, captioned with its question, size and weight.
for (const lang of ['en', 'zh']) {
  const items = made.filter((m) => m.lang === lang);
  const html = `<html><body style="margin:0;background:#eee;font:14px Arial"><div style="display:grid;grid-template-columns:repeat(3,620px);gap:14px;padding:14px">${items
    .map((m) => `<figure style="margin:0;background:#fff;padding:8px"><img src="${m.url}" style="width:604px;border:1px solid #ccc" onload="this.nextSibling.textContent += ' · ' + this.naturalWidth + '×' + this.naturalHeight + ' px'"><figcaption><b>${m.tag}</b> ${m.at} · ${m.kb} KB</figcaption></figure>`)
    .join('')}</div></body></html>`;
  const sheet = await browser.newPage({ viewport: { width: 3 * 620 + 4 * 14, height: 800 } });
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.screenshot({ path: path.join(outDir, `contact-sheet-${lang}.png`), fullPage: true });
}
writeFileSync(path.join(outDir, 'composites.json'), JSON.stringify(made.map((m) => ({ name: m.name, tag: m.tag, lang: m.lang, at: m.at, kb: m.kb, labels: m.cells.map((c) => c.label) })), null, 1));
console.log(`${made.length} composites drawn of ${sets.length} → ${outDir}`);
await browser.close();
