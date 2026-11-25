import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Before/after proof for k-0557 (a placed watermark starts fitted to the margins): the
 * same saved picture put on the same paper with the toolbar's one-click button, in an old
 * build (`--before`) and this one (`--after`), on screen, in the print PDF and in the
 * `.docx` the real Export dialog writes. Plus an old file whose watermark was already
 * placed (moved and resized), opened in both, which must not change.
 *
 *   node scripts/watermark-fit-proof.mjs --before=http://localhost:3558 --after=http://localhost:3557 --out=/tmp/k0557-proof
 *
 * Writes `<case>-<build>-screen.png`, `-print.pdf`, `.docx` per case; turning them into
 * pictures (LibreOffice, pdftoppm) is left to the shell. Needs Chrome (CHROME on Linux).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/k0557-proof');
const BUILDS = { before: opt('before', 'http://localhost:3558'), after: opt('after', 'http://localhost:3557') };
mkdirSync(OUT, { recursive: true });

const fixture = JSON.parse(readFileSync(new URL('../test-fixtures/manual/page-flow-mix.json', import.meta.url), 'utf8'));
const LOGO_SVG = readFileSync(new URL('../test-fixtures/manual/watermark-logo.svg', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });

/** The test pictures, drawn once in a browser: a square crest, a tall banner, a wide word. */
const pictures = await (async () => {
  const page = await browser.newPage();
  const made = await page.evaluate(async (svg) => {
    const draw = (w, h, paint) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      paint(c.getContext('2d'));
      return { src: c.toDataURL('image/png'), widthPx: w, heightPx: h };
    };
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(svg)}`;
    await img.decode();
    const crest = draw(600, 600, (g) => g.drawImage(img, 0, 0, 600, 600));
    const tall = draw(400, 900, (g) => {
      g.strokeStyle = '#1d3a6e';
      g.lineWidth = 18;
      g.strokeRect(20, 20, 360, 860);
      g.fillStyle = '#1d3a6e';
      g.font = 'bold 120px sans-serif';
      g.textAlign = 'center';
      for (const [i, ch] of [...'DRAFT'].entries()) g.fillText(ch, 200, 190 + i * 150);
    });
    const word = draw(1200, 300, (g) => {
      g.fillStyle = '#1d3a6e';
      g.font = 'bold 220px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('SAMPLE', 600, 160);
    });
    return { crest, tall, word };
  }, LOGO_SVG);
  await page.close();
  return made;
})();

const PORTRAIT = fixture.pageSetup;
const LANDSCAPE = { ...fixture.pageSetup, orientation: 'landscape' };
const CASES = [
  { name: 'a4-portrait-crest', picture: 'crest', setup: PORTRAIT },
  { name: 'a4-portrait-tall', picture: 'tall', setup: PORTRAIT },
  { name: 'a4-portrait-text', picture: 'word', setup: PORTRAIT },
  { name: 'a4-landscape-crest', picture: 'crest', setup: LANDSCAPE },
  // A paper saved before k-0557 with a watermark the teacher moved and resized.
  {
    name: 'old-file-kept',
    picture: 'crest',
    setup: PORTRAIT,
    saved: { on: true, ...pictures.crest, name: 'Crest', libraryId: 'wm-crest', size: 0.45, centerX: 0.62, centerY: 0.4 },
  },
  // One saved before k-0557, never moved: the old default size, which must stay.
  { name: 'old-file-default', picture: 'crest', setup: PORTRAIT, saved: { on: true, ...pictures.crest, name: 'Crest', libraryId: 'wm-crest' } },
];

const report = [];
for (const testCase of CASES) {
  for (const [build, url] of Object.entries(BUILDS)) {
    const doc = { ...fixture, id: `k0557-${testCase.name}`, title: testCase.name, pageSetup: testCase.setup };
    if (testCase.saved) doc.watermark = testCase.saved;
    const library = [{ id: `wm-${testCase.picture}`, name: testCase.picture, kind: 'image', ...pictures[testCase.picture], createdAt: '2026-11-25T00:00:00Z' }];
    const context = await browser.newContext({ viewport: { width: 1400, height: 1800 }, acceptDownloads: true, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([version, indexJson, key, body, wm]) => {
        if (window.localStorage.getItem(key)) return;
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: 'en' }));
        window.localStorage.setItem('econgen.settings.watermarks', wm);
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, body);
        delete window.showSaveFilePicker;
      },
      [
        APP_VERSION,
        JSON.stringify([{ id: doc.id, title: doc.title, updatedAt: doc.updatedAt }]),
        `econ-worksheet:${doc.id}`,
        JSON.stringify(doc),
        JSON.stringify({ v: 1, library, lastUsedId: library[0].id }),
      ],
    );
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(testCase.name) }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
    await page.waitForTimeout(2500);
    if (!testCase.saved) {
      // The toolbar's one click: the last used picture goes on the paper.
      await page.getByTestId('watermark-button').getByRole('button', { name: 'Watermark', exact: true }).click();
      await page.waitForTimeout(1500);
    }
    // Leave editing so the per-page chips are not in the shot.
    await page.keyboard.press('Escape');
    await page.mouse.click(5, 600);
    await page.waitForTimeout(600);
    const box = await page.evaluate(() => {
      const sheet = document.querySelector('#print-root .paper');
      const img = sheet.querySelector('[data-watermark] img');
      const r = sheet.getBoundingClientRect();
      const s = img?.style;
      return { sheet: { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height }, mm: s ? { left: s.left, top: s.top, width: s.width, height: s.height } : null };
    });
    // The floating hints and zoom bar are not the page: hide them for the shot only.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('body *')) if (getComputedStyle(el).position === 'fixed') el.style.visibility = 'hidden';
    });
    await page.locator('#print-root .paper').first().screenshot({ path: `${OUT}/${testCase.name}-${build}-screen.png` });
    // The paper's page box, written out as the desktop's own PDF save gives it (`pdfPageBox`):
    // headless Chrome does not resolve the variables in globals.css's @page.
    await page.addStyleTag({ content: `@page { size: ${testCase.setup.paper} ${testCase.setup.orientation}; margin: 0; }` });
    await page.emulateMedia({ media: 'print' });
    await page.pdf({
      path: `${OUT}/${testCase.name}-${build}-print.pdf`,
      printBackground: true,
      format: testCase.setup.paper,
      landscape: testCase.setup.orientation === 'landscape',
    });
    await page.emulateMedia({ media: 'screen' });

    await page.getByRole('button', { name: /Export…/ }).first().click();
    const exporter = page.getByRole('dialog');
    await exporter.getByText('.docx', { exact: true }).click();
    const english = exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true });
    if (await english.count()) await english.click();
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
    ]);
    await download.saveAs(`${OUT}/${testCase.name}-${build}.docx`);
    const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)).watermark, `econ-worksheet:${doc.id}`);
    delete stored?.src;
    report.push({ case: testCase.name, build, box: box.mm, stored });
    console.log(testCase.name, build, JSON.stringify(box.mm), JSON.stringify(stored));
    await context.close();
  }
}
writeFileSync(`${OUT}/boxes.json`, `${JSON.stringify(report, null, 2)}\n`);
await browser.close();
