import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The HKDSE style row on studio drafts (k-0548), in a browser: a draft off the house style
 * ("!style": a lower-case asking "not", "1,000", a half-width 中文 comma) shows the row as
 * "look" with the findings in words; a draft in the house style shows it passed; the same in
 * the 中文 interface. The AI is `ai-mock-server.mjs`; nothing real is reached.
 *
 *   npm run dev -- -p 3248
 *   node scripts/studio-style-verify.mjs [--url=http://localhost:3248] [--out=/tmp/studio-style] [--mock-port=8848] [--bank-port=8849]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3248');
const OUT = opt('out', '/tmp/studio-style');
const MOCK_PORT = Number(opt('mock-port', '8848'));
const BANK_PORT = Number(opt('bank-port', '8849'));
mkdirSync(OUT, { recursive: true });
configure({ mock: `http://localhost:${MOCK_PORT}`, bank: `http://localhost:${BANK_PORT}/` });

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

async function write(page, message, ui) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /擬題工作室/ }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
  // Both languages, so the 中文 is checked too.
  await page.locator('[data-chat-settings]').click();
  const pop = page.locator('[data-chat-settings-pop]');
  await pop.getByRole('button', { name: ui === 'zh-HK' ? '雙語' : 'Both', exact: true }).click();
  await page.locator('[data-chat-input]').click();
  await page.keyboard.press('Escape');
  await page.locator('[data-chat-input]').fill(message);
  await page.locator('[data-chat-send]').click();
  await page.locator('[data-chat-draft]').first().waitFor({ timeout: 40_000 });
  await page.locator('[data-chat-send]').waitFor({ timeout: 40_000 });
}

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  for (const ui of ['en', 'zh-HK']) {
    const { context, page, errors } = await newPage(browser, { ui });
    await check(`${ui}: a draft off the house style shows the HKDSE style row with its findings`, async () => {
      await write(page, 'Write a question on a firm’s output !style', ui);
      const chip = page.locator('[data-chat-draft]').first().locator('[data-check="style"]');
      await chip.waitFor();
      expect((await chip.getAttribute('data-state')) === 'look', `style row is ${await chip.getAttribute('data-state')}`);
      const label = (await chip.textContent()) ?? '';
      expect(label.includes(ui === 'en' ? 'HKDSE style' : 'HKDSE 風格'), `label "${label}"`);
      await chip.click();
      const details = page.locator('[data-chat-draft]').first().locator('ul').filter({ hasText: ui === 'en' ? 'NOT' : 'NOT' }).first();
      await details.waitFor();
      await details.scrollIntoViewIfNeeded();
      await shot(page, `style-look-${ui}`);
      const text = (await details.textContent()) ?? '';
      // The half-width 中文 comma is made full-width by the studio's own cleaning before the checks run.
      const wanted = ui === 'en' ? ['bold capitals', '10 000'] : ['粗體大寫', '10 000'];
      for (const w of wanted) expect(text.includes(w), `details lack "${w}"`);
      expect(errors.length === 0, errors.join(' | '));
      return text.replace(/\s+/g, ' ').slice(0, 240);
    });
    await check(`${ui}: a draft in the house style passes the row`, async () => {
      await write(page, 'Write a question on price elasticity', ui);
      const chip = page.locator('[data-chat-draft]').first().locator('[data-check="style"]');
      await chip.waitFor();
      expect((await chip.getAttribute('data-state')) === 'pass', `style row is ${await chip.getAttribute('data-state')}`);
      await shot(page, `style-pass-${ui}`);
    });
    await context.close();
  }
} finally {
  await browser.close();
  mockServer.close();
  bankServer.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
