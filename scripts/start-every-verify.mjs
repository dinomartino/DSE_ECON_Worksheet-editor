import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that the paper-wide "Start every question on a new page" works, in English
 * and in 繁體中文, on `test-fixtures/manual/page-flow-mix.json` (a classroom worksheet of five
 * structured questions in two sections, then an MC): Setup → Page → the switch (real clicks), the
 * sheets the preview packs, the page rail, the heading that goes with the question it introduces,
 * a question's own boxes beside it, Undo / Redo as one step, a reload, the start screen's card, and
 * the `.docx` the real Export dialog writes (a hard page break before every question but the first).
 *
 *   node scripts/start-every-verify.mjs [--out=/tmp/start-every-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (set CHROME to its path on
 * Linux). A Paper 1 ignoring the switch is proved by `src/render/startEveryQuestion.test.ts`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/start-every-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/page-flow-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Page flow mix';
const [Q1, Q2, Q3, Q4, Q5, Q6] = document_.questions.map((q) => q.id);
const [HEAD_A, HEAD_B] = document_.layout.filter((e) => e.kind === 'section').map((e) => e.id);
const NAMES = { [Q1]: 'Q1', [Q2]: 'Q2', [Q3]: 'Q3', [Q4]: 'Q4', [Q5]: 'Q5', [Q6]: 'Q6', [HEAD_A]: 'A', [HEAD_B]: 'B' };

let devServer;
if (!(await fetch(URL_BASE).then((r) => r.ok).catch(() => false))) {
  console.log(`dev server not running at ${URL_BASE} — starting one`);
  devServer = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });
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
  en: {
    setup: /^Setup/,
    tabPage: /^Page/,
    every: 'Start every question on a new page',
    hint: ['Each question begins a page', 'with the heading, lead-in or source above it'],
    start: 'Start on a new page',
    keep: 'Keep this question on one page',
    undo: /^Undo/,
    redo: /^Redo/,
    home: /Econ Studio/,
    exportButton: /Export…/,
  },
  'zh-HK': {
    setup: /^頁面設定/,
    tabPage: /^頁面/,
    every: '每題由新頁開始',
    hint: ['每一題都由新頁開始', '其上方的標題、引言或資料會一併移到新頁'],
    start: '此題由新頁開始',
    keep: '此題保持在同一頁',
    undo: /^復原/,
    redo: /^重做/,
    home: /Econ Studio/,
    exportButton: /匯出…/,
  },
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', ...(chromePath ? { executablePath: chromePath } : {}) });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(
      ([version, language, indexJson, key, body]) => {
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem('econ-worksheet-last-seen-version', version);
          window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
          window.localStorage.setItem('econ-worksheet-index', indexJson);
          window.localStorage.setItem(key, body);
        }
        delete window.showSaveFilePicker;
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
      await page.waitForTimeout(2500);
    };
    await openPaper();
    const settle = () => page.waitForTimeout(1300);

    const sheets = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#print-root .paper')].map((sheet) => [
          ...new Set([...sheet.querySelectorAll('[data-flow-id]')].map((e) => e.getAttribute('data-flow-id'))),
        ]),
      );
    const railFirsts = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button[draggable="true"]')].map((card) => card.querySelector('[data-flow-id]')?.getAttribute('data-flow-id') ?? null),
      );
    const named = (list) => list.map((ids) => ids.map((id) => NAMES[id] ?? id).join(' '));
    const onPage = (id) => page.locator(`#print-root [data-flow-id="${id}"]`).first();
    const selectQuestion = async (id) => {
      await onPage(id).scrollIntoViewIfNeeded();
      const box = await onPage(id).boundingBox();
      await page.mouse.click(box.x + box.width - 12, box.y + 6);
      await settle();
    };
    const setSwitch = async (on) => {
      await page.getByRole('button', { name: w.setup }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByRole('tab', { name: w.tabPage }).click();
      const box = dialog.getByLabel(w.every, { exact: true });
      const text = (await dialog.textContent()) ?? '';
      const before = await box.isChecked();
      if (on) await box.check();
      else await box.uncheck();
      await settle();
      await page.screenshot({ path: `${OUT}/${tag}-setup-${on ? 'on' : 'off'}.png` });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await settle();
      return { before, text };
    };

    const START = [[HEAD_A, Q1, Q2, Q3], [Q3, HEAD_B, Q4, Q5], [Q5, Q6]];
    const EVERY = [[HEAD_A, Q1], [Q2], [Q3], [HEAD_B, Q4], [Q5], [Q6]];

    // A. As saved.
    check(`[${tag}] opens as any saved paper: three sheets`, same(await sheets(), START), named(await sheets()).join(' | '));

    // B. Setup → Page: off by default, with its hint; ticking it.
    const first = await setSwitch(true);
    check(`[${tag}] the Page tab offers the switch, unticked on a saved paper`, first.before === false);
    check(`[${tag}] … with a hint that says the heading, lead-in or source goes along`, w.hint.every((part) => first.text.includes(part)), first.text.slice(0, 200));
    check(`[${tag}] ticking it puts every question on its own sheet, the heading with its question`, same(await sheets(), EVERY), named(await sheets()).join(' | '));
    check(`[${tag}] … and the rail has a card for each, the Section B card beginning with its heading`, same(await railFirsts(), [HEAD_A, Q2, Q3, HEAD_B, Q5, Q6]), JSON.stringify((await railFirsts()).map((id) => NAMES[id] ?? id)));
    check(`[${tag}] … and no air is drawn above what opens a sheet`, await page.evaluate(([b, q2]) => {
      return [b, q2].every((id) => {
        const el = document.querySelector(`#print-root [data-flow-id="${id}"]`);
        return el.getBoundingClientRect().top - el.closest('.paper').getBoundingClientRect().top < 160;
      });
    }, [HEAD_B, Q2]));
    await page.screenshot({ path: `${OUT}/${tag}-every.png` });

    // C. Undo / Redo are one step.
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] Undo takes it back in one step`, same(await sheets(), START), named(await sheets()).join(' | '));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] Redo puts it back`, same(await sheets(), EVERY), named(await sheets()).join(' | '));

    // D. A question's own boxes still work beside the switch.
    await selectQuestion(Q3);
    const startBox = page.getByLabel(w.start, { exact: true });
    const keepBox = page.getByLabel(w.keep, { exact: true });
    check(`[${tag}] a structured question’s panel still offers both boxes`, (await startBox.count()) === 1 && (await keepBox.count()) === 1);
    await keepBox.check();
    await startBox.check();
    await settle();
    check(`[${tag}] ticking them under the switch changes nothing on the page (Q3 already fits a sheet)`, same(await sheets(), EVERY), named(await sheets()).join(' | '));
    await startBox.uncheck();
    await keepBox.uncheck();
    await settle();
    check(`[${tag}] … and the switch alone still opens the sheet at Q3 once they are cleared`, same(await sheets(), EVERY), named(await sheets()).join(' | '));

    // E. The .docx has a hard page break before every question but the first (English).
    if (ui === 'en') {
      await page.getByRole('button', { name: w.exportButton }).first().click();
      const exporter = page.getByRole('dialog');
      await exporter.getByText('.docx', { exact: true }).click();
      await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true }).click();
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 60_000 }),
        exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
      ]);
      const zip = await JSZip.loadAsync(readFileSync(await download.path()));
      const xml = await zip.file('word/document.xml').async('string');
      const breaks = [...xml.matchAll(/w:br w:type="page"/g)].map((m) => m.index);
      check(`[${tag}] the .docx has five hard page breaks, one fewer than the sheets`, breaks.length === 5, String(breaks.length));
      const at = (text) => xml.indexOf(text);
      check(
        `[${tag}] … one before each of Questions 2 and 3, Section B (the heading, not Question 4), Question 5 and the MC`,
        breaks.length === 5 &&
          at('Question 1:') < breaks[0] && breaks[0] < at('Question 2:') &&
          at('Question 2:') < breaks[1] && breaks[1] < at('Question 3:') &&
          at('Question 3:') < breaks[2] && breaks[2] < at('Section B:') && at('Section B:') < at('Question 4:') &&
          at('Question 4:') < breaks[3] && breaks[3] < at('Question 5:') &&
          at('Question 5:') < breaks[4],
        JSON.stringify({ breaks, q1: at('Question 1:'), q2: at('Question 2:'), q3: at('Question 3:'), b: at('Section B:'), q4: at('Question 4:'), q5: at('Question 5:') }),
      );
      check(`[${tag}] … no break is a paragraph of its own, and the file carries no keep flags`, !/<w:p><w:r><w:br w:type="page"\/><\/w:r><\/w:p>/.test(xml) && !xml.includes('w:keepNext') && !xml.includes('w:pageBreakBefore'));
      await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
    }

    // F. Saved with the paper.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper();
    check(`[${tag}] after a reload the sheets are the same`, same(await sheets(), EVERY), named(await sheets()).join(' | '));

    // G. The start screen's card ends its first page before Question 2.
    await page.getByRole('link', { name: w.home }).or(page.getByRole('button', { name: w.home })).first().click();
    await page.waitForTimeout(2500);
    const card = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.shadowRoot && el.shadowRoot.querySelector('.page')) return el.shadowRoot.textContent;
      }
      return '';
    });
    check(`[${tag}] the document’s card shows Question 1 and stops before Question 2`, card.includes('Question 1:') && !card.includes('Question 2:'), card.replace(/\s+/g, ' ').slice(-200));
    await page.screenshot({ path: `${OUT}/${tag}-card.png` });

    // H. Off again puts the paper back exactly.
    await openPaper();
    await setSwitch(false);
    check(`[${tag}] clearing the switch puts the three sheets back`, same(await sheets(), START), named(await sheets()).join(' | '));

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
