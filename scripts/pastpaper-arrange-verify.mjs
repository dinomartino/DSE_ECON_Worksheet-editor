import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

/**
 * Arrange 編排 on the Past paper bank screen (k-0556, users u-dqw8 + u-o86n), in a real browser
 * against the built-in bank: the whole bank by part and topic with each question's source; a
 * topic ticked in one click (and one question unticked); a drag inside a topic; Alt + ↓; the
 * ticked questions moved to another topic; all of it kept after a reload; a topic made into a
 * new worksheet in that order, its sources on the page and in the .docx; Reset; 中文.
 *
 *   node scripts/pastpaper-arrange-verify.mjs <out-dir> [--port=3000] [--before-port=N]
 *
 * `--before-port` takes the "before" screenshot from another build (the bank screen By topic).
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-arrange-verify';
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const port = opt('port', '3000');
const beforePort = opt('before-port', undefined);
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ channel: 'chrome' });

if (beforePort) {
  const before = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await before.goto(`http://localhost:${beforePort}`);
  await before.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
  await before.locator('[data-pastpaper-screen] article').first().waitFor({ timeout: 90_000 });
  await before.waitForTimeout(2500);
  await before.screenshot({ path: `${OUT}/before-bank-by-topic.png` });
  check(true, 'before: the bank screen, By topic (one topic at a time, cards ticked one by one)');
  await before.close();
}

const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
page.on('dialog', (d) => void d.accept());
// Downloads, not the browser's save picker.
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
});

const openBank = async () => {
  await page.goto(`http://localhost:${port}`);
  await page.getByRole('button', { name: /Past paper bank 歷屆試題庫|歷屆試題庫/ }).first().click();
  await page.locator('[data-pastpaper-screen]').waitFor({ timeout: 60_000 });
};
const arrange = page.locator('[data-pastpaper-arrange]');
const rowsOf = (topic) => arrange.locator(`[data-arrange-topic="${topic}"] [data-arrange-row]`).evaluateAll((els) => els.map((el) => el.getAttribute('data-arrange-row')));

await openBank();
await page.locator('[data-pastpaper-screen] article').first().waitFor({ timeout: 90_000 });
check((await page.locator('[data-pastpaper-view]').count()) === 3, 'the switch offers By topic, By year and Arrange');
await page.getByRole('radio', { name: 'Arrange', exact: true }).click();
await arrange.waitFor();
await arrange.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(800);

// The whole bank, by part and topic, with sources.
const parts = await arrange.locator('[data-arrange-part]').evaluateAll((els) => els.map((el) => el.getAttribute('data-arrange-part')));
check(parts[0] === 'A' && parts.includes('J'), `parts A … J (${parts.join(' ')})`);
const status = await arrange.locator('[role="status"]').first().innerText();
check(/^1,\d{3} questions$/.test(status), `every question listed: ${status}`);
const firstSource = await arrange.locator('[data-arrange-source]').first().innerText();
// The editor's Short source form (u-z6ft, `render/questionSource.ts:shortSource`), user u-rvgs / u-s7cc.
const SHORT = /^(DSE|CE|AL)(\d{4}|SP|PP)\/P\d\/Q\d+$/;
check(SHORT.test(firstSource), `each row names its source in the short form: “${firstSource}”`);
await page.screenshot({ path: `${OUT}/after-arrange-en.png` });

// Choose a topic with at least four questions in part A.
const topicIds = await arrange.locator('[data-arrange-part="A"] [data-arrange-topic]').evaluateAll((els) => els.map((el) => el.getAttribute('data-arrange-topic')));
const topicA = 'scarcity';
const topicB = 'opportunity-cost';
check(topicIds.includes(topicA) && topicIds.includes(topicB), `part A holds ${topicA} and ${topicB}`);
const start = await rowsOf(topicA);
console.log(`${topicA}: ${start.length} questions, first ${start.slice(0, 4).join(' ')}`);

// One click ticks a topic; untick one; the tray counts.
await arrange.locator(`[data-arrange-topic-check="${topicA}"]`).check();
const tray = page.locator('[data-arrange-tray]');
check((await tray.innerText()).includes(`${start.length} ticked`), `one click ticks all ${start.length} of ${topicA}`);
await arrange.locator(`[data-arrange-row="${start[1]}"] input[type="checkbox"]`).uncheck();
check((await tray.innerText()).includes(`${start.length - 1} ticked`), 'unticking one leaves the rest');
const mixed = await arrange.locator(`[data-arrange-topic-check="${topicA}"]`).evaluate((el) => el.indeterminate);
check(mixed, 'the topic box shows “some”');
await arrange.locator(`[data-arrange-topic="${topicA}"]`).scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/after-topic-ticked-en.png` });
await tray.getByRole('button', { name: 'Clear', exact: true }).click();

// Drag the third question above the first.
const third = arrange.locator(`[data-arrange-row="${start[2]}"]`);
const first = arrange.locator(`[data-arrange-row="${start[0]}"]`);
// The first question mid-screen, clear of the edges where a drag scrolls the list.
await first.evaluate((el) => el.scrollIntoView({ block: 'center' }));
const from = await third.boundingBox();
const to = await first.boundingBox();
await page.mouse.move(from.x + 40, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(from.x + 40, from.y + from.height / 2 - 10, { steps: 3 });
await page.mouse.move(to.x + 40, to.y + 6, { steps: 8 });
check((await page.locator('[data-arrange-chip]').count()) === 1, 'a chip follows the pointer while dragging');
check((await arrange.locator('[data-arrange-drop-line]').count()) === 1, 'a line shows where it will land');
await page.screenshot({ path: `${OUT}/after-dragging-en.png` });
await page.mouse.up();
await page.waitForTimeout(300);
let now = await rowsOf(topicA);
check(now[0] === start[2] && now[1] === start[0] && now[2] === start[1], `dragged ${start[2]} to the top`, now.slice(0, 3).join(' '));
check((await arrange.locator(`[data-arrange-topic="${topicA}"] [data-arrange-changed]`).count()) === 1, 'the topic is marked “Your order”');

// Keyboard: Alt + ↓ moves the focused question one place down.
await arrange.locator(`[data-arrange-row="${start[2]}"]`).focus();
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(200);
now = await rowsOf(topicA);
check(now[0] === start[0] && now[1] === start[2], 'Alt + ↓ moves it one place down', now.slice(0, 3).join(' '));
const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-arrange-row'));
check(focused === start[2], 'focus stays on the moved question');

// Move two ticked questions to another topic.
const bStart = await rowsOf(topicB);
const moving = [start[3], start[4]];
for (const key of moving) await arrange.locator(`[data-arrange-row="${key}"] input[type="checkbox"]`).check();
await tray.locator('[data-arrange-move-to]').selectOption(topicB);
await page.waitForTimeout(300);
const bNow = await rowsOf(topicB);
check(bNow.length === bStart.length + 2 && bNow.slice(-2).join() === moving.join(), `Move to… puts both at the end of ${topicB}`, bNow.slice(-3).join(' '));
check(!(await rowsOf(topicA)).some((key) => moving.includes(key)), `and takes them out of ${topicA}`);
const fromNote = await arrange.locator(`[data-arrange-topic="${topicB}"] [data-arrange-row="${moving[0]}"] [data-arrange-moved]`).textContent();
check(/^From /.test(fromNote), `a moved question says where the bank files it: “${fromNote}”`);
await arrange.locator(`[data-arrange-row="${moving[0]}"]`).scrollIntoViewIfNeeded();
await page.screenshot({ path: `${OUT}/after-moved-en.png` });
await tray.getByRole('button', { name: 'Clear', exact: true }).click();

// Kept after a reload, view included.
const arrangedA = await rowsOf(topicA);
const arrangedB = await rowsOf(topicB);
await openBank();
await arrange.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
check((await rowsOf(topicA)).join() === arrangedA.join() && (await rowsOf(topicB)).join() === arrangedB.join(), 'the arrangement and the view survive a reload');

// A topic into a new worksheet, in this order, sources shown.
await arrange.locator(`[data-arrange-row="${arrangedB[0]}"] input[type="checkbox"]`).check();
const sourcesBox = tray.locator('[data-pastpaper-show-sources] input');
await sourcesBox.check();
await tray.getByRole('button', { name: 'Clear', exact: true }).click();
const labelsOf = async (keys) => {
  const out = [];
  for (const key of keys) out.push(await arrange.locator(`[data-arrange-row="${key}"] [data-arrange-source]`).first().textContent());
  return out;
};
const expected = await labelsOf(arrangedB);
await arrange.locator(`[data-arrange-topic-head="${topicB}"] [data-arrange-make]`).click();
await page.locator('#print-root').waitFor({ timeout: 90_000 });
await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
await page.waitForTimeout(3500);
const text = (await page.locator('#print-root').innerText()).replace(/ /g, ' ');
const printed = expected.map((label) => text.indexOf(`(${label})`));
const inOrder = printed.every((at, i) => at >= 0 && (i === 0 || at > printed[i - 1]));
check(inOrder, `the new worksheet holds all ${expected.length} in the teacher’s order, each with its short source`, printed.slice(0, 6).join(' '));
await page.screenshot({ path: `${OUT}/after-worksheet-en.png` });

// The .docx carries the sources in that order.
await page.getByRole('button', { name: /^Export/ }).first().click();
const exporter = page.getByRole('dialog');
await exporter.getByText('.docx', { exact: true }).click();
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), exporter.getByRole('button', { name: /^Export \.docx/ }).click()]);
const file = `${OUT}/after-worksheet-en.docx`;
writeFileSync(file, readFileSync(await download.path()));
const xml = (await (await JSZip.loadAsync(readFileSync(file))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '').replace(/ /g, ' ');
const inDocx = expected.map((label) => xml.indexOf(`(${label})`));
check(inDocx.every((at, i) => at >= 0 && (i === 0 || at > inDocx[i - 1])), 'the .docx prints every source, in order', inDocx.slice(0, 6).join(' '));
await page.keyboard.press('Escape').catch(() => {});

// 中文: the view in Chinese (interface and paper language).
await page.evaluate(() => localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' })));
await openBank();
await arrange.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(800);
check((await page.getByRole('radio', { name: '編排', exact: true }).getAttribute('aria-checked')) === 'true', '中文: the switch reads 編排');
const zhSource = await arrange.locator('[data-arrange-source]').first().innerText();
check(SHORT.test(zhSource), `中文: the same short source “${zhSource}”`);
await arrange.locator(`[data-arrange-topic="${topicB}"]`).scrollIntoViewIfNeeded();
await arrange.locator(`[data-arrange-topic-check="${topicB}"]`).check();
await page.screenshot({ path: `${OUT}/after-arrange-zh.png` });
await page.locator('[data-arrange-tray]').getByRole('button', { name: '清除', exact: true }).click();

// Reset all puts the bank's order back.
await arrange.locator('[data-arrange-reset-all]').click();
await page.waitForTimeout(300);
check((await rowsOf(topicA)).join() === start.join() && (await rowsOf(topicB)).join() === bStart.join(), 'Reset all brings back the bank’s order');
check((await arrange.locator('[data-arrange-changed]').count()) === 0, 'no topic marked after Reset all');

await browser.close();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
