// The website screenshot set. Each entry puts the app in a state and is captured at 2×,
// then scaled to 1440 wide. Entries run in order on one page, starting from the
// finished quiz (flow.mjs:buildQuiz). To add a screenshot, add an entry.
import fs from 'node:fs';
import path from 'node:path';
import { FEEDBACK } from './content.mjs';
import { CONTEXT, makeDriver, question, buildQuiz, buildLibrary } from './flow.mjs';

const VIEW_EDGE = { x: 1439, y: 899 };

export const SHOTS = [
  {
    file: '02-editor-bilingual-mcq',
    caption: 'Editor: three filled MCQs in EN+中 bilingual mode',
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
    caption: 'The same page in Teacher mode, with answers shown',
    async prepare({ page }) {
      await page.getByTitle(/Teacher version/).click();
    },
  },
  {
    file: '04-structured-marks-lines',
    caption: 'Structured question with (a)/(b) marks and dotted answer lines',
    async prepare({ page, wait }) {
      await page.getByTitle(/Student version/).click();
      await wait(300);
      const q = question(page, 3);
      await q.scrollIntoViewIfNeeded();
      await q.locator('span.absolute').first().click();
      await wait(300);
      const box = await q.boundingBox();
      await page.mouse.move(560, 450);
      await page.mouse.wheel(0, box.y - 200);
    },
  },
  {
    file: '05-setup-versions',
    caption: 'Document settings, with Versions set to 3 (A/B/C)',
    async prepare({ page, wait }) {
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Setup' }).click();
      await wait(400);
      await page.getByRole('dialog').getByText('3', { exact: true }).click();
    },
  },
  {
    file: '06-export-dialog',
    caption: 'Export: Question paper / Answer key / Both',
    async prepare({ page, wait }) {
      await page.keyboard.press('Escape');
      await wait(400);
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
    caption: 'Send feedback dialog, with an example idea typed in',
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
    caption: 'Start screen: templates and four saved worksheets',
    async prepare(d) {
      await d.page.keyboard.press('Escape');
      await d.wait(1500); // let autosave flush before leaving the quiz
      await buildLibrary(d);
      await d.page.goto(d.url, { waitUntil: 'networkidle' });
      await d.wait(1500);
    },
  },
];

/** Capture every SHOTS entry into `outDir/screenshots/`, via `encode(png, outBase)`. */
export async function takeScreenshots({ browser, url, outDir, tmpDir, encode, log }) {
  const ctx = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  const d = makeDriver(page, { url });
  const dir = path.join(outDir, 'screenshots');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  log('screenshots: building the quiz…');
  await buildQuiz(d);
  const made = [];
  for (const shot of SHOTS) {
    await shot.prepare(d);
    await d.wait(700);
    await page.mouse.move(VIEW_EDGE.x, VIEW_EDGE.y); // park the pointer: no hover chrome
    await d.wait(300);
    const png = path.join(tmpDir, `${shot.file}.png`);
    await page.screenshot({ path: png });
    made.push({ ...shot, path: encode(png, path.join(dir, shot.file)) });
    log(`  ${shot.file}`);
  }
  await ctx.close();
  return made.sort((a, b) => a.file.localeCompare(b.file));
}

