import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that the page types like Word (k-0200), on
 * `test-fixtures/manual/word-typing-mix.json`, in English and in 繁體中文 interfaces:
 *
 *  - one click puts the caret where it landed, in a question's text, a part and an option, and
 *    letters typed straight after the click (at full speed and at a person's) all arrive;
 *  - a drag across words opens the field with them selected;
 *  - Enter in a question's text starts a new paragraph at the caret, and the words typed straight
 *    after Enter land in it; Backspace at its start joins it back; Delete at a paragraph's end too;
 *  - Undo takes the new paragraph back in one step and Redo returns it;
 *  - Enter in an option goes to the next option (typing straight on), Enter in the last finishes,
 *    Esc finishes; Shift+Enter is still a line break;
 *  - a table cell still opens on one click and Enter is a new line inside it;
 *  - what was typed is still there after a reload (saved), and the edit hint says "Click any text".
 *
 *   node scripts/word-typing-verify.mjs [--out=/tmp/word-typing-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (CHROME, default
 * /opt/google/chrome/chrome). Every click, drag and key is a real input event. The model halves
 * (split, join, save, reopen, `.docx`, undo) are `src/model/paragraphs.test.ts`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/word-typing-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Word typing mix';
const STEM_ID = document_.questions[0].blocks[0].id;
const OPTION_IDS = document_.questions[1].options.map((option) => option.id);

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

const WORDS = {
  en: { undo: /^Undo/, redo: /^Redo/, hint: 'Click any text to type' },
  'zh-HK': { undo: /^復原/, redo: /^重做/, hint: '按一下文字即可輸入' },
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', ...(chromePath ? { executablePath: chromePath } : {}) });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
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
    const openPaper = async () => {
      await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
      await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
      await page.waitForTimeout(2000);
    };
    await openPaper();
    const settle = (ms = 400) => page.waitForTimeout(ms);

    /** The text of each paragraph of the first question's stem, in order (the page's own DOM). */
    const stemTexts = () =>
      page.evaluate(() => {
        // The stem's paragraphs are the ones above the question's table; a part's follow it.
        const table = document.querySelector('#print-root table[data-table-block]');
        return [...document.querySelectorAll('#print-root [data-page-target^="blockText:"]')]
          .filter((p) => p.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING)
          .map((p) => p.querySelector('[data-field-side="en"], [contenteditable="true"][lang="en"]')?.textContent ?? '');
      });
    /** The idle field (or open editor) editing `key` on `side`. */
    const fieldSelector = (key, side = 'en') => `#print-root [data-field-key="${key}"][data-field-side="${side}"]`;
    const openEditor = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el.getAttribute('contenteditable') !== 'true') return undefined;
        const key = el.closest('[data-page-target]')?.getAttribute('data-page-target');
        return { text: el.textContent, key, cell: Boolean(el.closest('[data-table-cell]')) };
      });
    /** A viewport point inside `text` of a field: between `text[at - 1]` and `text[at]`. */
    const pointIn = (selector, word, offsetInWord) =>
      page.evaluate(
        ([sel, needle, offset]) => {
          const host = document.querySelector(sel);
          const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
          let node;
          while ((node = walker.nextNode())) {
            const at = node.data.indexOf(needle);
            if (at < 0) continue;
            const range = document.createRange();
            range.setStart(node, at + offset);
            range.setEnd(node, at + offset + 1);
            const rect = range.getBoundingClientRect();
            return { x: rect.left + 0.5, y: rect.top + rect.height / 2 };
          }
          return undefined;
        },
        [selector, word, offsetInWord],
      );

    // A. The hint says what one click does now.
    const hint = await page.getByText(w.hint, { exact: true }).count();
    check(`[${tag}] the edit hint says "${w.hint}"`, hint > 0, String(hint));

    // B. One click types where it landed: at full speed straight after the click…
    const stem = fieldSelector(`blockText:${STEM_ID}`);
    let at = await pointIn(stem, 'maximum', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.type('firm ', { delay: 0 });
    await settle();
    let editor = await openEditor();
    check(`[${tag}] one click opens the stem with the caret where it landed`, editor?.text.includes('sets a firm maximum price'), JSON.stringify(editor));
    await page.keyboard.press('Escape');
    await settle();
    check(
      `[${tag}] … and every letter typed at full speed straight after the click arrived`,
      (await stemTexts())[0]?.includes('sets a firm maximum price'),
      JSON.stringify(await stemTexts()),
    );

    // …and at a person's speed (60 ms a key), the case the research reproduced (G1).
    at = await pointIn(stem, ' rice', 1);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.type('white ', { delay: 60 });
    await page.keyboard.press('Escape');
    await settle();
    check(`[${tag}] typing at a person's speed after one click keeps every letter`, (await stemTexts())[0]?.includes('for white rice'), JSON.stringify(await stemTexts()));

    // C. A drag across a word opens with it selected: typing replaces it.
    const from = await pointIn(stem, 'maximum', 0);
    const to = await pointIn(stem, 'maximum ', 7);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move((from.x + to.x) / 2, to.y, { steps: 4 });
    await page.mouse.move(to.x - 0.5, to.y, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.type('top', { delay: 0 });
    await page.keyboard.press('Escape');
    await settle();
    check(`[${tag}] a drag across "maximum" selects it: typing replaces it`, (await stemTexts())[0]?.includes('firm top price'), JSON.stringify(await stemTexts()));

    // D. Enter starts a new paragraph at the caret, and typing goes straight on into it.
    const before = await stemTexts();
    at = await pointIn(stem, 'below', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Enter');
    await page.keyboard.type('It is ', { delay: 0 });
    await settle(600);
    editor = await openEditor();
    const afterEnter = await stemTexts();
    check(
      `[${tag}] Enter splits the stem: the words after the caret start a new paragraph`,
      afterEnter.length === before.length + 1 && afterEnter[0].endsWith('top price for white rice ') && afterEnter[1].startsWith('It is below'),
      JSON.stringify(afterEnter),
    );
    check(`[${tag}] … the caret is in the new paragraph and the letters typed straight after Enter are all there`, editor?.text.startsWith('It is below'), JSON.stringify(editor));
    await page.screenshot({ path: `${OUT}/${tag}-enter.png` });

    // Backspace at the new paragraph's start joins it back (after the typing is taken out).
    for (let n = 0; n < 'It is '.length; n += 1) await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await settle(600);
    editor = await openEditor();
    check(`[${tag}] Backspace at the paragraph's start joins it to the one before`, same(await stemTexts(), before), JSON.stringify(await stemTexts()));
    check(`[${tag}] … the caret stays where the two met, and typing goes on there`, editor?.text.includes('rice below'), JSON.stringify(editor));
    await page.keyboard.type('X', { delay: 0 });
    await settle();
    check(`[${tag}] … (typing lands at the join)`, (await stemTexts())[0]?.includes('rice Xbelow'), JSON.stringify(await stemTexts()));
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await settle();

    // E. Undo takes a new paragraph back in one step; Redo returns it.
    at = await pointIn(stem, 'below', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Enter');
    await settle(600);
    await page.keyboard.press('Escape');
    await settle();
    const split = await stemTexts();
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] one Undo takes the new paragraph back`, same(await stemTexts(), before), JSON.stringify(await stemTexts()));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] … and Redo puts it back`, same(await stemTexts(), split), JSON.stringify(await stemTexts()));

    // Delete at the end of the first paragraph pulls the second back in.
    const firstKey = `blockText:${STEM_ID}`;
    at = await pointIn(fieldSelector(firstKey), 'rice', 3);
    await page.mouse.click(at.x + 8, at.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Delete');
    await settle(600);
    check(`[${tag}] Delete at a paragraph's end joins the next one to it`, same(await stemTexts(), before), JSON.stringify(await stemTexts()));
    await page.keyboard.press('Escape');
    await settle();

    // F. Shift+Enter is still a line break inside the paragraph.
    at = await pointIn(stem, 'below', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Shift+Enter');
    await settle();
    const broken = await stemTexts();
    check(`[${tag}] Shift+Enter is a line break, not a new paragraph`, broken.length === before.length && broken[0].includes('rice \nbelow'), JSON.stringify(broken));
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await settle();
    check(`[${tag}] … (and Backspace takes it out)`, same(await stemTexts(), before), JSON.stringify(await stemTexts()));

    // G. Options: Enter goes to the next option and typing goes straight on; the last finishes.
    const option = (i) => fieldSelector(`mcqOption:${OPTION_IDS[i]}`);
    at = await pointIn(option(0), 'lighting', 8 - 1);
    await page.mouse.click(at.x + 3, at.y);
    await page.keyboard.press('Enter');
    await page.keyboard.type(' only', { delay: 0 });
    await settle(600);
    editor = await openEditor();
    check(`[${tag}] Enter in option A moves to option B, and the letters typed straight after land there`, editor?.text === 'bus rides only', JSON.stringify(editor));
    // Straight on, no pause: "parks⏎defence" as one burst of keys.
    await page.keyboard.press('Enter');
    await page.keyboard.type('parks', { delay: 0 });
    await page.keyboard.press('Enter');
    await page.keyboard.type('defence', { delay: 0 });
    await settle(600);
    editor = await openEditor();
    check(`[${tag}] … on into the empty options C and D`, editor?.text === 'defence', JSON.stringify(editor));
    await page.keyboard.press('Enter');
    await settle();
    check(`[${tag}] Enter in the last option finishes`, (await openEditor()) === undefined, JSON.stringify(await openEditor()));
    const options = await page.evaluate(
      (ids) => ids.map((id) => document.querySelector(`#print-root [data-field-key="mcqOption:${id}"][data-field-side="en"]`)?.textContent),
      OPTION_IDS,
    );
    check(`[${tag}] the four options hold what was typed`, same(options, ['street lighting', 'bus rides only', 'parks', 'defence']), JSON.stringify(options));

    // Esc finishes.
    at = await pointIn(option(0), 'street', 2);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Escape');
    await settle();
    check(`[${tag}] Esc finishes`, (await openEditor()) === undefined, JSON.stringify(await openEditor()));

    // H. A table cell is as it was: one click types, Enter a new line inside it.
    const cell = await page.evaluate(() => {
      const td = [...document.querySelectorAll('#print-root td')].find((el) => el.textContent.trim() === '$12');
      const r = td.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(cell.x, cell.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('a kg', { delay: 0 });
    await settle();
    editor = await openEditor();
    check(`[${tag}] a table cell still opens on one click and Enter is a new line in it`, editor?.cell && editor.text.startsWith('$12\na kg'), JSON.stringify(editor));
    await page.keyboard.press('Escape');
    await settle();

    // I. A part's text types on one click too.
    const partBefore = await page.evaluate(() =>
      [...document.querySelectorAll('#print-root [data-field-side="en"]')].find((el) => el.textContent.startsWith('Explain why'))?.getAttribute('data-field-key'),
    );
    at = await pointIn(fieldSelector(partBefore), 'shortage', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.type('long ', { delay: 0 });
    await page.keyboard.press('Escape');
    await settle();
    const part = await page.evaluate((sel) => document.querySelector(sel)?.textContent, fieldSelector(partBefore));
    check(`[${tag}] one click in a part's text types there`, part === 'Explain why a long shortage results.', JSON.stringify(part));

    // I2. A whole question is still selected by its number: no editor opens there.
    await page.keyboard.press('Escape');
    const number = await page.evaluate((id) => {
      const p = document.querySelector(`#print-root [data-page-target="blockText:${id}"]`);
      const r = p.getBoundingClientRect();
      return { x: r.left + 4, y: r.top + 8 };
    }, STEM_ID);
    await page.mouse.click(number.x, number.y);
    await settle();
    const picked = await page.evaluate(() => document.querySelector('#print-root [data-question-id][aria-current="true"]') !== null);
    check(`[${tag}] a click on the question's number selects the question, and opens no text`, picked && (await openEditor()) === undefined, `${picked} ${JSON.stringify(await openEditor())}`);
    await page.keyboard.press('Escape');

    // J. After a reload, what was typed is saved.
    await settle(2500);
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper();
    const reloaded = await stemTexts();
    check(`[${tag}] after a reload the typing is still there`, reloaded[0]?.includes('firm top price for white rice'), JSON.stringify(reloaded));
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await page.screenshot({ path: `${OUT}/${tag}-done.png` });
    await context.close();
  }
} finally {
  await browser.close();
  devServer?.kill();
}

console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) failed; shots in ${OUT}`);
process.exit(failures === 0 ? 0 : 1);
