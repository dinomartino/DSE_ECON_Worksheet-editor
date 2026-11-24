import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The studio chat reading a message with the drafts (k-0535, u-yu7s), in a browser: the
 * composer's guessed chip as clear words are typed ("Q2 太易"), its ✕, a card click setting the
 * chip ("Editing Draft 3"), an edit making a new version of its card (never a new card), and
 * "Which draft do you mean?" with draft buttons when the words do not say (the mock gives no
 * read, so the computer's rules decide: the fallback). 中文 chip words too.
 *
 *   npm run dev -- -p 3235
 *   node scripts/studio-intent-verify.mjs [--url=http://localhost:3235] [--out=/tmp/studio-intent]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3235');
const OUT = opt('out', '/tmp/studio-intent');
const MOCK_PORT = Number(opt('mock-port', '8841'));
const BANK_PORT = Number(opt('bank-port', '8842'));
mkdirSync(OUT, { recursive: true });
configure({ mock: `http://localhost:${MOCK_PORT}`, bank: `http://localhost:${BANK_PORT}/` });

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const cards = (page) => page.locator('[data-chat-draft]');

async function threeDrafts(page, row) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: row }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
  await page.locator('[data-start-pick], [data-add-reference]').first().click();
  const card = page.locator('[data-reference-picker] [data-reference-card]', { hasText: 'DSE2099/P1/Q12' }).first();
  await card.waitFor({ timeout: 30_000 });
  await card.click();
  await page.getByRole('button', { name: /^(Use as reference|用作參考)$/ }).click();
  await page.locator('[data-ref-chip]').waitFor();
  await page.locator('[data-chat-send]').click();
  await cards(page).nth(2).waitFor({ timeout: 60_000 });
  await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
}

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const { page, leaks, errors } = await newPage(browser);
  await threeDrafts(page, /Question studio 擬題工作室/);
  const input = page.locator('[data-chat-input]');

  await check('unclear words with three new drafts ("make it harder"): asks which draft, writes nothing', async () => {
    await input.fill('make it harder');
    expect((await page.locator('[data-guess-chip]').count()) === 0, 'a guess for unclear words');
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-chat-ask="which"]').waitFor({ timeout: 30_000 });
    await page.locator('[data-chat-send]').waitFor();
    await shot(page, '1-which-draft');
    expect((await cards(page).count()) === 3, `cards: ${await cards(page).count()}`);
    await page.locator('[data-which="3"]').click();
    await page.locator('[data-which-answered]').waitFor();
    await page.locator('[data-note="changed"]').last().waitFor({ timeout: 40_000 });
    await page.locator('[data-chat-send]').waitFor();
    expect((await cards(page).count()) === 3, `a card was added: ${await cards(page).count()}`);
    await shot(page, '2-after-which');
  });

  await check('clear words ("Q2 太易"): the guessed chip shows before Send; Send makes v2 of draft 2, no new card', async () => {
    await input.fill('Q2 太易');
    await page.locator('[data-guess-chip="2"]').waitFor();
    expect((await page.locator('[data-guess-chip]').textContent()).includes('Editing Draft 2'), 'chip words');
    await shot(page, '3-guess-chip');
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-chat-send]').waitFor({ timeout: 40_000 });
    await page.waitForTimeout(300);
    expect((await cards(page).count()) === 3, `cards: ${await cards(page).count()}`);
    const notes = await page.locator('[data-note="changed"]').allTextContents();
    expect(notes.some((t) => t.includes('Draft 2 is now v2')), `notes: ${notes.join(' | ')}`);
    await shot(page, '4-after-edit');
  });

  await check('the guess taken away (✕): the chip goes', async () => {
    await input.fill('make draft 1 easier');
    await page.locator('[data-guess-chip="1"]').waitFor();
    await page.locator('[data-guess-chip] button').click();
    expect((await page.locator('[data-guess-chip]').count()) === 0, 'still there');
    await input.fill('');
  });

  await check('a click on a card sets the chip "Editing Draft 3"; ✕ clears it', async () => {
    await cards(page).nth(2).locator('p, div').first().click({ position: { x: 20, y: 10 } });
    await page.locator('[data-draft-chip="3"]').waitFor();
    expect((await page.locator('[data-draft-chip="3"]').textContent()).includes('Editing Draft 3'), 'chip words');
    await shot(page, '5-card-chip');
    await page.locator('[data-draft-chip] button').click();
    expect((await page.locator('[data-draft-chip]').count()) === 0, 'chip still there');
  });

  await check('no page errors, no provider reached', async () => {
    expect(errors.length === 0, errors.join(' | '));
    expect(leaks.length === 0, leaks.join(' | '));
  });

  const zh = await newPage(browser, { ui: 'zh-HK' });
  await threeDrafts(zh.page, /擬題工作室/);
  await check('中文: 「修改第 2 題」 guess, and 「你指哪一題？」', async () => {
    await zh.page.locator('[data-chat-input]').fill('第二題太易');
    await zh.page.locator('[data-guess-chip="2"]').waitFor();
    expect((await zh.page.locator('[data-guess-chip]').textContent()).includes('修改第 2 題'), 'chip words');
    await shot(zh.page, '6-zh-guess');
    await zh.page.locator('[data-chat-input]').fill('上面嗰題難啲');
    await zh.page.locator('[data-chat-send]').click();
    await zh.page.locator('[data-chat-ask="which"]').waitFor({ timeout: 30_000 });
    expect((await zh.page.locator('[data-chat-ask="which"]').textContent()).includes('你指哪一題？'), 'ask words');
    await shot(zh.page, '7-zh-which');
  });
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed; shots in ${OUT}`);
process.exit(failed ? 1 : 0);
