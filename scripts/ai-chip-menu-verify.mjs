import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * k-0541 (u-14xb): the AI chip's menu (Mentor credits / own key) stays inside the window wherever
 * the chip is. Before, it hung off the chip's right edge and was cut off by the Question studio's
 * chat sidebar (380 px, chip at its left). Seeds a signed-in DSEcon Mentor account and a saved
 * Gemini key (the browser answers Mentor's credits read: nothing leaves the machine), then opens the
 * menu from the composer's chip, the studio header's chip and, with --file, the import's AI check
 * (inside a dialog: picking must not close it). Checks each menu is whole in the window, not over
 * its chip, and not covered (the point under each corner is the menu), and saves crops.
 *
 *   npm run dev -- -p 3541 & node scripts/ai-chip-menu-verify.mjs --url=http://localhost:3541 --out=/tmp/k0541 \
 *     [--name=after] [--lang=zh-HK|en] [--widths=1280,1024,800] [--file=/path/paper.docx] [--no-assert]
 *
 * `--no-assert` only takes the pictures (for a "before" run on the old build).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/ai-chip-menu-verify');
const NAME = opt('name', 'after');
const LANG = opt('lang', 'zh-HK');
const WIDTHS = opt('widths', '1280,1024,800').split(',').map(Number);
const FILE = opt('file');
const ASSERT = !args.includes('--no-assert');
mkdirSync(OUT, { recursive: true });

const results = [];
const check = (ok, what) => {
  results.push({ ok, what });
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
};

const TOKEN = 'dsm_chip_menu_verify_0123456789abcdef';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST' };
const CREDITS = { status: 'on', balance: 8787, model: 'gemini-4-hydrogen', rates: { creditsPerHkd: 100, hkdPerUsd: 7.8, inputPerMillionTokens: 1170, outputPerMillionTokens: 5850 }, estimates: { studioWorksheet: 280, importCheck: 50, translate: 50, answerKey: 80 }, extraPct: 10, buyUrl: 'https://dseconmentor.com/account#ai-credits', pricingUrl: 'https://dseconmentor.com/pricing#ai-credits' };

const browser = await chromium.launch({ channel: 'chrome' });

/** Opens the chip's menu and checks it: whole in the window, off the chip, nothing on top of it. */
async function inspect(page, where, chip, shotName, crop) {
  await chip.locator('button').first().click();
  const menu = page.locator('[data-ai-choice-menu]');
  await menu.waitFor();
  await page.waitForTimeout(350);
  const view = page.viewportSize();
  const m = await menu.boundingBox();
  const c = await chip.boundingBox();
  const box = crop(m, c);
  await page.screenshot({ path: join(OUT, `${NAME}-${shotName}.png`), clip: box });
  if (ASSERT) {
    const inside = m.x >= 0 && m.y >= 0 && m.x + m.width <= view.width && m.y + m.height <= view.height;
    check(inside, `${where}: menu inside the ${view.width}×${view.height} window (x ${Math.round(m.x)}–${Math.round(m.x + m.width)}, y ${Math.round(m.y)}–${Math.round(m.y + m.height)})`);
    const apart = m.y >= c.y + c.height || m.y + m.height <= c.y;
    check(apart, `${where}: menu does not cover its chip`);
    // Not clipped by a parent or covered: what is drawn near each corner (inside the rounding) is the menu.
    const corners = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const pts = [[r.left + 14, r.top + 14], [r.right - 14, r.top + 14], [r.left + 14, r.bottom - 14], [r.right - 14, r.bottom - 14]];
      return pts.map(([x, y]) => el.contains(document.elementFromPoint(x, y)));
    });
    check(corners.every(Boolean), `${where}: every corner of the menu is visible (${corners.join(',')})`);
    // The whole first option label is readable: not cut at either side of the menu.
    const label = await menu.locator('[data-ai-choice="mentor"] span.truncate').evaluate((el) => el.scrollWidth <= el.clientWidth + 1);
    check(label, `${where}: the Mentor option's label is not truncated`);
  }
  return menu;
}

for (const width of WIDTHS) {
  console.log(`${width} px:`);
  const context = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2 });
  context.setDefaultTimeout(15_000);
  await context.addInitScript(
    ([token, lang]) => {
      if (sessionStorage.getItem('chip-menu-seeded')) return;
      sessionStorage.setItem('chip-menu-seeded', '1');
      localStorage.setItem('econgen.secret.ai:mentor', token);
      localStorage.setItem('econgen.secret.ai:gemini', 'AIzaSyVerify0123456789abcdefghijklmnopq');
      localStorage.setItem('econgen.settings.ai', JSON.stringify({ provider: 'mentor', ownProvider: 'gemini' }));
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
      localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
    },
    [TOKEN, LANG],
  );
  await context.route(
    (url) => /dseconmentor\.com$/.test(url.hostname),
    (route) => {
      const req = route.request();
      if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
      if (req.url().includes('/ai/credits') && req.headers()['authorization'] === `Bearer ${TOKEN}`) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(CREDITS) });
      return route.fulfill({ status: 404, headers: CORS, contentType: 'application/json', body: '{"error":"not_found"}' });
    },
  );
  await context.route((url) => url.hostname === 'generativelanguage.googleapis.com', (route) => route.fulfill({ status: 599, body: 'blocked' }));
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  await page.goto(APP, { waitUntil: 'networkidle' });
  // Next's dev-only "N" badge sits at the bottom left, over the sidebar's chip: not the app's.
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });

  // The Question studio, from the start screen.
  await page.getByRole('button', { name: /Question studio|擬題/ }).first().click();
  const composerChip = page.locator('[data-chat-ai-status] [data-ai-chip]');
  await composerChip.waitFor();
  await page.locator('[data-chat-ai-status] [data-ai-chip="credits"]').waitFor();
  const sidebar = await page.locator('[data-chat-column]').boundingBox();

  // 1. The chat sidebar's composer: the user's case.
  await inspect(page, 'studio sidebar', composerChip, `${width}-studio-sidebar`, (m, c) => {
    const x = Math.max(0, Math.min(m.x, sidebar.x) - 0);
    const y = Math.max(0, Math.min(m.y, c.y) - 24);
    return { x, y, width: Math.min(width - x, Math.max(sidebar.x + sidebar.width, m.x + m.width) - x + 24), height: Math.max(m.y + m.height, c.y + c.height) - y + 16 };
  });
  if (ASSERT) {
    const m = await page.locator('[data-ai-choice-menu]').boundingBox();
    check(m.x >= sidebar.x, `studio sidebar: menu starts inside the sidebar (menu x ${Math.round(m.x)}, sidebar x ${Math.round(sidebar.x)})`);
    // Picking own key from here switches the chip; Escape closes without changing.
    await page.locator('[data-ai-choice-menu] [data-ai-choice="own"]').click();
    await page.locator('[data-ai-choice-menu]').waitFor({ state: 'hidden' });
    check((await composerChip.getAttribute('data-ai-chip-choice')) === 'own', 'studio sidebar: picking "own key" switches the chip');
    await composerChip.locator('button').first().click();
    await page.locator('[data-ai-choice-menu]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-ai-choice-menu]').waitFor({ state: 'hidden' });
    const focused = await composerChip.locator('button').first().evaluate((el) => el === document.activeElement);
    check(focused, 'studio sidebar: Escape closes the menu and focus returns to the chip');
    await composerChip.locator('button').first().click();
    await page.locator('[data-ai-choice-menu] [data-ai-choice="mentor"]').click();
    await page.locator('[data-ai-choice-menu]').waitFor({ state: 'hidden' });
  } else {
    await page.keyboard.press('Escape');
  }

  // 2. The studio header (chip at the right).
  const headerChip = page.locator('header [data-ai-chip]');
  const header = await page.locator('header:has([data-ai-chip])').boundingBox();
  await inspect(page, 'studio header', headerChip, `${width}-studio-header`, (m) => {
    const x = Math.max(0, Math.min(m.x, width - 560) - 16);
    return { x, y: 0, width: width - x, height: Math.max(m.y + m.height, header.height) + 16 };
  });
  await page.keyboard.press('Escape');

  // 3. The import's AI check, inside the import dialog.
  if (FILE && width === WIDTHS[0]) {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^← (Home|主頁)/ }).first().click();
    const importName = LANG === 'en' ? /^Import from Word, PDF or picture/ : /匯入/;
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: importName }).first().click()]);
    await chooser.setFiles([FILE]);
    const dialog = page.getByRole('dialog').first();
    const review = dialog.getByRole('button', { name: LANG === 'en' ? /^Review the paper/ : /檢視試卷|審閱/ });
    await Promise.race([review.waitFor({ timeout: 60_000 }), dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 })]);
    if (await review.count()) await review.click();
    await dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 });
    // Check import opens the panel idle, with the chip beside the cost line (✦ AI would start a run).
    await dialog.locator('[data-check-import]').click();
    const chip = dialog.locator('[data-ai-check] [data-ai-chip]');
    await chip.waitFor();
    await page.locator('[data-ai-check] [data-ai-chip="credits"]').waitFor();
    const panel = await dialog.locator('[data-ai-check]').boundingBox();
    await inspect(page, 'import AI check', chip, `${width}-import-check`, (m, c) => {
      const x = Math.max(0, Math.min(m.x, panel.x) - 16);
      const y = Math.max(0, Math.min(m.y, c.y) - 24);
      return { x, y, width: Math.min(width - x, Math.max(panel.x + 560, m.x + m.width) - x + 16), height: Math.min(800 - y, Math.max(m.y + m.height, c.y + c.height) - y + 16) };
    });
    if (ASSERT) {
      await page.locator('[data-ai-choice-menu] [data-ai-choice="own"]').click();
      await page.locator('[data-ai-choice-menu]').waitFor({ state: 'hidden' });
      check((await dialog.count()) > 0 && (await dialog.locator('[data-line]').count()) > 0, 'import AI check: picking in the menu keeps the import dialog open');
      await chip.locator('button').first().click();
      await page.locator('[data-ai-choice-menu]').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('[data-ai-choice-menu]').waitFor({ state: 'hidden' });
      check((await dialog.locator('[data-line]').count()) > 0, 'import AI check: Escape closes only the menu, not the dialog');
    }
  }
  await context.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
if (ASSERT) console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots in ${OUT}`);
else console.log(`\nscreenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
