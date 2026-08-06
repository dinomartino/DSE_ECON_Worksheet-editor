import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The LQ (Question-Answer Book) harness — `cover-verify`'s sibling for the booklet
 * (§ LQ_MODE_HANDOFF §5). One command that answers "do the three outputs agree, is the
 * booklet the length it claims, and is the answer-space pitch the reference's?".
 *
 * Produces, in the out dir:
 *
 *   lq-docx.png      exported .docx → LibreOffice → PDF → the pure answer page
 *   lq-preview.png   the same sheet on screen, screenshotted from the real app
 *   lq-print.png     Chrome's print PDF (the @media print path) → the same page
 *   lq-ref.png       the reference booklet's own pure answer page (gitignored; soft)
 *   lq-contact.png   all of the above side by side, labelled
 *
 * and asserts:
 *   - the .docx renders EXPECTED_PAGES sheets (a booklet is a length claim);
 *   - the preview shows the same number of sheets, cover included;
 *   - Chrome's print PDF has the same number of pages;
 *   - the rendered dotted pitch on the pure answer page is the reference's 46px@150dpi.
 *
 * The interior page, not page 1: the cover harness's legs only ever rasterised page 1,
 * which is exactly the blind spot the blank-sheet bug hid in.
 *
 *   node scripts/lq-verify.mjs [--out=/tmp/lq-verify] [--url=http://localhost:3000]
 *                              [--skip-fixtures]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/lq-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

/**
 * Fixture geometry: cover + 6 body sheets (see scripts/lq-fixtures.test.ts).
 *
 * Was 5 until `lqMock` gained its closing lines ("END OF SECTION A/B", "END OF PAPER").
 * The count is deliberately restated here rather than derived: a booklet is a *length
 * claim*, and a harness that computed the expected number from the same model it is
 * checking would agree with any regression.
 */
const EXPECTED_PAGES = 7;
/** The pure answer sheet: PDF page number, and preview body index (cover excluded). */
const PURE_PAGE = 4;
const PURE_BODY_INDEX = 2;
/**
 * The dotted pitch measured on the page: 49px at 150dpi.
 *
 * Rule to rule is the *advance*, not the line box — 442tw of box plus the 30tw (1.5pt)
 * gap above each line = 472tw = 23.6pt, which is 49.2px at 150dpi
 * (§ `LQ_LINE_ADVANCE_TWIPS`). The reference booklet's own 46px measures its 442tw box
 * alone; this paper lifts each line off the one above so descenders clear the dots, so
 * the printed gap is correspondingly larger.
 */
const EXPECTED_PITCH_PX = 49;

mkdirSync(OUT, { recursive: true });

const failures = [];

const collectPage = (prefix, dest) => {
  for (const suffix of [`-${PURE_PAGE}`, `-0${PURE_PAGE}`, `-00${PURE_PAGE}`]) {
    if (existsSync(`${prefix}${suffix}.png`)) {
      renameSync(`${prefix}${suffix}.png`, dest);
      return;
    }
  }
  console.error(`pdftoppm produced no page ${PURE_PAGE} for ${prefix}`);
  process.exit(1);
};

const run = (cmd, cmdArgs, label, soft = false) => {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    if (soft) {
      console.log(`skipped: ${label} (${res.error?.code ?? `exit ${res.status}`})`);
      return undefined;
    }
    console.error(`FAILED: ${label}\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
  return res.stdout;
};

const pdfPages = (path, label) => {
  const info = run('pdfinfo', [path], `pdfinfo ${label}`, true);
  return Number(/^Pages:\s*(\d+)$/m.exec(info ?? '')?.[1]);
};

const checkPages = (pages, label) => {
  if (!Number.isFinite(pages)) {
    console.log(`could not read a page count for ${label} — skipping`);
    return;
  }
  const ok = pages === EXPECTED_PAGES;
  console.log(`${ok ? '✓' : '✗'} ${label}: ${pages} page(s), expected ${EXPECTED_PAGES}`);
  if (!ok) failures.push(`${label}: ${pages} pages, expected ${EXPECTED_PAGES}`);
};

// ── 1. Fixture ──────────────────────────────────────────────────────────────────
if (!args.includes('--skip-fixtures')) {
  run('npx', ['vitest', 'run', 'scripts/lq-fixtures.test.ts'], 'emit fixture', false);
}

// ── 2. .docx leg ────────────────────────────────────────────────────────────────
run(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', OUT, `${OUT}/lq.docx`], 'soffice');
checkPages(pdfPages(`${OUT}/lq.pdf`, 'docx'), 'docx');
run('pdftoppm', ['-r', '90', '-png', '-f', String(PURE_PAGE), '-l', String(PURE_PAGE), `${OUT}/lq.pdf`, `${OUT}/lq-docx`], 'pdftoppm docx');
collectPage(`${OUT}/lq-docx`, `${OUT}/lq-docx.png`);

// Pitch, measured off a 150dpi raster of the pure answer page — render, not reasoning.
run('pdftoppm', ['-r', '150', '-gray', '-png', '-f', String(PURE_PAGE), '-l', String(PURE_PAGE), `${OUT}/lq.pdf`, `${OUT}/lq-pitch`], 'pdftoppm pitch');
const pitchOut = run('python3', ['scripts/lq-pitch.py', `${OUT}/lq-pitch-${PURE_PAGE}.png`, String(EXPECTED_PITCH_PX)], 'pitch check', true);
if (pitchOut !== undefined) {
  process.stdout.write(pitchOut);
  if (pitchOut.includes('PITCH FAIL')) failures.push('dotted pitch off the reference');
}

// ── 3. Reference leg (gitignored; soft) ─────────────────────────────────────────
const REFERENCE = 'real_life_reference/DSE2019_Paper 2.pdf';
if (existsSync(REFERENCE)) {
  // Page 10 is a pure answer page in the reference booklet.
  run('pdftoppm', ['-r', '90', '-png', '-f', '10', '-l', '10', REFERENCE, `${OUT}/lq-refpg`], 'pdftoppm ref');
  renameSync(`${OUT}/lq-refpg-10.png`, `${OUT}/lq-ref.png`);
} else {
  console.log(`no reference (${REFERENCE} absent) — skipping ref leg`);
}

// ── 4. Browser legs ─────────────────────────────────────────────────────────────
const reachable = await fetch(URL_BASE).then((r) => r.ok).catch(() => false);
let devServer;
if (!reachable) {
  console.log(`dev server not running at ${URL_BASE} — starting one`);
  devServer = spawn('npm', ['run', 'dev'], { stdio: 'ignore', detached: false });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) {
    console.error('dev server did not come up within 60s');
    devServer.kill();
    process.exit(1);
  }
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const json = readFileSync(`${OUT}/lq.worksheet.json`, 'utf8');
  const worksheet = JSON.parse(json);
  const title = 'LQ harness booklet';
  const index = JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt }]);
  const context = await browser.newContext({
    viewport: { width: 1512, height: 1500 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(
    ([indexJson, key, doc]) => {
      window.localStorage.setItem('econ-worksheet-index', indexJson);
      window.localStorage.setItem(key, doc);
    },
    [index, `econ-worksheet:${worksheet.id}`, json],
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await page.waitForSelector('[data-cover]', { timeout: 15_000 });
  // Let the measure → pack → (fill-resolve) cycle settle before counting sheets.
  await page.waitForTimeout(1500);

  const sheetCount = await page.evaluate(
    () => document.querySelectorAll('#print-root .paper').length,
  );
  checkPages(sheetCount, 'preview');

  /*
   * §3.2's contract, asserted live: the paginator resolves the closing fill element
   * and writes the count into the model; the .docx already exported the count the
   * fixture stored. Equal means the exporter read the number the preview resolved —
   * unequal means the fixture needs recalibrating (and, until it is, the docx and the
   * preview genuinely disagree about the last sheet).
   */
  const fill = worksheet.layout.find((el) => el.kind === 'answerSpace' && el.fill);
  if (fill) {
    // The resolved count lives in the store; read it back through the autosaved model.
    const stored = await page.evaluate(async (id) => {
      // Wait out the autosave debounce so localStorage holds the resolved value.
      await new Promise((r) => setTimeout(r, 2000));
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key || !key.startsWith('econ-worksheet:')) continue;
        const doc = JSON.parse(window.localStorage.getItem(key) ?? '{}');
        const el = (doc.layout ?? []).find((entry) => entry.id === id);
        if (el) return el.lines;
      }
      return undefined;
    }, fill.id);
    const ok = stored === fill.lines;
    console.log(
      `${ok ? '✓' : '✗'} fill: resolved to ${stored ?? 'unknown'} line(s), fixture stored ${fill.lines}`,
    );
    if (!ok) failures.push(`fill resolved to ${stored}, fixture stored ${fill.lines} — recalibrate`);
  }

  await page.addStyleTag({ content: '[data-print-hide]{display:none !important}' });
  const sheet = page.locator(`#print-root [data-page-index="${PURE_BODY_INDEX}"] .paper`);
  await sheet.scrollIntoViewIfNeeded();
  const clip = await sheet.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  });
  await page.screenshot({ path: `${OUT}/lq-preview.png`, clip, fullPage: true });

  await page.pdf({
    path: `${OUT}/lq-print.pdf`,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
  });
  checkPages(pdfPages(`${OUT}/lq-print.pdf`, 'print'), 'print');
  run('pdftoppm', ['-r', '90', '-png', '-f', String(PURE_PAGE), '-l', String(PURE_PAGE), `${OUT}/lq-print.pdf`, `${OUT}/lq-print`], 'pdftoppm print');
  collectPage(`${OUT}/lq-print`, `${OUT}/lq-print.png`);
  await context.close();
} finally {
  await browser.close();
  if (devServer) devServer.kill();
}

// ── 5. Compare ──────────────────────────────────────────────────────────────────
spawnSync('python3', ['scripts/cover-compare.py', OUT, 'lq'], { stdio: 'inherit' });

if (failures.length > 0) {
  console.error(`\n✗ lq-verify failed:\n  - ${failures.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✓ lq-verify passed');
