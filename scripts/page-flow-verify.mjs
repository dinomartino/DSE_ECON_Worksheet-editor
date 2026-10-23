import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that a question can be kept on one page and started on a new one, in
 * English and in 繁體中文, on `test-fixtures/manual/page-flow-mix.json` (a classroom worksheet of
 * five structured questions in two sections, then an MC: left alone, page 1 ends inside Q3 and page 2
 * inside Q5). The question panel's two checkboxes (real clicks), the sheets the preview packs, the
 * page rail's cards, the heading that goes with the question it introduces, the notes a tick that
 * changes nothing prints, ⌘Z and Redo, the start screen's card, a reload, and the `.docx` the real
 * Export dialog writes (its sheets break where the preview's do).
 *
 *   node scripts/page-flow-verify.mjs [--out=/tmp/page-flow-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving, and stops it again. Needs Chrome
 * (playwright's `channel: 'chrome'`; set CHROME to its path on Linux). Every click is a real pointer
 * event. Copy for Word and the bank's preview are proved by `src/render/pageFlowSurfaces.test.tsx`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/page-flow-verify');
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
    start: 'Start on a new page',
    keep: 'Keep this question on one page',
    keepHint: ['the whole question moves to the next page', 'taller than a page is still split'],
    noteFirst: 'already opens the paper',
    noteNoSpace: 'no space is left above it',
    spaceAbove: 'Space above',
    lines: (n) => (n === 1 ? '1 line' : `${n} lines`),
    undo: /^Undo/,
    redo: /^Redo/,
    pages: (n) => new RegExp(`${n} pages`),
    home: /Econ Studio/,
    exportButton: /Export…/,
  },
  'zh-HK': {
    start: '此題由新頁開始',
    keep: '此題保持在同一頁',
    keepHint: ['整題會移到下一頁', '高於一頁的題目仍會分頁'],
    noteFirst: '本來就在試卷開首',
    noteNoSpace: '上方不留空位',
    spaceAbove: '上方空位',
    lines: (n) => `${n} 行`,
    undo: /^復原/,
    redo: /^重做/,
    pages: (n) => new RegExp(`${n} 頁`),
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
        // Seeds the saved paper only the first time: a reload must find what the editor saved.
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem('econ-worksheet-last-seen-version', version);
          window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
          window.localStorage.setItem('econ-worksheet-index', indexJson);
          window.localStorage.setItem(key, body);
        }
        // A save picker would wait for a person; the download it falls back to is the same file.
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

    /** The ids on each printed sheet, in order (a question cut across two sheets is on both). */
    const sheets = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#print-root .paper')].map((sheet) => [
          ...new Set([...sheet.querySelectorAll('[data-flow-id]')].map((e) => e.getAttribute('data-flow-id'))),
        ]),
      );
    /** The page rail's cards (clones of the sheets): the first thing on each. */
    const railFirsts = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button[draggable="true"]')].map((card) => card.querySelector('[data-flow-id]')?.getAttribute('data-flow-id') ?? null),
      );
    const named = (list) => list.map((ids) => ids.map((id) => NAMES[id] ?? id).join(' '));
    const sheetsOf = async (id) => (await sheets()).map((ids, i) => (ids.includes(id) ? i + 1 : 0)).filter(Boolean);
    const onPage = (id) => page.locator(`#print-root [data-flow-id="${id}"]`).first();
    // A click on the question's own top line, at the right edge where no text sits, selects the
    // question and opens its panel; a click on text would pick that block instead.
    const selectQuestion = async (id) => {
      await onPage(id).scrollIntoViewIfNeeded();
      const box = await onPage(id).boundingBox();
      await page.mouse.click(box.x + box.width - 12, box.y + 6);
      await settle();
    };
    const startBox = () => page.getByLabel(w.start, { exact: true });
    const keepBox = () => page.getByLabel(w.keep, { exact: true });

    const START = [[HEAD_A, Q1, Q2, Q3], [Q3, HEAD_B, Q4, Q5], [Q5, Q6]];

    // A. As saved: nothing set, page 1 ends inside Q3 and page 2 inside Q5.
    check(`[${tag}] opens as any saved paper: three sheets, Q3 and Q5 cut across two`, same(await sheets(), START), named(await sheets()).join(' | '));
    check(`[${tag}] … and the page rail has a card for each`, (await railFirsts()).length === 3, JSON.stringify(await railFirsts()));
    check(`[${tag}] … and the status line says 3 pages`, w.pages(3).test((await page.locator('body').textContent()) ?? ''));

    // B. A structured question's panel: both choices, unticked, with what keeping does.
    await selectQuestion(Q3);
    check(`[${tag}] a structured question’s panel offers both choices, neither ticked`, (await startBox().count()) === 1 && (await keepBox().count()) === 1 && !(await startBox().isChecked()) && !(await keepBox().isChecked()));
    const panelText = (await page.locator('aside, [role="complementary"]').last().textContent().catch(() => '')) ?? '';
    const bodyText = (await page.locator('body').textContent()) ?? '';
    check(`[${tag}] … and says what keeping does, and that a question taller than a page is still split`, w.keepHint.every((part) => bodyText.includes(part)), panelText.slice(0, 200));
    await page.screenshot({ path: `${OUT}/${tag}-panel.png` });

    // C. Keep Q3 on one page.
    await keepBox().check();
    await settle();
    const KEEP = [[HEAD_A, Q1, Q2], [Q3, HEAD_B, Q4], [Q4, Q5, Q6]];
    check(`[${tag}] ticking Keep moves Q3 whole to sheet 2`, same(await sheets(), KEEP), named(await sheets()).join(' | '));
    check(`[${tag}] … so Q3 is on one sheet only`, same(await sheetsOf(Q3), [2]), JSON.stringify(await sheetsOf(Q3)));
    check(`[${tag}] … leaving the foot of page 1 empty`, await page.evaluate(([q2]) => {
      const sheet = document.querySelector('#print-root .paper');
      const last = [...sheet.querySelectorAll(`[data-flow-id="${q2}"]`)].pop();
      return sheet.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom > 160;
    }, [Q2]));
    check(`[${tag}] … and the rail follows: its cards begin with the sheets’ first items`, same(await railFirsts(), [HEAD_A, Q3, Q4]), JSON.stringify((await railFirsts()).map((id) => NAMES[id] ?? id)));
    await page.screenshot({ path: `${OUT}/${tag}-keep-q3.png` });
    // Undo is one step; the toolbar’s own button, so the focus on the checkbox does not matter.
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] Undo takes it back in one step: Q3 is cut across two sheets again`, same(await sheets(), START), named(await sheets()).join(' | '));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] Redo puts it back`, same(await sheets(), KEEP), named(await sheets()).join(' | '));

    // D. Start Q4 on a new page: the heading above it goes with it.
    await selectQuestion(Q4);
    await startBox().check();
    await settle();
    const FLOW = [[HEAD_A, Q1, Q2], [Q3], [HEAD_B, Q4, Q5, Q6]];
    check(`[${tag}] ticking Start on Q4 opens sheet 3 at Section B’s heading, with Q4 under it`, same(await sheets(), FLOW), named(await sheets()).join(' | '));
    check(`[${tag}] … so the heading is not left at the foot of page 2`, !(await sheetsOf(HEAD_B)).includes(2), JSON.stringify(await sheetsOf(HEAD_B)));
    check(`[${tag}] … and the rail has three cards, the last beginning with the heading`, same(await railFirsts(), [HEAD_A, Q3, HEAD_B]), JSON.stringify((await railFirsts()).map((id) => NAMES[id] ?? id)));
    check(`[${tag}] … and the status line says 3 pages`, w.pages(3).test((await page.locator('body').textContent()) ?? ''));
    check(`[${tag}] no air is drawn above what opens the sheet (the heading’s own gap would die there)`, await page.evaluate(([b]) => {
      const el = document.querySelector(`#print-root [data-flow-id="${b}"]`);
      const top = el.closest('.paper').getBoundingClientRect().top;
      return el.getBoundingClientRect().top - top < 160;
    }, [HEAD_B]));
    await page.screenshot({ path: `${OUT}/${tag}-start-q4.png` });

    // E. An MC can start a page too, and has no choice to keep.
    await selectQuestion(Q6);
    check(`[${tag}] an MC’s panel offers Start on a new page and no Keep choice`, (await startBox().count()) === 1 && (await keepBox().count()) === 0);
    await startBox().check();
    await settle();
    check(`[${tag}] ticking it opens a fourth sheet at the MC`, same(await sheets(), [[HEAD_A, Q1, Q2], [Q3], [HEAD_B, Q4, Q5], [Q6]]), named(await sheets()).join(' | '));
    await startBox().uncheck();
    await settle();
    check(`[${tag}] clearing it puts the MC back under Q5`, same(await sheets(), FLOW), named(await sheets()).join(' | '));

    // F. A tick that changes nothing says so, and moves nothing.
    await selectQuestion(Q1);
    await startBox().check();
    await settle();
    check(`[${tag}] ticking Start on the first question moves nothing`, same(await sheets(), FLOW), named(await sheets()).join(' | '));
    const firstNote = (await page.getByTestId('start-on-new-page-note').textContent().catch(() => '')) ?? '';
    check(`[${tag}] … and says it already opens the paper`, firstNote.includes(w.noteFirst), firstNote);
    await page.screenshot({ path: `${OUT}/${tag}-first-note.png` });
    await startBox().uncheck();
    await settle();
    check(`[${tag}] … and the note goes with the tick`, (await page.getByTestId('start-on-new-page-note').count()) === 0);

    // G. Space above on a question that starts a page: nothing is left above it, and the panel says so.
    await selectQuestion(Q5);
    await page.getByLabel(w.spaceAbove).first().selectOption({ label: w.lines(4) });
    await settle();
    await startBox().check();
    await settle();
    const spaceNote = (await page.getByTestId('space-above-note').textContent().catch(() => '')) ?? '';
    check(`[${tag}] a number on a question that starts a page says no space is left above it`, spaceNote.includes(w.noteNoSpace), spaceNote);
    check(`[${tag}] … and Q5 now opens its own sheet`, same(await sheets(), [[HEAD_A, Q1, Q2], [Q3], [HEAD_B, Q4], [Q5, Q6]]), named(await sheets()).join(' | '));
    await page.screenshot({ path: `${OUT}/${tag}-space-note.png` });
    await startBox().uncheck();
    await page.getByLabel(w.spaceAbove).first().selectOption({ index: 0 });
    await settle();
    check(`[${tag}] … and clearing both leaves the sheets as they were`, same(await sheets(), FLOW), named(await sheets()).join(' | '));

    // H. The .docx the real Export dialog writes breaks its pages where the sheets do (English).
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
      check(`[${tag}] the .docx has two hard page breaks, one fewer than the sheets`, breaks.length === 2, String(breaks.length));
      const at = (text) => xml.indexOf(text);
      check(
        `[${tag}] … Question 3 starts the second page and Section B the third (the break rides before the heading)`,
        breaks.length === 2 && at('Question 2:') < breaks[0] && breaks[0] < at('Question 3:') && at('Question 3:') < breaks[1] && breaks[1] < at('Section B:') && at('Section B:') < at('Question 4:'),
        JSON.stringify({ breaks, q2: at('Question 2:'), q3: at('Question 3:'), b: at('Section B:'), q4: at('Question 4:') }),
      );
      check(`[${tag}] … and no break is a paragraph of its own (it would spend a line and could spill a blank page)`, !/<w:p><w:r><w:br w:type="page"\/><\/w:r><\/w:p>/.test(xml));
      check(`[${tag}] … and the file carries no keep flags, as ever`, !xml.includes('w:keepNext') && !xml.includes('w:keepLines') && !xml.includes('w:pageBreakBefore'));
      await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
    }

    // I. The choices are saved with the paper: a reload finds the same sheets and the same ticks.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper();
    check(`[${tag}] after a reload the sheets are the same`, same(await sheets(), FLOW), named(await sheets()).join(' | '));
    await selectQuestion(Q3);
    check(`[${tag}] … Q3 still says keep`, await keepBox().isChecked());
    await selectQuestion(Q4);
    check(`[${tag}] … and Q4 still says start on a new page`, await startBox().isChecked());

    // J. The start screen’s card ends its first page at a question that starts a page.
    await selectQuestion(Q2);
    await startBox().check();
    await settle();
    await page.waitForTimeout(1500);
    await page.getByRole('link', { name: w.home }).or(page.getByRole('button', { name: w.home })).first().click();
    await page.waitForTimeout(2500);
    const card = await page.evaluate(() => {
      for (const el of document.querySelectorAll('*')) {
        if (el.shadowRoot && el.shadowRoot.querySelector('.page')) return el.shadowRoot.textContent;
      }
      return '';
    });
    check(`[${tag}] with Q2 starting a page, the document’s card shows Question 1 and stops before Question 2`, card.includes('Question 1:') && !card.includes('Question 2:'), card.replace(/\s+/g, ' ').slice(-200));
    await page.screenshot({ path: `${OUT}/${tag}-card.png` });

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
