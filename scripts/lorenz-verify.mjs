import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Lorenz figures (k-0584) in a real Chrome: the frozen v3 chart corpus with its two figures
 * replaced by two Lorenz figures the studio drew live (two economies in two boxes; one box with
 * a key), opened from the start screen at MacBook and iPad widths, English and 中文 paper. The
 * page draws square boxes with no axes; selecting a figure opens the diagram editor, which
 * must draw the same. Screenshots go to `--out`.
 *
 *   node scripts/lorenz-verify.mjs --blocks=<a.block.json>,<b.block.json> [--url=http://localhost:3000] [--out=/tmp/lorenz-verify]
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/lorenz-verify');
mkdirSync(OUT, { recursive: true });
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const doc = JSON.parse(readFileSync(new URL('../src/test/corpus/v3-chart.json', import.meta.url), 'utf8'));
const blocks = opt('blocks', '').split(',').filter(Boolean).map((f) => JSON.parse(readFileSync(f, 'utf8')));
doc.id = 'lorenz-verify';
doc.title = 'Lorenz figures';
doc.questions[0].blocks[1].blocks[0] = { ...doc.questions[0].blocks[1].blocks[0], diagram: blocks[0].diagram, widthPx: blocks[0].widthPx, heightPx: blocks[0].heightPx };
doc.questions[0].blocks[2].blocks[0] = { ...doc.questions[0].blocks[2].blocks[0], diagram: blocks[1].diagram, widthPx: blocks[1].widthPx, heightPx: blocks[1].heightPx };
const corpus = JSON.stringify(doc);

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};
const browser = await chromium.launch({ channel: 'chrome' });
for (const [paper, width] of [['en', 1440], ['zh', 1440], ['en', 820]]) {
  const context = await browser.newContext({ viewport: { width, height: 1100 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([paper, corpus, version]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper }));
      const d = JSON.parse(corpus);
      window.localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: d.id, title: d.title, updatedAt: d.updatedAt }]));
      window.localStorage.setItem(`econ-worksheet:${d.id}`, corpus);
    },
    [paper, corpus, APP_VERSION],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGE ERR:', e.message);
    failures += 1;
  });
  await page.goto(URL_BASE, { waitUntil: 'networkidle', timeout: 180_000 });
  await page.getByRole('button', { name: /Lorenz figures/ }).first().click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.first().click();
  await page.waitForTimeout(800);
  const figures = page.locator('#print-root svg [data-arrowhead]');
  check((await figures.count()) === 0, `${paper} ${width}: no axis arrowheads on the page`);
  const tag = `${paper}-${width}`;
  const first = page.locator('#print-root figure, #print-root [data-block-kind="diagram"]').first();
  if (await first.count()) await first.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${tag}-page.png` });
  // Select the first figure: the diagram editor opens.
  // Each figure has a select button over it; a double-click opens the diagram editor.
  const figure = page.locator('#print-root [data-figure-block] button').first();
  await figure.scrollIntoViewIfNeeded();
  await figure.dblclick();
  await page.waitForTimeout(1200);
  check((await page.locator('svg [data-arrowhead]').count()) === 0, `${paper} ${width}: the diagram editor draws no axis arrowheads either`);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${tag}-selected.png` });
  await context.close();
}
await browser.close();
console.log(failures ? `${failures} failure(s)` : 'all ok');
process.exit(failures ? 1 : 0);
