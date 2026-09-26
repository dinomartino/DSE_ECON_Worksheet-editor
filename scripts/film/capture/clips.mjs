// The clip list (FILM.md §6.2). Each clip prepares its start state off camera (the clock
// following real time), then records its action frame by frame in virtual time. Times in
// `record` are clip seconds; clicks that must land on a count use `clickAt`.
import fs from 'node:fs';
import path from 'node:path';
import { MCQS, STRUCTURED } from '../../demo/content.mjs';
import { field, makeDriver, partInput, question } from '../../demo/flow.mjs';
import {
  backToStart, deselect, openDoc, openQuiz, scrollPage, scrollToShow, selectQuestion, setLanguage, LANGUAGE_TITLE, SCROLLER, zoomBy,
} from './app.mjs';
import { drawDiagramClip, DIAGRAM_DONE_STATE } from './draw-diagram.mjs';
import { Recorder } from './recorder.mjs';
import { CAPTURE_BUILD, freeze, openPage, OUT, settle, pointer } from './session.mjs';

const Q1 = MCQS[0];
const lang = (page, language) => page.getByTitle(LANGUAGE_TITLE[language], { exact: true });

export const CLIPS = [
  {
    name: 'type-mcq',
    priority: 0,
    dur: 8,
    about: 'Double-click the empty stem, type it in English and Chinese, then the four options land in both languages.',
    pointer: { x: 760, y: 640 },
    async prepare({ page, d }) {
      const { createWorksheet, insertBelow } = await import('../../demo/flow.mjs');
      await createWorksheet(d, 'Classroom worksheet', { bilingual: true, name: 'S4 Positive and Normative' });
      await insertBelow(d, 'Section A', /Multiple Choice/);
      await deselect(page);
      await zoomBy(page, 3);
      await scrollToShow(page, question(page, 0), 150);
      // Open the stem once off camera: the page scrolls to where editing keeps it, so the
      // double-click on camera does not move the page between its two presses.
      const stem = await field(page, 0, 0).boundingBox();
      await page.mouse.dblclick(stem.x + 20, stem.y + stem.height / 2);
      await settle(page, 1200);
      await deselect(page);
    },
    async record(r, { page }) {
      await r.hold(0.15);
      await r.dblclick(field(page, 0, 0), { fx: 0.12, dur: 0.45 });
      await r.hold(0.1);
      await r.type(Q1.stem[0], { cps: 20 });
      await r.hold(0.08);
      await r.press('Enter');
      await r.dblclick(field(page, 0, 1), { fx: 0.1, dur: 0.22, dwell: 0.05 });
      await r.hold(0.05);
      await r.type(Q1.stem[1], { cps: 14 });
      await r.hold(0.05);
      await r.press('Enter');
      // The options land one per half-beat, both languages each.
      for (let k = 0; k < 4; k++) {
        const land = 5.0 + 0.5 * k;
        await r.clickAt(land - 5 / 60, field(page, 0, 2 + 2 * k), { fx: 0.1, dur: 0.15, dwell: 0.017, count: 2, gap: 4, label: 'double-click' });
        await r.type(Q1.options[k][0], { cps: 0 });
        await r.press('Enter');
        await r.dblclick(field(page, 0, 3 + 2 * k), { fx: 0.1, dur: 0.083, dwell: 0.017, gap: 4 });
        await r.type(Q1.options[k][1], { cps: 0 });
        await r.press('Enter');
      }
      await r.hold(0.2);
      await r.moveTo({ x: 820, y: 700 }, { dur: 0.7 });
      await r.until(8.0);
    },
  },
  {
    name: 'language-toggle',
    priority: 0,
    dur: 6,
    about: 'The finished MCQ page: EN (t=1.0), 中文 (2.5), EN+中 (4.0); the page reflows each time.',
    pointer: { x: 1000, y: 380 },
    async prepare({ page }) {
      await openQuiz(page);
      await setLanguage(page, 'bilingual');
      await deselect(page);
      await scrollPage(page, 0);
    },
    async record(r, { page }) {
      await r.hold(0.2);
      await r.clickAt(1.0, lang(page, 'en'), { dur: 0.6, label: 'EN', kind: 'toggle' });
      await r.clickAt(2.5, lang(page, 'zh'), { dur: 0.35, label: '中文', kind: 'toggle' });
      await r.clickAt(4.0, lang(page, 'bilingual'), { dur: 0.35, label: 'EN+中', kind: 'toggle' });
      await r.hold(0.5);
      await r.moveTo({ x: 1000, y: 360 }, { dur: 0.9 });
      await r.until(6.0);
    },
  },
  {
    name: 'draw-diagram',
    priority: 0,
    dur: 16,
    about: 'On blank axes: D, S, E₀ with guides, a tax shifts a copy of S (S₁, E₁), Shade tax revenue and DWL, Done.',
    ...drawDiagramClip,
  },
  {
    name: 'answer-lines',
    priority: 0,
    dur: 5,
    about: 'A structured question, part (a) (4 marks): Lines set to 6 in the inspector, the dotted answer lines appear.',
    pointer: { x: 760, y: 560 },
    async prepare({ page }) {
      await openQuiz(page);
      await setLanguage(page, 'bilingual');
      await deselect(page);
      const sq = question(page, MCQS.length);
      await selectQuestion(page, MCQS.length);
      const lines = partInput(page, 'a', 'lines');
      await lines.fill('0');
      await lines.press('Tab');
      await settle(page, 500);
      await page.evaluate(() => document.activeElement?.blur?.());
      await scrollToShow(page, sq, 120);
      await settle(page, 400);
    },
    async record(r, { page }) {
      const lines = partInput(page, 'a', 'lines');
      await r.hold(0.3);
      await r.clickAt(1.0, lines, { dur: 0.6, label: 'Lines' });
      await r.press('Meta+A', { label: 'select' });
      await r.hold(0.25);
      await r.type(String(STRUCTURED.parts[0].lines), { cps: 10 });
      await r.hold(0.6);
      await r.moveTo({ x: r.mouse.x - 360, y: r.mouse.y + 120 }, { dur: 0.8 });
      await r.until(5.0);
    },
  },
  {
    name: 'teacher-toggle',
    priority: 0,
    dur: 4,
    about: 'The bilingual MCQ page; Teacher at t=1.0 shows the answers in red.',
    pointer: { x: 1000, y: 420 },
    async prepare({ page }) {
      await openQuiz(page);
      await setLanguage(page, 'bilingual');
      await deselect(page);
      await scrollPage(page, 0);
    },
    async record(r, { page }) {
      await r.hold(0.2);
      await r.clickAt(1.0, page.getByTitle(/^Teacher version/), { dur: 0.6, label: 'Teacher', kind: 'toggle' });
      await r.hold(0.5);
      await r.moveTo({ x: 1000, y: 400 }, { dur: 0.9 });
      await r.until(4.0);
    },
  },
  {
    name: 'export',
    priority: 1,
    dur: 5,
    about: 'Export… opens; Question paper → Answer key → Both → Other apps; hold on the list. Nothing downloads.',
    pointer: { x: 1040, y: 300 },
    async prepare({ page }) {
      await openQuiz(page);
      await setLanguage(page, 'bilingual');
      await deselect(page);
      await scrollPage(page, 0);
    },
    async record(r, { page }) {
      const dialog = page.getByRole('dialog');
      await r.hold(0.2);
      await r.clickAt(0.8, page.getByRole('button', { name: /Export…/ }).first(), { dur: 0.5, label: 'Export…' });
      await r.hold(0.3);
      await r.clickAt(1.6, dialog.getByText('Question paper', { exact: true }), { dur: 0.45, label: 'Question paper', kind: 'toggle' });
      await r.clickAt(2.3, dialog.getByText('Answer key', { exact: true }), { dur: 0.35, label: 'Answer key', kind: 'toggle' });
      await r.clickAt(3.0, dialog.getByText('Both', { exact: true }), { dur: 0.35, label: 'Both', kind: 'toggle' });
      await r.clickAt(3.7, dialog.getByText('Other apps', { exact: true }), { dur: 0.35, label: 'Other apps', kind: 'toggle' });
      await r.until(5.0);
    },
  },
  {
    name: 'new-worksheet',
    priority: 1,
    dur: 5,
    about: 'Start screen → Classroom worksheet → EN+中 → Create worksheet → the editor.',
    pointer: { x: 900, y: 520 },
    state: (env) => ensureDiagramDone(env),
    async prepare({ page }) {
      // Open a document once: the editor's code is then loaded, so Create does not
      // wait on it (a first open shows a blank beat while React reveals the lazy editor).
      await openQuiz(page);
      await backToStart(page);
    },
    async record(r, { page }) {
      const dialog = page.getByRole('dialog');
      await r.hold(0.2);
      await r.clickAt(0.9, page.getByText('Classroom worksheet', { exact: true }).first(), { dur: 0.6, label: 'Classroom worksheet' });
      await r.hold(0.4);
      await r.clickAt(2.1, dialog.getByTitle('Bilingual'), { dur: 0.5, label: 'EN+中', kind: 'toggle' });
      await r.clickAt(3.0, page.getByRole('button', { name: /Create worksheet/ }), { dur: 0.5, label: 'Create worksheet' });
      await r.hold(0.4);
      const hint = page.getByRole('button', { name: 'Dismiss hint' });
      await r.moveTo({ x: 820, y: 460 }, { dur: 0.8 });
      if (await hint.count()) await r.until(5.0);
      await r.until(5.0);
    },
  },
  {
    name: 'scroll-paper',
    priority: 1,
    dur: 6,
    about: 'The Paper 2 question-answer booklet scrolled smoothly from its cover through two pages.',
    pointer: null,
    async prepare({ page }) {
      await openDoc(page, 'S6 Mock Exam Paper 2');
      await setLanguage(page, 'en');
      await deselect(page);
      await scrollPage(page, 0);
      await pointer(page, false);
    },
    async record(r, { page }) {
      const top = await page.evaluate((s) => {
        const sc = document.querySelector(s);
        const sheets = [...document.querySelectorAll('#print-root .paper')];
        const at = (i) => sc.scrollTop + sheets[i].getBoundingClientRect().top - sc.getBoundingClientRect().top - 40;
        return { cover: Math.max(0, at(0) + 0), third: at(2) };
      }, SCROLLER);
      await r.hold(0.6);
      await r.scrollTo(SCROLLER, top.third, { dur: 4.8 });
      await r.until(6.0);
    },
  },
  {
    name: 'versions',
    priority: 2,
    dur: 4,
    about: 'Setup → Versions 3 → "Version A" appears on the page.',
    pointer: { x: 760, y: 300 },
    async prepare({ page }) {
      await openQuiz(page);
      await setLanguage(page, 'bilingual');
      await deselect(page);
      await scrollPage(page, 0);
    },
    async record(r, { page }) {
      const dialog = page.getByRole('dialog');
      await r.hold(0.2);
      await r.clickAt(0.6, page.getByRole('button', { name: 'Setup' }), { dur: 0.45, label: 'Setup' });
      await r.hold(0.3);
      const three = dialog.getByRole('radiogroup', { name: 'Number of versions' }).getByRole('radio', { name: '3', exact: true });
      await r.clickAt(1.6, three, { dur: 0.5, label: 'Versions 3', kind: 'toggle' });
      await r.clickAt(2.5, dialog.getByRole('button', { name: /close/i }).first(), { dur: 0.45, label: 'Close' });
      await r.hold(0.3);
      await r.moveTo({ x: 1000, y: 420 }, { dur: 0.7 });
      await r.until(4.0);
    },
  },
];

/** Prepare, record and describe one clip; writes clips/<name>/ and clips/<name>.json. */
export async function recordClip(clip, env, { dryRun = false, dir: into } = {}) {
  const { browser, url, log } = env;
  const dir = into ?? (dryRun ? path.join(CAPTURE_BUILD, 'dry-run') : path.join(OUT.clips, clip.name));
  fs.rmSync(dir, { recursive: true, force: true });
  const state = clip.state ? await clip.state(env) : env.state;
  const s = await openPage(browser, { url, state, log });
  const d = makeDriver(s.page, { url });
  log(`clip ${clip.name}${dryRun ? ' (dry run, no frames)' : ''}: preparing…`);
  await clip.prepare({ ...s, d, url, log, env });
  if (clip.pointer) await s.page.mouse.move(clip.pointer.x, clip.pointer.y);
  await freeze(s.page, 0.6);
  const r = new Recorder({ ...s, dir, name: clip.name, log, dryRun });
  if (clip.pointer) r.mouse = { ...clip.pointer };
  const t0 = Date.now();
  await clip.record(r, { ...s, d, env });
  const meta = await r.finish({ about: clip.about, target: clip.dur });
  if (!dryRun) {
    fs.writeFileSync(`${dir}.json`, JSON.stringify(meta, null, 1));
    log(`clip ${clip.name}: ${meta.frames} frames (${meta.duration}s) in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  if (clip.after) await clip.after({ ...s, r, env });
  await s.ctx.close();
  return meta;
}

/** The storage state after draw-diagram (the finished tax diagram); drawn off camera if missing. */
export async function ensureDiagramDone(env) {
  if (!fs.existsSync(DIAGRAM_DONE_STATE)) {
    await recordClip(CLIPS.find((c) => c.name === 'draw-diagram'), env, { dryRun: true });
  }
  return JSON.parse(fs.readFileSync(DIAGRAM_DONE_STATE, 'utf8'));
}

export { DIAGRAM_DONE_STATE };
