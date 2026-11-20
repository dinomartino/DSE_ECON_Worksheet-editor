import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { convertToPdf, ensureLoProfile } from './soffice.mjs';

/**
 * Prove in a real browser that the answer key follows Document setup → Line spacing (k-0483;
 * k-0468 gave the paper its own, GitHub issue #7 point 4), in English, in 繁體中文 and in both,
 * on `test-fixtures/manual/key-line-spacing-mix.json` (six MC with notes and a fraction, the
 * marking-scheme question, a DRQ with group headings, the EC table and a content max):
 *
 *  - at Single the Marking scheme view draws the 12pt box everywhere, as it always did;
 *  - Setup → Worksheet → Line spacing 1.5 (the real dialog) puts every line of the key on an 18pt
 *    box: question numbers, part labels, answers, marking points, explanations, headings (the
 *    heading's own 14pt box times 1.5); the title and every table cell keep their size; the key
 *    runs to more sheets; one ⌘Z takes it back;
 *  - Chrome's print of the key has as many pages as the view has sheets, and two consecutive
 *    marking points sit 18pt apart on them (12pt at Single);
 *  - the key `.docx` the real Export dialog writes states the same 18pt lines, and LibreOffice
 *    prints it on as many pages as the view has sheets, the points 18pt apart;
 *  - in the HKEAA key a Marks-column "(1)" stays on its line's baseline in that Word file.
 *
 *   node scripts/key-line-spacing-verify.mjs [--out=/tmp/key-line-spacing-verify] [--port=3483]
 *        [--url=http://localhost:3483] [--only=<tag substring>]
 *
 * Starts `next dev` itself when the URL is not serving. Needs Chrome, LibreOffice and poppler
 * (pdfinfo, pdftotext, pdftoppm). The IR, page and `.docx` rules are
 * `src/render/answerKeyLineSpacing.test.tsx`; the paper's own, `scripts/line-spacing-verify.mjs`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/key-line-spacing-verify');
const PORT = opt('port', '3483');
const URL_BASE = opt('url', `http://localhost:${PORT}`);
const ONLY = opt('only', '');
mkdirSync(OUT, { recursive: true });

const fixture = JSON.parse(readFileSync(new URL('../test-fixtures/manual/key-line-spacing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const TITLE = 'Key line spacing mix';

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

// --- the dev server --------------------------------------------------------------------

const serving = () => fetch(URL_BASE).then((r) => r.ok).catch(() => false);
let devServer;
const stopServer = () => {
  if (devServer?.pid) {
    try {
      process.kill(-devServer.pid, 'SIGTERM');
    } catch {
      devServer.kill();
    }
  }
};
if (!(await serving())) {
  console.log(`dev server not running at ${URL_BASE} — starting one`);
  // Its own process group, so the whole tree (npx → next) goes when this script does.
  devServer = spawn('npx', ['next', 'dev', '-p', PORT], { stdio: 'ignore', detached: true });
  const deadline = Date.now() + 120_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await serving();
    if (!up) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) {
    console.error('dev server did not come up within 120s');
    stopServer();
    process.exit(1);
  }
}

// --- words the app uses ----------------------------------------------------------------

const WORDS = {
  en: {
    setup: /^Setup/, tab: /^Worksheet/, field: 'Line spacing', single: 'Single', markingScheme: 'Marking scheme',
    exportButton: /Export…/, what: 'What to export', key: 'Answer key', language: 'Language', exportDocx: /^Export \.docx/,
    langTitle: { en: 'English only', zh: '中文 only', bilingual: 'Bilingual' },
  },
  'zh-HK': {
    setup: /^頁面設定/, tab: /^工作紙/, field: '行距', single: '單倍', markingScheme: '評卷參考',
    exportButton: /匯出…/, what: '匯出內容', key: '評卷參考', language: '語言', exportDocx: /^匯出 \.docx/,
    langTitle: { en: '只顯示英文', zh: '只顯示中文', bilingual: '中英對照' },
  },
};

/** What the key prints, by paper language: two consecutive points, a heading, a number, a fraction row. */
const TEXT = {
  en: {
    note: 'Higher income raises demand', point1: 'At the original price there is a shortage', point2: 'The equilibrium price rises',
    question: /^Question 7\b/, heading: 'Section A', lead: 'Supply decreases',
    // The MC explanation holds a stacked fraction; the line under it is the first reason.
    fraction: 'Higher income raises demand for a normal good. Elasticity is', after: 'A. A is wrong: a fall in price moves along the curve.',
  },
  zh: {
    note: '收入上升令正常貨品', point1: '在原來價格下出現短缺', point2: '均衡價格上升',
    question: /^第7題/, heading: '甲部', lead: '供應減少',
  },
  bilingual: { note: 'Higher income raises demand', question: /^Question 7\b/, heading: 'Section A', lead: 'Supply decreases' },
};

/**
 * What each key style prints: `grows` whether spacing must add a sheet (HKEAA already runs to three at
 * Single), `pitch` the distance between two consecutive points (a table row is its 12pt line and 6pt of
 * cell padding, so the Detailed table's is 18pt at Single too: that it stays 18 is the proof that tables
 * keep their rows), `tables` how many tables to leave alone, `named` are the lines measured by name (a style that draws them in a
 * table, as Detailed does, has none outside one), `minSpaced` how many paragraphs its `.docx` states
 * spaced (Detailed has three outside its tables), `fraction` whether its notes hold the fraction row.
 */
const SCENARIOS = [
  { tag: 'en-classic', ui: 'en', paper: 'en', preset: 'classic', grows: true, viaUi: true, word: true, named: ['question', 'point', 'answer', 'note'], fraction: true },
  { tag: 'zh-classic', ui: 'zh-HK', paper: 'zh', preset: 'classic', grows: true, viaUi: true, word: true, named: ['question', 'point', 'answer', 'note'] },
  { tag: 'both-classic', ui: 'en', paper: 'bilingual', preset: 'classic', viaUi: false, word: false, named: ['question', 'point', 'answer', 'note'] },
  { tag: 'en-hkeaa', ui: 'en', paper: 'en', preset: 'hkeaa', viaUi: true, word: true, marks: true, named: ['question', 'point', 'answer'] },
  { tag: 'zh-hkeaa', ui: 'zh-HK', paper: 'zh', preset: 'hkeaa', viaUi: false, word: true, marks: true, named: ['question', 'point', 'answer'] },
  { tag: 'en-detailed', ui: 'en', paper: 'en', preset: 'detailed', viaUi: true, word: true, named: [], minSpaced: 2, pitch: { single: 18, spaced: 18 } },
  { tag: 'en-suggested', ui: 'en', paper: 'en', preset: 'suggested', viaUi: true, word: true, named: ['question', 'answer', 'note', 'bullet'], fraction: true, fractionAfter: 'A public good is non-rival and non-excludable.', tables: 1 },
].filter((scenario) => scenario.tag.includes(ONLY));

// --- poppler -----------------------------------------------------------------------------

const pdfPages = (pdf) => Number(/Pages:\s+(\d+)/.exec(spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout)?.[1]);

/** Every word of a PDF with its page and box (points), in reading order. */
function pdfWords(pdf) {
  const xml = spawnSync('pdftotext', ['-bbox', pdf, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
  const words = [];
  let page = 0;
  for (const m of xml.matchAll(/<page [^>]*>|<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)) {
    if (m[0].startsWith('<page')) page += 1;
    else words.push({ page, x: +m[1], y: +m[2], yMax: +m[4], text: m[5] });
  }
  return words;
}

/** The first word of `needle` (whitespace-free match across consecutive words) and its row's y. */
function findLineY(words, needle) {
  const squash = (text) => text.replace(/\s+/g, '');
  const target = squash(needle);
  for (let i = 0; i < words.length; i += 1) {
    let joined = '';
    for (let j = i; j < words.length && j < i + 24 && words[j].page === words[i].page; j += 1) {
      joined += squash(words[j].text);
      if (joined === target) return { page: words[i].page, y: words[i].y, at: i };
      if (!target.startsWith(joined)) break;
    }
  }
  return undefined;
}

const near = (a, b, tolerance) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;

// --- the browser ------------------------------------------------------------------------

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });
const profile = ensureLoProfile();

try {
  for (const scenario of SCENARIOS) {
    const { tag, ui, paper, preset } = scenario;
    const w = WORDS[ui];
    const text = TEXT[paper];
    console.log(`\n— ${tag}  (interface ${ui}, paper ${paper}, key style ${preset})`);

    const doc = { ...fixture, answerKeyLayout: { preset } };
    const KEY = `econ-worksheet:${doc.id}`;
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true, deviceScaleFactor: 1 });
    await context.addInitScript(
      ([version, language, paperLanguage, index, key, body]) => {
        if (!localStorage.getItem(key)) {
          localStorage.setItem('econ-worksheet-last-seen-version', version);
          localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: paperLanguage }));
          localStorage.setItem('econ-worksheet-index', index);
          localStorage.setItem(key, body);
        }
        delete window.showSaveFilePicker;
      },
      [APP_VERSION, ui, paper, JSON.stringify([{ id: doc.id, title: TITLE, updatedAt: doc.updatedAt }]), KEY, JSON.stringify(scenario.viaUi ? doc : { ...doc, lineSpacing: 1.5 })],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const settle = (ms = 1400) => page.waitForTimeout(ms);

    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
    await settle(1500);
    await page.getByRole('radio', { name: w.markingScheme, exact: true }).first().click();
    await page.waitForSelector('#print-root[data-answer-key] .paper', { timeout: 30_000 });
    await settle(2500);

    /** The line boxes the key view draws, in pt, by what they are. */
    const metrics = () =>
      page.evaluate(
        ([questionSource, headingText, noteText, leadText]) => {
          const root = document.querySelector('#print-root[data-answer-key]');
          const pt = (el) => (el ? Math.round(((parseFloat(getComputedStyle(el).lineHeight) * 3) / 4) * 100) / 100 : null);
          const target = (prefix) => root.querySelector(`[data-page-target^="${prefix}"]`);
          const paragraph = (test) => [...root.querySelectorAll('p')].find((p) => !p.closest('table') && test(p.textContent.trim()));
          /** A hung or bulleted row: a flex row whose cells are spans (not a layout container). */
          const rowWith = (words) =>
            [...root.querySelectorAll('div.flex')].find((row) => row.querySelector(':scope > span.min-w-0') && row.textContent.includes(words));
          const question = new RegExp(questionSource);
          // Every box a table cell's text sits in: the tables keep theirs.
          const inTables = new Set();
          for (const cell of root.querySelectorAll('table td')) {
            const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
              if ((node.textContent ?? '').trim()) inTables.add(pt(node.parentElement));
            }
          }
          // Every paragraph and row outside the tables, bar the key's own title lines and the page's
          // header and footer: the whole of what Line spacing is meant to move.
          const outside = new Set();
          for (const block of root.querySelectorAll('p, div.flex')) {
            if (block.closest('table, [data-band-box]')) continue;
            if (block.closest('[data-page-target^="answerKeyTitle"], [data-page-target^="answerKeySubtitle"]')) continue;
            if (block.matches('div.flex') && !block.querySelector(':scope > span.min-w-0')) continue;
            if (!(block.textContent ?? '').replace(/\u200b/g, '').trim()) continue;
            outside.add(pt(block));
          }
          return {
            sheets: root.querySelectorAll('.paper').length,
            title: pt(target('answerKeyTitle')),
            question: pt(paragraph((t) => question.test(t))),
            point: pt(target('schemePoint:')),
            answer: pt(target('partAnswer:')),
            heading: pt(paragraph((t) => t.startsWith(headingText))),
            note: pt(rowWith(noteText)),
            bullet: pt(rowWith(leadText)),
            outside: [...outside].sort((x, y) => x - y),
            tables: [...inTables].sort((x, y) => x - y),
            ec: root.querySelectorAll('table').length,
          };
        },
        [text.question.source, text.heading, text.note, text.lead],
      );

    const sheetShot = (index, file) =>
      page.locator('#print-root[data-answer-key] .paper').nth(index).screenshot({ path: `${OUT}/${tag}-${file}.png` });

    /** The fraction row grows its line: the row under it sits further down than one line's pitch (k-0479). */
    const fractionGrows = (words, pitch, where) => {
      if (!scenario.fraction) return;
      const row = findLineY(words, text.fraction);
      const next = findLineY(words, scenario.fractionAfter ?? text.after);
      check(`[${tag}] … the explanation row holding a fraction grows its line ${where} (${row && next ? (next.y - row.y).toFixed(1) : '?'}pt to the next, one line is ${pitch})`, Boolean(row && next && row.page === next.page && next.y - row.y > pitch + 4), JSON.stringify({ row, next }));
    };

    /** Chrome's print of the key view: checked for its page count and a point pitch, saved as PNGs. */
    const printKey = async (name, sheets, pitch) => {
      await page.emulateMedia({ media: 'print' });
      const printed = join(OUT, `${tag}-${name}.pdf`);
      writeFileSync(printed, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
      await page.emulateMedia({ media: null });
      check(`[${tag}] Chrome prints the key (${name}) on its ${sheets} sheets`, pdfPages(printed) === sheets, `${pdfPages(printed)} pages`);
      if (text.point1) {
        const words = pdfWords(printed);
        const one = findLineY(words, text.point1);
        const two = findLineY(words, text.point2);
        check(`[${tag}] … two consecutive marking points are ${pitch}pt apart on paper`, Boolean(one && two && one.page === two.page && near(two.y - one.y, pitch, 0.6)), JSON.stringify({ one, two }));
        fractionGrows(words, pitch, 'on paper');
      }
      spawnSync('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '3', printed, join(OUT, `${tag}-${name}`)]);
    };

    /** The key .docx the real Export dialog writes, printed by LibreOffice: pages, pitch, Marks label. */
    const exportKey = async (name, sheets, pitch, line) => {
      await page.getByRole('button', { name: w.exportButton }).first().click();
      const exporter = page.getByRole('dialog');
      await exporter.getByText('.docx', { exact: true }).click();
      await exporter.getByRole('radiogroup', { name: w.what }).getByText(w.key, { exact: true }).click();
      await exporter.getByRole('radiogroup', { name: w.language }).getByTitle(w.langTitle[paper], { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        exporter.getByRole('button', { name: w.exportDocx }).click(),
      ]);
      const docxPath = join(OUT, `${tag}-${name}.docx`);
      writeFileSync(docxPath, readFileSync(await download.path()));
      await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
      const xml = await (await JSZip.loadAsync(readFileSync(docxPath))).file('word/document.xml').async('string');
      const spacedParagraphs = (xml.match(/<w:spacing w:line="360" w:lineRule="(exact|atLeast)"\/>/g) ?? []).length;
      if (line === 'single') check(`[${tag}] the key .docx (${name}) states no spaced line`, spacedParagraphs === 0, String(spacedParagraphs));
      else check(`[${tag}] the key .docx (${name}) states 18pt lines (${spacedParagraphs} paragraphs)`, spacedParagraphs >= (scenario.minSpaced ?? 20), String(spacedParagraphs));
      // A sheet that starts inside a table is Word's to break between its rows (`keyBodyXml`), so the
      // hard breaks are at most one fewer than the sheets; LibreOffice's page count below is the proof.
      const breaks = (xml.match(/w:br w:type="page"/g) ?? []).length;
      check(`[${tag}] … with no more hard page breaks than the view has sheet starts (${breaks} of ${sheets - 1})`, breaks <= sheets - 1, String(breaks));

      convertToPdf(docxPath, OUT, profile);
      const pdf = join(OUT, `${tag}-${name}.pdf`);
      check(`[${tag}] LibreOffice prints it (${name}) on the view's ${sheets} sheets (nothing overflows)`, pdfPages(pdf) === sheets, `${pdfPages(pdf)} pages`);
      const words = pdfWords(pdf);
      const one = findLineY(words, text.point1);
      const two = findLineY(words, text.point2);
      check(`[${tag}] … two consecutive marking points ${pitch}pt apart in Word's layout`, Boolean(one && two && one.page === two.page && near(two.y - one.y, pitch, 0.6)), JSON.stringify({ one, two }));
      fractionGrows(words, pitch, "in Word's layout");
      if (scenario.marks) {
        // HKEAA: the "(1)" in the Marks column rides on the baseline of its paragraph's first line.
        const lead = findLineY(words, text.lead);
        const label = lead && words.filter((word) => word.page === lead.page && /^[(（]\d/.test(word.text) && Math.abs(word.y - lead.y) < 12).sort((a, b) => Math.abs(a.y - lead.y) - Math.abs(b.y - lead.y))[0];
        check(`[${tag}] … the Marks-column label sits on its line's baseline (Δ ${label ? (label.y - lead.y).toFixed(2) : '?'}pt)`, Boolean(label && near(label.y, lead.y, 0.8)), JSON.stringify({ lead, label }));
      }
      spawnSync('pdftoppm', ['-png', '-r', '80', '-f', '1', '-l', '3', pdf, join(OUT, `${tag}-${name}`)]);
    };

    const pitches = scenario.pitch ?? { single: 12, spaced: 18 };

    /** Whether every measured box is one of `allowed` (to 0.06pt). */
    const onlyBoxes = (boxes, allowed) => boxes.length > 0 && boxes.every((box) => allowed.some((value) => near(box, value, 0.06)));
    const named = (m, value) => scenario.named.every((name) => m[name] === value);

    let single;
    let spaced;
    if (scenario.viaUi) {
      single = await metrics();
      check(`[${tag}] at Single every line outside the tables is the 12pt box (headings 15.25pt)`, onlyBoxes(single.outside, [12, 15.25]) && named(single, 12), JSON.stringify(single));
      check(`[${tag}] … ${single.ec} table(s) to leave alone (the MC grid, EC and level tables)`, single.ec >= (scenario.tables ?? 3), String(single.ec));
      await sheetShot(0, 'single-1');
      await sheetShot(1, 'single-2');
      // What a key looked like before (and what develop still draws at 1.5): Single, on paper and in Word.
      if (text.point1) await printKey('single-print', single.sheets, pitches.single);
      if (scenario.word) await exportKey('single-word', single.sheets, pitches.single, 'single');

      await page.getByRole('button', { name: w.setup }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByRole('tab', { name: w.tab }).click();
      const group = dialog.getByRole('radiogroup', { name: w.field });
      await group.scrollIntoViewIfNeeded();
      await group.getByRole('radio', { name: '1.5', exact: true }).click();
      await settle();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await settle(2500);
    }
    spaced = await metrics();
    check(`[${tag}] at 1.5 every line outside the tables is an 18pt box (headings 22.9pt)`, onlyBoxes(spaced.outside, [18, 22.9]) && named(spaced, 18), JSON.stringify(spaced));
    check(`[${tag}] … the section heading is its own 14pt box times 1.5 (22.9pt)`, near(spaced.heading, 22.9, 0.06), String(spaced.heading));
    check(`[${tag}] … the title keeps its box${single ? ` (${single.title}pt)` : ''}`, single ? spaced.title === single.title : typeof spaced.title === 'number' && spaced.title > 12 && spaced.title < 30, `${single?.title} → ${spaced.title}`);
    check(
      `[${tag}] … every table keeps the box it had at Single`,
      single ? JSON.stringify(spaced.tables) === JSON.stringify(single.tables) : spaced.tables.length > 0 && spaced.tables.every((box) => box < 13),
      `${JSON.stringify(single?.tables)} → ${JSON.stringify(spaced.tables)}`,
    );
    if (single) {
      // A key of lines runs to more sheets; one drawn mostly as tables (Detailed) or short (Suggested) may not, but never fewer.
      const more = scenario.grows ? spaced.sheets > single.sheets : spaced.sheets >= single.sheets;
      check(`[${tag}] … and the key runs to ${scenario.grows ? 'more' : 'no fewer'} sheets (${single.sheets} → ${spaced.sheets})`, more, `${single.sheets} → ${spaced.sheets}`);
    }
    check(`[${tag}] the stored document says 1.5`, (await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).lineSpacing, KEY)) === 1.5);
    await sheetShot(0, 'spaced-1');
    await sheetShot(1, 'spaced-2');
    if (spaced.sheets > 2) await sheetShot(2, 'spaced-3');
    // The app itself, as a teacher sees it: the window on the Marking scheme view at 1.5.
    await page.locator('#print-root[data-answer-key] .paper').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${tag}-window-spaced.png` });

    if (scenario.viaUi) {
      // One undo step back to Single, and again forward.
      await page.mouse.click(5, 600);
      await page.keyboard.press('ControlOrMeta+z');
      await settle(2000);
      const undone = await metrics();
      check(`[${tag}] one ⌘Z takes the key back to Single`, onlyBoxes(undone.outside, [12, 15.25]) && undone.sheets === single.sheets, JSON.stringify(undone));
      await page.keyboard.press('ControlOrMeta+Shift+z');
      await settle(2000);
      check(`[${tag}] … and ⇧⌘Z spaces it again`, onlyBoxes((await metrics()).outside, [18, 22.9]));
    }

    // Chrome's print of the key: the pages the view has, the points 18pt apart. Then Word's.
    if (text.point1) await printKey('spaced-print', spaced.sheets, pitches.spaced);
    if (scenario.word) await exportKey('spaced-word', spaced.sheets, pitches.spaced, 'spaced');

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  stopServer();
}
console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) failed; shots in ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
