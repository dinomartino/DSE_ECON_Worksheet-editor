import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * k-0480: screenshots of an imported paper in the real app. Seeds a worksheet JSON (the
 * document the import dialog made, written by `scripts/import-probe.test.ts`) and
 * screenshots the sheets holding `--find` text, on the paper or in the Marking scheme view.
 *
 *   node scripts/import-shot.mjs --doc=/tmp/probe/2025.worksheet.json --out=/tmp/shots/2025-paper \
 *     --find="Source A" [--pages=2] [--key] [--url=http://localhost:3480]
 *
 * Writes <out>-1.png, <out>-2.png… (one per sheet, the first sheet holding the text and the
 * ones after it). Real paper text stays out of the repo: point --doc and --out outside it.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const DOC = opt('doc');
const OUT = opt('out', '/tmp/import-shot/shot');
const FIND = opt('find', '');
const PAGES = Number(opt('pages', '1'));
const KEY = args.includes('--key');
const URL_BASE = opt('url', 'http://localhost:3480');
if (!DOC) {
  console.error('--doc=<worksheet.json> is required');
  process.exit(1);
}
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
mkdirSync(OUT.replace(/\/[^/]*$/, ''), { recursive: true });

const json = readFileSync(DOC, 'utf8');
const worksheet = JSON.parse(json);
const title = worksheet.name || 'Imported paper';
const index = JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt ?? Date.now() }]);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([indexJson, key, doc, version]) => {
      window.localStorage.setItem('econ-worksheet-index', indexJson);
      window.localStorage.setItem(key, doc);
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
    },
    [index, `econ-worksheet:${worksheet.id}`, json, APP_VERSION],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  if (KEY) {
    await page.getByText('Marking scheme', { exact: true }).first().click();
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1500);
  const sheets = page.locator('#print-root .paper');
  const count = await sheets.count();
  let first = 0;
  if (FIND) {
    first = -1;
    for (let k = 0; k < count; k++) {
      const text = await sheets.nth(k).innerText();
      if (text.includes(FIND)) {
        first = k;
        break;
      }
    }
    if (first < 0) {
      console.error(`"${FIND}" is on none of the ${count} sheets`);
      process.exit(1);
    }
  }
  for (let k = 0; k < PAGES && first + k < count; k++) {
    const sheet = sheets.nth(first + k);
    await sheet.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await sheet.screenshot({ path: `${OUT}-${k + 1}.png` });
    console.log(`${OUT}-${k + 1}.png (sheet ${first + k + 1} of ${count})`);
  }
} finally {
  await browser.close();
}
