import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that Enter in the side panel's marking-point box makes the page's
 * Enter (k-0482, user u-ag5a; k-0481 CHECK.md § 4.2): a new point with the same mark, the
 * caret at its start, instead of a line break inside the point (the likely way GitHub #7's
 * teacher got blank lines).
 *
 * In part (a)'s scheme (two points, (1) each), English and 中文 interface, at 1440 and at
 * iPad width (1180):
 *  - Enter mid-text splits there: "Demand | rises" → "Demand" + " rises", same mark;
 *  - Enter at the end, then typing, writes into a new point (caret moved);
 *  - Enter on that new point once emptied removes it (as on the page);
 *  - Shift+Enter still breaks the line inside the point;
 *  - an Enter that confirms a Chinese IME composition (keyCode 229) does not split;
 *  - the answer box keeps Enter as a new line, as the page's answer field does.
 *
 *   node scripts/panel-enter-verify.mjs [--url=http://localhost:3000] [--out=/tmp/panel-enter-verify]
 *
 * Needs a running dev server and Chrome (CHROME, default /opt/google/chrome/chrome).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/panel-enter-verify');
mkdirSync(OUT, { recursive: true });

const base = JSON.parse(readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const rt = (text) => [{ text }];

function seed() {
  const doc = structuredClone(base);
  const part = doc.questions[0].parts[0];
  part.answer = { en: rt('Price ceiling below equilibrium'), zh: [] };
  part.scheme = {
    routes: [
      {
        id: 'pe-route',
        groups: [
          {
            id: 'pe-group',
            points: [
              { id: 'pe-p1', text: { en: rt('Demand rises'), zh: rt('需求上升') }, marks: 1 },
              { id: 'pe-p2', text: { en: rt('Supply falls'), zh: rt('供應下降') }, marks: 1 },
            ],
          },
        ],
      },
    ],
  };
  return doc;
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });

try {
  for (const [label, size, zh] of [
    ['en-mac', { width: 1440, height: 900 }, false],
    ['zh-ipad', { width: 1180, height: 820 }, true],
  ]) {
    const doc = seed();
    const key = `econ-worksheet:${doc.id}`;
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([version, index, k, body, ui]) => {
        if (!localStorage.getItem(k)) {
          localStorage.setItem('econ-worksheet-last-seen-version', version);
          localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui, paper: 'en' }));
          localStorage.setItem('econ-worksheet-index', index);
          localStorage.setItem(k, body);
        }
      },
      [APP_VERSION, JSON.stringify([{ id: doc.id, title: 'Panel enter verify', updatedAt: doc.updatedAt }]), key, JSON.stringify(doc), zh ? 'zh-HK' : 'en'],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Panel enter verify/ }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
    await page.waitForTimeout(1200);
    // Select question 1 and open part (a)'s card in the panel.
    await page.locator('#print-root').getByText('Explain why a shortage').first().click();
    await page.waitForTimeout(600);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    const points = async () => {
      await page.waitForTimeout(1500);
      return page.evaluate((k) => {
        const g = JSON.parse(localStorage.getItem(k)).questions[0].parts[0].scheme.routes[0].groups[0];
        return g.points.map((p) => ({ en: p.text.en.map((r) => r.text).join(''), marks: p.marks }));
      }, key);
    };
    const box = (n) => page.getByRole('textbox', { name: zh ? `評分要點 ${n} (英文)` : `Marking point ${n} (English)` });
    const caretIn = async (n, at) => {
      const target = box(n);
      await target.scrollIntoViewIfNeeded();
      await target.click();
      await page.keyboard.press('Home');
      for (let i = 0; i < at; i += 1) await page.keyboard.press('ArrowRight');
    };

    check(`${label}: the panel shows part (a)'s point boxes`, await box(1).isVisible().catch(() => false));

    // Enter mid-text.
    await caretIn(1, 6);
    await page.keyboard.press('Enter');
    let p = await points();
    check(
      `${label}: Enter mid-text splits the point there, same mark`,
      JSON.stringify(p) === JSON.stringify([{ en: 'Demand', marks: 1 }, { en: ' rises', marks: 1 }, { en: 'Supply falls', marks: 1 }]),
      JSON.stringify(p),
    );
    // The caret went to the new point's start: typing lands there.
    await page.keyboard.type('Then');
    p = await points();
    check(`${label}: the caret is at the new point's start`, p[1]?.en === 'Then rises', JSON.stringify(p));
    await page.screenshot({ path: `${OUT}/split-${label}.png` });

    // Enter at the end of the last point, then type.
    await caretIn(3, 'Supply falls'.length);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Price rises');
    p = await points();
    check(`${label}: Enter at the end, then typing, writes a new point`, p.length === 4 && p[3].en === 'Price rises' && p[2].en === 'Supply falls', JSON.stringify(p));

    // Enter on an empty point removes it.
    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    p = await points();
    check(`${label}: Enter at the end makes an empty fifth point`, p.length === 5 && p[4].en === '', JSON.stringify(p));
    await page.keyboard.press('Enter');
    p = await points();
    check(`${label}: Enter on the empty point removes it, as on the page`, p.length === 4 && p.every((x) => x.en !== ''), JSON.stringify(p));

    // Shift+Enter still breaks the line.
    await caretIn(1, 'Demand'.length);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('x');
    p = await points();
    check(`${label}: Shift+Enter breaks the line inside the point`, p.length === 4 && p[0].en === 'Demand\nx', JSON.stringify(p));

    // IME: an Enter that confirms a composition must not split.
    await caretIn(2, 'Then rises'.length);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Input.imeSetComposition', { text: '經濟', selectionStart: 2, selectionEnd: 2 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229, nativeVirtualKeyCode: 229 });
    await cdp.send('Input.insertText', { text: '經濟' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    p = await points();
    check(`${label}: an Enter confirming 中文 input does not split`, p.length === 4 && p[1].en === 'Then rises經濟', JSON.stringify(p));

    // The answer box: Enter is a new line, as on the page.
    const answer = page.getByRole('textbox', { name: zh ? /答案.*英文/ : /Answer.*English/ }).first();
    if (await answer.isVisible().catch(() => false)) {
      await answer.scrollIntoViewIfNeeded();
      await answer.click();
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      await page.keyboard.type('second line');
      await page.waitForTimeout(1500);
      const text = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).questions[0].parts[0].answer.en.map((r) => r.text).join(''), key);
      check(`${label}: the answer box keeps Enter as a new line`, text === 'Price ceiling below equilibrium\nsecond line', JSON.stringify(text));
    } else {
      check(`${label}: the answer box is on the panel`, false, 'not found');
    }
    await page.locator('aside').last().getByRole('textbox', { name: zh ? '評分要點 1 (英文)' : 'Marking point 1 (English)' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/after-${label}.png` });
    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
