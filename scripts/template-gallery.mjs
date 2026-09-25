import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Screenshot every diagram template, to read for collisions (§ UI is verified in a
 * browser). Renders the real `diagramSvg` output — English, Chinese, bilingual side by
 * side — one PNG per template; with --app, also seeds a worksheet holding every template
 * into the running app and shoots each sheet of the page.
 *
 *   node scripts/template-gallery.mjs [--out=/tmp/template-gallery] [--app]
 *                                     [--url=http://localhost:3000] [--only=id,id]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/template-gallery');
const URL_BASE = opt('url', 'http://localhost:3000');
const only = opt('only', '').split(',').filter(Boolean);
mkdirSync(OUT, { recursive: true });

const emit = spawnSync('npx', ['vitest', 'run', 'scripts/template-gallery.test.ts'], {
  stdio: 'pipe',
  encoding: 'utf8',
  env: { ...process.env, GALLERY_DIR: OUT },
});
if (emit.status !== 0) {
  console.error(emit.stdout, emit.stderr);
  process.exit(1);
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 });
  await page.goto(`file://${OUT}/gallery.html`);
  const ids = await page.$$eval('.card', (cards) => cards.map((card) => card.id));
  for (const id of ids) {
    if (only.length > 0 && !only.includes(id)) continue;
    await page.locator(`#${id}`).screenshot({ path: `${OUT}/${id}.png` });
  }
  console.log(`wrote ${ids.length} template shots to ${OUT}`);

  if (args.includes('--app')) {
    const json = readFileSync(`${OUT}/gallery.worksheet.json`, 'utf8');
    const worksheet = JSON.parse(json);
    const title = 'Diagram template gallery';
    const index = JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt }]);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1400 }, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([indexJson, key, doc]) => {
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, doc);
      },
      [index, `econ-worksheet:${worksheet.id}`, json],
    );
    const app = await context.newPage();
    app.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
    await app.goto(URL_BASE, { waitUntil: 'networkidle' });
    // A dialog on launch ("What's new") would swallow the click.
    await app.keyboard.press('Escape');
    await app.waitForTimeout(300);
    await app.getByRole('button', { name: new RegExp(title) }).first().click();
    await app.waitForSelector('#print-root .paper', { timeout: 15_000 });
    await app.waitForTimeout(2000);
    const sheets = app.locator('#print-root .paper');
    const count = await sheets.count();
    for (let i = 0; i < count; i += 1) {
      await sheets.nth(i).screenshot({ path: `${OUT}/app-sheet-${String(i + 1).padStart(2, '0')}.png` });
    }
    console.log(`wrote ${count} app sheets to ${OUT}`);

    // The picker itself: select the first diagram, open its Template popover.
    await app.locator('#print-root .paper').getByText('Supply and demand').first().click();
    await app.waitForTimeout(500);
    const editTab = app.getByRole('tab', { name: /^Edit/ });
    if ((await editTab.count()) > 0) await editTab.first().click();
    await app.waitForTimeout(500);
    const trigger = app.locator('button[aria-haspopup="listbox"]').first();
    if ((await trigger.count()) > 0) {
      await trigger.click();
      await app.waitForTimeout(500);
      await app.screenshot({ path: `${OUT}/app-picker.png` });
      console.log(`wrote ${OUT}/app-picker.png`);
    } else {
      await app.screenshot({ path: `${OUT}/app-picker.png` });
      console.log('no template trigger found — shot the editor as it stands');
    }
  }
} finally {
  await browser.close();
}
