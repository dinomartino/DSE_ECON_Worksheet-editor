import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser the three points of GitHub issue #8 (k-0479), from a teacher on
 * 0.9.1 desktop: "MC 打唔到Q1 Q2 個1同2喺下面，同埋用唔到分數形式打equation；copy and
 * paste 過嚟有字粗體咗，crtl B 或者撳制都unbold唔到".
 *
 *  1. Pasted bold comes off: a stem saved bold on its runs (what a paste stores), and real
 *     pastes of Word's and a web page's HTML, unbold with Ctrl+B over a selection and with
 *     the bar's B with nothing selected (before: both left the words bold).
 *  2. Q₁ in an MC option: select the 1, Ctrl+= (and the bar's X₂, now on an option's bar);
 *     Ctrl+= at a caret then typing gives a subscript; Ctrl+Shift+= a superscript.
 *  3. A stacked fraction: Fraction on the bar opens the dialog, Q₁ inside it by Ctrl+=,
 *     Insert stores `fraction` runs and the page draws numerator over denominator; a tap on
 *     it in the open field opens Edit fraction.
 *
 * Screens at MacBook (1440×900) and iPad (1180×820, landscape) widths, English and 中文
 * interface, into --out.
 *
 *   node scripts/issue8-verify.mjs [--url=http://localhost:3000] [--out=/tmp/issue8-verify]
 *
 * Needs a running dev server and Chrome (CHROME, default /opt/google/chrome/chrome).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/issue8-verify');
mkdirSync(OUT, { recursive: true });

const base = JSON.parse(readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const STEM = 'Suppose the relative price of Good X in terms of Good Y is initially 3Y. Which change raises demand?';
const OPTION = 'Q1 rises to Q2';

function seedDoc() {
  const doc = structuredClone(base);
  const mcq = doc.questions.find((q) => q.type === 'mcq');
  // What a paste of bold words stores: the runs' own bold.
  mcq.blocks[0].text = { en: [{ text: STEM, bold: true }], zh: [{ text: '假設X物品以Y物品計算的相對價格最初為3Y。', bold: true }] };
  mcq.options[0].text = { en: [{ text: OPTION }], zh: [{ text: 'Q1 上升至 Q2' }] };
  mcq.options[1].text = { en: [{ text: 'P1 falls' }], zh: [{ text: 'P1 下跌' }] };
  mcq.options[2].text = { en: [{ text: 'the price elasticity is 2' }], zh: [{ text: '價格彈性為 2' }] };
  mcq.options[3].text = { en: [{ text: 'none of the above' }], zh: [{ text: '以上皆非' }] };
  return doc;
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', executablePath: chromePath });

async function openDoc({ width, height, zh }) {
  const doc = seedDoc();
  const key = `econ-worksheet:${doc.id}`;
  const title = 'Issue 8 verify';
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await context.addInitScript(
    ([version, index, k, body, ui]) => {
      if (!localStorage.getItem(k)) {
        localStorage.setItem('econ-worksheet-last-seen-version', version);
        localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui, paper: 'en' }));
        localStorage.setItem('econ-worksheet-index', index);
        localStorage.setItem(k, body);
      }
    },
    [APP_VERSION, JSON.stringify([{ id: doc.id, title, updatedAt: doc.updatedAt }]), key, JSON.stringify(doc), zh ? 'zh-HK' : 'en'],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  // Autosave is debounced: let it land before reading the saved document.
  const stored = async () => {
    await page.waitForTimeout(1600);
    return readStored(k0);
  };
  const k0 = key;
  const readStored = (k) =>
    page.evaluate((k) => {
      const q = JSON.parse(localStorage.getItem(k)).questions.find((x) => x.type === 'mcq');
      return { stem: q.blocks[0].text.en, options: q.options.map((o) => o.text.en) };
    }, k);
  return { page, context, errors, stored };
}

/** Open the field showing `text` on the page, caret where the click lands. */
async function openField(page, text) {
  const target = page.locator('#print-root').getByText(text, { exact: false }).first();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await target.click();
    await page.waitForTimeout(250);
    const editing = await page.evaluate(() => document.activeElement?.isContentEditable === true);
    if (editing) return;
  }
  throw new Error(`could not open the field showing "${text}"`);
}

const settle = (page) => page.waitForTimeout(350);
const selectAllInField = (page) => page.keyboard.press('Control+A');

try {
  // ---- 1. Pasted bold comes off -------------------------------------------------------
  {
    const { page, context, errors, stored } = await openDoc({ width: 1440, height: 900 });
    await page.screenshot({ path: `${OUT}/1-before-bold-stem-mac.png` });

    await openField(page, 'Suppose the relative price');
    await selectAllInField(page);
    await page.keyboard.press('Control+B');
    await settle(page);
    let s = await stored();
    check('Ctrl+B over pasted bold takes it off', s.stem.every((run) => !run.bold), JSON.stringify(s.stem));
    await page.keyboard.press('Control+B');
    await settle(page);
    s = await stored();
    check('Ctrl+B again puts it back', s.stem.every((run) => run.bold === true), JSON.stringify(s.stem));

    // The bar's B with only a caret: the whole stem.
    await page.keyboard.press('End');
    await settle(page);
    const bold = page.getByRole('toolbar').getByRole('button', { name: 'Bold', exact: false }).first();
    check('B shows pressed over all-bold words', (await bold.getAttribute('aria-pressed')) === 'true');
    await bold.click();
    await settle(page);
    s = await stored();
    check('the bar’s B with no selection unbolds pasted bold', s.stem.every((run) => !run.bold), JSON.stringify(s.stem));
    await page.screenshot({ path: `${OUT}/1-after-unbold-mac.png` });

    // Real pastes: Word's HTML and a web page's.
    const paste = (html, text) =>
      page.evaluate(
        ([h, t]) => {
          const data = new DataTransfer();
          data.setData('text/html', h);
          data.setData('text/plain', t);
          document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        },
        [html, text],
      );
    const pastes = {
      word:
        "<html xmlns:o='urn:schemas-microsoft-com:office:office'><body><!--StartFragment--><p class=MsoNormal><b><span lang=EN-US style='font-size:12.0pt;font-family:\"Times New Roman\",serif'>Pasted from Word in bold.</span></b><o:p></o:p></p><!--EndFragment--></body></html>",
      web: '<meta charset="utf-8"><span style="font-weight: 700; font-family: Arial; color: rgb(32, 33, 36);">Pasted from a web page in bold.</span>',
      webStrong: '<meta charset="utf-8"><p><strong>Strong from a web page.</strong></p>',
    };
    for (const [name, html] of Object.entries(pastes)) {
      await selectAllInField(page);
      const text = html.replace(/<[^>]+>/g, '').replace(/<!--.*?-->/g, '');
      await paste(html, text);
      await settle(page);
      s = await stored();
      const wasBold = s.stem.some((run) => run.bold);
      await selectAllInField(page);
      await page.keyboard.press('Control+B');
      await settle(page);
      const after = await stored();
      check(`paste ${name}: arrives bold, Ctrl+B unbolds it`, wasBold && after.stem.every((run) => !run.bold), `${JSON.stringify(s.stem)} → ${JSON.stringify(after.stem)}`);
    }
    check('no page errors (bold)', errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 2. Q₁ in an MC option ---------------------------------------------------------
  for (const zh of [false, true]) {
    const { page, context, errors, stored } = await openDoc({ width: 1440, height: 900, zh });
    await openField(page, OPTION);
    await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await settle(page);
    const sub = page.getByRole('toolbar').getByRole('button', { name: zh ? '下標' : 'Subscript', exact: true });
    check(`${zh ? '中' : 'EN'}: an option's bar offers X₂ with characters selected`, await sub.isVisible());
    check(
      `${zh ? '中' : 'EN'}: and B I U`,
      await page.getByRole('toolbar').getByRole('button', { name: zh ? '粗體' : 'Bold', exact: false }).first().isVisible(),
    );
    await page.screenshot({ path: `${OUT}/2-option-bar-${zh ? 'zh' : 'en'}-mac.png` });
    await page.keyboard.press('Control+Equal');
    await settle(page);
    let s = await stored();
    check(
      `${zh ? '中' : 'EN'}: Ctrl+= makes Q1 into Q₁`,
      JSON.stringify(s.options[0]) === JSON.stringify([{ text: 'Q' }, { text: '1', vertAlign: 'subscript' }, { text: ' rises to Q2' }]),
      JSON.stringify(s.options[0]),
    );
    // Q2 by the bar's button.
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    await settle(page);
    await sub.click();
    await settle(page);
    s = await stored();
    check(`${zh ? '中' : 'EN'}: X₂ on the option bar makes Q2 into Q₂`, s.options[0].at(-1)?.vertAlign === 'subscript' && s.options[0].at(-1)?.text === '2', JSON.stringify(s.options[0]));

    // Caret: Ctrl+= then type; Ctrl+Shift+= then type.
    await openField(page, 'P1 falls');
    await page.keyboard.press('End');
    await page.keyboard.type(' to P');
    await page.keyboard.press('Control+Equal');
    await page.keyboard.type('2');
    await page.keyboard.press('Control+Equal');
    await page.keyboard.type(' (m');
    await page.keyboard.press('Control+Shift+Equal');
    await page.keyboard.type('2');
    await settle(page);
    s = await stored();
    const runs = s.options[1];
    check(
      `${zh ? '中' : 'EN'}: Ctrl+= / Ctrl+Shift+= at a caret switch what is typed`,
      runs.some((r) => r.text === '2' && r.vertAlign === 'subscript') && runs.some((r) => r.text === '2' && r.vertAlign === 'superscript') && runs.some((r) => r.text.startsWith(' (m') && !r.vertAlign),
      JSON.stringify(runs),
    );
    await page.keyboard.press('Escape');
    await settle(page);
    await page.screenshot({ path: `${OUT}/2-option-subscripts-${zh ? 'zh' : 'en'}-mac.png` });
    check(`${zh ? '中' : 'EN'}: no page errors (subscript)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // ---- 3. A stacked fraction -----------------------------------------------------------
  for (const [label, size, zh] of [
    ['en-mac', { width: 1440, height: 900 }, false],
    ['zh-mac', { width: 1440, height: 900 }, true],
    ['en-ipad', { width: 1180, height: 820 }, false],
    ['zh-ipad', { width: 1180, height: 820 }, true],
  ]) {
    const { page, context, errors, stored } = await openDoc({ ...size, zh });
    await openField(page, 'the price elasticity is 2');
    await page.keyboard.press('End');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Backspace');
    await settle(page);
    const fractionButton = page.getByRole('toolbar').getByRole('button', { name: zh ? '分數' : 'Fraction', exact: true });
    check(`${label}: an option's bar offers Fraction at a caret`, await fractionButton.isVisible());
    await fractionButton.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 5000 });
    await page.keyboard.type('Q2 − Q1');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Control+Equal');
    await page.keyboard.press('End');
    // "Q2": the 2 by the dialog's X₂ (a touch screen's way): caret after it.
    for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowLeft');
    await dialog.getByRole('button', { name: /^X₂/ }).click();
    await dialog.getByRole('textbox').nth(1).click();
    await page.keyboard.type('Q1');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Control+Equal');
    await settle(page);
    await page.screenshot({ path: `${OUT}/3-fraction-dialog-${label}.png` });
    await dialog.getByRole('button', { name: zh ? '插入' : 'Insert', exact: true }).click();
    await settle(page);
    const s = await stored();
    const runs = s.options[2];
    const num = runs.filter((r) => r.fraction === 'num');
    const den = runs.filter((r) => r.fraction === 'den');
    check(
      `${label}: Insert stores numerator (Q₂ − Q₁) and denominator Q₁`,
      num.map((r) => r.text).join('') === 'Q2 − Q1' &&
        num.filter((r) => r.vertAlign === 'subscript').map((r) => r.text).join('') === '21' &&
        den.map((r) => r.text).join('') === '⁄Q1' &&
        den.some((r) => r.text === '1' && r.vertAlign === 'subscript'),
      JSON.stringify(runs),
    );
    // The open field shows it as one piece; a tap opens Edit fraction.
    await openField(page, 'the price elasticity is');
    const chip = page.locator('#print-root [data-fraction-chip]').first();
    if (await chip.count()) {
      await chip.click();
      const editing = await page.getByRole('dialog').getByText(zh ? '編輯分數' : 'Edit fraction').isVisible().catch(() => false);
      check(`${label}: a tap on the fraction opens Edit fraction`, editing);
      await page.keyboard.press('Escape');
      await settle(page);
    } else {
      check(`${label}: the open field shows the fraction as one piece`, false, 'no [data-fraction-chip]');
    }
    await page.keyboard.press('Escape');
    await page.mouse.click(5, size.height - 5);
    await settle(page);
    const drawn = await page.evaluate(() => {
      const fraction = document.querySelector('#print-root .paper .econ-fraction');
      if (!fraction) return undefined;
      const [top, bottom] = [...fraction.children].map((child) => child.getBoundingClientRect());
      return { num: fraction.children[0].innerText, den: fraction.children[1].innerText, stacked: bottom.top >= top.bottom - 1 };
    });
    check(`${label}: the page draws numerator over denominator`, drawn?.stacked === true && drawn.num === 'Q2 − Q1' && drawn.den === 'Q1', JSON.stringify(drawn));
    const optionBox = page.locator('#print-root .econ-fraction').first();
    await optionBox.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/3-fraction-page-${label}.png` });
    check(`${label}: no page errors (fraction)`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
