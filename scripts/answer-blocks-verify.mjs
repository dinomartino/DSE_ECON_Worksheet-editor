import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that a model answer holds blocks (u-0c5q): tables, pictures, several
 * diagrams and more text after the answer's text, teacher-only.
 *
 * Seeds the frozen v4 corpus (`src/test/corpus/v4-answer-blocks.json`: an essay answered with
 * text, a table and a picture; a part answered with text, a paragraph, a table and two
 * diagrams; a sub-part answered with a figure grid; a part with the old text + one model
 * diagram). English at 1440 (mouse), then 中文 at iPad width (1180, touch):
 *  - the Student view shows no trace of any answer; the Teacher view shows every block;
 *  - the right panel's teacher area offers "More in the answer" with the stem's Add row and
 *    lists the old model diagram as a block; Add → Text gives a field typed in the panel,
 *    and what is typed prints on the page (Teacher view) and not on the student copy.
 *
 *   node scripts/answer-blocks-verify.mjs [--url=http://localhost:3000] [--out=/tmp/answer-blocks-verify]
 *   node scripts/answer-blocks-verify.mjs --old --url=<a 0.10.x build> [--out=…]
 *
 * `--old`: a release (0.10.x, before v4) opens the same file read-only under the "newer version" bar,
 * without a page error, the answers' text still on its Teacher view and nothing of the
 * answers on its Student view.
 *
 * Needs a running dev server and Chrome (CHROME, default /opt/google/chrome/chrome).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OLD = args.includes('--old');
const OUT = opt('out', '/tmp/answer-blocks-verify');
mkdirSync(OUT, { recursive: true });

const corpus = JSON.parse(readFileSync(new URL('../src/test/corpus/v4-answer-blocks.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });

try {
  for (const [label, size, zh] of [
    ['en-mac', { width: 1440, height: 900 }, false],
    ['zh-ipad', { width: 1180, height: 820 }, true],
  ]) {
    const doc = structuredClone(corpus);
    const key = `econ-worksheet:${doc.id}`;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: zh });
    await context.addInitScript(
      ([version, index, k, body, ui, paper]) => {
        if (!localStorage.getItem(k)) {
          localStorage.setItem('econ-worksheet-last-seen-version', version);
          localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui, paper }));
          localStorage.setItem('econ-worksheet-index', index);
          localStorage.setItem(k, body);
        }
      },
      [APP_VERSION, JSON.stringify([{ id: doc.id, title: 'Answer blocks verify', updatedAt: doc.updatedAt }]), key, JSON.stringify(doc), zh ? 'zh-HK' : 'en', zh ? 'zh' : 'en'],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Answer blocks verify/ }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
    await page.waitForTimeout(1500);

    const words = zh
      ? { table: '總收入（元）', more: '價格由 P1 升至 P2：', student: '學生版', teacher: '教師版', group: '答案的其他內容', addText: '加入文字', typed: '在面板輸入的答案。', stem: '政府徵收從量稅。' }
      : { table: 'Total revenue ($)', more: 'Price rises from P1 to P2:', student: 'Student', teacher: 'Teacher', group: 'More in the answer', addText: 'Add text', typed: 'Typed in the panel.', stem: 'The government imposes a per-unit tax.' };
    const pageText = () => page.locator('#print-root').innerText();
    const go = async (locator) => (zh ? locator.tap() : locator.click());

    if (OLD) {
      const bar = page.getByRole('status').filter({ hasText: zh ? /較新版本|新版本/ : /newer version/i });
      check(`${label}: the older build says the file is from a newer version`, (await bar.count()) > 0);
      await go(page.getByText(words.teacher, { exact: true }).first());
      await page.waitForTimeout(800);
      const teacher = await pageText();
      const answerText = zh ? ['A 公司收入較多：', '供應下降。', 'E2。'] : ['Firm A earns more:', 'Supply falls.', 'E2.'];
      check(`${label}: its Teacher view still prints every answer's text`, answerText.every((t) => teacher.includes(t)));
      await page.screenshot({ path: `${OUT}/old-${label}-teacher.png` });
      await go(page.getByText(words.student, { exact: true }).first());
      await page.waitForTimeout(800);
      const student = await pageText();
      check(`${label}: its Student view prints no answer`, !answerText.some((t) => student.includes(t)));
      const stored = await page.evaluate((k) => localStorage.getItem(k), key);
      check(`${label}: it never rewrites the file`, stored === JSON.stringify(doc));
      check(`${label}: no page error (${errors.join(' | ')})`, errors.length === 0);
      await context.close();
      continue;
    }

    await go(page.getByText(words.student, { exact: true }).first());
    await page.waitForTimeout(800);
    let text = await pageText();
    check(`${label}: Student view shows no answer table or paragraph`, !text.includes(words.table) && !text.includes(words.more));
    const studentFigures = await page.locator('#print-root [data-figure-block], #print-root svg').count();

    await go(page.getByText(words.teacher, { exact: true }).first());
    await page.waitForTimeout(1000);
    text = await pageText();
    check(`${label}: Teacher view shows the answer's table and its paragraph`, text.includes(words.table) && text.includes(words.more));
    const teacherFigures = await page.locator('#print-root [data-figure-block], #print-root svg').count();
    check(`${label}: Teacher view shows more figures (pictures, diagrams, grid)`, teacherFigures > studentFigures, `${studentFigures} → ${teacherFigures}`);
    await page.locator('#print-root').getByText(words.more).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${label}-teacher-page.png` });

    // Select the parted question, show its panel (the Edit tab), open part (a).
    await go(page.locator('#print-root').getByText(words.stem).first());
    await page.waitForTimeout(800);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const groups = page.getByText(words.group, { exact: true });
    if ((await groups.count()) === 0) {
      // Part rows start folded: open (a) by its row toggle.
      await go(page.locator(`button[title="${zh ? '在頁面上顯示' : 'Show on the page'}"][aria-expanded="false"]`).first());
      await page.waitForTimeout(800);
    }
    await page.screenshot({ path: `${OUT}/${label}-panel-before.png` });
    check(`${label}: the panel offers "${words.group}"`, (await groups.count()) > 0, String(await groups.count()));
    const area = page.locator('[data-panel-anchor^="teacher:"]').filter({ has: groups.first() }).first();
    await area.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${label}-panel.png` });
    check(`${label}: the answer's blocks are listed (table, diagrams)`, (await area.locator('[data-edit-target^="blockText:"]').count()) >= 3, String(await area.locator('[data-edit-target^="blockText:"]').count()));
    check(`${label}: no source panel in an answer`, (await area.getByText(zh ? '資料' : 'Source', { exact: true }).count()) === 0);

    // Add → Text, type into the new field.
    const before = await area.locator('[role="textbox"]').count();
    await go(area.getByRole('button', { name: words.addText }));
    await page.waitForTimeout(500);
    const fields = area.locator('[role="textbox"]');
    check(`${label}: Add → Text gives a field in the panel`, (await fields.count()) > before, `${before} → ${await fields.count()}`);
    const field = fields.nth(before);
    await field.click();
    await page.keyboard.type(words.typed);
    await page.waitForTimeout(800);
    text = await pageText();
    check(`${label}: what is typed prints on the page (Teacher view)`, text.includes(words.typed));
    await page.screenshot({ path: `${OUT}/${label}-typed.png` });
    await go(page.getByText(words.student, { exact: true }).first());
    await page.waitForTimeout(800);
    check(`${label}: … and not on the student copy`, !(await pageText()).includes(words.typed));
    const stored = await page.evaluate((k) => localStorage.getItem(k), key);
    check(`${label}: saved, still at schema 4`, JSON.parse(stored).schemaVersion === 4 && stored.includes(words.typed));

    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
