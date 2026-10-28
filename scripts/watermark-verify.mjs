import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';

/**
 * Prove the watermark (k-0242) in a real browser, in English and in 繁體中文, on
 * `test-fixtures/manual/page-flow-mix.json` (three sheets): the toolbar's button with nothing
 * saved opens Settings → Watermarks; a picture (`watermark-logo.svg`, a made-up crest) and a
 * line of text are saved and named there; one click puts the last used on every sheet; the
 * arrow picks the other; one page is turned off and on again beside it; Setup → Page's
 * strength slider; Undo / Redo one step each; a reload keeps the paper's and the library's
 * state; a second, new paper gets the saved watermark in one click without importing again;
 * print shows the pictures and hides the switches; and the `.docx` the real Export dialog
 * writes (English): the picture at the head of each sheet that has it when pages differ, in
 * the running header when every page has it.
 *
 *   node scripts/watermark-verify.mjs [--out=/tmp/watermark-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (set CHROME on Linux).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/watermark-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
mkdirSync(OUT, { recursive: true });

const LOGO = new URL('../test-fixtures/manual/watermark-logo.svg', import.meta.url).pathname;
const fixtureText = readFileSync(new URL('../test-fixtures/manual/page-flow-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Page flow mix';

let devServer;
if (!(await fetch(URL_BASE).then((r) => r.ok).catch(() => false))) {
  console.log(`dev server not running at ${URL_BASE} — starting one`);
  devServer = spawn('npm', ['run', 'dev'], { stdio: 'ignore' });
  const deadline = Date.now() + 60_000;
  let up = false;
  while (Date.now() < deadline && !up) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!up) {
    console.error('dev server did not come up within 60s');
    devServer.kill();
    process.exit(1);
  }
}

let failures = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const WORDS = {
  en: {
    button: 'Watermark',
    choose: 'Choose a watermark',
    settings: 'Watermarks',
    addText: 'Add text',
    textLabel: 'Watermark text',
    save: 'Save',
    name: 'Name',
    school: 'Example School',
    text: 'SAMPLE',
    lastUsed: 'Used by the one-click button',
    turnOff: 'Turn the watermark off on this page',
    turnOn: 'Turn the watermark on for this page',
    setup: /^Setup/,
    tabPage: /^Page/,
    strength: 'Strength',
    undo: /^Undo/,
    redo: /^Redo/,
    home: /Econ Studio/,
    newWorksheet: 'New worksheet',
    classroom: /^Classroom worksheet/,
    docName: 'Name',
    create: /Create worksheet/,
    exportButton: /Export…/,
  },
  'zh-HK': {
    button: '浮水印',
    choose: '選擇浮水印',
    settings: '浮水印',
    addText: '加入文字',
    textLabel: '浮水印文字',
    save: '儲存',
    name: '名稱',
    school: '示範學校',
    text: '樣本',
    lastUsed: '一按即用',
    turnOff: '在此頁關閉浮水印',
    turnOn: '在此頁開啟浮水印',
    setup: /^頁面設定/,
    tabPage: /^頁面/,
    strength: '深淺',
    undo: /^復原/,
    redo: /^重做/,
    home: /Econ Studio/,
    newWorksheet: '新增工作紙',
    classroom: /^課堂工作紙/,
    docName: '名稱',
    create: /建立工作紙/,
    exportButton: /匯出…/,
  },
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', ...(chromePath ? { executablePath: chromePath } : {}) });
try {
  for (const ui of ['en', 'zh-HK']) {
    const w = WORDS[ui];
    const tag = ui === 'en' ? 'en' : 'zh';
    console.log(`\n— interface: ${ui}`);
    const context = await browser.newContext({ viewport: { width: 1512, height: 1000 }, acceptDownloads: true, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([version, language, indexJson, key, body]) => {
        if (!window.localStorage.getItem(key)) {
          window.localStorage.setItem('econ-worksheet-last-seen-version', version);
          window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
          window.localStorage.setItem('econ-worksheet-index', indexJson);
          window.localStorage.setItem(key, body);
        }
        delete window.showSaveFilePicker;
      },
      [APP_VERSION, ui, JSON.stringify([{ id: document_.id, title: TITLE, updatedAt: document_.updatedAt }]), `econ-worksheet:${document_.id}`, fixtureText],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    const settle = () => page.waitForTimeout(1300);
    const openPaper = async (title = TITLE) => {
      await page.getByRole('button', { name: new RegExp(title) }).first().click();
      await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
      await page.waitForTimeout(2500);
    };
    await openPaper();

    const toolbar = page.getByTestId('watermark-button');
    const mainButton = toolbar.getByRole('button', { name: w.button, exact: true });
    /** Per sheet: the watermark picture's src prefix and opacity, or null. */
    const marks = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#print-root .paper')].map((sheet) => {
          const img = sheet.querySelector('[data-watermark] img');
          const src = img?.getAttribute('src') ?? '';
          return img ? { src: `${src.length}:${src.slice(-24)}`, opacity: Number(img.style.opacity) } : null;
        }),
      );
    const onOff = async () => (await marks()).map(Boolean);
    const switches = () =>
      page.evaluate(() => [...document.querySelectorAll('#print-root [data-watermark-toggle]')].map((b) => b.getAttribute('data-watermark-toggle')));

    // A. Nothing saved yet: the button opens Settings → Watermarks.
    check(`[${tag}] a saved paper opens with no watermark and no page switches`, same(await onOff(), [false, false, false]) && (await switches()).length === 0);
    await mainButton.click();
    const settings = page.getByRole('dialog');
    await settings.waitFor();
    // The pane loads on demand (React.lazy): wait for it rather than count at once.
    const pane = await settings.getByTestId('watermarks-section').waitFor({ timeout: 15_000 }).then(() => true, () => false);
    check(`[${tag}] with nothing saved, the button opens Settings at Watermarks`, pane);

    // B. Save a picture and a line of text, and name the picture.
    await settings.getByTestId('watermark-file').setInputFiles(LOGO);
    await settings.getByTestId('watermark-entry').first().waitFor();
    const nameBox = settings.getByTestId('watermark-entry').first().getByLabel(w.name, { exact: true });
    await nameBox.fill(w.school);
    await nameBox.press('Enter');
    await settings.getByRole('button', { name: w.addText }).click();
    await settings.getByLabel(w.textLabel, { exact: true }).fill(w.text);
    await settings.getByRole('button', { name: w.save, exact: true }).click();
    await page.waitForTimeout(500);
    const entries = await settings.getByTestId('watermark-entry').evaluateAll((cards) =>
      cards.map((card) => ({ name: card.querySelector('input').value, text: card.textContent })),
    );
    check(`[${tag}] two saved, the newest first`, same(entries.map((e) => e.name), [w.text, w.school]), JSON.stringify(entries));
    check(`[${tag}] … the newest is the one-click button's`, entries[0].text.includes(w.lastUsed));
    await page.screenshot({ path: `${OUT}/${tag}-settings.png` });
    await page.keyboard.press('Escape');
    await settings.waitFor({ state: 'detached' });

    // C. One click: the last used on every sheet. Undo / Redo one step each.
    await mainButton.click();
    await settle();
    const textOn = await marks();
    check(`[${tag}] one click puts the watermark on every sheet`, same(textOn.map(Boolean), [true, true, true]), JSON.stringify(textOn));
    check(`[${tag}] … faint by default (15%)`, textOn.every((m) => m && Math.abs(m.opacity - 0.15) < 1e-6));
    check(`[${tag}] … and each sheet has its switch, on`, same(await switches(), ['on', 'on', 'on']));
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] Undo takes it off in one step`, same(await onOff(), [false, false, false]));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();
    check(`[${tag}] Redo puts it back`, same(await onOff(), [true, true, true]));

    // D. The arrow picks the other saved one.
    await toolbar.getByRole('button', { name: w.choose }).click();
    await page.screenshot({ path: `${OUT}/${tag}-menu.png` });
    await page.getByRole('menuitem', { name: w.school }).click();
    await settle();
    const logoOn = await marks();
    check(`[${tag}] the menu swaps the picture on every sheet`, logoOn.every((m) => m && m.src !== textOn[0].src), JSON.stringify(logoOn));
    await page.screenshot({ path: `${OUT}/${tag}-on.png` });

    // E. Page 2 off beside the page, then on again.
    await page.locator('[data-page-index="1"] [data-watermark-toggle]').scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: w.turnOff }).nth(1).click();
    await settle();
    check(`[${tag}] page 2's switch takes it off that page only`, same(await onOff(), [true, false, true]), JSON.stringify(await onOff()));
    check(`[${tag}] … and the switch says so`, same(await switches(), ['on', 'off', 'on']));
    await page.screenshot({ path: `${OUT}/${tag}-page2-off.png` });
    await page.getByRole('button', { name: w.undo }).first().click();
    await settle();
    check(`[${tag}] Undo puts page 2's back`, same(await onOff(), [true, true, true]));
    await page.getByRole('button', { name: w.redo }).first().click();
    await settle();

    // F. Setup → Page: the strength slider.
    await page.getByRole('button', { name: w.setup }).first().click();
    const setup = page.getByRole('dialog');
    await setup.waitFor();
    await setup.getByRole('tab', { name: w.tabPage }).click();
    const field = setup.getByTestId('watermark-field');
    await field.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${tag}-setup.png` });
    const slider = field.getByLabel(w.strength);
    await slider.focus();
    for (let i = 0; i < 3; i += 1) await slider.press('ArrowRight');
    await page.keyboard.press('Escape');
    await setup.waitFor({ state: 'detached' });
    await settle();
    const stronger = await marks();
    check(`[${tag}] the strength slider darkens it (15% → 30%)`, stronger.filter(Boolean).every((m) => Math.abs(m.opacity - 0.3) < 1e-6), JSON.stringify(stronger));

    // G. Print: the pictures print, the switches do not.
    await page.emulateMedia({ media: 'print' });
    const printed = await page.evaluate(() => ({
      pictures: [...document.querySelectorAll('#print-root [data-watermark] img')].filter((img) => img.getBoundingClientRect().width > 0).length,
      switches: [...document.querySelectorAll('#print-root [data-watermark-toggle]')].filter((b) => b.getBoundingClientRect().width > 0).length,
    }));
    await page.emulateMedia({ media: 'screen' });
    check(`[${tag}] in print the two pictures show and no switch does`, printed.pictures === 2 && printed.switches === 0, JSON.stringify(printed));

    // H. The .docx (English).
    if (ui === 'en') {
      const exportDocx = async (name) => {
        await page.getByRole('button', { name: w.exportButton }).first().click();
        const exporter = page.getByRole('dialog');
        await exporter.getByText('.docx', { exact: true }).click();
        await exporter.getByRole('radiogroup', { name: 'Language' }).getByTitle('English only', { exact: true }).click();
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout: 60_000 }),
          exporter.getByRole('button', { name: /^Export \.docx/ }).click(),
        ]);
        await download.saveAs(`${OUT}/${name}.docx`);
        const zip = await JSZip.loadAsync(readFileSync(await download.path()));
        await exporter.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => page.keyboard.press('Escape'));
        return zip;
      };
      const count = (xml) => (xml.match(/name="Watermark \d+"\/><wp:cNvGraphicFramePr>/g) ?? []).length;
      const zip = await exportDocx('watermark-page2-off-en');
      const xml = await zip.file('word/document.xml').async('string');
      const header = (await zip.file('word/header1.xml')?.async('string')) ?? '';
      const breaks = [...xml.matchAll(/w:br w:type="page"/g)].map((m) => m.index);
      const at = [...xml.matchAll(/name="Watermark \d+"\/><wp:cNvGraphicFramePr>/g)].map((m) => m.index);
      check(`[en] page 2 off: the .docx anchors two pictures in the body, none in the header`, count(xml) === 2 && count(header) === 0, `${count(xml)} / ${count(header)}`);
      check(`[en] … one on sheet 1, one on sheet 3 (after the second page break)`, breaks.length === 2 && at[0] < breaks[0] && at[1] > breaks[1], JSON.stringify({ at, breaks }));
      check(`[en] … behind the text, its 30% drawn into the picture (no Word-only transparency)`, xml.includes('behindDoc="1"') && !xml.includes('alphaModFix'));

      await page.getByRole('button', { name: w.turnOn }).first().click();
      await settle();
      const every = await exportDocx('watermark-every-page-en');
      const everyXml = await every.file('word/document.xml').async('string');
      const everyHeader = await every.file('word/header1.xml').async('string');
      const rels = await every.file('word/_rels/header1.xml.rels')?.async('string');
      check(`[en] every page on: one picture in the running header, none in the body`, count(everyHeader) === 1 && count(everyXml) === 0);
      check(`[en] … with the header's own image relationship`, Boolean(rels && /Target="media\/image\d+\.png"/.test(rels)), rels ?? 'no rels');
      await page.getByRole('button', { name: w.turnOff }).nth(1).click();
      await settle();
    }

    // I. Saved with the paper; the library survives a reload.
    await page.waitForTimeout(1500);
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper();
    check(`[${tag}] after a reload: on, off, on`, same(await onOff(), [true, false, true]), JSON.stringify(await onOff()));

    // J. A new paper: one click, no importing again.
    await page.getByRole('link', { name: w.home }).or(page.getByRole('button', { name: w.home })).first().click();
    await page.waitForTimeout(1500);
    await page.getByRole('button', { name: w.newWorksheet, exact: true }).click();
    const form = page.getByRole('dialog');
    await form.getByRole('radio', { name: w.classroom }).click();
    await form.getByLabel(w.docName, { exact: true }).fill('Second paper');
    await page.getByRole('button', { name: w.create }).click();
    await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
    await settle();
    check(`[${tag}] a new paper starts without a watermark`, (await onOff()).every((on) => !on));
    await mainButton.click();
    await settle();
    const second = await marks();
    check(`[${tag}] … and one click gives it the last used (the school's), no import`, second.length > 0 && second.every((m) => m && m.src === logoOn[0].src), JSON.stringify(second));
    await page.screenshot({ path: `${OUT}/${tag}-second-paper.png` });

    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
  console.log(failures === 0 ? `\nall checks passed; shots in ${OUT}` : `\n${failures} check(s) FAILED`);
} finally {
  await browser.close();
  devServer?.kill();
}
process.exit(failures === 0 ? 0 : 1);
