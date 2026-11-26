import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * Arrange 編排's Show source 顯示出處 in the bottom bar (k-0566, user u-ttj3), in a real browser
 * against the built-in bank: the box sits just before Add to 加到 (bank screen) or New worksheet
 * 開新工作紙 (editor's 題庫 tab), the bar stays tidy at MacBook, iPad and Split View widths in
 * English and 中文, and with nothing ticked the bar still shows the box for a topic's own button.
 *
 *   node scripts/arrange-source-tray-verify.mjs <out-dir> [--port=3000] [--prefix=after] [--shots-only]
 *
 * `--shots-only --prefix=before` takes the same screenshots from an older build, no checks.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/arrange-source-tray-verify';
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = opt('port', '3000');
const prefix = opt('prefix', 'after');
const shotsOnly = args.includes('--shots-only');
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  if (shotsOnly) return;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
page.on('dialog', (d) => void d.accept());

const setLang = (lang) =>
  page.evaluate((l) => localStorage.setItem('econgen.settings.language', JSON.stringify(l === 'zh' ? { v: 1, ui: 'zh-HK', paper: 'zh' } : { v: 1, ui: 'en', paper: 'en' })), lang);
const openArrange = async () => {
  await page.goto(`http://localhost:${port}`);
  await page.getByRole('button', { name: /Past paper bank 歷屆試題庫|歷屆試題庫/ }).first().click();
  await page.locator('[data-pastpaper-view="arrange"]').first().waitFor({ timeout: 90_000 });
  await page.locator('[data-pastpaper-view="arrange"]').first().click();
  await page.locator('[data-pastpaper-arrange] [data-arrange-row]').first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(600);
};

// The bar's layout: how many lines its controls take, and whether Show source shares Add to's line.
const trayLayout = (root) =>
  page.locator(`${root} [data-arrange-tray]`).evaluate((tray) => {
    const kids = [...tray.querySelectorAll(':scope > *, :scope > * > *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.classList.contains('flex-1') && el.parentElement === tray;
    });
    const mids = [...new Set(kids.map((el) => { const r = el.getBoundingClientRect(); return Math.round((r.top + r.height / 2) / 6); }))];
    const box = tray.getBoundingClientRect();
    const src = tray.querySelector('[data-arrange-show-sources]')?.getBoundingClientRect();
    const next = tray.querySelector('[data-pastpaper-add-to], [data-arrange-new]')?.getBoundingClientRect();
    const overflow = kids.some((el) => { const r = el.getBoundingClientRect(); return r.right > box.right + 1 || r.left < box.left - 1; });
    const label = tray.querySelector('[data-arrange-show-sources]');
    return {
      lines: mids.length,
      height: Math.round(box.height),
      overflow,
      hasSource: Boolean(src),
      sourceBeforeNext: Boolean(src && next && Math.abs(src.top + src.height / 2 - (next.top + next.height / 2)) < 6 && src.right <= next.left + 1),
      sourceOneLine: Boolean(label && label.getBoundingClientRect().height < 26),
    };
  });

// [label, width, height]: MacBook, iPad landscape / portrait, iPad Split View halves, iPhone.
const SIZES = [
  ['macbook-1440', 1440, 900],
  ['macbook-1280', 1280, 800],
  ['ipad-landscape-1180', 1180, 820],
  ['ipad-portrait-820', 820, 1180],
  ['ipad-split-half-590', 590, 820],
  ['ipad-split-third-375', 375, 820],
];

for (const lang of ['en', 'zh']) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`http://localhost:${port}`);
  await setLang(lang);
  await openArrange();
  const arrange = page.locator('[data-pastpaper-arrange="screen"]');
  await page.screenshot({ path: `${OUT}/${prefix}-bank-nothing-ticked-${lang}-1440.png` });
  check((await arrange.locator('[data-pastpaper-filterbar] [data-arrange-show-sources]').count()) === 0, `${lang}: Show source is gone from the top bar`);
  const idle = arrange.locator('[data-arrange-tray]');
  check((await idle.count()) === 1 && (await idle.locator('[data-arrange-show-sources]').count()) === 1, `${lang}: with nothing ticked the bottom bar still shows Show source (for a topic's New worksheet)`);
  check(!(await arrange.locator('[data-arrange-show-sources] input').isChecked()), `${lang}: Show source off by default`);
  // Tick the first topic.
  await arrange.locator('[data-arrange-topic-check]').first().check();
  await page.waitForTimeout(300);
  const bad = [];
  for (const [label, width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(250);
    if (shotsOnly) {
      await page.screenshot({ path: `${OUT}/${prefix}-bank-ticked-${lang}-${label}.png` });
      continue;
    }
    const t = await trayLayout('[data-pastpaper-arrange="screen"]');
    const lines = width >= 1024 ? 1 : width >= 560 ? 2 : 3;
    if (!t.hasSource || !t.sourceBeforeNext || !t.sourceOneLine || t.overflow || t.lines > lines) bad.push(`${label}: ${JSON.stringify(t)}`);
    await page.screenshot({ path: `${OUT}/${prefix}-bank-ticked-${lang}-${label}.png` });
  }
  check(bad.length === 0, `${lang} bank: Show source right before Add to, ≤1 line from 1024 px, ≤2 in half Split View, ≤3 at 375, nothing cut off`, bad.join('; '));

  // The editor's 題庫 tab: a topic's New worksheet opens the editor, then Bank → Past papers → Arrange.
  await page.setViewportSize({ width: 1440, height: 900 });
  await arrange.locator('[data-arrange-topic-check]').first().uncheck();
  if (!shotsOnly) {
    // A topic's own button follows the box in the bar: tick it, make a worksheet, its sources print.
    await arrange.locator('[data-arrange-tray] [data-arrange-show-sources] input').check();
  }
  await arrange.locator('[data-arrange-make]').nth(1).click();
  await page.locator('#print-root').waitFor({ timeout: 90_000 });
  await page.getByRole('button', { name: /^(Done|完成)$/ }).click().catch(() => {});
  await page.waitForTimeout(3000);
  if (!shotsOnly) {
    const text = (await page.locator('#print-root').innerText()).replace(/ /g, ' ');
    check(/\((DSE|CE|AL)(\d{4}|SP|PP)\/P\d\/Q\d+\)/.test(text), `${lang}: a topic's New worksheet, nothing ticked, prints the sources once the bottom bar's box is ticked`);
  }
  await page.getByRole('tab', { name: /Bank|題庫/ }).first().click();
  await page.getByRole('radio', { name: /^(Past papers|歷屆試題)$/ }).click();
  await page.locator('[data-pastpaper-tab] [data-pastpaper-view="arrange"]').click();
  const tabArr = page.locator('[data-pastpaper-arrange="tab"]');
  await tabArr.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(600);
  check((await tabArr.locator('[data-arrange-tab-bar] [data-arrange-show-sources]').count()) === 0, `${lang} tab: Show source is gone from the top controls`);
  check((await tabArr.locator('[data-arrange-tray] [data-arrange-show-sources]').count()) === 1, `${lang} tab: Show source in the bottom bar with nothing ticked`);
  await page.screenshot({ path: `${OUT}/${prefix}-tab-nothing-ticked-${lang}-1440.png` });
  await tabArr.locator('[data-arrange-topic-check]').first().check();
  await page.waitForTimeout(300);
  const tabBad = [];
  for (const [label, width, height] of SIZES.slice(0, 4)) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${prefix}-tab-ticked-${lang}-${label}.png` });
    if (shotsOnly || (await tabArr.count()) === 0) continue;
    const t = await trayLayout('[data-pastpaper-arrange="tab"]');
    if (!t.hasSource || !t.sourceBeforeNext || !t.sourceOneLine || t.overflow || t.lines > 3) tabBad.push(`${label}: ${JSON.stringify(t)}`);
  }
  check(tabBad.length === 0, `${lang} tab: Show source right before New worksheet, nothing cut off, ≤3 lines`, tabBad.join('; '));
  await tabArr.locator('[data-arrange-topic-check]').first().uncheck().catch(() => {});
}

await browser.close();
if (!shotsOnly) {
  console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}
