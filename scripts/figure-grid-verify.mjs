import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The stem figure grid in a real Chrome (k-0545).
 *
 *   node scripts/figure-grid-verify.mjs [--url=http://localhost:3000] [--out=/tmp/figure-grid-verify]
 *   node scripts/figure-grid-verify.mjs --old --url=<a 0.10.x build> [--out=…]
 *
 * This build: the frozen v4 corpus opened from the start screen, in English and in 中文: the
 * grid draws four diagrams under (1)–(4), two to a row; a click on (3) opens the question's
 * panel with the grid card; Per row → 4 puts all four in one row on the page; the diagram
 * editor reaches one figure of the grid.
 * `--old`: a build before v4 opens the same file read-only under the "newer version" bar,
 * without a page error, and prints the rest of the paper.
 * Screenshots of each step go to `--out`. Exits non-zero if a check fails.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/figure-grid-verify');
const OLD = args.includes('--old');
mkdirSync(OUT, { recursive: true });
const corpus = readFileSync(new URL('../src/test/corpus/v4-figure-grid.json', import.meta.url), 'utf8');

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: { paperZh: '中文', grid: 'diagrams (1)–(4)', perRow: 'Per row', newer: /newer version/i },
  zh: { paperZh: '中文', grid: '圖表 (1)–(4)', perRow: '每行', newer: /較新版本|新版本/ },
};

const browser = await chromium.launch({ channel: 'chrome' });

async function open(ui, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([ui, corpus]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
      if (ui === 'zh') window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
      if (!window.localStorage.getItem('econ-worksheet:v4-figure-grid-corpus')) {
        const doc = JSON.parse(corpus);
        window.localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: doc.id, title: 'MC practice: diagrams', updatedAt: doc.updatedAt }]));
        window.localStorage.setItem(`econ-worksheet:${doc.id}`, corpus);
      }
    },
    [ui, corpus],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /MC practice: diagrams/ }).first().click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  return { context, page, errors };
}

/** Rows of the first question's grid as the page draws them: figures per row, top to bottom. */
const gridRows = (page) =>
  page.evaluate(() => {
    const svgs = [...document.querySelectorAll('#print-root svg')].filter((s) => s.getBoundingClientRect().width > 60);
    const tops = new Map();
    for (const s of svgs.slice(0, 4)) {
      const top = Math.round(s.getBoundingClientRect().top / 20);
      tops.set(top, (tops.get(top) ?? 0) + 1);
    }
    return [...tops.values()];
  });

for (const ui of ['en', 'zh']) {
  const w = WORDS[ui];
  const { context, page, errors } = await open(ui);
  if (OLD) {
    const bar = page.getByRole('status').filter({ hasText: w.newer });
    check((await bar.count()) > 0, `${ui}: the older build says the file is from a newer version`);
    const text = await page.locator('#print-root').innerText();
    check(text.includes('progressive tax') || text.includes('累進稅'), `${ui}: the older build still prints the question around the grid`);
    check(errors.length === 0, `${ui}: no page error (${errors.join(' | ')})`);
    await page.screenshot({ path: `${OUT}/old-build-${ui}.png` });
    await context.close();
    continue;
  }
  const paper = page.locator('#print-root');
  const text = await paper.innerText();
  check(['(1)', '(2)', '(3)', '(4)'].every((l) => text.includes(l)), `${ui}: the page prints the labels (1)–(4)`);
  check(JSON.stringify(await gridRows(page)) === '[2,2]', `${ui}: four diagrams, two to a row (${JSON.stringify(await gridRows(page))})`);
  await page.screenshot({ path: `${OUT}/grid-page-${ui}.png` });

  // Select the question by its stem, then find the grid's card in the panel.
  await paper.getByText(/progressive tax/).first().click();
  const card = page.getByText(w.grid, { exact: true }).first();
  await card.waitFor({ timeout: 10_000 });
  check(await card.isVisible(), `${ui}: the panel shows the grid card`);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/grid-panel-${ui}.png` });
  const group = page.getByRole('radiogroup', { name: w.perRow }).first();
  await group.getByRole('radio', { name: '4', exact: true }).click();
  await page.waitForTimeout(600);
  check(JSON.stringify(await gridRows(page)) === '[4]', `${ui}: Per row 4 puts all four in one row (${JSON.stringify(await gridRows(page))})`);
  await page.screenshot({ path: `${OUT}/grid-per-row-4-${ui}.png` });
  check(errors.length === 0, `${ui}: no page error (${errors.join(' | ')})`);
  await context.close();
}

await browser.close();
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
