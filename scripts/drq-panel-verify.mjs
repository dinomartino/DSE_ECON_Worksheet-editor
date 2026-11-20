import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The DRQ flow in the right panel, in a real Chrome (k-0474).
 *
 *   node scripts/drq-panel-verify.mjs [--url=http://localhost:3000] [--out=/tmp/drq-panel-verify] [--theme=dark]
 *
 * For English at MacBook width (1440) and 中文 at iPad width (820):
 * 1. A new worksheet, Question → Structured, then the panel's "Start a DRQ": the page
 *    shows Sources A–D and parts (a)–(e); the panel shows four source cards and five parts.
 * 2. Clicking Source B's caption on the page: the "where am I" line names Source B, and
 *    Source B's card wears the selection ring.
 * 3. Part (c)'s Refer to toggles rewrite its opening sentence on the page.
 * 4. Add → Source ▾ → People's views: a Source E card appears and is selected.
 * 5. Clicking part (a)'s line on the page: only part (a)'s card wears the ring (k-0477).
 * 6. Clicking a cell of Source A's table on the page: its 表格 / Table box in the panel is
 *    the marked field.
 * After 2, 3 and 5, the chip text and muted text on every open kind's tints (the selected
 * card's deeper header too) must reach AA, 4.5:1, in the theme under test (k-0477).
 * After 2, 5 and 6, the marked field has no bar down its left edge, but a 1px outline all
 * round at 3:1 against its tint and against what is around it (u-ifkm, k-0477).
 * Screenshots of each step go to `--out` (plus `3-part-…`, part (c)'s card alone), in
 * `--theme` (any id in `settings/appearance.ts`; default the system's, light here).
 * Exits non-zero if a check fails.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/drq-panel-verify');
const THEME = opt('theme', '');
mkdirSync(OUT, { recursive: true });
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: {
    newWorksheet: 'New worksheet', classroom: /^Classroom worksheet/, name: 'Name', create: /Create worksheet/,
    dismissHint: 'Dismiss hint', rail: 'Add to worksheet', question: /^Question/, structured: /^Structured/,
    start: 'Start a DRQ', sourceB: 'Source B', where: 'You are editing', referA: 'Source A',
    addSource: 'Add a source: pick what it holds', views: /^People's views/, sourceE: 'Source E',
    partC: /Part \(c\) actions|\(c\)/,
  },
  zh: {
    newWorksheet: '新增工作紙', classroom: /^課堂工作紙/, name: '名稱', create: /建立工作紙/,
    dismissHint: '關閉提示', rail: '插入至工作紙', question: /^題目/, structured: /^結構性問題/,
    start: '建立資料回應題', sourceB: '資料 B', where: '正在編輯', referA: '資料A',
    addSource: '加入資料：選擇內容類型', views: /^各方意見/, sourceE: '資料 E',
  },
};

/** Text on every open kind's tints, the selected card's too, at AA (4.5:1) in this theme. */
async function checkContrast(page, where) {
  const contrast = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      return [...ctx.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    const lum = (c) =>
      c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => {
      const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const muted = getComputedStyle(document.documentElement).getPropertyValue('--ink-muted');
    const worst = {};
    for (const card of document.querySelectorAll('[data-panel-kind]')) {
      const pairs = [[muted, getComputedStyle(card).backgroundColor]];
      const chip = card.querySelector('.panel-kind-chip');
      if (chip) pairs.push([getComputedStyle(chip).color, getComputedStyle(chip).backgroundColor]);
      const head = card.querySelector(':scope > .panel-kind-head');
      if (head) pairs.push([muted, getComputedStyle(head).backgroundColor]);
      for (const [fg, bg] of pairs) worst[card.dataset.panelKind] = Math.min(worst[card.dataset.panelKind] ?? 99, ratio(fg, bg));
    }
    return worst;
  });
  const lowest = Object.entries(contrast).map(([k, r]) => `${k} ${r.toFixed(2)}`).join(', ');
  check(Object.values(contrast).every((r) => r >= 4.5), `${where}: panel text is AA on every kind's tint (${lowest})`);
}

/** The marked field: no bar, a 1px outline all round, 3:1 inside and out (u-ifkm). */
async function checkField(page, where) {
  const field = await page.evaluate(() => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgba = (css) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    };
    const over = (top, under) => top.slice(0, 3).map((v, i) => v * top[3] + under[i] * (1 - top[3]));
    /** What `el` paints on: its ancestors' backgrounds composited from the page down. */
    const behind = (el) => {
      const chain = [];
      for (let node = el; node; node = node.parentElement) chain.unshift(rgba(getComputedStyle(node).backgroundColor));
      return chain.reduce((under, top) => over(top, under), [255, 255, 255]);
    };
    const lum = (c) =>
      c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
    const ratio = (a, b) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
      return (x + 0.05) / (y + 0.05);
    };
    const marked = [...document.querySelectorAll('[data-edit-current]')].filter((el) => !el.matches('[data-panel-kind]'));
    if (marked.length !== 1) return { count: marked.length };
    const el = marked[0];
    const style = getComputedStyle(el);
    const bar = getComputedStyle(el, '::before');
    const line = over(rgba(style.outlineColor), behind(el));
    return {
      count: 1,
      target: el.getAttribute('data-edit-target'),
      bar: bar.content !== 'none' && bar.display !== 'none',
      outline: `${style.outlineStyle} ${style.outlineWidth}`,
      inside: ratio(line, behind(el)),
      outside: ratio(line, behind(el.parentElement)),
    };
  });
  if (field.count !== 1) {
    check(false, `${where}: one field is marked (${field.count})`);
    return;
  }
  check(!field.bar, `${where}: the marked field (${field.target}) has no bar down its edge`);
  check(field.outline === 'solid 1px', `${where}: the marked field is outlined all round (${field.outline})`);
  check(
    field.inside >= 3 && field.outside >= 3,
    `${where}: its outline is 3:1 on its tint and around it (${field.inside.toFixed(2)}, ${field.outside.toFixed(2)})`,
  );
}

const browser = await chromium.launch({ channel: 'chrome' });

for (const [ui, width] of [['en', 1440], ['zh', 820]]) {
  const w = WORDS[ui];
  const context = await browser.newContext({ viewport: { width, height: ui === 'zh' ? 1180 : 950 }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([ui, version, theme]) => {
      window.localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (theme) window.localStorage.setItem('econgen.settings.appearance', JSON.stringify({ v: 1, theme }));
      if (ui === 'zh') window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'zh' }));
    },
    [ui, APP_VERSION, THEME],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => {
    console.log('PAGE ERR:', e.message);
    failures += 1;
  });
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: w.newWorksheet, exact: true }).click();
  await dialog.getByRole('radio', { name: w.classroom }).click();
  await dialog.getByLabel(w.name, { exact: true }).fill('DRQ');
  await page.getByRole('button', { name: w.create }).click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  const hint = page.getByRole('button', { name: w.dismissHint });
  if (await hint.count()) await hint.click();

  // 1. A structured question, then the panel's DRQ starter.
  const rail = page.getByRole('navigation', { name: w.rail });
  await rail.getByRole('button', { name: w.question }).click();
  await page.getByRole('menuitem', { name: w.structured }).first().click();
  await page.waitForTimeout(500);
  const panel = page.locator('[data-panel-kind="stem"]').first().locator('xpath=ancestor::*[contains(@class,"overflow-y-auto")][1]');
  await page.screenshot({ path: `${OUT}/0-blank-${ui}-${width}.png` });
  const start = page.getByRole('button', { name: w.start });
  check((await start.count()) === 1, `${ui} ${width}: a blank question offers the DRQ starter`);
  await start.click();
  await page.waitForTimeout(700);
  const paperText = await page.locator('#print-root').innerText();
  const letters = ui === 'en' ? ['Source A', 'Source B', 'Source C', 'Source D'] : ['資料A', '資料B', '資料C', '資料D'];
  check(letters.every((l) => paperText.includes(l)), `${ui} ${width}: the page shows Sources A–D`);
  check(/\(e\)/.test(paperText), `${ui} ${width}: the page shows parts up to (e)`);
  check((await page.locator('[data-panel-kind="source"]').count()) === 4, `${ui} ${width}: the panel shows four source cards`);
  check((await page.locator('[data-panel-kind="part"]').count()) === 5, `${ui} ${width}: the panel shows five part cards`);
  check((await start.count()) === 0, `${ui} ${width}: the starter is gone once used`);
  await page.screenshot({ path: `${OUT}/1-drq-${ui}-${width}.png` });

  // 2. Source B's caption on the page → the panel says where.
  await page.locator('#print-root').getByText(ui === 'en' ? 'Source B:' : '資料B：').first().click();
  await page.waitForTimeout(700);
  const where = page.getByRole('navigation', { name: w.where });
  check((await where.count()) === 1 && (await where.innerText()).includes(w.sourceB), `${ui} ${width}: "where am I" names ${w.sourceB}`);
  const ringed = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('[data-panel-kind]')];
    return cards.filter((card) => getComputedStyle(card).boxShadow !== 'none').map((card) => card.querySelector('.panel-kind-chip')?.textContent);
  });
  check(ringed.length === 1 && ringed[0]?.includes(w.sourceB.slice(-1)), `${ui} ${width}: only Source B's card is ringed (${ringed.join(', ')})`);
  await page.screenshot({ path: `${OUT}/2-where-${ui}-${width}.png` });
  await checkContrast(page, `${ui} ${width}`);
  await checkField(page, `${ui} ${width}, Source B's label`);

  // 3. Part (c): Refer to A as well as C and D.
  const partC = page.locator('[data-panel-kind="part"]').nth(2);
  await partC.locator('button[aria-expanded]').first().click();
  await page.waitForTimeout(400);
  await partC.getByRole('button', { name: w.referA, exact: true }).click();
  await page.waitForTimeout(600);
  const after = await page.locator('#print-root').innerText();
  check(
    ui === 'en' ? after.includes('Refer to Sources A, C and D.') : after.includes('參閱資料A、C及D。'),
    `${ui} ${width}: Refer to rewrites (c)'s opening sentence`,
  );
  await partC.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${OUT}/3-refer-${ui}-${width}.png` });
  await partC.screenshot({ path: `${OUT}/3-part-${ui}-${width}.png` });
  await checkContrast(page, `${ui} ${width}, part (c) open`);

  // 4. Add → Source ▾ → People's views.
  const stem = page.locator('[data-panel-kind="stem"]').first();
  // Settled first: the menu closes on any scroll, and the panel may still be moving.
  const addSource = stem.getByRole('button', { name: w.addSource }).last();
  await addSource.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await addSource.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/4a-source-menu-${ui}-${width}.png` });
  await page.getByRole('menuitem', { name: w.views }).click();
  await page.waitForTimeout(800);
  const cards = await page.locator('[data-panel-kind="source"] .panel-kind-chip').allInnerTexts();
  check(cards.includes(w.sourceE), `${ui} ${width}: Add → Source → views adds ${w.sourceE} (${cards.join(', ')})`);
  await page.screenshot({ path: `${OUT}/4-add-views-${ui}-${width}.png` });

  // 5. Part (a)'s line on the page → part (a)'s card is the one ringed (k-0477).
  await page.locator('#print-root').getByText(ui === 'en' ? 'Refer to Source A.' : '參閱資料A。').first().click();
  await page.waitForTimeout(700);
  await page.locator('[data-panel-kind="part"]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const ringedPart = await page.evaluate(() =>
    [...document.querySelectorAll('[data-panel-kind]')]
      .filter((card) => getComputedStyle(card).boxShadow !== 'none')
      .map((card) => card.querySelector('.panel-kind-chip')?.textContent),
  );
  check(ringedPart.length === 1 && ringedPart[0] === '(a)', `${ui} ${width}: the part you are in, (a), is the one ringed (${ringedPart.join(', ')})`);
  await page.screenshot({ path: `${OUT}/5-in-part-a-${ui}-${width}.png` });
  await checkContrast(page, `${ui} ${width}, in part (a)`);
  await checkField(page, `${ui} ${width}, part (a)'s line`);

  // 6. A cell of Source A's table on the page → its table box in the panel is marked.
  // The format toolbar from step 5 can sit over the cell at iPad width: away with it first.
  await page.keyboard.press('Escape');
  // At iPad width the page fits at under 20%, too small to hit a cell: zoom in first.
  const zoomIn = page.getByRole('button', { name: ui === 'en' ? 'Zoom in' : '放大', exact: true });
  for (let i = 0; i < 24 && (await zoomIn.isEnabled()) && (await page.locator('#print-root td').first().boundingBox()).height < 22; i += 1) {
    await zoomIn.click();
    await page.waitForTimeout(250);
  }
  const cell = page.locator('#print-root td').first();
  await cell.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(300);
  // Upper quarter, near the left: the row and column resize handles lie on the right and
  // bottom edges.
  const box = await cell.boundingBox();
  await cell.click({ position: { x: Math.min(12, box.width / 3), y: box.height / 4 } });
  await page.waitForTimeout(1000);
  const marked = page.locator('[data-edit-current]:not([data-panel-kind])');
  await marked.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await checkField(page, `${ui} ${width}, a table cell`);
  await page.screenshot({ path: `${OUT}/6-table-${ui}-${width}.png` });
  await marked.locator('xpath=ancestor::*[@data-panel-kind][1]').screenshot({ path: `${OUT}/6-table-card-${ui}-${width}.png` });
  void panel;
  await context.close();
}

await browser.close();
console.log(failures === 0 ? 'all checks passed' : `${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
