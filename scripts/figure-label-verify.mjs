import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Diagrams numbered (1) to (4) put each number at the upper-left corner of its diagram, as on
 * the HKDSE papers (k-0555, u-g93j), walked in a real browser against the built-in past paper
 * bank: DSE2024 P1 Q38 and DSE2026 P1 Q38 on their cards (EN and 中文), inserted in a new
 * Paper 1 (the editor, EN and 中文), the print PDF and the `.docx` of the Export dialog (EN and
 * 中文, drawn by LibreOffice).
 *
 *   node scripts/figure-label-verify.mjs <out-dir> [--port=3000] [--label=after]
 *
 * Prints, for every "(n)" over a picture, how far the number starts from the picture's left
 * edge (px). `--label=after` checks it is within a few pixels; run once on the old build as
 * `--label=before` for the comparison shots.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/figure-label-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const label = args.find((a) => a.startsWith('--label='))?.slice(8) ?? 'after';
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const SAMPLES = ['DSE2024/P1/Q38', 'DSE2026/P1/Q38'];
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true });
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
await page.addInitScript(() => {
  delete window.showSaveFilePicker;
  window.localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
});
await page.goto(`http://localhost:${port}`);
await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 60_000 }).catch(() => {});
const screen = page.locator('[data-pastpaper-screen]');

const findCard = async (source) => {
  await page.getByRole('searchbox').first().fill(source);
  await page.getByRole('radio', { name: 'Every topic' }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const card = screen.locator('article').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  return card;
};

/**
 * Per table cell holding "(n)" and a picture: the number's left edge less the picture's, in CSS px.
 * Reads the light DOM and any shadow root below `root`.
 */
const offsetsIn = (root) =>
  root.evaluate((el) => {
    const roots = [el, ...[...el.querySelectorAll('*')].map((n) => n.shadowRoot).filter(Boolean)];
    const out = [];
    for (const r of roots) {
      for (const td of r.querySelectorAll('td')) {
        const img = td.querySelector('img');
        if (!img) continue;
        const walker = document.createTreeWalker(td, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = walker.nextNode())) {
          const at = node.textContent.search(/[(（]\s*\d\s*[)）]/);
          if (at < 0) continue;
          const range = document.createRange();
          range.setStart(node, at);
          range.setEnd(node, at + 1);
          out.push(Math.round(range.getBoundingClientRect().left - img.getBoundingClientRect().left));
          break;
        }
      }
    }
    return out;
  });

const report = (where, offsets) => {
  console.log(`${where}: number left − picture left (px) = ${JSON.stringify(offsets)}`);
  if (label === 'after') {
    check(offsets.length >= 4 && offsets.every((d) => Math.abs(d) <= 3), `${where}: every (n) starts at its picture's left edge`, JSON.stringify(offsets));
  }
};

// The cards, in both question languages.
for (const q of ['en', 'zh']) {
  await screen.getByRole('radio', { name: q === 'en' ? 'EN' : '中文', exact: true }).click();
  for (const source of SAMPLES) {
    const card = await findCard(source);
    const name = `${label}-card-${source.replaceAll('/', '-')}-${q}`;
    report(name, await offsetsIn(card));
    await card.screenshot({ path: `${OUT}/${name}.png` });
  }
}
await screen.getByRole('radio', { name: 'EN', exact: true }).click();

// Both into a new Paper 1.
for (const source of SAMPLES) {
  const card = await findCard(source);
  await card.locator('input[type="checkbox"]').check();
}
await page.locator('[role="region"] select').selectOption('new:paper1');
await page.locator('[role="region"]').getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(3500);
await page.getByRole('button', { name: 'Done', exact: true }).click().catch(() => {});
await page.getByRole('button', { name: /Close|關閉/ }).first().click().catch(() => {});

const paperShots = async (lang) => {
  const tables = page.locator('#print-root table', { has: page.locator('img') });
  const count = await tables.count();
  for (let i = 0; i < Math.min(count, 2); i += 1) {
    const table = tables.nth(i);
    await table.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    report(`${label}-editor-${lang}-Q${i + 1}`, await offsetsIn(table));
    await table.screenshot({ path: `${OUT}/${label}-editor-${lang}-Q${i + 1}.png` });
  }
  check(count >= 2, `editor ${lang}: both questions' diagram tables are on the paper (${count})`);
};
await paperShots('en');

// The print PDF, as Chrome prints the sheets.
await page.emulateMedia({ media: 'print' });
const printed = join(OUT, `${label}-print-en.pdf`);
writeFileSync(printed, await page.pdf({ preferCSSPageSize: true, printBackground: true }));
await page.emulateMedia({ media: null });
spawnSync('pdftoppm', ['-png', '-r', '70', printed, join(OUT, `${label}-print-en`)]);

// The .docx of the Export dialog, both languages, drawn by LibreOffice.
for (const [language, title] of [['en', 'English only'], ['zh', '中文 only']]) {
  await page.getByRole('button', { name: /^Export/ }).first().click();
  const exporter = page.getByRole('dialog');
  await exporter.getByText('.docx', { exact: true }).click();
  await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle(title, { exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), exporter.getByRole('button', { name: /^Export \.docx/ }).click()]);
  const docx = join(OUT, `${label}-paper1-${language}.docx`);
  writeFileSync(docx, readFileSync(await download.path()));
  await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
  await page.waitForTimeout(800);
  spawnSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', OUT, docx], { stdio: 'ignore' });
  spawnSync('pdftoppm', ['-png', '-r', '70', docx.replace(/\.docx$/, '.pdf'), join(OUT, `${label}-docx-${language}`)]);
  const xml = spawnSync('unzip', ['-p', docx, 'word/document.xml'], { encoding: 'utf8', maxBuffer: 1 << 28 }).stdout;
  const indented = (xml.match(/<w:ind w:left="\d+"\/><w:jc w:val="left"\/><\/w:pPr>(?:(?!<\/w:p>).)*?\(\d\)/g) ?? []).length;
  console.log(`${label} .docx ${language}: ${indented} numbers indented to their picture`);
  if (label === 'after') check(indented >= 8, `.docx ${language}: the 8 numbers start at their pictures`, String(indented));
}

// The editor in 中文.
await page.getByTitle('中文 only', { exact: true }).first().click();
await page.waitForTimeout(2000);
await paperShots('zh');

await browser.close();
console.log(failures ? `${failures} check(s) failed` : 'all passed');
process.exit(failures ? 1 : 0);
