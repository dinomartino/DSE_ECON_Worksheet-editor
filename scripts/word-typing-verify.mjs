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
 *  - in the Marking scheme view (`--part=scheme` runs only this): Enter in a mark point starts a
 *    new point with its own "(1)", typing straight on; Enter on an empty point removes it and
 *    finishes; Undo takes a split back in one step; Backspace at a point's start joins it back;
 *    Shift+Enter is a line break; Enter in an answer is a new line inside it; Esc finishes.
 *
 *   node scripts/word-typing-verify.mjs [--out=/tmp/word-typing-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (CHROME, default
 * /opt/google/chrome/chrome). Every click, drag and key is a real input event. The model halves
 * (split, join, save, reopen, `.docx`, undo) are `src/model/paragraphs.test.ts` and
 * `src/model/schemeEnter.test.ts`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/word-typing-verify');
const ONLY = opt('part', 'all');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Word typing mix';
const STEM_ID = document_.questions[0].blocks[0].id;
const OPTION_IDS = document_.questions[1].options.map((option) => option.id);

// The Marking scheme part (K): an answer and two mark points on the first question's part (a),
// added here so the manual fixture stays as it is.
const rt = (text) => [{ text }];
const SCHEME_PART = document_.questions[0].parts[0];
SCHEME_PART.answer = { en: rt('Price is held below equilibrium.'), zh: rt('價格被壓在均衡之下。') };
SCHEME_PART.scheme = {
  routes: [
    {
      id: 'wt-route',
      groups: [
        {
          id: 'wt-group',
          points: [
            { id: 'wt-p1', text: { en: rt('Quantity demanded rises'), zh: rt('需求量上升') }, marks: 1 },
            { id: 'wt-p2', text: { en: rt('Quantity supplied falls'), zh: rt('供應量下降') }, marks: 1 },
          ],
        },
      ],
    },
  ],
};
const seededText = JSON.stringify(document_);

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
  en: { undo: /^Undo/, redo: /^Redo/, hint: 'Click any text to type', key: 'Marking scheme', student: 'Student', layout: 'Layout', classic: 'Classic', suggested: 'Suggested answers' },
  'zh-HK': { undo: /^復原/, redo: /^重做/, hint: '按一下文字即可輸入', key: '評卷參考', student: '學生版', layout: '版面', classic: '經典', suggested: '參考答案' },
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
        seededText,
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

    let at;
    let editor;
    if (ONLY !== 'scheme') {
      // A. The hint says what one click does now.
      const hint = await page.getByText(w.hint, { exact: true }).count();
      check(`[${tag}] the edit hint says "${w.hint}"`, hint > 0, String(hint));

      // B. One click types where it landed: at full speed straight after the click…
      const stem = fieldSelector(`blockText:${STEM_ID}`);
      at = await pointIn(stem, 'maximum', 0);
      await page.mouse.click(at.x, at.y);
      await page.keyboard.type('firm ', { delay: 0 });
      await settle();
      editor = await openEditor();
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
      // Reopened, the editor shows exactly what was stored (a trailing break would be a third line).
      await page.mouse.click(cell.x, cell.y);
      await settle();
      const reopened = await page.evaluate(() =>
        document.activeElement?.innerHTML.replace(/<br[^>]*>/g, '\n').replace(/<[^>]+>/g, ''),
      );
      await page.keyboard.press('Escape');
      await settle();
      check(`[${tag}] … and once finished the cell holds the two lines, no blank line after`, reopened === '$12\na kg', JSON.stringify(reopened));

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
    }

    // K. The Marking scheme view types like the paper (k-0200, the user's answer).
    await page.getByText(w.key, { exact: true }).first().click();
    await settle(1500);
    /** Each mark point's English, in order: the open editor's text, '' for an empty prompt. */
    const pointTexts = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#print-root [data-page-target^="schemePoint:"]')].map((row) => {
          const editing = row.querySelector('[contenteditable="true"]');
          if (editing) return editing.textContent;
          const field = row.querySelector('[data-field-side="en"]');
          return field?.hasAttribute('data-empty-placeholder') ? '' : (field?.textContent ?? '');
        }),
      );
    const markLabels = () => page.evaluate(() => (document.querySelector('#print-root').innerText.match(/\(1\)/g) ?? []).length);
    const point = (id) => fieldSelector(`schemePoint:${id}`);
    const POINTS = ['Quantity demanded rises', 'Quantity supplied falls'];
    check(`[${tag}] the Marking scheme view shows the two points, each with (1)`, same(await pointTexts(), POINTS) && (await markLabels()) === 2, `${JSON.stringify(await pointTexts())} ${await markLabels()}`);

    // Enter at a point's end starts a new point, typing straight on, with its own (1).
    at = await pointIn(point('wt-p1'), 'rises', 4);
    await page.mouse.click(at.x + 4, at.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Shortage results', { delay: 0 });
    await settle(600);
    editor = await openEditor();
    check(
      `[${tag}] Enter in a mark point starts a new point, and the letters typed straight after land in it`,
      same(await pointTexts(), [POINTS[0], 'Shortage results', POINTS[1]]) && editor?.text === 'Shortage results',
      `${JSON.stringify(await pointTexts())} ${JSON.stringify(editor)}`,
    );
    await page.keyboard.press('Escape');
    await settle();
    check(`[${tag}] … and the new point has its own (1) in the Marks column`, (await markLabels()) === 3, String(await markLabels()));
    await page.screenshot({ path: `${OUT}/${tag}-scheme-enter.png` });

    // Enter on an empty point ends the list: the point goes and the field finishes.
    at = await pointIn(fieldSelector(await page.evaluate(() => document.querySelectorAll('#print-root [data-page-target^="schemePoint:"]')[1].getAttribute('data-page-target'))), 'results', 6);
    await page.mouse.click(at.x + 4, at.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await settle(400);
    const withEmpty = await pointTexts();
    await page.keyboard.press('Enter');
    await settle(400);
    check(
      `[${tag}] Enter on the empty new point removes it and finishes (no stray (1))`,
      withEmpty.length === 4 && same(await pointTexts(), [POINTS[0], 'Shortage results', POINTS[1]]) && (await openEditor()) === undefined && (await markLabels()) === 3,
      `${JSON.stringify(withEmpty)} ${JSON.stringify(await pointTexts())} ${JSON.stringify(await openEditor())} ${await markLabels()}`,
    );

    // A split mid-point is one Undo step; Redo returns it; Backspace at its start joins it back.
    const three = await pointTexts();
    at = await pointIn(point('wt-p2'), 'falls', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Enter');
    await settle(600);
    await page.keyboard.press('Escape');
    await settle();
    const splitPoints = await pointTexts();
    check(`[${tag}] Enter mid-point splits it at the caret`, same(splitPoints, [POINTS[0], 'Shortage results', 'Quantity supplied ', 'falls']), JSON.stringify(splitPoints));
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] one Undo takes the split back`, same(await pointTexts(), three), JSON.stringify(await pointTexts()));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] … and Redo puts it back`, same(await pointTexts(), splitPoints), JSON.stringify(await pointTexts()));
    const fallsKey = await page.evaluate(() => [...document.querySelectorAll('#print-root [data-page-target^="schemePoint:"]')].at(-1).getAttribute('data-page-target'));
    at = await pointIn(fieldSelector(fallsKey), 'falls', 0);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Home');
    await page.keyboard.press('Backspace');
    await settle(600);
    editor = await openEditor();
    check(
      `[${tag}] Backspace at a point's start joins it to the point before, the caret where they meet`,
      same(await pointTexts(), three) && editor?.text === POINTS[1],
      `${JSON.stringify(await pointTexts())} ${JSON.stringify(editor)}`,
    );
    await page.keyboard.type('X', { delay: 0 });
    await settle();
    check(`[${tag}] … (typing lands at the join)`, (await pointTexts()).at(-1) === 'Quantity supplied Xfalls', JSON.stringify(await pointTexts()));
    await page.keyboard.press('Backspace');

    // Shift+Enter is a line break inside the point, not a new point; Esc finishes.
    await page.keyboard.press('Shift+Enter');
    await settle();
    check(`[${tag}] Shift+Enter in a point is a line break, not a new point`, same(await pointTexts(), [POINTS[0], 'Shortage results', 'Quantity supplied \nfalls']), JSON.stringify(await pointTexts()));
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await settle();
    check(`[${tag}] Esc finishes the point`, (await openEditor()) === undefined && same(await pointTexts(), three), `${JSON.stringify(await openEditor())} ${JSON.stringify(await pointTexts())}`);

    // Enter in an answer is a new line inside it, and the field stays open.
    const answer = fieldSelector(`partAnswer:${SCHEME_PART.id}`);
    at = await pointIn(answer, 'equilibrium', 5);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Accept a diagram.', { delay: 0 });
    await settle();
    editor = await openEditor();
    // (While open, Chrome keeps a placeholder line break after the typing; it goes as the field closes.)
    check(`[${tag}] Enter in an answer is a new line, and typing goes straight on there`, editor?.text.startsWith('Price is held below equilibrium.\nAccept a diagram.'), JSON.stringify(editor));
    await page.keyboard.press('Escape');
    await settle();
    const answerText = await page.evaluate((sel) => document.querySelector(sel)?.innerText, answer);
    check(`[${tag}] … kept as two lines once finished, with no blank line after them`, answerText === 'Price is held below equilibrium.\nAccept a diagram.', JSON.stringify(answerText));

    // Suggested answers lays the points out as bullets of its own: there Enter in a point is a
    // new line inside it (an empty point has no bullet to type in), and no point is added.
    await page.getByRole('tab', { name: w.layout, exact: true }).first().click();
    await page.getByText(w.suggested, { exact: true }).first().click();
    await settle(1000);
    const bulletPoints = await pointTexts();
    at = await pointIn(point('wt-p1'), 'rises', 2);
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('or demand is unmet', { delay: 0 });
    await settle();
    editor = await openEditor();
    check(
      `[${tag}] in Suggested answers, Enter in a point is a new line in it, and no point is added`,
      editor?.text.startsWith('Quantity demanded rises\nor demand is unmet') && (await pointTexts()).length === bulletPoints.length,
      `${JSON.stringify(editor)} ${JSON.stringify(await pointTexts())}`,
    );
    await page.keyboard.press('Escape');
    await settle();
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    await page.getByText(w.classic, { exact: true }).first().click();
    await settle(1000);

    // The bilingual key, for the eye: each English line with its Chinese, the new point in English.
    await page.getByText('EN+中', { exact: true }).first().click();
    await settle(1200);
    await page.screenshot({ path: `${OUT}/${tag}-scheme-bilingual.png` });
    await page.getByText('EN', { exact: true }).first().click();
    await page.getByText(w.student, { exact: true }).first().click();
    await settle(1200);

    // J. After a reload, what was typed is saved.
    await settle(2500);
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper();
    const reloaded = await stemTexts();
    if (ONLY !== 'scheme') {
      check(`[${tag}] after a reload the typing is still there`, reloaded[0]?.includes('firm top price for white rice'), JSON.stringify(reloaded));
    }
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
