import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * The three-way cover harness (COVER_HANDOFF.md §4.4).
 *
 * One command that answers "do the three outputs agree, and do they look like the
 * reference?" — for both paper styles. Per style it produces, in the out dir:
 *
 *   <p>-docx.png     exported .docx → LibreOffice → PDF → page 1 raster
 *   <p>-preview.png  the on-screen cover sheet, screenshotted from the real app
 *   <p>-print.png    Chrome's print PDF (the @media print path) → page 1 raster
 *   <p>-ref.png      the reference scan's page 1 (skipped when gitignored refs absent)
 *   <p>-contact.png  all of the above side by side, labelled
 *
 * plus a pairwise diff table on stdout (scripts/cover-compare.py).
 *
 *   node scripts/cover-verify.mjs [--out=/tmp/cover-verify] [--url=http://localhost:3000]
 *                                 [--skip-fixtures]
 *
 * Needs LibreOffice and pdftoppm (poppler). Starts `npm run dev` itself if the URL is
 * not already serving, and stops it again on exit.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/cover-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const SOFFICE = '/Applications/LibreOffice.app/Contents/MacOS/soffice';

const PAPERS = [
  { name: 'p1', reference: 'real_life_reference/DSE2021_Paper 1.pdf' },
  { name: 'p2', reference: 'real_life_reference/DSE2019_Paper 2.pdf' },
];

mkdirSync(OUT, { recursive: true });

// pdftoppm zero-pads the page suffix to the source's page count ("-1", "-01", …).
const collectPage = (prefix, dest) => {
  for (const suffix of ['-1', '-01', '-001']) {
    if (existsSync(`${prefix}${suffix}.png`)) {
      renameSync(`${prefix}${suffix}.png`, dest);
      return;
    }
  }
  console.error(`pdftoppm produced no page for ${prefix}`);
  process.exit(1);
};

const run = (cmd, cmdArgs, label) => {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'pipe', encoding: 'utf8' });
  if (res.status !== 0) {
    console.error(`FAILED: ${label}\n${res.stdout}\n${res.stderr}`);
    process.exit(1);
  }
  return res.stdout;
};

// ── 1. Fixtures: one worksheet per style, as .docx + .worksheet.json ────────────
if (!args.includes('--skip-fixtures')) {
  run(
    'npx',
    ['vitest', 'run', 'scripts/cover-fixtures.test.ts'],
    'emit fixtures',
  );
}

// ── 2. .docx leg: LibreOffice → PDF → page 1 PNG ────────────────────────────────
for (const { name } of PAPERS) {
  const docx = `${OUT}/cover-${name}.docx`;
  run(SOFFICE, ['--headless', '--convert-to', 'pdf', '--outdir', OUT, docx], `soffice ${name}`);
  run('pdftoppm', ['-r', '90', '-png', '-f', '1', '-l', '1', `${OUT}/cover-${name}.pdf`, `${OUT}/${name}-docx`], `pdftoppm docx ${name}`);
  collectPage(`${OUT}/${name}-docx`, `${OUT}/${name}-docx.png`);
}

// ── 3. Reference scans (gitignored; degrade gracefully when absent) ─────────────
for (const { name, reference } of PAPERS) {
  if (!existsSync(reference)) {
    console.log(`no reference for ${name} (${reference} absent) — skipping ref leg`);
    continue;
  }
  run('pdftoppm', ['-r', '90', '-png', '-f', '1', '-l', '1', reference, `${OUT}/${name}-ref`], `pdftoppm ref ${name}`);
  collectPage(`${OUT}/${name}-ref`, `${OUT}/${name}-ref.png`);
}

// ── 4. Browser legs: preview screenshot + print PDF, seeded via localStorage ────
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
  for (const { name } of PAPERS) {
    const json = readFileSync(`${OUT}/cover-${name}.worksheet.json`, 'utf8');
    const worksheet = JSON.parse(json);
    // Seed the store the app actually loads from: the most recent index entry wins.
    const index = JSON.stringify([
      { id: worksheet.id, title: `Cover harness ${name}`, updatedAt: worksheet.updatedAt },
    ]);
    const context = await browser.newContext({
      // Tall enough that a whole A4 sheet fits: the sheets scroll in an inner
      // container, so a clip cannot reach below the viewport's bottom edge.
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
    page.on('pageerror', (e) => console.log(`PAGE ERR (${name}):`, e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-cover]', { timeout: 15_000 });
    await page.waitForTimeout(800);

    // The preview leg represents the printed sheet, so editing chrome (hint pill,
    // affordances) is stripped the same way print CSS strips it.
    await page.addStyleTag({ content: '[data-print-hide]{display:none !important}' });
    // The sheets sit inside a `scale()` transform, and an element screenshot uses the
    // untransformed box — capturing the layout height with the visual height painted at
    // scale, so grey shows below the sheet. Clip to the *visual* rect instead.
    const sheet = page.locator('.paper', { has: page.locator('[data-cover]') });
    // Page coordinates (clip is document-absolute, the rect is viewport-relative).
    const clip = await sheet.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.x + window.scrollX,
        y: r.y + window.scrollY,
        width: r.width,
        height: r.height,
      };
    });
    await page.screenshot({ path: `${OUT}/${name}-preview.png`, clip, fullPage: true });

    await page.pdf({
      path: `${OUT}/cover-${name}-print.pdf`,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    run('pdftoppm', ['-r', '90', '-png', '-f', '1', '-l', '1', `${OUT}/cover-${name}-print.pdf`, `${OUT}/${name}-print`], `pdftoppm print ${name}`);
    collectPage(`${OUT}/${name}-print`, `${OUT}/${name}-print.png`);
    await context.close();
  }
} finally {
  await browser.close();
  if (devServer) devServer.kill();
}

// ── 5. Compare ──────────────────────────────────────────────────────────────────
const compare = spawnSync('python3', ['scripts/cover-compare.py', OUT], {
  stdio: 'inherit',
});
process.exit(compare.status ?? 1);
