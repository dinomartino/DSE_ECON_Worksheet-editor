import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

/**
 * "Show source (year + question no.)" (user u-w7gs) and its format (u-z6ft), walked in a real
 * browser against the built-in past paper bank: the tray's box and format picker, a new
 * worksheet made with them (EN and 中文), the source on the page, in the `.docx` and in the
 * printed PDF, Setup → Page changing the format and turning it off, the editor's Past papers
 * tab, and the same at phone width. One format per run:
 *
 *   node scripts/pastpaper-source-verify.mjs <out-dir> [--port=3000] [--phone] [--format=full|short|shortRoman]
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-source-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const phone = args.includes('--phone');
const FORMATS = ['full', 'short', 'shortRoman'];
const format = args.find((a) => a.startsWith('--format='))?.slice(9) ?? 'full';
if (!FORMATS.includes(format)) throw new Error(`--format must be one of ${FORMATS.join(', ')}`);
// Setup → Page then changes it to the next one, to prove the page follows.
const nextFormat = FORMATS[(FORMATS.indexOf(format) + 1) % FORMATS.length];
const tag = `${phone ? 'iphone' : 'macbook'}-${format}`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const PICKS = ['DSE2019/P1/Q12', 'CE2006/P2/Q32'];
const LABELS = {
  full: {
    en: ['(HKDSE 2019 Paper 1 Q12)', '(HKCEE 2006 Paper 2 Q32)'],
    zh: ['（香港中學文憑考試 2019 卷一 第 12 題）', '（香港中學會考 2006 卷二 第 32 題）'],
  },
  // Short forms are the same on every language.
  short: { en: ['(DSE2019/P1/Q12)', '(CE2006/P2/Q32)'], zh: ['(DSE2019/P1/Q12)', '(CE2006/P2/Q32)'] },
  shortRoman: { en: ['(DSE2019/I/Q12)', '(CE2006/II/Q32)'], zh: ['(DSE2019/I/Q12)', '(CE2006/II/Q32)'] },
};
const LABEL = LABELS[format];
const ALL_LABELS = (language) => FORMATS.flatMap((f) => LABELS[f][language]);

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext(
  phone
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, acceptDownloads: true }
    : { viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true },
);
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
});

const openBank = async () => {
  await page.goto(`http://localhost:${port}`);
  await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
  await page.locator('[data-pastpaper-screen]').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(2500);
};

const pick = async (source) => {
  await page.getByRole('searchbox').first().fill(source);
  await page.getByRole('radio', { name: 'Every topic' }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const card = page.locator('[data-pastpaper-screen] article').first();
  await card.scrollIntoViewIfNeeded();
  await card.locator('input[type="checkbox"]').first().check();
};

/** The page's printed text (the editor's #print-root). */
// Labels print with no-break spaces (`render/questionSource.ts:sourceTrail`); compared as spaces.
const pageText = async () => (await page.locator('#print-root').innerText()).replace(/\u00a0/g, ' ');

/**
 * Where each label sits (user u-tchj): a paragraph of its own right above its question, its
 * words starting at the question number's left edge, on the same sheet.
 */
const placements = (labels) =>
  page.evaluate((labels) => {
    const ps = [...document.querySelectorAll('#print-root p')];
    return labels.map((label) => {
      const own = ps.find((p) => p.textContent.replace(/\u00a0/g, ' ').trim() === label);
      if (!own) return { label, own: false };
      const next = ps[ps.indexOf(own) + 1];
      const marker = next && [...next.querySelectorAll('span.absolute')].find((span) => /^\d+\.$/.test(span.textContent.trim()));
      if (!marker) return { label, own: true, marker: false };
      const range = document.createRange();
      range.selectNodeContents(own);
      const words = range.getBoundingClientRect();
      const number = marker.getBoundingClientRect();
      return {
        label,
        own: true,
        marker: true,
        dx: Math.round((words.left - number.left) * 10) / 10,
        above: words.bottom <= number.top + 2,
        samePage: own.closest('[data-page-index]') === next.closest('[data-page-index]'),
      };
    });
  }, labels);
const placedWell = (p) => p.own && p.marker && Math.abs(p.dx) <= 2 && p.above && p.samePage;

/** In the PDF's text (`pdftotext -layout`): the label alone on its line, the numbered line next, same column, same page. */
const pdfPlacements = (printed, labels) => {
  const pages = printed.split('\f');
  return labels.map((label) => {
    const want = label.replace(/\s+/g, '');
    for (const sheet of pages) {
      const lines = sheet.split('\n');
      const at = lines.findIndex((line) => line.replace(/[\s\u00a0]+/g, '') === want);
      if (at < 0) continue;
      const next = lines.slice(at + 1).find((line) => line.trim() !== '');
      const indent = (line) => line.length - line.trimStart().length;
      return { label, own: true, numbered: next !== undefined && /^\s*\d+\.\s*\S/.test(next), column: next === undefined ? undefined : indent(lines[at]) - indent(next) };
    }
    return { label, own: false };
  });
};

const exportDocx = async (language, state) => {
  await page.getByRole('button', { name: /^Export/ }).first().click();
  const exporter = page.getByRole('dialog');
  await exporter.getByText('.docx', { exact: true }).click();
  await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle(language === 'en' ? 'English only' : '中文 only', { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), exporter.getByRole('button', { name: /^Export \.docx/ }).click()]);
  const file = `${OUT}/${tag}-worksheet-${state}-${language}.docx`;
  writeFileSync(file, readFileSync(await download.path()));
  await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(800);
  const zip = await JSZip.loadAsync(readFileSync(file));
  return (await zip.file('word/document.xml').async('string')).replace(/\u00a0/g, ' ');
};

/** What the printer gets: the print stylesheet applied to the page, as a PDF, read back as text. */
const printedText = async (name) => {
  await page.emulateMedia({ media: 'print' });
  const pdf = `${OUT}/${tag}-${name}.pdf`;
  await page.pdf({ path: pdf, format: 'A4', printBackground: true, preferCSSPageSize: true });
  await page.emulateMedia({ media: 'screen' });
  try {
    return execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
  } catch {
    return undefined;
  }
};

for (const language of ['en', 'zh']) {
  await openBank();
  if (language === 'zh') await page.getByRole('radiogroup', { name: 'Paper language' }).getByRole('radio', { name: '中文' }).click();
  for (const source of PICKS) await pick(source);
  const tray = page.locator('[role="region"]');
  const box = tray.locator('[data-pastpaper-show-sources] input');
  check((await box.count()) === 1, `${language}: the tray offers Show source`);
  if (language === 'en') {
    check(!(await box.isChecked()), 'off by default (today’s behaviour)');
    await tray.screenshot({ path: `${OUT}/${tag}-tray-off.png` });
  } else check(await box.isChecked(), `${language}: the choice was remembered from the last time`);
  await box.check();
  const picker = tray.locator('[data-pastpaper-source-format] select');
  check((await picker.count()) === 1, `${language}: with Show source on, the tray offers the format`);
  if (language === 'en') {
    check((await picker.inputValue()) === 'full', 'the format is Full by default', await picker.inputValue());
    await picker.selectOption(format);
  } else check((await picker.inputValue()) === format, `${language}: the format was remembered`, await picker.inputValue());
  await tray.screenshot({ path: `${OUT}/${tag}-tray-${language}.png` });
  if (phone) await page.screenshot({ path: `${OUT}/${tag}-bank-screen.png` });
  await tray.locator('select:has(option[value="new:classroom"])').selectOption('new:classroom');
  await tray.getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('#print-root').waitFor({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
  await page.waitForTimeout(3000);

  const text = await pageText();
  for (const label of LABEL[language]) check(text.includes(label), `${language}: the page shows ${label}`);
  const firstQuestion = page.locator('#print-root p', { hasText: LABEL[language][0] }).first();
  await firstQuestion.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/${tag}-worksheet-${language}.png` });
  const others = ALL_LABELS(language).filter((label) => !LABEL[language].includes(label));
  check(!others.some((label) => text.includes(label)), `${language}: no other format's label on the page`);
  for (const placed of await placements(LABEL[language])) {
    check(placedWell(placed), `${language}: ${placed.label} is on its own line above its question, at the number's left edge`, JSON.stringify(placed));
  }

  if (!phone) {
    const xml = await exportDocx(language, 'on');
    for (const label of LABEL[language]) check(xml.includes(label), `${language}: the .docx prints ${label}`);
    const paragraphs = xml.match(/<w:p[ >](?:(?!<\/w:p>).)*<\/w:p>/g) ?? [];
    for (const label of LABEL[language]) {
      const at = paragraphs.findIndex((p) => p.replace(/<[^>]+>/g, '') === label);
      check(at >= 0 && !paragraphs[at].includes('<w:numPr>') && (paragraphs[at + 1].includes('<w:numPr>') || /^\s*\d+\./.test(paragraphs[at + 1].replace(/<[^>]+>/g, ''))), `${language}: the .docx has ${label} as its own paragraph before the numbered one`, at >= 0 ? paragraphs[at + 1].slice(0, 200) : 'not found');
    }
    check(!others.some((label) => xml.includes(label)), `${language}: the .docx prints no other format`);
    const printed = await printedText(`print-on-${language}`);
    if (printed === undefined) console.log('(pdftotext missing: PDF not read back)');
    else {
      const flat = printed.replace(/[\s\u00a0]+/g, '');
      for (const label of LABEL[language]) check(flat.includes(label.replace(/\s+/g, '')), `${language}: the printed PDF shows ${label}`);
      for (const placed of pdfPlacements(printed, LABEL[language])) {
        check(placed.own && placed.numbered && Math.abs(placed.column) <= 1, `${language}: the PDF prints ${placed.label} alone on its line, its numbered line next, same column`, JSON.stringify(placed));
      }
    }
  }

  // Setup → Page shows this paper's format and changes it; then turns the sources off.
  await page.getByRole('button', { name: language === 'zh' ? /^Setup|^頁面設定/ : /^Setup/ }).first().click();
  const setup = page.getByRole('dialog');
  await setup.getByRole('tab', { name: /^Page|^頁面$/ }).first().click();
  const field = setup.locator('[data-testid="question-sources"]');
  check((await field.count()) === 1, `${language}: Setup → Page has the switch`);
  await field.scrollIntoViewIfNeeded();
  await field.screenshot({ path: `${OUT}/${tag}-setup-switch.png` }).catch(() => {});
  check(await field.locator('input').isChecked(), `${language}: Setup shows it on`);
  const setupPicker = field.locator('[data-pastpaper-source-format] select');
  check((await setupPicker.count()) === 1 && (await setupPicker.inputValue()) === format, `${language}: Setup shows the format`, await setupPicker.inputValue().catch(() => 'none'));
  await setupPicker.selectOption(nextFormat);
  await page.waitForTimeout(1200);
  const switched = await pageText();
  for (const label of LABELS[nextFormat][language]) check(switched.includes(label), `${language}: Setup → ${nextFormat}, the page shows ${label}`);
  await setupPicker.selectOption(format);
  await page.waitForTimeout(800);
  await field.locator('input[type="checkbox"]').uncheck();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  const offText = await pageText();
  check(!ALL_LABELS(language).some((label) => offText.includes(label)), `${language}: off in Setup, the page shows no source`);
  await firstQuestion.scrollIntoViewIfNeeded().catch(() => {});
  await page.locator('#print-root').first().scrollIntoViewIfNeeded().catch(() => {});
  if (format === 'full') await page.screenshot({ path: `${OUT}/${tag.replace(/-full$/, '')}-worksheet-off-${language}.png` });
  if (!phone) {
    const xml = await exportDocx(language, 'off');
    check(!ALL_LABELS(language).some((label) => xml.includes(label)), `${language}: off, the .docx prints no source`);
  }
}

// The editor's 題庫 tab → Past papers: the box names this paper once it has sourced questions.
if (!phone) {
  await page.getByRole('tab', { name: /題庫|Bank/ }).first().click().catch(() => {});
  await page.getByRole('button', { name: /Question bank|題庫/ }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  await page.getByRole('radio', { name: /^Past papers|^歷屆試題/ }).first().click().catch(() => {});
  await page.getByRole('tab', { name: /^Past papers|^歷屆試題/ }).first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const tab = page.locator('[data-pastpaper-tab]');
  if ((await tab.count()) > 0) {
    const label = tab.locator('[data-pastpaper-show-sources]');
    check((await label.count()) === 1, 'the editor’s Past papers tab has the box');
    check(/this paper|此試卷/.test(await label.innerText()), 'it names this paper once the paper has sourced questions', await label.innerText());
    // Turned back on here, its format picker is this paper's: the page follows it.
    await label.locator('input').check();
    await page.waitForTimeout(800);
    const tabPicker = tab.locator('[data-pastpaper-source-format] select');
    check((await tabPicker.count()) === 1 && (await tabPicker.inputValue()) === format, 'the tab offers this paper’s format', await tabPicker.inputValue().catch(() => 'none'));
    await tabPicker.selectOption(nextFormat);
    await page.waitForTimeout(1200);
    const fromTab = await pageText();
    check(LABELS[nextFormat].zh.every((l) => fromTab.includes(l)), `the tab's format changes the paper (${nextFormat})`);
    await tabPicker.selectOption(format);
    await page.waitForTimeout(800);
    await tab.locator('div').first().screenshot({ path: `${OUT}/${tag}-editor-tab.png` });
  } else console.log('(editor Past papers tab not found by the walk; skipped)');
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
