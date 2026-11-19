import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { convertToPdf, ensureLoProfile } from './soffice.mjs';

/**
 * Prove in a real browser that Document setup → Line spacing (k-0468, GitHub issue #7 point 4:
 * "行距是否可以調整？") works, in English and in 繁體中文, on `test-fixtures/manual/question-gap-mix.json`
 * (ten MC, then three structured questions) given a model answer and a marking scheme:
 *
 *  - the control offers Single / 1.15 / 1.5 / Double, Single chosen on an untouched paper;
 *  - 1.5 puts every line of the questions, options, answers and marking points on an 18pt box,
 *    while the title keeps its box; the paper runs to more sheets;
 *  - one ⌘Z takes it back to Single; it is saved (a reload keeps it);
 *  - the `.docx` the real Export dialog writes states the same 18pt exact lines (w:line 360),
 *    breaks where the page breaks, and LibreOffice prints it on exactly as many pages (no
 *    sheet overflows), its PDF pages saved as PNGs beside the screenshots.
 *
 *   node scripts/line-spacing-verify.mjs [--out=/tmp/line-spacing-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome, and LibreOffice +
 * pdfinfo/pdftoppm for the Word leg. The IR, .docx and clipboard rules are
 * `src/render/lineSpacing.test.ts`; old files, `src/model/backwardCompat.test.ts`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/line-spacing-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const doc = JSON.parse(readFileSync(new URL('../test-fixtures/manual/question-gap-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const rt = (text) => [{ text }];
const part = doc.questions[10].parts[0];
part.answer = { en: rt('The price is held below the equilibrium price.\nQuantity demanded exceeds quantity supplied.'), zh: [] };
part.scheme = {
  routes: [
    {
      id: 'ls-route',
      groups: [
        {
          id: 'ls-group',
          points: [
            { id: 'ls-p1', text: { en: rt('Price set below the equilibrium price'), zh: [] }, marks: 1 },
            { id: 'ls-p2', text: { en: rt('Shortage, shown by the long waiting lists'), zh: [] }, marks: 1 },
          ],
        },
      ],
    },
  ],
};
const TITLE = 'Question gap mix';
const KEY = `econ-worksheet:${doc.id}`;
const seeded = JSON.stringify(doc);

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

const WORDS = {
  en: { setup: /^Setup/, tab: /^Worksheet/, field: 'Line spacing', options: ['Single', '1.15', '1.5', 'Double'], teacher: 'Teacher', exportButton: /Export…/ },
  'zh-HK': { setup: /^頁面設定/, tab: /^工作紙/, field: '行距', options: ['單倍', '1.15', '1.5', '雙倍'], teacher: '教師版', exportButton: /匯出…/ },
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(
      ([version, language, index, key, body]) => {
        if (!localStorage.getItem(key)) {
          localStorage.setItem('econ-worksheet-last-seen-version', version);
          localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
          localStorage.setItem('econ-worksheet-index', index);
          localStorage.setItem(key, body);
        }
        delete window.showSaveFilePicker;
      },
      [APP_VERSION, ui, JSON.stringify([{ id: doc.id, title: TITLE, updatedAt: doc.updatedAt }]), KEY, seeded],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const open = async () => {
      await page.goto(URL_BASE, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
      await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
      await page.waitForTimeout(1500);
    };
    await open();
    await page.getByRole('radio', { name: new RegExp(`^${w.teacher}`) }).first().click();
    await page.waitForTimeout(800);
    const settle = (ms = 900) => page.waitForTimeout(ms);

    /** Line boxes the page draws, in pt, by what they are. */
    const metrics = () =>
      page.evaluate(() => {
        const pt = (el) => (el ? Math.round((parseFloat(getComputedStyle(el).lineHeight) * 3) / 4 * 100) / 100 : null);
        const root = document.querySelector('#print-root');
        const first = (selector) => root.querySelector(selector);
        const target = (prefix) => root.querySelector(`[data-page-target^="${prefix}"]`);
        return {
          sheets: root.querySelectorAll('.paper').length,
          stem: pt(target('blockText:')),
          option: pt(target('mcqOption:')),
          answer: pt(target('partAnswer:')),
          point: pt(target('schemePoint:')),
          title: pt(first('.paper-line-16')),
        };
      });
    const openSetup = async () => {
      await page.getByRole('button', { name: w.setup }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByRole('tab', { name: w.tab }).click();
      return dialog;
    };
    const group = (dialog) => dialog.getByRole('radiogroup', { name: w.field });
    const chosen = async (dialog) => (await group(dialog).getByRole('radio', { checked: true }).textContent())?.trim();

    const single = await metrics();
    let dialog = await openSetup();
    const offered = (await group(dialog).getByRole('radio').allTextContents()).map((text) => text.trim());
    check(`[${tag}] Line spacing offers ${w.options.join(' / ')}`, JSON.stringify(offered) === JSON.stringify(w.options), JSON.stringify(offered));
    check(`[${tag}] an untouched paper is on ${w.options[0]}`, (await chosen(dialog)) === w.options[0], await chosen(dialog));
    check(`[${tag}] single lines are the 12pt box`, single.stem === 12 && single.option === 12 && single.answer === 12 && single.point === 12, JSON.stringify(single));
    await group(dialog).scrollIntoViewIfNeeded();
    await group(dialog).getByRole('radio', { name: '1.5', exact: true }).click();
    await settle();
    await group(dialog).locator('xpath=ancestor::*[.//p][1]').screenshot({ path: `${OUT}/${tag}-setup-line-spacing.png` }).catch(async () => {
      await dialog.screenshot({ path: `${OUT}/${tag}-setup-line-spacing.png` });
    });
    await dialog.screenshot({ path: `${OUT}/${tag}-setup-dialog.png` });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await settle(1500);

    const spaced = await metrics();
    check(`[${tag}] 1.5: questions, options, answers and marking points are on 18pt lines`, spaced.stem === 18 && spaced.option === 18 && spaced.answer === 18 && spaced.point === 18, JSON.stringify(spaced));
    check(`[${tag}] … the title keeps its own box`, spaced.title === single.title, `${single.title} → ${spaced.title}`);
    check(`[${tag}] … and the paper runs to more sheets (${single.sheets} → ${spaced.sheets})`, spaced.sheets > single.sheets);
    check(`[${tag}] the stored document says 1.5`, (await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).lineSpacing, KEY)) === 1.5);
    await page.screenshot({ path: `${OUT}/${tag}-page-1.5.png` });

    // One undo step back to Single, and again forward.
    await page.mouse.click(5, 600);
    await page.keyboard.press('ControlOrMeta+z');
    await settle(1500);
    const undone = await metrics();
    check(`[${tag}] one ⌘Z takes it back to Single`, undone.stem === 12 && undone.sheets === single.sheets, JSON.stringify(undone));
    await page.keyboard.press('ControlOrMeta+Shift+z');
    await settle(1500);
    check(`[${tag}] … and ⇧⌘Z puts it back`, (await metrics()).stem === 18);

    // Saved: a reload opens it spaced, and Setup shows the choice.
    await settle(1500);
    await open();
    await page.getByRole('radio', { name: new RegExp(`^${w.teacher}`) }).first().click();
    await settle();
    check(`[${tag}] a reload keeps it`, (await metrics()).stem === 18);
    dialog = await openSetup();
    check(`[${tag}] … and Setup shows 1.5 chosen`, (await chosen(dialog)) === '1.5', await chosen(dialog));
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await settle();

    // The .docx the real Export dialog writes, and LibreOffice's print of it.
    if (ui === 'en') {
      const { sheets } = await metrics();
      await page.getByRole('button', { name: w.exportButton }).first().click();
      const exporter = page.getByRole('dialog');
      await exporter.getByText('.docx', { exact: true }).click();
      await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
      ]);
      const buffer = readFileSync(await download.path());
      const docxPath = join(OUT, 'line-spacing-1.5.docx');
      writeFileSync(docxPath, buffer);
      const xml = await (await JSZip.loadAsync(buffer)).file('word/document.xml').async('string');
      const spacedLines = (xml.match(/w:line="360" w:lineRule="exact"/g) ?? []).length;
      check(`[${tag}] the .docx states 18pt exact lines (${spacedLines} paragraphs)`, spacedLines > 20, String(spacedLines));
      const breaks = (xml.match(/w:br w:type="page"/g) ?? []).length;
      check(`[${tag}] … and breaks where the page does (${sheets - 1} page breaks)`, breaks === sheets - 1, String(breaks));
      await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
      const profile = ensureLoProfile();
      convertToPdf(docxPath, OUT, profile);
      const pdf = join(OUT, 'line-spacing-1.5.pdf');
      const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout;
      const pdfPages = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
      check(`[${tag}] LibreOffice prints the .docx on the page's ${sheets} sheets (no sheet overflows)`, pdfPages === sheets, `${pdfPages} pages`);
      spawnSync('pdftoppm', ['-png', '-r', '70', '-f', '1', '-l', '2', pdf, join(OUT, 'word-page')]);
    }
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
  devServer?.kill();
}
console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
