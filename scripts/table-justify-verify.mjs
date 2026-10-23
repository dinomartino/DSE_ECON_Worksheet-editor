import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that the text of a table cell can be justified, in English and in 繁體中文,
 * on `test-fixtures/manual/table-justify-mix.json` (a classroom worksheet whose tables hold sentences
 * that wrap). The Table tools bar's T≡ (a real click), what it draws (the lines' right edges are
 * measured, not the style read), a swept column justified by one click and undone by one, the page
 * rail's thumbnails, a bilingual cell, a reload, the start screen's card, Setup's Justify text (which
 * must leave the tables alone), and the `.docx` the real Export dialog writes (`w:jc both` on exactly the
 * cells chosen).
 *
 *   node scripts/table-justify-verify.mjs [--out=/tmp/table-justify-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving, and stops it again. Needs Chrome
 * (playwright's `channel: 'chrome'`; set CHROME to its path on Linux). Every click and drag is a real
 * pointer event. Copy for Word and the bank's preview are proved by `cellJustify.test.tsx`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/table-justify-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/table-justify-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Table justify mix';

let devServer;
if (!(await fetch(URL_BASE).then((r) => r.ok).catch(() => false))) {
  console.log(`dev server not running at ${URL_BASE} — starting one`);
  devServer = spawn('npm', ['run', 'dev'], { stdio: 'ignore', detached: false });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) {
    console.error('dev server did not come up within 60s');
    devServer.kill();
    process.exit(1);
  }
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Everything the two interface languages say differently. */
const WORDS = {
  en: {
    bar: 'Table tools',
    left: 'Align cell text left',
    center: 'Center cell text',
    right: 'Align cell text right',
    justify: 'Justify cell text',
    cells: (n) => `${n} cells`,
    undo: /^Undo/,
    redo: /^Redo/,
    setup: 'Setup',
    justifyText: 'Justify text',
    home: /Econ Studio/,
    exportButton: /Export…/,
    bilingual: 'EN+中',
  },
  'zh-HK': {
    bar: '表格工具',
    left: '儲存格文字靠左對齊',
    center: '儲存格文字置中',
    right: '儲存格文字靠右對齊',
    justify: '儲存格文字左右對齊',
    cells: (n) => `${n} 格`,
    undo: /^復原/,
    redo: /^重做/,
    setup: '頁面設定',
    justifyText: '文字左右對齊',
    home: /Econ Studio/,
    exportButton: /匯出…/,
    bilingual: 'EN+中',
  },
};

// The policy table (the page's first): a heading row, then three terms beside their descriptions.
const POLICY = 0;
const HEADING = [0, 1];
const DESCRIPTIONS = [3, 5, 7];
const [MIN_WAGE, CEILING, SUBSIDY] = DESCRIPTIONS;

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', ...(chromePath ? { executablePath: chromePath } : {}) });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(
      ([version, language, indexJson, key, body]) => {
        // Seeds the saved paper only the first time: a reload must find what the editor saved.
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem('econ-worksheet-last-seen-version', version);
          window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
          window.localStorage.setItem('econ-worksheet-index', indexJson);
          window.localStorage.setItem(key, body);
        }
        // A save picker would wait for a person; the download it falls back to is the same file.
        delete window.showSaveFilePicker;
      },
      [
        APP_VERSION,
        ui,
        JSON.stringify([{ id: document_.id, title: TITLE, updatedAt: document_.updatedAt }]),
        `econ-worksheet:${document_.id}`,
        fixtureText,
      ],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    const openPaper = async () => {
      await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
      await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
      await page.waitForTimeout(2500);
    };
    await openPaper();
    const settle = () => page.waitForTimeout(900);

    const table = (t = POLICY) => page.locator('#print-root table[data-table-block]').nth(t);
    const cell = (i, t = POLICY) => table(t).locator('td').nth(i);
    const bar = () => page.getByRole('toolbar', { name: w.bar });
    const button = (name) => bar().getByRole('button', { name, exact: true });

    /**
     * What a cell draws: its computed alignment and, for each line of its text, how far short of the
     * cell's content edge the last visible character stops (px). A justified line stops at the edge; a
     * ragged one short of it. Measured character by character, because the space a line breaks at hangs
     * past the edge and would count. Only the first text node when `firstTextOnly` (a bilingual cell's
     * second line is a different paragraph).
     */
    const measure = (i, t = POLICY, firstTextOnly = false) =>
      page.evaluate(
        ([index, tableIndex, first]) => {
          const td = document.querySelectorAll('#print-root table[data-table-block]')[tableIndex].querySelectorAll('td')[index];
          const cs = getComputedStyle(td);
          const box = td.getBoundingClientRect();
          const scale = td.offsetWidth ? box.width / td.offsetWidth : 1;
          const edge = box.right - (parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth) / 2) * scale;
          const lines = new Map();
          const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
          let node;
          let seen = 0;
          while ((node = walker.nextNode())) {
            if (!node.textContent.trim()) continue;
            seen += 1;
            if (first && seen > 1) break;
            const range = document.createRange();
            for (let at = 0; at < node.length; at += 1) {
              if (!node.data[at].trim()) continue;
              range.setStart(node, at);
              range.setEnd(node, at + 1);
              const rect = range.getBoundingClientRect();
              if (rect.width < 0.5) continue;
              const key = Math.round(rect.top);
              lines.set(key, Math.max(lines.get(key) ?? -Infinity, rect.right));
            }
          }
          const rights = [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, right]) => right);
          return { align: cs.textAlign, short: rights.map((right) => Math.round((edge - right) * 10) / 10) };
        },
        [i, t, firstTextOnly],
      );
    /** Every line but the last reaches the edge. */
    const flush = (m) => m.short.length >= 2 && m.short.slice(0, -1).every((gap) => Math.abs(gap) <= 2);
    /** Some line but the last stops visibly short of it. */
    const ragged = (m) => m.short.length >= 2 && m.short.slice(0, -1).some((gap) => gap > 4);
    const aligns = (indices, t = POLICY) => Promise.all(indices.map((i) => measure(i, t).then((m) => m.align)));
    const describe = (m) => `${m.align} ${JSON.stringify(m.short)}`;

    /** The page rail's thumbnails (clones of the sheets): how many cells they draw justified. */
    const railJustified = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button[draggable="true"]')].reduce(
          (n, card) => n + [...card.querySelectorAll('td')].filter((td) => getComputedStyle(td).textAlign === 'justify').length,
          0,
        ),
      );

    const select = async (i, t = POLICY) => {
      await cell(i, t).scrollIntoViewIfNeeded();
      await cell(i, t).click({ position: { x: 24, y: 6 } });
      await settle();
    };
    /** The pressed state of the four "Cell text" buttons, in order. */
    const pressedStates = () =>
      Promise.all([w.left, w.center, w.right, w.justify].map((name) => button(name).getAttribute('aria-pressed')));

    // A. As saved: nothing justified, the bar offers T≡ unpressed, and the sentences are ragged.
    await select(CEILING);
    check(`[${tag}] the Table tools bar offers Justify cell text beside left, centre and right`, (await bar().count()) === 1 && (await button(w.justify).count()) === 1);
    check(`[${tag}] … as the fourth of the Cell text buttons, labelled T≡`, (await button(w.justify).textContent()) === 'T≡' && same(await pressedStates(), ['true', 'false', 'false', 'false']), JSON.stringify(await pressedStates()));
    const before = await measure(CEILING);
    check(`[${tag}] as saved, the description is flush left and ragged`, before.align === 'left' && ragged(before), describe(before));
    check(`[${tag}] … and the heading cells are centred, as set`, same(await aligns(HEADING), ['center', 'center']));
    await page.screenshot({ path: `${OUT}/${tag}-before.png` });

    // B. One cell: a real click on T≡.
    await button(w.justify).click();
    await settle();
    const after = await measure(CEILING);
    check(`[${tag}] T≡ justifies the cell: its lines reach both edges (all but the last)`, after.align === 'justify' && flush(after), describe(after));
    check(`[${tag}] … the button reads pressed, and left does not`, same(await pressedStates(), ['false', 'false', 'false', 'true']), JSON.stringify(await pressedStates()));
    check(`[${tag}] … the cells beside it stay flush left and centred`, same(await aligns([MIN_WAGE, SUBSIDY]), ['left', 'left']) && same(await aligns(HEADING), ['center', 'center']));
    check(`[${tag}] … and the page rail’s thumbnail draws it justified too`, (await railJustified()) === 1, String(await railJustified()));
    await page.screenshot({ path: `${OUT}/${tag}-one-cell.png` });

    // C. The four are one choice: left puts it back; Undo and Redo walk the same steps.
    await button(w.left).click();
    await settle();
    const back = await measure(CEILING);
    check(`[${tag}] T⇤ puts the cell back flush left (ragged again)`, back.align === 'left' && ragged(back), describe(back));
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] Undo brings the justification back`, (await measure(CEILING)).align === 'justify');
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] … and Undo again takes it away`, (await measure(CEILING)).align === 'left');
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] Redo puts it back`, (await measure(CEILING)).align === 'justify');
    await button(w.left).click();
    await settle();

    // D. A swept column: three cells, one click, one Undo.
    const box = async (i) => cell(i).boundingBox();
    const from = await box(MIN_WAGE);
    const to = await box(SUBSIDY);
    await page.mouse.move(from.x + from.width - 10, from.y + from.height - 5);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width - 10, to.y + to.height - 5, { steps: 12 });
    await page.mouse.up();
    await settle();
    check(`[${tag}] dragging down the column sweeps its three cells (the bar says ${w.cells(3)})`, ((await bar().textContent()) ?? '').includes(w.cells(3)), ((await bar().textContent()) ?? '').slice(0, 60));
    await button(w.justify).click();
    await settle();
    const swept = await Promise.all(DESCRIPTIONS.map((i) => measure(i)));
    check(`[${tag}] one click on T≡ justifies all three descriptions`, swept.every((m) => m.align === 'justify' && flush(m)), swept.map(describe).join(' | '));
    check(`[${tag}] … T≡ reads pressed for the whole range`, same(await pressedStates(), ['false', 'false', 'false', 'true']), JSON.stringify(await pressedStates()));
    check(`[${tag}] … the terms in the first column are untouched`, same(await aligns([2, 4, 6]), ['left', 'left', 'left']));
    check(`[${tag}] … and the page rail draws all three`, (await railJustified()) === 3, String(await railJustified()));
    await page.screenshot({ path: `${OUT}/${tag}-column.png` });
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] one Undo takes all three back to flush left`, same(await aligns(DESCRIPTIONS), ['left', 'left', 'left']));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] … and one Redo justifies them again`, same(await aligns(DESCRIPTIONS), ['justify', 'justify', 'justify']));

    // E. One line of text looks as it did: a number cell justified draws where it was (flush left).
    await select(1, 1); // Q2's table of numbers: the "Price ($)" heading cell
    const priceBefore = await page.evaluate(() => document.querySelectorAll('#print-root table[data-table-block]')[1].querySelectorAll('td')[1].getBoundingClientRect().left);
    const priceTextBefore = await page.evaluate(() => {
      const td = document.querySelectorAll('#print-root table[data-table-block]')[1].querySelectorAll('td')[1];
      const range = document.createRange();
      range.selectNodeContents(td);
      return Math.round(range.getBoundingClientRect().left * 10) / 10;
    });
    await button(w.justify).click();
    await settle();
    const priceTextAfter = await page.evaluate(() => {
      const td = document.querySelectorAll('#print-root table[data-table-block]')[1].querySelectorAll('td')[1];
      const range = document.createRange();
      range.selectNodeContents(td);
      return Math.round(range.getBoundingClientRect().left * 10) / 10;
    });
    check(`[${tag}] a one-line cell (“Price ($)”) justified draws exactly where it did`, priceTextBefore === priceTextAfter && priceBefore > 0, `${priceTextBefore} -> ${priceTextAfter}`);
    await button(w.left).click();
    await settle();

    // F. A cell that spans two columns, and the MC's table.
    await select(0, 2);
    await button(w.justify).click();
    await settle();
    const spanning = await measure(0, 2);
    check(`[${tag}] a cell spanning two columns justifies too`, spanning.align === 'justify' && flush(spanning), describe(spanning));
    await select(0, 3);
    await button(w.justify).click();
    await settle();
    const mcq = await measure(0, 3);
    check(`[${tag}] … and so does a cell in an MC question’s table`, mcq.align === 'justify' && flush(mcq), describe(mcq));
    await page.screenshot({ path: `${OUT}/${tag}-tables.png` });

    // G. Bilingual: the English line before the line break is not stretched, as in Word with the
    // setting the file carries; the 中文 line sits under it.
    if (ui === 'en') {
      await page.getByRole('radio', { name: w.bilingual, exact: true }).first().click();
      await settle();
      await page.waitForTimeout(1200);
      const english = await measure(CEILING, POLICY, true);
      check(`[${tag}] in EN+中 the justified cell’s English sentence still fills its lines but ends ragged before the line break`, english.align === 'justify' && english.short.length >= 2 && english.short.slice(0, -1).every((gap) => Math.abs(gap) <= 2) && english.short.at(-1) > 4, describe(english));
      await page.screenshot({ path: `${OUT}/${tag}-bilingual.png` });
      await page.getByRole('radio', { name: 'EN', exact: true }).first().click();
      await settle();
    }

    // H. Justify text (Setup) leaves the tables as they are: the stems justify, the cells chosen stay,
    // and every other cell stays flush left or centred.
    await page.getByRole('button', { name: w.setup }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    await dialog.getByLabel(w.justifyText, { exact: true }).check();
    await settle();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
    await settle();
    const stem = await page.evaluate(() => getComputedStyle(document.querySelector('#print-root [data-page-target]')?.closest('p') ?? document.querySelector('#print-root p')).textAlign);
    const terms = await aligns([2, 4, 6]);
    const lower = await aligns([MIN_WAGE, CEILING]);
    const numbers = await aligns([4, 5, 7, 8], 1);
    check(`[${tag}] with Justify text on, the question text justifies…`, (await page.evaluate(() => [...document.querySelectorAll('#print-root p')].some((p) => getComputedStyle(p).textAlign === 'justify'))) || stem === 'justify', stem);
    check(`[${tag}] … while the tables stay as they are (terms left, headings centred, numbers right)`, same(terms, ['left', 'left', 'left']) && same(await aligns(HEADING), ['center', 'center']) && same(numbers, ['right', 'right', 'right', 'right']), JSON.stringify({ terms, numbers }));
    check(`[${tag}] … and the cells justified by hand stay justified`, same(lower, ['justify', 'justify']), JSON.stringify(lower));
    await page.screenshot({ path: `${OUT}/${tag}-justify-text.png` });
    await page.getByRole('button', { name: w.setup }).first().click();
    await dialog.waitFor();
    await dialog.getByLabel(w.justifyText, { exact: true }).uncheck();
    await settle();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

    // I. The .docx the real Export dialog writes: w:jc both on exactly the cells chosen (English).
    if (ui === 'en') {
      await page.getByRole('button', { name: w.exportButton }).first().click();
      const exporter = page.getByRole('dialog');
      await exporter.getByText('.docx', { exact: true }).click();
      await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
      ]);
      const zip = await JSZip.loadAsync(readFileSync(await download.path()));
      const xml = await zip.file('word/document.xml').async('string');
      const jcs = [...xml.matchAll(/<w:tc>(?:(?!<\/w:tc>)[\s\S])*<\/w:tc>/g)].map((m) => m[0].match(/<w:jc w:val="(\w+)"\/>/)?.[1]);
      // Q1: 8 cells (two headings, three terms, three descriptions), Q2: 9 numbers then 4 (one spanned),
      // the MC: 2. Justified: the three descriptions, the spanning cell and the MC's first cell (the
      // others of those tables were never touched; the MC's second cell was not either).
      const both = jcs.map((jc, i) => (jc === 'both' ? i : -1)).filter((i) => i >= 0);
      check(`[${tag}] the .docx has w:jc both on the three descriptions, the spanning cell and the MC’s cell, and nowhere else`, both.length === 5 && same(both.slice(0, 3), [3, 5, 7]), JSON.stringify({ jcs, both }));
      check(`[${tag}] … the headings stay centred and the numbers right`, jcs[0] === 'center' && jcs[1] === 'center' && jcs.filter((jc) => jc === 'right').length === 4, JSON.stringify(jcs));
      check(`[${tag}] … no w:jc says "justify" (it is not a value)`, !xml.includes('w:val="justify"'));
      const settings = await zip.file('word/settings.xml').async('string');
      check(`[${tag}] … and the file keeps a line before a break ragged, as the page does`, settings.includes('doNotExpandShiftReturn'));
      await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
    }

    // J. Saved with the paper: a reload finds the same cells justified.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper();
    check(`[${tag}] after a reload the descriptions are still justified`, same(await aligns(DESCRIPTIONS), ['justify', 'justify', 'justify']));
    check(`[${tag}] … and the cells never touched are still as they were`, same(await aligns([2, 4, 6]), ['left', 'left', 'left']) && same(await aligns(HEADING), ['center', 'center']));
    check(`[${tag}] … and the page rail still draws them`, (await railJustified()) >= 3, String(await railJustified()));

    // K. The start screen's card (Copy for Word's HTML) shows the justified cells.
    await page.getByRole('link', { name: w.home }).or(page.getByRole('button', { name: w.home })).first().click();
    await page.waitForTimeout(2500);
    const card = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.shadowRoot && el.shadowRoot.querySelector('.page')) return el.shadowRoot.innerHTML;
      }
      return '';
    });
    check(`[${tag}] the document’s card on the start screen draws text-align:justify in its table cells`, (card.match(/text-align:\s*justify/g) ?? []).length >= 3, String((card.match(/text-align:\s*justify/g) ?? []).length));
    await page.screenshot({ path: `${OUT}/${tag}-card.png` });

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
