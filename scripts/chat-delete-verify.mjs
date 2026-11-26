import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Deleting saved studio chats, in a real browser (k-0564, u-gnmu). Before it, deleting the last
 * chat wrote nothing, so it came back on reload. Checks: delete one of three, reload, the other
 * two stay; delete the rest, reload, the list stays empty; a chat a newer build saved under the
 * same key is kept as it is throughout; a lone chat deleted stays gone (`[]` saved).
 *
 *   npx next dev -p 3564
 *   node scripts/chat-delete-verify.mjs [--url=http://localhost:3564] [--out=/tmp/k0564]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3564');
const OUT = opt('out', '/tmp/k0564');
mkdirSync(OUT, { recursive: true });

const CHATS_KEY = 'econgen.studioChats.v1';

const results = [];
async function check(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? ` (${note})` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.message ?? error) });
    console.log(`FAIL ${name}: ${error?.message ?? error}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

const chat = (id, minute, text) => {
  const at = new Date(Date.UTC(2026, 10, 26, 8, minute)).toISOString();
  return { v: 1, id, createdAt: at, updatedAt: at, refs: [], turns: [{ id: `${id}-u`, role: 'user', text, refs: [] }], drafts: [], picks: [], settings: { count: 1, level: 'same', language: 'en' }, lastText: '' };
};
const NEWER = { v: 2, id: 'newer-1', title: 'saved by a newer build', parts: [{ kind: 'x' }] };

async function newPage(browser, seed, ui = 'en') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  context.setDefaultTimeout(30_000);
  await context.addInitScript(
    ([lang, raw, key]) => {
      if (sessionStorage.getItem('k0564-seeded')) return;
      sessionStorage.setItem('k0564-seeded', '1');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
      localStorage.setItem(key, raw);
    },
    [ui, JSON.stringify(seed), CHATS_KEY],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

async function openStudio(page) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /擬題工作室/ }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}

const savedRaw = (page) => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null'), CHATS_KEY);

/** The titles in the Chats ▾ menu (left open when `keepOpen`). */
async function menuTitles(page, { keepOpen = false } = {}) {
  await page.locator('[data-chats-menu]').click();
  const titles = await page.locator('[data-chats-list] [role="menuitem"]').allInnerTexts();
  if (!keepOpen) await page.keyboard.press('Escape');
  return titles.map((t) => t.split('\n')[0].trim());
}

/** Deletes the saved chat whose title has `words`, through the menu's ✕ and its confirm. */
async function deleteChat(page, words) {
  await page.locator('[data-chats-menu]').click();
  const row = page.locator('[data-chats-list] > div').filter({ hasText: words });
  await row.hover();
  await row.locator('button[aria-label]').click();
  await row.getByRole('button', { name: /Delete this chat|刪除這個對話/ }).click();
  await page.keyboard.press('Escape');
}

const browser = await chromium.launch({ channel: 'chrome' });
try {
  {
    const seed = [chat('c3', 3, 'Third chat on unit tax'), chat('c2', 2, 'Second chat on price ceiling'), chat('c1', 1, 'First chat on PED'), NEWER];
    const { page, errors, context } = await newPage(browser, seed);
    await openStudio(page);

    await check('three saved chats listed; the newer build’s one not shown', async () => {
      const titles = await menuTitles(page);
      expect(titles.length === 3, `menu shows ${titles.length}: ${titles.join(' | ')}`);
      return titles.join(' | ');
    });

    await check('delete one of three, reload: the other two stay', async () => {
      await deleteChat(page, 'Second chat');
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /擬題工作室/ }).first().click();
      await page.locator('[data-studio-screen]').waitFor();
      const titles = await menuTitles(page, { keepOpen: true });
      await page.screenshot({ path: `${OUT}/after-one-deleted.png` });
      await page.keyboard.press('Escape');
      expect(titles.length === 2 && titles.some((t) => t.includes('Third')) && titles.some((t) => t.includes('First')), `menu: ${titles.join(' | ')}`);
      const raw = await savedRaw(page);
      expect(raw.map((c) => c.id).join(',') === 'c3,c1,newer-1', `saved ids ${raw.map((c) => c.id)}`);
      return titles.join(' | ');
    });

    await check('delete the last two, reload: the list stays empty; the newer build’s chat kept as it was', async () => {
      await deleteChat(page, 'Third chat');
      await deleteChat(page, 'First chat');
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /擬題工作室/ }).first().click();
      await page.locator('[data-studio-screen]').waitFor();
      const titles = await menuTitles(page, { keepOpen: true });
      await page.screenshot({ path: `${OUT}/after-all-deleted.png` });
      const empty = await page.getByText('No saved chats yet').count();
      await page.keyboard.press('Escape');
      expect(titles.length === 0 && empty === 1, `menu after reload: ${titles.join(' | ')}`);
      const raw = await savedRaw(page);
      expect(JSON.stringify(raw) === JSON.stringify([NEWER]), `saved ${JSON.stringify(raw)}`);
      return 'saved list = [newer build’s chat]';
    });

    await check('no page errors', async () => {
      expect(errors.length === 0, errors.join('; '));
    });
    await context.close();
  }

  {
    const { page, errors, context } = await newPage(browser, [chat('only', 5, 'The only chat on externalities')]);
    await openStudio(page);
    await check('the lone chat deleted stays gone after a reload ([] saved)', async () => {
      expect((await menuTitles(page)).length === 1, 'seed not listed');
      await deleteChat(page, 'The only chat');
      expect(JSON.stringify(await savedRaw(page)) === '[]', `saved ${JSON.stringify(await savedRaw(page))}`);
      await page.reload({ waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /擬題工作室/ }).first().click();
      await page.locator('[data-studio-screen]').waitFor();
      const titles = await menuTitles(page, { keepOpen: true });
      await page.screenshot({ path: `${OUT}/lone-deleted.png` });
      await page.keyboard.press('Escape');
      expect(titles.length === 0, `menu after reload: ${titles.join(' | ')}`);
      expect(errors.length === 0, errors.join('; '));
    });
    await context.close();
  }
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
