import { chromium } from 'playwright-core';

/**
 * Screenshot harness for UI review.
 *
 * Reading the source hides density problems — a row that looks fine in JSX can be
 * unreadably tight once real bilingual content is in it. This drives the real app in
 * a real browser and can seed it with a worksheet first, because an *empty* document
 * hides exactly the crowding this is meant to catch.
 *
 *   node scripts/shot.mjs <out.png> [--seed] [--dark] [--zh] [--url=http://localhost:3000 | --port=3106]
 *
 * `--zh` runs the interface in 繁體中文; the seed then clicks the 中文 names.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? 'shot.png';
const seed = args.includes('--seed');
const dark = args.includes('--dark');
const zh = args.includes('--zh');
/**
 * What the seed clicks, as each catalogue words it (start/, EditorApp, AddRail, registry).
 * Anchored: an entry's name includes its hint, and 答題線's hint mentions 橫線.
 */
const WORDS = zh
  ? {
      newWorksheet: '新增工作紙', classroom: /^課堂工作紙/, name: '名稱', create: /建立工作紙/, dismissHint: '關閉提示',
      rail: '插入至工作紙', question: '題目', insert: '插入', mcq: /^多項選擇題/, structured: /^結構性問題/, answerLines: /^答題線/, ruledLines: /^橫線/,
    }
  : {
      newWorksheet: 'New worksheet', classroom: /^Classroom worksheet/, name: 'Name', create: /Create worksheet/, dismissHint: 'Dismiss hint',
      rail: 'Add to worksheet', question: 'Question', insert: 'Insert', mcq: /^Multiple Choice/, structured: /^Structured/, answerLines: /^Answer lines/, ruledLines: /^Ruled lines/,
    };
const urlArg = args.find((a) => a.startsWith('--url='));
const portArg = args.find((a) => a.startsWith('--port='));
const URL = urlArg ? urlArg.slice(6) : `http://localhost:${portArg ? portArg.slice(7) : 3000}`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1512, height: 950 },
  deviceScaleFactor: 2,
  colorScheme: dark ? 'dark' : 'light',
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERR:', m.text());
});
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
if (zh) {
  await page.addInitScript(() => {
    window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
  });
}

await page.goto(URL, { waitUntil: 'networkidle' });

if (seed) {
  // Drive the real UI rather than writing storage directly, so what is captured is
  // reachable by a user and the store stays the only thing that builds a question.
  // The app opens on the start screen: New worksheet → Classroom worksheet → name → Create.
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: WORDS.newWorksheet, exact: true }).click();
  await dialog.getByRole('radio', { name: WORDS.classroom }).click();
  await dialog.getByLabel(WORDS.name, { exact: true }).fill('Screenshot');
  await page.getByRole('button', { name: WORDS.create }).click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 15_000 });
  const hint = page.getByRole('button', { name: WORDS.dismissHint });
  if (await hint.count()) await hint.click();

  // The rail's buttons, found inside the rail: the page's own "Insert here" buttons
  // also start with "Insert", so a page-wide match is ambiguous.
  const rail = page.getByRole('navigation', { name: WORDS.rail });
  const add = async (group, item, choice) => {
    await rail.getByRole('button', { name: new RegExp(`^${group}`) }).click();
    await page.getByRole('menuitem', { name: item }).first().click();
    if (choice) await page.getByRole('menuitem', { name: choice }).first().click();
    await page.waitForTimeout(250);
  };
  await add(WORDS.question, WORDS.mcq);
  await add(WORDS.question, WORDS.mcq);
  await add(WORDS.question, WORDS.structured);
  await add(WORDS.insert, WORDS.answerLines, WORDS.ruledLines);
}

await page.waitForTimeout(1200);
await page.screenshot({ path: OUT });
console.log('wrote', OUT);
await browser.close();
