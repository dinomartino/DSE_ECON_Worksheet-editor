import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * Past paper tables sized to their words (user u-zhww), walked in a real browser against the
 * built-in bank: the cards (desktop and phone width), the question inserted in a paper, the
 * Width buttons on the table bar, My bank's copy and the `.docx` the Export dialog writes.
 *
 *   node scripts/pastpaper-table-verify.mjs <out-dir> [--port=3000] [--label=after] [--phone]
 *
 * Prints each table's width as a share of its paper; run once on the old build as `before`.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-table-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const label = args.find((a) => a.startsWith('--label='))?.slice(8) ?? 'after';
const phone = args.includes('--phone');
mkdirSync(OUT, { recursive: true });
const tag = `${label}-${phone ? 'phone' : 'desktop'}`;

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const SAMPLES = ['DSE2025/P1/Q34', 'DSE2024/P1/Q23', 'CE2010/P2/Q47', 'CE1993/P2/Q39', 'DSE2021/P1/Q16'];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage(
  phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
    : { viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true },
);
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
});
await page.goto(`http://localhost:${port}`);
await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 60_000 }).catch(() => {});

const findCard = async (source) => {
  await page.getByRole('searchbox').first().fill(source);
  await page.getByRole('radio', { name: 'Every topic' }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const card = page.locator('[data-pastpaper-screen] article').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  return card;
};

/** Each table's width as a share of the drawn paper's text column. */
const cardTables = (card) =>
  card.evaluate((el) => {
    const host = [...el.querySelectorAll('div')].find((d) => d.shadowRoot);
    const sheet = host?.shadowRoot?.querySelector('.sheet');
    if (!sheet) return [];
    const width = sheet.getBoundingClientRect().width;
    // The bank's own tables, not the borderless layout grid that holds the options.
    return [...sheet.querySelectorAll('table')]
      .filter((t) => t.querySelector('td')?.style.border !== 'none')
      .map((t) => Math.round((t.getBoundingClientRect().width / width) * 100) / 100);
  });

const shares = {};
for (const source of SAMPLES) {
  const card = await findCard(source);
  shares[source] = await cardTables(card);
  await card.screenshot({ path: `${OUT}/${tag}-card-${source.replaceAll('/', '-')}.png` });
}
console.log('table width / text column:', JSON.stringify(shares));
if (label === 'after') {
  check(shares['DSE2024/P1/Q23'][0] < 0.75, 'DSE2024 P1 Q23: a short table no longer spans the page', String(shares['DSE2024/P1/Q23']));
  check(shares['CE2010/P2/Q47'][0] < 0.75, 'CE2010 P2 Q47: three short columns, sized to their words', String(shares['CE2010/P2/Q47']));
  check(shares['DSE2025/P1/Q34'][0] < 0.8, 'DSE2025 P1 Q34: the balance sheet sized to its words', String(shares['DSE2025/P1/Q34']));
}

if (!phone) {
  // Into a new Paper 1 and My bank; the editor's table bar; the Word file.
  for (const source of ['DSE2025/P1/Q34', 'DSE2024/P1/Q23']) {
    const card = await findCard(source);
    await card.locator('input[type="checkbox"]').check();
  }
  await page.locator('[role="region"]').getByRole('button', { name: 'Copy to my question bank' }).click();
  await page.waitForTimeout(2500);
  for (const source of ['DSE2025/P1/Q34', 'DSE2024/P1/Q23']) {
    const card = await findCard(source);
    await card.locator('input[type="checkbox"]').check();
  }
  await page.locator('[role="region"]').screenshot({ path: `${OUT}/${tag}-tray.png` });
  await page.locator('[role="region"] select').selectOption('new:paper1');
  await page.locator('[role="region"]').getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('[data-print-hide]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3500);
  const paperTables = await page.evaluate(() => {
    const sheet = document.querySelector('[data-page]') ?? document.body;
    const textCol = [...document.querySelectorAll('p, div')].find((p) => /Study the following balance sheet/.test(p.textContent ?? '') && p.children.length < 3);
    const col = textCol?.parentElement?.getBoundingClientRect().width ?? sheet.getBoundingClientRect().width;
    return [...document.querySelectorAll('table')].filter((t) => /Gini|Assets/.test(t.textContent ?? '') && !t.querySelector('table')).map((t) => Math.round((t.getBoundingClientRect().width / col) * 100) / 100);
  });
  console.log('in the paper (share of the stem paragraph’s width):', JSON.stringify(paperTables));
  await page.screenshot({ path: `${OUT}/${tag}-paper1-editor.png` });
  const gini = page.locator('#print-root table', { hasText: 'Gini coefficient' }).first();
  await gini.scrollIntoViewIfNeeded();
  // Done closes the insert's review strip; a click on a cell's words then puts the caret there,
  // which docks the Table tools bar.
  await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
  await page.waitForTimeout(600);
  // A click on a cell's words puts the caret there, which docks the Table tools bar.
  await gini.locator('td').nth(2).click({ position: { x: 24, y: 6 } });
  await page.waitForTimeout(1200);
  console.log('table bar:', (await page.getByRole('toolbar', { name: 'Table tools' }).textContent().catch(() => 'none'))?.slice(0, 160));
  await page.screenshot({ path: `${OUT}/${tag}-paper1-table-bar.png` });
  if (label === 'after') {
    check((await page.getByRole('button', { name: /Size each column to its words/ }).count()) === 1, 'the table bar offers Fit to content');
    await page.getByRole('button', { name: /Stretch the table across/ }).click();
    await page.waitForTimeout(800);
    const wide = await gini.evaluate((t) => t.getBoundingClientRect().width);
    await page.getByRole('button', { name: /Size each column to its words/ }).click();
    await page.waitForTimeout(800);
    const fit = await gini.evaluate((t) => t.getBoundingClientRect().width);
    check(wide > fit * 1.3, `Full width and Fit to content switch it (${Math.round(wide)} → ${Math.round(fit)} px)`);
  }
  await page.keyboard.press('Escape');
  for (const [language, title] of [['en', 'English only'], ['zh', '中文 only']]) {
    await page.getByRole('button', { name: /^Export/ }).first().click();
    const exporter = page.getByRole('dialog');
    await exporter.getByText('.docx', { exact: true }).click();
    await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle(title, { exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), exporter.getByRole('button', { name: /^Export \.docx/ }).click()]);
    writeFileSync(`${OUT}/${tag}-paper1-${language}.docx`, readFileSync(await download.path()));
    await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
    await page.waitForTimeout(800);
  }
  // My bank's copy.
  await page.goto(`http://localhost:${port}`);
  await page.getByRole('button', { name: /^Question bank/ }).first().click();
  await page.waitForTimeout(2000);
  await page.getByRole('searchbox').first().fill('Gini');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/${tag}-my-bank.png` });
}
await browser.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
