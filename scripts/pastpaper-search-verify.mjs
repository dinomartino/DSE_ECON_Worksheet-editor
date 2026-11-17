import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';

/**
 * The Past paper bank's second round (k-0444) walked in a real browser, EN and 中文, against a
 * local export with a search index (`node scripts/pastpaper-index.mjs <pack> <out>`, served
 * from `public/pastpaper-bank/`; gitignored, never committed).
 *
 *   node scripts/pastpaper-search-verify.mjs <out-dir> [--port=3000] [--source=/pastpaper-bank/]
 *
 * Checks: a search of every topic answers from the index and downloads only the topics it
 * shows; the paper filter lists one paper in question order; questions whose options are
 * diagrams print two by two, each letter above its own diagram, in the screen, the editor
 * and the `.docx` the real Export dialog writes (saved to <out-dir> for a LibreOffice look);
 * the storage warning in the tray and the toolbar.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-search-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const source = args.find((a) => a.startsWith('--source='))?.slice(9) ?? '/pastpaper-bank/';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const manifest = await fetch(`${URL}${source}manifest.json`).then((r) => r.json());
const index = manifest.search?.questions ?? [];
check(index.length > 0, `the list carries a search index (${index.length} rows)`);

const browser = await chromium.launch({ channel: 'chrome' });

const keptFiles = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('econ-pastpaper-bank');
        open.onsuccess = () => {
          const req = open.result.transaction('files').objectStore('files').getAllKeys();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve([]);
        };
        open.onerror = () => resolve([]);
      }),
  );

async function openBank(zh, filler = 0) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true });
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.addInitScript(
    ([src, zhUi, fill]) => {
      // A save picker would wait for a person; the download it falls back to is the same file.
      delete window.showSaveFilePicker;
      if (sessionStorage.getItem('pp-seeded')) return;
      sessionStorage.setItem('pp-seeded', '1');
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: src }));
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: zhUi ? 'zh-HK' : 'en', paper: zhUi ? 'zh' : 'en' }));
      // Something else of this site's taking room, as old documents full of pictures would.
      if (fill > 0) localStorage.setItem('k0444-filler', 'x'.repeat(fill));
    },
    [source, zh, filler],
  );
  await page.goto(URL);
  const title = zh ? '歷屆試題庫' : 'Past paper bank 歷屆試題庫';
  const row = page.getByRole('button', { name: new RegExp(title) }).first();
  await row.waitFor({ timeout: 60_000 });
  await row.click();
  await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 30_000 });
  return page;
}

const screen = (page) => page.locator('[data-pastpaper-screen]');
const settle = (page, ms = 1200) => page.waitForTimeout(ms);

async function englishWalk() {
  const page = await openBank(false);
  const topics = manifest.topics.length;

  // A. Search every topic: answered by the index, only shown topics downloaded.
  const word = 'nominal income';
  await page.getByRole('searchbox').first().fill(word);
  await page.getByRole('radio', { name: 'Every topic' }).click();
  await settle(page, 2500);
  const expected = index.filter((r) => `${r.en} ${r.zh} ${r.source}`.toLowerCase().includes('nominal') && `${r.en} ${r.zh}`.toLowerCase().includes('income')).length;
  const status = await screen(page).locator('[role="status"]').first().textContent();
  check(/\d+/.test(status ?? '') && Number((status ?? '').match(/^(\d+)/)?.[1]) >= expected, `[en] every topic searched: "${status}" (index has ${expected} with both words)`);
  const kept = (await keptFiles(page)).filter((k) => String(k).includes('topics/'));
  check(kept.length > 0 && kept.length < topics, `[en] only the topics shown were downloaded (${kept.length} of ${topics})`);
  await page.screenshot({ path: `${OUT}/01-search-every-topic-en.png` });

  // B. The paper filter: one paper, every topic, question order.
  await page.getByRole('searchbox').first().fill('');
  await page.locator('[data-pastpaper-paper]').selectOption('DSE2016/P1');
  await settle(page, 3000);
  const labels = await screen(page).locator('article').evaluateAll((cards) =>
    cards.map((c) => (c.textContent ?? '').match(/Q(\d+)/)?.[1]).filter(Boolean).map(Number),
  );
  const sorted = [...labels].sort((a, b) => a - b);
  const want = index.filter((r) => r.source.startsWith('DSE2016/P1/')).length;
  check(labels.length > 0 && JSON.stringify(labels) === JSON.stringify(sorted), `[en] HKDSE 2016 Paper 1 in question order (${labels.slice(0, 8).join(', ')}…)`);
  check((await screen(page).locator('h2').nth(1).textContent())?.includes('HKDSE 2016 Paper 1'), '[en] the heading names the paper');
  const shown = Number(((await screen(page).locator('[role="status"]').first().textContent()) ?? '').match(/^(\d+)/)?.[1]);
  check(shown === want, `[en] all ${want} questions of that paper are listed`, String(shown));
  await page.screenshot({ path: `${OUT}/02-paper-filter-en.png` });

  // C. A question whose options are diagrams: A B side by side, C D under them, each letter above its own.
  const card = screen(page).locator('article', { hasText: 'Q34' }).first();
  await card.scrollIntoViewIfNeeded();
  await settle(page, 2500);
  const grid = await card.evaluate((el) => {
    const host = el.querySelector('div[style*="absolute"]');
    const root = host?.shadowRoot;
    if (!root) return null;
    const imgs = [...root.querySelectorAll('img')].map((img) => img.getBoundingClientRect());
    return imgs.map((r) => ({ x: Math.round(r.x), y: Math.round(r.y) }));
  });
  check(
    Array.isArray(grid) && grid.length === 4 && Math.abs(grid[0].y - grid[1].y) < 4 && grid[1].x > grid[0].x && grid[2].y > grid[0].y + 20 && Math.abs(grid[2].x - grid[0].x) < 4,
    '[en] DSE2016 P1 Q34 draws its four diagrams two by two',
    JSON.stringify(grid),
  );
  await card.screenshot({ path: `${OUT}/03-diagram-options-card-en.png` });

  // D. Pick it and two more diagram questions → New Paper 1; the editor draws the grid; Export .docx.
  await page.locator('[data-pastpaper-paper]').selectOption('');
  for (const tag of ['DSE2016/P1/Q34', 'DSE2019/P1/Q38', 'DSE2017/P1/Q40', 'DSE2024/P1/Q29']) {
    await page.getByRole('searchbox').first().fill(tag);
    await page.getByRole('radio', { name: 'Every topic' }).click().catch(() => {});
    await settle(page, 2500);
    await screen(page).locator('article').first().locator('input[type="checkbox"]').check().catch(() => {});
  }
  const picked = await page.locator('[role="region"]').textContent().catch(() => '');
  check(/4 picked/.test(picked ?? ''), `[en] four diagram questions picked (${picked?.slice(0, 20)})`);
  await page.locator('[role="region"] select').selectOption('new:paper1');
  await page.locator('[role="region"]').getByRole('button', { name: 'Add', exact: true }).click();
  await page.locator('[data-print-hide]').first().waitFor({ timeout: 30_000 });
  await settle(page, 4000);
  await page.screenshot({ path: `${OUT}/04-paper1-editor-en.png` });

  for (const [language, title] of [['en', 'English only'], ['zh', '中文 only']]) {
    await page.getByRole('button', { name: /^Export/ }).first().click();
    const exporter = page.getByRole('dialog');
    await exporter.getByText('.docx', { exact: true }).click();
    await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle(title, { exact: true }).click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 90_000 }),
      exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
    ]);
    const bytes = readFileSync(await download.path());
    writeFileSync(`${OUT}/paper1-diagram-options-${language}.docx`, bytes);
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file('word/document.xml').async('string');
    const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/'));
    check(media.length >= 16, `[${language}] the .docx carries the diagrams (${media.length} pictures)`);
    check(!/\bpp[-:][A-Za-z0-9]/.test(xml), `[${language}] no bank ids leak into the .docx`);
    await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
    await settle(page, 800);
  }
  await page.close();
}

async function chineseWalk() {
  const page = await openBank(true);
  await page.locator('[data-pastpaper-paper]').selectOption('DSE2016/P1');
  await settle(page, 3000);
  const card = screen(page).locator('article', { hasText: '第 34 題' }).first();
  await card.scrollIntoViewIfNeeded();
  await settle(page, 2500);
  await card.screenshot({ path: `${OUT}/05-diagram-options-card-zh.png` });
  await page.screenshot({ path: `${OUT}/06-paper-filter-zh.png` });
  check((await screen(page).locator('h2').nth(1).textContent())?.includes('香港中學文憑考試 2016 卷一'), '[zh] the heading names the paper in 中文');
  await page.close();
}

async function storageWalk() {
  // 4.3 Mi units already held: picks of diagram questions bring a warning, and a paper past 100% is refused.
  const page = await openBank(false, Math.round(4.3 * 1024 * 1024));
  await page.locator('[data-pastpaper-paper]').selectOption('DSE2016/P1');
  await settle(page, 3000);
  const card = screen(page).locator('article', { hasText: 'Q34' }).first();
  await card.scrollIntoViewIfNeeded();
  await settle(page, 2000);
  await card.locator('input[type="checkbox"]').check();
  await settle(page, 500);
  const warn = await page.locator('[data-pastpaper-storage]').textContent().catch(() => '');
  check(/would be \d+% full/.test(warn ?? ''), `[en] the tray warns that storage is nearly full (“${warn?.slice(0, 70)}…”)`);
  await page.locator('[role="region"]').screenshot({ path: `${OUT}/07-storage-warning-tray-en.png` });
  await page.locator('[role="region"] select').selectOption('new:classroom');
  await page.locator('[role="region"]').getByRole('button', { name: 'Add', exact: true }).click();
  await settle(page, 5000);
  const status = await page.locator('[data-save-state]').getAttribute('data-save-state').catch(() => '');
  check(status === 'nearlyFull', `[en] the toolbar says storage is nearly full after the save (${status})`);
  await page.screenshot({ path: `${OUT}/08-storage-nearly-full-toolbar-en.png`, clip: { x: 0, y: 0, width: 1512, height: 120 } });
  await page.close();
}

try {
  await englishWalk();
  await chineseWalk();
  await storageWalk();
} finally {
  await browser.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
