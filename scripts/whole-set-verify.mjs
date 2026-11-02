import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import JSZip from 'jszip';

/**
 * The whole set (k-0299 step C), walked in Chrome at MacBook, iPad and iPhone sizes:
 *
 *   node scripts/whole-set-verify.mjs [--zh] [--port=3117] [--out=/tmp/whole-set]
 *
 * A Paper 1 and a Paper 2 (both with their sample questions) made into "S6 Mock 2026-27".
 * Marking scheme → Whole set shows both papers' keys, numbered on. Export → Whole set →
 * .docx writes one .zip (both papers + the set's key, each a real Word file). Export →
 * Whole set → PDF on the web lists three prints; each shows its document for the print and
 * gives the page back. Also include is folded away. Home: the set's ⋯ → Duplicate set…
 * moves 2026-27 on to 2027-28 and makes a second set of two papers.
 */

const args = process.argv.slice(2);
const zh = args.includes('--zh');
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3117';
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6) ?? '/tmp/whole-set';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

const W = zh
  ? {
      newWorksheet: '新增工作紙', name: '名稱', create: /^建立工作紙$/, home: 'Econ Studio 主頁', school: '學校',
      paper1: /^Paper 1 Mock · MCQ/, paper2: /^Paper 2 Mock · 答題簿/, dismissHint: '關閉提示',
      actionsFor: (t) => `「${t}」的操作`, makeSet: '建立套卷…', make: '建立套卷', setActions: (n) => `套卷「${n}」的操作`,
      openTitle: (t) => `開啟「${t}」`, markingScheme: '評卷參考', wholeSet: '整套試卷', thisPaper: '這份試卷',
      exportBtn: '匯出…', exportZip: '匯出 .zip', print: '列印', alsoOpen: '在此檔案加入其他文件的評卷參考…',
      answerKey: '評卷參考', duplicateSet: '複製套卷…', duplicate: '複製套卷', bump: '將 2026-27 改為 2027-28',
    }
  : {
      newWorksheet: 'New worksheet', name: 'Name', create: /^Create worksheet$/, home: 'Econ Studio home', school: 'School',
      paper1: /^Paper 1 mock · MCQ/, paper2: /^Paper 2 mock · booklet/, dismissHint: 'Dismiss hint',
      actionsFor: (t) => `Actions for ${t}`, makeSet: 'Make a set…', make: 'Make set', setActions: (n) => `Actions for the set ${n}`,
      openTitle: (t) => `Open ${t}`, markingScheme: 'Marking scheme', wholeSet: 'Whole set', thisPaper: 'This paper',
      exportBtn: 'Export…', exportZip: 'Export .zip', print: 'Print', alsoOpen: 'Add other documents’ answer keys to this file…',
      answerKey: 'Answer key', duplicateSet: 'Duplicate set…', duplicate: 'Duplicate set', bump: 'Change 2026-27 to 2027-28',
    };

const SIZES = [
  { tag: 'macbook', width: 1440, height: 900, touch: false },
  { tag: 'ipad-landscape', width: 1180, height: 820, touch: true },
  { tag: 'ipad-portrait', width: 820, height: 1180, touch: true },
  { tag: 'iphone', width: 390, height: 844, touch: true },
];
const only = args.find((a) => a.startsWith('--size='))?.slice(7);
const P1 = 'S6 Mock 2026-27 Paper 1';
const P2 = 'S6 Mock 2026-27 Paper 2';
const SET = 'S6 Mock 2026-27';

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch({ channel: 'chrome' });
for (const size of SIZES.filter((s) => !only || s.tag === only)) {
  console.log(`\n== ${size.tag} ${size.width}×${size.height}${zh ? ' 中' : ''} ==`);
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    hasTouch: size.touch,
    isMobile: size.tag === 'iphone',
    acceptDownloads: true,
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.addInitScript((zhOn) => {
    // Plain downloads, so Playwright sees the files; and a print that waits for the script.
    delete window.showSaveFilePicker;
    delete window.showDirectoryPicker;
    window.__prints = [];
    window.print = () => {
      const root = document.querySelector('#print-root');
      window.__prints.push({
        job: Boolean(document.querySelector('[data-print-job] #print-root')),
        sheets: document.querySelectorAll('#print-root [data-page-index] > .paper').length,
        parts: document.querySelectorAll('#print-root [data-key-part]').length,
        text: root?.innerText.slice(0, 400) ?? '',
      });
    };
    if (zhOn && !window.localStorage.getItem('econgen.settings.language')) {
      window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
    }
  }, zh);
  const tap = (locator) => (size.touch ? locator.tap() : locator.click());
  // The iPhone editor's side panel covers the page (known, k-0200 D): controls on the page
  // are there but under it, so they are pressed directly.
  const press = (locator) => (size.tag === 'iphone' ? locator.dispatchEvent('click') : tap(locator));
  const present = size.tag === 'iphone' ? { state: 'attached' } : {};
  const shot = (name) => page.screenshot({ path: `${OUT}/${zh ? 'zh' : 'en'}-${size.tag}-${name}.png` });
  const L = `${size.tag}:`;
  const dialog = page.getByRole('dialog');
  const goHome = async () => {
    await tap(page.getByRole('button', { name: W.home, exact: true }));
    await page.getByRole('button', { name: W.newWorksheet, exact: true }).first().waitFor();
    await page.waitForTimeout(700);
  };
  const waitPaper = async () => {
    await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
    const hint = page.getByRole('button', { name: W.dismissHint });
    if (await hint.count()) await tap(hint.first());
  };
  const create = async (kind, name) => {
    await tap(page.getByRole('button', { name: W.newWorksheet, exact: true }).first());
    await tap(dialog.getByRole('radio', { name: kind }));
    await dialog.getByLabel(W.name, { exact: true }).fill(name);
    await dialog.getByLabel(W.school, { exact: true }).fill('St Mary College');
    await tap(page.getByRole('button', { name: W.create }));
    await waitPaper();
    await goHome();
  };
  await page.goto(URL, { waitUntil: 'networkidle' });

  // 1. Two papers, one set.
  await create(W.paper1, P1);
  await create(W.paper2, P2);
  await tap(page.getByRole('button', { name: W.actionsFor(P1), exact: true }).first());
  await tap(page.getByRole('menuitem', { name: W.makeSet, exact: true }));
  await dialog.getByRole('textbox').first().fill(SET);
  await tap(dialog.getByRole('button', { name: W.make, exact: true }));
  await page.locator('[data-paper-set]').first().waitFor();
  await page.waitForTimeout(500);

  // 2. Paper 1 → Marking scheme → Whole set.
  await tap(page.locator('[data-paper-set]').first().getByRole('button', { name: W.openTitle(P1) }).first());
  await waitPaper();
  await page.locator('[data-paper-set-strip]').waitFor();
  await tap(page.getByRole('radio', { name: W.markingScheme }).first());
  await page.waitForTimeout(800);
  await shot('key-view');
  const scope = page.locator('[data-key-scope]');
  await scope.waitFor({ timeout: 10_000, ...present });
  check(true, `${L} Marking scheme offers This paper / Whole set`);
  await press(scope.getByRole('radio', { name: W.wholeSet }));
  await page.locator('[data-set-key] [data-key-part]').nth(1).waitFor({ timeout: 15_000, state: 'attached' });
  await page.waitForTimeout(1200);
  const parts = await page.locator('[data-set-key] [data-key-part]').count();
  check(parts === 2, `${L} Whole set shows both papers' keys (${parts})`);
  const keyText = await page.locator('#print-root').innerText();
  check(keyText.includes('Paper 1') && keyText.includes('Paper 2'), `${L} each part is titled with its paper`);
  const sheets = await page.locator('#print-root [data-page-index] > .paper').count();
  const lastNumber = await page.locator('#print-root .paper-page-number').last().innerText();
  check(lastNumber.trim() === `${sheets} / ${sheets}`, `${L} pages are numbered on across the set (${lastNumber.trim()} of ${sheets})`);
  await shot('key-whole-set');
  await press(scope.getByRole('radio', { name: W.thisPaper }));
  await page.waitForTimeout(600);
  check((await page.locator('[data-set-key]').count()) === 0, `${L} This paper goes back to the paper's own key`);

  // 3. Export → Whole set → .docx: one .zip.
  await tap(page.getByRole('button', { name: W.exportBtn }).first());
  await dialog.waitFor();
  await tap(dialog.getByRole('radio', { name: W.wholeSet }));
  await page.waitForTimeout(300);
  const listed = await dialog.locator('[data-set-files] li').count();
  check(listed === 3, `${L} Whole set lists 3 files (${listed})`);
  await shot('export-whole-set');
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    tap(dialog.getByRole('button', { name: W.exportZip })),
  ]);
  const zipPath = `${OUT}/${zh ? 'zh' : 'en'}-${size.tag}-${download.suggestedFilename()}`;
  await download.saveAs(zipPath);
  check(download.suggestedFilename() === 'S6 Mock 2026-27 (Student) (EN).zip', `${L} the .zip is named for the set (${download.suggestedFilename()})`);
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const names = Object.keys(zip.files).sort();
  check(
    names.length === 3 && names.some((n) => n.startsWith(P1)) && names.some((n) => n.startsWith(P2)) && names.some((n) => n.includes('(Answer key)')),
    `${L} the .zip holds both papers and the set's key: ${names.join(' | ')}`,
  );
  const keyDoc = await JSZip.loadAsync(await zip.file(names.find((n) => n.includes('(Answer key)'))).async('uint8array'));
  const keyXml = await keyDoc.file('word/document.xml').async('string');
  check((keyXml.match(/<w:sectPr/g) ?? []).length >= 2, `${L} the set's key is one Word file in a section per paper`);
  writeFileSync(`${OUT}/${zh ? 'zh' : 'en'}-${size.tag}-key.xml`, keyXml);
  await page.waitForTimeout(500);
  if (await dialog.count()) await page.keyboard.press('Escape');

  // 4. Export → Whole set → PDF (web): three prints, each its own document.
  await tap(page.getByRole('button', { name: W.exportBtn }).first());
  await dialog.waitFor();
  await tap(dialog.getByRole('radio', { name: 'PDF' }));
  await tap(dialog.getByRole('radio', { name: W.wholeSet }));
  await page.waitForTimeout(300);
  const prints = dialog.locator('[data-set-files] li');
  check((await prints.count()) === 3, `${L} PDF lists three prints`);
  await shot('export-whole-set-pdf');
  for (let i = 0; i < 3; i += 1) {
    await tap(prints.nth(i).getByRole('button'));
    await page.waitForFunction((n) => window.__prints.length > n, i, { timeout: 30_000 });
    // The page is given back after the print.
    await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
    await page.waitForTimeout(400);
  }
  const printed = await page.evaluate(() => window.__prints);
  check(printed.every((p) => p.job), `${L} every print showed its own document`);
  check(printed[1].text.includes(P2) || printed[1].text.includes('PAPER 2'), `${L} the second print is Paper 2`);
  check(printed[2].parts === 2, `${L} the third print is the set's marking scheme (${printed[2].parts} parts)`);
  check(printed.every((p) => p.sheets > 0), `${L} sheets: ${printed.map((p) => p.sheets).join(', ')}`);
  check((await page.locator('[data-print-job]').count()) === 0, `${L} the page is given back after the prints`);
  check((await page.locator('#print-root').count()) === 1, `${L} one #print-root on the page`);

  // 5. Also include is folded away.
  await tap(dialog.getByRole('radio', { name: '.docx' }));
  await tap(dialog.getByRole('radio', { name: W.answerKey, exact: true }));
  await page.waitForTimeout(300);
  check((await dialog.getByRole('button', { name: W.alsoOpen }).count()) === 1, `${L} Also include is a link, folded away`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 6. Home: Duplicate set… moves the year on.
  await goHome();
  await tap(page.getByRole('button', { name: W.setActions(SET), exact: true }));
  await tap(page.getByRole('menuitem', { name: W.duplicateSet, exact: true }));
  const form = page.locator('[data-duplicate-set]');
  await form.waitFor();
  check((await form.getByRole('textbox').inputValue()) === 'S6 Mock 2027-28', `${L} Duplicate set suggests S6 Mock 2027-28`);
  check((await form.getByRole('checkbox', { name: W.bump }).isChecked()) === true, `${L} it offers to move 2026-27 on, ticked`);
  await shot('duplicate-set');
  await tap(dialog.getByRole('button', { name: W.duplicate, exact: true }));
  await page.locator('[data-paper-set]').nth(1).waitFor({ timeout: 10_000 });
  await page.waitForTimeout(600);
  const frames = await page.locator('[data-paper-set]').allInnerTexts();
  const copy = frames.find((t) => t.includes('S6 Mock 2027-28'));
  check(Boolean(copy), `${L} a second set "S6 Mock 2027-28" is on the start screen`);
  check(Boolean(copy?.includes('S6 Mock 2027-28 Paper 1') && copy?.includes('S6 Mock 2027-28 Paper 2')), `${L} its papers are named for 2027-28`);
  await shot('after-duplicate');
  await context.close();
}
await browser.close();
console.log(failures.length === 0 ? `\nall checks pass${zh ? ' (中)' : ''}` : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
