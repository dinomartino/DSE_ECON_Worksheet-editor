import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * The Past paper bank from its built-in address, as a teacher's fresh install meets it: no
 * address in Settings, nothing cached. Walks every topic and checks that each lists all the
 * questions the list promises, none left out, every drawn picture loaded, and that every file
 * came from the built-in address (`src/pastpapers/config.ts:BUILT_IN_SOURCE`).
 *
 *   node scripts/pastpaper-builtin-verify.mjs <out-dir> [--port=3000] [--zh]
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-builtin-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const zh = args.includes('--zh');
const BUILT_IN = 'https://raw.githubusercontent.com/dinomartino/dse-econ-question-bank/main/';
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const manifest = await fetch(`${BUILT_IN}manifest.json`).then((r) => r.json());
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
const fetched = [];
page.on('request', (request) => {
  if (/manifest\.json|\/topics\//.test(request.url())) fetched.push(request.url());
});
if (zh) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('econgen.settings.language')) localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
  });
}
await page.goto(`http://localhost:${port}`);
check((await page.evaluate(() => localStorage.getItem('econgen.settings.pastPapers'))) === null, 'no Past paper bank address set in Settings');
await page.getByRole('button', { name: zh ? /歷屆試題庫/ : /Past paper bank 歷屆試題庫/ }).first().click();
await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 60_000 });
const header = (await page.locator('[data-pastpaper-screen] header').textContent()) ?? '';
check(header.includes(manifest.questions.toLocaleString('en-US')), `the screen counts ${manifest.questions} questions`, header);
const topics = page.locator('[data-pastpaper-screen] nav li button');
const count = await topics.count();
check(count === manifest.topics.length, `${count} topics listed of ${manifest.topics.length}`);
await page.screenshot({ path: `${OUT}/builtin-${zh ? 'zh' : 'en'}-first-topic.png` });

const scroller = page.locator('[data-pastpaper-screen] main .overflow-y-auto').first();
let listed = 0;
let broken = 0;
let pictures = 0;
const short = [];
for (let i = 0; i < count; i += 1) {
  const entry = manifest.topics[i];
  await topics.nth(i).click();
  await page.locator('[data-pastpaper-screen] article').first().waitFor({ timeout: 60_000 }).catch(() => {});
  await page.waitForTimeout(300);
  const status = (await page.locator('[data-pastpaper-screen] main [role="status"]').first().textContent()) ?? '';
  const shown = Number(status.match(/(\d+)/)?.[1] ?? -1);
  const skipped = await page.locator('[data-pastpaper-screen] main', { hasText: zh ? /未有顯示/ : /newer version of Econ Studio/ }).count();
  if (shown !== entry.questions || skipped > 0) short.push(`${entry.id}: ${shown}/${entry.questions}${skipped ? ' skipped' : ''}`);
  listed += Math.max(0, shown);
  // Draw every card (each draws as it nears the viewport), then count the pictures in them.
  for (let y = 0; y < 400; y += 1) {
    const done = await scroller.evaluate((el) => {
      el.scrollBy(0, el.clientHeight * 0.9);
      return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
    });
    await page.waitForTimeout(120);
    if (done) break;
  }
  await page.waitForTimeout(600);
  const pics = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('[data-pastpaper-screen] article')].flatMap((card) =>
      [...card.querySelectorAll('div')].flatMap((d) => (d.shadowRoot ? [...d.shadowRoot.querySelectorAll('img')] : [])),
    );
    await Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
    return { all: imgs.length, broken: imgs.filter((img) => !img.naturalWidth).length };
  });
  pictures += pics.all;
  broken += pics.broken;
}
check(short.length === 0, `every topic lists all its questions, none left out (${listed} of ${manifest.questions})`, short.slice(0, 5).join('; '));
check(pictures > 0 && broken === 0, `${pictures} pictures drawn, none broken`, `${broken} broken`);
const elsewhere = fetched.filter((url) => !url.startsWith(BUILT_IN));
check(fetched.length > count && elsewhere.length === 0, `all ${fetched.length} bank files came from the built-in address`, elsewhere.slice(0, 3).join(' '));
await page.screenshot({ path: `${OUT}/builtin-${zh ? 'zh' : 'en'}-last-topic.png` });
await browser.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
