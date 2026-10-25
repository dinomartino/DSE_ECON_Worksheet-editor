import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser the Word-like follow-ups of k-0201, on
 * `test-fixtures/manual/word-typing-mix.json`, in English and 繁體中文 interfaces, at MacBook
 * (1512×950), iPad (820×1180) and iPhone (390×844) sizes:
 *
 *  - save: ⌘S and Ctrl+S save at once (before autosave would), the bar says "Saved" for a moment,
 *    and the browser's own "Save page as…" never runs, with a text open on the page or not;
 *  - insert: the rail's second menu is Insert (插入), Table… and Picture… lead it and land in the
 *    selected question, "Answer lines…" is one entry with ruled, dotted and to-the-end choices,
 *    and a question's panel says "Question text" (題幹 in 中文);
 *
 *   node scripts/word-like-verify.mjs [--part=save] [--out=/tmp/word-like-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (CHROME, default
 * /opt/google/chrome/chrome). Every key is a real input event.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/word-like-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const PARTS = opt('part', 'all').split(',');
const wants = (part) => PARTS.includes('all') || PARTS.includes(part);
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Word typing mix';
const STEM_ID = document_.questions[0].blocks[0].id;

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

const WORDS = {
  en: {
    saved: 'Saved',
    insert: 'Insert',
    rail: /^Insert\s*插入$/,
    table: 'Table…',
    picture: 'Picture…',
    answerLines: 'Answer lines…',
    choices: ['Ruled lines', 'Dotted lines', 'Dotted to page end'],
    questionText: 'Question text',
    into: 'into Q2',
  },
  'zh-HK': {
    saved: '已儲存',
    insert: '插入',
    rail: /^插入\s*表格・圖片$/,
    table: '表格…',
    picture: '圖片…',
    answerLines: '答題線…',
    choices: ['橫線', '點線', '點線至頁尾'],
    questionText: '題幹',
    into: '加入 Q2',
  },
};
const PICTURE = new URL('../src-tauri/icons/64x64.png', import.meta.url).pathname;
const SIZES = {
  mac: { width: 1512, height: 950 },
  ipad: { width: 820, height: 1180 },
  iphone: { width: 390, height: 844 },
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', ...(chromePath ? { executablePath: chromePath } : {}) });

/** A fresh context with the fixture saved and the interface in `ui`, opened in the editor. */
async function openFixture(ui, size) {
  const context = await browser.newContext({ viewport: SIZES[size], hasTouch: size !== 'mac' });
  await context.addInitScript(
    ([version, language, indexJson, key, body]) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, body);
      }
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return { context, page, errors };
}

const stored = (page) => page.evaluate((key) => window.localStorage.getItem(key) ?? '', `econ-worksheet:${document_.id}`);

async function verifySave(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const w = WORDS[ui];
  const { context, page, errors } = await openFixture(ui, size);
  try {
    // Record whether anything let the browser have the key: a capture listener added after the
    // app's sees `defaultPrevented` as the app left it.
    await page.evaluate(() => {
      window.__saveKeys = [];
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's' && (e.metaKey || e.ctrlKey)) window.__saveKeys.push(e.defaultPrevented);
      }, true);
    });
    const status = page.locator('[data-save-state]');

    // On an iPhone the sidebar lies over the page (k-0197), so the text is typed where the page
    // shows; an iPhone rarely has a keyboard, so there the keys are proved with nothing open.
    const stemShows = await page.evaluate((key) => {
      const el = document.querySelector(`#print-root [data-field-key="${key}"][data-field-side="en"]`);
      const r = el?.getBoundingClientRect();
      return Boolean(r && el.contains(document.elementFromPoint(r.x + 4, r.y + r.height / 2)));
    }, `blockText:${STEM_ID}`);
    for (const chord of stemShows ? ['Control+s', 'Meta+s'] : []) {
      const marker = `Saved by ${chord} ${Math.random().toString(36).slice(2, 6)}`;
      // A text typed into the stem: one click, type, and save while the field is still open.
      const stem = page.locator(`#print-root [data-field-key="blockText:${STEM_ID}"][data-field-side="en"]`).first();
      const box = await stem.boundingBox();
      await page.mouse.click(box.x + 4, box.y + box.height / 2);
      await page.keyboard.type(`${marker} `, { delay: 0 });
      await page.keyboard.press(chord);
      await page.waitForTimeout(250);
      // 250 ms is well inside autosave's 1.2 s debounce: only the key can have written it.
      check(`[${tag}] ${chord} with a text open writes the paper at once`, (await stored(page)).includes(marker));
      const word = await status.innerText();
      const shown = await status.locator('span').nth(1).evaluate((el) => !el.classList.contains('sr-only'));
      check(`[${tag}] … and the bar says "${w.saved}"`, word.trim() === w.saved && shown, `${word} shown=${shown}`);
      const field = await page.evaluate(() => document.activeElement?.getAttribute('contenteditable'));
      check(`[${tag}] … and the text stays open`, field === 'true', String(field));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(2300);
      const hidden = await status.locator('span').nth(1).evaluate((el) => el.classList.contains('sr-only'));
      check(`[${tag}] … then "${w.saved}" goes back to a quiet dot`, hidden);
    }

    // Nothing open: still Save now, and never the browser's.
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(200);
    check(`[${tag}] Ctrl+S with nothing open says "${w.saved}" too`, (await status.innerText()).trim() === w.saved);
    const keys = await page.evaluate(() => window.__saveKeys);
    const presses = stemShows ? 3 : 1;
    check(`[${tag}] the browser never had ⌘S / Ctrl+S (${keys.length} presses)`, keys.length === presses && keys.every(Boolean), JSON.stringify(keys));
    await page.screenshot({ path: `${OUT}/save-${tag}.png` });
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

async function verifyInsert(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const w = WORDS[ui];
  const { context, page, errors } = await openFixture(ui, size);
  try {
    const q2Blocks = () =>
      page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).questions[1].blocks.map((b) => b.kind), `econ-worksheet:${document_.id}`);
    const layoutKinds = () =>
      page.evaluate((key) => (JSON.parse(window.localStorage.getItem(key)).layout ?? []).map((e) => e.kind), `econ-worksheet:${document_.id}`);
    const rail = page.getByRole('button', { name: w.rail });
    check(`[${tag}] the rail's second menu is "${w.insert}"`, (await rail.count()) === 1, String(await rail.count()));

    // Select Q2: its row in the Content list (the page is covered by the sidebar on an iPhone).
    const q2Row = page.getByRole('button').filter({ hasText: 'Which of the following' }).first();
    await q2Row.click();
    await page.waitForTimeout(300);

    await rail.click();
    const items = page.getByRole('menuitem');
    const names = await items.allInnerTexts();
    check(`[${tag}] Table… and Picture… lead the menu`, names[0]?.startsWith(w.table) && names[1]?.startsWith(w.picture), JSON.stringify(names.slice(0, 3)));
    check(`[${tag}] … and say they go ${w.into}`, names[0]?.includes(w.into) && names[1]?.includes(w.into), JSON.stringify(names.slice(0, 2)));
    const lines = names.filter((n) => n.startsWith(w.answerLines));
    const oldLines = names.filter((n) => /Answer space|答題空間/.test(n));
    check(`[${tag}] one "${w.answerLines}" entry, no separate answer-space rows`, lines.length === 1 && oldLines.length === 0, JSON.stringify(names));
    await page.screenshot({ path: `${OUT}/insert-menu-${tag}.png` });

    // Table…: Word's grid, then a 2 × 3 table at the end of Q2's text.
    const before = await q2Blocks();
    await items.filter({ hasText: w.table }).click();
    const grid = page.locator('[role="grid"], [data-table-size-grid]').first();
    const cells = page.locator('[data-table-size-cell], [role="gridcell"]');
    if ((await cells.count()) > 0) {
      await page.screenshot({ path: `${OUT}/insert-table-grid-${tag}.png` });
      await cells.nth(5 + 2).hover(); // row 2, column 3 of a 5-wide grid
      await cells.nth(5 + 2).click();
    } else {
      check(`[${tag}] the table grid opens`, false, String(await grid.count()));
    }
    await page.waitForTimeout(1600);
    const afterTable = await q2Blocks();
    check(`[${tag}] Table… adds a table at the end of Q2's text`, afterTable.length === before.length + 1 && afterTable.at(-1) === 'table', JSON.stringify(afterTable));

    // Picture…: the file chooser, then a picture in Q2.
    await rail.click();
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('menuitem').filter({ hasText: w.picture }).click();
    await (await chooser).setFiles(PICTURE);
    await page.waitForTimeout(1800);
    const afterPicture = await q2Blocks();
    check(`[${tag}] Picture… adds the chosen picture to Q2`, afterPicture.length === afterTable.length + 1 && afterPicture.at(-1) === 'image', JSON.stringify(afterPicture));

    // Answer lines…: three choices; Ruled lines adds ruled lines.
    await rail.click();
    await page.getByRole('menuitem').filter({ hasText: w.answerLines }).click();
    const choiceNames = await page.getByRole('menuitem').allInnerTexts();
    check(`[${tag}] "${w.answerLines}" offers ${w.choices.join(' · ')}`, w.choices.every((c) => choiceNames.some((n) => n.startsWith(c))), JSON.stringify(choiceNames));
    await page.screenshot({ path: `${OUT}/insert-answer-lines-${tag}.png` });
    const kindsBefore = await layoutKinds();
    await page.getByRole('menuitem').filter({ hasText: new RegExp(`^${w.choices[0]}`) }).click();
    await page.waitForTimeout(1600);
    const kindsAfter = await layoutKinds();
    check(`[${tag}] ${w.choices[0]} adds ruled lines`, kindsAfter.filter((k) => k === 'answerLines').length === kindsBefore.filter((k) => k === 'answerLines').length + 1, JSON.stringify(kindsAfter));

    // A question's panel: "Question text", not "Stem".
    await q2Row.click();
    await page.waitForTimeout(400);
    const editTab = page.getByRole('tab', { name: ui === 'en' ? 'Edit' : '編輯' });
    if (await editTab.count()) await editTab.first().click();
    await page.waitForTimeout(400);
    const panel = await page.locator('aside, [role="tabpanel"]').allInnerTexts();
    const joined = panel.join('\n');
    check(`[${tag}] the question's panel says "${w.questionText}"`, joined.includes(w.questionText) && !/\bStem\b/.test(joined), joined.slice(0, 200));
    await page.screenshot({ path: `${OUT}/insert-panel-${tag}.png` });
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

try {
  for (const ui of ['en', 'zh-HK']) {
    for (const size of Object.keys(SIZES)) {
      console.log(`\n— ${ui} · ${size}`);
      if (wants('save')) await verifySave(ui, size);
      if (wants('insert')) await verifyInsert(ui, size);
    }
  }
} finally {
  await browser.close();
  devServer?.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
