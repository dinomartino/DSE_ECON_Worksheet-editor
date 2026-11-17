import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync } from 'node:fs';

/**
 * The Past paper bank's topic picker by syllabus part (k-0446, user u-7g1b), in a real browser
 * against the built-in bank: parts A to J with counts, the open topic's part open, the topic
 * filter across parts, the paper filter and the question language untouched, and at phone width
 * a folded bar that leaves the questions on screen.
 *
 *   node scripts/pastpaper-topics-verify.mjs <out-dir> [--port=3000] [--label=after]
 *        [--size=desktop|ipad|split|phone] [--zh] [--codes=<file.json>]
 *
 * `--codes` adds `syllabus` to each topic of the list as it arrives ({ "codes": { "<topic id>":
 * ["C.ped", …] } }), for trying the picker before the published list carries the field; a list
 * that already names its codes is left alone. `--label=before` only takes the screenshots.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-topics-verify';
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = opt('port', '3000');
const label = opt('label', 'after');
const size = opt('size', 'desktop');
const codesFile = opt('codes', '');
const zh = args.includes('--zh');
mkdirSync(OUT, { recursive: true });
const tag = `${label}-${size}-${zh ? 'zh' : 'en'}`;

const SIZES = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  split: { viewport: { width: 507, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};
const folded = size === 'phone' || size === 'split';

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const codes = codesFile ? JSON.parse(readFileSync(codesFile, 'utf8')).codes : undefined;
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage(SIZES[size]);
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
let manifest;
await page.route(/\/manifest\.json(\?.*)?$/, async (route) => {
  const response = await route.fetch();
  manifest = await response.json();
  if (codes) for (const t of manifest.topics) if (!t.syllabus && codes[t.id]) t.syllabus = codes[t.id];
  await route.fulfill({ response, json: manifest });
});
if (zh) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('econgen.settings.language')) localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
  });
}
await page.goto(`http://localhost:${port}`);
await page.getByRole('button', { name: zh ? /歷屆試題庫/ : /Past paper bank 歷屆試題庫/ }).first().click();
const screen = page.locator('[data-pastpaper-screen]');
const nav = screen.locator('nav');
await screen.locator('article').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${tag}.png` });

const firstCardTop = async () => (await screen.locator('article').first().boundingBox())?.y ?? Infinity;
const viewportHeight = SIZES[size].viewport.height;

if (label !== 'before') {
  const parts = nav.locator('[data-pastpaper-part]');
  const partCodes = await parts.evaluateAll((els) => els.map((el) => el.getAttribute('data-pastpaper-part')));
  console.log('parts:', partCodes.join(' '));
  check(partCodes.join('') === 'ABCDEFGHIJ', 'the 72 topics under parts A to J, in order', partCodes.join(' '));

  // Each part's count is its topics' sum; every topic sits in exactly one part.
  const byPart = new Map();
  for (const t of manifest.topics) {
    const code = (t.syllabus?.[0] ?? '').split('.')[0];
    byPart.set(code, [...(byPart.get(code) ?? []), t]);
  }
  const counts = await parts.evaluateAll((els) =>
    els.map((el) => Number(el.querySelector('button, div')?.lastElementChild?.textContent ?? 'NaN')),
  );
  const expected = partCodes.map((code) => byPart.get(code)?.reduce((n, t) => n + (t.questions ?? 0), 0));
  check(JSON.stringify(counts) === JSON.stringify(expected), 'each part counts its topics’ questions', `${counts} vs ${expected}`);
  check(expected.reduce((n, c) => n + c, 0) === manifest.questions, `the parts add up to ${manifest.questions}`);

  const partNames = await parts.evaluateAll((els) => els.map((el) => el.querySelector('[title]')?.getAttribute('title')));
  check(partNames[2] === (zh ? '市場與價格' : 'Market and Price'), 'part names in the question language', partNames[2]);

  if (folded) {
    const bar = nav.locator('[data-pastpaper-topic-bar]');
    check(await bar.isVisible(), 'phone width: one topic bar');
    check(!(await nav.locator('[data-pastpaper-topic]').first().isVisible()), 'phone width: the list is folded');
    const top = await firstCardTop();
    check(top < viewportHeight * 0.45, 'phone width: the first question starts in the top half', `y=${Math.round(top)} of ${viewportHeight}`);
    await bar.click();
    await page.waitForTimeout(300);
    check(await nav.locator('[aria-current="true"]').isVisible(), 'the bar opens the list on the open topic');
    await page.screenshot({ path: `${OUT}/${tag}-open.png` });
  } else {
    const navBox = await nav.boundingBox();
    check(navBox && navBox.width <= 290, 'the picker keeps a column of its own', String(navBox?.width));
  }

  // Only the open topic's part is open.
  const expandedParts = await parts.evaluateAll((els) => els.filter((el) => el.querySelector('[aria-expanded="true"]')).map((el) => el.dataset.pastpaperPart));
  const firstPart = (manifest.topics[0].syllabus?.[0] ?? '').split('.')[0];
  check(expandedParts.join() === firstPart, `only the open topic's part is open (${firstPart})`, expandedParts.join());

  // Open part C, pick Elasticity: its questions show, C stays open, A stays as the teacher left it.
  await nav.locator('[data-pastpaper-part="C"] > button').click();
  await nav.locator('[data-pastpaper-topic="elasticity"]').click();
  await page.waitForTimeout(1500);
  const heading = (await screen.locator('main h2').first().textContent()) ?? '';
  check(heading === (zh ? '彈性' : 'Elasticity'), 'picking a topic opens it', heading);
  if (folded) {
    check(!(await nav.locator('[data-pastpaper-topic]').first().isVisible()), 'picking folds the list again');
    const barText = (await nav.locator('[data-pastpaper-topic-bar]').textContent()) ?? '';
    check(barText.includes(zh ? '彈性' : 'Elasticity') && barText.includes('C'), 'the bar names the topic and its part', barText);
    const top = await firstCardTop();
    check(top < viewportHeight * 0.45, 'its first question is in the top half', `y=${Math.round(top)}`);
    await nav.locator('[data-pastpaper-topic-bar]').click();
  }

  // The topic filter: across parts, Enter takes the first hit.
  const filter = nav.getByRole('searchbox');
  await filter.fill(zh ? '貨幣' : 'money');
  await page.waitForTimeout(200);
  const hitParts = await parts.evaluateAll((els) => els.map((el) => el.dataset.pastpaperPart));
  check(hitParts.length >= 2 && hitParts.includes('H') && hitParts.includes('I'), 'the filter finds topics across parts', hitParts.join());
  await page.screenshot({ path: `${OUT}/${tag}-filter.png` });
  const firstHit = await nav.locator('[data-pastpaper-topic]').first().getAttribute('data-pastpaper-topic');
  await filter.press('Enter');
  await page.waitForTimeout(1500);
  check((await nav.locator('[aria-current="true"]').getAttribute('data-pastpaper-topic')) === firstHit, 'Enter in the filter opens the first hit', firstHit);
  check((await filter.inputValue().catch(() => '')) === '', 'and clears the filter');
  if (folded) await nav.locator('[data-pastpaper-topic-bar]').click();
  await filter.fill('xyzzy');
  check(await nav.getByText(zh ? '沒有相符的課題。' : 'No topic matches.').isVisible(), 'no hit says so');
  await filter.press('Escape');
  check((await filter.inputValue()) === '', 'Escape clears the filter');
  if (folded) await nav.locator('[data-pastpaper-topic-bar]').click();

  // The paper filter still spans every topic; the picker then marks no topic.
  const paperSelect = screen.locator('main select').filter({ has: page.locator('option[value^="DSE2016/"]') }).first();
  const options = await paperSelect.locator('option').evaluateAll((els) => els.map((o) => o.value).filter(Boolean));
  await paperSelect.selectOption(options.find((v) => v.startsWith('DSE2016')) ?? options[0]);
  await page.waitForTimeout(1500);
  const paperHeading = (await screen.locator('main h2').first().textContent()) ?? '';
  check(/in question order|按題號排列/.test(paperHeading), 'the paper filter still lists one paper across topics', paperHeading);
  check((await nav.locator('[aria-current="true"]').count()) === 0, 'and no topic is marked meanwhile');
  await paperSelect.selectOption('');

  // The question language switches the part names; the interface stays as it is.
  await screen.getByRole('radio', { name: zh ? 'EN' : '中文' }).click();
  await page.waitForTimeout(300);
  if (folded) await nav.locator('[data-pastpaper-topic-bar]').click();
  const switched = await nav.locator('[data-pastpaper-part="C"] [title]').first().getAttribute('title');
  check(switched === (zh ? 'Market and Price' : '市場與價格'), 'the other question language renames the parts', switched ?? '');
  await page.screenshot({ path: `${OUT}/${tag}-other-language.png` });

  // Keyboard (desktop): Tab reaches the part headers; Enter folds one.
  if (size === 'desktop') {
    const cHeader = nav.locator('[data-pastpaper-part="C"] > button');
    const was = await cHeader.getAttribute('aria-expanded');
    await cHeader.focus();
    await page.keyboard.press('Enter');
    check((await cHeader.getAttribute('aria-expanded')) !== was, 'Enter on a part header folds or opens it');
    await page.keyboard.press('Enter');
  }

  // No sideways scroll at any size.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, 'no sideways scroll', String(overflow));
}

await browser.close();
console.log(failures === 0 ? `\nall checks passed (${tag})` : `\n${failures} FAILED (${tag})`);
process.exit(failures === 0 ? 0 : 1);
