// Film v2's sheet stills: single printed pages at 100% zoom, DPR 3, from print preview.
// `paper-covers`: the Paper 1 and Paper 2 covers, a Paper 2 answer page, the LQ worksheet's
// dotted answer space. `key-sheets`: page 1 of the answer key in each of its four layouts.
// The box is measured after the clock settles, so a late re-flow cannot shift the crop.
import fs from 'node:fs';
import path from 'node:path';
import { deselect, openDoc, setLanguage, setPrintPreview } from '../../film/capture/app.mjs';
import { freeze, launch, openPage, OUT, settle } from '../../film/capture/session.mjs';
import { PAPER } from './content.mjs';

const VIEWPORT = { width: 1700, height: 1400 };

async function sheet(page, cdp, index, file, log) {
  const paper = page.locator('#print-root .paper').nth(index);
  // scrollTop, not scrollIntoView: the virtual clock eases scrollIntoView over frames.
  await paper.evaluate((el) => {
    const sc = el.closest('main');
    sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 40;
  });
  await page.mouse.move(VIEWPORT.width - 1, VIEWPORT.height - 1);
  await page.evaluate(() => {
    const node = document.getElementById('__demo_cursor');
    if (node) node.style.visibility = 'hidden';
  });
  await settle(page, 400);
  await freeze(page, 0.8);
  const b = await paper.boundingBox();
  const shot = await cdp.send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: false, clip: { x: b.x, y: b.y, width: b.width, height: b.height, scale: 1 },
  });
  await page.evaluate(() => window.__vt.auto(true));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  log(`  sheet: ${path.basename(file)}`);
}

async function open(env, name, language) {
  const s = await openPage(env.browser3, { url: env.url, state: env.state, dpr: 3, log: env.log });
  await s.page.setViewportSize(VIEWPORT);
  await openDoc(s.page, name);
  await setLanguage(s.page, language);
  await deselect(s.page);
  return s;
}

async function withBrowser(env, fn) {
  const browser3 = await launch(3);
  try {
    await fn({ ...env, browser3 });
  } finally {
    await browser3.close();
  }
}

const out = (name) => path.join(OUT.sheets, `${name}.png`);

async function paperCovers(env) {
  await withBrowser(env, async (e) => {
    for (const [name, shots] of [
      ['S6 Mock Exam Paper 1', [[0, 'p1-cover']]],
      ['S6 Mock Exam Paper 2', [[0, 'p2-cover'], [1, 'p2-page']]],
      ['S5 Market Failure LQ', [[0, 'lq-1'], [1, 'lq-2']]],
    ]) {
      const s = await open(e, name, 'en');
      await setPrintPreview(s.page, true);
      for (const [index, file] of shots) await sheet(s.page, s.cdp, index, out(file), e.log);
      await s.ctx.close();
    }
  });
}

async function keySheets(env) {
  await withBrowser(env, async (e) => {
    const s = await open(e, PAPER.name, 'bilingual');
    await s.page.getByTitle(/^Marking scheme/).first().click();
    await settle(s.page, 900);
    await setPrintPreview(s.page, true);
    for (const [style, file] of [
      ['Classic', 'key-classic'], ['HKEAA style', 'key-hkeaa'], ['Suggested answers', 'key-suggested'], ['Detailed table', 'key-detailed'],
    ]) {
      // The Layout tab sits beside the sheets in print preview too; pick the style there.
      await setPrintPreview(s.page, false);
      await s.page.getByText(style, { exact: true }).first().click();
      await settle(s.page, 700);
      await setPrintPreview(s.page, true);
      await sheet(s.page, s.cdp, 0, out(file), e.log);
    }
    await s.ctx.close();
  });
}

export const SHEET_JOBS = [
  { name: 'paper-covers', about: 'Sheets: Paper 1 and Paper 2 covers, a Paper 2 answer page, the LQ dotted answer space (DPR 3).', run: paperCovers },
  { name: 'key-sheets', about: 'Sheets: page 1 of the answer key in Classic, HKEAA style, Suggested answers, Detailed table.', run: keySheets },
];
