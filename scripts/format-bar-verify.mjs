import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser that the format bar stays while the caret or a selection is in a
 * text box on the page, and goes only when editing really ends (k-0484, user u-zatn).
 *
 * Before: the first click on a text box showed the bar; a second click inside the *same*
 * box, to put the caret on a word or select some, bubbled to the question's own click
 * handler, which dropped the text selection, and the bar vanished with the caret still in
 * the box.
 *
 * For a part's stem, the question's stem, an MC option, a DRQ source's text and a marking
 * point (Teacher view), English at 1440 with a mouse and 中文 at iPad width (1180) with
 * touch:
 *  - mouse: click in, click a word, double-click a word, drag-select released past the
 *    box's edge, Shift+arrows — the bar stays each time; Esc hides it;
 *  - touch: tap in, tap another word — the bar stays; a tap on blank paper hides it;
 *  - a click on blank paper hides it; a click on another box moves it there.
 * A marking point takes no formatting, so it has no bar; there the check is that a second
 * click or a double-click keeps the point open and the page's selection alive.
 *
 *   node scripts/format-bar-verify.mjs [--url=http://localhost:3000] [--out=/tmp/format-bar-verify]
 *
 * Needs a running dev server and Chrome (CHROME, default /opt/google/chrome/chrome).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const URL_BASE = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/format-bar-verify');
mkdirSync(OUT, { recursive: true });

const base = JSON.parse(readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8'));
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const bi = (en, zh) => ({ en: [{ text: en }], zh: [{ text: zh }] });

const TEXT = {
  partStem: bi('Explain why a shortage results.', '解釋為何會出現短缺。'),
  stem: bi('The government sets a maximum price for rice below the equilibrium price.', '政府為白米設定低於均衡價格的最高價格。'),
  option: bi('street lighting for the whole district', '全區的街燈'),
  source: bi('The price of rice rose by ten per cent within one year.', '米價在一年內上升了百分之十。'),
  point: bi('Quantity demanded exceeds quantity supplied at the ceiling.', '在價格上限下，需求量大於供應量。'),
};

function seed() {
  const doc = structuredClone(base);
  const q1 = doc.questions[0];
  const stem = q1.blocks.find((b) => b.kind === 'paragraph');
  stem.text = TEXT.stem;
  q1.blocks.push({
    kind: 'source',
    id: 'fb-source',
    label: bi('Source A: Rice prices', '資料A：米價'),
    blocks: [{ kind: 'paragraph', id: 'fb-source-p', text: TEXT.source }],
  });
  const part = q1.parts[0];
  part.blocks.find((b) => b.kind === 'paragraph').text = TEXT.partStem;
  part.scheme = {
    routes: [{ id: 'fb-route', groups: [{ id: 'fb-group', points: [{ id: 'fb-p1', text: TEXT.point, marks: 2 }] }] }],
  };
  const mc = doc.questions.find((q) => q.type === 'mcq');
  mc.options[0].text = TEXT.option;
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
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2, hasTouch: zh });
    await context.addInitScript(
      ([version, index, k, body, ui]) => {
        if (!localStorage.getItem(k)) {
          localStorage.setItem('econ-worksheet-last-seen-version', version);
          localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui, paper: 'en' }));
          localStorage.setItem('econ-worksheet-index', index);
          localStorage.setItem(k, body);
        }
      },
      [APP_VERSION, JSON.stringify([{ id: doc.id, title: 'Format bar verify', updatedAt: doc.updatedAt }]), key, JSON.stringify(doc), zh ? 'zh-HK' : 'en'],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: /Format bar verify/ }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
    await page.waitForTimeout(1200);

    // The page's format bar (an MC option's carries Justify alone until words are selected).
    const bar = page.getByRole('toolbar', { name: zh ? '設定所選元素的格式' : 'Format selected element' });
    const barShown = async () => {
      await page.waitForTimeout(350);
      return bar.first().isVisible().catch(() => false);
    };
    const selectedWords = () => page.evaluate(() => String(window.getSelection() ?? ''));
    /** The on-page box holding `text` (locked or open) and points inside it. */
    const boxOf = async (text) => {
      const node = page.locator('#print-root').getByText(text, { exact: false }).first();
      await node.scrollIntoViewIfNeeded();
      const box = await node.boundingBox();
      // A spot `frac` along the first line of the text.
      return { box, at: (frac) => ({ x: box.x + Math.min(box.width - 4, Math.max(4, box.width * frac)), y: box.y + Math.min(box.height / 2, 9) }) };
    };
    /** The middle of `word` inside the on-page text `text` (the first match). */
    const wordAt = async (text, word) => {
      await page.locator('#print-root').getByText(text, { exact: false }).first().scrollIntoViewIfNeeded();
      return page.evaluate(([t, w]) => {
        const walker = document.createTreeWalker(document.querySelector('#print-root'), NodeFilter.SHOW_TEXT);
        const nodes = [];
        for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
        // The text may be split across run spans; find the node that holds the word and whose
        // block holds the whole text.
        for (const n of nodes) {
          const i = n.data.indexOf(w);
          if (i < 0) continue;
          const holder = n.parentElement?.closest('p, li, td, div, span[contenteditable], span');
          if (!holder || !(holder.closest('[data-question-id], .paper')?.textContent ?? '').includes(t)) continue;
          const range = document.createRange();
          range.setStart(n, i);
          range.setEnd(n, i + w.length);
          const r = range.getBoundingClientRect();
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, left: r.x + 1, right: r.x + r.width - 1 };
        }
        return undefined;
      }, [text, word]);
    };
    const blank = async () => {
      const paper = await page.locator('#print-root .paper').first().boundingBox();
      return { x: paper.x + 30, y: paper.y + paper.height - 60 };
    };
    const tap = (p) => page.touchscreen.tap(p.x, p.y);
    const click = (p) => page.mouse.click(p.x, p.y);

    const targets = [
      ['part stem', TEXT.partStem.en[0].text, ['Explain', 'shortage', 'results']],
      ['question stem', TEXT.stem.en[0].text, ['government', 'maximum', 'equilibrium']],
      ['MC option', TEXT.option.en[0].text, ['street', 'whole', 'district']],
      ['DRQ source text', TEXT.source.en[0].text, ['price', 'rose', 'within']],
    ];

    const run = async (name, text, [first, middle, last]) => {
      const go = zh ? tap : click;
      const verb = zh ? 'tap' : 'click';
      await go(await wordAt(text, first));
      check(`${label}: ${name}: the first ${verb} shows the bar`, await barShown());
      await go(await wordAt(text, middle));
      check(`${label}: ${name}: a second ${verb}, on a word in the same box, keeps it`, await barShown());
      await go(await wordAt(text, last));
      check(`${label}: ${name}: a third keeps it`, await barShown());
      if (!zh) {
        const w = await wordAt(text, middle);
        await page.mouse.dblclick(w.x, w.y);
        const word = await selectedWords();
        check(`${label}: ${name}: a double-click on a word selects it and keeps the bar`, (await barShown()) && word.trim() === middle, `selected "${word}"`);
        // Drag from a word to well past the box's right edge, released off the text.
        const from = await wordAt(text, middle);
        const { box } = await boxOf(text);
        await page.mouse.move(from.left, from.y);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width + 30, from.y, { steps: 8 });
        await page.mouse.move(box.x + box.width + 70, from.y + 1, { steps: 4 });
        await page.mouse.up();
        const dragged = await selectedWords();
        check(`${label}: ${name}: a drag-select released past the box keeps it`, (await barShown()) && dragged.startsWith(middle), `selected "${dragged}" bar ${await barShown()}`);
        const start = await wordAt(text, first);
        await click({ x: start.left, y: start.y });
        await page.keyboard.down('Shift');
        for (let i = 0; i < 5; i += 1) await page.keyboard.press('ArrowRight');
        await page.keyboard.up('Shift');
        const shifted = await selectedWords();
        check(`${label}: ${name}: Shift+arrows select and keep it`, (await barShown()) && shifted.length === 5, `selected "${shifted}"`);
        const subject = await bar.first().textContent({ timeout: 2000 }).catch(() => '');
        check(`${label}: ${name}: the bar names the selected words`, /selected text/.test(subject ?? ''), subject);
        await page.keyboard.press('Escape');
        check(`${label}: ${name}: Esc ends editing and hides it`, !(await barShown()));
      } else {
        await tap(await blank());
        check(`${label}: ${name}: a tap on blank paper hides it`, !(await barShown()));
      }
    };

    for (const [name, text, words] of targets) await run(name, text, words);
    // A screen with the bar up after a second click inside a box.
    {
      const go = zh ? tap : click;
      await go(await wordAt(TEXT.partStem.en[0].text, 'Explain'));
      await go(await wordAt(TEXT.partStem.en[0].text, 'shortage'));
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${OUT}/second-click-${label}.png` });
      // Another box: the bar follows.
      await go(await wordAt(TEXT.option.en[0].text, 'whole'));
      check(`${label}: a ${zh ? 'tap' : 'click'} on another box moves the bar there`, await barShown());
      await go(await blank());
      check(`${label}: a ${zh ? 'tap' : 'click'} on blank paper hides it`, !(await barShown()));
    }

    // Marking points print in the Teacher view.
    await page.getByText(zh ? '教師版' : 'Teacher', { exact: true }).first().click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/teacher-${label}.png` });
    const pointShown = await page.locator('#print-root').getByText(TEXT.point.en[0].text).first().isVisible().catch(() => false);
    check(`${label}: the marking point is on the Teacher view`, pointShown);
    /*
     * A marking point takes no formatting (`isFormattable` leaves `schemePoint` out), so it
     * never shows the bar. What the bug broke there is the same: a second click inside the
     * open point dropped the page's selection. The point must stay open and selected.
     */
    if (pointShown) {
      const pt = TEXT.point.en[0].text;
      const go = zh ? tap : click;
      const openHere = () =>
        page.evaluate((t) => {
          const a = document.activeElement;
          return Boolean(a?.isContentEditable && a.textContent?.includes(t));
        }, pt);
      // The panel names what the page has selected; with nothing, it says "Click text on the page…".
      const pageForgot = () => page.getByText(zh ? '按頁面上的文字，即可在此編輯' : 'Click text on the page to edit it here').first().isVisible().catch(() => false);
      const selectedKey = () => page.evaluate(() => document.querySelectorAll('#print-root [contenteditable="true"]').length);
      await go(await wordAt(pt, 'Quantity'));
      await page.waitForTimeout(300);
      check(`${label}: marking point: the first ${zh ? 'tap' : 'click'} opens it`, (await openHere()) && !(await pageForgot()));
      await go(await wordAt(pt, 'exceeds'));
      await page.waitForTimeout(300);
      check(`${label}: marking point: a second ${zh ? 'tap' : 'click'} keeps it open and selected`, (await openHere()) && (await selectedKey()) === 1 && !(await pageForgot()));
      if (!zh) {
        const w = await wordAt(pt, 'supplied');
        await page.mouse.dblclick(w.x, w.y);
        await page.waitForTimeout(300);
        check(`${label}: marking point: a double-click keeps it open and selected`, (await openHere()) && !(await pageForgot()) && (await selectedWords()).trim() === 'supplied');
      }
      check(`${label}: marking point: no format bar (points take no formatting, by design)`, !(await barShown()));
    }

    check(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
