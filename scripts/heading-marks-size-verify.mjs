import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that a section heading's derived "(n marks)" / 「（n分）」 takes the
 * heading's own size when the teacher resizes it (u-d4n6, u-7oby).
 *
 * Before: the heading text selected and resized from the format bar left the marks at the
 * Section Heading style's 14pt. For an English paper and a 中文 paper:
 *  - select the heading's words, pick 20 → the marks print at 20pt too;
 *  - put the caret in the heading (nothing selected), pick 11 → the whole heading, marks
 *    included, prints at 11pt (this way already worked; it must keep working);
 *  - type a letter at the end of the heading → the stored heading holds the words and the
 *    letter, never the total, and the page prints the total once. (Before, the open field
 *    held the printed line, so one keystroke stored "(9 marks)" and it printed twice.)
 *
 *   node scripts/heading-marks-size-verify.mjs [--url=http://localhost:3000] [--out=/tmp/heading-marks-size]
 *
 * Needs a running dev server and Chrome (CHROME, default /opt/google/chrome/chrome).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/heading-marks-size');
mkdirSync(OUT, { recursive: true });

const base = JSON.parse(readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function seed() {
  const doc = structuredClone(base);
  const section = doc.layout.find((element) => element.kind === 'section');
  section.showMarks = true;
  return doc;
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });

try {
  for (const [label, paper, heading, marks] of [
    ['en', 'en', 'Section A', 'marks)'],
    ['zh', 'zh', '甲部', '分）'],
  ]) {
    const doc = seed();
    const key = `econ-worksheet:${doc.id}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([version, index, k, body, paperLanguage]) => {
        if (!localStorage.getItem(k)) {
          localStorage.setItem('econ-worksheet-last-seen-version', version);
          localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: paperLanguage }));
          localStorage.setItem('econ-worksheet-index', index);
          localStorage.setItem(k, body);
        }
      },
      [APP_VERSION, JSON.stringify([{ id: doc.id, title: 'Marks size verify', updatedAt: doc.updatedAt }]), key, JSON.stringify(doc), paper],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Marks size verify/ }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
    await page.waitForTimeout(1200);

    /** The point size the page prints the text node holding `needle` at. */
    const sizeOf = (needle) =>
      page.evaluate((n) => {
        const walker = document.createTreeWalker(document.querySelector('#print-root'), NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (node.data.includes(n)) return Math.round(Number.parseFloat(getComputedStyle(node.parentElement).fontSize) * 0.75 * 10) / 10;
        }
        return undefined;
      }, needle);
    /** The middle of the heading's words on the page. */
    const headingBox = () => page.locator('#print-root').getByText(heading, { exact: false }).first().boundingBox();
    const size = page.getByRole('combobox', { name: 'Font size' }).first();
    const end = async () => {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
    };

    check(`${label}: an untouched heading prints its marks at 14pt`, (await sizeOf(marks)) === 14 && (await sizeOf(heading)) === 14, `${await sizeOf(heading)} / ${await sizeOf(marks)}`);
    await page.screenshot({ path: `${OUT}/${label}-0-untouched.png`, clip: await page.locator('#print-root .paper').first().boundingBox().then((b) => ({ x: b.x, y: b.y, width: b.width, height: 260 })) });

    // 1. Select the heading's words, then pick a size: run-level formatting.
    let box = await headingBox();
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await page.keyboard.press('Home');
    await page.keyboard.press('Shift+End');
    await page.waitForTimeout(300);
    const selected = await page.evaluate(() => String(window.getSelection() ?? ''));
    check(`${label}: the heading's words are selected`, selected.trim() === heading, `selected "${selected}"`);
    await size.selectOption('20');
    await page.waitForTimeout(400);
    await end();
    check(`${label}: selected words resized to 20 → the heading prints at 20pt`, (await sizeOf(heading)) === 20, String(await sizeOf(heading)));
    check(`${label}: … and its marks follow, at 20pt`, (await sizeOf(marks)) === 20, String(await sizeOf(marks)));
    await page.screenshot({ path: `${OUT}/${label}-1-run-size.png`, clip: await page.locator('#print-root .paper').first().boundingBox().then((b) => ({ x: b.x, y: b.y, width: b.width, height: 260 })) });

    // 2. Undo, then size the whole heading with only a caret in it: element-level.
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    await page.waitForTimeout(500);
    check(`${label}: undo puts both back at 14pt`, (await sizeOf(heading)) === 14 && (await sizeOf(marks)) === 14, `${await sizeOf(heading)} / ${await sizeOf(marks)}`);
    box = await headingBox();
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    await page.waitForTimeout(300);
    await size.selectOption('11');
    await page.waitForTimeout(400);
    await end();
    check(`${label}: whole heading sized to 11 (caret only) → heading and marks at 11pt`, (await sizeOf(heading)) === 11 && (await sizeOf(marks)) === 11, `${await sizeOf(heading)} / ${await sizeOf(marks)}`);
    await page.screenshot({ path: `${OUT}/${label}-2-element-size.png`, clip: await page.locator('#print-root .paper').first().boundingBox().then((b) => ({ x: b.x, y: b.y, width: b.width, height: 260 })) });

    // 3. Type at the end of the heading: the field holds the words alone.
    box = await headingBox();
    await page.mouse.click(box.x + 4, box.y + box.height / 2);
    await page.waitForTimeout(300);
    const field = await page.evaluate(() => document.activeElement?.textContent ?? '');
    check(`${label}: the open field holds the heading's words, not the marks`, field === heading, `field "${field}"`);
    await page.keyboard.press('End');
    await page.keyboard.type('X');
    await end();
    await page.waitForTimeout(800);
    const stored = await page.evaluate((k) => {
      const section = JSON.parse(localStorage.getItem(k)).layout.find((element) => element.kind === 'section');
      return section.text;
    }, key);
    const storedSide = stored[paper].map((run) => run.text).join('');
    const otherSide = stored[paper === 'en' ? 'zh' : 'en'].map((run) => run.text).join('');
    check(`${label}: the stored heading is the words + X, no total`, storedSide === `${heading}X`, storedSide);
    check(`${label}: the other language's stored heading has no total either`, !/marks|分/.test(otherSide), otherSide);
    const line = await page.locator('[data-page-target^="layoutText"]').first().textContent();
    check(`${label}: the page prints the total once`, (line.match(paper === 'en' ? /marks\)/g : /分）/g) ?? []).length === 1, line);
    await page.screenshot({ path: `${OUT}/${label}-3-typed.png`, clip: await page.locator('#print-root .paper').first().boundingBox().then((b) => ({ x: b.x, y: b.y, width: b.width, height: 260 })) });

    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
