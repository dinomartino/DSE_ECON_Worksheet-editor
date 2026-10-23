import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that every drag in the editor works, with real mouse input, on
 * the documents in `test-fixtures/manual/`: the Content outline's rows, the grip on the
 * page, and the page thumbnails; that a file dropped on the start screen opens it (the one
 * route a file takes into the desktop app now that its native drag handler is off); and
 * that a file dropped anywhere else is refused rather than navigated to.
 *
 *   node scripts/drag-verify.mjs [--out=/tmp/drag-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not already serving, and stops it again.
 * Needs Chrome (playwright's `channel: 'chrome'`). This is the web half of the proof: the
 * desktop shell's own webviews (WKWebView, WebView2) are tried by hand with
 * `npm run desktop:dev` (`test-fixtures/manual/README.md` § The desktop app).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/drag-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const FIXTURE = new URL('../test-fixtures/manual/issue-4-repro.json', import.meta.url);
const fixtureText = readFileSync(FIXTURE, 'utf8');

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

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  /** A file dropped as a browser (and now the desktop webview) delivers it. */
  const carrying = (name, body, type) =>
    page.evaluateHandle(
      ([fileName, content, mime]) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File([content], fileName, { type: mime }));
        return transfer;
      },
      [name, body, type],
    );

  // 1. The start screen: a worksheet dropped anywhere on it opens.
  const dataTransfer = await carrying('issue-4-repro.json', fixtureText, 'application/json');
  const startScreen = page.getByText('Choose the paper you want to print').first();

  // While Send feedback is open the screen stands aside: it takes a screenshot itself.
  const picture = await carrying('shot.png', 'png', 'image/png');
  await page.getByText('Send feedback', { exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.waitFor();
  const title = dialog.locator('h2');
  await title.dispatchEvent('dragover', { dataTransfer: picture });
  check('with Send feedback open, a file held over its title shows no start-screen hint', (await page.getByText(/^Drop a \.json to open it/).count()) === 0);
  await title.dispatchEvent('drop', { dataTransfer: picture });
  await page.waitForTimeout(500);
  check('with Send feedback open, a picture dropped on its title starts no import', (await page.getByRole('dialog').count()) === 1);
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'detached' });

  await startScreen.dispatchEvent('dragover', { dataTransfer });
  check('start screen shows the drop hint while a file is held over it', await page.getByText(/^Drop a \.json to open it/).count() > 0);
  await startScreen.dispatchEvent('drop', { dataTransfer });
  await page.waitForSelector('#print-root .paper', { timeout: 20_000 });
  await page.waitForTimeout(2000);
  check('a worksheet dropped on the start screen opens in the editor', (await page.locator('#print-root [data-flow-id]').count()) === 26);

  /** The flow ids of every item on the page, in page order. */
  const order = () =>
    page.evaluate(() => [...document.querySelectorAll('#print-root [data-flow-id]')].map((el) => el.getAttribute('data-flow-id')));
  /** Move `from` to just after `to` in an id list. */
  const movedAfter = (ids, from, to) => {
    const next = ids.filter((id) => id !== ids[from]);
    next.splice(next.indexOf(ids[to]) + 1, 0, ids[from]);
    return next;
  };
  const undo = async () => {
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(600);
  };

  const start = await order();
  // Question n sits at index n + 1: a section heading and a note come first.
  const q = (n) => n + 1;

  // 2. The Content outline: Q10's row onto the lower half of Q5's row (the GitHub #4 test).
  const row = (n) => page.locator('li[draggable="true"]').filter({ has: page.locator(`span.tabular-nums:text-is("${n}")`) });
  const q5Box = await row(5).boundingBox();
  await row(10).dragTo(row(5), { sourcePosition: { x: 40, y: 10 }, targetPosition: { x: 80, y: q5Box.height * 0.8 } });
  await page.waitForTimeout(600);
  const afterOutline = await order();
  check('outline: a row dropped on the lower half of another lands after it', same(afterOutline, movedAfter(start, q(10), q(5))));
  await page.screenshot({ path: `${OUT}/outline-drag.png` });
  await undo();
  check('outline: one Undo puts it back', same(await order(), start));

  // 3. The page: a question's grip onto the lower half of another question.
  const items = page.locator('#print-root [data-flow-id]');
  const grips = page.locator('#print-root [data-drag-grip]');
  const target = items.nth(q(7));
  const targetBox = await target.boundingBox();
  await grips.nth(q(9)).scrollIntoViewIfNeeded();
  await grips.nth(q(9)).dragTo(target, { targetPosition: { x: 200, y: targetBox.height * 0.85 } });
  await page.waitForTimeout(600);
  check('page: a grip dropped on the lower half of another question lands after it', same(await order(), movedAfter(start, q(9), q(7))));
  await page.screenshot({ path: `${OUT}/page-drag.png` });
  await undo();
  check('page: one Undo puts it back', same(await order(), start));

  // 4. The thumbnails: the last page's card onto the first half of the second.
  const cards = page.locator('button[draggable="true"]');
  check('rail: one draggable card per page', (await cards.count()) === 5);
  const cardBox = await cards.nth(1).boundingBox();
  await cards.nth(4).dragTo(cards.nth(1), { targetPosition: { x: cardBox.width / 2, y: cardBox.height * 0.2 } });
  await page.waitForTimeout(800);
  const afterRail = await order();
  check(
    'rail: a page card dropped on another moves its questions, losing none',
    !same(afterRail, start) && same([...afterRail].sort(), [...start].sort()) && !same(afterRail.slice(-3), start.slice(-3)),
  );
  await page.screenshot({ path: `${OUT}/rail-drag.png` });
  await undo();
  check('rail: one Undo puts it back', same(await order(), start));

  // 5. A file dropped where nothing takes it is refused, not navigated to.
  const stray = await page.evaluate(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['{}'], 'stray.json', { type: 'application/json' }));
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.querySelector('#print-root').dispatchEvent(over);
    const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer });
    document.querySelector('#print-root').dispatchEvent(drop);
    const text = new DataTransfer();
    text.setData('text/plain', 'words');
    const inPage = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: text });
    document.querySelector('#print-root').dispatchEvent(inPage);
    return { over: over.defaultPrevented, effect: transfer.dropEffect, drop: drop.defaultPrevented, textLeftAlone: !inPage.defaultPrevented };
  });
  check('a stray file held over the editor is refused (cancelled, "not allowed")', stray.over && stray.effect === 'none');
  check('a stray file dropped on the editor is cancelled, so the window cannot navigate to it', stray.drop);
  check('an in-page drag (no file) is left alone by that guard', stray.textLeftAlone);

  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
