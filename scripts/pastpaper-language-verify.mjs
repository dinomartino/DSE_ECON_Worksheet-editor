import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * Pack names follow the question language, not the interface language (user u-cs6l), walked in a
 * real browser: both interface languages × both question languages, against a local export
 * served from the gitignored `public/pastpaper-bank/` (never committed).
 *
 *   node scripts/pastpaper-language-verify.mjs <out-dir> [--port=3000] [--source=/pastpaper-bank/]
 *
 * Checks, per pair: the topic list, the heading, the paper filter, the question sources and a
 * search's not-yet-downloaded cards name things in the question language, while the chrome
 * ("Topics", "Paper", "Copy to my question bank") stays in the interface language; then the
 * editor's 題庫 tab → Past papers lists topics in the document's language.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-language-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const source = args.find((a) => a.startsWith('--source='))?.slice(9) ?? '/pastpaper-bank/';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const manifest = await fetch(`${URL}${source}manifest.json`).then((r) => r.json());
const titles = { en: new Set(manifest.topics.map((t) => t.title.en)), zh: new Set(manifest.topics.map((t) => t.title.zh ?? t.title.en)) };
const PAPER = { en: 'HKDSE 2016 Paper 1', zh: '香港中學文憑考試 2016 卷一' };
const CHROME = {
  en: { topics: 'Topics', paper: 'Paper', copy: 'Copy to my question bank' },
  'zh-HK': { topics: '課題', paper: '試卷', copy: '複製到我的題庫' },
};

const browser = await chromium.launch({ channel: 'chrome' });

async function openBank(ui) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.addInitScript(
    ([src, zhUi]) => {
      if (sessionStorage.getItem('pp-seeded')) return;
      sessionStorage.setItem('pp-seeded', '1');
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: src }));
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: zhUi ? 'zh-HK' : 'en', paper: zhUi ? 'zh' : 'en' }));
    },
    [source, ui === 'zh-HK'],
  );
  await page.goto(URL);
  const row = page.getByRole('button', { name: new RegExp(ui === 'zh-HK' ? '歷屆試題庫' : 'Past paper bank 歷屆試題庫') }).first();
  await row.waitFor({ timeout: 60_000 });
  await row.click();
  await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 30_000 });
  return page;
}

const screen = (page) => page.locator('[data-pastpaper-screen]');
const settle = (page, ms = 1200) => page.waitForTimeout(ms);
const other = (q) => (q === 'en' ? 'zh' : 'en');

async function walk(ui) {
  const page = await openBank(ui);
  const tag = `ui-${ui === 'zh-HK' ? 'zh' : 'en'}`;
  for (const q of ['en', 'zh']) {
    const pair = `[${tag} · questions ${q}]`;
    await screen(page).getByRole('radio', { name: q === 'en' ? 'EN' : '中文', exact: true }).click();
    await page.locator('[data-pastpaper-paper]').selectOption('');
    await page.getByRole('searchbox').fill('');
    await settle(page);

    // The topic list: every name in the question language (a topic whose two names are the same counts for both).
    const names = await screen(page).locator('nav li button span:first-child').allTextContents();
    const wrong = names.filter((n) => !titles[q].has(n));
    check(names.length === manifest.topics.length && wrong.length === 0, `${pair} the ${names.length} topic names are in the question language`, wrong.slice(0, 3).join(' | '));
    check((await screen(page).locator('nav h2').textContent()) === CHROME[ui].topics, `${pair} the "${CHROME[ui].topics}" heading stays in the interface language`);
    const heading = (await screen(page).locator('main h2').first().textContent()) ?? '';
    check(titles[q].has(heading), `${pair} the topic heading "${heading}" is in the question language`);
    await page.screenshot({ path: `${OUT}/lang-${tag}-questions-${q}-topics.png` });

    // The paper filter: option names, the heading, the sources on the cards.
    const options = await page.locator('[data-pastpaper-paper] option').allTextContents();
    check(options.some((o) => o.startsWith(PAPER[q])) && !options.some((o) => o.startsWith(PAPER[other(q)])), `${pair} the paper filter names papers in the question language`);
    const label = await page.locator('label', { has: page.locator('[data-pastpaper-paper]') }).locator('span').first().textContent();
    check(label === CHROME[ui].paper, `${pair} its "${CHROME[ui].paper}" label stays in the interface language`);
    await page.locator('[data-pastpaper-paper]').selectOption('DSE2016/P1');
    await settle(page, 2500);
    check(((await screen(page).locator('main h2').first().textContent()) ?? '').startsWith(PAPER[q]), `${pair} the heading names the paper in the question language`);
    const first = (await screen(page).locator('article span.font-medium').first().textContent()) ?? '';
    check(first.startsWith(PAPER[q]), `${pair} the card's source "${first}" is in the question language`);
    await page.screenshot({ path: `${OUT}/lang-${tag}-questions-${q}-paper.png` });

    // A search of every topic: cards of topics not downloaded yet name source and topic in the question language.
    await page.locator('[data-pastpaper-paper]').selectOption('');
    await page.getByRole('searchbox').fill('income');
    await screen(page).getByRole('radio', { name: ui === 'zh-HK' ? '所有課題' : 'Every topic' }).click();
    await settle(page, 1500);
    const cards = screen(page).locator('article');
    const topicLines = await cards.locator('span.text-ink-subtle').allTextContents();
    const inTopic = topicLines.filter((t) => /^(in |屬「)/.test(t)).map((t) => t.replace(/^in |^屬「|」$/g, ''));
    const off = inTopic.filter((n) => !titles[q].has(n));
    check(inTopic.length > 0 && off.length === 0, `${pair} search cards name ${inTopic.length} topics in the question language`, off.slice(0, 3).join(' | '));
    await page.screenshot({ path: `${OUT}/lang-${tag}-questions-${q}-search.png` });
  }

  // The editor: questions in the language the interface is not; its 題庫 tab names topics in the document's language.
  const q = ui === 'zh-HK' ? 'en' : 'zh';
  await screen(page).getByRole('radio', { name: q === 'en' ? 'EN' : '中文', exact: true }).click();
  await page.getByRole('searchbox').fill('');
  await page.locator('[data-pastpaper-paper]').selectOption('DSE2016/P1');
  await settle(page, 2500);
  await screen(page).locator('article input[type="checkbox"]').first().check();
  const copy = page.locator('[role="region"]').getByRole('button', { name: CHROME[ui].copy });
  check((await copy.count()) === 1, `[${tag} · questions ${q}] the tray's "${CHROME[ui].copy}" stays in the interface language`);
  await page.locator('[role="region"]').screenshot({ path: `${OUT}/lang-${tag}-questions-${q}-tray.png` });
  await page.locator('[role="region"]').getByRole('button', { name: ui === 'zh-HK' ? '加入' : 'Add', exact: true }).click();
  await page.locator('[data-print-hide]').first().waitFor({ timeout: 30_000 });
  await settle(page, 2500);
  await page.getByRole('tab', { name: /題庫/ }).click();
  await page.getByRole('radio', { name: ui === 'zh-HK' ? '歷屆試題' : 'Past papers' }).click();
  await page.locator('[data-pastpaper-tab] select').first().waitFor({ timeout: 30_000 });
  await settle(page, 2000);
  const tabNames = (await page.locator('[data-pastpaper-tab] select option').allTextContents()).map((n) => n.replace(/ \(\d+\)$/, ''));
  const tabOff = tabNames.filter((n) => !titles[q].has(n));
  check(tabNames.length > 0 && tabOff.length === 0, `[${tag} · document ${q}] the 題庫 tab lists topics in the document's language`, tabOff.slice(0, 3).join(' | '));
  const tabSource = (await page.locator('[data-pastpaper-tab] article span.font-medium').first().textContent()) ?? '';
  check(new RegExp(q === 'en' ? '^HK' : '^香港').test(tabSource), `[${tag} · document ${q}] its sources too ("${tabSource}")`);
  await page.screenshot({ path: `${OUT}/lang-${tag}-document-${q}-sidebar.png` });
  await page.close();
}

try {
  await walk('en');
  await walk('zh-HK');
} finally {
  await browser.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
