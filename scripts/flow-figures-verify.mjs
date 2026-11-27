import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The circular flow and the stage charts in a real Chrome (k-0588).
 *
 *   node scripts/flow-figures-verify.mjs [--url=http://localhost:3000] [--out=/tmp/flow-figures-verify]
 *
 * The frozen v4 flow corpus opened from the start screen, English UI with an English paper
 * and 中文 UI with a 中文 paper, at MacBook (1440) and iPad (1180) widths: the page draws the
 * money flows dashed with the key; a double-click opens the flow editor, whose Chart panel
 * shows the layout and the key; Flow X shows Dashed line ticked and Path "Loop over the
 * top", and unticking it takes one dash off the drawing; on the stage triangle (grid), a
 * drag of tertiary production onto secondary swaps them. Screenshots go to `--out`. Exits
 * non-zero if a check fails.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/flow-figures-verify');
mkdirSync(OUT, { recursive: true });
const corpus = readFileSync(new URL('../src/test/corpus/v4-flow-figures.json', import.meta.url), 'utf8');

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: { editor: 'Edit flow chart', layout: 'Layout', key: 'Key for dashed and solid lines', flowX: /^Flow X/, dashed: 'Dashed line', path: 'Path', above: 'Loop over the top', tertiary: 'Tertiary', secondary: 'Secondary', done: 'Done', households: 'Households' },
  zh: { editor: '編輯流程圖', layout: '排列', key: '虛線及實線的圖例', flowX: /^流量 X/, dashed: '虛線', path: '路線', above: '從上方繞過', tertiary: '三級生產', secondary: '二級生產', done: '完成', households: '住戶' },
};

const browser = await chromium.launch({ channel: 'chrome' });

async function open(ui, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([ui, corpus]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
      window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: ui === 'zh' ? 'zh-HK' : 'en', paper: ui === 'zh' ? 'zh' : 'en' }));
      if (!window.localStorage.getItem('econ-worksheet:v4-flow-figures-corpus')) {
        const doc = JSON.parse(corpus);
        window.localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: doc.id, title: 'MC practice: flow figures', updatedAt: doc.updatedAt }]));
        window.localStorage.setItem(`econ-worksheet:${doc.id}`, corpus);
      }
    },
    [ui, corpus],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /MC practice: flow figures|多項選擇題練習：流程圖/ }).first().click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  return { context, page, errors };
}

/** The page's diagrams (the big SVGs), top to bottom. */
const figures = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('#print-root svg')]
      .map((s) => ({ s, r: s.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 150 && r.height > 60)
      .map(({ s, r }) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 + window.scrollY, dashes: (s.outerHTML.match(/stroke-dasharray=/g) ?? []).length, text: s.textContent })),
  );

/** The flow editor's own drawing (the real SVG under the overlay). */
const CANVAS = 'div.fixed.inset-0.z-50 div.pointer-events-none.absolute.inset-0 > svg';
const canvasSvg = (page) => page.locator(CANVAS).first();

for (const width of [1440, 1180]) {
  for (const ui of ['en', 'zh']) {
    const w = WORDS[ui];
    const tag = `${ui}-${width}`;
    const { context, page, errors } = await open(ui, width);
    const figs = await figures(page);
    check(figs.length >= 4, `${tag}: the page draws the four flow figures (${figs.length})`);
    check(figs[0]?.dashes === 3, `${tag}: the circular flow has two dashed money flows and the key's dashed sample (${figs[0]?.dashes})`);
    check(figs[0]?.text.includes(w.households), `${tag}: the paper prints its own language`);
    await page.screenshot({ path: `${OUT}/page-${tag}.png`, fullPage: false });

    // The circular flow's editor.
    await page.evaluate((y) => window.scrollTo(0, y - 300), figs[0].y);
    const now = await figures(page);
    await page.mouse.dblclick(now[0].x, now[0].y - (await page.evaluate(() => window.scrollY)));
    const heading = page.getByText(w.editor, { exact: true });
    await heading.waitFor({ timeout: 15_000 });
    const panel = page.locator('.zone-dark.fixed aside').last();
    check(await panel.getByRole('combobox', { name: new RegExp(`^${w.layout}`) }).isVisible(), `${tag}: the Chart panel shows Layout`);
    check(await panel.getByLabel(w.key, { exact: true }).isChecked(), `${tag}: the key is ticked`);
    await page.screenshot({ path: `${OUT}/circular-editor-${tag}.png` });

    await panel.getByRole('button', { name: w.flowX }).first().click();
    const dashed = panel.getByLabel(w.dashed, { exact: true });
    check(await dashed.isChecked(), `${tag}: Flow X is dashed`);
    const path = panel.getByRole('combobox', { name: new RegExp(`^${w.path}`) });
    const pathText = await path.evaluate((el) => (el.tagName === 'SELECT' ? el.selectedOptions[0]?.textContent : el.textContent) ?? '');
    check(pathText.includes(w.above), `${tag}: Flow X loops over the top (${pathText.trim()})`);
    await page.screenshot({ path: `${OUT}/circular-arrow-${tag}.png` });
    const before = ((await canvasSvg(page).innerHTML()).match(/stroke-dasharray=/g) ?? []).length;
    await dashed.click();
    await page.waitForTimeout(300);
    const after = ((await canvasSvg(page).innerHTML()).match(/stroke-dasharray=/g) ?? []).length;
    check(after === before - 1, `${tag}: unticking Dashed line takes one dash off (${before} → ${after})`);
    await page.getByRole('button', { name: w.done, exact: true }).click();
    await page.waitForTimeout(600);

    // The stage triangle: a grid drag swaps two boxes.
    const figs2 = await figures(page);
    await page.evaluate((y) => window.scrollTo(0, y - 300), figs2[1].y);
    const now2 = await figures(page);
    await page.mouse.dblclick(now2[1].x, now2[1].y - (await page.evaluate(() => window.scrollY)));
    await heading.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/stages-editor-${tag}.png` });
    const box = async (word) => canvasSvg(page).locator('text', { hasText: word }).first().boundingBox({ timeout: 5000 });
    const t0 = await box(w.tertiary);
    const s0 = await box(w.secondary);
    await page.mouse.move(t0.x + t0.width / 2, t0.y + t0.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 12; i += 1) {
      await page.mouse.move(t0.x + t0.width / 2 + ((s0.x - t0.x) * i) / 12, t0.y + t0.height / 2 + ((s0.y - t0.y) * i) / 12);
    }
    await page.mouse.up();
    await page.waitForTimeout(400);
    const t1 = await box(w.tertiary);
    const s1 = await box(w.secondary);
    check(t1.x < s1.x && Math.abs(t1.y - s1.y) < 4, `${tag}: dragging tertiary onto secondary swaps them in the grid`);
    await page.screenshot({ path: `${OUT}/stages-swapped-${tag}.png` });
    check(errors.length === 0, `${tag}: no page error (${errors.join(' | ')})`);
    await context.close();
  }
}

await browser.close();
console.log(failures ? `${failures} failed` : 'all passed');
process.exit(failures ? 1 : 0);
