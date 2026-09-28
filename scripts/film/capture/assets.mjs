// Stills, isolated sheets, diagram layers and the exported .docx (FILM.md §6.3). Each job
// prepares the app off camera, then settles the virtual clock before capturing, so an
// asset never catches a transition half way.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { MCQS } from '../../demo/content.mjs';
import {
  backToStart, deselect, openDiagramDoc, openDoc, openQuiz, scrollPage, scrollToShow, selectQuestion,
  setLanguage, setPrintPreview, setVersion, question, LANGUAGE_TITLE,
} from './app.mjs';
import { ensureDiagramDone } from './clips.mjs';
import { demoPageScript } from './draw-diagram.mjs';
import { splitDiagram } from './layers.mjs';
import { freeze, launch, openPage, OUT, REVIEW, settle } from './session.mjs';

const SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

/** Settle the clock, hide the pointer, park the mouse where it hovers nothing. */
async function still(page, cdp, file, { park = { x: 1439, y: 899 }, clip } = {}) {
  await page.mouse.move(park.x, park.y);
  await page.evaluate(() => {
    const node = document.getElementById('__demo_cursor');
    if (node) node.style.visibility = 'hidden';
  });
  await freeze(page, 0.8);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, ...(clip && { clip }) });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  await page.evaluate(() => window.__vt.auto(true));
}

// ---- stills (2× viewport) ------------------------------------------------------

async function stills(env) {
  const { browser, url, state, log } = env;
  const out = (name) => path.join(OUT.stills, `${name}.png`);
  // The start screen from after draw-diagram, so the diagram question's thumbnail is finished.
  const home = await openPage(browser, { url, state: await ensureDiagramDone(env), log });
  await settle(home.page, 800);
  await still(home.page, home.cdp, out('start-screen'));
  await home.ctx.close();

  const s = await openPage(browser, { url, state, log });
  const { page, cdp } = s;

  await openQuiz(page);
  await setLanguage(page, 'bilingual');
  await deselect(page);
  await scrollPage(page, 0);
  await still(page, cdp, out('editor-clean'));

  await selectQuestion(page, 0);
  await scrollPage(page, 0);
  await still(page, cdp, out('editor-bilingual'));

  await deselect(page);
  await scrollPage(page, 0);
  await setVersion(page, 'teacher');
  await still(page, cdp, out('editor-teacher'));
  await setVersion(page, 'student');

  await selectQuestion(page, MCQS.length);
  await scrollToShow(page, question(page, MCQS.length), 110);
  await still(page, cdp, out('editor-structured'));

  await deselect(page);
  await scrollPage(page, 0);
  await page.getByRole('button', { name: /Export…/ }).first().click();
  await settle(page, 700);
  await still(page, cdp, out('export-dialog'));
  await page.getByRole('dialog').getByText('Other apps', { exact: true }).click();
  await settle(page, 500);
  await still(page, cdp, out('export-other-apps'));
  await s.ctx.close();

  // The finished tax diagram on its canvas, nothing selected.
  const d = await openPage(browser, { url, state: await ensureDiagramDone(env), log });
  await d.page.evaluate(demoPageScript());
  await openDiagramDoc(d.page);
  await d.page.evaluate(() => window.__demo.tagDiagrams());
  const box = await d.page.locator('[data-demo-diagram="0"]').boundingBox();
  await d.page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await settle(d.page, 1200);
  await still(d.page, d.cdp, out('diagram-canvas'), { park: { x: 1439, y: 700 } });
  await d.ctx.close();
  log('  stills: 9');
}

// ---- sheets (one .paper, 100% zoom, DPR 3, print preview) ------------------------

const SHEET_VIEWPORT = { width: 1700, height: 1400 };

/** Element capture of sheet `index` in print preview: the page exactly as it prints. */
async function sheet(page, cdp, index, file) {
  const paper = page.locator('#print-root .paper').nth(index);
  await paper.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await settle(page, 300);
  await page.evaluate(() => {
    const sc = document.querySelector('main.overflow-auto');
    sc.scrollTop -= 60;
  });
  await settle(page, 300);
  const b = await paper.boundingBox();
  const zoom = await page.getByTitle('Reset zoom to fit').textContent();
  if (zoom.trim() !== '100%') throw new Error(`capture: sheets need 100% zoom, the page shows ${zoom}`);
  await still(page, cdp, file, { clip: { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 } });
}

async function sheets(env) {
  const { url, state, log } = env;
  const browser = await launch(3);
  const out = (name) => path.join(OUT.sheets, `${name}.png`);
  const open = async (st) => {
    const s = await openPage(browser, { url, state: st, dpr: 3, log });
    await s.page.setViewportSize(SHEET_VIEWPORT);
    return s;
  };
  try {
    const q = await open(state);
    const { page, cdp } = q;
    await openQuiz(page);
    await deselect(page);
    await setPrintPreview(page, true);
    for (const [language, names] of [['bilingual', ['quiz-1', 'bi']], ['en', ['en']], ['zh', ['zh']]]) {
      await setLanguage(page, language);
      for (const name of names) await sheet(page, cdp, 0, out(name));
    }
    await setLanguage(page, 'bilingual');
    await sheet(page, cdp, 1, out('quiz-2'));
    await setVersion(page, 'teacher');
    await sheet(page, cdp, 0, out('quiz-teacher-1'));
    await setVersion(page, 'student');

    // Versions A, B, C of page 1.
    await setPrintPreview(page, false);
    await page.getByRole('button', { name: 'Setup', exact: true }).first().click();
    await settle(page, 600);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('radiogroup', { name: 'Number of versions' }).getByRole('radio', { name: '3', exact: true }).click();
    await settle(page, 400);
    for (const letter of ['A', 'B', 'C']) {
      await dialog.getByRole('radiogroup', { name: 'Version shown on the page' }).getByRole('radio', { name: letter, exact: true }).click();
      await settle(page, 300);
      await page.keyboard.press('Escape');
      await settle(page, 500);
      await setPrintPreview(page, true);
      await sheet(page, cdp, 0, out(`version-${letter.toLowerCase()}`));
      await setPrintPreview(page, false);
      if (letter !== 'C') {
        await page.getByRole('button', { name: 'Setup', exact: true }).first().click();
        await settle(page, 600);
      }
    }

    // The library papers, in English.
    for (const [name, shots] of [
      ['S6 Mock Exam Paper 1', [[0, 'p1-cover']]],
      ['S6 Mock Exam Paper 2', [[0, 'p2-cover'], [1, 'p2-page']]],
      ['S5 Market Failure LQ', [[0, 'lq-1'], [1, 'lq-2']]],
    ]) {
      await backToStart(page);
      await openDoc(page, name);
      await setLanguage(page, 'en');
      await deselect(page);
      await setPrintPreview(page, true);
      for (const [index, file] of shots) await sheet(page, cdp, index, out(file));
      await setPrintPreview(page, false);
    }
    await q.ctx.close();

    const d = await open(await ensureDiagramDone(env));
    await openDiagramDoc(d.page);
    await deselect(d.page);
    await setPrintPreview(d.page, true);
    await sheet(d.page, d.cdp, 0, out('diagram-question'));
    await d.ctx.close();
    log('  sheets: 15');
  } finally {
    await browser.close();
  }
}

// ---- diagram layers ----------------------------------------------------------------

async function diagram(env) {
  const { browser, url, log } = env;
  const s = await openPage(browser, { url, state: await ensureDiagramDone(env), log });
  await s.page.evaluate(demoPageScript());
  await openDiagramDoc(s.page);
  await deselect(s.page);
  await setPrintPreview(s.page, true);
  const result = await splitDiagram({ browser, page: s.page, outDir: OUT.diagram, reviewDir: REVIEW, log });
  await s.ctx.close();
  log(`  diagram: ${result.layers.length} layers, ${result.width}×${result.height}; composite vs full: ` +
    `mean ${result.check.meanDiff} max ${result.check.maxDiff}, ${result.check.pixelsOver8} px over 8 levels`);
}

// ---- export: the real Export flow, then LibreOffice -------------------------------

/** Export… → .docx → Question paper in `language` → the browser download, saved as `file`. */
async function download(page, file, language) {
  await page.getByRole('button', { name: /Export…/ }).first().click();
  await settle(page, 700);
  const dialog = page.getByRole('dialog');
  await dialog.getByText('.docx', { exact: true }).click();
  await dialog.getByText('Question paper', { exact: true }).click();
  await dialog.getByRole('radiogroup', { name: 'Language' }).getByTitle(LANGUAGE_TITLE[language], { exact: true }).click();
  await settle(page, 300);
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: /^Export \.docx/ }).click(),
  ]);
  await dl.saveAs(file);
  await settle(page, 600);
  await page.keyboard.press('Escape');
  await settle(page, 400);
}

/** LibreOffice → PDF → PNG of every page (up to `max`) at `dpi`. */
function renderDocx(docx, base, max = 4, dpi = 220) {
  if (!fs.existsSync(SOFFICE)) throw new Error(`capture: LibreOffice not found at ${SOFFICE}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'film-lo-'));
  execFileSync(SOFFICE, [`-env:UserInstallation=file://${tmp}/profile`, '--headless', '--convert-to', 'pdf', '--outdir', tmp, docx], { stdio: 'ignore' });
  const pdf = path.join(tmp, `${path.basename(docx, '.docx')}.pdf`);
  if (!fs.existsSync(pdf)) throw new Error(`capture: LibreOffice made no PDF from ${docx}`);
  const info = spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout ?? '';
  const pages = Number(/^Pages:\s*(\d+)/m.exec(info)?.[1] ?? 1);
  const made = [];
  for (let p = 1; p <= Math.min(pages, max); p++) {
    const prefix = path.join(tmp, `page-${p}`);
    execFileSync('pdftoppm', ['-r', String(dpi), '-png', '-f', String(p), '-l', String(p), '-singlefile', pdf, prefix]);
    const png = `${base}-${p}.png`;
    fs.copyFileSync(`${prefix}.png`, png);
    made.push(png);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  return { pngs: made, pages };
}

async function exportDocx(env) {
  const { browser, url, state, log } = env;
  fs.mkdirSync(OUT.export, { recursive: true });
  const file = (name) => path.join(OUT.export, name);

  const s = await openPage(browser, { url, state, log });
  await openQuiz(s.page);
  await setLanguage(s.page, 'bilingual');
  await deselect(s.page);
  await download(s.page, file('quiz-en.docx'), 'en');
  await download(s.page, file('quiz.docx'), 'bilingual');
  await s.ctx.close();

  const d = await openPage(browser, { url, state: await ensureDiagramDone(env), log });
  await openDiagramDoc(d.page);
  await deselect(d.page);
  await download(d.page, file('diagram.docx'), 'en');
  await d.ctx.close();

  // The English export is the clean render: this Mac has no PMingLiU (the export's
  // East Asian font), and LibreOffice's fallback overruns the exact heading line.
  for (const old of fs.readdirSync(OUT.export).filter((f) => f.endsWith('.png'))) fs.rmSync(file(old));
  const en = renderDocx(file('quiz-en.docx'), file('docx-page'));
  const bi = renderDocx(file('quiz.docx'), file('docx-bi-page'));
  const tax = renderDocx(file('diagram.docx'), file('docx-diagram-page'));
  log(`  docx: quiz-en.docx ${en.pages} pages, quiz.docx ${bi.pages}, diagram.docx ${tax.pages} (LibreOffice); ` +
    [...en.pngs, ...bi.pngs, ...tax.pngs].map((f) => path.basename(f)).join(', '));
}

export const ASSET_JOBS = [
  { name: 'stills', about: 'Full-viewport 2× PNGs: start screen, editor states, canvas, export dialog.', run: stills },
  { name: 'sheets', about: 'Isolated sheets at 100% zoom, DPR 3, as printed (print preview).', run: sheets },
  { name: 'diagram', about: 'The finished tax diagram as registration-aligned transparent layers.', run: diagram },
  { name: 'docx', about: 'The .docx from the real Export flow, rendered by LibreOffice at 220 dpi.', run: exportDocx },
];
