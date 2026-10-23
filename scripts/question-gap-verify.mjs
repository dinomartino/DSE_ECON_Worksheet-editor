import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that the space between questions is the teacher's on every paper shape,
 * in English and in 繁體中文, on `test-fixtures/manual/question-gap-mix.json` (a classroom
 * worksheet: ten MC, then three structured questions): Setup → Page → Between questions, a
 * question's Space above in its panel and the note it prints when the number cannot be used, the
 * drag handle in the page's margin (a real pointer drag), what the page and the page rail's
 * thumbnails draw, the gap shedding itself at the top of a sheet, ⌘Z, and the `.docx` the real
 * Export dialog writes.
 *
 *   node scripts/question-gap-verify.mjs [--out=/tmp/question-gap-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving, and stops it again. Needs Chrome
 * (playwright's `channel: 'chrome'`). A native `<select>` is chosen with `selectOption`; every
 * click, hover and drag is a real pointer event. The other surfaces (cards, Copy for Word, a booklet)
 * are proved by `src/render/questionGapSurfaces.test.tsx` and `npm run samples`.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/question-gap-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/question-gap-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Question gap mix';
const IDS = document_.questions.map((q) => q.id);
const MC = IDS.slice(0, 10);
const [S1, S2, S3] = IDS.slice(10);

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
    setup: /^Setup/,
    tabPage: /^Page/,
    between: 'Between questions',
    defaultOption: 'Default: 1 line',
    lines: (n) => (n === 1 ? '1 line' : `${n} lines`),
    hint: ['two questions of the same kind', 'two MC questions, or two structured questions', 'keeps the usual spacing'],
    spaceAbove: 'Space above',
    paperDefault: (n) => (n === 1 ? 'Paper default (1 line)' : `Paper default (${n} lines)`),
    noteUnlike: 'The question above is a different kind',
    noteAfter: 'Something else sits above this one',
    pill: 'Drag to adjust the gap above this question',
    exportButton: /Export…/,
  },
  'zh-HK': {
    setup: /^頁面設定/,
    tabPage: /^頁面/,
    between: '題目之間',
    defaultOption: '預設：1 行',
    lines: (n) => `${n} 行`,
    hint: ['同類型的兩題', '兩條 MC 題，或兩條結構題', '維持一般間距'],
    spaceAbove: '上方空位',
    paperDefault: (n) => `試卷預設（${n} 行）`,
    noteUnlike: '上一題是另一種類型',
    noteAfter: '這題上方是其他內容',
    pill: '拖曳以調整此題目上方的間距',
    exportButton: /匯出…/,
  },
};

const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(
      ([version, language, indexJson, key, body]) => {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, body);
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
    await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
    await page.waitForTimeout(2500);
    const settle = () => page.waitForTimeout(1000);

    /** Each flow item on the page: the gap its carrier asks for and the gap actually drawn, in pt. */
    const gaps = () =>
      page.evaluate(() => {
        const out = {};
        for (const el of document.querySelectorAll('#print-root [data-flow-id]')) {
          const id = el.getAttribute('data-flow-id');
          if (id in out) continue;
          const carrier = el.querySelector('[data-gap-carrier]');
          out[id] = {
            asked: carrier ? carrier.style.marginTop : null,
            drawn: carrier ? Math.round(parseFloat(getComputedStyle(carrier).marginTop) * 0.75 * 10) / 10 : null,
            leads: Boolean(el.closest('.leads-sheet')),
          };
        }
        return out;
      });
    /** The gap carriers in the page rail's thumbnails (clones of the sheets) asking for `pt`. */
    const railCarriers = (pt) =>
      page.evaluate(
        (value) =>
          [...document.querySelectorAll('button[draggable="true"] [data-gap-carrier]')].filter((el) => el.style.marginTop === value)
            .length,
        pt,
      );
    const asked = async (ids) => {
      const g = await gaps();
      return ids.map((id) => g[id]?.asked ?? null);
    };
    const openSetup = async () => {
      await page.getByRole('button', { name: w.setup }).first().click();
      const dialog = page.getByRole('dialog');
      await dialog.waitFor();
      await dialog.getByRole('tab', { name: w.tabPage }).click();
      return dialog;
    };
    const betweenSelect = (dialog) => dialog.locator('select').filter({ has: page.locator('option', { hasText: /^(Default: |預設：)/ }) }).first();
    const chooseBetween = async (lines) => {
      const dialog = await openSetup();
      await betweenSelect(dialog).selectOption({ label: w.lines(lines) });
      await settle();
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'detached' });
      await settle();
    };
    /** The question's box on the printed page (the outline's rows carry `data-flow-id` too). */
    const onPage = (id) => page.locator(`#print-root [data-flow-id="${id}"]`).first();
    // A click on the question's own top line, at the right edge where no text sits, selects the
    // question and opens its panel; a click on text would pick that block instead.
    const selectQuestion = async (id) => {
      await onPage(id).scrollIntoViewIfNeeded();
      const box = await onPage(id).boundingBox();
      await page.mouse.click(box.x + box.width - 12, box.y + 6);
      await settle();
    };
    const spaceAbove = () => page.getByLabel(w.spaceAbove).first();
    const chosenText = async () => spaceAbove().locator('option:checked').textContent();
    const note = () => page.getByTestId('space-above-note');

    // A. As saved: one line between questions, wherever a gap is carried.
    let g = await gaps();
    check(
      `[${tag}] opens with one blank line (12pt) above every question that carries a gap`,
      IDS.every((id) => g[id]?.asked === null || g[id]?.asked === '12pt') && IDS.filter((id) => g[id]?.asked === '12pt').length >= 10,
      JSON.stringify(g),
    );
    const pages = await page.locator('#print-root .paper').count();
    check(`[${tag}] the paper runs over two sheets or more (a gap can meet a page break)`, pages >= 2, String(pages));

    // B. Setup → Page → Between questions.
    let dialog = await openSetup();
    const between = betweenSelect(dialog);
    await between.waitFor();
    const optionLabels = await between.locator('option').allTextContents();
    check(`[${tag}] Between questions is offered on a classroom worksheet`, true);
    check(
      `[${tag}] … with the default (one line) and one to six lines`,
      same(optionLabels, [w.defaultOption, ...[1, 2, 3, 4, 5, 6].map(w.lines)]),
      JSON.stringify(optionLabels),
    );
    const hint = (await dialog.textContent()) ?? '';
    check(`[${tag}] … and a hint that says it counts under a question of the same kind`, w.hint.every((part) => hint.includes(part)), hint.slice(0, 200));
    await page.screenshot({ path: `${OUT}/${tag}-setup.png` });
    await between.selectOption({ label: w.lines(3) });
    await settle();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    await settle();

    g = await gaps();
    check(
      `[${tag}] 3 lines: MC under MC and structured under structured widen to 36pt`,
      same(await asked([...MC.slice(1), S2]), [...MC.slice(1), S2].map(() => '36pt')),
      JSON.stringify(await asked([...MC.slice(1), S2])),
    );
    check(
      `[${tag}] … while the MC under the heading, the structured under an MC and the one under a note keep one line`,
      same(await asked([MC[0], S1, S3]), ['12pt', '12pt', '12pt']),
      JSON.stringify(await asked([MC[0], S1, S3])),
    );
    const meetsBreak = IDS.filter((id) => g[id]?.leads && g[id]?.asked === '36pt');
    check(
      `[${tag}] … and a gap that meets a page break is not drawn (${meetsBreak.length} here)`,
      meetsBreak.length >= 1 && meetsBreak.every((id) => g[id].drawn === 0),
      JSON.stringify(meetsBreak.map((id) => g[id])),
    );
    const askedCount = IDS.filter((id) => g[id]?.asked === '36pt').length;
    check(`[${tag}] … and the page rail’s thumbnails carry the same ${askedCount} gaps`, (await railCarriers('36pt')) === askedCount, String(await railCarriers('36pt')));
    await page.screenshot({ path: `${OUT}/${tag}-three-lines.png`, fullPage: false });

    // C. A question's own Space above, set with the mouse in its panel.
    await selectQuestion(MC[2]);
    check(`[${tag}] an MC’s panel offers Space above, reading the paper’s 3 lines`, (await chosenText()) === w.paperDefault(3), String(await chosenText()));
    await spaceAbove().selectOption({ label: w.lines(5) });
    await settle();
    check(`[${tag}] choosing 5 lines widens that one boundary to 60pt and no other`, same(await asked([MC[1], MC[2], MC[3]]), ['36pt', '60pt', '36pt']), JSON.stringify(await asked([MC[1], MC[2], MC[3]])));
    check(`[${tag}] … and no note, since it sits under a like question`, (await note().count()) === 0);
    await spaceAbove().selectOption({ label: w.paperDefault(3) });
    await settle();
    check(`[${tag}] choosing Paper default returns it to the paper’s 36pt`, same(await asked([MC[2]]), ['36pt']), JSON.stringify(await asked([MC[2]])));
    await chooseBetween(2);
    check(`[${tag}] … and it keeps following Setup: 2 lines puts the whole run at 24pt`, same(await asked([MC[2], MC[5], S2]), ['24pt', '24pt', '24pt']), JSON.stringify(await asked([MC[2], MC[5], S2])));
    await chooseBetween(3);

    // D. The same field on a structured question, and the note when a number cannot be used.
    await selectQuestion(S2);
    check(`[${tag}] a structured question’s panel offers Space above too`, (await spaceAbove().count()) === 1 && (await chosenText()) === w.paperDefault(3), String(await chosenText()));
    await spaceAbove().selectOption({ label: w.lines(4) });
    await settle();
    check(`[${tag}] … 4 lines widens it to 48pt`, same(await asked([S2]), ['48pt']), JSON.stringify(await asked([S2])));
    await spaceAbove().selectOption({ label: w.paperDefault(3) });
    await settle();

    await selectQuestion(S1);
    await spaceAbove().selectOption({ label: w.lines(4) });
    await settle();
    check(`[${tag}] a number under a question of another kind is not drawn…`, same(await asked([S1]), ['12pt']), JSON.stringify(await asked([S1])));
    check(`[${tag}] … and the panel says why`, ((await note().textContent()) ?? '').includes(w.noteUnlike), String(await note().textContent().catch(() => '')));
    await page.screenshot({ path: `${OUT}/${tag}-note.png` });
    await spaceAbove().selectOption({ label: w.paperDefault(3) });
    await settle();
    check(`[${tag}] … and the note goes once the choice is the default again`, (await note().count()) === 0);

    await selectQuestion(S3);
    await spaceAbove().selectOption({ label: w.lines(4) });
    await settle();
    check(`[${tag}] a number under a note is not drawn, and the panel says something else is above`, same(await asked([S3]), ['12pt']) && ((await note().textContent()) ?? '').includes(w.noteAfter), String(await note().textContent().catch(() => '')));
    await spaceAbove().selectOption({ label: w.paperDefault(3) });
    await settle();

    // E. The drag handle in the page's margin, with a real pointer.
    const scale = await page.evaluate(() => document.querySelector('#print-root .paper').getBoundingClientRect().width / 793.7);
    const pill = (id) => page.locator(`#print-root [data-flow-id="${id}"] button[style*="ns-resize"]`);
    for (const [id, label] of [[MC[1], 'an MC under an MC'], [S2, 'a structured question under another']]) {
      await onPage(id).hover();
      check(`[${tag}] the handle is offered on ${label}`, (await pill(id).count()) === 1);
    }
    for (const [id, label] of [[MC[0], 'the MC under the heading'], [S1, 'a structured question under an MC'], [S3, 'one under a note']]) {
      check(`[${tag}] … and not on ${label}`, (await pill(id).count()) === 0);
    }
    await onPage(MC[2]).scrollIntoViewIfNeeded();
    await onPage(MC[2]).hover();
    const handle = pill(MC[2]);
    check(`[${tag}] the handle is labelled in this language`, ((await handle.getAttribute('title')) ?? '') === w.pill, String(await handle.getAttribute('title')));
    const box = await handle.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + 2 * 16 * scale, { steps: 12 });
    await page.screenshot({ path: `${OUT}/${tag}-drag.png` });
    await page.mouse.up();
    await settle();
    check(`[${tag}] dragging it down two lines makes the gap 5 lines (60pt)`, same(await asked([MC[1], MC[2], MC[3]]), ['36pt', '60pt', '36pt']), JSON.stringify(await asked([MC[1], MC[2], MC[3]])));
    await selectQuestion(MC[2]);
    check(`[${tag}] … and the panel shows the same number`, (await chosenText()) === w.lines(5), String(await chosenText()));
    await page.keyboard.press('Control+z');
    await settle();
    check(`[${tag}] one ⌘Z takes the drag back`, same(await asked([MC[2]]), ['36pt']), JSON.stringify(await asked([MC[2]])));

    // F. The .docx the real Export dialog writes (English interface: its labels are the plan's).
    if (ui === 'en') {
      const before = await gaps();
      const wanted = IDS.filter((id) => before[id]?.asked === '36pt' && !before[id]?.leads).length;
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
      const withGap = (xml.match(/w:before="720"/g) ?? []).length;
      check(`[${tag}] the .docx carries the three-line gap (w:before 720) ${wanted} times — all but the one the page drops at a sheet top`, withGap === wanted, `${withGap} vs ${wanted}`);
      check(`[${tag}] … and the sheets break where the page’s do (${pages - 1} hard page breaks)`, (xml.match(/w:br w:type="page"/g) ?? []).length === pages - 1, String((xml.match(/w:br w:type="page"/g) ?? []).length));
      await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
    }

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
