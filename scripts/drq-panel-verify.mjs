import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The DRQ flow in the right panel, in a real Chrome (k-0474).
 *
 *   node scripts/drq-panel-verify.mjs [--url=http://localhost:3000] [--out=/tmp/drq-panel-verify]
 *
 * For English at MacBook width (1440) and 中文 at iPad width (820):
 * 1. A new worksheet, Question → Structured, then the panel's "Start a DRQ": the page
 *    shows Sources A–D and parts (a)–(e); the panel shows four source cards and five parts.
 * 2. Clicking Source B's caption on the page: the "where am I" line names Source B, and
 *    Source B's card wears the selection ring.
 * 3. Part (c)'s Refer to toggles rewrite its opening sentence on the page.
 * 4. Add → Source ▾ → People's views: a Source E card appears and is selected.
 * Screenshots of each step go to `--out`. Exits non-zero if a check fails.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/drq-panel-verify');
mkdirSync(OUT, { recursive: true });
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: {
    newWorksheet: 'New worksheet', classroom: /^Classroom worksheet/, name: 'Name', create: /Create worksheet/,
    dismissHint: 'Dismiss hint', rail: 'Add to worksheet', question: /^Question/, structured: /^Structured/,
    start: 'Start a DRQ', sourceB: 'Source B', where: 'You are editing', referA: 'Source A',
    addSource: 'Add a source: pick what it holds', views: /^People's views/, sourceE: 'Source E',
    partC: /Part \(c\) actions|\(c\)/,
  },
  zh: {
    newWorksheet: '新增工作紙', classroom: /^課堂工作紙/, name: '名稱', create: /建立工作紙/,
    dismissHint: '關閉提示', rail: '插入至工作紙', question: /^題目/, structured: /^結構性問題/,
    start: '建立資料回應題', sourceB: '資料 B', where: '正在編輯', referA: '資料A',
    addSource: '加入資料：選擇內容類型', views: /^各方意見/, sourceE: '資料 E',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });

for (const [ui, width] of [['en', 1440], ['zh', 820]]) {
  const w = WORDS[ui];
  const context = await browser.newContext({ viewport: { width, height: ui === 'zh' ? 1180 : 950 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([ui, version]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (ui === 'zh') window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
    },
    [ui, APP_VERSION],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGE ERR:', e.message);
    failures += 1;
  });
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: w.newWorksheet, exact: true }).click();
  await dialog.getByRole('radio', { name: w.classroom }).click();
  await dialog.getByLabel(w.name, { exact: true }).fill('DRQ');
  await page.getByRole('button', { name: w.create }).click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  const hint = page.getByRole('button', { name: w.dismissHint });
  if (await hint.count()) await hint.click();

  // 1. A structured question, then the panel's DRQ starter.
  const rail = page.getByRole('navigation', { name: w.rail });
  await rail.getByRole('button', { name: w.question }).click();
  await page.getByRole('menuitem', { name: w.structured }).first().click();
  await page.waitForTimeout(500);
  const panel = page.locator('[data-panel-kind="stem"]').first().locator('xpath=ancestor::*[contains(@class,"overflow-y-auto")][1]');
  await page.screenshot({ path: `${OUT}/0-blank-${ui}-${width}.png` });
  const start = page.getByRole('button', { name: w.start });
  check((await start.count()) === 1, `${ui} ${width}: a blank question offers the DRQ starter`);
  await start.click();
  await page.waitForTimeout(700);
  const paperText = await page.locator('#print-root').innerText();
  const letters = ui === 'en' ? ['Source A', 'Source B', 'Source C', 'Source D'] : ['資料A', '資料B', '資料C', '資料D'];
  check(letters.every((l) => paperText.includes(l)), `${ui} ${width}: the page shows Sources A–D`);
  check(/\(e\)/.test(paperText), `${ui} ${width}: the page shows parts up to (e)`);
  check((await page.locator('[data-panel-kind="source"]').count()) === 4, `${ui} ${width}: the panel shows four source cards`);
  check((await page.locator('[data-panel-kind="part"]').count()) === 5, `${ui} ${width}: the panel shows five part cards`);
  check((await start.count()) === 0, `${ui} ${width}: the starter is gone once used`);
  await page.screenshot({ path: `${OUT}/1-drq-${ui}-${width}.png` });

  // 2. Source B's caption on the page → the panel says where.
  await page.locator('#print-root').getByText(ui === 'en' ? 'Source B:' : '資料B：').first().click();
  await page.waitForTimeout(700);
  const where = page.getByRole('navigation', { name: w.where });
  check((await where.count()) === 1 && (await where.innerText()).includes(w.sourceB), `${ui} ${width}: "where am I" names ${w.sourceB}`);
  const ringed = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-panel-kind]')];
    return cards.filter((card) => getComputedStyle(card).boxShadow !== 'none').map((card) => card.querySelector('.panel-kind-chip')?.textContent);
  });
  check(ringed.length === 1 && ringed[0]?.includes(w.sourceB.slice(-1)), `${ui} ${width}: only Source B's card is ringed (${ringed.join(', ')})`);
  await page.screenshot({ path: `${OUT}/2-where-${ui}-${width}.png` });

  // 3. Part (c): Refer to A as well as C and D.
  const partC = page.locator('[data-panel-kind="part"]').nth(2);
  await partC.locator('button[aria-expanded]').first().click();
  await page.waitForTimeout(400);
  await partC.getByRole('button', { name: w.referA, exact: true }).click();
  await page.waitForTimeout(600);
  const after = await page.locator('#print-root').innerText();
  check(
    ui === 'en' ? after.includes('Refer to Sources A, C and D.') : after.includes('參閱資料A、C及D。'),
    `${ui} ${width}: Refer to rewrites (c)'s opening sentence`,
  );
  await partC.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/3-refer-${ui}-${width}.png` });

  // 4. Add → Source ▾ → People's views.
  const stem = page.locator('[data-panel-kind="stem"]').first();
  await stem.getByRole('button', { name: w.addSource }).last().click();
  await page.getByRole('menuitem', { name: w.views }).click();
  await page.waitForTimeout(800);
  const cards = await page.locator('[data-panel-kind="source"] .panel-kind-chip').allInnerTexts();
  check(cards.includes(w.sourceE), `${ui} ${width}: Add → Source → views adds ${w.sourceE} (${cards.join(', ')})`);
  await page.screenshot({ path: `${OUT}/4-add-views-${ui}-${width}.png` });
  void panel;
  await context.close();
}

await browser.close();
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
