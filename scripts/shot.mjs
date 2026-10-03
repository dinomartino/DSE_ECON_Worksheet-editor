import { chromium } from 'playwright-core';

/**
 * Screenshot harness for UI review.
 *
 * Reading the source hides density problems — a row that looks fine in JSX can be
 * unreadably tight once real bilingual content is in it. This drives the real app in
 * a real browser and can seed it with a worksheet first, because an *empty* document
 * hides exactly the crowding this is meant to catch.
 *
 *   node scripts/shot.mjs <out.png> [--seed] [--dark] [--url=http://localhost:3000 | --port=3106]
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? 'shot.png';
const seed = args.includes('--seed');
const dark = args.includes('--dark');
const urlArg = args.find((a) => a.startsWith('--url='));
const portArg = args.find((a) => a.startsWith('--port='));
const URL = urlArg ? urlArg.slice(6) : `http://localhost:${portArg ? portArg.slice(7) : 3000}`;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({
  viewport: { width: 1512, height: 950 },
  deviceScaleFactor: 2,
  colorScheme: dark ? 'dark' : 'light',
});
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE ERR:', m.text());
});
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));

await page.goto(URL, { waitUntil: 'networkidle' });

if (seed) {
  // Drive the real UI rather than writing storage directly, so what is captured is
  // reachable by a user and the store stays the only thing that builds a question.
  // The app opens on the start screen: New worksheet → Classroom worksheet → name → Create.
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: 'New worksheet', exact: true }).click();
  await dialog.getByRole('radio', { name: /^Classroom worksheet/ }).click();
  await dialog.getByLabel('Name', { exact: true }).fill('Screenshot');
  await page.getByRole('button', { name: /Create worksheet/ }).click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 15_000 });
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.click();

  const add = async (group, item) => {
    await page.getByRole('button', { name: new RegExp(`^${group}`) }).click();
    await page.getByRole('menuitem', { name: item }).first().click();
    await page.waitForTimeout(250);
  };
  await add('Question', /Multiple Choice/);
  await add('Question', /Multiple Choice/);
  await add('Question', /Structured/);
  await add('Element', /Answer lines/);
}

await page.waitForTimeout(1200);
await page.screenshot({ path: OUT });
console.log('wrote', OUT);
await browser.close();
