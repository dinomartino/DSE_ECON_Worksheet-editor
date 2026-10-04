// The website screenshot set. Each entry puts the app in a state and is captured at 2×
// (2880×1800), kept as a PNG in `png/` and scaled to SITE_WIDTH for the site. Entries
// run in order on one page: a library seeded off screen (site-seed.test.ts, content
// SITE), then the quiz typed in (flow.mjs:buildQuiz). To add a screenshot, add an entry.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { FEEDBACK, MCQS, QUIZ_TITLE, SITE, STRUCTURED } from './content.mjs';
import { CONTEXT, makeDriver, question, buildQuiz, buildLibrary, newWorksheetButton, kindRadio } from './flow.mjs';

const VIEW_EDGE = { x: 1439, y: 899 };
/** The website's image width; the raw 2× PNG (2880 wide) is kept beside it in `png/`. */
export const SITE_WIDTH = 1920;

const home = async (d) => {
  await d.page.goto(d.url, { waitUntil: 'networkidle' });
  await d.wait(1200);
};
/** Scroll the page canvas so `loc`'s top sits `top` px below the toolbar. */
const scrollTop = async (d, loc, top = 90) => {
  await loc.scrollIntoViewIfNeeded();
  await d.wait(200);
  const box = await loc.boundingBox();
  await d.page.mouse.move(560, 450);
  await d.page.mouse.wheel(0, box.y - top);
  await d.wait(400);
};
const closeDialog = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
};

export const SHOTS = [
  {
    file: '02-editor-bilingual-mcq',
    caption: 'The editor: a bilingual (EN+中) quiz typed straight onto the page',
    async prepare({ page, wait }) {
      await page.keyboard.press('Escape');
      const close = page.getByRole('button', { name: 'Close editor' });
      if (await close.count()) await close.first().click();
      await page.mouse.move(560, 450);
      await page.mouse.wheel(0, -5000);
      await wait(300);
    },
  },
  {
    file: '03-teacher-answers',
    caption: 'The same page as the Teacher version, with the answers in red',
    async prepare({ page }) {
      await page.getByRole('radio', { name: 'Teacher' }).click();
    },
  },
  {
    file: '04-structured-marks-lines',
    caption: 'A structured question: parts, marks and dotted answer lines, set in the inspector',
    async prepare(d) {
      await d.page.getByRole('radio', { name: 'Student' }).click();
      await d.wait(300);
      const q = question(d.page, 3);
      await q.locator('span.absolute').first().click();
      await d.wait(300);
      await scrollTop(d, d.page.locator('#print-root [data-flow-id]').filter({ hasText: 'Section B' }).first(), 140);
    },
  },
  {
    file: '05-setup-versions',
    caption: 'Document setup: a bilingual title, and three shuffled versions (A/B/C)',
    async prepare({ page, wait }) {
      await closeDialog(page);
      await page.getByRole('button', { name: 'Setup', exact: true }).first().click();
      await wait(400);
      await page.getByRole('dialog').getByText('3', { exact: true }).click();
    },
  },
  {
    file: '06-export-dialog',
    caption: 'Export: a paper check, then Word, PDF or the file; question paper, answer key or both',
    async prepare({ page }) {
      await closeDialog(page);
      await page.getByRole('button', { name: /Export/ }).click();
    },
  },
  {
    file: '07-export-other-apps',
    caption: 'Export → Other apps: ZipGrade, Key CSV, Kahoot, Blooket',
    async prepare({ page }) {
      await page.getByRole('dialog').getByText('Other apps', { exact: true }).click();
    },
  },
  {
    file: '08-send-feedback',
    caption: 'Send feedback, with an example idea typed in',
    async prepare({ page, wait }) {
      await page.getByRole('button', { name: 'Cancel' }).click();
      await wait(300);
      await page.getByRole('button', { name: 'File and export options' }).click();
      await page.getByRole('menuitem', { name: /Send feedback/ }).click();
      await wait(400);
      await page.getByRole('dialog').getByText(FEEDBACK.kind, { exact: true }).click();
      await page.getByRole('dialog').locator('textarea').fill(FEEDBACK.message);
    },
  },
  {
    file: '01-start-dashboard',
    caption: 'Start screen: New worksheet, the 題庫 bank and Graphs, and the saved worksheets',
    async prepare(d) {
      await closeDialog(d.page);
      await d.wait(1500); // let autosave flush before leaving the quiz
      await buildLibrary(d);
      await home(d);
    },
  },
  {
    file: '09-new-worksheet-gallery',
    caption: 'New worksheet: name it, pick one of four kinds and the language',
    async prepare(d) {
      const { page } = d;
      await newWorksheetButton(page).click();
      await d.wait(400);
      await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill(SITE.newName);
      await kindRadio(page, 'Classroom worksheet').click();
      await page.getByRole('dialog').getByRole('radio', { name: 'EN+中' }).click();
      await page.getByRole('dialog').getByLabel('Name', { exact: true }).blur();
    },
  },
  {
    file: '11-question-bank',
    caption: 'The 題庫 question bank: every question from every worksheet, by DSE topic',
    async prepare(d) {
      await closeDialog(d.page);
      await d.page.getByRole('button', { name: /Question bank/ }).click();
      await d.wait(1200);
    },
  },
  {
    file: '12-graphs-library',
    caption: 'Graphs 圖表庫: draw a graph once, reuse it in a question or paste it into Word',
    async prepare(d) {
      await home(d);
      await d.page.getByRole('button', { name: /Graphs 圖表庫/ }).click();
      await d.wait(1200);
    },
  },
  {
    file: '13-settings-translation-terms',
    caption: 'Settings → Translation terms: your own wording for EDB glossary terms',
    async prepare(d) {
      await d.page.getByRole('button', { name: 'Settings' }).click();
      await d.wait(400);
      await d.page.getByRole('dialog').getByRole('tab', { name: /Translation terms/ }).click();
      await d.wait(600);
    },
  },
  {
    file: '10-marking-scheme-hkeaa',
    caption: 'Marking scheme view, HKEAA style: the MC key table and marks against each point',
    async prepare(d) {
      const { page } = d;
      await closeDialog(page);
      await home(d);
      await page.getByText(SITE.papers[0].name, { exact: true }).first().click();
      await d.wait(1500);
      const hint = page.getByRole('button', { name: 'Dismiss hint' });
      if (await hint.count()) await hint.click();
      await page.getByRole('radio', { name: 'Marking scheme' }).click();
      await d.wait(600);
      await page.getByRole('tab', { name: 'Layout' }).click();
      await page.getByRole('radio', { name: /HKEAA style/ }).click();
      await d.wait(600);
    },
  },
  {
    file: '14-teacher-model-diagram',
    caption: 'Teacher version: a model-answer diagram and HKEAA marking points under each part',
    async prepare(d) {
      const { page } = d;
      await page.getByRole('radio', { name: 'Teacher' }).click();
      await d.wait(800);
      await scrollTop(d, page.locator('#print-root [data-flow-id]').filter({ hasText: 'Section B' }).first(), 100);
    },
  },
];

/** Tag question `i` with the DSE topic named `topic`, in the inspector's Topics picker. */
async function tagQuestion(d, i, topic, { everyPart = false } = {}) {
  const { page } = d;
  await question(page, i).locator('span.absolute').first().click();
  await d.wait(300);
  await page.getByRole('button', { name: everyPart ? 'Add to every part' : 'Add topic' }).click();
  await d.wait(300);
  await page.getByPlaceholder(/^Filter/).fill(topic); // 'Filter topics' for every part
  await d.wait(300);
  await page.locator('[data-topic-row]').getByRole('button', { name: new RegExp(`^${topic}`) }).first().click();
  await d.wait(200);
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await d.wait(300);
}

/**
 * The quiz's finishing touches, off camera: its DSE topics (for the bank), its printed
 * title and class, and Section B on a new page.
 */
async function dressQuiz(d) {
  const { page } = d;
  for (let i = 0; i < MCQS.length; i++) await tagQuestion(d, i, MCQS[i].topic);
  await tagQuestion(d, MCQS.length, STRUCTURED.topic, { everyPart: true });
  await closeDialog(page);
  await page.getByRole('button', { name: 'Setup', exact: true }).first().click();
  await d.wait(400);
  for (const [lang, text] of [['English', QUIZ_TITLE[0]], ['中文', QUIZ_TITLE[1]]]) {
    await page.getByRole('dialog').getByLabel(`Worksheet title (${lang})`).click();
    await page.keyboard.insertText(text);
    await page.keyboard.press('Tab');
    await d.wait(200);
  }
  await page.getByRole('dialog').getByLabel('Classes').fill('4C');
  await page.getByRole('dialog').getByLabel('Classes').press('Tab');
  await closeDialog(page);
  // The rail inserts below the selected question.
  await question(page, 2).locator('span.absolute').first().click();
  await d.wait(300);
  await page.getByRole('button', { name: /^Element/ }).click();
  await page.getByRole('menuitem', { name: /New page/ }).click();
  await d.wait(500);
}

/** Write SITE (§ site-seed.test.ts) into the context's storage, once: reloads keep later edits. */
async function seedLibrary(ctx, { root, tmpDir }) {
  const file = path.join(tmpDir, 'site-seed.json');
  const emit = spawnSync('npx', ['vitest', 'run', 'scripts/demo/site-seed.test.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DEMO_SEED: file },
  });
  if (emit.status !== 0) throw new Error(`screenshots: the seed failed\n${emit.stdout}\n${emit.stderr}`);
  const seed = JSON.parse(fs.readFileSync(file, 'utf8'));
  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  await ctx.addInitScript(
    ([seedJson, seen]) => {
      if (window.localStorage.getItem('__demo_seeded')) return;
      const { docs, graphs } = JSON.parse(seedJson);
      window.localStorage.setItem('econ-worksheet-index', JSON.stringify(docs.map((x) => x.summary)));
      for (const { doc } of docs) window.localStorage.setItem(`econ-worksheet:${doc.id}`, JSON.stringify(doc));
      for (const { id, json } of graphs) window.localStorage.setItem(`econ-graph:${id}`, json);
      window.localStorage.setItem('econ-worksheet-last-seen-version', seen);
      window.localStorage.setItem('__demo_seeded', '1');
    },
    [JSON.stringify(seed), version],
  );
}

/** Capture every SHOTS entry into `outDir/screenshots/`, via `encode(png, outBase, { width })`. */
export async function takeScreenshots({ browser, url, root, outDir, tmpDir, encode, log }) {
  const ctx = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2, colorScheme: 'light' });
  await seedLibrary(ctx, { root, tmpDir });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`page error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const d = makeDriver(page, { url });
  const dir = path.join(outDir, 'screenshots');
  fs.rmSync(dir, { recursive: true, force: true });
  const pngDir = path.join(dir, 'png');
  fs.mkdirSync(pngDir, { recursive: true });

  log('screenshots: building the quiz…');
  await buildQuiz(d);
  await dressQuiz(d);
  const made = [];
  for (const shot of SHOTS) {
    await shot.prepare(d);
    await d.wait(700);
    await page.mouse.move(VIEW_EDGE.x, VIEW_EDGE.y); // park the pointer: no hover chrome
    await d.wait(300);
    const png = path.join(pngDir, `${shot.file}.png`);
    await page.screenshot({ path: png });
    made.push({ ...shot, path: encode(png, path.join(dir, shot.file), { width: SITE_WIDTH }) });
    log(`  ${shot.file}`);
    for (const e of errors.splice(0)) log(`    ${e}`);
  }
  await ctx.close();
  return made.sort((a, b) => a.file.localeCompare(b.file));
}
