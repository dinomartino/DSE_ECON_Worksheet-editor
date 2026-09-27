// Extra assets for the marks scene (FILM.md §6): the diagram worksheet, live in the editor.
// Two parts, (a) 4 and (b) 2 marks, "Show total" on, so the page prints "(Total: 6 marks)".
// (a) Marks → 6 shows on clip 2.0 (film 50.0) and the total becomes 8; (a) Lines → 6 on 3.0
// (51.0); Teacher on 4.0 (52.0), where the marking schemes print in red. Plus the page as
// it prints before and after the edit, and its teacher copy, from the same document.
//
//   node scripts/film/capture/extra-marks.mjs [--only=clip,sheet,docx,probe] [--port=3957]
//
// Writes assets/extra/marks/clips/marks-total/ (+ .json), assets/extra/marks/sheets/
// (diagram-question-start, -done, diagram-teacher-done) and assets/extra/marks/export/.
// Serves the main checkout's out/ (built by the capture step; never rebuilt here).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { partInput } from '../../demo/flow.mjs';
import { deselect, openDoc, scrollPage, selectQuestion, setPrintPreview, setVersion, SCROLLER } from './app.mjs';
import { DIAGRAM_DONE_STATE } from './clips.mjs';
import { checkClip } from './check-clip.mjs';
import { Recorder } from './recorder.mjs';
import { appCommit, writeManifest } from './manifest.mjs';
import { contactSheet } from './review.mjs';
import { serveStatic } from './server.mjs';
import { ASSETS, freeze, launch, MAIN_ROOT, openPage, REVIEW, settle } from './session.mjs';

const RUN_START = Date.now();
const args = process.argv.slice(2);
const USAGE = `node scripts/film/capture/extra-marks.mjs [flags]   (writes the shared asset store)
  --only=a,b     clip, sheet, docx, probe (default: clip,sheet,docx)
  --port=<n>     static server port (default 3957)
  --b-lines=<n>, --h=<px>, --align=<px>   capture tuning (see the source)
  --help         this text`;
const KNOWN = ['only', 'port', 'b-lines', 'h', 'align', 'help'];
for (const a of args) {
  if (!KNOWN.includes(/^--([^=]+)/.exec(a)?.[1])) {
    console.error(`extra-marks: unknown argument ${a}\n${USAGE}`);
    process.exit(2);
  }
}
if (args.includes('--help')) {
  console.log(USAGE);
  process.exit(0);
}
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d;
const only = opt('only', 'clip,sheet,docx').split(',');
for (const o of only) {
  if (!['clip', 'sheet', 'docx', 'probe'].includes(o)) {
    console.error(`extra-marks: unknown --only job "${o}"\n${USAGE}`);
    process.exit(2);
  }
}
const PORT = Number(opt('port', 3957));
const log = (m) => console.log(m);

const EXTRA = path.join(ASSETS, 'extra', 'marks');
const CLIP = 'marks-total';
const TITLE = 'S5 Market Intervention: Diagrams';

// ---- the document ---------------------------------------------------------------------
const run = (text, sub) => (sub ? { text, vertAlign: 'subscript' } : { text });
const txt = (...runs) => ({ en: runs.map((r) => (typeof r === 'string' ? run(r) : r)), zh: [] });
const P = (s) => [run(s[0]), run(s[1], true)];
const scheme = (key, points) => ({
  routes: [{ id: `${key}R1`, groups: [{ id: `${key}G1`, points: points.map((text, i) => ({ id: `${key}P${i + 1}`, text, marks: 1 })) }] }],
});
const SCHEME_A = scheme('fm', [
  txt('The tax shifts the supply curve upward by $t, from S to S', run('1', true), '.'),
  txt('The price paid by buyers rises from ', ...P('P0'), ' to ', ...P('P1'), ', by less than the tax.'),
  txt('The quantity traded falls from ', ...P('Q0'), ' to ', ...P('Q1'), '.'),
  txt('Units between ', ...P('Q1'), ' and ', ...P('Q0'), ' are no longer traded, though their marginal benefit exceeds their marginal cost.'),
  txt('Consumer and producer surplus fall by more than the tax revenue raised.'),
  txt('Total welfare falls by the deadweight loss (DWL).'),
]);
const SCHEME_B = scheme('fb', [
  txt('To reduce smoking, which harms smokers and imposes external costs on others.'),
  txt('The higher price lowers the quantity of cigarettes bought.'),
]);
const PART_B = {
  id: 'fmPartB',
  blocks: [{ kind: 'paragraph', id: 'fmPartBp', text: txt('Suggest one reason why the government may impose this tax.') }],
  marks: 2,
  answerSpace: Number(opt('b-lines', 2)),
  scheme: SCHEME_B,
};

/** The diagram-done storage state on our port, question 1 edited by `edit`. */
function stateWith(edit) {
  const state = JSON.parse(fs.readFileSync(DIAGRAM_DONE_STATE, 'utf8'));
  for (const origin of state.origins) {
    origin.origin = origin.origin.replace(/:\d+$/, `:${PORT}`);
    for (const kv of origin.localStorage) {
      if (!kv.name.startsWith('econ-worksheet:')) continue;
      const doc = JSON.parse(kv.value);
      if (doc.title?.en?.[0]?.text !== TITLE) continue;
      edit(doc.questions[0]);
      kv.value = JSON.stringify(doc, null, 2);
    }
  }
  return state;
}
const withParts = (marksA, linesA) => (q) => {
  const a = q.parts[0];
  a.marks = marksA;
  if (linesA) a.answerSpace = linesA;
  else delete a.answerSpace;
  a.scheme = SCHEME_A;
  q.parts = [a, structuredClone(PART_B)];
  q.showTotalMarks = true;
};
const START = withParts(4, 0);
const DONE = withParts(6, 6);

// ---- the clip ----------------------------------------------------------------------------
const VH = Number(opt('h', 900));
const ALIGN = Number(opt('align', 6)); // Marks field this far above the page's "(n marks)" (CSS px): centres level

const box = async (loc) => (await loc.first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
async function geometry(page) {
  const out = {};
  const onPage = page.locator('#print-root');
  for (const [k, loc] of Object.entries({
    marks: partInput(page, 'a', 'marks'),
    lines: partInput(page, 'a', 'lines'),
    marksB: partInput(page, 'b', 'marks'),
    label: onPage.getByText(/^\(\d+ marks\)$/).first(),
    labelB: onPage.getByText(/^\(\d+ marks\)$/).nth(1),
    total: onPage.getByText(/^\(Total: \d+ marks\)$/),
    showTotal: page.getByText('Show total', { exact: true }),
    teacher: page.getByTitle(/^Teacher version/),
    summary: page.getByText(/structured ·/),
  })) out[k] = await box(loc);
  return out;
}

async function prepare(page) {
  await page.setViewportSize({ width: 1440, height: VH });
  await openDoc(page, TITLE);
  await deselect(page);
  await selectQuestion(page, 0);
  // Part (b)'s row open: rows (a) and (b) stay adjacent, with room below to scroll them up.
  await page.locator('[data-edit-target]').filter({ hasText: /^\(b\)/ }).getByTitle('Show on the page').click();
  await settle(page, 400);
  // The page at its end (room below part (a) for its lines and the red schemes); the
  // inspector scrolled so part (a)'s Marks field sits level with the page's "(n marks)",
  // and the page eased up for whatever the inspector cannot reach.
  await scrollPage(page, 1e6);
  let g = await geometry(page);
  await partInput(page, 'a', 'marks').evaluate((el, dy) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) { p.scrollTop += dy; break; }
    }
  }, g.marks.y - g.label.y + ALIGN);
  await settle(page, 300);
  g = await geometry(page);
  const rest = g.marks.y - g.label.y + ALIGN;
  if (rest > 1) {
    if (rest > 150) throw new Error(`the Marks field sits ${Math.round(rest)} px below the page's label`);
    await page.evaluate(([s, dy]) => { document.querySelector(s).scrollTop -= dy; }, [SCROLLER, rest]);
  }
  await page.evaluate(() => document.activeElement?.blur?.());
  await settle(page, 400);
  return geometry(page);
}

const HOME = { x: 600, y: 470 };

async function record(r, page) {
  const marks = partInput(page, 'a', 'marks');
  const lines = partInput(page, 'a', 'lines');
  await r.hold(1.0);
  // Marks: the new value shows on 2.0 (a key shows on the frame it is pressed).
  await r.clickAt(1.5, marks, { dur: 0.5, dwell: 0.08, label: 'Marks' });
  await r.press('Meta+A', { label: 'select' });
  await r.until(2.0);
  await r.type('6', { cps: 10 });
  // Lines on 3.0.
  await r.clickAt(2.7, lines, { dur: 0.3, dwell: 0.06, label: 'Lines' });
  await r.press('Meta+A', { label: 'select' });
  await r.until(3.0);
  await r.type('6', { cps: 10 });
  // Teacher on 4.0.
  await r.hold(0.2);
  await r.clickAt(4.0, page.getByTitle(/^Teacher version/), { dur: 0.62, dwell: 0.08, label: 'Teacher', kind: 'toggle' });
  await r.hold(0.35);
  await r.moveTo({ x: r.mouse.x + 240, y: r.mouse.y + 420 }, { dur: 1.0 });
  await r.until(6.0);
}

async function clip(browser, url) {
  const dir = path.join(EXTRA, 'clips', CLIP);
  fs.rmSync(dir, { recursive: true, force: true });
  const s = await openPage(browser, { url, state: stateWith(START), log });
  const g = await prepare(s.page);
  log(`geometry: ${fmt(g)}`);
  await s.page.mouse.move(HOME.x, HOME.y);
  await freeze(s.page, 0.6);
  const r = new Recorder({ ...s, dir, name: CLIP, log });
  await r.place(HOME.x, HOME.y);
  await record(r, s.page);
  const meta = {
    ...(await r.finish({ about: 'The diagram worksheet live: (a) Marks 4 → 6, total 6 → 8 (2.0), Lines → 6 (3.0), Teacher (4.0).', target: 6.0 })),
    height: VH * 2,
    geometry: Object.fromEntries(Object.entries(g).map(([k, b]) => [k, [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 2))])),
  };
  fs.writeFileSync(`${dir}.json`, JSON.stringify(meta, null, 1));
  await s.ctx.close();
  const stats = checkClip(dir, meta);
  fs.mkdirSync(REVIEW, { recursive: true });
  const sheet = contactSheet(dir, meta.frames, path.join(REVIEW, `extra-${CLIP}-sheet.jpg`));
  log(`clip ${CLIP}: ${meta.frames} frames; diff mean ${stats.mean} p95 ${stats.p95} max ${stats.max}; ` +
    `duplicates in motion ${stats.duplicatesInMotion.length}, spikes ${stats.spikes.length} → ${path.relative(MAIN_ROOT, sheet.file)}`);
}

// ---- printed sheets (one .paper, 100% zoom, DPR 3, print preview; as assets.mjs) ----------
async function printedSheet(browser, url, edit, version, name) {
  const s = await openPage(browser, { url, state: stateWith(edit), dpr: 3, log });
  await s.page.setViewportSize({ width: 1700, height: 1400 });
  await openDoc(s.page, TITLE);
  await deselect(s.page);
  await setVersion(s.page, version);
  await setPrintPreview(s.page, true);
  const count = await s.page.locator('#print-root .paper').count();
  if (count !== 1) throw new Error(`${name}: the document prints ${count} pages, not 1`);
  const paper = s.page.locator('#print-root .paper').first();
  await paper.evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await s.page.evaluate((sel) => { document.querySelector(sel).scrollTop -= 60; }, SCROLLER);
  await settle(s.page, 400);
  const zoom = await s.page.getByTitle('Reset zoom to fit').textContent();
  if (zoom.trim() !== '100%') throw new Error(`sheets need 100% zoom, the page shows ${zoom}`);
  const b = await paper.boundingBox();
  await s.page.mouse.move(1699, 1399);
  await s.page.evaluate(() => { const n = document.getElementById('__demo_cursor'); if (n) n.style.visibility = 'hidden'; });
  await freeze(s.page, 0.8);
  const shot = await s.cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, clip: { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 },
  });
  const file = path.join(EXTRA, 'sheets', `${name}.png`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  log(`sheet: ${path.relative(MAIN_ROOT, file)} (${Math.round(b.width * 3)}×${Math.round(b.height * 3)})`);
  await s.ctx.close();
}

async function sheets(url) {
  const browser = await launch(3);
  try {
    await printedSheet(browser, url, START, 'student', 'diagram-question-start');
    await printedSheet(browser, url, DONE, 'student', 'diagram-question-done');
    await printedSheet(browser, url, DONE, 'teacher', 'diagram-teacher-done');
  } finally {
    await browser.close();
  }
}

// ---- the finished document's .docx, rendered by LibreOffice (as assets.mjs) ---------------
const SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';
async function docx(browser, url) {
  const dir = path.join(EXTRA, 'export');
  fs.mkdirSync(dir, { recursive: true });
  const s = await openPage(browser, { url, state: stateWith(DONE), log });
  await openDoc(s.page, TITLE);
  await deselect(s.page);
  await s.page.getByRole('button', { name: /Export…/ }).first().click();
  await settle(s.page, 700);
  const dialog = s.page.getByRole('dialog');
  await dialog.getByText('.docx', { exact: true }).click();
  await dialog.getByText('Question paper', { exact: true }).click();
  await dialog.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true }).click();
  await settle(s.page, 300);
  const [dl] = await Promise.all([s.page.waitForEvent('download'), dialog.getByRole('button', { name: /^Export \.docx/ }).click()]);
  const file = path.join(dir, 'diagram.docx');
  await dl.saveAs(file);
  await s.ctx.close();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'film-lo-'));
  execFileSync(SOFFICE, [`-env:UserInstallation=file://${tmp}/profile`, '--headless', '--convert-to', 'pdf', '--outdir', tmp, file], { stdio: 'ignore' });
  const pdf = path.join(tmp, 'diagram.pdf');
  const pages = Number(/^Pages:\s*(\d+)/m.exec(spawnSync('pdfinfo', [pdf], { encoding: 'utf8' }).stdout ?? '')?.[1] ?? 1);
  execFileSync('pdftoppm', ['-r', '220', '-png', '-f', '1', '-l', '1', '-singlefile', pdf, path.join(tmp, 'page-1')]);
  fs.copyFileSync(path.join(tmp, 'page-1.png'), path.join(dir, 'docx-diagram-page-1.png'));
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`docx: ${path.relative(MAIN_ROOT, file)} (${pages} page${pages > 1 ? 's' : ''}) → docx-diagram-page-1.png`);
}

// ---- probe: plain screenshots of the three states, for framing ---------------------------
const fmt = (g) => Object.entries(g).map(([k, b]) => `${k} ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`).join(' | ');
async function probe(browser, url) {
  const dir = path.join(REVIEW, 'extra-marks-probe');
  fs.mkdirSync(dir, { recursive: true });
  const s = await openPage(browser, { url, state: stateWith(START), log });
  const shot = async (name) => {
    await settle(s.page, 500);
    await s.page.screenshot({ path: path.join(dir, `${name}.png`) });
    log(`${name}: ${fmt(await geometry(s.page))}`);
  };
  await prepare(s.page);
  await shot('0-start');
  await partInput(s.page, 'a', 'marks').fill('6');
  await partInput(s.page, 'a', 'lines').fill('6');
  await s.page.evaluate(() => document.activeElement?.blur?.());
  await shot('1-done');
  await setVersion(s.page, 'teacher');
  await shot('2-teacher');
  await s.ctx.close();
  log(`probe → ${dir}`);
}

const server = await serveStatic(path.join(MAIN_ROOT, 'out'), PORT);
const browser = await launch(2);
try {
  if (only.includes('probe')) await probe(browser, server.url);
  if (only.includes('clip')) await clip(browser, server.url);
  if (only.includes('sheet')) await sheets(server.url);
  if (only.includes('docx')) await docx(browser, server.url);
  writeManifest(log, { since: RUN_START, commit: appCommit(MAIN_ROOT) });
} finally {
  await browser.close();
  await server.close();
}
