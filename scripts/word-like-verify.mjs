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
 *  - paste: Word's HTML pasted into a text keeps bold, italic, underline and sub/superscript and
 *    drops fonts, sizes and colours; pasted MC questions bring the "Make these into questions"
 *    bar, which takes the text back and adds the questions in one undo; a pasted picture goes
 *    into the selected question (real ⌘V / Ctrl+V on the system clipboard; MacBook and iPad);
 *  - command: ⌘K / Ctrl+K (and the top bar's 🔍) opens the command search, also with a text open;
 *    "font" opens Setup at Fonts, "page break" adds a New page, "table" opens the Insert menu's
 *    size grid, "print" opens Export on PDF, in both languages; Esc closes it;
 *  - sample: "Open a sample paper" on an empty start screen, in the start panel and on an empty
 *    paper opens a new, filled, bilingual Classroom worksheet, hidden from the 題庫;
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
  const context = await browser.newContext({
    viewport: SIZES[size],
    hasTouch: size !== 'mac',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
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
    const q2Row = page.locator('button:not([aria-label])').filter({ hasText: 'Which of the following' }).first();
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

const MC_TEXT = readFileSync(new URL('../src/import/fixtures/01-word-plain-mc.txt', import.meta.url), 'utf8');
const WORD_HTML =
  '<html><body><!--StartFragment--><p class=MsoNormal><span style="font-family:Arial;font-size:20pt;color:#C00000">' +
  'when </span><b><span style="font-family:Arial">demand</span></b><span> rises to </span><i>Q</i><sub>1</sub>' +
  '<span> at P</span><sup>2</sup></p><!--EndFragment--></body></html>';
const PASTE_WORDS = {
  en: { found: /looks like \d+ questions/, make: 'Make these into questions' },
  'zh-HK': { found: /看來是 \d+ 條題目/, make: '轉為題目' },
};

async function toClipboard(page, items) {
  await page.evaluate(async (entries) => {
    const parts = {};
    for (const [type, data, base64] of entries) {
      parts[type] = base64
        ? new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], { type })
        : new Blob([data], { type });
    }
    await navigator.clipboard.write([new ClipboardItem(parts)]);
  }, items);
}

async function verifyPaste(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const w = PASTE_WORDS[ui];
  const { context, page, errors } = await openFixture(ui, size);
  const doc = () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), `econ-worksheet:${document_.id}`);
  const settle = (ms = 1600) => page.waitForTimeout(ms);
  try {
    const stem = page.locator(`#print-root [data-field-key="blockText:${STEM_ID}"][data-field-side="en"]`).first();
    const clickEnd = async () => {
      const box = await stem.boundingBox();
      await page.mouse.click(box.x + 4, box.y + box.height / 2);
      await page.keyboard.press('End');
    };

    // 1. Word's HTML into a text: emphasis kept, fonts/sizes/colours dropped.
    await clickEnd();
    await toClipboard(page, [['text/html', WORD_HTML], ['text/plain', 'when demand rises to Q1 at P2']]);
    await page.keyboard.press('ControlOrMeta+v');
    await page.keyboard.press('Escape');
    await settle();
    const runs = (await doc()).questions[0].blocks[0].text.en;
    const find = (word) => runs.find((run) => run.text.includes(word));
    check(`[${tag}] pasted bold stays bold`, find('demand')?.bold === true, JSON.stringify(runs));
    check(`[${tag}] pasted italic and sub/superscript stay`, find('Q')?.italic === true && runs.some((r) => r.text === '1' && r.vertAlign === 'subscript') && runs.some((r) => r.text === '2' && r.vertAlign === 'superscript'), JSON.stringify(runs));
    check(`[${tag}] no pasted font, size or colour reaches a run`, runs.every((run) => !run.fonts && !run.fontSize && !run.color), JSON.stringify(runs));

    // 2. MC questions pasted into a text: the bar, then questions in one undo step.
    const before = await doc();
    await clickEnd();
    await toClipboard(page, [['text/plain', MC_TEXT]]);
    await page.keyboard.press('ControlOrMeta+v');
    await settle(800);
    const bar = page.locator('[data-paste-offer]');
    const said = (await bar.count()) ? await bar.innerText() : '';
    check(`[${tag}] pasted questions bring the bar`, w.found.test(said), said);
    await page.screenshot({ path: `${OUT}/paste-offer-${tag}.png` });
    await bar.getByRole('button', { name: w.make }).click();
    await settle();
    const after = await doc();
    const made = after.questions.length - before.questions.length;
    check(`[${tag}] "${w.make}" adds the questions`, made >= 3 && after.questions.slice(1, 1 + made).every((q) => q.type === 'mcq'), String(made));
    check(`[${tag}] … and takes the pasted text back`, JSON.stringify(after.questions[0].blocks) === JSON.stringify(before.questions[0].blocks), JSON.stringify(after.questions[0].blocks[0].text.en).slice(0, 160));
    check(`[${tag}] … and the bar goes`, (await bar.count()) === 0);
    await page.screenshot({ path: `${OUT}/paste-made-${tag}.png` });
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await settle();
    check(`[${tag}] one undo takes the questions back`, (await doc()).questions.length === before.questions.length, String((await doc()).questions.length));

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
  await verifyPastePicture(ui, size);
}

async function verifyPastePicture(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const { context, page, errors } = await openFixture(ui, size);
  const doc = () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), `econ-worksheet:${document_.id}`);
  const settle = (ms = 1600) => page.waitForTimeout(ms);
  try {
    // 3. A picture pasted with Q2 selected (its row in the Content list) goes into Q2.
    const q2Row = page.locator('button:not([aria-label])').filter({ hasText: 'Which of the following' }).first();
    await q2Row.click();
    await settle(300);
    const png = readFileSync(PICTURE).toString('base64');
    await toClipboard(page, [['image/png', png, true]]);
    const blocksBefore = (await doc()).questions[1].blocks.length;
    await page.keyboard.press('ControlOrMeta+v');
    await settle(2000);
    const q2 = (await doc()).questions[1].blocks;
    check(`[${tag}] a pasted picture goes into the selected question`, q2.length === blocksBefore + 1 && q2.at(-1).kind === 'image', JSON.stringify(q2.map((b) => b.kind)));
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

const COMMAND_WORDS = {
  en: { search: 'Search commands', fonts: 'Fonts', font: 'font', pageBreak: 'page break', table: 'table', print: 'print' },
  'zh-HK': { search: '搜尋指令', fonts: '字型', font: '字型', pageBreak: '分頁', table: '表格', print: '列印' },
};

async function verifyCommands(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const w = COMMAND_WORDS[ui];
  const { context, page, errors } = await openFixture(ui, size);
  const doc = () => page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)), `econ-worksheet:${document_.id}`);
  const palette = page.locator('[data-command-palette]');
  const box = page.getByRole('combobox', { name: w.search });
  const ask = async (words) => {
    await page.getByRole('button', { name: new RegExp(`^${w.search}`) }).click();
    await box.fill(words);
    await page.waitForTimeout(150);
    return page.locator('[data-command-palette] [role="option"]').first().getAttribute('data-command');
  };
  try {
    // The key opens it, with nothing open and with a text open; pressed again or Esc, it closes.
    await page.keyboard.press('ControlOrMeta+k');
    check(`[${tag}] ⌘K opens the command search`, (await palette.count()) === 1);
    await page.keyboard.press('Escape');
    check(`[${tag}] … and Esc closes it`, (await palette.count()) === 0);
    const stem = page.locator(`#print-root [data-field-key="blockText:${STEM_ID}"][data-field-side="en"]`).first();
    const stemBox = await stem.boundingBox();
    const stemShows = await page.evaluate(([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest('#print-root')), [stemBox.x + 4, stemBox.y + stemBox.height / 2]);
    if (stemShows) {
      await page.mouse.click(stemBox.x + 4, stemBox.y + stemBox.height / 2);
      await page.keyboard.press('Control+k');
      check(`[${tag}] Ctrl+K opens it with a text open`, (await palette.count()) === 1);
      await page.keyboard.press('Control+k');
      check(`[${tag}] … and pressed again closes it`, (await palette.count()) === 0);
      await page.keyboard.press('Escape');
    }

    // The 🔍: "font" → Setup, at Fonts, outlined.
    let first = await ask(w.font);
    check(`[${tag}] "${w.font}" finds Setup › Fonts first`, first === 'setup:fonts', String(first));
    await page.screenshot({ path: `${OUT}/command-font-${tag}.png` });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const found = await page.locator('[data-setting-found]').innerText().catch(() => '');
    check(`[${tag}] Enter opens Setup with Fonts outlined`, found.includes(w.fonts), found.slice(0, 80));
    await page.screenshot({ path: `${OUT}/command-setup-${tag}.png` });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // "page break" → a New page.
    const breaksBefore = ((await doc()).layout ?? []).filter((e) => e.kind === 'pageBreak').length;
    first = await ask(w.pageBreak);
    check(`[${tag}] "${w.pageBreak}" finds New page first`, first === 'insert:pageBreak', String(first));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1600);
    const breaksAfter = ((await doc()).layout ?? []).filter((e) => e.kind === 'pageBreak').length;
    check(`[${tag}] … and Enter adds one`, breaksAfter === breaksBefore + 1, `${breaksBefore} → ${breaksAfter}`);

    // "table" → the Insert menu's size grid.
    first = await ask(w.table);
    check(`[${tag}] "${w.table}" finds Table… first`, first === 'insert:table', String(first));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    check(`[${tag}] … and Enter opens the Insert menu's size grid`, (await page.getByRole('grid').count()) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // "print" → Export, on PDF.
    first = await ask(w.print);
    check(`[${tag}] "${w.print}" finds the PDF export first`, first === 'export:exportPdf', String(first));
    await page.keyboard.press('Enter');
    await page.waitForTimeout(600);
    const pdfChosen = await page.locator('[role="dialog"]').getByRole('radio', { name: /PDF/ }).first().isChecked().catch(() => undefined);
    const pdfPressed = await page.locator('[role="dialog"] [aria-pressed="true"], [role="dialog"] [aria-checked="true"], [role="dialog"] [aria-selected="true"]').allInnerTexts();
    check(`[${tag}] … and Enter opens Export on PDF`, pdfChosen === true || pdfPressed.some((t) => /PDF/.test(t)), JSON.stringify(pdfPressed));
    await page.screenshot({ path: `${OUT}/command-export-${tag}.png` });
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

const SAMPLE_WORDS = {
  en: { open: 'Open a sample paper', name: 'Sample paper: Demand and supply', title: 'Demand and Supply' },
  'zh-HK': { open: '開啟示例試卷', name: '示例試卷：需求與供應', title: '需求與供應' },
};

async function verifySample(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const w = SAMPLE_WORDS[ui];
  const sampleIn = async (page) =>
    page.evaluate(() => {
      const index = JSON.parse(window.localStorage.getItem('econ-worksheet-index') ?? '[]');
      return index.map((row) => {
        const doc = JSON.parse(window.localStorage.getItem(`econ-worksheet:${row.id}`) ?? 'null');
        return { name: doc?.name, questions: doc?.questions.length, bankHidden: doc?.bankHidden };
      });
    });

  // 1. An empty desk: the welcome offers it.
  {
    const context = await browser.newContext({ viewport: SIZES[size], hasTouch: size !== 'mac' });
    await context.addInitScript(([version, language]) => {
      if (!window.localStorage.getItem('econ-worksheet-last-seen-version')) {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'bilingual' }));
      }
    }, [APP_VERSION, ui]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(URL_BASE, { waitUntil: 'networkidle' });
      const buttons = page.locator('[data-open-sample]');
      check(`[${tag}] an empty start screen offers "${w.open}" (welcome and panel)`, (await buttons.count()) >= 1, String(await buttons.count()));
      await page.screenshot({ path: `${OUT}/sample-start-${tag}.png` });
      await buttons.first().click();
      await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
      await page.waitForTimeout(2000);
      const pageText = await page.locator('#print-root').innerText();
      check(`[${tag}] it opens the sample: title, bubble tea, the face-mask table`, pageText.includes(w.title) && /bubble tea|珍珠奶茶/.test(pageText) && pageText.includes('600'), pageText.slice(0, 120));
      const docs = await sampleIn(page);
      check(`[${tag}] … saved as "${w.name}", 4 questions, hidden from the 題庫`, docs.length === 1 && docs[0].name === w.name && docs[0].questions === 4 && docs[0].bankHidden === true, JSON.stringify(docs));
      await page.screenshot({ path: `${OUT}/sample-paper-${tag}.png`, fullPage: false });
      // The Marking scheme view has its answers.
      await page.getByRole('radio', { name: ui === 'en' ? 'Marking scheme' : '評卷參考' }).first().click().catch(async () => {
        await page.getByText(ui === 'en' ? 'Marking scheme' : '評卷參考', { exact: true }).first().click();
      });
      await page.waitForTimeout(1500);
      const keyText = await page.locator('#print-root').innerText();
      check(`[${tag}] its Marking scheme view has the answers`, /\$40|200 (boxes|盒)/.test(keyText), keyText.slice(0, 160));
      await page.screenshot({ path: `${OUT}/sample-key-${tag}.png` });
      check(`[${tag}] no page errors (start)`, errors.length === 0, errors.join(' | '));
    } finally {
      await context.close();
    }
  }

  // 2. An empty paper: its empty state offers it too, opening the sample as another document.
  {
    const empty = { ...document_, id: 'empty-paper', name: 'Empty paper', questions: [], layout: [], flow: [] };
    const context = await browser.newContext({ viewport: SIZES[size], hasTouch: size !== 'mac' });
    await context.addInitScript(([version, language, body]) => {
      if (!window.localStorage.getItem('econ-worksheet:empty-paper')) {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
        window.localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: 'empty-paper', title: 'Empty paper', updatedAt: '2026-10-25T00:00:00.000Z' }]));
        window.localStorage.setItem('econ-worksheet:empty-paper', body);
      }
    }, [APP_VERSION, ui, JSON.stringify(empty)]);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    try {
      await page.goto(URL_BASE, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Empty paper/ }).first().click();
      await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
      await page.waitForTimeout(1200);
      const offer = page.locator('#print-root [data-open-sample]');
      check(`[${tag}] an empty paper offers "${w.open}"`, (await offer.count()) === 1);
      await page.screenshot({ path: `${OUT}/sample-empty-state-${tag}.png` });
      await offer.click({ force: size === 'iphone' });
      await page.waitForTimeout(2500);
      const docs = await sampleIn(page);
      check(`[${tag}] … which opens the sample beside it`, docs.some((d) => d.name === w.name && d.questions === 4) && docs.some((d) => d.name === 'Empty paper'), JSON.stringify(docs));
      check(`[${tag}] no page errors (empty paper)`, errors.length === 0, errors.join(' | '));
    } finally {
      await context.close();
    }
  }
}

try {
  for (const ui of ['en', 'zh-HK']) {
    for (const size of Object.keys(SIZES)) {
      console.log(`\n— ${ui} · ${size}`);
      if (wants('save')) await verifySave(ui, size);
      if (wants('insert')) await verifyInsert(ui, size);
      if (wants('paste') && size !== 'iphone') await verifyPaste(ui, size);
      if (wants('command')) await verifyCommands(ui, size);
      if (wants('sample')) await verifySample(ui, size);
    }
  }
} finally {
  await browser.close();
  devServer?.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
