import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that the first click on a side-panel control right after clicking
 * text on the page is not lost (k-0478, user u-ag5a; found in k-0477, reproduced in k-0481
 * CHECK.md § 4.3 on 資料 ▾ / Source ▾ and the "Explain + diagram" and "Essay + EC" buttons).
 *
 * Every case starts by clicking the stem's text on the page (which opens the field), then
 * presses a panel control ONCE: mouse clicks at MacBook width (1440), touch taps at iPad
 * width (1180, touch screen), English and 中文 interface.
 *
 *  - Source ▾ and Diagram ▾ open their menus;
 *  - Add text adds a block;
 *  - Scheme opens part (a)'s marking scheme, and Essay + EC fills it;
 *  - with a 40px jump forced into the panel on blur (any panel that moves on a selection
 *    change), Source ▾ still opens: the net under every control (`pressedClick.ts`).
 *
 *   node scripts/panel-click-verify.mjs [--url=http://localhost:3000] [--out=/tmp/panel-click-verify]
 *
 * Needs a running dev server and Chrome (CHROME, default /opt/google/chrome/chrome).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/panel-click-verify');
mkdirSync(OUT, { recursive: true });

const doc = JSON.parse(readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const KEY = `econ-worksheet:${doc.id}`;
const TITLE = 'Panel click verify';
const STEM = 'The government sets';

const WORDS = {
  en: { source: /^Add a source/, diagram: /^Add diagram/, text: /^Add text$/, scheme: /^Marking scheme: No marking scheme yet/, essay: 'Essay + EC' },
  zh: { source: /^加入資料/, diagram: /^加入圖表/, text: /^加入文字$/, scheme: /^評分方案: 未有/, essay: '論述 + 有效溝通' },
};

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });

async function open({ width, height, zh, touch }) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: touch });
  await context.addInitScript(
    ([version, index, key, body, ui]) => {
      if (!localStorage.getItem(key)) {
        localStorage.setItem('econ-worksheet-last-seen-version', version);
        localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui, paper: 'en' }));
        localStorage.setItem('econ-worksheet-index', index);
        localStorage.setItem(key, body);
      }
    },
    [APP_VERSION, JSON.stringify([{ id: doc.id, title: TITLE, updatedAt: doc.updatedAt }]), KEY, JSON.stringify(doc), zh ? 'zh-HK' : 'en'],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  return { page, context, errors };
}

/** Click (or tap) the stem's words on the page, so a field is open and focused. */
async function typeOnPage(page, touch) {
  const words = page.locator('#print-root').getByText(STEM).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (touch) await words.tap();
    else await words.click();
    await page.waitForTimeout(300);
    if (await page.evaluate(() => document.activeElement?.isContentEditable === true)) return;
  }
  throw new Error('the stem field did not open');
}

/** One press, as a teacher makes it: a mouse click or a finger tap. */
const press = (locator, touch) => (touch ? locator.tap() : locator.click());

const blocks = (page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key)).questions[0].blocks.length, KEY);

try {
  for (const [label, size, zh, touch] of [
    ['en-mac-mouse', { width: 1440, height: 900 }, false, false],
    ['zh-mac-mouse', { width: 1440, height: 900 }, true, false],
    ['en-ipad-touch', { width: 1180, height: 820 }, false, true],
    ['zh-ipad-touch', { width: 1180, height: 820 }, true, true],
  ]) {
    const w = zh ? WORDS.zh : WORDS.en;
    const { page, context, errors } = await open({ ...size, zh, touch });
    const panel = page.locator('aside').last();

    for (const [name, pattern] of [['Source ▾', w.source], ['Diagram ▾', w.diagram]]) {
      await typeOnPage(page, touch);
      const trigger = panel.getByRole('button', { name: pattern }).first();
      await press(trigger, touch);
      await page.waitForTimeout(400);
      // Source ▾ opens a menu; Diagram ▾ the template picker. Either says so on its trigger.
      const items = await page.getByRole('menuitem').count();
      const expanded = (await trigger.getAttribute('aria-expanded')) === 'true';
      check(`${label}: ${name} opens on the first press`, items > 0 || expanded, `${items} menu items, aria-expanded ${expanded}`);
      if (name === 'Source ▾') await page.screenshot({ path: `${OUT}/source-menu-${label}.png` });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(200);
    }

    await typeOnPage(page, touch);
    const before = await blocks(page);
    await press(panel.getByRole('button', { name: w.text }).first(), touch);
    await page.waitForTimeout(1800);
    check(`${label}: Add text adds a block on the first press`, (await blocks(page)) === before + 1, `${before} → ${await blocks(page)}`);
    await page.keyboard.press('Control+Z');
    await page.waitForTimeout(400);

    await typeOnPage(page, touch);
    await press(panel.getByRole('button', { name: w.scheme }).first(), touch);
    await page.waitForTimeout(700);
    const essay = panel.getByRole('button', { name: w.essay }).first();
    const shown = await essay.isVisible().catch(() => false);
    check(`${label}: Scheme opens the marking scheme on the first press`, shown);
    if (shown) {
      await typeOnPage(page, touch);
      await essay.scrollIntoViewIfNeeded();
      await press(essay, touch);
      await page.waitForTimeout(1800);
      const filled = await page.evaluate((key) => {
        const part = JSON.parse(localStorage.getItem(key)).questions[0].parts[0];
        return Boolean(part.scheme && JSON.stringify(part.scheme).length > 40);
      }, KEY);
      check(`${label}: Essay + EC fills the scheme on the first press`, filled);
      await page.screenshot({ path: `${OUT}/essay-scheme-${label}.png` });
    }

    // Any panel that moves when the selection clears: force a 40px jump on blur.
    await page.evaluate(() => {
      document.addEventListener(
        'focusout',
        () => {
          const aside = document.querySelectorAll('aside');
          const host = aside[aside.length - 1].querySelector('[role="tabpanel"]') ?? aside[aside.length - 1];
          const shim = document.createElement('div');
          shim.style.height = '40px';
          shim.dataset.verifyShim = '';
          host.prepend(shim);
        },
        { once: true, capture: true },
      );
    });
    await typeOnPage(page, touch);
    await page.evaluate(() => {
      document.addEventListener('focusout', () => {}, { once: true });
    });
    const source = panel.getByRole('button', { name: w.source }).first();
    const at = await source.boundingBox();
    await press(source, touch);
    await page.waitForTimeout(400);
    const moved = await page.evaluate(() => document.querySelector('[data-verify-shim]') !== null);
    const items = await page.getByRole('menuitem').count();
    check(`${label}: with a forced 40px jump, Source ▾ still opens (jump happened: ${moved}, from y=${Math.round(at?.y ?? 0)})`, moved && items > 0, `${items} menu items`);
    await page.keyboard.press('Escape');
    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
