import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

/**
 * k-0498: Word shape drawings and charts drawn as pictures, through the real import dialog.
 * Imports a `.docx` (Import from Word… → Review the paper → Save as… → Save and open), then
 * checks every picture on the paper is a stored PNG (the SVG went through the app's own
 * downsizer), screenshots the sheets with pictures, and exports the paper to Word.
 *
 *   node scripts/word-drawings-verify.mjs --file=/path/paper.docx --out=/tmp/k0498/app [--url=http://localhost:3498]
 *
 * Point --file and --out outside the repo when the paper is real.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const FILE = opt('file');
const OUT = opt('out', '/tmp/word-drawings');
const URL_BASE = opt('url', 'http://localhost:3498');
if (!FILE) {
  console.error('--file=<paper.docx> is required');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 }, deviceScaleFactor: 2, acceptDownloads: true });
  // No Save As picker (it never answers under automation): Export falls back to a download.
  await context.addInitScript(() => {
    for (const name of ['showSaveFilePicker', 'showDirectoryPicker']) Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /^Import from Word, PDF or picture/ }).first().click()]);
  await chooser.setFiles([FILE]);
  const dialog = page.getByRole('dialog').first();
  // One file opens straight in the review; several first list the files.
  const review = dialog.getByRole('button', { name: /^Review the paper/ });
  await Promise.race([review.waitFor({ timeout: 60_000 }), dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 })]).catch(async () => {
    await page.screenshot({ path: path.join(OUT, 'stuck.png') });
    throw new Error('the import dialog did not reach the review');
  });
  if (await review.count()) await review.click();
  await dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 });
  await dialog.getByRole('button', { name: /^Save as/ }).click();
  await dialog.getByRole('button', { name: /^Save and open/ }).click();
  await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.first().click();

  const pictures = await page.evaluate(() =>
    [...document.querySelectorAll('#print-root .paper img')].map((img) => ({ kind: img.src.slice(5, img.src.indexOf(';')), w: img.naturalWidth, h: img.naturalHeight, shown: Math.round(img.getBoundingClientRect().width) })),
  );
  console.log(`pictures on the paper: ${pictures.length}`);
  for (const p of pictures) console.log(`  ${p.kind} ${p.w}x${p.h}, shown ${p.shown}px wide`);
  if (pictures.some((p) => p.kind !== 'image/png' && p.kind !== 'image/jpeg')) {
    console.log('FAIL: a picture is not a PNG/JPEG');
    failed = true;
  }

  // Each sheet holding a picture.
  const sheets = page.locator('#print-root .paper');
  const count = await sheets.count();
  let shots = 0;
  for (let i = 0; i < count; i++) {
    const sheet = sheets.nth(i);
    if (!(await sheet.locator('img').count())) continue;
    await sheet.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await sheet.screenshot({ path: path.join(OUT, `sheet-${String(i + 1).padStart(2, '0')}.png`) });
    shots++;
  }
  console.log(`sheets with pictures: ${shots}`);

  // Export to Word: the drawn pictures must reach the .docx.
  await page.getByRole('button', { name: /^Export/ }).first().click();
  const exportDialog = page.getByRole('dialog');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), exportDialog.getByRole('button', { name: /^Export \.docx/ }).click()]);
  const saved = path.join(OUT, 'exported.docx');
  await download.saveAs(saved);
  writeFileSync(path.join(OUT, 'pictures.json'), JSON.stringify(pictures, null, 2));
  console.log(`exported: ${saved}`);
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
