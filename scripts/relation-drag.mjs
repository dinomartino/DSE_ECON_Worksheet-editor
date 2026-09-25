import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in the real canvas that a template's relations hold under a drag: seeds the
 * templates from `scripts/relation-drag.test.ts`, opens each on the canvas, shoots it,
 * drags one curve or point, shoots it again; then opens Shade ▾ on the tax diagram.
 *
 *   node scripts/relation-drag.mjs [--out=/tmp/relation-drag] [--url=http://localhost:3000]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/relation-drag');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const emit = spawnSync('npx', ['vitest', 'run', 'scripts/relation-drag.test.ts'], {
  stdio: 'pipe',
  encoding: 'utf8',
  env: { ...process.env, DRAG_DIR: OUT },
});
if (emit.status !== 0) {
  console.error(emit.stdout, emit.stderr);
  process.exit(1);
}
const json = readFileSync(`${OUT}/drag.worksheet.json`, 'utf8');
const targets = JSON.parse(readFileSync(`${OUT}/drag.targets.json`, 'utf8'));
const worksheet = JSON.parse(json);

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, deviceScaleFactor: 2 });
  const title = 'Relation drags';
  const index = JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt }]);
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
  await app.keyboard.press('Escape');
  await app.waitForTimeout(300);
  await app.getByRole('button', { name: new RegExp(title) }).first().click();
  await app.waitForSelector('#print-root .paper', { timeout: 15_000 });
  await app.waitForTimeout(1500);

  const stage = () => app.locator('div.relative.select-none.bg-white.shadow-2xl').first();
  const openCanvas = async (name) => {
    await app.locator('#print-root .paper').getByText(name, { exact: true }).first().click();
    await app.waitForTimeout(400);
    await app.locator('button[title="Draw on this diagram"]').first().click();
    await stage().waitFor();
    await app.waitForTimeout(500);
  };
  const toScreen = async (p, widthPx) => {
    const box = await stage().boundingBox();
    const k = box.width / widthPx;
    return { x: box.x + p.x * k, y: box.y + p.y * k };
  };

  for (const t of targets) {
    await openCanvas(t.name);
    await stage().screenshot({ path: `${OUT}/${t.id}-before.png` });
    const a = await toScreen(t.from, t.widthPx);
    const b = await toScreen(t.to, t.widthPx);
    await app.mouse.move(a.x, a.y);
    await app.mouse.down();
    await app.mouse.move(a.x + (b.x - a.x) / 4, a.y + (b.y - a.y) / 4, { steps: 4 });
    await app.mouse.move(b.x, b.y, { steps: 12 });
    await app.mouse.up();
    await app.waitForTimeout(400);
    // Click empty paper to drop the selection chrome before the shot.
    const box = await stage().boundingBox();
    await app.mouse.click(box.x + box.width - 6, box.y + 6);
    await app.waitForTimeout(300);
    await stage().screenshot({ path: `${OUT}/${t.id}-after.png` });
    console.log(`${t.id}: ${t.what}`);

    if (t.id === 'per-unit-tax') {
      await app.getByRole('button', { name: /Shade/ }).first().click();
      await app.waitForTimeout(400);
      await app.getByText('Tax & subsidy', { exact: true }).first().click().catch(() => {});
      await app.waitForTimeout(400);
      await app.screenshot({ path: `${OUT}/per-unit-tax-shade-menu.png` });
      await app.keyboard.press('Escape');
      await app.waitForTimeout(300);
    }
    await app.getByRole('button', { name: 'Done', exact: true }).first().click();
    await app.waitForTimeout(400);
  }
  console.log(`wrote drag shots to ${OUT}`);
} finally {
  await browser.close();
}
