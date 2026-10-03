// Film v2's clips, loaded by v1's capture CLI (`--clips=scripts/film2/capture/clips.mjs`)
// into the v2 store (`FILM_STORE`). v1's own clips stay in scripts/film/capture/clips.mjs.
// Each clip: prepare off camera, then record in virtual time; times in `record` are clip
// seconds and every beat that matters is a `clickAt` (its event lands exactly there).
// MANIFEST.md beside this file lists what happens when, per clip.
import { deselect, openDoc, SCROLLER, scrollPage, scrollToShow, selectQuestion, setLanguage, setVersion, zoomBy } from '../../film/capture/app.mjs';
import { demoPageScript } from '../../film/capture/draw-diagram.mjs';
import { settle, pointer } from '../../film/capture/session.mjs';
import { ANSWER_DOC, PAPER, SHIFT_DOC } from './content.mjs';
import { seededDocs, withDocs } from './seed.mjs';

export { seedState } from './seed.mjs';

const canvasPanel = (page) => page.locator('.zone-dark aside');
/** A canvas toolbar button by its words (the glyph before them is part of the name). */
const canvasTool = (page, words) => page.locator('.zone-dark header').getByRole('button', { name: new RegExp(`${words}\\W*$`) }).first();
const title = (page, re) => page.getByTitle(re).first();

/** The first figure-sized diagram on the page: its top on screen. */
const DIAGRAM_TOP = () => {
  const svg = [...document.querySelectorAll('#print-root svg')].find((e) => e.getBoundingClientRect().width >= 150);
  return svg ? svg.getBoundingClientRect().top : null;
};
/** Scroll so that diagram's top is back at `pin` (in a frame's input: the page holds still). */
const HOLD_DIAGRAM = ([scroller, pin]) => {
  const svg = [...document.querySelectorAll('#print-root svg')].find((e) => e.getBoundingClientRect().width >= 150);
  if (!svg || pin == null) return;
  document.querySelector(scroller).scrollTop += svg.getBoundingClientRect().top - pin;
};

/** Open the only diagram on the page in the drawing canvas (off camera). */
async function openCanvas(page) {
  await page.evaluate(demoPageScript());
  await page.evaluate(() => window.__demo.tagDiagrams());
  const box = await page.locator('[data-demo-diagram="0"]').boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await settle(page, 1200);
}

/** A point on the open canvas, as fractions of the drawing surface. */
async function onCanvas(page, fx, fy) {
  const s = await page.evaluate(() => window.__demo.stage());
  return { x: s.left + fx * s.width, y: s.top + fy * s.height };
}

/** Open `name`, bilingual, nothing selected, page at the top. */
async function openPaper(page, name, language = 'bilingual') {
  await openDoc(page, name);
  await setLanguage(page, language);
  await deselect(page);
  await scrollPage(page, 0);
}

export const CLIPS = [
  {
    name: 'welcome-desk',
    dur: 6,
    about: 'The empty start screen (nothing saved): the pointer passes the four paper kinds left to right, then opens Paper 2 mock (3.6).',
    pointer: { x: 1000, y: 760 },
    state: (env) => withDocs(env.state, [], { only: true }),
    async prepare({ page }) {
      await page.waitForSelector('text=Paper 2 mock');
      await settle(page, 600);
    },
    async record(r, { page }) {
      const kind = (re) => page.getByRole('button', { name: re }).first();
      await r.hold(0.4);
      await r.moveTo(kind(/^Classroom worksheet/), { dur: 0.7 });
      await r.hold(0.3);
      await r.moveTo(kind(/^LQ worksheet/), { dur: 0.4 });
      await r.hold(0.3);
      await r.moveTo(kind(/^Paper 1 mock/), { dur: 0.4 });
      await r.hold(0.3);
      await r.clickAt(3.6, kind(/^Paper 2 mock/), { dur: 0.4, label: 'Paper 2 mock' });
      await r.until(6.0);
    },
  },
  {
    name: 'launch-splash',
    dur: 4,
    about: 'The real launch splash (?splash=1): axes, demand, supply, the dot and ripple, the wordmark, then the start screen.',
    pointer: null,
    async prepare({ page, url }) {
      // Load frozen, with the splash hidden: its CSS animations start when it is shown,
      // on the first recorded frame, not during the uncaptured pre-roll.
      await page.addInitScript(() => {
        window.__vt?.auto(false);
        const add = () => {
          const hide = document.createElement('style');
          hide.id = '__film_hide_splash';
          hide.textContent = '#launch-splash { display: none !important; }';
          document.documentElement.appendChild(hide);
        };
        if (document.documentElement) add();
        else new MutationObserver((_, o) => document.documentElement && (o.disconnect(), add())).observe(document, { childList: true });
      });
      await page.goto(`${url}?splash=1`, { waitUntil: 'networkidle' });
      await pointer(page, false);
    },
    async record(r, { page }) {
      await r.frame(() => page.evaluate(() => document.getElementById('__film_hide_splash')?.remove()));
      await r.until(4.0);
    },
  },
  {
    name: 'answer-layer',
    dur: 6,
    about: 'A "draw the diagram" question: Student shows blank axes; Teacher at t=1.5 draws the answer in red on them.',
    pointer: { x: 845, y: 32 }, // on the toolbar: over the page, the question takes a hover tint
    async prepare({ page }) {
      await openPaper(page, ANSWER_DOC.name);
      await setVersion(page, 'student');
      await zoomBy(page, 4);
      await scrollToShow(page, page.locator('#print-root').getByText(PAPER.diagram.part[0]).first(), 30);
    },
    async record(r, { page }) {
      // The Teacher page re-flows; the scroll follows the diagram so it holds still.
      const pin = await page.evaluate(DIAGRAM_TOP);
      await r.hold(0.3);
      await r.clickAt(1.5, title(page, /^Teacher version/), { dur: 0.7, label: 'Teacher', kind: 'toggle' });
      for (let i = 0; i < 40; i++) await r.frame(() => page.evaluate(HOLD_DIAGRAM, [SCROLLER, pin]));
      await r.moveTo({ x: 845, y: 32 }, { dur: 0.9 });
      await r.until(6.0);
    },
  },
  {
    name: 'answer-draw',
    dur: 8,
    about: 'Canvas on given D and S: Draw answer (0.8), select D in the list (1.8), Shift a copy (3.0) draws D1, the shift and new equilibrium in red; Done (5.6); Esc (~6.3) leaves the Teacher page.',
    pointer: { x: 760, y: 120 },
    async prepare({ page }) {
      await openPaper(page, SHIFT_DOC.name);
      await setVersion(page, 'teacher');
      await openCanvas(page);
    },
    async record(r, { page }) {
      await r.hold(0.2);
      await r.clickAt(0.8, canvasTool(page, 'Draw answer'), { dur: 0.5, label: 'Draw answer', kind: 'toggle' });
      // D from the canvas's own list (the line's place depends on the axis titles' language).
      await r.clickAt(1.8, canvasPanel(page).getByRole('button', { name: /^D\s*Curve$/ }), { dur: 0.6, label: 'select D' });
      await r.clickAt(3.0, canvasPanel(page).getByRole('button', { name: 'Shift a copy' }), { dur: 0.7, label: 'Shift a copy' });
      await r.hold(0.3);
      await r.press('Escape', { label: 'deselect' });
      await r.moveTo(() => onCanvas(page, 0.9, 0.12), { dur: 0.8 });
      await r.clickAt(5.6, canvasTool(page, 'Done'), { dur: 0.6, label: 'Done' });
      await r.moveTo({ x: 1010, y: 760 }, { dur: 0.7 });
      await r.press('Escape', { label: 'deselect' }); // the page alone, the answer in red
      await r.hold(0.2);
      await r.until(8.0);
    },
  },
  {
    name: 'shade-area',
    dur: 6,
    about: 'Canvas on D and S: Shade ▾ (0.8) → Consumer surplus (1.6) lands hatched; Shade ▾ (2.8) → Producer surplus (3.6); Esc.',
    pointer: { x: 700, y: 120 },
    async prepare({ page }) {
      await openPaper(page, SHIFT_DOC.name);
      await openCanvas(page);
    },
    async record(r, { page }) {
      const menu = page.getByRole('menu');
      const shade = canvasTool(page, 'Shade');
      await r.hold(0.2);
      // With one demand and one supply curve, a preset lands at once (no curve picker).
      await r.clickAt(0.8, shade, { dur: 0.5, label: 'Shade' });
      await r.clickAt(1.6, menu.getByText('Consumer surplus', { exact: true }), { dur: 0.5, label: 'Consumer surplus' });
      await r.clickAt(2.8, shade, { dur: 0.5, label: 'Shade' });
      await r.clickAt(3.6, menu.getByText('Producer surplus', { exact: true }), { dur: 0.45, label: 'Producer surplus' });
      await r.hold(0.4);
      await r.press('Escape', { label: 'deselect' });
      await r.moveTo(() => onCanvas(page, 1.05, 0.5), { dur: 0.8 });
      await r.until(6.0);
    },
  },
  {
    name: 'template-picker',
    dur: 8,
    about: 'Minimum-wage question selected: Diagram ▾ (0.8) opens the Templates grid, it scrolls through the topics (1.3–3.5), "minimum" typed (4.4) filters it, Minimum wage picked (6.4) lands under the stem.',
    pointer: { x: 1000, y: 420 },
    async prepare({ page }) {
      await openPaper(page, PAPER.name);
      await selectQuestion(page, PAPER.mcqs.length);
      await page.getByRole('tab', { name: /^Edit|^Question/ }).first().click().catch(() => {});
      await settle(page, 500);
      // Selecting from the outline scrolls the window itself a little: the toolbar comes back.
      await page.evaluate(() => { document.scrollingElement.scrollTop = 0; });
      await settle(page, 200);
    },
    async record(r, { page }) {
      const add = page.getByRole('button', { name: /^Add diagram/ }).first();
      await r.hold(0.1);
      await r.clickAt(0.8, add, { dur: 0.55, label: 'Diagram ▾' });
      await r.hold(0.3);
      const list = await page.evaluate(() => {
        let el = document.querySelector('[data-template-group]');
        while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
        if (!el) return null;
        el.setAttribute('data-film-scroll', '');
        return el.scrollHeight - el.clientHeight;
      });
      if (list) await r.scrollTo('[data-film-scroll]', Math.min(list, 1600), { dur: 2.2 });
      await r.hold(0.2);
      // The search box keeps focus while the grid scrolls: typing filters it (and scrolls back up).
      await r.until(4.4);
      await r.type('minimum', { cps: 12, label: 'search' });
      await r.hold(0.3);
      const pick = page
        .locator('[data-template-group] button')
        .filter({ has: page.locator('span.truncate', { hasText: /^Minimum wage$/ }) })
        .first();
      await r.clickAt(6.4, pick, { dur: 0.5, label: 'Minimum wage' });
      await r.hold(0.4);
      await r.moveTo({ x: 1027, y: 600 }, { dur: 0.7 }); // the gutter: no hover outline on the page
      await r.until(8.0);
    },
  },
  {
    name: 'marking-scheme',
    dur: 5,
    about: 'The paper in Student; Marking scheme at t=1.0: the answer key on its own pages, the Layout tab with four styles.',
    pointer: { x: 760, y: 300 },
    async prepare({ page }) {
      await openPaper(page, PAPER.name);
      await setVersion(page, 'student');
    },
    async record(r, { page }) {
      await r.hold(0.2);
      await r.clickAt(1.0, title(page, /^Marking scheme/), { dur: 0.6, label: 'Marking scheme', kind: 'toggle' });
      await r.hold(0.6);
      await r.moveTo({ x: 1180, y: 330 }, { dur: 1.0 });
      await r.until(5.0);
    },
  },
  {
    name: 'key-layouts',
    dur: 5,
    about: 'Marking scheme view: Classic (0–1.0), HKEAA style (1.0), Suggested answers (2.2), Detailed table (3.4).',
    pointer: { x: 1180, y: 330 },
    async prepare({ page }) {
      await openPaper(page, PAPER.name);
      await title(page, /^Marking scheme/).click();
      await settle(page, 900);
      await page.getByText('Classic', { exact: true }).first().click();
      await settle(page, 600);
    },
    async record(r, { page }) {
      const style = (name) => page.getByText(name, { exact: true }).first();
      await r.hold(0.2);
      await r.clickAt(1.0, style('HKEAA style'), { dur: 0.45, label: 'HKEAA style', kind: 'toggle' });
      await r.clickAt(2.2, style('Suggested answers'), { dur: 0.45, label: 'Suggested answers', kind: 'toggle' });
      await r.clickAt(3.4, style('Detailed table'), { dur: 0.45, label: 'Detailed table', kind: 'toggle' });
      await r.until(5.0);
    },
  },
];

export const ASSET_JOBS = [];
export { seededDocs };
