import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * The AI translation browser run (design §I.4). Serves the built `out/` (not `npm run dev`:
 * `predev` rewrites the changelog), points the Custom provider at the canned mock, seeds
 * storage the way cover-verify does, then drives Chromium and WebKit. Screenshots and a
 * pass/fail line per check land in --out.
 *
 *   npm run build && node scripts/ai-verify.mjs [--out=/tmp/ai-verify]
 *        [--engines=chromium,webkit] [--phase=entry|full] [--port=8787] [--app-port=3417]
 *
 * `--phase=entry` checks what exists before the Translate dialog and Settings pane are
 * merged (entry points, the Setup rename, nothing sent) and only records a missing
 * producer's control; `full` (the default) fails on it, and also runs the journey, the
 * mock's edge cases (chips, conflict, failed row, bisect, Stop, discard) and the error
 * and no-provider states.
 *
 * The request counter is the privacy check: nothing may reach a provider before an
 * explicit Translate, Fill or Save & test click.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/ai-verify');
const ENGINES = opt('engines', 'chromium,webkit').split(',');
const PHASE = opt('phase', 'full');
const MOCK_PORT = Number(opt('port', '8787'));
const APP_PORT = Number(opt('app-port', '3417'));
const MOCK_BASE = `http://localhost:${MOCK_PORT}/v1`;
const APP = `http://localhost:${APP_PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Real provider hosts: stubbed, and every hit is a failure (the mock is the only provider). */
const PROVIDER_HOSTS = [
  'generativelanguage.googleapis.com',
  'api.deepseek.com',
  'dashscope.aliyuncs.com',
  'dashscope-intl.aliyuncs.com',
  'openrouter.ai',
  'api.openai.com',
  'api.anthropic.com',
];

mkdirSync(OUT, { recursive: true });
if (!existsSync(join(ROOT, 'out/index.html'))) {
  console.error('out/ is missing: run `npm run build` first.');
  process.exit(1);
}

// ---- servers ----

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

/** `out/` as Vercel serves it: `/x` falls back to `x.html`, then `x/index.html`. */
function startStaticServer(port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, APP).pathname);
    const base = join(ROOT, 'out', path);
    const file = [base, `${base}.html`, join(base, 'index.html')].find(
      (p) => p.startsWith(join(ROOT, 'out')) && existsSync(p) && statSync(p).isFile(),
    );
    if (!file) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ---- fixtures (copies of the frozen corpus; the corpus file itself is only read) ----

const corpus = JSON.parse(readFileSync(join(ROOT, 'src/test/corpus/v1-published.json'), 'utf8'));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

/** Every BiText's `zh` emptied: the English-only mock of §A.1. */
function englishOnly(node) {
  if (Array.isArray(node)) return node.map(englishOnly);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = englishOnly(v);
  if (Array.isArray(node.en) && Array.isArray(node.zh)) out.zh = [];
  return out;
}

/** The object with this `id` (a block or a part), wherever it sits. */
function byId(node, id) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.id === id) return node;
  for (const v of Object.values(node)) {
    const hit = byId(v, id);
    if (hit) return hit;
  }
  return undefined;
}

/** English-only, with the mock's canned sources (ai-mock-server PHRASES), a stem with a
 *  blank, and two '(long)' items in one question: every §I.4 item 3 review state. */
function edgeFixture() {
  const doc = englishOnly(corpus);
  const en = (id, runs) => (byId(doc, id).text.en = typeof runs === 'string' ? [{ text: runs }] : runs);
  en('id006', 'Explain why the demand curve slopes downward.');
  en('id008', 'Supply falls, so the price rises.'); // → 供給: the deny auto-fix chip
  en('id010', 'State one reason why elastic demand lowers total revenue.'); // → 低彈性需求: conflict
  en('id012', [{ text: 'Price falls by ' }, { text: ' '.repeat(12), underline: true }, { text: '.' }]); // blank dropped
  en('id019', 'Define tax incidence. (long)'); // with the next: finish_reason length, bisect
  en('id021', 'Explain the effect on the money supply. (long)');
  byId(doc, 'id013').diagram.y.title.en = [{ text: 'Price ($)' }];
  return doc;
}

const FIXTURES = {
  english: { ...englishOnly(corpus), id: 'ai-verify-english', title: { en: [{ text: 'AI verify English only' }], zh: [] } },
  // The corpus as shipped: its 定義稅項歸宿 is the variant Check terms offers 稅收承擔 for.
  terms: { ...structuredClone(corpus), id: 'ai-verify-terms', title: { en: [{ text: 'AI verify terms' }], zh: [] } },
  edge: { ...edgeFixture(), id: 'ai-verify-edge', title: { en: [{ text: 'AI verify edge cases' }], zh: [] } },
  // A newer build's file opens read-only: no Translate entry point may show.
  newer: { ...englishOnly(corpus), id: 'ai-verify-newer', schemaVersion: 2, title: { en: [{ text: 'AI verify newer build' }], zh: [] } },
};
const TITLES = Object.fromEntries(Object.entries(FIXTURES).map(([k, doc]) => [k, doc.title.en[0].text]));

// ---- the run ----

const results = [];
/** One line per check; a failure never ends the run, so one screenshot set shows everything. */
async function check(engine, name, fn) {
  try {
    const detail = await fn();
    results.push({ engine, name, ok: true, detail });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ engine, name, ok: false, detail: e.message.split('\n')[0] });
    console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
/** A control another package provides: `--phase=entry` records its absence, `full` fails. */
const need = (present, shown, missing) => {
  if (present) return shown;
  expect(PHASE !== 'full', missing);
  return `${missing} (entry phase)`;
};

/** Storage as a returning teacher has it: documents, What's new seen, Custom → the mock.
 *  `route` picks the mock's behaviour ('/region', '/401', '/slow'); `secret: false` leaves
 *  no provider configured. */
async function newContext(browser, viewport = { width: 1440, height: 900 }, { route = '', secret = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const index = Object.entries(FIXTURES).map(([k, doc]) => ({
    id: doc.id,
    title: TITLES[k],
    updatedAt: doc.updatedAt,
  }));
  const settings = {
    v: 1,
    provider: 'custom',
    models: { custom: MOCK_MODEL },
    baseUrls: { custom: MOCK_BASE.replace('/v1', `${route}/v1`) },
  };
  await context.addInitScript(
    ([indexJson, docs, version, settingsJson, withSecret]) => {
      localStorage.setItem('econ-worksheet-index', indexJson);
      for (const [id, doc] of docs) localStorage.setItem(`econ-worksheet:${id}`, doc);
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      localStorage.setItem('econgen.settings.ai', settingsJson);
      if (withSecret) sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
    },
    [
      JSON.stringify(index),
      Object.values(FIXTURES).map((doc) => [doc.id, JSON.stringify(doc)]),
      VERSION,
      JSON.stringify(settings),
      secret,
    ],
  );
  // Real providers are never reached: stub them, and count every attempt.
  const leaks = [];
  await context.route(
    (url) => PROVIDER_HOSTS.includes(url.hostname),
    (route) => {
      leaks.push(route.request().url());
      return route.fulfill({ status: 599, body: 'blocked by ai-verify' });
    },
  );
  return { context, leaks };
}

const mockCount = async () => (await (await fetch(`http://localhost:${MOCK_PORT}/__count`)).json()).count;
const mockReset = () => fetch(`http://localhost:${MOCK_PORT}/__reset`, { method: 'POST' });

async function openDocument(page, key) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(TITLES[key]) }).first().click();
  await page.waitForSelector('.paper', { timeout: 15_000 });
  await page.waitForTimeout(600);
}

async function setLanguage(page, label) {
  await page.getByRole('radio', { name: label, exact: true }).first().click();
  await page.waitForTimeout(300);
}

const META = process.platform === 'darwin' ? 'Meta' : 'Control';
const SETUP_TITLE = 'Title, paper, margins, header and footer';
/** PageSetupIcon's outline path (a gear would mean the §G.1 rename regressed). */
const PAGE_SETUP_PATH = 'M6 2.5h8.5L19 7v14.5H6z';

/** Whether ⌘, opened Settings (closed again after). Headless, the browser never claims it. */
async function pressSettingsShortcut(page) {
  await page.keyboard.press(`${META}+Comma`);
  await page.waitForTimeout(400);
  const open = (await page.getByRole('dialog', { name: /Settings/ }).count()) > 0;
  if (open) await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return open;
}
const shortcutOpens = async (page) => need(await pressSettingsShortcut(page), 'opened Settings', 'nothing opened');

/** The toolbar's Setup button: the one in the top bar (the Outline's shares its title and icon). */
async function toolbarSetup(page) {
  const all = page.locator(`button[title="${SETUP_TITLE}"]`);
  for (let i = 0; i < (await all.count()); i += 1) {
    const box = await all.nth(i).boundingBox();
    if (box && box.y < 100) return { button: all.nth(i), box };
  }
  throw new Error('no Setup button in the top bar');
}

/** §I.4 items 2, 5, 7 (entry half), 8, 9 and the counter: everything that works before
 *  the Translate dialog and the Settings pane are merged. */
async function entryChecks(engine, browser) {
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });
  const { context, leaks } = await newContext(browser);
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  await mockReset();

  await page.goto(APP, { waitUntil: 'networkidle' });
  await shot(page, '01-start');
  await check(engine, 'start screen Settings link', async () => {
    const n = await page.getByRole('button', { name: 'Settings', exact: true }).count();
    return need(n > 0, 'shown', 'hidden (no Settings sections registered)');
  });
  await check(engine, '⌘, on the start screen', () => shortcutOpens(page));

  await openDocument(page, 'english');
  await check(engine, 'first "Setup" button is the toolbar\'s', async () => {
    const first = page.getByRole('button', { name: 'Setup', exact: true }).first();
    const { box } = await toolbarSetup(page);
    const firstBox = await first.boundingBox();
    expect(firstBox && firstBox.x === box.x && firstBox.y === box.y, 'first Setup button is not the toolbar one');
    expect((await first.locator(`path[d="${PAGE_SETUP_PATH}"]`).count()) === 1, 'Setup icon is not PageSetupIcon');
  });

  await setLanguage(page, 'EN+中');
  await check(engine, 'pill is a button in EN+中 mode', async () => {
    await page.getByRole('button', { name: /\d+ untranslated/ }).waitFor({ timeout: 3000 });
  });
  await setLanguage(page, '中文');
  // Needs the mode-aware count (§B.8): before P-TEXT the pill shows in EN+中 only.
  await check(engine, 'pill is a button in 中文 mode', async () => {
    const pill = page.getByRole('button', { name: /\d+ untranslated/ });
    await pill.waitFor({ timeout: 3000 });
    expect((await pill.getAttribute('title'))?.startsWith('Fill the missing language'), 'pill title missing');
    return await pill.innerText();
  });
  await shot(page, '02-toolbar-pill-zh');

  await check(engine, '⋯ menu Translate / Check terms / Settings', async () => {
    await page.getByRole('button', { name: 'File and export options' }).click();
    await page.getByRole('menuitem', { name: 'Copy for Word' }).waitFor();
    await page.waitForTimeout(250);
    const has = async (name) => (await page.getByRole('menuitem', { name, exact: true }).count()) > 0;
    const found = { translate: await has('Translate…'), check: await has('Check terms…'), settings: await has('Settings…') };
    await shot(page, '03-toolbar-menu');
    await page.keyboard.press('Escape');
    expect(found.translate && found.check, `missing: ${JSON.stringify(found)}`);
    return need(found.settings, 'Settings… shown', 'Settings… hidden (no sections yet)');
  });

  await check(engine, 'page menu Translation group', async () => {
    await page.locator('#print-root [data-flow-id]').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    await shot(page, '04-page-menu');
    // The English-only paper: every printed text offers Fill 中文.
    const fill = await page.getByRole('menuitem', { name: 'Fill 中文', exact: true }).count();
    await page.keyboard.press('Escape');
    return need(fill > 0, 'Fill 中文 shown', 'no Fill 中文 (slotsForTarget not merged yet)');
  });

  await check(engine, 'Outline row Translate question…', async () => {
    await page.getByRole('button', { name: /^Actions for question/ }).first().click();
    const n = await page.getByRole('menuitem', { name: 'Translate question…', exact: true }).count();
    await shot(page, '05-outline-menu');
    await page.keyboard.press('Escape');
    expect(n === 1, 'no Translate question… item');
  });

  await check(engine, 'multi-select pill Translate', async () => {
    await page.locator('#print-root').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press(`${META}+KeyA`);
    const button = page.getByRole('button', { name: 'Translate', exact: true });
    await button.waitFor({ timeout: 3000 });
    await button.scrollIntoViewIfNeeded();
    await shot(page, '06-multiselect-pill');
    const box = await button.boundingBox();
    await page.keyboard.press('Escape');
    return `at ${Math.round(box?.x ?? -1)},${Math.round(box?.y ?? -1)}`;
  });

  await check(engine, 'Export paper check links (800 px high)', async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.waitForTimeout(800);
    const translate = await page.getByRole('button', { name: 'Translate…', exact: true }).count();
    const review = await page.getByRole('button', { name: 'Review terms…', exact: true }).count();
    await shot(page, '07-export-paper-check');
    await page.keyboard.press('Escape');
    expect(translate === 1, 'no Translate… link on the untranslated finding');
    expect(review === 0, 'Review terms… on a paper with no Chinese');
  });

  await check(engine, 'toolbar Setup shows the page-setup icon below md', async () => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.waitForTimeout(300);
    const { button } = await toolbarSetup(page);
    expect((await button.locator(`path[d="${PAGE_SETUP_PATH}"]`).count()) === 1, 'no page-setup icon');
    expect((await button.locator('circle[r="3"]').count()) === 0, 'a gear on the toolbar Setup');
    await shot(page, '08-narrow-setup');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await check(engine, '⌘, in the editor', () => shortcutOpens(page));
  await check(engine, '⌘, while a dialog is open does not open Settings', async () => {
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.waitForTimeout(500);
    const opened = await pressSettingsShortcut(page);
    const exportOpen = await page.getByRole('dialog').count();
    if (exportOpen) await page.keyboard.press('Escape');
    expect(!opened, 'Settings opened over Export');
  });
  await check(engine, '⌘, while typing does not open Settings', async () => {
    // Renaming the document: a text field outside any dialog.
    await page.getByTitle(/click to rename$/).first().click();
    await page.getByRole('textbox', { name: 'Document name' }).waitFor({ timeout: 3000 });
    const typing = await page.evaluate(() => {
      const el = document.activeElement;
      return !!el && (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    });
    expect(typing, 'no text field took focus');
    const opened = await pressSettingsShortcut(page);
    await page.keyboard.press('Escape');
    expect(!opened, 'Settings opened while typing');
  });
  await check(engine, 'nothing sent without a click', async () => {
    const sent = await mockCount();
    expect(sent === 0 && leaks.length === 0, `mock saw ${sent}, providers saw ${leaks.length}`);
  });

  // A newer build's document: read-only, so every Translate entry point is gone.
  await openDocument(page, 'newer');
  await setLanguage(page, 'EN+中');
  await check(engine, 'read-only: no Translate entry point', async () => {
    // The count still shows, as a plain pill rather than a button.
    await page.getByText(/^\d+ untranslated$/).first().waitFor({ timeout: 3000 });
    const pill = await page.getByRole('button', { name: /\d+ untranslated/ }).count();
    await page.getByRole('button', { name: 'File and export options' }).click();
    const item = await page.getByRole('menuitem', { name: 'Translate…', exact: true }).count();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.waitForTimeout(800);
    const link = await page.getByRole('button', { name: 'Translate…', exact: true }).count();
    await shot(page, '09-readonly-export');
    await page.keyboard.press('Escape');
    expect(pill + item + link === 0, `pill ${pill}, menu ${item}, export link ${link}`);
  });
  await context.close();
}

/** §I.4 items 3–5 and 7 against the mock: the journey after integration. Locators follow
 *  the §A.3 copy; a missing control fails its check and the run continues. */
async function journeyChecks(engine, browser) {
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });
  const { context, leaks } = await newContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  await mockReset();
  await openDocument(page, 'english');
  await setLanguage(page, '中文');
  const dialog = page.getByRole('dialog');

  await check(engine, 'pill opens Translate setup; nothing sent yet', async () => {
    await page.getByRole('button', { name: /\d+ untranslated/ }).click();
    await dialog.getByRole('button', { name: /^Translate \d+$/ }).waitFor({ timeout: 5000 });
    await shot(page, '10-translate-setup');
    expect((await mockCount()) === 0, 'a request left before the Translate click');
  });

  await check(engine, 'Translate → review', async () => {
    await dialog.getByRole('button', { name: /^Translate \d+$/ }).click();
    await dialog.getByRole('button', { name: /^Insert \d+$/ }).waitFor({ timeout: 30_000 });
    await shot(page, '11-translate-review');
    return `${await mockCount()} request(s)`;
  });

  await check(engine, 'Insert → flash → print has no chrome → one ⌘Z undoes it', async () => {
    const before = await page.locator('#print-root').innerText();
    await dialog.getByRole('button', { name: /^Insert \d+$/ }).click();
    await page.getByText(/^Filled \d+ text/).waitFor({ timeout: 5000 });
    await shot(page, '12-inserted-zh');
    const after = await page.locator('#print-root').innerText();
    expect(after !== before, 'the page did not change');
    // §I.4 item 7, on the inserted page.
    await page.emulateMedia({ media: 'print' });
    const chrome = await page.locator('#print-root button:visible').count();
    await shot(page, '13-inserted-print');
    await page.emulateMedia({ media: 'screen' });
    expect(chrome === 0, `${chrome} visible button(s) inside #print-root`);
    await setLanguage(page, 'EN+中');
    await shot(page, '14-inserted-bilingual');
    await setLanguage(page, '中文');
    await page.locator('#print-root').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press(`${META}+KeyZ`);
    await page.waitForTimeout(500);
    expect((await page.locator('#print-root').innerText()) === before, 'one Undo did not restore the page');
    await shot(page, '15-undone');
  });

  await check(engine, 'page menu Fill 中文 lands on review', async () => {
    await mockReset();
    await page.locator('#print-root [data-flow-id]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Fill 中文$/ }).first().click();
    await dialog.getByRole('button', { name: /^Insert \d+$/ }).waitFor({ timeout: 30_000 });
    expect((await mockCount()) > 0, 'Fill sent nothing');
    await shot(page, '16-fill-review');
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click({ timeout: 3000 });
  });

  await check(engine, 'Check terms on a corpus copy offers 稅收承擔, unticked', async () => {
    await mockReset();
    await openDocument(page, 'terms');
    await page.getByRole('button', { name: 'File and export options' }).click();
    await page.getByRole('menuitem', { name: 'Check terms…', exact: true }).click();
    await dialog.getByText('稅收承擔').first().waitFor({ timeout: 5000 });
    // 稅項歸宿 is a textbook variant: offered, never pre-ticked.
    const row = dialog.locator('li, [role="row"], label').filter({ hasText: '定義稅項歸宿' }).last();
    const box = row.getByRole('checkbox');
    expect((await box.count()) === 1 && !(await box.isChecked()), 'the variant fix is ticked or has no checkbox');
    await shot(page, '17-check-terms');
    await page.keyboard.press('Escape');
    expect((await mockCount()) === 0, 'Check terms sent a request');
  });

  await check(engine, 'Export paper check on the corpus copy links Review terms…', async () => {
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.getByRole('button', { name: 'Review terms…', exact: true }).waitFor({ timeout: 5000 });
    await shot(page, '18-export-review-terms');
    await page.keyboard.press('Escape');
  });

  await check(engine, 'no real provider reached', async () => {
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
  });
  await context.close();
}

/** A review row: the smallest container holding this text. Locators follow §A.3. */
const rowOf = (dialog, text) => dialog.locator('li, [role="row"], label').filter({ hasText: text }).last();

/** Opens the edge paper in 中文 and starts Translate from the pill. */
async function startEdgeRun(page, dialog) {
  await openDocument(page, 'edge');
  await setLanguage(page, '中文');
  await page.getByRole('button', { name: /\d+ untranslated/ }).click();
  await dialog.getByRole('button', { name: /^Translate \d+$/ }).click();
}

/** §I.4 item 3: every review state the mock's canned sources produce, the discard
 *  confirmation, and (on the slow mock) the scrim question and Stop. */
async function edgeChecks(engine, browser) {
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });
  const { context, leaks } = await newContext(browser, { width: 1280, height: 800 });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  const dialog = page.getByRole('dialog');
  await mockReset();

  await check(engine, 'review: auto-fix chip, conflict unticked, failed row, bisect', async () => {
    await startEdgeRun(page, dialog);
    await dialog.getByRole('button', { name: /^Insert \d+$/ }).waitFor({ timeout: 30_000 });
    const requests = await mockCount();
    await shot(page, '20-edge-review');
    expect((await dialog.getByText(/Term fixed: 供給 → 供應/).count()) > 0, 'no Term fixed chip for 供給');
    const conflict = rowOf(dialog, '低彈性需求').getByRole('checkbox');
    expect((await conflict.count()) === 1 && !(await conflict.isChecked()), 'the conflict row is ticked');
    expect((await rowOf(dialog, 'Price falls by').getByRole('checkbox').count()) === 0, 'the failed row has a checkbox');
    // The two '(long)' items truncate together, then go one at a time.
    expect(requests >= 3, `${requests} request(s): no bisect`);
    return `${requests} requests`;
  });

  await check(engine, 'closing review asks before discarding', async () => {
    const before = await mockCount();
    await page.keyboard.press('Escape');
    await dialog.getByText(/Discard \d+ translations\?/).waitFor({ timeout: 3000 });
    await shot(page, '21-discard-confirm');
    await dialog.getByRole('button', { name: 'Keep reviewing' }).click();
    expect((await dialog.getByRole('button', { name: /^Insert \d+$/ }).count()) === 1, 'the review was lost');
    await page.keyboard.press('Escape');
    await dialog.getByRole('button', { name: 'Discard', exact: true }).click();
    expect((await mockCount()) === before, 'closing sent a request');
  });
  await check(engine, 'edge run reached no real provider', async () => {
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
  });
  await context.close();

  const slow = await newContext(browser, { width: 1280, height: 800 }, { route: '/slow' });
  const slowPage = await slow.context.newPage();
  const slowDialog = slowPage.getByRole('dialog');
  await mockReset();
  await check(engine, 'running: a scrim click asks, Stop ends the run', async () => {
    await startEdgeRun(slowPage, slowDialog);
    await slowDialog.getByRole('button', { name: 'Stop', exact: true }).waitFor({ timeout: 5000 });
    await slowPage.mouse.click(4, 796);
    await slowDialog.getByText(/Stop translating\?/).waitFor({ timeout: 3000 });
    await shot(slowPage, '22-running-scrim');
    expect((await mockCount()) > 0, 'no request in flight');
    await slowDialog.getByRole('button', { name: 'Keep going' }).click();
    await slowDialog.getByRole('button', { name: 'Stop', exact: true }).click();
    // No finished chunk → back to Setup; some → Review with "Stopped".
    await slowDialog.getByRole('button', { name: /^(Translate|Insert) \d+$/ }).waitFor({ timeout: 5000 });
    await shot(slowPage, '23-stopped');
    return (await slowDialog.getByText(/^Stopped/).count()) ? 'Stopped review' : 'back to Setup';
  });
  await slow.context.close();
}

/** §I.4 item 3: the error panel for a region refusal and a bad key, and the no-provider
 *  state; nothing is sent without a provider. */
async function errorChecks(engine, browser) {
  const shot = (page, name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });
  const cases = [
    ['/region', 'region error panel offers Use DeepSeek', /doesn.t serve your location/],
    ['/401', 'bad-key error panel', /key/i],
  ];
  for (const [route, name, text] of cases) {
    const { context } = await newContext(browser, { width: 1280, height: 800 }, { route });
    const page = await context.newPage();
    const dialog = page.getByRole('dialog');
    await mockReset();
    await check(engine, name, async () => {
      await openDocument(page, 'english');
      await setLanguage(page, '中文');
      await page.getByRole('button', { name: /\d+ untranslated/ }).click();
      await dialog.getByRole('button', { name: /^Translate \d+$/ }).click();
      await dialog.getByText(text).first().waitFor({ timeout: 10_000 });
      await shot(page, `24-error${route.replace('/', '-')}`);
      if (route === '/region') {
        expect((await dialog.getByRole('button', { name: 'Use DeepSeek' }).count()) === 1, 'no Use DeepSeek');
      }
      expect((await mockCount()) === 1, `${await mockCount()} requests after a fatal error`);
    });
    await context.close();
  }

  const { context } = await newContext(browser, { width: 1280, height: 800 }, { secret: false });
  const page = await context.newPage();
  await mockReset();
  await check(engine, 'no provider: three setup buttons, nothing sent', async () => {
    await openDocument(page, 'english');
    await setLanguage(page, '中文');
    await page.getByRole('button', { name: /\d+ untranslated/ }).click();
    const dialog = page.getByRole('dialog');
    for (const provider of ['Gemini', 'DeepSeek', 'Qwen']) {
      await dialog.getByRole('button', { name: `Set up ${provider}` }).waitFor({ timeout: 5000 });
    }
    await shot(page, '25-no-provider');
    expect((await mockCount()) === 0, 'a request left without a provider');
  });
  await context.close();
}

const mock = await startMockServer(MOCK_PORT);
const app = await startStaticServer(APP_PORT);
try {
  for (const engine of ENGINES) {
    const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
    console.log(`${engine}:`);
    try {
      await entryChecks(engine, browser);
      if (PHASE === 'full') {
        await journeyChecks(engine, browser);
        await edgeChecks(engine, browser);
        await errorChecks(engine, browser);
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  mock.close();
  app.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
