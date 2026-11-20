import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The data chart (bar / line) in a real Chrome (k-0474).
 *
 *   node scripts/chart-verify.mjs [--url=http://localhost:3000] [--out=/tmp/chart-verify]
 *
 * Opens the frozen v3 chart corpus from the start screen, in English and in 中文, at
 * MacBook and iPad widths: the page draws both charts; selecting the bar chart opens its
 * fields in the panel; a typed figure, + Series and Bar → Line all redraw the page; the
 * fields fit the sidebar (no horizontal overflow). Screenshots go to `--out`. Exits
 * non-zero if a check fails.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/chart-verify');
mkdirSync(OUT, { recursive: true });
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const corpus = readFileSync(new URL('../src/test/corpus/v3-chart.json', import.meta.url), 'utf8');

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: { dismissHint: 'Dismiss hint', addSeries: '+ Series', line: 'Line graph', bar: 'Bar chart' },
  zh: { dismissHint: '關閉提示', addSeries: '+ 數列', line: '折線圖', bar: '棒形圖' },
};

const browser = await chromium.launch({ channel: 'chrome' });

for (const [ui, width] of [['en', 1440], ['zh', 1440], ['en', 820], ['zh', 820]]) {
  const w = WORDS[ui];
  const context = await browser.newContext({ viewport: { width, height: 1000 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([ui, corpus, version]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (ui === 'zh') window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
      if (!window.localStorage.getItem('econ-worksheet:v3-chart-corpus')) {
        const doc = JSON.parse(corpus);
        window.localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: doc.id, title: 'DRQ charts', updatedAt: doc.updatedAt }]));
        window.localStorage.setItem(`econ-worksheet:${doc.id}`, corpus);
      }
    },
    [ui, corpus, APP_VERSION],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGE ERR:', e.message);
    failures += 1;
  });
  await page.goto(URL_BASE, { waitUntil: 'networkidle', timeout: 180_000 });
  await page.getByRole('button', { name: /DRQ charts/ }).first().click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  const hint = page.getByRole('button', { name: w.dismissHint });
  if (await hint.count()) await hint.click();

  const tag = `${ui} ${width}`;
  const bars = () => page.locator('#print-root [data-chart-bar]').count();
  check((await bars()) === 2, `${tag}: the page draws the bar chart's two bars`);
  check((await page.locator('#print-root [data-chart-line]').count()) === 3, `${tag}: the line graph draws its three lines`);

  // The figure sits under its selection overlay; clicking it selects the figure.
  const overlay = page
    .locator('#print-root svg:has([data-chart-bar])')
    .first()
    .locator('xpath=ancestor::*[.//button[@data-print-hide]][1]')
    .locator('button[data-print-hide]')
    .first();
  await overlay.click();
  await page.waitForTimeout(700);
  let fields = page.locator('[data-chart-fields]').first();
  if (!(await fields.count())) {
    await page.locator('#print-root').getByText(/Source A|資料A/).first().click();
    await page.waitForTimeout(700);
    fields = page.locator('[data-chart-fields]').first();
  }
  check((await fields.count()) >= 1, `${tag}: the panel shows the chart fields`);
  if (await fields.count()) {
    await fields.scrollIntoViewIfNeeded();
    const overflow = await fields.evaluate((el) => el.scrollWidth - el.clientWidth);
    check(overflow <= 1, `${tag}: the fields fit the sidebar (overflow ${overflow}px)`);
    await page.screenshot({ path: `${OUT}/panel-${ui}-${width}.png` });

    // Type the missing third figure: a third bar appears.
    const third = fields.locator('input[type="number"]').nth(2);
    await third.fill('-20000');
    await page.waitForTimeout(600);
    check((await bars()) === 3, `${tag}: typing a figure adds its bar on the page`);
    await fields.getByRole('button', { name: w.addSeries }).click();
    await page.waitForTimeout(400);
    check((await page.locator('#print-root [data-chart-legend]').count()) >= 2, `${tag}: + Series brings in the legend`);
    await fields.getByRole('radio', { name: w.line }).click();
    await page.waitForTimeout(600);
    check((await bars()) === 0, `${tag}: Bar → Line redraws the page as lines`);
    await page.screenshot({ path: `${OUT}/edited-${ui}-${width}.png` });
  }
  await context.close();
}

await browser.close();
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
