import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Prove in a real browser the Word-like follow-ups of k-0201, on
 * `test-fixtures/manual/word-typing-mix.json`, in English and 繁體中文 interfaces, at MacBook
 * (1512×950), iPad (820×1180) and iPhone (390×844) sizes:
 *
 *  - save: ⌘S and Ctrl+S save at once (before autosave would), the bar says "Saved" for a moment,
 *    and the browser's own "Save page as…" never runs, with a text open on the page or not;
 *
 *   node scripts/word-like-verify.mjs [--part=save] [--out=/tmp/word-like-verify] [--url=http://localhost:3000]
 *
 * Starts `npm run dev` itself when the URL is not serving. Needs Chrome (CHROME, default
 * /opt/google/chrome/chrome). Every key is a real input event.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/word-like-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const PARTS = opt('part', 'all').split(',');
const wants = (part) => PARTS.includes('all') || PARTS.includes(part);
mkdirSync(OUT, { recursive: true });

const fixtureText = readFileSync(new URL('../test-fixtures/manual/word-typing-mix.json', import.meta.url), 'utf8');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const document_ = JSON.parse(fixtureText);
const TITLE = 'Word typing mix';
const STEM_ID = document_.questions[0].blocks[0].id;

let devServer;
if (!(await fetch(URL_BASE).then((r) => r.ok).catch(() => false))) {
  console.log(`dev server not running at ${URL_BASE} — starting one`);
  devServer = spawn('npm', ['run', 'dev'], { stdio: 'ignore', detached: false });
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

const WORDS = {
  en: { saved: 'Saved' },
  'zh-HK': { saved: '已儲存' },
};
const SIZES = {
  mac: { width: 1512, height: 950 },
  ipad: { width: 820, height: 1180 },
  iphone: { width: 390, height: 844 },
};

const chromePath = process.env.CHROME ?? '/opt/google/chrome/chrome';
const browser = await chromium.launch({ channel: 'chrome', ...(chromePath ? { executablePath: chromePath } : {}) });

/** A fresh context with the fixture saved and the interface in `ui`, opened in the editor. */
async function openFixture(ui, size) {
  const context = await browser.newContext({ viewport: SIZES[size], hasTouch: size !== 'mac' });
  await context.addInitScript(
    ([version, language, indexJson, key, body]) => {
      if (!window.localStorage.getItem(key)) {
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(key, body);
      }
    },
    [
      APP_VERSION,
      ui,
      JSON.stringify([{ id: document_.id, title: TITLE, updatedAt: document_.updatedAt }]),
      `econ-worksheet:${document_.id}`,
      fixtureText,
    ],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL_BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(TITLE) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1500);
  return { context, page, errors };
}

const stored = (page) => page.evaluate((key) => window.localStorage.getItem(key) ?? '', `econ-worksheet:${document_.id}`);

async function verifySave(ui, size) {
  const tag = `${ui === 'en' ? 'en' : 'zh'}·${size}`;
  const w = WORDS[ui];
  const { context, page, errors } = await openFixture(ui, size);
  try {
    // Record whether anything let the browser have the key: a capture listener added after the
    // app's sees `defaultPrevented` as the app left it.
    await page.evaluate(() => {
      window.__saveKeys = [];
      window.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 's' && (e.metaKey || e.ctrlKey)) window.__saveKeys.push(e.defaultPrevented);
      }, true);
    });
    const status = page.locator('[data-save-state]');

    // On an iPhone the sidebar lies over the page (k-0197), so the text is typed where the page
    // shows; an iPhone rarely has a keyboard, so there the keys are proved with nothing open.
    const stemShows = await page.evaluate((key) => {
      const el = document.querySelector(`#print-root [data-field-key="${key}"][data-field-side="en"]`);
      const r = el?.getBoundingClientRect();
      return Boolean(r && el.contains(document.elementFromPoint(r.x + 4, r.y + r.height / 2)));
    }, `blockText:${STEM_ID}`);
    for (const chord of stemShows ? ['Control+s', 'Meta+s'] : []) {
      const marker = `Saved by ${chord} ${Math.random().toString(36).slice(2, 6)}`;
      // A text typed into the stem: one click, type, and save while the field is still open.
      const stem = page.locator(`#print-root [data-field-key="blockText:${STEM_ID}"][data-field-side="en"]`).first();
      const box = await stem.boundingBox();
      await page.mouse.click(box.x + 4, box.y + box.height / 2);
      await page.keyboard.type(`${marker} `, { delay: 0 });
      await page.keyboard.press(chord);
      await page.waitForTimeout(250);
      // 250 ms is well inside autosave's 1.2 s debounce: only the key can have written it.
      check(`[${tag}] ${chord} with a text open writes the paper at once`, (await stored(page)).includes(marker));
      const word = await status.innerText();
      const shown = await status.locator('span').nth(1).evaluate((el) => !el.classList.contains('sr-only'));
      check(`[${tag}] … and the bar says "${w.saved}"`, word.trim() === w.saved && shown, `${word} shown=${shown}`);
      const field = await page.evaluate(() => document.activeElement?.getAttribute('contenteditable'));
      check(`[${tag}] … and the text stays open`, field === 'true', String(field));
      await page.keyboard.press('Escape');
      await page.waitForTimeout(2300);
      const hidden = await status.locator('span').nth(1).evaluate((el) => el.classList.contains('sr-only'));
      check(`[${tag}] … then "${w.saved}" goes back to a quiet dot`, hidden);
    }

    // Nothing open: still Save now, and never the browser's.
    await page.keyboard.press('Control+s');
    await page.waitForTimeout(200);
    check(`[${tag}] Ctrl+S with nothing open says "${w.saved}" too`, (await status.innerText()).trim() === w.saved);
    const keys = await page.evaluate(() => window.__saveKeys);
    const presses = stemShows ? 3 : 1;
    check(`[${tag}] the browser never had ⌘S / Ctrl+S (${keys.length} presses)`, keys.length === presses && keys.every(Boolean), JSON.stringify(keys));
    await page.screenshot({ path: `${OUT}/save-${tag}.png` });
    check(`[${tag}] no page errors`, errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
  }
}

try {
  for (const ui of ['en', 'zh-HK']) {
    for (const size of Object.keys(SIZES)) {
      console.log(`\n— ${ui} · ${size}`);
      if (wants('save')) await verifySave(ui, size);
    }
  }
} finally {
  await browser.close();
  devServer?.kill();
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
