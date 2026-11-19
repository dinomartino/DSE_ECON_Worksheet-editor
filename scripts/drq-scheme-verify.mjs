import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

/**
 * k-0470 (issue #7 point 3): the DRQ marking scheme in a real browser. Seeds a DRQ whose
 * (a) is marked point by point, (b) as HKEAA's paragraph + total and (c) an essay part
 * with the standard EC table, then screenshots:
 *
 *   drq-key-<lang>.png     the Marking scheme view (HKEAA style), the three styles together
 *   drq-panel-<lang>.png   part (b)'s scheme panel: Show answer as, Points | Paragraph + total
 *
 * and checks the view prints (b) as one paragraph with "(3)" and (c)'s EC rows.
 *
 *   node scripts/drq-scheme-verify.mjs [--out=/tmp/drq-scheme-verify] [--url=http://localhost:3000] [--zh]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/drq-scheme-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const zh = args.includes('--zh');
const tag = zh ? 'zh' : 'en';
const W = zh
  ? { key: '評卷參考', paragraph: '一段 + 總分', showAs: '答案顯示方式', ecLine: '運用資料／數據及適當的經濟理論支持論點。' }
  : { key: 'Marking scheme', paragraph: 'Paragraph + total', showAs: 'Show answer as', ecLine: 'Support arguments with the source/data' };
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

mkdirSync(OUT, { recursive: true });
const emit = spawnSync('npx', ['vitest', 'run', 'scripts/drq-scheme-fixture.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DRQ_DIR: OUT },
});
if (emit.status !== 0) process.exit(1);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} [${tag}] ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const json = readFileSync(`${OUT}/drq.worksheet.json`, 'utf8');
const worksheet = JSON.parse(json);
const title = 'DRQ scheme harness';
const index = JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt }]);
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1100 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([indexJson, key, doc, version, chinese]) => {
      window.localStorage.setItem('econ-worksheet-index', indexJson);
      window.localStorage.setItem(key, doc);
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (chinese) window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
    },
    [index, `econ-worksheet:${worksheet.id}`, json, APP_VERSION, zh],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 20_000 });
  if (zh) await page.getByRole('radio', { name: '中文', exact: true }).first().click();
  await page.getByText(W.key, { exact: true }).first().click();
  await page.waitForTimeout(1500);

  const text = await page.evaluate(() => document.querySelector('#print-root')?.innerText ?? '');
  const paragraphStart = zh ? '提取銀行存款可能導致儲備不足。銀行須收回貸款' : 'The withdrawal of bank deposits may result in a reserve shortage. Banks would need';
  check(text.includes(paragraphStart), '(b) prints as one paragraph', text.slice(0, 400));
  check(text.includes(W.ecLine), '(c) prints the standard EC rows');
  await page.locator('#print-root .paper').first().screenshot({ path: `${OUT}/drq-key-${tag}.png` });

  // Part (b)'s panel: select the question (a click on its heading), the sidebar opens it.
  await page.locator('#print-root').getByText(zh ? '第1題' : 'Question 1', { exact: true }).first().click();
  await page.waitForTimeout(1000);
  // Open part (b)'s row in Parts & marks: its panel holds the scheme.
  await page.locator('button[aria-expanded]').filter({ hasText: '(b)' }).first().click();
  await page.waitForTimeout(800);
  const group = page.getByRole('radiogroup', { name: W.showAs });
  const count = await group.count();
  check(count >= 1, "the open part's scheme panel offers Show answer as", `${count} found`);
  if (count >= 1) {
    const chosen = await group.first().getByRole('radio', { name: W.paragraph }).getAttribute('aria-checked');
    check(chosen === 'true', '(b) has Paragraph + total chosen', chosen);
    const panel = group.first().locator('xpath=ancestor::div[contains(@class,"rounded-md")][1]');
    await panel.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await panel.screenshot({ path: `${OUT}/drq-panel-${tag}.png` });
  }
  await page.screenshot({ path: `${OUT}/drq-window-${tag}.png` });
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
