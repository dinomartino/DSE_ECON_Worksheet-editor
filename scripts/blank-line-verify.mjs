import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that a blank line in an answer or a mark point is only ever one
 * the teacher typed, and can always be deleted (GitHub issue #7 point 1, k-0468:
 * "答案位置有時自己多咗行空白，但刪唔走").
 *
 * On the Teacher view of `test-fixtures/manual/word-typing-mix.json`, part (a) given an
 * answer and four mark points, one of them saved as "…\n" (a stored trailing break):
 *
 *  - clicking the blank line under that point opens it with the caret on that line, the
 *    paragraph keeping its height, and Backspace deletes the line (before: no field
 *    opened; clicking the words and pressing Backspace deleted a letter);
 *  - Shift+Enter at a point's end then typing on stores no blank line after the words;
 *  - Delete at the end of the words removes a trailing break;
 *  - in the answer, Enter, Enter, Backspace, Backspace gives the text back unchanged, and
 *    deleting the last line's word and retyping it leaves no blank line (before, both
 *    stored Chrome's placeholder break as a blank line Word printed).
 *
 *   node scripts/blank-line-verify.mjs [--url=http://localhost:3000] [--out=/tmp/blank-line-verify]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (CHROME, default
 * /opt/google/chrome/chrome). The reader's rule is `src/components/preview/trailingBlankLine.test.ts`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/blank-line-verify');
mkdirSync(OUT, { recursive: true });

const doc = JSON.parse(readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const rt = (text) => [{ text }];
const part = doc.questions[0].parts[0];
part.answer = { en: rt('Answer line one'), zh: [] };
part.scheme = {
  routes: [
    {
      id: 'bl-route',
      groups: [
        {
          id: 'bl-group',
          points: [
            { id: 'bl-p1', text: { en: rt('Demand curve shifts to the left'), zh: [] }, marks: 1 },
            { id: 'bl-p2', text: { en: rt('Supply curve shifts to the left'), zh: [] }, marks: 1 },
            { id: 'bl-p3', text: { en: rt('A point saved with a trailing break\n'), zh: [] }, marks: 1 },
            { id: 'bl-p4', text: { en: rt('Last point'), zh: [] }, marks: 1 },
          ],
        },
      ],
    },
  ],
};
const KEY = `econ-worksheet:${doc.id}`;
const TITLE = 'Blank line verify';

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

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });
try {
  const context = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  await context.addInitScript(
    ([version, index, key, body]) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem('econ-worksheet-last-seen-version', version);
        localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: 'en' }));
        localStorage.setItem('econ-worksheet-index', index);
        localStorage.setItem(key, body);
      }
    },
    [APP_VERSION, JSON.stringify([{ id: doc.id, title: TITLE, updatedAt: doc.updatedAt }]), KEY, JSON.stringify(doc)],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.getByText('Teacher', { exact: true }).first().click();
  await page.waitForTimeout(800);

  const stored = () =>
    page.evaluate((key) => {
      const p = JSON.parse(localStorage.getItem(key)).questions[0].parts[0];
      const text = (bi) => bi.en.map((run) => run.text).join('');
      return { points: p.scheme.routes[0].groups[0].points.map((point) => text(point.text)), answer: text(p.answer) };
    }, KEY);
  const field = (key) => `#print-root [data-field-key="${key}"][data-field-side="en"]`;
  const paragraphHeight = (key) =>
    page.evaluate((k) => Math.round(document.querySelector(`#print-root [data-page-target="${k}"]`).getBoundingClientRect().height), key);
  /** Click the end of a field's words, with the caret at the end of its text. */
  const openAtEnd = async (key) => {
    // The end of the words' last line: a wrapped or two-line field's box is wider than it.
    const box = await page.evaluate((sel) => {
      const rects = [...document.querySelector(sel).getClientRects()].filter((r) => r.width > 0);
      const r = rects[rects.length - 1];
      return { x: r.right - 2, y: r.top + r.height / 2 };
    }, field(key));
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(300);
    await page.keyboard.press('End');
  };
  const away = async () => {
    await page.mouse.click(5, 500);
    await page.waitForTimeout(1200);
  };
  const editing = () => page.evaluate(() => document.activeElement?.getAttribute('contenteditable') === 'true');

  // 1. A stored trailing break: its blank line is reached by a click and deleted.
  const p3 = 'schemePoint:bl-p3';
  const idleHeight = await paragraphHeight(p3);
  await openAtEnd('schemePoint:bl-p4');
  await away();
  const line = await page.evaluate((k) => {
    const r = document.querySelector(`#print-root [data-page-target="${k}"]`).getBoundingClientRect();
    return { x: r.x + 40, y: r.bottom - 5 };
  }, p3);
  await page.mouse.click(line.x, line.y);
  await page.waitForTimeout(400);
  check('a click on the blank line opens the point', await editing());
  check('the open point keeps its height', (await paragraphHeight(p3)) === idleHeight, `${idleHeight} → ${await paragraphHeight(p3)}`);
  await page.screenshot({ path: `${OUT}/1-blank-line-open.png` });
  // Where the click opened nothing (the old build), the words' end is the only way in:
  // that is where a teacher then tries Backspace.
  if (!(await editing())) {
    await away();
    await openAtEnd(p3);
  }
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  await away();
  check('Backspace on the blank line deletes it', (await stored()).points[2] === 'A point saved with a trailing break', JSON.stringify((await stored()).points[2]));

  // 2. Shift+Enter at the end, then typing on: no blank line after the words.
  await openAtEnd('schemePoint:bl-p2');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('and more');
  await page.waitForTimeout(300);
  await away();
  check('Shift+Enter then typing stores no blank line', (await stored()).points[1] === 'Supply curve shifts to the left\nand more', JSON.stringify((await stored()).points[1]));

  // 3. Shift+Enter at the end and leave: the break typed stays (Word keeps it), and Delete
  //    at the end of the words takes it away again.
  await openAtEnd('schemePoint:bl-p1');
  await page.keyboard.press('Shift+Enter');
  await page.waitForTimeout(300);
  await away();
  check('a break typed at the end is kept once', (await stored()).points[0] === 'Demand curve shifts to the left\n', JSON.stringify((await stored()).points[0]));
  await openAtEnd('schemePoint:bl-p1');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(300);
  await away();
  check('Delete at the end of the words removes it', (await stored()).points[0] === 'Demand curve shifts to the left', JSON.stringify((await stored()).points[0]));

  // 4. The answer: Enter twice and back twice is the text it was.
  const answer = `partAnswer:${part.id}`;
  await openAtEnd(answer);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(300);
  await away();
  check('Enter, Enter, Backspace, Backspace leaves the answer as it was', (await stored()).answer === 'Answer line one', JSON.stringify((await stored()).answer));

  // 5. A second line, its last word deleted and retyped: no blank line after it.
  await openAtEnd(answer);
  await page.keyboard.press('Enter');
  await page.keyboard.type('two');
  await page.waitForTimeout(300);
  await away();
  await openAtEnd(answer);
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Backspace');
  await page.keyboard.type('six');
  await page.waitForTimeout(300);
  await away();
  check('retyping the last line stores no blank line', (await stored()).answer === 'Answer line one\nsix', JSON.stringify((await stored()).answer));
  await page.screenshot({ path: `${OUT}/2-after.png` });

  check('no page errors', errors.length === 0, errors.join(' | '));
  await context.close();
} finally {
  await browser.close();
  devServer?.kill();
}
console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
