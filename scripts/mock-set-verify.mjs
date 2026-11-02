import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * A mock set from New worksheet (k-0311), walked in Chrome at MacBook, iPad and iPhone sizes:
 *
 *   node scripts/mock-set-verify.mjs [--zh] [--port=3117] [--out=/tmp/mock-set]
 *
 * Per size: New worksheet → Paper 1 → the Make choice defaults to Just this paper → Mock set →
 * the preview names both papers → Create mock set. Then: Paper 1 opens, the strip lists a blank
 * Paper 2; home shows one frame, Paper 2 marked Blank; Paper 2 opens from its card. Also: Just
 * this paper still makes one paper with no set, and a classroom worksheet is never offered a
 * set. Touch sizes use a touch context. Screenshots go to --out. Exits 1 on any failed check.
 */

const args = process.argv.slice(2);
const zh = args.includes('--zh');
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3117';
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6) ?? '/tmp/mock-set';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

const W = zh
  ? {
      newWorksheet: '新增工作紙', name: '名稱', create: /^建立工作紙$/, createSet: /^建立 Mock 套卷$/, home: 'Econ Studio 主頁',
      paper1: /^Paper 1 Mock · MCQ/, classroom: /^課堂工作紙/, just: /^只建立這份試卷/, set: /^Mock 套卷（Paper 1 \+ Paper 2）/,
      dismissHint: '關閉提示', blank: '空白，未開始', openBlank: (t) => `開啟「${t}」（空白，未開始）`, openTitle: (t) => `開啟「${t}」`,
    }
  : {
      newWorksheet: 'New worksheet', name: 'Name', create: /^Create worksheet$/, createSet: /^Create mock set$/, home: 'Econ Studio home',
      paper1: /^Paper 1 mock · MCQ/, classroom: /^Classroom worksheet/, just: /^Just this paper/, set: /^Mock set \(Paper 1 \+ Paper 2\)/,
      dismissHint: 'Dismiss hint', blank: 'Blank, not started', openBlank: (t) => `Open ${t} (blank, not started)`, openTitle: (t) => `Open ${t}`,
    };

const SIZES = [
  { tag: 'macbook', width: 1440, height: 900, touch: false },
  { tag: 'ipad-landscape', width: 1180, height: 820, touch: true },
  { tag: 'ipad-portrait', width: 820, height: 1180, touch: true },
  { tag: 'iphone', width: 390, height: 844, touch: true },
];

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch({ channel: 'chrome' });
for (const size of SIZES) {
  console.log(`\n== ${size.tag} ${size.width}×${size.height}${zh ? ' 中' : ''} ==`);
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: 2,
    hasTouch: size.touch,
    isMobile: size.tag === 'iphone',
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  if (zh) {
    await page.addInitScript(() => {
      if (!window.localStorage.getItem('econgen.settings.language')) {
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
      }
    });
  }
  const tap = (locator) => (size.touch ? locator.tap() : locator.click());
  const shot = (name) => page.screenshot({ path: `${OUT}/${zh ? 'zh' : 'en'}-${size.tag}-${name}.png` });
  const label = `${size.tag}:`;
  await page.goto(URL, { waitUntil: 'networkidle' });
  const goHome = async () => {
    await tap(page.getByRole('button', { name: W.home, exact: true }));
    await page.getByRole('button', { name: W.newWorksheet, exact: true }).first().waitFor();
    await page.waitForTimeout(700);
  };
  const dismissHint = async () => {
    const hint = page.getByRole('button', { name: W.dismissHint });
    if (await hint.count()) await tap(hint.first());
  };

  // 1. The choice appears for Paper 1, defaults to Just this paper; never for a classroom sheet.
  const dialog = page.getByRole('dialog');
  await tap(page.getByRole('button', { name: W.newWorksheet, exact: true }).first());
  await tap(dialog.getByRole('radio', { name: W.classroom }));
  check((await dialog.getByRole('radio', { name: W.set }).count()) === 0, `${label} no Mock set choice on a classroom worksheet`);
  await tap(dialog.getByRole('radio', { name: W.paper1 }));
  const just = dialog.getByRole('radio', { name: W.just });
  const set = dialog.getByRole('radio', { name: W.set });
  check((await just.getAttribute('aria-checked')) === 'true', `${label} Just this paper is the default`);
  await dialog.getByLabel(W.name, { exact: true }).fill('S6 Mock Paper 1 2026-27');
  await set.scrollIntoViewIfNeeded();
  await tap(set);
  check((await set.getAttribute('aria-checked')) === 'true', `${label} Mock set can be chosen`);
  const preview = await dialog.locator('[data-mock-set-preview]').innerText();
  check(preview.includes('S6 Mock Paper 2 2026-27') && preview.includes('S6 Mock 2026-27'), `${label} the preview names the blank Paper 2 and the set`);
  const createBtn = page.getByRole('button', { name: W.createSet });
  check((await createBtn.count()) === 1, `${label} the button says Create mock set`);
  // Each choice stays inside the dialog (no horizontal overflow at this width).
  const box = await set.boundingBox();
  const panel = await dialog.boundingBox();
  check(!!box && !!panel && box.x >= panel.x - 1 && box.x + box.width <= panel.x + panel.width + 1, `${label} the Mock set choice fits the dialog`);
  await shot('form');
  await tap(createBtn);
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  await dismissHint();

  // 2. In the editor: the strip lists a blank Paper 2.
  const strip = page.locator('[data-paper-set-strip]');
  await strip.waitFor({ timeout: 20_000 });
  const blankChip = strip.getByRole('button', { name: W.openBlank('S6 Mock Paper 2 2026-27') });
  await blankChip.waitFor({ timeout: 10_000 }).catch(() => undefined);
  check((await blankChip.count()) === 1, `${label} the editor strip offers the blank Paper 2`);
  await shot('editor');

  // 3. Home: one frame, Paper 2 marked Blank; open it from its card.
  await goHome();
  const frames = page.locator('[data-paper-set]');
  check((await frames.count()) === 1, `${label} one set frame on the start screen`);
  const frameText = await frames.first().innerText();
  check(frameText.includes('S6 Mock Paper 1 2026-27') && frameText.includes('S6 Mock Paper 2 2026-27'), `${label} the frame holds both papers`);
  check(frameText.includes(W.blank), `${label} Paper 2 says Blank, not started`);
  await frames.first().scrollIntoViewIfNeeded();
  await shot('dashboard');
  await tap(frames.first().getByRole('button', { name: W.openTitle('S6 Mock Paper 2 2026-27') }).first());
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  await dismissHint();
  const current = await page.locator('[data-paper-set-strip] [aria-current="page"]').innerText();
  check(current.includes('Paper 2'), `${label} the blank Paper 2 opens (current: ${current.trim()})`);
  await goHome();

  // 4. Just this paper still makes one paper, in no set.
  await tap(page.getByRole('button', { name: W.newWorksheet, exact: true }).first());
  await tap(dialog.getByRole('radio', { name: W.paper1 }));
  await dialog.getByLabel(W.name, { exact: true }).fill('S5 Quiz Paper 1');
  await tap(page.getByRole('button', { name: W.create }));
  await page.locator('#print-root .paper').first().waitFor({ timeout: 30_000 });
  check((await page.locator('[data-paper-set-strip]').count()) === 0, `${label} Just this paper: no set strip`);
  await goHome();
  check((await page.locator('[data-paper-set]').count()) === 1, `${label} still one set; the single paper sits outside it`);
  await context.close();
}

await browser.close();
console.log(failures.length === 0 ? `\nall checks pass${zh ? ' (中)' : ''}` : `\n${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
