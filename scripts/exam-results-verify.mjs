import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that Exam results (k-0471, GitHub #6) works end to end, in English
 * and in 繁體中文: open the sample paper (3 MC + 1 structured question), Marking scheme → Layout →
 * Enter results…, type a % for two MC questions and both comments, Save; the key then prints
 * "B (65%)" and a Candidates' performance section; the switch takes the % off again; Undo
 * removes the results in one step.
 *
 *   node scripts/exam-results-verify.mjs [--out=/tmp/exam-results-verify] [--url=http://localhost:3000] [--width=1512]
 *
 * Needs a running dev server at the URL and Chrome (playwright's `channel: 'chrome'`). The
 * `.docx`, clipboard and stored shape are proved by `src/render/examResultsKey.test.ts`,
 * `src/components/editor/examResultsDialog.test.tsx` and `src/model/backwardCompat.test.ts`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/exam-results-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const WIDTH = Number(opt('width', '1512'));
mkdirSync(OUT, { recursive: true });
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const WORDS = {
  en: {
    sample: 'Open a sample paper', markingScheme: 'Marking scheme', layout: 'Layout', enter: 'Enter results…',
    edit: 'Edit results…', save: 'Save', q: (n) => `Question ${n}, % correct`, mc: 'MC · English',
    sq: 'Structured questions (SQ, LQ) · English', sqZh: 'Structured questions (SQ, LQ) · 中文',
    showPercent: 'MC % correct, e.g. “A (65%)”', summary: '% correct for 2 of 3 MC', undo: /^Undo/,
    heading: 'Candidates’ performance',
  },
  'zh-HK': {
    sample: '開啟示例試卷', markingScheme: '評卷參考', layout: '版面', enter: '輸入考試結果…',
    edit: '編輯考試結果…', save: '儲存', q: (n) => `第 ${n} 題答對百分比`, mc: 'MC · 英文',
    sq: '結構題（SQ、LQ） · 英文', sqZh: '結構題（SQ、LQ） · 中文',
    showPercent: 'MC 答對百分比，例如「A (65%)」', summary: '已填 2／3 題 MC 答對百分比', undo: /^復原/,
    heading: '考生表現',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: WIDTH, height: 1000 }, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([version, language]) => {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'bilingual' }));
      },
      [APP_VERSION, ui],
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: w.sample }).first().click();
    await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);

    await page.getByRole('radio', { name: w.markingScheme }).first().click();
    await page.waitForTimeout(800);
    await page.getByRole('tab', { name: w.layout }).click();
    const section = page.locator('[data-exam-results-section]');
    await section.scrollIntoViewIfNeeded();
    check(`[${tag}] the Layout tab offers Enter results…`, (await section.getByRole('button', { name: w.enter }).count()) === 1);

    await section.getByRole('button', { name: w.enter }).click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor();
    const rows = await dialog.locator('[data-percent-row]').count();
    check(`[${tag}] the dialog has a row per MC question`, rows === 3, String(rows));
    await dialog.getByLabel(w.q(1)).fill('65');
    await dialog.getByLabel(w.q(1)).press('Enter');
    const focused = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    check(`[${tag}] Enter moves to the next question`, focused === w.q(2), String(focused));
    await dialog.getByLabel(w.q(3)).fill('140');
    const saveDisabled = await dialog.getByRole('button', { name: w.save, exact: true }).isDisabled();
    check(`[${tag}] a % over 100 cannot be saved`, saveDisabled);
    await dialog.getByLabel(w.q(3)).fill('42');
    await dialog.getByLabel(w.mc, { exact: true }).fill('Q2 was the hardest: many candidates chose D.\nQ3 was well answered.');
    await dialog.getByLabel(w.sq, { exact: true }).fill('Many candidates drew the supply curve shifting the wrong way.');
    await dialog.getByLabel(w.sqZh, { exact: true }).fill('不少考生把供應曲線移錯方向。');
    await page.screenshot({ path: `${OUT}/${tag}-dialog.png` });
    await dialog.getByRole('button', { name: w.save, exact: true }).click();
    await dialog.waitFor({ state: 'detached' });
    await page.waitForTimeout(800);

    const keyText = async () => (await page.locator('#print-root').innerText()).replace(/\s+/g, ' ');
    let text = await keyText();
    check(`[${tag}] the key prints the % beside the letter`, /[A-D—] \(65%\)/.test(text) && /\(42%\)/.test(text), text.slice(0, 400));
    check(`[${tag}] the key ends with Candidates’ performance`, text.includes('Candidates’ performance') && text.includes('考生表現') && text.includes('Q3 was well answered.'));
    check(`[${tag}] the Layout tab says what is entered`, (await section.innerText()).includes(w.summary), await section.innerText());
    await page.locator('#print-root').getByText('Candidates’ performance').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${tag}-key-end.png` });
    await page.locator('#print-root .paper').first().evaluate((el) => el.scrollIntoView());
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/${tag}-key-top.png` });

    await section.getByLabel(w.showPercent).uncheck();
    await page.waitForTimeout(500);
    text = await keyText();
    check(`[${tag}] the switch takes the % off the key`, !text.includes('(65%)'));
    await section.getByLabel(w.showPercent).check();
    await page.waitForTimeout(300);

    // Two steps back: the switch, then the results.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.waitForTimeout(500);
    text = await keyText();
    check(`[${tag}] undo removes the results in one step`, !text.includes('(65%)') && !text.includes('Q3 was well answered.'), text.slice(-300));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
