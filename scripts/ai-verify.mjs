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
 * merged (entry points, the Setup rename, nothing sent); `full` (the default) also runs
 * the translate → review → insert → undo journey against the mock.
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

/** The first non-empty `zh` run gains 稅收承擔, a non-standard term for Check terms to flag. */
function withNonStandardTerm(doc) {
  const copy = structuredClone(doc);
  let done = false;
  const walk = (node) => {
    if (done || !node || typeof node !== 'object') return;
    if (Array.isArray(node.zh) && node.zh[0]?.text) {
      node.zh[0].text += '稅收承擔';
      done = true;
      return;
    }
    Object.values(node).forEach(walk);
  };
  walk(copy);
  return copy;
}

const FIXTURES = {
  english: { ...englishOnly(corpus), id: 'ai-verify-english', title: { en: [{ text: 'AI verify English only' }], zh: [] } },
  terms: { ...withNonStandardTerm(corpus), id: 'ai-verify-terms', title: { en: [{ text: 'AI verify terms' }], zh: [] } },
  // A newer build's file opens read-only: no Translate entry point may show.
  newer: { ...englishOnly(corpus), id: 'ai-verify-newer', schemaVersion: 2, title: { en: [{ text: 'AI verify newer build' }], zh: [] } },
};
const TITLES = { english: 'AI verify English only', terms: 'AI verify terms', newer: 'AI verify newer build' };

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

/** Storage as a returning teacher has it: documents, What's new seen, Custom → the mock. */
async function newContext(browser, viewport = { width: 1440, height: 900 }) {
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
    baseUrls: { custom: MOCK_BASE },
  };
  await context.addInitScript(
    ([indexJson, docs, version, settingsJson]) => {
      localStorage.setItem('econ-worksheet-index', indexJson);
      for (const [id, doc] of docs) localStorage.setItem(`econ-worksheet:${id}`, doc);
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      localStorage.setItem('econgen.settings.ai', settingsJson);
      sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
    },
    [
      JSON.stringify(index),
      Object.values(FIXTURES).map((doc) => [doc.id, JSON.stringify(doc)]),
      VERSION,
      JSON.stringify(settings),
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

/** Opened vs claimed: whether ⌘, reached the app or the browser kept it. */
async function pressSettingsShortcut(page) {
  await page.keyboard.press(`${META}+Comma`);
  await page.waitForTimeout(400);
  const open = await page.getByRole('dialog', { name: /Settings/ }).count();
  if (open) await page.keyboard.press('Escape');
  return open ? 'opened Settings' : 'nothing opened';
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
    return n ? 'shown' : 'hidden (no Settings sections registered)';
  });
  await check(engine, '⌘, on the start screen', () => pressSettingsShortcut(page));

  await openDocument(page, 'english');
  await check(engine, 'first "Setup" button is the toolbar\'s', async () => {
    const first = page.getByRole('button', { name: 'Setup', exact: true }).first();
    expect((await first.getAttribute('title')) === SETUP_TITLE, 'first Setup button is not the toolbar one');
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
    return found.settings ? 'Settings… shown' : 'Settings… hidden (no sections yet)';
  });

  await check(engine, 'page menu Translation group', async () => {
    await page.locator('#print-root [data-flow-id]').first().click({ button: 'right' });
    await page.waitForTimeout(300);
    await shot(page, '04-page-menu');
    const fill = await page.getByRole('menuitem', { name: /^(Fill 中文|Fill English|Translate this question…|Translate…)$/ }).count();
    await page.keyboard.press('Escape');
    return fill ? 'Translation items shown' : 'no Translation items (slotsForTarget not merged yet)';
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
    return review ? 'Review terms… shown' : 'Review terms… absent (glossary not merged, or none)';
  });

  await check(engine, 'Setup shows the page-setup icon below md', async () => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.waitForTimeout(300);
    const first = page.getByRole('button', { name: 'Setup', exact: true }).first();
    expect((await first.locator(`path[d="${PAGE_SETUP_PATH}"]`).count()) === 1, 'no page-setup icon');
    await shot(page, '08-narrow-setup');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  await check(engine, '⌘, in the editor', () => pressSettingsShortcut(page));
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

  await check(engine, 'Insert → flash → one ⌘Z undoes it', async () => {
    const before = await page.locator('#print-root').innerText();
    await dialog.getByRole('button', { name: /^Insert \d+$/ }).click();
    await page.getByText(/^Filled \d+ text/).waitFor({ timeout: 5000 });
    await shot(page, '12-inserted-flash');
    const after = await page.locator('#print-root').innerText();
    expect(after !== before, 'the page did not change');
    await page.locator('#print-root').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press(`${META}+KeyZ`);
    await page.waitForTimeout(500);
    expect((await page.locator('#print-root').innerText()) === before, 'one Undo did not restore the page');
    await shot(page, '13-undone');
  });

  await check(engine, 'page menu Fill 中文 lands on review', async () => {
    await mockReset();
    await page.locator('#print-root [data-flow-id]').first().click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^Fill 中文$/ }).first().click();
    await dialog.getByRole('button', { name: /^Insert \d+$/ }).waitFor({ timeout: 30_000 });
    await shot(page, '14-fill-review');
    await dialog.getByRole('button', { name: 'Cancel' }).click({ timeout: 2000 }).catch(() => page.keyboard.press('Escape'));
  });

  await check(engine, 'print preview after Insert has no chrome', async () => {
    await page.emulateMedia({ media: 'print' });
    const chrome = await page.locator('#print-root button:visible').count();
    await shot(page, '15-print');
    await page.emulateMedia({ media: 'screen' });
    expect(chrome === 0, `${chrome} visible button(s) inside #print-root`);
  });

  await check(engine, 'Check terms on a corpus copy', async () => {
    await openDocument(page, 'terms');
    await page.getByRole('button', { name: 'File and export options' }).click();
    await page.getByRole('menuitem', { name: 'Check terms…', exact: true }).click();
    await page.getByText('稅收承擔').first().waitFor({ timeout: 5000 });
    await shot(page, '16-check-terms');
    await page.keyboard.press('Escape');
  });

  await check(engine, 'no real provider reached', async () => {
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
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
      if (PHASE === 'full') await journeyChecks(engine, browser);
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
