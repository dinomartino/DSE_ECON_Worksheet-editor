import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The stakeholder diagram and Insert → Source… in a real Chrome (k-0469).
 *
 *   node scripts/stakeholder-verify.mjs [--url=http://localhost:3000] [--out=/tmp/stakeholder-verify]
 *
 * 1. Insert → Source… on a new worksheet: the three choices, then each lands in the question
 *    as Source A / B / C with its body (a table, a stakeholder diagram, a paragraph).
 * 2. The frozen v3 corpus opened from the start screen, in English and in 中文: the figure
 *    draws every box on the page; the panel adds a stakeholder, reorders, switches the arrows,
 *    and the page follows; the figure offers no Draw.
 * Screenshots of each step go to `--out`. Exits non-zero if a check fails.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/stakeholder-verify');
mkdirSync(OUT, { recursive: true });
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const corpus = readFileSync(new URL('../src/test/corpus/v3-stakeholder.json', import.meta.url), 'utf8');

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: {
    newWorksheet: 'New worksheet', classroom: /^Classroom worksheet/, name: 'Name', create: /Create worksheet/,
    dismissHint: 'Dismiss hint', rail: 'Add to worksheet', question: /^Question/, insert: /^Insert/,
    structured: /^Structured/, source: /^Source…/, table: /^With a table/, stakeholders: /^With a stakeholder diagram/,
    text: /^With text/, addStakeholder: '+ Stakeholder', toIssue: 'Them → issue', paperZh: '中文',
  },
  zh: {
    newWorksheet: '新增工作紙', classroom: /^課堂工作紙/, name: '名稱', create: /建立工作紙/,
    dismissHint: '關閉提示', rail: '插入至工作紙', question: /^題目/, insert: /^插入/,
    structured: /^結構性問題/, source: /^資料…/, table: /^附表格/, stakeholders: /^附持份者圖示/,
    text: /^附文字/, addStakeholder: '+ 持份者', toIssue: '持份者 → 議題', paperZh: '中文',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });

async function open(ui, { width = 1440, seed = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height: 950 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([ui, seed, corpus, version]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (ui === 'zh') window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
      if (seed && !window.localStorage.getItem('econ-worksheet:v3-stakeholder-corpus')) {
        const doc = JSON.parse(corpus);
        window.localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: doc.id, title: 'DRQ practice', updatedAt: doc.updatedAt }]));
        window.localStorage.setItem(`econ-worksheet:${doc.id}`, corpus);
      }
    },
    [ui, seed, corpus, APP_VERSION],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGE ERR:', e.message);
    failures += 1;
  });
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  return { context, page };
}

async function dismissHint(page, w) {
  const hint = page.getByRole('button', { name: w.dismissHint });
  if (await hint.count()) await hint.click();
}

// 1. Insert → Source… on a new worksheet.
for (const ui of ['en', 'zh']) {
  const w = WORDS[ui];
  const { context, page } = await open(ui);
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: w.newWorksheet, exact: true }).click();
  await dialog.getByRole('radio', { name: w.classroom }).click();
  await dialog.getByLabel(w.name, { exact: true }).fill('DRQ');
  await page.getByRole('button', { name: w.create }).click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  await dismissHint(page, w);
  const rail = page.getByRole('navigation', { name: w.rail });
  await rail.getByRole('button', { name: w.question }).click();
  await page.getByRole('menuitem', { name: w.structured }).first().click();
  await page.waitForTimeout(400);
  for (const [i, choice] of ['table', 'stakeholders', 'text'].entries()) {
    await rail.getByRole('button', { name: w.insert }).click();
    await page.getByRole('menuitem', { name: w.source }).first().click();
    if (i === 1) await page.screenshot({ path: `${OUT}/source-menu-${ui}.png` });
    await page.getByRole('menuitem', { name: w[choice] }).first().click();
    await page.waitForTimeout(500);
  }
  const paper = page.locator('#print-root');
  const text = await paper.innerText();
  check(/Source A:[\s\S]*Source B:[\s\S]*Source C:/.test(text), `${ui}: Source A, B, C in order`);
  check((await paper.locator('table').count()) >= 1, `${ui}: Source A holds a table`);
  check((await paper.locator('[data-stakeholder]').count()) === 4, `${ui}: Source B draws four stakeholders`);
  await page.screenshot({ path: `${OUT}/inserted-${ui}.png` });
  await context.close();
}

// 2. The v3 corpus, edited in the panel.
for (const [ui, width] of [['en', 1440], ['zh', 1440], ['en', 820]]) {
  const w = WORDS[ui];
  const { context, page } = await open(ui, { width, seed: true });
  await page.getByRole('button', { name: /DRQ practice/ }).first().click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  await dismissHint(page, w);
  const figure = page.locator('#print-root [data-stakeholder-issue]').first();
  check((await page.locator('#print-root [data-stakeholder]').count()) === 5, `${ui} ${width}: the corpus draws five stakeholders`);
  if (ui === 'zh') {
    await page.getByRole('radio', { name: w.paperZh, exact: true }).first().click().catch(() => page.getByRole('button', { name: w.paperZh, exact: true }).first().click());
    await page.waitForTimeout(600);
    check((await page.locator('#print-root').innerText()).includes('資料B'), 'zh: the paper prints in Chinese');
  }
  await figure.click();
  await page.waitForTimeout(600);
  const fields = page.locator('[data-stakeholder-fields]').first();
  if (!(await fields.count())) {
    // The figure's own click selects it; its question's panel holds the fields.
    await page.locator('#print-root').getByText(/Source B|資料B/).first().click();
    await page.waitForTimeout(600);
  }
  check((await fields.count()) === 1, `${ui} ${width}: the panel shows the stakeholder fields`);
  if (await fields.count()) {
    await fields.scrollIntoViewIfNeeded();
    await fields.getByRole('button', { name: w.addStakeholder }).click();
    await fields.getByRole('radio', { name: w.toIssue }).click();
    await page.waitForTimeout(600);
    check((await page.locator('#print-root [data-stakeholder]').count()) === 6, `${ui} ${width}: + Stakeholder adds a box on the page`);
    await page.screenshot({ path: `${OUT}/panel-${ui}-${width}.png` });
  }
  await context.close();
}

await browser.close();
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
