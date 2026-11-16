import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * The Past paper bank (k-0443) walked in a real browser, EN and 中文, against a local
 * export served by the dev server (`public/pastpaper-bank/` → an editor pack; gitignored,
 * never committed: the data lives in its own repo).
 *
 *   node scripts/pastpaper-verify.mjs <out-dir> [--port=3000] [--source=/pastpaper-bank/] [--topic="Opportunity Cost"]
 *
 * Checks: the Library row, the screen and a topic, picks → New worksheet (a shared stimulus
 * goes in with its questions, numbered by the new paper), the editor's 題庫 tab → Past
 * papers → Insert (one ⌘Z takes it out), Settings → Past paper bank, and that nothing of the
 * bank lands in the documents' localStorage (only the new worksheet does).
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const source = args.find((a) => a.startsWith('--source='))?.slice(9) ?? '/pastpaper-bank/';
const topicName = args.find((a) => a.startsWith('--topic='))?.slice(8) ?? 'Opportunity Cost';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ channel: 'chrome' });

async function walk(zh) {
  const tag = zh ? 'zh' : 'en';
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.addInitScript(
    ([src, zhUi]) => {
      if (sessionStorage.getItem('pp-seeded')) return;
      sessionStorage.setItem('pp-seeded', '1');
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: src }));
      if (zhUi) localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
    },
    [source, zh],
  );
  await page.goto(URL);
  const title = zh ? '歷屆試題庫' : 'Past paper bank 歷屆試題庫';
  const row = page.getByRole('button', { name: new RegExp(title) }).first();
  await row.waitFor({ timeout: 60_000 });
  check(true, `[${tag}] Library row is there`);
  await page.screenshot({ path: `${OUT}/01-start-${tag}.png` });

  await row.click();
  await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 30_000 });
  const topics = await page.locator('[data-pastpaper-screen] nav li').count();
  check(topics > 0, `[${tag}] topics listed (${topics})`);
  const topicLabel = zh ? null : topicName;
  if (topicLabel) await page.locator('[data-pastpaper-screen] nav button', { hasText: topicLabel }).first().click();
  else await page.locator('[data-pastpaper-screen] nav button').nth(4).click();
  await page.locator('[data-pastpaper-screen] article').first().waitFor({ timeout: 30_000 });
  // 中文 interface: the paper in 中文 too, so the Chinese picture is the one shown.
  if (zh) await page.getByRole('radio', { name: '中文', exact: true }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/02-topic-${tag}.png` });

  if (zh) {
    await page.close();
    return;
  }

  // Kept in IndexedDB (never in the documents' localStorage): the list and the opened topics.
  const kept = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('econ-pastpaper-bank');
        open.onsuccess = () => {
          const req = open.result.transaction('files').objectStore('files').count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(-1);
        };
        open.onerror = () => resolve(-1);
      }),
  );
  check(kept >= 2, `[${tag}] the list and opened topics are kept in IndexedDB (${kept} files)`);

  // A search by source.
  await page.getByRole('searchbox').fill('1997');
  await page.waitForTimeout(500);
  const shown = await page.locator('[data-pastpaper-screen] article').count();
  check(shown >= 1, `[${tag}] search "1997" leaves ${shown} question(s)`);
  await page.screenshot({ path: `${OUT}/03-search-${tag}.png` });

  // Pick the two that share a stimulus (CE1997 Q2, Q3) plus one more.
  const boxes = page.locator('[data-pastpaper-screen] article input[type=checkbox]');
  const n = await boxes.count();
  for (let i = 0; i < Math.min(2, n); i++) await boxes.nth(i).check();
  await page.getByRole('searchbox').fill('');
  await page.waitForTimeout(400);
  await page.locator('[data-pastpaper-screen] article input[type=checkbox]').first().check();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/04-picked-${tag}.png` });

  const docKeysBefore = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('econ-worksheet:')).length);
  check(docKeysBefore === 0, `[${tag}] browsing saved no document (${docKeysBefore})`);

  await page.getByRole('button', { name: zh ? '加入' : 'Add', exact: true }).click();
  await page.locator('#print-root, [data-page]').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/05-new-worksheet-${tag}.png` });
  const pageText = await page.evaluate(() => document.body.innerText);
  check(/Questions? 1 and 2|Questions 2 and 3/.test(pageText), `[${tag}] the stimulus prints its derived range`);
  check(!/Answer Questions 2 and 3 by referring/.test(pageText), `[${tag}] the paper's old lead sentence is not printed twice`);

  // The 題庫 tab → Past papers → Insert.
  await page.getByRole('tab', { name: /題庫/ }).click();
  await page.getByRole('radio', { name: zh ? '歷屆試題' : 'Past papers' }).click();
  await page.locator('[data-pastpaper-tab] article').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/06-editor-tab-${tag}.png` });
  const before = await page.evaluate(() => document.querySelectorAll('[data-pastpaper-tab] article').length);
  const insert = page.locator('[data-pastpaper-tab] article button', { hasText: zh ? '插入' : 'Insert' }).first();
  await insert.click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/07-inserted-${tag}.png` });
  check(before > 0, `[${tag}] the tab lists questions (${before})`);
  const inPaper = await page.locator('[data-pastpaper-tab] article', { hasText: zh ? '已在此試卷' : 'In this paper' }).count();
  check(inPaper >= 4, `[${tag}] four questions now read "In this paper" (${inPaper})`);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await page.waitForTimeout(800);
  const inPaperAfter = await page.locator('[data-pastpaper-tab] article', { hasText: zh ? '已在此試卷' : 'In this paper' }).count();
  check(inPaperAfter === inPaper - 1, `[${tag}] one ⌘Z takes the insert out (${inPaperAfter})`);

  await page.close();
}

async function settingsShot(zh) {
  const tag = zh ? 'zh' : 'en';
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
  await page.addInitScript(
    ([src, zhUi]) => {
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: src }));
      if (zhUi) localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
    },
    [source, zh],
  );
  await page.goto(URL);
  await page.getByRole('button', { name: zh ? /設定/ : /Settings/ }).first().click();
  await page.getByRole('dialog').getByText(zh ? '歷屆試題庫' : 'Past paper bank', { exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/08-settings-${tag}.png` });
  check(true, `[${tag}] Settings → Past paper bank`);
  await page.close();
}

await walk(false);
await walk(true);
await settingsShot(false);
await settingsShot(true);
await browser.close();
console.log(failures === 0 ? 'all passed' : `${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
