import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * Browser proof for "Use the cheaper Gemini Flash-Lite for simple jobs" (u-zso2): the switch shows
 * in Settings → AI on a saved own Gemini key (EN + 中文), is off by default and remembered across a
 * reload; Test on the saved key goes to the chosen model while it is off and to Flash-Lite once on;
 * when Google refuses Flash-Lite (404) the test runs again on the chosen model and one notice says
 * so. Google is faked: no request leaves this computer, the key is a dummy.
 *
 *   node scripts/gemini-light-verify.mjs [--port=3000] [--out=/tmp/gemini-light]
 */

const args = process.argv.slice(2);
const PORT = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6) ?? '/tmp/gemini-light';
const APP = `http://localhost:${PORT}`;
const META = process.platform === 'darwin' ? 'Meta' : 'Control';
const KEY = 'AIzaSyVerify0123456789abcdefghijklmnopq';
const MAIN = 'gemini-4-hydrogen';
const LIGHT = 'gemini-3.5-flash-lite';
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? '✓' : '✗'} ${what}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({ channel: 'chrome' });

async function session(lang, { refuseLight = false } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const models = [];
  await context.route('https://generativelanguage.googleapis.com/**', (route) => {
    const model = /\/models\/([^:]+):/.exec(route.request().url())?.[1];
    models.push(model);
    if (refuseLight && model === LIGHT) {
      return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: `models/${LIGHT} is not found for API version v1beta` } }) });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"items":[{"key":"t1","text":"物價水平"}]}' }] }, finishReason: 'STOP' }] }),
    });
  });
  await context.addInitScript(
    ([key, lang, main]) => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      localStorage.setItem('econgen.secret.ai:gemini', key);
      localStorage.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider: 'gemini', models: { gemini: main } }));
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
      localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
    },
    [KEY, lang, MAIN],
  );
  const page = await context.newPage();
  await page.goto(APP, { waitUntil: 'networkidle' });
  return { context, page, models };
}

async function openAi(page) {
  await page.keyboard.press(`${META}+Comma`);
  const dialog = page.getByRole('dialog').first();
  await dialog.waitFor();
  await dialog.getByRole('tab', { name: /^AI/ }).first().click().catch(() => dialog.getByRole('button', { name: /^AI/ }).first().click());
  await page.waitForTimeout(500);
  return dialog;
}

const settingsAi = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('econgen.settings.ai') ?? '{}'));

for (const lang of ['en', 'zh-HK']) {
  const label = lang === 'en' ? 'Use the cheaper Gemini Flash-Lite for simple jobs (translation, test)' : '簡單工作（翻譯、測試連線）改用較便宜的 Gemini Flash-Lite';
  const { context, page, models } = await session(lang);
  const dialog = await openAi(page);
  const box = dialog.getByLabel(label);
  check((await box.count()) === 1, `${lang}: the switch shows on a saved Gemini key`);
  check(!(await box.isChecked()), `${lang}: it is off by default`);
  await dialog.screenshot({ path: join(OUT, `settings-${lang}-off.png`) });

  if (lang === 'en') {
    const test = dialog.getByRole('button', { name: 'Test', exact: true }).first();
    await test.click();
    await page.waitForTimeout(800);
    check(models.at(-1) === MAIN, `off: Test went to the chosen model (${models.at(-1)})`);

    await box.check();
    await page.waitForTimeout(300);
    check((await settingsAi(page)).geminiLight === true, 'switching on is saved');
    await test.click();
    await page.waitForTimeout(800);
    check(models.at(-1) === LIGHT, `on: Test went to Flash-Lite (${models.at(-1)})`);

    await page.reload({ waitUntil: 'networkidle' });
    const again = await openAi(page);
    check(await again.getByLabel(label).isChecked(), 'on is remembered after a reload');
    await again.screenshot({ path: join(OUT, `settings-${lang}-on.png`) });
  }
  await context.close();
}

{
  const { context, page, models } = await session('en', { refuseLight: true });
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('econgen.settings.ai') ?? '{}');
    localStorage.setItem('econgen.settings.ai', JSON.stringify({ ...s, geminiLight: true }));
  });
  await page.reload({ waitUntil: 'networkidle' });
  const dialog = await openAi(page);
  const test = dialog.getByRole('button', { name: 'Test', exact: true }).first();
  await test.click();
  await page.waitForTimeout(1200);
  check(JSON.stringify(models) === JSON.stringify([LIGHT, MAIN]), `refused: Flash-Lite, then the chosen model (${models.join(' → ')})`);
  const notice = dialog.getByText("Your Google API key can't use Gemini Flash-Lite");
  check((await notice.count()) === 1 && (await notice.isVisible()), 'refused: one notice says so, inside Settings (not under its scrim)');
  check((await dialog.getByText(/Connected|✓/).count()) > 0, 'refused: the test still passes');
  await page.screenshot({ path: join(OUT, 'fallback-notice.png') });
  await test.click();
  await page.waitForTimeout(800);
  check(models.at(-1) === MAIN && models.length === 3, 'refused: the next test goes straight to the chosen model');
  await context.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : 'all passed', `— shots in ${OUT}`);
process.exit(failed ? 1 : 0);
