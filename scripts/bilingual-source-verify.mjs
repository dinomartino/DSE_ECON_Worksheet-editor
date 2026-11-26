import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * A bilingual paper prints each question's source as the short tag alone (user u-gnmu,
 * k-0563), "(DSE2019/P1/Q12)", even with the format set to Full; never both full forms on one
 * line. English and 中文 papers keep the format chosen. Seeds a paper of three past paper MC
 * questions with Show source on (format Full), then reads the page, the printed PDF and the
 * `.docx` on a bilingual paper, and the page on English and 中文 ones.
 *
 *   node scripts/bilingual-source-verify.mjs <out-dir> [--port=3000] [--tag=after]
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/bilingual-source-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const tag = args.find((a) => a.startsWith('--tag='))?.slice(6) ?? 'after';
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const doc = JSON.parse(readFileSync(new URL('../src/test/corpus/v1-mcq.json', import.meta.url), 'utf8'));
const SOURCES = [
  ['HKDSE 2019 Paper 1 Q12', '香港中學文憑考試 2019 卷一 第 12 題', 'DSE2019/P1/Q12'],
  ['HKCEE 2006 Paper 2 Q32', '香港中學會考 2006 卷二 第 32 題', 'CE2006/P2/Q32'],
  ['HKDSE Sample Paper Paper 1 Q3', '香港中學文憑考試 樣本試卷 卷一 第 3 題', 'DSESP/P1/Q3'],
];
doc.questions.forEach((question, index) => {
  question.provenance = { en: [{ text: SOURCES[index][0] }], zh: [{ text: SOURCES[index][1] }] };
});
doc.showQuestionSources = true;
doc.title = 'Bilingual source verify';
const KEY = `econ-worksheet:${doc.id}`;
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const SHORT = SOURCES.map(([, , short]) => `(${short})`);
const FULL = { en: SOURCES.map(([en]) => `(${en})`), zh: SOURCES.map(([, zh]) => `（${zh}）`) };

const browser = await chromium.launch({ channel: 'chrome' });

const openPaper = async (paper) => {
  const context = await browser.newContext({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true });
  await context.addInitScript(
    ([version, index, key, body, paper]) => {
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper }));
      localStorage.setItem('econ-worksheet-index', index);
      if (!localStorage.getItem(key)) localStorage.setItem(key, body);
      delete window.showSaveFilePicker;
    },
    [VERSION, JSON.stringify([{ id: doc.id, title: doc.title, updatedAt: doc.updatedAt }]), KEY, JSON.stringify(doc), paper],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(`http://localhost:${port}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(doc.title) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
  await page.waitForTimeout(2500);
  return { page, context };
};

/** Each source line on the page: a paragraph of its own whose words open with a bracket. */
const sourceLines = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#print-root p')]
      .map((p) => p.textContent.replace(/\u00a0/g, ' ').trim())
      .filter((text) => /^[(（](HK|DSE|CE|AL|香港)/.test(text)),
  );

for (const paper of ['bilingual', 'en', 'zh']) {
  const { page, context } = await openPaper(paper);
  const lines = await sourceLines(page);
  const want = paper === 'bilingual' ? SHORT : FULL[paper];
  check(JSON.stringify(lines) === JSON.stringify(want), `${paper}: the page prints ${want.join(' ')}`, JSON.stringify(lines));
  // The first source line, centred in the window (the toolbar is sticky over the sheet's top).
  await page.evaluate(() => {
    const line = [...document.querySelectorAll('#print-root p')].find((p) => /^[(（](HK|DSE|CE|AL|香港)/.test(p.textContent.trim()));
    line?.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${tag}-page-${paper}.png` });

  if (paper === 'bilingual') {
    // The printed PDF: what the print dialog gets.
    await page.emulateMedia({ media: 'print' });
    const pdf = `${OUT}/${tag}-print-bilingual.pdf`;
    await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
    await page.emulateMedia({ media: 'screen' });
    try {
      const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' }).replace(/[\s\u00a0]+/g, '');
      for (const label of SHORT) check(text.includes(label), `bilingual: the printed PDF shows ${label}`);
      check(!text.includes('HKDSE2019Paper1Q12') && !text.includes('香港中學文憑考試2019'), 'bilingual: the printed PDF has no full form');
    } catch {
      console.log('(pdftotext missing: PDF not read back)');
    }

    // The .docx, exported bilingual.
    await page.getByRole('button', { name: /^Export/ }).first().click();
    const exporter = page.getByRole('dialog');
    await exporter.getByText('.docx', { exact: true }).click();
    await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('Bilingual', { exact: true }).click();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), exporter.getByRole('button', { name: /^Export \.docx/ }).click()]);
    const file = `${OUT}/${tag}-worksheet-bilingual.docx`;
    writeFileSync(file, readFileSync(await download.path()));
    const xml = (await (await JSZip.loadAsync(readFileSync(file))).file('word/document.xml').async('string')).replace(/\u00a0/g, ' ');
    const paragraphs = (xml.match(/<w:p[ >](?:(?!<\/w:p>).)*<\/w:p>/g) ?? []).map((p) => p.replace(/<[^>]+>/g, ''));
    for (const label of SHORT) check(paragraphs.filter((p) => p === label).length === 1, `bilingual: the .docx has ${label} once, as its own paragraph`);
    check(!xml.includes('HKDSE 2019 Paper 1 Q12') && !xml.includes('香港中學文憑考試 2019'), 'bilingual: the .docx has no full form');
    await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));

    // Setup → Page: the switch, its format (still Full) and the hint naming the bilingual rule.
    await page.getByRole('button', { name: /^Setup/ }).first().click();
    const setup = page.getByRole('dialog');
    await setup.getByRole('tab', { name: /^Page/ }).first().click();
    const field = setup.locator('[data-testid="question-sources"]');
    await field.scrollIntoViewIfNeeded();
    check((await field.locator('select').inputValue()) === 'full', 'bilingual: Setup → Page still shows the format Full');
    check(/bilingual paper prints the short form/.test(await field.innerText()), 'bilingual: the Setup hint names the bilingual rule');
    await field.screenshot({ path: `${OUT}/${tag}-setup-page-hint.png` });
    await page.keyboard.press('Escape');
  }
  await context.close();
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
