import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

// The filter bar stays on one row (user u-huv8): every control, Show answers included, at every
// title length, in EN and 中文, in all three views, at 1280–2000 px and in a narrow window.
const barRow = () =>
  page.locator('[data-pastpaper-filterbar]').evaluate((bar) => {
    const kids = [...bar.children].filter((el) => el.getBoundingClientRect().width > 0 && !el.classList.contains('flex-1'));
    const mids = kids.map((el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
    const h2 = bar.querySelector('h2');
    const box = bar.getBoundingClientRect();
    const ans = bar.querySelector('[data-pastpaper-show-answers]')?.getBoundingClientRect();
    const chips = bar.querySelector('[role="group"]')?.getBoundingClientRect();
    const rightmost = Math.max(...kids.map((el) => el.getBoundingClientRect().right));
    return {
      // Show answers in sight without scrolling, in front of the filters (narrow), or last (from 1280 px; u-jwar).
      answersSeen: !ans || (ans.left >= box.left - 1 && ans.right <= box.right + 1),
      answersFront: !ans || (chips !== undefined && ans.right <= chips.left),
      answersLast: !ans || ans.right >= rightmost - 1,
      spread: Math.max(...mids) - Math.min(...mids),
      height: bar.getBoundingClientRect().height,
      answers: bar.querySelector('[data-pastpaper-show-answers]') !== null,
      scrolls: bar.scrollWidth > bar.clientWidth + 1,
      truncated: h2.scrollWidth > h2.clientWidth + 1,
      full: h2.getAttribute('title') === h2.textContent,
    };
  });
const openTopic = async (id, name) => {
  const find = page.locator('[data-pastpaper-topics] input[type="search"], [data-pastpaper-topics] input').first();
  await find.fill(name);
  await page.locator(`[data-pastpaper-topic="${id}"]`).first().click();
  await find.fill('');
  await page.waitForTimeout(500);
};
const BAR_TOPICS = [
  ['gdp', { en: 'GDP', zh: 'GDP' }],
  ['economic-free-goods', { en: 'Economic & Free', zh: '經濟物品' }],
  ['tax-base-tax-net-effects-of-tax-changes', { en: 'Tax Base', zh: '稅基' }],
];
const WIDTHS = [1280, 1440, 1600, 2000, 1024, 760];
await page.goto(`http://localhost:${port}`);
for (const lang of ['en', 'zh']) {
  await page.evaluate((l) => localStorage.setItem('econgen.settings.language', JSON.stringify(l === 'zh' ? { v: 1, ui: 'zh-HK', paper: 'zh' } : { v: 1, ui: 'en', paper: 'en' })), lang);
  await openBank();
  await page.locator('[data-pastpaper-view]').first().waitFor({ timeout: 90_000 });
  for (const view of ['topic', 'year', 'arrange']) {
    await page.locator(`[data-pastpaper-view="${view}"]`).click();
    await page.waitForTimeout(800);
    const topics = view === 'topic' ? BAR_TOPICS : [[undefined, undefined]];
    for (const [id, name] of topics) {
      if (id) {
        await page.setViewportSize({ width: 1440, height: 900 });
        await openTopic(id, name[lang]).catch(() => check(false, `${lang}: open ${id}`));
        await page.locator('[data-pastpaper-screen] article').first().waitFor({ timeout: 90_000 });
      }
      const bad = [];
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(150);
        const row = await barRow();
        const placed = width >= 1280 ? row.answersLast : row.answersSeen && row.answersFront;
        const ok = row.spread < 4 && row.height < 60 && (view === 'arrange' || row.answers) && (!row.truncated || row.full) && placed;
        if (!ok || (width >= 1280 && row.scrolls)) bad.push(`${width}px spread ${row.spread.toFixed(1)} h ${row.height.toFixed(0)}${row.scrolls ? ' scrolls' : ''}${row.truncated ? ' truncated' : ''}${placed ? '' : ' answers misplaced'}`);
        if (lang === 'zh' && id === 'economic-free-goods' && width === 1440) await page.screenshot({ path: `${OUT}/after-filterbar-zh-1440.png`, clip: { x: 0, y: 0, width, height: 140 } });
        if (lang === 'en' && id === 'tax-base-tax-net-effects-of-tax-changes' && width === 1280) await page.screenshot({ path: `${OUT}/after-filterbar-en-1280-long.png`, clip: { x: 0, y: 0, width, height: 140 } });
        if (lang === 'zh' && id === 'tax-base-tax-net-effects-of-tax-changes' && width === 760) await page.screenshot({ path: `${OUT}/after-filterbar-zh-760.png`, clip: { x: 0, y: 0, width, height: 420 } });
        if (lang === 'en' && id === 'economic-free-goods' && width === 1024) await page.screenshot({ path: `${OUT}/after-filterbar-en-1024.png`, clip: { x: 0, y: 0, width, height: 140 } });
      }
      check(bad.length === 0, `${lang} ${view}${id ? ` ${id}` : ''}: one row at ${WIDTHS.join(', ')} px${view === 'arrange' ? '' : ', Show answers on it: in front and in sight below 1280 px, last from 1280'}; no sideways scroll from 1280 up`, bad.join('; '));
    }
  }
}
await page.setViewportSize({ width: 1440, height: 900 });
await page.evaluate(() => localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: 'en' })));
await page.evaluate(() => localStorage.removeItem('econgen.settings.pastPapers'));

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

// The fold-all button is gone (u-ymov reverted u-hwfl's); each part and topic still folds on its own.
check((await arrange.getByRole('button', { name: /^(Collapse all|Open all|Close all)$/ }).count()) === 0, 'no fold-all button: parts and topics fold one by one');
await arrange.locator('[data-arrange-part="C"] button[aria-expanded]').first().click();
await page.waitForTimeout(200);
const cFolded = await arrange.locator('[data-arrange-part="C"] [data-arrange-row]').count();
await arrange.locator('[data-arrange-part="C"] button[aria-expanded]').first().click();
await page.waitForTimeout(300);
check(cFolded === 0 && (await arrange.locator('[data-arrange-part="C"] [data-arrange-row]').count()) > 0, 'part C folds and opens with its own arrow');

// Show all 全部顯示 / Hide all 全部隱藏 (u-ymov): every question's printed view, drawn only near the screen.
const showAll = arrange.locator('[data-arrange-show-all]');
check((await showAll.getAttribute('data-arrange-show-all')) === 'hidden' && (await showAll.innerText()) === 'Show all', 'the button reads Show all');
await showAll.click();
const sheets = arrange.locator('[data-arrange-sheet]');
const drawnPaper = () => arrange.locator('[data-arrange-sheet="drawn"]').evaluateAll((els) => els.filter((el) => [...el.querySelectorAll('div')].some((d) => d.shadowRoot?.querySelector('.sheet'))).length);
await page.waitForFunction(() => [...document.querySelectorAll('[data-arrange-sheet="drawn"]')].some((el) => [...el.querySelectorAll('div')].some((d) => d.shadowRoot?.querySelector('.sheet'))), null, { timeout: 60_000 });
await page.waitForTimeout(800);
const opened = await sheets.count();
const drawn = await arrange.locator('[data-arrange-sheet="drawn"]').count();
check(opened === 1759 && (await showAll.innerText()) === 'Hide all', `Show all opens all ${opened} questions; the button reads Hide all`);
check(drawn > 0 && drawn < 120 && (await drawnPaper()) > 0, `only the papers near the screen are drawn: ${drawn} of ${opened}`);
await page.screenshot({ path: `${OUT}/after-show-all-en.png` });
// Scroll the whole list: frames stay short, drawn papers stay few, a far topic draws when reached.
const scrollStats = await page.evaluate(async () => {
  const box = document.querySelector('[data-pastpaper-arrange] .overflow-y-auto');
  const gaps = [];
  let last = performance.now();
  let most = 0;
  for (let i = 0; i < 240 && box.scrollTop + box.clientHeight < box.scrollHeight - 4; i++) {
    box.scrollTop += 700;
    await new Promise((r) => requestAnimationFrame(r));
    const now = performance.now();
    gaps.push(now - last);
    last = now;
    most = Math.max(most, document.querySelectorAll('[data-arrange-sheet="drawn"]').length);
  }
  gaps.sort((x, y) => x - y);
  return { frames: gaps.length, p50: Math.round(gaps[Math.floor(gaps.length / 2)]), p95: Math.round(gaps[Math.floor(gaps.length * 0.95)]), max: Math.round(gaps.at(-1)), most, end: box.scrollTop };
});
console.log('scroll through every question shown:', JSON.stringify(scrollStats));
check(scrollStats.frames > 50 && scrollStats.most < 160, `scrolling all 1,759 keeps the drawn papers few (at most ${scrollStats.most} at once; frames p50 ${scrollStats.p50} ms, p95 ${scrollStats.p95} ms)`);
// Then to the very end (far topics take their real height as they are reached, so jump until it holds).
await page.evaluate(async () => {
  const box = document.querySelector('[data-pastpaper-arrange] .overflow-y-auto');
  for (let i = 0; i < 40; i++) {
    box.scrollTop = box.scrollHeight;
    await new Promise((r) => setTimeout(r, 250));
    if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) break;
  }
});
await page.waitForTimeout(1500);
const lastPart = await arrange.locator('[data-arrange-part]').last().getAttribute('data-arrange-part');
await page.waitForFunction(() => [...document.querySelectorAll('[data-arrange-sheet="drawn"]')].some((el) => el.closest('[data-arrange-part]') === [...document.querySelectorAll('[data-arrange-part]')].at(-1) && [...el.querySelectorAll('div')].some((d) => d.shadowRoot?.querySelector('.sheet'))), null, { timeout: 60_000 });
check(true, `part ${lastPart} at the end draws its papers when scrolled to`);
await page.screenshot({ path: `${OUT}/after-show-all-end-en.png` });
// One row's own Hide still works with every question shown; Hide all closes them all.
await arrange.locator('[data-arrange-part="A"] [data-arrange-topic-head]').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
await page.waitForTimeout(500);
const oneRow = arrange.locator('[data-arrange-row]').first();
await oneRow.locator('button[aria-expanded="true"]').click();
await page.waitForTimeout(200);
check((await oneRow.locator('button[aria-expanded]').getAttribute('aria-expanded')) === 'false' && (await sheets.count()) === 1758, 'one row hides on its own while the rest stay shown');
await showAll.click();
await page.waitForTimeout(300);
check((await sheets.count()) === 0 && (await showAll.innerText()) === 'Show all', 'Hide all hides every printed view; the button reads Show all again');
await arrange.locator('[data-arrange-row]').first().evaluate((el) => el.closest('.overflow-y-auto').scrollTo(0, 0));

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
// Arrange's own Show source tick (u-n9h1): off unless ticked, every visit.
const sourcesBox = arrange.locator('[data-arrange-show-sources] input');
check(!(await sourcesBox.isChecked()), 'Show source in Arrange is off by default');
check((await tray.count()) === 0 || (await tray.locator('[data-pastpaper-show-sources]').count()) === 0, 'the tray has no second Show source box');
await sourcesBox.check();
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
// Each source on its own line above its question, never alone at the foot of a sheet (u-tchj).
const tagPlaces = await page.evaluate(() => {
  const ps = [...document.querySelectorAll('#print-root p')];
  return ps
    .filter((p) => /^\((DSE|CE|AL)(\d{4}|SP|PP)\/P\d\/Q\d+\)$/.test(p.textContent.trim()))
    .map((p) => {
      const next = ps[ps.indexOf(p) + 1];
      return { tag: p.textContent.trim(), page: p.closest('[data-page-index]')?.getAttribute('data-page-index'), nextPage: next?.closest('[data-page-index]')?.getAttribute('data-page-index'), numbered: Boolean(next && [...next.querySelectorAll('span.absolute')].some((s) => /^\d+\.$/.test(s.textContent.trim()))) };
    });
});
const tagSheets = new Set(tagPlaces.map((t) => t.page));
check(tagPlaces.length === expected.length && tagSheets.size >= 3 && tagPlaces.every((t) => t.numbered && t.page === t.nextPage), `every source sits on its own line right above its question, on the same sheet (${tagPlaces.length} over ${tagSheets.size} sheets)`, JSON.stringify(tagPlaces.filter((t) => !t.numbered || t.page !== t.nextPage).slice(0, 3)));
await page.emulateMedia({ media: 'print' });
const tagPdf = `${OUT}/after-worksheet-en.pdf`;
await page.pdf({ path: tagPdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
await page.emulateMedia({ media: 'screen' });
const pdfPages = execFileSync('pdftotext', ['-layout', tagPdf, '-'], { encoding: 'utf8' }).split('\f');
const pdfTags = pdfPages.flatMap((sheet, at) => {
  const lines = sheet.split('\n');
  return lines.flatMap((line, i) => {
    if (!/^\s*\((DSE|CE|AL)(\d{4}|SP|PP)\/P\d\/Q\d+\)\s*$/.test(line)) return [];
    const next = lines.slice(i + 1).find((l) => l.trim() !== '');
    return [{ at, tag: line.trim(), numbered: next !== undefined && /^\s*\d+\.\s*\S/.test(next) }];
  });
});
check(pdfTags.length === expected.length && pdfTags.every((t) => t.numbered), `the PDF: all ${pdfTags.length} sources alone on their line, each with its numbered line below on the same page (${pdfPages.length - 1} pages)`, JSON.stringify(pdfTags.filter((t) => !t.numbered).slice(0, 3)));

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
// 中文: 全部顯示 / 全部隱藏.
const zhAll = arrange.locator('[data-arrange-show-all]');
check((await zhAll.innerText()) === '全部顯示', '中文: the button reads 全部顯示');
await zhAll.click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-arrange-sheet="drawn"]')].some((el) => [...el.querySelectorAll('div')].some((d) => d.shadowRoot?.querySelector('.sheet'))), null, { timeout: 60_000 });
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/after-show-all-zh.png` });
check((await zhAll.innerText()) === '全部隱藏' && (await arrange.locator('[data-arrange-row] button[aria-expanded="true"]').first().innerText()) === '隱藏', '中文: every row reads 隱藏; the button reads 全部隱藏');
await zhAll.click();
await page.waitForTimeout(300);
check((await arrange.locator('[data-arrange-sheet]').count()) === 0, '中文: 全部隱藏 hides them all');

// Reset all puts the bank's order back.
await arrange.locator('[data-arrange-reset-all]').click();
await page.waitForTimeout(300);
check((await rowsOf(topicA)).join() === start.join() && (await rowsOf(topicB)).join() === bStart.join(), 'Reset all brings back the bank’s order');
check((await arrange.locator('[data-arrange-changed]').count()) === 0, 'no topic marked after Reset all');

// A whole part into a worksheet: a heading per topic, in order (u-n9h1); Show source left off.
const partWorksheet = async (lang) => {
  await openBank();
  await arrange.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  check(!(await arrange.locator('[data-arrange-show-sources] input').isChecked()), `${lang}: Show source is off again on a new visit`);
  const titles = await arrange.locator('[data-arrange-part="A"] [data-arrange-topic-head] h4').evaluateAll((els) => els.map((el) => el.textContent.trim()));
  await arrange.locator('[data-arrange-part="A"] > div [data-arrange-make]').first().click();
  await page.locator('#print-root').waitFor({ timeout: 120_000 });
  await page.getByRole('button', { name: /^(Done|完成)$/ }).click().catch(() => {});
  await page.waitForTimeout(4000);
  const pageWords = (await page.locator('#print-root').innerText()).replace(/\s+/g, ' ');
  // Each heading after the one before (a topic's name can also be a word in an earlier question).
  const inTurn = (text, words) => words.reduce((out, word) => [...out, text.indexOf(word, (out.at(-1) ?? -1) + 1)], []);
  const at = inTurn(pageWords, titles);
  check(titles.length >= 6 && at.every((n, i) => n >= 0 && (i === 0 || n > at[i - 1])), `${lang}: part A worksheet: ${titles.length} topic headings on the page, in order`, titles.map((t, i) => `${t}@${at[i]}`).join(', '));
  check(!/\((DSE|CE|AL)(\d{4}|SP|PP)\/P\d\/Q\d+\)/.test(pageWords), `${lang}: no source printed with Show source off`);
  const first = page.locator('#print-root').getByText(titles[1], { exact: true }).first();
  await first.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${OUT}/after-headings-${lang}.png` });
  // The PDF: the page printed.
  await page.emulateMedia({ media: 'print' });
  const pdf = `${OUT}/after-headings-${lang}.pdf`;
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  const printed = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).replace(/\s+/g, '');
  const pAt = inTurn(printed, titles.map((title) => title.replace(/\s+/g, '')));
  check(pAt.every((n, i) => n >= 0 && (i === 0 || n > pAt[i - 1])), `${lang}: the PDF prints the headings in order`, pAt.join(' '));
  return titles;
};
const zhTitles = await partWorksheet('zh');
check(zhTitles.includes('稀少性') || zhTitles.some((t) => /[\u4e00-\u9fff]/.test(t)), `中文 headings: ${zhTitles.slice(0, 3).join('、')}`);

await page.evaluate(() => localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: 'en' })));
const enTitles = await partWorksheet('en');
await page.getByRole('button', { name: /^Export/ }).first().click();
const exporter2 = page.getByRole('dialog');
await exporter2.getByText('.docx', { exact: true }).click();
const [download2] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), exporter2.getByRole('button', { name: /^Export \.docx/ }).click()]);
const file2 = `${OUT}/after-headings-en.docx`;
writeFileSync(file2, readFileSync(await download2.path()));
const xml2 = (await (await JSZip.loadAsync(readFileSync(file2))).file('word/document.xml').async('string')).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
const dAt = enTitles.reduce((out, title) => [...out, xml2.indexOf(title, (out.at(-1) ?? -1) + 1)], []);
check(dAt.every((n, i) => n >= 0 && (i === 0 || n > dAt[i - 1])), 'en: the .docx prints the headings in order', dAt.join(' '));

// The editor's 題庫 tab: Arrange there too (u-jwar), the same saved order and ticks.
await page.getByRole('tab', { name: /Bank/ }).first().click();
await page.getByRole('radio', { name: 'Past papers', exact: true }).click();
const tabBox = page.locator('[data-pastpaper-tab]');
await tabBox.locator('[data-pastpaper-view="arrange"]').click();
const tabArr = page.locator('[data-pastpaper-arrange="tab"]');
await tabArr.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(600);
const tabRows = (topic) => tabArr.locator(`[data-arrange-topic="${topic}"] [data-arrange-row]`).evaluateAll((els) => els.map((el) => el.getAttribute('data-arrange-row')));
check(SHORT.test(await tabArr.locator('[data-arrange-source]').first().textContent()), 'tab: rows with the short source');
check(!(await tabArr.locator('[data-arrange-show-sources] input').isChecked()), 'tab: Show source off by default');
await page.screenshot({ path: `${OUT}/after-tab-arrange-en.png` });
const tabAll = tabArr.locator('[data-arrange-show-all]');
check((await tabAll.innerText()) === 'Show all', 'tab: Show all');
await tabAll.click();
await page.waitForFunction(() => [...document.querySelectorAll('[data-pastpaper-arrange="tab"] [data-arrange-sheet="drawn"]')].some((el) => [...el.querySelectorAll('div')].some((d) => d.shadowRoot?.querySelector('.sheet'))), null, { timeout: 60_000 });
await page.waitForTimeout(800);
const tabOpened = await tabArr.locator('[data-arrange-sheet]').count();
const tabDrawn = await tabArr.locator('[data-arrange-sheet="drawn"]').count();
await page.screenshot({ path: `${OUT}/after-tab-show-all-en.png` });
check(tabOpened === 1759 && tabDrawn < 120 && (await tabAll.innerText()) === 'Hide all', `tab: Show all opens all ${tabOpened}, ${tabDrawn} drawn near the screen; Hide all next`);
await tabAll.click();
await page.waitForTimeout(300);
check((await tabArr.locator('[data-arrange-sheet]').count()) === 0, 'tab: Hide all');
// Go to a topic, then drag inside it.
await tabArr.locator('[data-arrange-go-to]').selectOption('division-of-labour');
await page.waitForTimeout(600);
const dl = await tabRows('division-of-labour');
const tThird = tabArr.locator(`[data-arrange-row="${dl[2]}"]`);
const tFirst = tabArr.locator(`[data-arrange-row="${dl[0]}"]`);
await tFirst.evaluate((el) => el.scrollIntoView({ block: 'center' }));
const tf = await tThird.boundingBox();
const tt = await tFirst.boundingBox();
await page.mouse.move(tf.x + 30, tf.y + tf.height / 2);
await page.mouse.down();
await page.mouse.move(tf.x + 30, tf.y + tf.height / 2 - 10, { steps: 3 });
await page.mouse.move(tt.x + 30, tt.y + 6, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(300);
let dlNow = await tabRows('division-of-labour');
check(dlNow[0] === dl[2] && dlNow[1] === dl[0], 'tab: a drag reorders', dlNow.slice(0, 3).join(' '));
await tabArr.locator(`[data-arrange-row="${dl[2]}"]`).focus();
await page.keyboard.press('Alt+ArrowDown');
await page.waitForTimeout(200);
dlNow = await tabRows('division-of-labour');
check(dlNow[0] === dl[0] && dlNow[1] === dl[2], 'tab: Alt + ↓ moves one place down', dlNow.slice(0, 3).join(' '));
// Tick two topics in one click each; Add puts them into this paper, a heading per topic.
const tabTitle = async (topic) => (await tabArr.locator(`[data-arrange-topic-head="${topic}"] h4`).textContent()).trim();
const t1 = await tabTitle('division-of-labour');
const t2 = await tabTitle('types-of-goods');
await tabArr.locator('[data-arrange-topic-check="division-of-labour"]').check();
await tabArr.locator('[data-arrange-topic-check="types-of-goods"]').check();
const tabTray = tabArr.locator('[data-arrange-tray]');
check((await tabTray.innerText()).includes(`${dl.length + 7} ticked`), `tab: two ticks select ${dl.length + 7}`);
await page.screenshot({ path: `${OUT}/after-tab-ticked-en.png` });
await tabTray.locator('[data-arrange-add]').click();
await page.waitForTimeout(3500);
const after = (await page.locator('#print-root').innerText()).replace(/\s+/g, ' ');
const h1 = after.lastIndexOf(t1);
const h2 = after.lastIndexOf(t2);
check(h1 > 0 && h2 > h1, `tab: Add puts both topics into this paper under their headings, in order (${t1}, ${t2})`);
await page.locator('#print-root').getByText(t2, { exact: true }).last().scrollIntoViewIfNeeded().catch(() => {});
await page.screenshot({ path: `${OUT}/after-tab-added-en.png` });
// New worksheet from ticked questions: a new paper opens with them.
await tabArr.locator('[data-arrange-topic-check="circular-flow"]').check();
await tabTray.locator('[data-arrange-new]').click();
await page.waitForTimeout(3500);
const contentTab = await page.getByRole('tab', { name: /^Content/ }).first().innerText();
check(/Content\s*7\b/.test(contentTab), `tab: New worksheet opens a new paper with the 7 ticked questions (${contentTab.replace(/\s+/g, ' ')})`);
// Shared with the bank screen: tick one in the tab, then go Home → Past paper bank → Arrange.
await page.getByRole('tab', { name: /Bank/ }).first().click().catch(() => {});
await page.waitForTimeout(800);
const tabArr2 = page.locator('[data-pastpaper-arrange="tab"]');
await tabArr2.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
const oneKey = (await tabArr2.locator('[data-arrange-topic="equity"] [data-arrange-row]').first().getAttribute('data-arrange-row'));
await tabArr2.locator(`[data-arrange-row="${oneKey}"] input[type="checkbox"]`).check();
await page.getByRole('button', { name: 'Econ Studio home' }).first().click();
await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
await arrange.locator('[data-arrange-row]').first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(500);
check((await rowsOf('division-of-labour')).join() === dlNow.join(), 'the screen shows the order made in the tab');
check(await arrange.locator(`[data-arrange-row="${oneKey}"] input[type="checkbox"]`).isChecked(), 'and the tick made in the tab');
await arrange.locator('[data-arrange-reset-all]').click();

await browser.close();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
