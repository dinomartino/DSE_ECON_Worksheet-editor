import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * A chat's reference stays viewable (k-0547, u-kt78): after drafts are written on a picked
 * past-paper question, Side by side with reference and the reference badge in the chat keep
 * working after a reload (drawn as it prints, read again from the bank), a wait, the chip
 * removed from the composer, and the bank unreachable (the kept copy, or why). A chat with
 * no reference says why instead of a greyed-out button.
 *
 *   npm run dev -- -p 3247
 *   node scripts/studio-ref-verify.mjs [--url=http://localhost:3247] [--out=/tmp/studio-ref] [--mock-port=8851] [--bank-port=8852] [--wait=20000]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3247');
const OUT = opt('out', '/tmp/studio-ref');
const MOCK_PORT = Number(opt('mock-port', '8851'));
const BANK_PORT = Number(opt('bank-port', '8852'));
const WAIT = Number(opt('wait', '20000'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
mkdirSync(OUT, { recursive: true });
configure({ mock: MOCK, bank: BANK });

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const drafts = (page) => page.locator('[data-chat-draft]');
const compareButton = (page) => page.locator('[data-view-button="compare"]');

async function openStudio(page) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Question studio 擬題工作室/ }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}

/** Side by side is on and sets the reference beside the drafts, drawn as it prints (or says why not). */
async function compareWorks(page, name, { printed = true } = {}) {
  const button = compareButton(page);
  expect((await button.getAttribute('aria-disabled')) !== 'true' && (await button.isEnabled()), `${name}: Side by side is off (title: ${await button.getAttribute('title')})`);
  await button.click();
  const card = page.locator('[data-compare-reference]').first();
  await card.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => document.querySelector('[data-compare-reference]')?.getAttribute('data-printed') !== 'looking', null, { timeout: 30_000 });
  const state = await card.getAttribute('data-printed');
  if (printed) expect(state === 'yes', `${name}: the reference is not drawn as it prints (${state}; ${await card.locator('[data-reference-missing]').textContent().catch(() => '')})`);
  else expect(state === 'yes' || (await card.locator('[data-reference-missing]').count()) === 1, `${name}: words only and no reason given`);
  await shot(page, `${name}-compare`);
  await page.locator('[data-view-button="paper"]').click();
}

/** The reference badge in the chat opens its preview: the question as it prints, or why only its words. */
async function badgeWorks(page, name, { printed = true, which = '[data-chat-column] [data-ref-view]' } = {}) {
  const badge = page.locator(which).first();
  await badge.waitFor({ timeout: 5000 });
  await badge.click();
  const sheet = page.locator('[data-reference-preview]');
  await sheet.waitFor({ timeout: 5000 });
  await page.waitForFunction(() => !document.querySelector('[data-reference-preview] [role="status"]'), null, { timeout: 30_000 });
  const text = (await sheet.textContent()) ?? '';
  expect(text.length > 40, `${name}: the badge's preview is empty ("${text.slice(0, 60)}")`);
  const missing = await sheet.locator('[data-reference-missing]').count();
  if (printed) expect(missing === 0, `${name}: the badge shows words only: ${await sheet.locator('[data-reference-missing]').textContent().catch(() => '')}`);
  await shot(page, `${name}-badge`);
  await page.keyboard.press('Escape');
}

async function reopen(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await openStudio(page);
  // The last chat is the one shown, else it is opened from Chats ▾.
  if ((await drafts(page).count()) === 0) {
    await page.locator('[data-chats-menu]').click();
    await page.locator('[data-chats-list] [role="menuitem"]').first().click();
  }
  await drafts(page).first().waitFor();
}

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const { page, leaks, errors } = await newPage(browser);
  await openStudio(page);

  await check('pick a past-paper question, send, drafts come; Side by side and the badge work', async () => {
    await page.locator('[data-start-pick], [data-add-reference]').first().click();
    const card = page.locator('[data-reference-picker] [data-reference-card]', { hasText: 'DSE2099/P1/Q12' }).first();
    await card.waitFor({ timeout: 30_000 });
    await card.click();
    await page.getByRole('button', { name: 'Use as reference' }).click();
    await page.locator('[data-ref-chip]').waitFor();
    await page.locator('[data-chat-send]').click();
    await drafts(page).first().waitFor({ timeout: 40_000 });
    await page.locator('[data-chat-send]').waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector('[data-chat-stop]'), null, { timeout: 40_000 });
    await compareWorks(page, 'R1-fresh');
    await badgeWorks(page, 'R1-fresh');
  });

  await check('after a reload: Side by side draws the reference as it prints (read again from the bank), the badge too', async () => {
    await reopen(page);
    await compareWorks(page, 'R2-reload');
    await badgeWorks(page, 'R2-reload');
  });

  await check(`after waiting ${WAIT / 1000}s and a reload: still there`, async () => {
    await page.waitForTimeout(WAIT);
    await reopen(page);
    await compareWorks(page, 'R3-wait');
    await badgeWorks(page, 'R3-wait');
  });

  await check('the chip removed from the composer: the drafts written from it can still be compared, after a reload too', async () => {
    await page.locator('[data-ref-chip] button[aria-label^="Remove"]').first().click();
    await page.locator('[data-ref-chip]').waitFor({ state: 'detached' });
    await compareWorks(page, 'R4-removed');
    await badgeWorks(page, 'R4-removed');
    await reopen(page);
    expect((await page.locator('[data-ref-chip]').count()) === 0, 'the chip came back');
    await compareWorks(page, 'R4-removed-reload');
  });

  await check('the bank unreachable after a reload: Side by side still opens, drawn from the kept copy or saying why', async () => {
    await page.context().route(`${BANK}**`, (r) => r.abort());
    await reopen(page);
    await compareWorks(page, 'R5-offline', { printed: false });
    await badgeWorks(page, 'R5-offline', { printed: false });
    await page.context().unroute(`${BANK}**`);
  });

  await check('a chat with no reference: Side by side says why and offers to pick one (not silently greyed out)', async () => {
    await page.locator('[data-new-chat]').click();
    const button = compareButton(page);
    expect((await button.getAttribute('aria-disabled')) === 'true', 'Side by side looks on with no reference');
    // A real pointer can press it (Playwright treats aria-disabled as not clickable).
    await button.click({ force: true });
    await page.locator('[data-compare-why]').waitFor();
    expect((await page.locator('[data-compare-why]').textContent()).includes('No reference question'), 'no reason given');
    await shot(page, 'R6-why');
    await page.locator('[data-compare-why] button', { hasText: 'Pick a question' }).click();
    await page.locator('[data-reference-picker]').waitFor();
    await page.keyboard.press('Escape');
  });

  expect(leaks.length === 0, `provider hosts reached: ${leaks.join(', ')}`);
  if (errors.length) console.log('page errors:', errors);
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
