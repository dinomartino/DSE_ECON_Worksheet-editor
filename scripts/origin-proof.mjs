import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Proof for k-0558 (hidden origin metadata), step 1 of 2, in the real app: a document saved
 * before k-0558 (no `originId`) is opened, exported as `.docx` through the Export dialog,
 * exported again (the marking scheme), and printed; then the page is reloaded and the
 * stored document read back. Shows the id is made once, stored, and the same in every file.
 *
 *   node scripts/origin-proof.mjs --url=http://localhost:3558 --out=/tmp/k0558-proof
 *   npx vitest run scripts/origin-proof.test.ts      (step 2: the desktop's PDF stamp)
 *   node scripts/origin.mjs /tmp/k0558-proof/*.docx /tmp/k0558-proof/paper.pdf
 *
 * Writes `paper.docx`, `key.docx`, `paper-chrome-raw.pdf` (the engine's print, as the
 * desktop's `print_to_pdf` hands it over before the stamp) and `proof.json`. Needs Chrome
 * (CHROME on Linux).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/k0558-proof');
const URL_ = opt('url', 'http://localhost:3558');
mkdirSync(OUT, { recursive: true });

const fixture = JSON.parse(readFileSync(new URL('../test-fixtures/manual/page-flow-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const browser = await chromium.launch({ channel: 'chrome', executablePath: process.env.CHROME ?? '/opt/google/chrome/chrome' });

const doc = { ...fixture, id: 'k0558-old-file', name: 'Old file' };
delete doc.originId;
const key = `econ-worksheet:${doc.id}`;
const context = await browser.newContext({ viewport: { width: 1400, height: 1800 }, acceptDownloads: true });
await context.addInitScript(
  ([version, indexJson, storageKey, body]) => {
    if (window.localStorage.getItem(storageKey)) return;
    window.localStorage.setItem('econ-worksheet-last-seen-version', version);
    window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: 'en' }));
    window.localStorage.setItem('econ-worksheet-index', indexJson);
    window.localStorage.setItem(storageKey, body);
    delete window.showSaveFilePicker;
  },
  [APP_VERSION, JSON.stringify([{ id: doc.id, title: 'Old file', updatedAt: doc.updatedAt }]), key, JSON.stringify(doc)],
);
const page = await context.newPage();
const stored = () => page.evaluate((k) => JSON.parse(window.localStorage.getItem(k)), key);
const open = async () => {
  await page.goto(URL_, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Old file/ }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
  await page.waitForTimeout(2500);
};

await open();
const beforeExport = (await stored()).originId ?? null;
const opened = await page.evaluate(() => document.querySelector('#print-root')?.textContent ?? '');

const exportDocx = async (what, file) => {
  await page.getByRole('button', { name: /Export…/ }).first().click();
  const exporter = page.getByRole('dialog');
  await exporter.getByText('.docx', { exact: true }).click();
  if (what) await exporter.getByText(what, { exact: true }).first().click();
  const english = exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true });
  if (await english.count()) await english.click();
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 90_000 }),
    exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
  ]);
  await download.saveAs(`${OUT}/${file}`);
  await page.waitForTimeout(500);
};

await exportDocx(undefined, 'paper.docx');
// Autosave (1.2 s) stores the id the export gave the document.
await page.waitForTimeout(2500);
const afterFirst = (await stored()).originId ?? null;
await exportDocx('Answer key', 'key.docx');
await page.waitForTimeout(2500);
const afterSecond = (await stored()).originId ?? null;

// The page as the PDF prints it (no new text may appear in it).
await page.addStyleTag({ content: `@page { size: ${doc.pageSetup?.paper ?? 'A4'} portrait; margin: 0; }` });
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: `${OUT}/paper-chrome-raw.pdf`, printBackground: true, preferCSSPageSize: true });
await page.emulateMedia({ media: 'screen' });

// A fresh load reads the stored document: the id stayed.
await open();
const afterReload = (await stored()).originId ?? null;
const reloadedText = await page.evaluate(() => document.querySelector('#print-root')?.textContent ?? '');

const proof = {
  beforeExport,
  afterFirstExport: afterFirst,
  afterSecondExport: afterSecond,
  afterReload,
  title: 'Page flow mix',
  pageTextHasId: afterFirst ? opened.includes(afterFirst) || reloadedText.includes(afterFirst) : false,
};
writeFileSync(`${OUT}/proof.json`, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify(proof, null, 2));
await browser.close();
