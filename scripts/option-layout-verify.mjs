import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that Setup → Option layout for all MC questions does what it says, in
 * English and in 繁體中文, on `test-fixtures/manual/option-layout-mix.json`: the four buttons, the
 * line saying how the paper stands, the result notice and its Undo, what the page and the page
 * rail's thumbnails then draw, and what a second click on the same choice says.
 *
 *   node scripts/option-layout-verify.mjs [--out=/tmp/option-layout-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not already serving, and stops it again. Needs
 * Chrome (playwright's `channel: 'chrome'`). The `.docx`, the clipboard and the cards are
 * proved by the unit tests (`src/registry/mcqLayoutsSurfaces.test.tsx`) and `npm run samples`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/option-layout-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const FIXTURE = new URL('../test-fixtures/manual/option-layout-mix.json', import.meta.url);
const fixtureText = readFileSync(FIXTURE, 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Option layout mix';

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
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Everything the two interface languages say differently. */
const WORDS = {
  en: {
    setup: /^Setup/,
    block: 'Option layout for all MC questions',
    fit: 'Fit each question',
    stacked: 'All stacked',
    inline: 'All in a row',
    columns2: 'All 2 columns',
    undo: 'Undo',
    now: (s, i, c) => `Now: ${[s && `${s} stacked`, i && `${i} in a row`, c && `${c} in two columns`].filter(Boolean).join(' · ')}`,
    changed: (n, t) => `Changed ${n} of ${t} MC questions.`,
    figures: 'Left as they are: 1 figure question, which can’t go in a row.',
    nothing: 'Nothing to change: every MC question already has this layout.',
    nothingFit: 'Nothing to change: every MC question already has the layout that fits its options.',
  },
  'zh-HK': {
    setup: /^頁面設定/,
    block: '全部 MC 題的選項排列',
    fit: '配合各題內容',
    stacked: '全部直列',
    inline: '全部橫列',
    columns2: '全部兩欄',
    undo: '復原',
    now: (s, i, c) => `目前：${[s && `${s} 題直列`, i && `${i} 題橫列`, c && `${c} 題兩欄`].filter(Boolean).join(' · ')}`,
    changed: (n, t) => `已更改 ${n} 題（共 ${t} 題 MC）。`,
    figures: '維持不變：1 題圖形選項題，圖形選項不能橫列。',
    nothing: '沒有需要更改：每題 MC 都已是這個排列。',
    nothingFit: '沒有需要更改：每題 MC 都已採用配合選項內容的排列。',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
    // The paper is put in storage as a saved document and opened from the start screen, so the
    // run does not depend on the interface language's wording of that screen.
    await context.addInitScript(
      ([version, language, indexJson, key, body]) => {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, body);
      },
      [
        APP_VERSION,
        ui,
        JSON.stringify([{ id: document_.id, title: TITLE, updatedAt: document_.updatedAt }]),
        `econ-worksheet:${document_.id}`,
        fixtureText,
      ],
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
    await page.waitForTimeout(2500);

    /** How each of the four MC questions prints, read off the page: stacked, row, 2 columns or grid. */
    const printed = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#print-root [data-flow-id]')]
          .map((el) => {
            const stacked = el.querySelectorAll('p[data-page-target^="mcqOption:"]').length;
            if (stacked > 0) return 'stacked';
            if (el.querySelectorAll('[style*="25%"]').length > 0) return 'row';
            if (el.querySelectorAll('[style*="50%"]').length > 0) return '2 columns';
            if (el.querySelectorAll('.items-start').length > 0) return 'grid';
            return undefined;
          })
          .filter(Boolean),
      );
    /** The same, read off the page rail's thumbnail clones. */
    const railRows = () =>
      page.evaluate(() => {
        const rail = [...document.querySelectorAll('button[draggable="true"]')];
        return {
          cards: rail.length,
          row: rail.reduce((n, card) => n + card.querySelectorAll('[style*="25%"]').length, 0),
          pairs: rail.reduce((n, card) => n + card.querySelectorAll('[style*="50%"]').length, 0),
        };
      });

    const START = ['2 columns', '2 columns', 'stacked', 'stacked'];
    check(`[${tag}] the fixture opens with its two hand-set layouts (Q2’s row is too long, so it prints in 2 columns)`, same(await printed(), START), JSON.stringify(await printed()));

    // Open Document setup.
    await page.getByRole('button', { name: w.setup }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const group = dialog.getByRole('group', { name: w.block });
    await group.scrollIntoViewIfNeeded();
    check(`[${tag}] the block offers four buttons`, (await group.getByRole('button').allTextContents()).join('|') === [w.fit, w.stacked, w.inline, w.columns2].join('|'), (await group.getByRole('button').allTextContents()).join('|'));
    const now = async () =>
      (await dialog.locator('p[aria-live="polite"]', { hasText: ui === 'en' ? /^Now:/ : /^目前/ }).first().textContent())?.trim();
    check(`[${tag}] it says how the paper stands`, (await now()) === w.now(2, 1, 1), String(await now()));
    await page.screenshot({ path: `${OUT}/${tag}-setup.png` });

    const click = async (label) => {
      await group.getByRole('button', { name: label, exact: true }).click();
      await page.waitForTimeout(700);
    };
    const bodyOf = async (text) => (await dialog.getByText(text, { exact: true }).count()) > 0;

    // 1. Fit each question.
    await click(w.fit);
    check(`[${tag}] Fit each question: a row, 2 columns, stacked, and the diagrams in a grid`, same(await printed(), ['row', '2 columns', 'stacked', 'grid']), JSON.stringify(await printed()));
    check(`[${tag}] … and says it changed 3 of 4`, await bodyOf(w.changed(3, 4)));
    check(`[${tag}] … and the line follows`, (await now()) === w.now(1, 1, 2), String(await now()));
    const fitted = await railRows();
    check(`[${tag}] … and the page rail’s thumbnails draw the row and the pairs too`, fitted.row >= 3 && fitted.pairs >= 2, JSON.stringify(fitted));
    await page.screenshot({ path: `${OUT}/${tag}-fit.png` });

    // 2. Its Undo puts every layout back.
    await dialog.getByRole('button', { name: w.undo, exact: true }).click();
    await page.waitForTimeout(700);
    check(`[${tag}] its Undo puts all four back in one step`, same(await printed(), START) && (await now()) === w.now(2, 1, 1), JSON.stringify(await printed()));

    // 3. All in a row: figure options stay, a long row prints in a grid.
    await click(w.inline);
    check(`[${tag}] All in a row: a row where it fits, the fallbacks where it does not, figures untouched`, same(await printed(), ['row', '2 columns', 'grid', 'stacked']), JSON.stringify(await printed()));
    check(`[${tag}] … says 2 of 4 changed`, await bodyOf(w.changed(2, 4)));
    check(`[${tag}] … and why the figure question stayed`, await bodyOf(w.figures));
    await page.screenshot({ path: `${OUT}/${tag}-inline.png` });

    // 4. All 2 columns.
    await click(w.columns2);
    check(`[${tag}] All 2 columns: pairs, then a grid for the sentences and the diagrams`, same(await printed(), ['2 columns', '2 columns', 'grid', 'grid']), JSON.stringify(await printed()));
    check(`[${tag}] … says 4 of 4 changed, with no figure remark`, (await bodyOf(w.changed(4, 4))) && !(await bodyOf(w.figures)));

    // 5. All stacked, twice: the second has nothing to do, and says so.
    await click(w.stacked);
    check(`[${tag}] All stacked: one option to a line everywhere`, same(await printed(), ['stacked', 'stacked', 'stacked', 'stacked']), JSON.stringify(await printed()));
    check(`[${tag}] … and the line says 4 stacked`, (await now()) === w.now(4, 0, 0), String(await now()));
    await click(w.stacked);
    check(`[${tag}] All stacked again says there is nothing to change`, await bodyOf(w.nothing));

    // 6. ⌘Z undoes a click as one step too (focus is on the page, not in a field).
    await click(w.columns2);
    await page.keyboard.press('Escape'); // close the dialog
    await dialog.waitFor({ state: 'detached' });
    check(`[${tag}] after closing Setup the page keeps the choice`, same(await printed(), ['2 columns', '2 columns', 'grid', 'grid']));
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(700);
    check(`[${tag}] one ⌘Z takes the whole click back`, same(await printed(), ['stacked', 'stacked', 'stacked', 'stacked']), JSON.stringify(await printed()));
    await page.keyboard.press('Control+Shift+z');
    await page.waitForTimeout(700);
    check(`[${tag}] and Redo puts it back`, same(await printed(), ['2 columns', '2 columns', 'grid', 'grid']), JSON.stringify(await printed()));

    // 7. Fit twice: the second has nothing to do.
    await page.getByRole('button', { name: w.setup }).first().click();
    await dialog.waitFor();
    await group.scrollIntoViewIfNeeded();
    await click(w.fit);
    await click(w.fit);
    check(`[${tag}] Fit each question again says there is nothing to change`, await bodyOf(w.nothingFit));
    await page.screenshot({ path: `${OUT}/${tag}-fit-again.png` });

    await context.close();
  }
  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
