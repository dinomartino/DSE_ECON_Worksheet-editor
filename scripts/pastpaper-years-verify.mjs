import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * The Past paper bank by year (k-0497, user u-nlb5), in a real browser against the built-in
 * bank: the By topic / By year switch, exams and years in order, a year's questions in question
 * order, the keyboard (↑ ↓ → ←), a year with two papers, search in the year and in every year,
 * the exam chips, picking into the tray, the view remembered after a reload, and By topic as it was.
 *
 *   node scripts/pastpaper-years-verify.mjs <out-dir> [--port=3000] [--zh]
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-years-verify';
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = opt('port', '3000');
const zh = args.includes('--zh');
mkdirSync(OUT, { recursive: true });
const lang = zh ? 'zh' : 'en';
const W = zh
  ? { bank: /歷屆試題庫/, byYear: '按年份', byTopic: '按課題', everyYear: '所有年份', thisYear: '此年份', heading: (s) => `${s}（按題號排列）` }
  : { bank: /Past paper bank 歷屆試題庫/, byYear: 'By year', byTopic: 'By topic', everyYear: 'Every year', thisYear: 'This year', heading: (s) => `${s}, in question order` };

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
if (zh) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('econgen.settings.language')) localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
  });
}
await page.goto(`http://localhost:${port}`);
await page.getByRole('button', { name: W.bank }).first().click();
const screen = page.locator('[data-pastpaper-screen]');
await screen.locator('article').first().waitFor({ timeout: 90_000 });

const tags = () => screen.locator('main [data-pastpaper-card]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-card')));
const heading = () => screen.locator('[data-pastpaper-heading]').innerText();
const current = () => screen.locator('[data-pastpaper-years] [aria-current="true"]').first().getAttribute('data-pastpaper-row');
const qOrder = (list) => list.every((tag, i) => i === 0 || Number(tag.split('Q')[1]) > Number(list[i - 1].split('Q')[1]));

// By topic is the default and keeps its topic list.
check((await screen.locator('[data-pastpaper-topics]').count()) === 1, 'By topic first: the topic list');
check((await screen.locator('[data-pastpaper-view="topic"]').getAttribute('aria-checked')) === 'true', 'the switch reads By topic');

await screen.getByRole('radio', { name: W.byYear }).click();
const years = screen.locator('[data-pastpaper-years]');
await years.waitFor();
const exams = await years.locator('[data-pastpaper-exam]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-exam')));
check(exams.join(' ') === 'HKDSE HKCEE HKALE', 'exams: HKDSE, HKCEE, HKALE', exams.join(' '));
const dse = await years.locator('[data-pastpaper-exam="HKDSE"] [data-pastpaper-year]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-year')));
console.log('HKDSE:', dse.join(' '));
check(dse[0] === 'DSE2026' && dse.indexOf('DSE2012') === dse.length - 3 && dse.at(-2) === 'DSEPP' && dse.at(-1) === 'DSESP', 'HKDSE 2026 … 2012, then Practice, then Sample');
const ce = await years.locator('[data-pastpaper-exam="HKCEE"] [data-pastpaper-year]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-year')));
check(ce[0] === 'CE2011' && ce.at(-1) === 'CE1990', 'HKCEE 2011 … 1990', `${ce[0]} … ${ce.at(-1)}`);
check((await current()) === 'DSE2026', 'opens the newest HKDSE year');
const dseName = zh ? '香港中學文憑考試 2026' : 'HKDSE 2026';
check((await heading()) === W.heading(dseName), 'heading names the year', await heading());
await page.waitForTimeout(800);
let list = await tags();
check(list.length > 30 && list.every((t) => t.startsWith('DSE2026/P1/')) && qOrder(list), `${list.length} questions of DSE 2026, Q1 up`, list.slice(0, 4).join(' '));
check(list[0] === 'DSE2026/P1/Q1', 'starts at Q1', list[0]);
check((await screen.locator('[data-pastpaper-paper]').count()) === 0, 'no Paper filter (the list does it)');
await page.screenshot({ path: `${OUT}/years-${lang}-dse2026.png` });

// Questions load as they are reached: the first card is drawn, not a placeholder.
await screen.locator('main article:not([data-pastpaper-index-card])').first().waitFor({ timeout: 60_000 });
check(true, 'the first question draws once its topic downloads');

// Keyboard: ↓ opens the next year, focus follows.
await years.locator('[data-pastpaper-year="DSE2026"]').focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
check((await current()) === 'DSE2025', '↓ opens 2025', await current());
check(await page.evaluate(() => document.activeElement?.getAttribute('data-pastpaper-row')) === 'DSE2025', 'focus follows');
await page.keyboard.press('End');
await page.waitForTimeout(300);
check((await current()) === 'AL1999', 'End: the last year (HKALE 1999)', await current());
await page.keyboard.press('Home');
await page.waitForTimeout(300);
check((await current()) === 'DSE2026', 'Home: the first year');

// A year with two papers: both, a heading at each, then one.
await years.locator('[data-pastpaper-year="AL2005"]').click();
await page.waitForTimeout(500);
const subs = await years.locator('[data-pastpaper-year-paper]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-year-paper')));
check(subs.join(' ') === 'AL2005/P1 AL2005/P2', 'HKALE 2005 lists its two papers', subs.join(' '));
list = await tags();
const firstP2 = list.findIndex((t) => t.startsWith('AL2005/P2'));
check(firstP2 > 0 && list.slice(0, firstP2).every((t) => t.startsWith('AL2005/P1/')) && list.slice(firstP2).every((t) => t.startsWith('AL2005/P2/')), 'Paper 1 then Paper 2', list.join(' '));
check((await screen.locator('main [data-pastpaper-paper-heading]').count()) === 2, 'a heading at each paper');
await page.screenshot({ path: `${OUT}/years-${lang}-al2005.png` });
await years.locator('[data-pastpaper-year="AL2005"]').focus();
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
check((await current()) === 'AL2005/P1', '→ narrows to Paper 1');
list = await tags();
check(list.length > 0 && list.every((t) => t.startsWith('AL2005/P1/')), 'only Paper 1 shows', list.join(' '));
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(300);
check((await current()) === 'AL2005', '← back to the whole year');

// Search: this year, then every year.
await years.locator('[data-pastpaper-year="DSE2016"]').click();
await page.waitForTimeout(300);
const search = screen.locator('header input[type="search"]');
await search.fill('2016 q34');
await page.waitForTimeout(400);
list = await tags();
check(list.join(' ') === 'DSE2016/P1/Q34', 'search in the year by source', list.join(' '));
await search.fill(zh ? '彈性' : 'elasticity');
await page.waitForTimeout(400);
const inYear = await tags();
check(inYear.length > 0 && inYear.every((t) => t.startsWith('DSE2016/')), `search in the year: ${inYear.length}`);
await screen.getByRole('radio', { name: W.everyYear }).click();
await page.waitForTimeout(500);
const every = await tags();
check(every.length > inYear.length, `every year: ${every.length}`);
check((await heading()) === W.everyYear, 'heading: every year');
const order = every.map((t) => t.split('/')[0]);
check(order[0].startsWith('DSE') && !order.slice(order.findIndex((s) => s.startsWith('CE'))).some((s) => s.startsWith('DSE')), 'every year in year order (HKDSE first)');
check((await screen.locator('main [data-pastpaper-paper-heading]').count()) > 1, 'a heading at each paper across years');
await page.screenshot({ path: `${OUT}/years-${lang}-every.png` });
await screen.getByRole('radio', { name: W.thisYear }).click();
await search.fill('');

// Exam chips narrow the list; the open year follows.
await screen.getByRole('button', { name: 'HKCEE', exact: true }).click();
await page.waitForTimeout(400);
const examsNow = await years.locator('[data-pastpaper-exam]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-exam')));
check(examsNow.join(' ') === 'HKCEE', 'HKCEE chip: only HKCEE years', examsNow.join(' '));
check((await current()) === 'CE2011', 'the open year follows: HKCEE 2011', await current());
await screen.getByRole('button', { name: zh ? '全部' : 'All', exact: true }).click();
await page.waitForTimeout(300);

// Pick two questions of one year: the tray, named after the paper.
await years.locator('[data-pastpaper-year="DSE2019"]').click();
const drawn = screen.locator('main article:not([data-pastpaper-index-card]) input[type="checkbox"]');
await drawn.first().waitFor({ timeout: 60_000 });
await drawn.nth(0).check();
await page.waitForTimeout(200);
check((await screen.getByRole('region').count()) === 1, 'picking shows the tray');
await page.screenshot({ path: `${OUT}/years-${lang}-tray.png` });

// Remembered after a reload.
await page.reload();
await page.getByRole('button', { name: W.bank }).first().click();
await screen.locator('[data-pastpaper-years]').waitFor({ timeout: 60_000 });
check((await screen.locator('[data-pastpaper-view="year"]').getAttribute('aria-checked')) === 'true', 'By year remembered after a reload');
check((await current()) === 'DSE2019', 'the open year remembered for the session', await current());

// Back to By topic: the topic list as before.
await screen.getByRole('radio', { name: W.byTopic }).click();
await screen.locator('[data-pastpaper-topics]').waitFor();
await page.waitForTimeout(800);
check((await screen.locator('[data-pastpaper-years]').count()) === 0, 'By topic: the topic list again');
check((await screen.locator('[data-pastpaper-paper]').count()) === 1, 'By topic keeps its Paper filter');
await page.screenshot({ path: `${OUT}/years-${lang}-back-to-topic.png` });

// By year again: picks of one paper go into a new worksheet named after the paper.
await screen.getByRole('radio', { name: W.byYear }).click();
await screen.locator('[data-pastpaper-years]').waitFor();
await years.locator('[data-pastpaper-year="DSE2019"]').click();
await drawn.first().waitFor({ timeout: 60_000 });
await drawn.nth(0).check();
await drawn.nth(1).check();
await page.getByRole('button', { name: zh ? '加入' : 'Add', exact: true }).click();
await page.waitForTimeout(3000);
const names = await page.evaluate(() => JSON.parse(localStorage.getItem('econ-worksheet-index') ?? '[]').map((s) => s.name ?? s.title));
const paperName = zh ? '香港中學文憑考試 2019 卷一' : 'HKDSE 2019 Paper 1';
check(names.includes(paperName), `the new worksheet is named "${paperName}"`, JSON.stringify(names));

// The editor's 題庫 tab → Past papers: By year too (remembered), the open year, Insert.
await page.getByRole('tab', { name: /題庫/ }).click();
await page.getByRole('radio', { name: zh ? '歷屆試題' : 'Past papers' }).click();
const tab = page.locator('[data-pastpaper-tab]');
await tab.locator('[data-pastpaper-tab-year]').waitFor({ timeout: 30_000 });
check((await tab.locator('[data-pastpaper-view="year"]').getAttribute('aria-checked')) === 'true', 'the tab opens By year');
check((await tab.locator('[data-pastpaper-tab-year]').inputValue()) === 'DSE2019', 'the tab opens the same year');
await tab.locator('[data-pastpaper-tab-year]').selectOption('DSE2020');
await tab.locator('article:not([data-pastpaper-index-card])').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(800);
const tabTags = await tab.locator('[data-pastpaper-card]').evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-card')));
check(tabTags.length > 30 && tabTags.every((t) => t.startsWith('DSE2020/P1/')) && qOrder(tabTags), `the tab lists DSE 2020 in question order (${tabTags.length})`);
const held = () => tab.locator('article', { hasText: zh ? '已在此試卷' : 'In this paper' }).count();
const heldBefore = await held();
await tab.locator('article button', { hasText: zh ? '插入' : 'Insert' }).first().click();
await page.waitForTimeout(800);
check((await held()) === heldBefore + 1, 'Insert from the tab: the question then reads In this paper', `${heldBefore} → ${await held()}`);
await page.screenshot({ path: `${OUT}/years-${lang}-editor-tab.png` });

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
