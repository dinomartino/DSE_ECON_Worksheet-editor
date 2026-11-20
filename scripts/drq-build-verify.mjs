import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

/**
 * k-0475: building a DRQ's marking scheme from the right panel, in a real browser.
 *
 * 1. Opens a made-up five-part DRQ with no schemes (`scripts/drq-build-fixture.test.ts`),
 *    and for each part clicks its row's scheme chip, then the pattern HKEAA uses for that
 *    kind of part (Any N reasons, Paragraph + total, Explain + diagram, Essay + EC). Checks
 *    every chip then shows a tick (the scheme matches the printed marks) and screenshots
 *    the panel:  build-panel-<device>-<lang>.png
 * 2. Opens the same DRQ with the schemes typed and screenshots the Marking scheme view
 *    (HKEAA style): build-key-<device>-<lang>.png, checking the headings, "[Mark the FIRST
 *    point only.]" and "The maximum mark for content is 12 marks." print.
 *
 *   node scripts/drq-build-verify.mjs [--out=/tmp/drq-build-verify] [--url=http://localhost:3000] [--zh] [--device=mac|ipad|ipad-portrait]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/drq-build-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const DEVICE = opt('device', 'mac');
const VIEWPORTS = {
  mac: { width: 1512, height: 982 },
  ipad: { width: 1180, height: 820 },
  'ipad-portrait': { width: 820, height: 1180 },
};
const zh = args.includes('--zh');
const tag = `${DEVICE}-${zh ? 'zh' : 'en'}`;
const W = zh
  ? {
      key: '評卷參考',
      patterns: ['任取 N 項理由', '一段 + 總分', '任取 N 項理由', '文字說明 + 圖', '論述 + 有效溝通'],
      printed: ['可能理由：', '［只批閱首項。］', '文字說明：', '內容最高12分。', '如何達成目標：'],
      question: '第1題',
    }
  : {
      key: 'Marking scheme',
      patterns: ['Any N reasons', 'Paragraph + total', 'Any N reasons', 'Explain + diagram', 'Essay + EC'],
      printed: ['Possible reasons:', '[Mark the FIRST point only.]', 'Verbal elaboration:', 'The maximum mark for content is 12 marks.', 'How the objective may be achieved:'],
      question: 'Question 1',
    };
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

mkdirSync(OUT, { recursive: true });
const emit = spawnSync('npx', ['vitest', 'run', 'scripts/drq-build-fixture.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, DRQ_DIR: OUT },
});
if (emit.status !== 0) process.exit(1);

const failures = [];
const check = (ok, label, detail = '') => {
  console.log(`${ok ? '✓' : '✗'} [${tag}] ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(label);
};

const docs = ['drq-empty', 'drq-filled'].map((name) => {
  const json = readFileSync(`${OUT}/${name}.worksheet.json`, 'utf8');
  const worksheet = JSON.parse(json);
  return { name, json, worksheet, title: name === 'drq-empty' ? 'DRQ build (empty)' : 'DRQ build (filled)' };
});

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: VIEWPORTS[DEVICE], deviceScaleFactor: 2 });
  await context.addInitScript(
    ([entries, version, chinese]) => {
      window.localStorage.setItem(
        'econ-worksheet-index',
        JSON.stringify(entries.map((d) => ({ id: d.id, title: d.title, updatedAt: d.updatedAt }))),
      );
      for (const d of entries) window.localStorage.setItem(`econ-worksheet:${d.id}`, d.json);
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (chinese) window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
    },
    [docs.map((d) => ({ id: d.worksheet.id, title: d.title, updatedAt: d.worksheet.updatedAt, json: d.json })), APP_VERSION, zh],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));

  const open = async (doc) => {
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(doc.title.replace(/[()]/g, '\\$&')) }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
    if (zh) await page.getByRole('radio', { name: '中文', exact: true }).first().click();
  };

  // 1. Build every part's scheme from the right panel.
  const empty = docs[0];
  await open(empty);
  // Select the question: a click on its source text on the page opens it in the panel.
  await page.locator('#print-root').getByText(zh ? '資料A：K市' : 'Source A: Bike rentals').first().click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1000);
  const parts = empty.worksheet.questions[0].parts;
  for (const [index, part] of parts.entries()) {
    const row = page.locator(`[data-edit-target="partAnswer:${part.id}"]`).first();
    const exists = (await row.count()) > 0;
    const chip = exists ? row.getByRole('button', { name: new RegExp(`^${zh ? '評卷參考|評分方案' : 'Marking scheme'}`) }) : page.locator('nothing');
    if ((await chip.count()) === 0) {
      check(false, `part ${index + 1} row has a scheme chip`, 'none');
      continue;
    }
    await chip.first().click();
    await page.waitForTimeout(700);
    const editor = page.locator(`[data-scheme-owner="${part.id}"]`).first();
    await editor.getByRole('button', { name: W.patterns[index], exact: true }).first().click();
    await page.waitForTimeout(500);
    const after = (await row.innerText()).trim();
    check(after.includes('✓'), `part ${index + 1}: the chip ticks after "${W.patterns[index]}"`, after);
  }
  // The part rows, each with its scheme chip.
  const rows = page.locator(`[data-edit-target="partAnswer:${parts[0].id}"]`).first();
  await rows.scrollIntoViewIfNeeded();
  await rows.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/build-rows-${tag}.png` });
  // The essay part's scheme in view: EC table, content max, the two headings.
  await page.locator(`[data-scheme-owner="${parts[4].id}"]`).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/build-panel-${tag}.png` });

  // 2. The typed DRQ's Marking scheme view.
  await open(docs[1]);
  await page.getByText(W.key, { exact: true }).first().click();
  await page.waitForTimeout(1500);
  const text = await page.evaluate(() => document.querySelector('#print-root')?.innerText ?? '');
  for (const wording of W.printed) check(text.includes(wording), `the key prints “${wording}”`);
  await page.screenshot({ path: `${OUT}/build-key-${tag}.png` });
  const papers = page.locator('#print-root .paper');
  for (let i = 0; i < Math.min(2, await papers.count()); i += 1) {
    await papers.nth(i).screenshot({ path: `${OUT}/build-key-page${i + 1}-${tag}.png` });
  }
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.error(`${failures.length} check(s) failed`);
  process.exit(1);
}
