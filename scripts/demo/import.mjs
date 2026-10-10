// The import film (`npm run demo:import`): a teacher brings in a paper they already have.
// Home → Import from Word, PDF or picture… → the paper and its answers file picked
// together → the review (questions, answers, header/footer/title block) → Save as → the
// paper open in the editor, then in the Teacher version → Export → Word. One continuous
// recording of the built app, framed by the virtual camera (§ camera.mjs), subtitled
// (§ subtitles.mjs), with numbered stills and the exported .docx.
//
// The paper is invented (§ mockPaper.mjs), written as two Word files into the run's temp
// folder each time: the film needs no file from outside the repo.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { CONTEXT, CURSOR_SCRIPT, makeDriver } from './flow.mjs';
import { filmSteps } from './record.mjs';
import { withSubtitles } from './subtitles.mjs';
import { withCamera } from './camera.mjs';
import { MOCK, writeMockPaper } from './mockPaper.mjs';

/** The pointer hidden for a still, and the rendered export shown full screen. */
const PAGE_SCRIPT = `
(() => {
  window.__demo = {
    chrome(show) {
      const node = document.getElementById('__demo_cursor');
      if (node) node.style.visibility = show ? '' : 'hidden';
    },
    showImages(items) {
      let o = document.getElementById('__demo_overlay');
      if (!o) {
        o = document.createElement('div');
        o.id = '__demo_overlay';
        o.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:flex;gap:28px;align-items:center;justify-content:center;background:rgba(40,38,34,.94);padding:40px 40px 110px';
        document.documentElement.appendChild(o);
      }
      o.innerHTML = '';
      for (const { src, label } of items) {
        const fig = document.createElement('figure');
        fig.style.cssText = 'margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;height:100%';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'height:calc(100% - 30px);width:auto;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.45)';
        const cap = document.createElement('figcaption');
        cap.textContent = label;
        cap.style.cssText = 'color:#f4f1ea;font:500 14px/1.3 -apple-system,BlinkMacSystemFont,sans-serif';
        fig.append(img, cap);
        o.append(fig);
      }
    },
    hideImages() {
      document.getElementById('__demo_overlay')?.remove();
    },
  };
})();
`;

const dialog = (page) => page.getByRole('dialog').first();
const importButton = (page) => page.getByRole('button', { name: /^Import from Word, PDF or picture/ }).first();
const paperSheet = (page, n) => page.locator('#print-root .paper').nth(n);
/** The page's question fragment for question id `id` (its first sheet). */
const onPage = (page, id) => page.locator(`#print-root [data-question-id="${id}"]`).first();

/** Fail the film on a warning or error notice: the film must not show one. */
async function noAlarms(d, where) {
  const n = await d.page.locator('[data-notice="warning"], [data-notice="error"]').count();
  if (n) {
    const text = await d.page.locator('[data-notice="warning"], [data-notice="error"]').first().innerText();
    throw new Error(`${where}: a ${n > 1 ? `${n} notices` : 'notice'} is up: "${text.replace(/\s+/g, ' ')}"`);
  }
}

/** Scroll the editor's canvas (visibly) until `loc`'s top sits near `y`. */
async function scrollTo(d, loc, y) {
  for (let pass = 0; pass < 3; pass++) {
    let off = (await loc.first().boundingBox()).y - y;
    if (Math.abs(off) < 20) return;
    while (Math.abs(off) >= 1) {
      const step = Math.sign(off) * Math.min(Math.abs(off), 70);
      await d.page.mouse.wheel(0, step);
      off -= step;
      await d.wait(28);
    }
    await d.wait(350);
  }
}

/** The same inside a scroller that is not the page (the review's print preview). */
async function scrollWithin(d, scroller, loc, y) {
  const box = await scroller.boundingBox();
  await d.moveTo(box.x + box.width * 0.55, box.y + box.height * 0.55);
  await d.wait(200);
  await scrollTo(d, loc, y);
}

export function importStoryboard(ctx) {
  const { files } = ctx;
  return [
    {
      name: 'Home',
      caption: 'The home screen. Hovers **Import from Word, PDF or picture…**.',
      async run(d) {
        await d.wait(400); // the poster frame stays clean
        await d.say('Bring in a paper you already have');
        await d.wait(600);
        await d.hover(importButton(d.page));
        await d.focus(importButton(d.page), { name: 'the Import button', pad: 120, maxZoom: 1.8 });
        await d.wait(1200);
        await d.still('home', 'The home screen: Import from Word, PDF or picture…');
      },
    },
    {
      name: 'Pick the files',
      caption: `Clicks it and picks the paper and its answers file together (${MOCK.files.paper} and ${MOCK.files.answers}). **Papers and answers** marks one as Questions, one as Answers, and links them under **Answers from**.`,
      async run(d) {
        await d.say('Pick the paper and its answers file\ntogether, from Word');
        await d.wait(400);
        const [chooser] = await Promise.all([
          d.page.waitForEvent('filechooser'),
          d.click(importButton(d.page), { hover: 400 }),
        ]);
        if (!chooser.isMultiple()) throw new Error('the import chooser takes one file only');
        await chooser.setFiles([files.paper, files.answers]);
        await d.focus(null);
        const linked = dialog(d.page).getByRole('combobox');
        await linked.first().waitFor({ timeout: 20_000 });
        const answersFrom = await linked.first().evaluate((s) => s.options[s.selectedIndex]?.text ?? '');
        if (answersFrom !== MOCK.files.answers) {
          throw new Error(`"Answers from" reads "${answersFrom}", not ${MOCK.files.answers}: the film says they link on their own`);
        }
        await d.wait(600);
        const fileRows = dialog(d.page).locator('[data-file]');
        await d.focus([fileRows.first(), linked.first()], { name: 'the files and Answers from', pad: 40, maxZoom: 1.6 });
        await d.say('The answers link to the paper\non their own');
        await d.hover(linked.first());
        await d.wait(1600);
        await d.still('papers-and-answers', 'Papers and answers: the answers file linked under Answers from');
      },
    },
    {
      name: 'Review',
      caption: 'Clicks **Review the paper**. The header counts the questions found and the MC answers set from the answers file; beside it, the lines in the file carry their roles (Q, O, T).',
      async run(d) {
        await d.focus(null);
        await d.click(dialog(d.page).getByRole('button', { name: /^Review the paper/ }), { hover: 400 });
        const bar = dialog(d.page).locator('[data-answers-bar]');
        await bar.waitFor({ timeout: 20_000 });
        await d.wait(900);
        const counts = dialog(d.page).getByText(/^\d+ questions?$/).first();
        const lines = dialog(d.page).locator('[data-line]');
        await d.focus([counts, bar, lines.nth(9)], { name: 'the counts and the lines in the file, with their roles', pad: 24, maxZoom: 1.6 });
        await d.say('Every question is found, and\nthe MC answers are set from the file');
        await d.hover(bar, { at: 0.2 });
        await d.wait(1200);
        await d.hover(lines.nth(5), { at: 0.1 });
        await d.wait(1000);
        await d.still('review', 'The review: questions found, MC answers set from the answers file');
      },
    },
    {
      name: 'Header, footer and title block',
      caption: 'The print preview opens on **Header, footer and title block: From the file**, the page 1 header, the header on later pages, the title block and the footer as they will print.',
      async run(d) {
        const chrome = dialog(d.page).locator('[data-chrome-review]');
        await chrome.waitFor();
        await d.focus(null);
        await d.wait(200);
        await d.focus(chrome, { name: 'the header, footer and title block', pad: 24, maxZoom: 1.6 });
        await d.say('The header, footer and title block\ncome across too');
        await d.hover(chrome.locator('.paper').first(), { at: 0.5 });
        await d.wait(1100);
        await d.hover(chrome.locator('.paper').last(), { at: 0.5 });
        await d.wait(700);
        await d.still('header-footer', 'Header, footer and title block, read from the file');
        // Below it, the first question with the answer the answers file set.
        await d.say('With each MC answer in place');
        await d.focus(null);
        const scroller = dialog(d.page).locator('[data-preview-scroll]');
        const answered = scroller.locator('section[data-q]').filter({ has: d.page.locator('[data-answer-node]') }).first();
        await scrollWithin(d, scroller, answered, 240);
        await d.focus(answered, { name: 'question 1 with its answer', pad: 30, maxZoom: 1.6 });
        await d.hover(answered.locator('[data-answer-node]').first(), { at: 0.5 });
        await d.wait(800);
      },
    },
    {
      name: 'Save as',
      caption: 'Clicks **Save as…**: the suggested paper type is already chosen, with the name taken from the file. Keeps it and clicks **Save and open**.',
      async run(d) {
        await d.say('');
        await d.focus(null);
        await d.click(dialog(d.page).getByRole('button', { name: /^Save as/ }), { hover: 350 });
        const suggested = dialog(d.page).getByRole('radio', { checked: true }).first();
        await suggested.waitFor();
        if (!(await dialog(d.page).getByText('Suggested', { exact: true }).count())) throw new Error('Save as marks no paper type Suggested');
        await d.wait(600);
        const cards = dialog(d.page).getByRole('radio');
        await d.focus([cards.first(), cards.last(), dialog(d.page).getByText('What is saved', { exact: true })], {
          name: 'the paper types and what is saved', pad: 30, maxZoom: 1.6,
        });
        await d.say('Pick the paper type');
        await d.hover(suggested);
        await d.wait(600);
        await d.say('The suggested one is already chosen');
        await d.wait(1100);
        await d.still('save-as', 'Save as: the suggested paper type, chosen');
        await d.focus(null);
        await d.say('');
        await d.click(dialog(d.page).getByRole('button', { name: /^Save and open/ }), { hover: 450 });
        await d.page.waitForSelector('#print-root .paper', { timeout: 20_000 });
        // The first-use hint floats over the page: gone before the paper is seen.
        await d.cut(async () => {
          const hint = d.page.getByRole('button', { name: 'Dismiss hint' });
          await hint.waitFor({ timeout: 2500 }).catch(() => {});
          if (await hint.count()) await hint.click();
          await d.wait(150);
        });
        await d.wait(400);
      },
    },
    {
      name: 'In the editor',
      caption: 'The paper opens in the editor: the header and title block on page 1, then a slow scroll through the MC questions.',
      async run(d) {
        await noAlarms(d, 'the opened paper');
        const first = paperSheet(d.page, 0);
        const box = await first.boundingBox();
        await d.moveTo(box.x + box.width + 50, 420);
        await d.focus({ x: box.x, y: box.y, width: box.width, height: 330 }, { name: 'page 1, its header and title block', pad: 30, maxZoom: 1.6 });
        await d.say('It opens as a worksheet\nwith its header and title');
        await d.wait(1700);
        await d.still('editor', 'The imported paper in the editor, page 1');
        await d.focus(null);
        await d.say('Edit it like any worksheet');
        await d.moveTo(box.x + box.width / 2, 520);
        await d.wait(200);
        await scrollTo(d, paperSheet(d.page, 1), 80);
        await d.wait(900);
      },
    },
    {
      name: 'Teacher version',
      caption: 'Switches to **Teacher**: each MC answer prints in red, from the answers file; the written questions carry their marking scheme. Switches back.',
      async run(d) {
        await d.click(d.page.getByTitle(/Teacher version/), { hover: 300 });
        await d.wait(700);
        await d.say('The Teacher version shows the answers\nfrom the answers file');
        // The first MC question wholly on screen, with its answer.
        const withAnswer = d.page.locator('#print-root [data-question-id]').filter({ hasText: /Answer: [A-D]/ });
        let shown = null;
        for (let i = 0, n = await withAnswer.count(); i < n && !shown; i++) {
          const b = await withAnswer.nth(i).boundingBox();
          if (b && b.y > 60 && b.y + b.height < 780) shown = withAnswer.nth(i);
        }
        if (!shown) throw new Error('no MC question with its answer on screen in the Teacher version');
        await d.focus(shown, { name: 'an MC question and its answer in the Teacher version', pad: 30, maxZoom: 1.6 });
        await d.wait(1500);
        await d.focus(null);
        // The first written question, with its marking scheme: a click on its page in the rail.
        await d.say('Jump to any page from the rail');
        const written = onPage(d.page, ctx.firstWrittenId);
        const sheet = await written.evaluate((el) => [...document.querySelectorAll('#print-root .paper')].indexOf(el.closest('.paper')));
        if (sheet < 0) throw new Error('the written question is on no page');
        // The rail shows the first pages only: scroll it (visibly) to the page, then click it.
        const thumb = d.page.getByRole('button', { name: `Page ${sheet + 1}`, exact: true });
        await d.hover(d.page.getByRole('button', { name: /^Page 1\b/ }).first());
        for (let i = 0; i < 40; i++) {
          const b = await thumb.boundingBox();
          if (b && b.y + b.height < 820) break;
          await d.page.mouse.wheel(0, 60);
          await d.wait(30);
        }
        await d.wait(300);
        await d.click(thumb, { hover: 350 });
        await d.wait(700);
        await d.moveTo(700, 520);
        await scrollTo(d, written, 140);
        await d.focus(written, { name: 'a written question and its marking scheme', pad: 30, maxZoom: 1.6 });
        await d.say('Marking schemes for the written\nquestions come across too');
        await d.wait(1600);
        await d.still('teacher', 'The Teacher version: a written question with its marking scheme');
        await d.focus(null);
        await d.click(d.page.getByTitle(/Student version/), { hover: 250 });
        await d.wait(600);
      },
    },
    {
      name: 'Export',
      caption: 'Opens **Export…** and exports the question paper as .docx.',
      async run(d) {
        await d.say('Export to Word');
        await d.click(d.page.getByRole('button', { name: /^Export/ }).first(), { hover: 300 });
        await d.wait(900);
        const exportDialog = d.page.getByRole('dialog');
        await d.download(() => d.click(exportDialog.getByRole('button', { name: /^Export \.docx/ }), { hover: 450 }));
        await d.wait(600);
        await noAlarms(d, 'the export');
      },
    },
    {
      name: 'The .docx',
      caption: 'The exported file, opened in LibreOffice: pages 1 and 2 of the Word document.',
      async run(d) {
        await d.focus(null);
        const shown = await d.cut(() => d.renderExport());
        if (!shown) {
          await d.say('Ready in Word');
          await d.wait(2000);
          return;
        }
        await d.page.evaluate((items) => window.__demo.showImages(items), shown.items);
        await d.say('Back in Word, ready to print');
        await d.wait(2300);
        await d.still('docx', shown.still);
        await d.wait(600);
      },
    },
  ];
}

/**
 * Film the storyboard at 2× from an empty library (the stills are 2× page screenshots),
 * and keep the exported file. Returns the film, the stills (PNG paths), the export and
 * notes.
 */
export async function recordImport({ browser, url, root, tmpDir, outDir, log }) {
  const files = await writeMockPaper(path.join(tmpDir, 'papers'));
  log(`import: ${MOCK.files.paper} and ${MOCK.files.answers} (invented)`);

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const context = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2, acceptDownloads: true });
  await context.addInitScript((seen) => {
    // Not a first run and not an update: no "What's new" over the start screen.
    window.localStorage.setItem('econ-worksheet-last-seen-version', seen);
    // No Save As picker (it never answers under automation): Export falls back to the
    // browser's download, which the film catches (§ src/platform/index.ts:chooseSaveTarget).
    for (const name of ['showSaveFilePicker', 'showDirectoryPicker']) {
      Object.defineProperty(window, name, { value: undefined, configurable: true, writable: true });
    }
  }, version);
  await context.addInitScript(CURSOR_SCRIPT);
  await context.addInitScript(PAGE_SCRIPT);
  const page = await context.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  page.setDefaultTimeout(10_000); // a renamed control fails the film fast
  const d = withCamera(withSubtitles(makeDriver(page, { smooth: true, url })));

  const notes = [
    'Export saves as a browser download, not through Save As: the film turns the picker off, so the Export dialog ' +
      'shows its note about the Downloads folder (`src/platform/index.ts:chooseSaveTarget`).',
  ];
  const stills = [];
  const exportDir = path.join(outDir, 'export');
  fs.mkdirSync(exportDir, { recursive: true });
  let download = null;
  d.still = async (slug, caption) => {
    await d.cut(async () => {
      await page.evaluate(() => window.__demo.chrome(false));
      const file = `${String(stills.length + 1).padStart(2, '0')}-${slug}`;
      const png = path.join(tmpDir, `${file}.png`);
      const r = d.framing(); // framed as the camera is
      await page.screenshot({ path: png, ...(r && { clip: { x: r.x, y: r.y, width: r.w, height: r.h } }) });
      stills.push({ file, caption, png });
      await page.evaluate(() => window.__demo.chrome(true));
    });
  };
  d.download = async (trigger) => {
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), trigger()]);
    download = path.join(exportDir, dl.suggestedFilename());
    await dl.saveAs(download);
  };
  d.renderExport = () => renderExport({ file: download, exportDir, tmpDir, notes, log });

  // The first written question, once the paper is saved: read off the saved document.
  const ctx = { files, firstWrittenId: null };
  const steps = importStoryboard(ctx);
  const opened = steps.findIndex((s) => s.name === 'In the editor');
  const run = steps[opened].run;
  steps[opened].run = async (dd) => {
    // Off camera, until the save has landed (the paper is written as it opens).
    const doc = await d.cut(async () => {
      for (let i = 0; i < 50; i++) {
        const saved = await page.evaluate(() => {
          const ids = JSON.parse(window.localStorage.getItem('econ-worksheet-index') || '[]');
          const raw = ids[0] && window.localStorage.getItem(`econ-worksheet:${ids[0].id}`);
          return raw ? JSON.parse(raw) : null;
        });
        if (saved?.questions?.some((q) => q.type !== 'mcq')) return saved;
        await page.waitForTimeout(200);
      }
      return null;
    });
    if (!doc) throw new Error('the imported paper was not saved with a written question');
    const mc = doc.questions.filter((q) => q.type === 'mcq').length;
    const written = doc.questions.filter((q) => q.type !== 'mcq');
    if (!written.length) throw new Error('the imported paper has no written question to show');
    ctx.firstWrittenId = written[0].id;
    ctx.questionCount = doc.questions.length;
    log(`  saved: ${doc.questions.length} questions (${mc} MC, ${written.length} written)`);
    ctx.doc = doc;
    return run(dd);
  };

  await page.goto(url, { waitUntil: 'networkidle' });
  await importButton(page).waitFor({ timeout: 30_000 });
  await d.wait(1200);
  await page.mouse.move(820, 520);
  const rec = await filmSteps({ ctx: context, page, d, steps, tmpDir, log });
  await context.close();
  if (!download) throw new Error('import: the export downloaded nothing');
  await checkDocx(download, ctx.doc);
  log(`import: ${path.basename(download)} holds the paper's questions`);
  return { rec, stills, download, notes };
}

/** All the run text in a .docx, its paragraphs on lines. */
async function docxText(file) {
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error(`${path.basename(file)} has no word/document.xml`);
  return xml.split(/<\/w:p>/).map((p) => [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('')).join('\n');
}

/** The export holds every question's opening words (read off the saved paper, never stored here). */
async function checkDocx(file, doc) {
  const text = (await docxText(file)).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/\s+/g, ' ');
  // The stem's first paragraph, in English.
  const stemOf = (q) => {
    const para = (q.blocks ?? []).find((b) => b.kind === 'paragraph');
    return (para?.text.en ?? []).map((r) => r.text ?? '').join('').replace(/\s+/g, ' ').trim();
  };
  const absent = doc.questions.map(stemOf).filter((s) => s.length >= 12).map((s) => s.slice(0, 40)).filter((s) => !text.includes(s));
  if (absent.length) throw new Error(`import: the exported .docx is missing ${absent.length} question openings`);
}

/** Pages 1 and 2 of the export, rendered by LibreOffice. Null (and a note) when it is not installed. */
async function renderExport({ file, exportDir, tmpDir, notes, log }) {
  const has = (bin) => spawnSync('which', [bin]).status === 0;
  if (!has('soffice') || !has('pdftoppm')) {
    notes.push('The rendered .docx pages were skipped: `soffice` (LibreOffice) and `pdftoppm` must both be on PATH.');
    return null;
  }
  const work = path.join(tmpDir, 'render.docx');
  fs.copyFileSync(file, work);
  execFileSync('soffice', [`-env:UserInstallation=file://${path.join(tmpDir, 'lo-profile')}`, '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, work], { stdio: 'ignore' });
  const items = [];
  for (const n of [1, 2]) {
    const base = path.join(exportDir, `${path.basename(file, '.docx')} page ${n}`);
    execFileSync('pdftoppm', ['-r', '110', '-png', '-f', String(n), '-l', String(n), '-singlefile', path.join(tmpDir, 'render.pdf'), base]);
    items.push({ src: `data:image/png;base64,${fs.readFileSync(`${base}.png`).toString('base64')}`, label: `Page ${n}` });
    log(`  rendered ${path.basename(base)}.png`);
  }
  return { items, still: 'The exported .docx, pages 1 and 2, rendered by LibreOffice' };
}
