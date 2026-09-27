// Extra assets for the marks scene (FILM.md §6): the diagram worksheet the printed page
// shows, live in the editor. Part (a) starts at 4 marks and no lines; Marks → 6 shows on
// clip 2.0 (film 50.0), Lines → 6 on 3.0 (51.0), Teacher on 4.0 (52.0), where a marking
// scheme prints in red. Plus that page's teacher copy as a sheet.
//
//   node scripts/film/capture/extra-marks.mjs [--only=clip|sheet|probe] [--port=3957]
//
// Writes assets/extra/marks/clips/marks-live/ (+ .json) and assets/extra/marks/sheets/.
// Serves the main checkout's out/ (built by the capture step; never rebuilt here).
import fs from 'node:fs';
import path from 'node:path';
import { partInput } from '../../demo/flow.mjs';
import { deselect, openDoc, scrollPage, selectQuestion, setPrintPreview, setVersion, SCROLLER } from './app.mjs';
import { DIAGRAM_DONE_STATE } from './clips.mjs';
import { checkClip } from './check-clip.mjs';
import { Recorder } from './recorder.mjs';
import { contactSheet } from './review.mjs';
import { serveStatic } from './server.mjs';
import { ASSETS, freeze, launch, MAIN_ROOT, openPage, REVIEW, settle } from './session.mjs';

const args = process.argv.slice(2);
const opt = (name, d) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? d;
const only = opt('only', 'clip,sheet').split(',');
const PORT = Number(opt('port', 3957));
const log = (m) => console.log(m);

const EXTRA = path.join(ASSETS, 'extra', 'marks');
const CLIP = 'marks-live';
const TITLE = 'S5 Market Intervention: Diagrams';

// ---- the document: part (a) with an original marking scheme (teacher-only) ---------------
const run = (text, sub) => (sub ? { text, vertAlign: 'subscript' } : { text });
const txt = (...runs) => ({ en: runs.map((r) => (typeof r === 'string' ? run(r) : r)), zh: [] });
const P = (s) => [run(s[0]), run(s[1], true)];
const POINTS = [
  txt('The tax shifts the supply curve upward by $t, from S to S', run('1', true), '.'),
  txt('The price paid by buyers rises from ', ...P('P0'), ' to ', ...P('P1'), ', by less than the tax.'),
  txt('The quantity traded falls from ', ...P('Q0'), ' to ', ...P('Q1'), '.'),
  txt('Units between ', ...P('Q1'), ' and ', ...P('Q0'), ' are no longer traded, though their marginal benefit exceeds their marginal cost.'),
  txt('Consumer and producer surplus fall by more than the tax revenue raised.'),
  txt('Total welfare falls by the deadweight loss (DWL).'),
];
const SCHEME = {
  routes: [{ id: 'fmR1', groups: [{ id: 'fmG1', points: POINTS.map((text, i) => ({ id: `fmP${i + 1}`, text, marks: 1 })) }] }],
};

/** The diagram-done storage state on our port, part (a) edited by `edit`. */
function stateWith(edit) {
  const state = JSON.parse(fs.readFileSync(DIAGRAM_DONE_STATE, 'utf8'));
  for (const origin of state.origins) {
    origin.origin = origin.origin.replace(/:\d+$/, `:${PORT}`);
    for (const kv of origin.localStorage) {
      if (!kv.name.startsWith('econ-worksheet:')) continue;
      const doc = JSON.parse(kv.value);
      if (doc.title?.en?.[0]?.text !== TITLE) continue;
      edit(doc.questions[0].parts[0]);
      kv.value = JSON.stringify(doc, null, 2);
    }
  }
  return state;
}
const START = (part) => {
  part.marks = 4;
  delete part.answerSpace;
  part.scheme = SCHEME;
};
const DONE = (part) => {
  part.marks = 6;
  part.answerSpace = 6;
  part.scheme = SCHEME;
};

// ---- the clip ----------------------------------------------------------------------------
const VH = Number(opt('h', 900));
const ALIGN = Number(opt('align', 6)); // Marks field this far above the page's "(n marks)" (CSS px): centres level

const box = async (loc) => (await loc.first().boundingBox()) ?? { x: 0, y: 0, width: 0, height: 0 };
async function geometry(page) {
  const out = {};
  for (const [k, loc] of Object.entries({
    marks: partInput(page, 'a', 'marks'),
    lines: partInput(page, 'a', 'lines'),
    total: page.getByText(/^Total: \d+ marks?$/),
    label: page.locator('#print-root').getByText(/^\(\d+ marks\)$/),
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
  // The page at its end (part (a) high, room below for its lines and the red scheme); the
  // inspector scrolled so part (a)'s Marks field sits level with the page's "(n marks)".
  await scrollPage(page, 1e6);
  const g = await geometry(page);
  await partInput(page, 'a', 'marks').evaluate((el, dy) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const oy = getComputedStyle(p).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) { p.scrollTop += dy; break; }
    }
  }, g.marks.y - g.label.y + ALIGN);
  await page.evaluate(() => document.activeElement?.blur?.());
  await settle(page, 400);
  return geometry(page);
}

async function record(r, page) {
  const marks = partInput(page, 'a', 'marks');
  const lines = partInput(page, 'a', 'lines');
  await r.hold(0.9);
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
  await r.until(6.3);
}

async function clip(browser, url) {
  const dir = path.join(EXTRA, 'clips', CLIP);
  fs.rmSync(dir, { recursive: true, force: true });
  const s = await openPage(browser, { url, state: stateWith(START), log });
  await prepare(s.page);
  const home = { x: 700, y: 430 };
  await s.page.mouse.move(home.x, home.y);
  await freeze(s.page, 0.6);
  const r = new Recorder({ ...s, dir, name: CLIP, log });
  await r.place(home.x, home.y);
  await record(r, s.page);
  const meta = { ...(await r.finish({ about: 'The diagram worksheet live: Marks 4 → 6 (2.0), Lines → 6 (3.0), Teacher (4.0).', target: 6.3 })), height: VH * 2 };
  fs.writeFileSync(`${dir}.json`, JSON.stringify(meta, null, 1));
  await s.ctx.close();
  const stats = checkClip(dir, meta);
  fs.mkdirSync(REVIEW, { recursive: true });
  const sheet = contactSheet(dir, meta.frames, path.join(REVIEW, `extra-${CLIP}-sheet.jpg`));
  log(`clip ${CLIP}: ${meta.frames} frames; diff mean ${stats.mean} p95 ${stats.p95} max ${stats.max}; ` +
    `duplicates in motion ${stats.duplicatesInMotion.length}, spikes ${stats.spikes.length} → ${path.relative(MAIN_ROOT, sheet.file)}`);
}

// ---- the teacher copy (one .paper, 100% zoom, DPR 3, print preview; as assets.mjs) --------
async function teacherSheet(url) {
  const browser = await launch(3);
  try {
    const s = await openPage(browser, { url, state: stateWith(DONE), dpr: 3, log });
    await s.page.setViewportSize({ width: 1700, height: 1400 });
    await openDoc(s.page, TITLE);
    await deselect(s.page);
    await setVersion(s.page, 'teacher');
    await setPrintPreview(s.page, true);
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
    const file = path.join(EXTRA, 'sheets', 'diagram-teacher.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    log(`sheet: ${path.relative(MAIN_ROOT, file)} (${Math.round(b.width * 3)}×${Math.round(b.height * 3)})`);
    await s.ctx.close();
  } finally {
    await browser.close();
  }
}

// ---- probe: plain screenshots of the three states, for framing ---------------------------
async function probe(browser, url) {
  const dir = path.join(REVIEW, 'extra-marks-probe');
  fs.mkdirSync(dir, { recursive: true });
  const s = await openPage(browser, { url, state: stateWith(START), log });
  const shot = async (name) => {
    await settle(s.page, 500);
    await s.page.screenshot({ path: path.join(dir, `${name}.png`) });
    const g = await geometry(s.page);
    log(`${name}: ${Object.entries(g).map(([k, b]) => `${k} ${Math.round(b.x)},${Math.round(b.y)} ${Math.round(b.width)}×${Math.round(b.height)}`).join(' | ')}`);
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
  if (only.includes('sheet')) await teacherSheet(server.url);
} finally {
  await browser.close();
  await server.close();
}
