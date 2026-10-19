import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * `npm run samples`: real .docx files in scratch, to open in Word by hand.
 *
 * Exported through the app's own Export dialog in a real Chrome, not built in Node: the
 * `.docx` breaks its pages where the preview's paginator does (§ `joinWithPageBreaks`), and
 * the pages exist only as a browser measures them. `scripts/emit-samples.test.ts` plans
 * the documents and the files to make from each; this opens each document from the start
 * screen and exports every planned file, saving the download where the plan says.
 *
 *   node scripts/emit-samples.mjs [--out=/tmp/econ-samples] [--url=http://localhost:3000]
 *                                 [--skip-plan] [--only=<substring of an output path>]
 *
 * `--out` defaults to $SAMPLE_DIR, else the path shown. Starts `npm run dev` itself when
 * the URL is not already serving, and stops it again on exit. Needs Chrome (playwright's
 * `channel: 'chrome'`).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', process.env.SAMPLE_DIR ?? '/tmp/econ-samples');
const URL_BASE = opt('url', 'http://localhost:3000');
const ONLY = opt('only', '');
const PLAN = `${OUT}/.plan`;
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// The dialog's language options, by their titles (`ExportDialog.messages.ts`).
const LANGUAGE_TITLE = { en: 'English only', zh: '中文 only', bilingual: 'Bilingual' };

if (!args.includes('--skip-plan')) {
  const res = spawnSync('npx', ['vitest', 'run', 'scripts/emit-samples.test.ts'], {
    stdio: 'inherit',
    env: { ...process.env, SAMPLE_DIR: OUT },
  });
  if (res.status !== 0) process.exit(res.status ?? 1);
}
const plan = JSON.parse(readFileSync(`${PLAN}/plan.json`, 'utf8')).filter((file) => file.out.includes(ONLY));

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
let failed = 0;
try {
  const byDoc = new Map();
  for (const file of plan) byDoc.set(file.doc, [...(byDoc.get(file.doc) ?? []), file]);

  for (const [doc, files] of byDoc) {
    const json = readFileSync(`${PLAN}/${doc}`, 'utf8');
    const worksheet = JSON.parse(json);
    const { title } = files[0];
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true });
    await context.addInitScript(
      ([indexJson, key, body, version]) => {
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, body);
        // What's new would cover the start screen and swallow the click below.
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        // A save picker would wait for a person; the download it falls back to is the
        // same built file.
        delete window.showSaveFilePicker;
      },
      [
        JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt ?? new Date().toISOString() }]),
        `econ-worksheet:${worksheet.id}`,
        json,
        APP_VERSION,
      ],
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log(`PAGE ERR (${doc}):`, e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(`${title}(?!\\d)`) }).first().click();
    await page.locator('#print-root .paper').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);

    for (const file of files) {
      try {
        await page.getByRole('button', { name: /Export…/ }).first().click();
        const dialog = page.getByRole('dialog');
        await dialog.getByText('.docx', { exact: true }).click();
        await dialog
          .getByRole('radiogroup', { name: 'What to export' })
          .getByRole('radio', { name: file.what === 'paper' ? 'Question paper' : 'Answer key', exact: true })
          .click();
        await dialog
          .getByRole('radiogroup', { name: 'Language' })
          .getByTitle(LANGUAGE_TITLE[file.language], { exact: true })
          .click();
        if (file.what === 'paper') {
          await dialog
            .getByRole('radiogroup', { name: 'Student or teacher copy' })
            .getByRole('radio', { name: file.version === 'teacher' ? 'Teacher' : 'Student', exact: true })
            .click();
          if (file.variant) {
            await dialog
              .getByRole('radiogroup', { name: 'Shuffled versions' })
              .getByRole('radio', { name: file.variant, exact: true })
              .click();
          }
        }
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60_000 }),
          dialog.getByRole('button', { name: /^Export \.docx/ }).click(),
        ]);
        mkdirSync(dirname(file.out), { recursive: true });
        await download.saveAs(file.out);
        console.log(`-> ${file.out}`);
        // The dialog closes itself once the file is saved.
        await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
      } catch (cause) {
        failed += 1;
        console.error(`FAILED: ${file.out}\n  ${cause instanceof Error ? cause.message.split('\n')[0] : cause}`);
        await page.keyboard.press('Escape').catch(() => {});
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  if (devServer) devServer.kill();
}
console.log(`${plan.length - failed} of ${plan.length} files exported to ${OUT}`);
process.exit(failed > 0 ? 1 : 0);
