import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * The AI door browser run. Serves the built `out/` (not `npm run dev`: `predev` rewrites
 * the changelog), points the Custom provider at the canned mock (`ai-mock-server.mjs`),
 * seeds storage the way cover-verify does, then drives Chromium and WebKit. A screenshot
 * and a pass/fail line per check land in --out.
 *
 *   npm run build && node scripts/ai-verify.mjs [--out=/tmp/ai-verify]
 *        [--engines=chromium,webkit] [--only=entry,translate,…] [--port=8787] [--app-port=3417]
 *
 * Groups: entry (the ✦ AI button, ⌘J, the paused verbs absent, right-click on text and in a
 * question's blank box, multi-select, Export, read-only, no Translate left in ⋯ or the
 * Outline, one toolbar row at 1024),
 * translate (fill → bar → highlights → card → Undo all / ⌘Z, Stop, re-translate), terms
 * (keyless Check terms), setup (the SetupCard, then Settings' Your keys Test), error (the bar's error actions), field
 * (BiTextField's ✦ Fill). Paused with their verbs (`src/assist/paused.ts`), kept for when
 * they return and skipped even under --only: answers (E1), source (E3), quality (E4). A
 * last check per engine: E3's lazily loaded engine chunk was never fetched.
 *
 * The privacy check: nothing reaches the mock before an explicit verb click, Save &
 * continue or Fill, and no real provider host is ever reached (every attempt is stubbed
 * and fails the run). The setup group alone serves provider hosts from the mock, inside
 * the browser, to drive the key test.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/ai-verify');
const ENGINES = opt('engines', 'chromium,webkit').split(',');
const ONLY = opt('only', '');
const MOCK_PORT = Number(opt('port', '8787'));
const APP_PORT = Number(opt('app-port', '3417'));
const MOCK_ORIGIN = `http://localhost:${MOCK_PORT}`;
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

/** Every BiText's `zh` emptied: an English-only paper. */
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
const setText = (doc, id, side, text) => (byId(doc, id).text[side] = typeof text === 'string' ? [{ text }] : text);

/** English-only, with the mock's canned sources (ai-mock-server PHRASES), a stem with a
 *  blank, and two '(long)' items in one question: inserted, look and failed items. */
function edgeFixture() {
  const doc = englishOnly(corpus);
  setText(doc, 'id006', 'en', 'Explain why the demand curve slopes downward.');
  setText(doc, 'id008', 'en', 'Supply falls, so the price rises.'); // → 供給: auto-fixed
  setText(doc, 'id010', 'en', 'State one reason why elastic demand lowers total revenue.'); // → 低彈性需求: a look
  setText(doc, 'id012', 'en', [{ text: 'Price falls by ' }, { text: ' '.repeat(12), underline: true }, { text: '.' }]); // blank dropped: failed
  setText(doc, 'id019', 'en', 'Define tax incidence. (long)'); // with the next: finish_reason length, bisect
  setText(doc, 'id021', 'en', 'Explain the effect on the money supply. (long)');
  return doc;
}

/** The corpus as shipped (its 稅項歸宿 is a textbook variant) plus two mainland 供給:
 *  one-click fixes Replace N applies. */
function termsFixture() {
  const doc = structuredClone(corpus);
  setText(doc, 'id008', 'en', 'Supply falls, so the price rises.');
  setText(doc, 'id008', 'zh', '供給減少，因此價格上升。');
  setText(doc, 'id010', 'en', 'Explain why supply increases when the price rises.');
  setText(doc, 'id010', 'zh', '解釋為何價格上升時供給增加。');
  return doc;
}

/** The mock's co-marker findings: an unemphasised "not" in a stem, "Explain" for 1 mark. */
function qualityFixture() {
  const doc = structuredClone(corpus);
  setText(doc, 'id006', 'en', 'A city does not plan to keep its harbour-front car park.');
  setText(doc, 'id008', 'en', 'Explain the opportunity cost of the plan.');
  byId(doc, 'id007').marks = 1;
  return doc;
}

/** English-only with seven ~2,000-character texts: several requests, more than the Custom
 *  provider runs at once, so a Stop lands between finished and pending ones. */
function longFixture() {
  const doc = englishOnly(corpus);
  const long = 'When demand for the good increases, its equilibrium price and quantity both rise. '.repeat(24).trim();
  // Distinct sources: identical ones would share one job.
  ['id006', 'id008', 'id010', 'id012', 'id019', 'id021', 'id022'].forEach((id, n) => setText(doc, id, 'en', `Case ${n + 1}. ${long}`));
  return doc;
}

/** The corpus with its last question moved above END OF PAPER, as a real paper ends:
 *  an unanchored new question must land above that closing line. */
function sourceFixture() {
  const doc = structuredClone(corpus);
  const flow = doc.flow.filter((item) => item.id !== 'id011');
  flow.splice(flow.findIndex((item) => item.id === 'id049'), 0, doc.flow.find((item) => item.id === 'id011'));
  return { ...doc, flow };
}

/** The corpus with an MCQ as Question 2: a stem, a narrow diagram (blank paper beside it)
 *  and four options, for right-clicks that land in the question's box and no finer target. */
function mcqFixture() {
  const doc = structuredClone(corpus);
  const text = (en, zh) => ({ en: [{ text: en }], zh: [{ text: zh }] });
  const diagram = JSON.parse(JSON.stringify(byId(doc, 'id013')).replace(/"id0(1[3-6])"/g, '"mcq-$1"'));
  doc.questions.splice(1, 0, {
    id: 'mcq-q',
    type: 'mcq',
    blocks: [
      { kind: 'paragraph', id: 'mcq-stem', text: text('A per-unit tax shifts the supply curve. Which is correct?', '從量稅令供應曲線移動。以下哪項正確？') },
      { ...diagram, widthPx: 260, heightPx: 218 },
    ],
    options: ['Price rises', 'Price falls', 'Output rises', 'No change'].map((en, n) => ({ id: `mcq-o${n}`, text: text(en, ['價格上升', '價格下降', '產量上升', '沒有改變'][n]) })),
    answerIndex: 0,
    optionLayout: 'columns2',
  });
  // `questions` owns the order; the flow only has to hold it in the same place.
  doc.flow.splice(doc.flow.findIndex((item) => item.id === 'id005') + 1, 0, { type: 'question', id: 'mcq-q' });
  return doc;
}

const named = (doc, id, title) => ({ ...doc, id, title: { en: [{ text: title }], zh: [] } });
const FIXTURES = {
  english: named(englishOnly(corpus), 'ai-verify-english', 'AI verify English only'),
  edge: named(edgeFixture(), 'ai-verify-edge', 'AI verify edge cases'),
  long: named(longFixture(), 'ai-verify-long', 'AI verify long texts'),
  terms: named(termsFixture(), 'ai-verify-terms', 'AI verify terms'),
  answers: named(structuredClone(corpus), 'ai-verify-answers', 'AI verify answers'),
  mcq: named(mcqFixture(), 'ai-verify-mcq', 'AI verify MCQ'),
  source: named(sourceFixture(), 'ai-verify-source', 'AI verify source'),
  quality: named(qualityFixture(), 'ai-verify-quality', 'AI verify quality'),
  // A newer build's file opens read-only: no AI entry point may show.
  newer: { ...named(englishOnly(corpus), 'ai-verify-newer', 'AI verify newer build'), schemaVersion: 99 },
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
    // The first line, plus the locator a Playwright timeout was waiting for.
    const waiting = e.message.split('\n').find((line) => line.includes('waiting for'));
    const detail = [e.message.split('\n')[0], waiting?.trim()].filter(Boolean).join(' · ');
    results.push({ engine, name, ok: false, detail });
    console.log(`  FAIL ${name} — ${detail}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

/**
 * Storage as a returning teacher has it: documents, What's new seen, Custom → the mock.
 * `route` picks the mock's behaviour ('/region', '/401', '/slow'); `secret: false` leaves
 * no key; `settings: false` no AI settings at all (a first run). `serveProviders` answers
 * provider hosts from the mock (a path prefix per host) instead of failing them.
 */
async function newContext(browser, { viewport = { width: 1280, height: 800 }, route = '', secret = true, settings = true, serveProviders } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const index = Object.entries(FIXTURES).map(([k, doc]) => ({ id: doc.id, title: TITLES[k], updatedAt: doc.updatedAt }));
  const ai = { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK_ORIGIN}${route}/v1` } };
  context.setDefaultTimeout(8000);
  await context.addInitScript(
    ([indexJson, docs, version, settingsJson, withSecret]) => {
      localStorage.setItem('econ-worksheet-index', indexJson);
      for (const [id, doc] of docs) localStorage.setItem(`econ-worksheet:${id}`, doc);
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (settingsJson) localStorage.setItem('econgen.settings.ai', settingsJson);
      if (withSecret) sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
    },
    [JSON.stringify(index), Object.values(FIXTURES).map((doc) => [doc.id, JSON.stringify(doc)]), VERSION, settings ? JSON.stringify(ai) : null, secret],
  );
  const leaks = [];
  const served = [];
  await context.route(
    (url) => PROVIDER_HOSTS.includes(url.hostname),
    async (route) => {
      const url = new URL(route.request().url());
      const prefix = serveProviders?.[url.hostname];
      if (prefix === undefined) {
        leaks.push(url.href);
        return route.fulfill({ status: 599, body: 'blocked by ai-verify' });
      }
      // Served inside the browser: the request never leaves for the real host.
      served.push(url.href);
      const response = await route.fetch({ url: `${MOCK_ORIGIN}${prefix}/v1${url.pathname}${url.search}` });
      return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
    },
  );
  context.on('request', (request) => fetched.add(request.url().split('/').pop()));
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  await mockReset();
  return { context, page, leaks, served };
}

const mockCount = async () => (await (await fetch(`${MOCK_ORIGIN}/__count`)).json()).count;
const mockReset = () => fetch(`${MOCK_ORIGIN}/__reset`, { method: 'POST' });

async function openDocument(page, key) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(TITLES[key]) }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
  await page.waitForTimeout(600);
}

async function setLanguage(page, label) {
  await page.getByRole('radio', { name: label, exact: true }).first().click();
  await page.waitForTimeout(300);
}

const META = process.platform === 'darwin' ? 'Meta' : 'Control';
const pageText = (page) => page.locator('#print-root').innerText();
/** The stored document, as autosave last wrote it. */
const storedDoc = (page, key) => page.evaluate((id) => localStorage.getItem(`econ-worksheet:${id}`), FIXTURES[key].id);

/** Clicks the page's margin: no selection, no text focus (⌘J and ⌘Z need that). */
async function clickMargin(page) {
  await page.locator('#print-root').click({ position: { x: 4, y: 4 } });
  await page.waitForTimeout(150);
}

const door = (page) => page.locator('[data-ai-door]');
const aiMenu = (page) => page.getByRole('dialog', { name: 'AI tools' });
const verbRow = (page, verbId) => aiMenu(page).locator(`[data-verb="${verbId}"]`);
const bar = (page) => page.getByRole('status', { name: 'AI' });
const errorBar = (page) => page.getByRole('alert', { name: 'AI' });
const barButton = (page, name) => page.locator('[aria-label="AI"]').getByRole('button', { name, exact: true });
const marks = (page, tone) => page.locator(`#print-root [data-ai-mark${tone ? `="${tone}"` : ''}]`).count();

/** Opens the menu from the toolbar button. */
async function openMenu(page) {
  await door(page).click();
  await aiMenu(page).waitFor({ timeout: 3000 });
  await page.waitForTimeout(200);
}

/** Opens the menu and runs one verb; resolves once the bar's review line matches `done`. */
async function runVerb(page, verbId, done, timeout = 30_000) {
  await openMenu(page);
  await verbRow(page, verbId).click();
  await bar(page).getByText(done).first().waitFor({ timeout });
  await page.waitForTimeout(400);
}

/** Right-clicks a question's own printed text (a paragraph with an edit target). */
async function rightClickText(page, nth = 0) {
  const text = page.locator('#print-root [data-question-id] [data-page-target]').nth(nth);
  await text.scrollIntoViewIfNeeded();
  await text.click({ button: 'right' });
  await page.waitForTimeout(300);
}

/** Nothing reached the mock and no real provider was tried. */
async function nothingSent(leaks) {
  const sent = await mockCount();
  expect(sent === 0 && leaks.length === 0, `mock saw ${sent}, providers saw ${leaks.length}`);
}

/** Mirrors `src/assist/paused.ts:PAUSED_VERBS`: the menu must never offer these. */
const PAUSED_VERBS = ['write.answers', 'create.fromSource', 'check.quality'];
/** E3's lazily loaded engine (`src/generate/run.ts`), found by one of its strings. A paused
 *  verb never runs, so no group may fetch it. */
const CHUNKS = join(ROOT, 'out/_next/static/chunks');
const E3_CHUNKS = readdirSync(CHUNKS).filter((f) => f.endsWith('.js') && readFileSync(join(CHUNKS, f), 'utf8').includes('The reply had no structured question.'));
/** Every script the browser fetched, by file name. */
const fetched = new Set();

const shooter = (engine) => (page, name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });

/** Every way in, on an English-only paper (the question box on the MCQ one); nothing may be sent. */
async function entryChecks(engine, browser) {
  const shot = shooter(engine);
  const { context, page, leaks } = await newContext(browser, { viewport: { width: 1440, height: 900 } });
  await openDocument(page, 'english');
  await setLanguage(page, '中文');

  await check(engine, 'toolbar "✦ AI" button with the untranslated badge', async () => {
    const label = await door(page).getAttribute('aria-label');
    const text = (await door(page).innerText()).replace(/\s+/g, ' ').trim();
    await shot(page, 'entry-01-button');
    expect(/^AI tools, \d+ untranslated$/.test(label ?? ''), `aria-label ${label}`);
    expect(/^AI \d+$/.test(text), `button reads "${text}"`);
    expect((await door(page).locator('svg').count()) === 1, 'no sparkle beside the word');
    return text;
  });

  await check(engine, '⌘J opens the menu centred under the toolbar', async () => {
    await clickMargin(page);
    await page.keyboard.press(`${META}+KeyJ`);
    await aiMenu(page).waitFor({ timeout: 3000 });
    await page.waitForTimeout(200);
    const box = await aiMenu(page).boundingBox();
    const scope = await aiMenu(page).getByText('Whole paper').count();
    await shot(page, 'entry-02-cmd-j');
    await page.keyboard.press('Escape');
    const centre = box.x + box.width / 2;
    expect(Math.abs(centre - 720) <= 2, `centred at ${Math.round(centre)}, not 720`);
    expect(box.y < 90, `top at ${Math.round(box.y)}`);
    expect(scope > 0, 'scope is not "Whole paper"');
    expect((await aiMenu(page).count()) === 0, 'Escape left the menu open');
  });

  await check(engine, 'paused verbs (E1, E3, E4) are not in the menu, not even by search', async () => {
    await openMenu(page);
    const search = aiMenu(page).getByRole('textbox', { name: 'Search AI actions' });
    const seen = [];
    for (const query of ['', 'answers', 'source', 'quality']) {
      await search.fill(query);
      await page.waitForTimeout(150);
      for (const id of PAUSED_VERBS) if ((await verbRow(page, id).count()) > 0) seen.push(`${id} for "${query}"`);
    }
    await search.fill('');
    await page.waitForTimeout(150);
    const offered = await aiMenu(page).locator('[data-verb]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-verb')));
    await shot(page, 'entry-02b-no-paused');
    await page.keyboard.press('Escape');
    expect(seen.length === 0, `listed: ${seen.join(', ')}`);
    expect(offered.includes('translate.fillZh'), `offered ${offered.join(', ')}`);
    return offered.join(', ');
  });

  await check(engine, 'right-click "✦ AI…" opens on the clicked text', async () => {
    await rightClickText(page);
    await page.getByRole('menuitem', { name: '✦ AI…', exact: true }).click();
    await aiMenu(page).waitFor({ timeout: 3000 });
    await page.waitForTimeout(200);
    const chip = await aiMenu(page).getByRole('button', { name: /^Scope: / }).innerText();
    const fill = await verbRow(page, 'translate.fillZh').innerText();
    await shot(page, 'entry-03-right-click');
    await page.keyboard.press('Escape');
    expect(chip.trim() === 'This text', `scope chip "${chip.trim()}"`);
    expect(/1 text\b/.test(fill), `Fill row reads "${fill}"`);
  });

  await check(engine, 'multi-select pill "✦ AI" opens on the selection', async () => {
    await clickMargin(page);
    await page.keyboard.press(`${META}+KeyA`);
    const pill = page.getByRole('button', { name: '✦ AI', exact: true });
    await pill.waitFor({ timeout: 3000 });
    await pill.click();
    await aiMenu(page).waitFor({ timeout: 3000 });
    await page.waitForTimeout(200);
    // The scope chip, not a row's count (E4's "2 questions" once matched here).
    const scope = (await aiMenu(page).getByRole('button', { name: /^Scope: / }).innerText()).trim();
    await shot(page, 'entry-04-multiselect');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    expect(/^([2-9]|\d{2,}) (questions|items)$/.test(scope), `scope chip "${scope}"`);
    return scope;
  });

  await check(engine, 'Export paper check "Open ✦ AI" preselects Fill missing 中文', async () => {
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.getByRole('button', { name: 'Open ✦ AI', exact: true }).first().click({ timeout: 5000 });
    await aiMenu(page).waitFor({ timeout: 3000 });
    await page.waitForTimeout(200);
    const exportOpen = await page.getByRole('dialog', { name: /Export/ }).count();
    const sends = await verbRow(page, 'translate.fillZh').innerText();
    await shot(page, 'entry-05-export-open-ai');
    await page.keyboard.press('Escape');
    expect(exportOpen === 0, 'Export stayed open under the menu');
    expect(/Sends \d+ texts? to/.test(sends), `Fill missing 中文 is not highlighted: "${sends}"`);
  });

  await check(engine, '⋯ menu and Outline offer no Translate', async () => {
    await page.getByRole('button', { name: 'File and export options' }).click();
    await page.getByRole('menuitem', { name: 'Copy for Word' }).waitFor();
    const toolbar = await page.getByRole('menuitem', { name: /Translat|Check terms/ }).count();
    await shot(page, 'entry-06-more-menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /^Actions for question/ }).first().click();
    await page.waitForTimeout(250);
    const outline = await page.getByRole('menuitem', { name: /Translat/ }).count();
    await shot(page, 'entry-07-outline-menu');
    await page.keyboard.press('Escape');
    expect(toolbar === 0 && outline === 0, `⋯ ${toolbar}, Outline ${outline}`);
  });

  await check(engine, 'toolbar is one row at 1024 px', async () => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.waitForTimeout(300);
    const row = await door(page).evaluate((el) => {
      const parent = el.parentElement;
      const tops = [...parent.children].filter((c) => c.getBoundingClientRect().height > 0).map((c) => c.getBoundingClientRect());
      return {
        spread: Math.max(...tops.map((r) => r.top + r.height / 2)) - Math.min(...tops.map((r) => r.top + r.height / 2)),
        overflow: parent.scrollWidth - parent.clientWidth,
        height: parent.getBoundingClientRect().height,
      };
    });
    await shot(page, 'entry-08-toolbar-1024');
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(row.spread <= 4 && row.overflow <= 1 && row.height < 44, JSON.stringify(row));
    return `row ${Math.round(row.height)} px high`;
  });

  // The question's box: blank paper beside a diagram belongs to no finer target, yet must
  // open the page menu (not the browser's) for the whole question; an option letter in a
  // row layout, its option's.
  await openDocument(page, 'mcq');
  const qbox = page.locator('#print-root [data-question-id="mcq-q"]').first();
  const pageMenu = page.getByRole('menu', { name: 'Page actions' });
  /** Right-clicks (x, y), which must land in the box and on no printed paragraph; the
   *  menu's items, then its ✦ AI scope chip. */
  const rightClickBox = async (x, y) => {
    const hit = await page.evaluate(([px, py]) => {
      const el = document.elementFromPoint(px, py);
      return { inBox: !!el?.closest('[data-question-id="mcq-q"]'), onText: !!el?.closest('[data-page-target]') };
    }, [x, y]);
    expect(hit.inBox && !hit.onText, `(${Math.round(x)}, ${Math.round(y)}) lands ${JSON.stringify(hit)}`);
    await page.mouse.click(x, y, { button: 'right' });
    await pageMenu.waitFor({ timeout: 3000 });
    await page.waitForTimeout(250);
    return pageMenu.getByRole('menuitem').allInnerTexts();
  };
  const aiScopeChip = async () => {
    await page.getByRole('menuitem', { name: '✦ AI…', exact: true }).click();
    await aiMenu(page).waitFor({ timeout: 3000 });
    const chip = (await aiMenu(page).getByRole('button', { name: /^Scope: / }).innerText()).trim();
    await page.keyboard.press('Escape');
    return chip;
  };
  await check(engine, 'right-click beside a diagram in a question opens its ✦ AI menu', async () => {
    await clickMargin(page);
    await qbox.scrollIntoViewIfNeeded();
    // Let any scroll settle: the open menu closes on the next scroll.
    await page.waitForTimeout(500);
    const figure = await qbox.locator('svg').first().boundingBox();
    const items = await rightClickBox(figure.x + figure.width + 80, figure.y + figure.height / 2);
    const selected = await qbox.getAttribute('aria-current');
    await shot(page, 'entry-09a-question-box-beside-diagram');
    const chip = await aiScopeChip();
    expect(items.includes('✦ AI…'), `menu offered ${items.join(', ')}`);
    expect(selected === 'true', 'the question was not selected');
    expect(chip === 'Question 2', `scope chip "${chip}"`);
    return items.join(', ');
  });
  await check(engine, 'right-click a row-layout option letter opens its ✦ AI menu', async () => {
    await clickMargin(page);
    await qbox.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    const letter = await qbox.evaluate((box) => {
      const walker = document.createTreeWalker(box, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const at = node.data.indexOf('A.');
        if (at < 0 || node.parentElement.closest('[data-page-target]')) continue;
        const range = document.createRange();
        range.setStart(node, at);
        range.setEnd(node, at + 2);
        const r = range.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
      return undefined;
    });
    expect(letter, 'no "A." marker outside printed text');
    const items = await rightClickBox(letter.x, letter.y);
    await shot(page, 'entry-09b-question-box-option-letter');
    const chip = await aiScopeChip();
    expect(items.includes('✦ AI…'), `menu offered ${items.join(', ')}`);
    expect(chip === 'This text', `scope chip "${chip}"`);
    return items.join(', ');
  });

  await check(engine, 'nothing sent without a click', () => nothingSent(leaks));

  // A newer build's document opens read-only: no way into AI at all.
  await openDocument(page, 'newer');
  await setLanguage(page, '中文');
  await check(engine, 'read-only: no AI entry point', async () => {
    await shot(page, 'entry-09-readonly');
    const button = await door(page).count();
    await clickMargin(page);
    await page.keyboard.press(`${META}+KeyJ`);
    await page.waitForTimeout(300);
    const menu = await aiMenu(page).count();
    // Read-only opens in Preview, with no edit targets: right-click the sheet itself.
    await page.mouse.click(700, 500, { button: 'right' });
    await page.waitForTimeout(300);
    const item = await page.getByRole('menuitem', { name: '✦ AI…', exact: true }).count();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Export…' }).click();
    await page.waitForTimeout(800);
    const link = await page.getByRole('button', { name: 'Open ✦ AI', exact: true }).count();
    await shot(page, 'entry-10-readonly-export');
    await page.keyboard.press('Escape');
    expect(button + menu + item + link === 0, `button ${button}, ⌘J ${menu}, page menu ${item}, export link ${link}`);
  });
  await context.close();
}

/** Fill missing 中文 on the edge paper: inserted, look and failed items; the card; Undo
 *  all and ⌘Z; Stop on the slow mock; Re-translate on one question. */
async function translateChecks(engine, browser) {
  const shot = shooter(engine);
  const { context, page, leaks } = await newContext(browser);
  await openDocument(page, 'edge');
  await setLanguage(page, '中文');
  const before = await pageText(page);
  const FILLED = /^(Stopped · )?Filled \d+ 中文 texts?/;

  await check(engine, 'Fill missing 中文 inserts at once, highlighted', async () => {
    await openMenu(page);
    expect((await mockCount()) === 0, 'a request left before the verb click');
    await verbRow(page, 'translate.fillZh').click();
    await bar(page).getByText(FILLED).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
    const inserted = await marks(page, 'inserted');
    const look = await marks(page, 'look');
    const failed = await bar(page).getByRole('button', { name: /^\d+ failed$/ }).count();
    await shot(page, 'translate-01-inserted');
    expect((await pageText(page)) !== before, 'the page did not change');
    expect(inserted > 0 && look > 0, `${inserted} inserted, ${look} look highlights`);
    expect(failed === 1, 'no failed chip for the dropped blank');
    return `${inserted} inserted, ${look} look, ${await mockCount()} requests`;
  });

  await check(engine, 'a look chip opens its card beside the text', async () => {
    await bar(page).getByRole('button', { name: /to look at$/ }).click();
    const card = page.getByRole('dialog').filter({ hasText: 'Needs a look' });
    await card.waitFor({ timeout: 3000 });
    // The page scrolls smoothly to the text; the card follows it.
    await page.waitForTimeout(800);
    const current = page.locator('#print-root [data-ai-current]').first();
    const [cardBox, textBox] = [await card.boundingBox(), await current.boundingBox()];
    await shot(page, 'translate-02-card');
    const gap = Math.min(Math.abs(cardBox.y - (textBox.y + textBox.height)), Math.abs(textBox.y - (cardBox.y + cardBox.height)));
    expect(gap <= 24, `card ${Math.round(gap)} px from its text`);
    return (await card.innerText()).split('\n').slice(0, 2).join(' · ');
  });

  await check(engine, 'Undo all restores the page and clears the highlights', async () => {
    await barButton(page, 'Undo all').click();
    await page.waitForTimeout(500);
    await shot(page, 'translate-03-undo-all');
    expect((await pageText(page)) === before, 'Undo all did not restore the page');
    expect((await marks(page)) === 0 && (await bar(page).count()) === 0, 'highlights or the bar outlived Undo all');
  });

  await check(engine, 'one ⌘Z also restores, and retires Undo all', async () => {
    await runVerb(page, 'translate.fillZh', FILLED);
    await clickMargin(page);
    await page.keyboard.press(`${META}+KeyZ`);
    await page.waitForTimeout(500);
    await shot(page, 'translate-04-cmd-z');
    expect((await pageText(page)) === before, 'one ⌘Z did not restore the page');
    expect((await barButton(page, 'Undo all').count()) === 0, 'Undo all outlived its commit');
    await barButton(page, 'Done').click();
  });

  await check(engine, 'Re-translate 中文… on a question scope', async () => {
    await openDocument(page, 'answers');
    await setLanguage(page, 'EN+中');
    await mockReset();
    await rightClickText(page);
    await page.getByRole('menuitem', { name: '✦ AI…', exact: true }).click();
    await aiMenu(page).getByRole('button', { name: /^Scope: / }).click();
    await aiMenu(page).getByRole('option', { name: 'Question 1' }).click();
    await verbRow(page, 'translate.retranslateZh').waitFor({ timeout: 3000 });
    await shot(page, 'translate-05-retranslate-menu');
    await verbRow(page, 'translate.retranslateZh').click();
    await bar(page).getByText(/^Re-translated \d+ 中文 texts?/).waitFor({ timeout: 30_000 });
    await shot(page, 'translate-06-retranslated');
    return (await bar(page).innerText()).split('\n')[1];
  });

  await check(engine, 'translate: no real provider reached', () => expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`));
  await context.close();

  const slow = await newContext(browser, { route: '/slow' });
  await check(engine, 'running bar counts what the summary counts; Stop keeps what finished', async () => {
    const sp = slow.page;
    await openDocument(sp, 'long');
    await setLanguage(sp, '中文');
    await openMenu(sp);
    const offered = Number(/(\d+) texts?/.exec(await verbRow(sp, 'translate.fillZh').innerText())[1]);
    await verbRow(sp, 'translate.fillZh').click();
    const progress = bar(sp).getByText(/^\d+ of \d+$/);
    await progress.waitFor({ timeout: 5000 });
    const total = Number((await progress.innerText()).split(' of ')[1]);
    await shot(sp, 'translate-07-running');
    // Wait for a finished request, then stop the rest.
    for (let i = 0; i < 40 && (await progress.count()) && (await progress.innerText()).startsWith('0 of'); i += 1) await sp.waitForTimeout(500);
    await barButton(sp, 'Stop').click();
    await bar(sp).getByText(/^Stopped/).waitFor({ timeout: 10_000 });
    await sp.waitForTimeout(400);
    const summary = await bar(sp).getByText(/^Stopped/).innerText();
    await shot(sp, 'translate-08-stopped');
    expect(total === offered, `bar total ${total}, menu offered ${offered}`);
    const kept = Number(/^Stopped · Filled (\d+)/.exec(summary)?.[1] ?? 0);
    expect(kept > 0 && (await marks(sp)) > 0, `"${summary}" kept nothing`);
    expect(kept < total, `"${summary}": the Stop came after everything finished`);
    return summary;
  });
  await slow.context.close();
}

/** Check terms with no key at all: wavy findings, one card fix, then Replace N. */
async function termsChecks(engine, browser) {
  const shot = shooter(engine);
  const { context, page, leaks } = await newContext(browser, { secret: false });
  await openDocument(page, 'terms');
  await setLanguage(page, 'EN+中');

  await check(engine, 'Check terms runs keyless; findings are wavy on the page', async () => {
    await openMenu(page);
    const free = await verbRow(page, 'check.terms').getByText('free', { exact: true }).count();
    await verbRow(page, 'check.terms').click();
    await bar(page).getByRole('button', { name: /^\d+ findings?$/ }).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    const style = await page.locator('#print-root [data-ai-mark="finding"]').first().evaluate((el) => getComputedStyle(el).textDecorationStyle);
    await shot(page, 'terms-01-findings');
    expect(free === 1, 'Check terms is not marked free');
    expect(style === 'wavy', `finding underline is ${style}`);
    return `${await marks(page, 'finding')} marked`;
  });

  await check(engine, 'a finding card replaces one term', async () => {
    await bar(page).getByRole('button', { name: /^\d+ findings?$/ }).click();
    const card = page.getByRole('dialog').filter({ hasText: 'Finding' });
    await card.waitFor({ timeout: 3000 });
    const fix = card.getByRole('button', { name: 'Replace with 稅收承擔' });
    for (let i = 0; i < 8 && !(await fix.count()); i += 1) await card.getByRole('button', { name: 'Next' }).click();
    await page.waitForTimeout(500);
    await shot(page, 'terms-02-card');
    await fix.click();
    await page.waitForTimeout(400);
    expect((await pageText(page)).includes('稅收承擔'), '稅收承擔 is not on the page');
    expect((await card.getByRole('button', { name: 'Done' }).count()) === 1, 'the card did not mark the fix done');
  });

  await check(engine, 'Replace N applies the safe fixes in one go', async () => {
    const replace = bar(page).getByRole('button', { name: /^Replace \d+$/ });
    const label = await replace.innerText();
    await replace.click();
    await page.waitForTimeout(500);
    const text = await pageText(page);
    await shot(page, 'terms-03-replace-n');
    expect(!text.includes('供給') && text.includes('供應'), '供給 is still on the page');
    return label;
  });

  await check(engine, 'terms: nothing sent', () => nothingSent(leaks));
  await context.close();
}

/** Paused (PAUSED_GROUPS). E1: Write answers & mark scheme fills the empty parts, shows them, and Undo all. */
async function answersChecks(engine, browser) {
  const shot = shooter(engine);
  const { context, page, leaks } = await newContext(browser);
  await openDocument(page, 'answers');
  await setLanguage(page, 'EN+中');
  const before = await pageText(page);

  await check(engine, 'Write answers & mark scheme: the teacher view shows them, highlighted', async () => {
    await openMenu(page);
    expect((await mockCount()) === 0, 'a request left before the verb click');
    await verbRow(page, 'write.answers').click();
    await bar(page).getByText(/^Filled \d+ parts?/).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    const teacher = await page.getByRole('radio', { name: 'Teacher', exact: true }).first().getAttribute('aria-checked');
    const text = await pageText(page);
    await shot(page, 'answers-01-filled');
    expect(teacher === 'true', 'the editor did not switch to the teacher view');
    expect(text.includes('The tax raises the cost of production.'), 'no model answer on the page');
    expect((await marks(page)) > 0, 'no highlights');
    return (await bar(page).getByText(/^Filled/).innerText()).trim();
  });

  await check(engine, 'answers: Undo all removes them', async () => {
    await barButton(page, 'Undo all').click();
    await page.waitForTimeout(500);
    await setLanguage(page, 'EN+中');
    await page.getByRole('radio', { name: 'Student', exact: true }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'answers-02-undone');
    expect(!(await pageText(page)).includes('The tax raises the cost of production.'), 'the answers stayed');
    expect((await pageText(page)) === before, 'the page did not return to how it was');
  });
  await check(engine, 'answers: no real provider reached', () => expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`));
  await context.close();
}

const SOURCE = 'Hong Kong, 2026. After a typhoon damaged farms in Guangdong, fewer vegetables reached local markets. ' +
  'Prices of choi sum rose by 40 per cent within a week, while shoppers bought less of it.';

/** Paused (PAUSED_GROUPS). E3: the input step, Generate, questions inserted before END OF PAPER, Undo all. */
async function sourceChecks(engine, browser) {
  const shot = shooter(engine);
  const { context, page, leaks } = await newContext(browser);
  await openDocument(page, 'source');
  await setLanguage(page, 'EN');
  const before = await pageText(page);

  await check(engine, 'Questions from a source: the input step needs a real source', async () => {
    await openMenu(page);
    await verbRow(page, 'create.fromSource').click();
    const box = aiMenu(page).locator('textarea');
    await box.fill('Too short.');
    const generate = aiMenu(page).getByRole('button', { name: 'Generate', exact: true });
    const blocked = await generate.isDisabled();
    const hint = await aiMenu(page).getByText(/at least \d+/).count();
    await shot(page, 'source-01-too-short');
    await box.fill(SOURCE);
    expect(blocked && hint === 1, 'Generate is enabled for 10 characters');
    expect(await generate.isEnabled(), 'Generate is disabled for a real source');
    expect((await mockCount()) === 0, 'a request left before Generate');
  });

  await check(engine, 'Generate inserts the questions before END OF PAPER', async () => {
    await aiMenu(page).getByRole('button', { name: 'Generate', exact: true }).click();
    await bar(page).getByText(/^Added \d+ questions? from your source/).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(600);
    const text = await pageText(page);
    await shot(page, 'source-02-inserted');
    const at = text.indexOf('Read the source below and answer the questions.');
    expect(at >= 0, 'the new question is not on the page');
    expect(at < text.indexOf('END OF PAPER'), 'the new question is after END OF PAPER');
    return (await bar(page).getByText(/^Added/).innerText()).trim();
  });

  await check(engine, 'source: Undo all removes the questions', async () => {
    await barButton(page, 'Undo all').click();
    await page.waitForTimeout(500);
    await page.getByRole('radio', { name: 'Student', exact: true }).first().click();
    await page.waitForTimeout(400);
    await shot(page, 'source-03-undone');
    expect((await pageText(page)) === before, 'the page did not return to how it was');
  });
  await check(engine, 'source: no real provider reached', () => expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`));
  await context.close();
}

/** Paused (PAUSED_GROUPS). E4: findings and their cards; the document is not touched. */
async function qualityChecks(engine, browser) {
  const shot = shooter(engine);
  const { context, page, leaks } = await newContext(browser);
  await openDocument(page, 'quality');
  await setLanguage(page, 'EN+中');
  const text = await pageText(page);
  const stored = await storedDoc(page, 'quality');

  await check(engine, 'Check question quality: findings on the page and in cards', async () => {
    await openMenu(page);
    expect((await mockCount()) === 0, 'a request left before the verb click');
    await verbRow(page, 'check.quality').click();
    const chip = bar(page).getByRole('button', { name: /^\d+ findings?$/ });
    await chip.waitFor({ timeout: 30_000 });
    await chip.click();
    const card = page.getByRole('dialog').filter({ hasText: 'Finding' });
    await card.waitFor({ timeout: 3000 });
    await page.waitForTimeout(600);
    await shot(page, 'quality-01-card');
    expect((await marks(page, 'finding')) > 0, 'no finding on the page');
    return (await bar(page).getByText(/findings? in/).innerText()).trim();
  });

  await check(engine, 'quality: nothing written, the document is unchanged', async () => {
    await barButton(page, 'Done').click();
    await page.waitForTimeout(1500);
    expect((await pageText(page)) === text, 'the page changed');
    expect((await storedDoc(page, 'quality')) === stored, 'the stored document changed');
    expect((await page.locator('[data-save-state="saving"], [data-save-state="stalled"]').count()) === 0, 'the document is dirty');
  });
  await check(engine, 'quality: no real provider reached', () => expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`));
  await context.close();
}

const GEMINI_KEY = `AIzaSy${'A'.repeat(33)}`;
const DEEPSEEK_KEY = `sk-${'0123456789abcdef'.repeat(2)}`;

/** No provider: the menu's SetupCard, Gemini refused from Hong Kong, Use DeepSeek, and the
 *  clicked verb runs once the key passes. Provider hosts are served by the mock here. */
async function setupChecks(engine, browser) {
  const shot = shooter(engine);
  const serveProviders = { 'generativelanguage.googleapis.com': '/region', 'api.deepseek.com': '' };
  const { context, page, leaks, served } = await newContext(browser, { settings: false, secret: false, serveProviders });
  await openDocument(page, 'english');
  await setLanguage(page, '中文');
  const card = aiMenu(page).locator('[data-setup-card]');
  const keyField = card.getByRole('textbox', { name: /API key$/ });
  const save = card.getByRole('button', { name: 'Save & continue', exact: true });

  await check(engine, 'no provider: the verb opens the SetupCard, Gemini Recommended first', async () => {
    await openMenu(page);
    await verbRow(page, 'translate.fillZh').click();
    await card.waitFor({ timeout: 3000 });
    const first = card.getByRole('radio').first();
    const [provider, checked, badge] = [await first.getAttribute('data-provider'), await first.getAttribute('aria-checked'), await first.innerText()];
    await shot(page, 'setup-01-card');
    expect(provider === 'gemini' && checked === 'true', `first row ${provider}, checked ${checked}`);
    expect(badge.includes('Recommended'), 'Gemini is not marked Recommended');
    expect((await mockCount()) === 0 && served.length === 0, 'a request left before Save & continue');
  });

  await check(engine, 'a region refusal: one line and Use DeepSeek', async () => {
    await keyField.fill(GEMINI_KEY);
    expect(served.length === 0, 'typing the key sent it');
    await save.click();
    const line = card.getByRole('alert');
    await line.getByText(/Turn on a VPN/).waitFor({ timeout: 10_000 });
    await shot(page, 'setup-02-region');
    await line.getByRole('button', { name: 'Use DeepSeek', exact: true }).click();
    await page.waitForTimeout(300);
    expect((await card.locator('[data-provider="deepseek"]').getAttribute('aria-checked')) === 'true', 'DeepSeek is not picked');
    return (await line.count()) ? 'line still shown' : 'line cleared on switch';
  });

  await check(engine, 'a good key runs the verb that was clicked', async () => {
    await keyField.fill(DEEPSEEK_KEY);
    await save.click();
    await bar(page).getByText(/^Filled \d+ 中文 texts?/).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await shot(page, 'setup-03-ran');
    const hosts = new Set(served.map((u) => new URL(u).hostname));
    expect(hosts.has('api.deepseek.com'), 'nothing went to DeepSeek');
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
    return [...hosts].join(', ');
  });

  await check(engine, 'Settings: Your keys lists the key masked; Test sends only on its click', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${META}+Comma`);
    const settings = page.getByRole('dialog', { name: /Settings/ });
    const row = settings.locator('[data-key-row="deepseek"]');
    await row.waitFor({ timeout: 5000 });
    await page.waitForTimeout(400);
    const before = served.length;
    expect((await row.innerText()).includes(`••••••••${DEEPSEEK_KEY.slice(-4)}`), 'no masked key in the row');
    expect(!(await page.content()).includes(DEEPSEEK_KEY.slice(0, 12)), 'key material in the DOM');
    expect(served.length === before, 'opening Settings sent a request');
    await row.getByRole('button', { name: 'Test', exact: true }).click();
    await row.getByText('Connected').waitFor({ timeout: 10_000 });
    await shot(page, 'setup-04-settings-keys');
    const sent = served.slice(before).map((u) => new URL(u).hostname);
    expect(sent.length > 0 && sent.every((h) => h === 'api.deepseek.com'), `Test sent to ${sent.join(', ') || 'nothing'}`);
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
    return `${sent.length} request(s) to api.deepseek.com`;
  });
  await context.close();
}

/** The bar's error line and actions: a region refusal and a rejected key. */
async function errorChecks(engine, browser) {
  const shot = shooter(engine);
  for (const [route, name] of [['/region', 'region'], ['/401', 'bad key']]) {
    const { context, page, leaks } = await newContext(browser, { route });
    await check(engine, `${name}: the error bar and its actions`, async () => {
      await openDocument(page, 'english');
      await setLanguage(page, '中文');
      await openMenu(page);
      await verbRow(page, 'translate.fillZh').click();
      await errorBar(page).waitFor({ timeout: 10_000 });
      await page.waitForTimeout(400);
      const actions = await errorBar(page).getByRole('button').allInnerTexts();
      await shot(page, `error-${route.slice(1)}`);
      expect((await mockCount()) === 1, `${await mockCount()} requests after a fatal error`);
      if (route === '/region') {
        expect(actions.includes('Use DeepSeek') && actions.includes('Use Qwen'), `actions: ${actions.join(', ')}`);
        // No DeepSeek key yet: Settings opens on it, with the reason.
        await errorBar(page).getByRole('button', { name: 'Use DeepSeek', exact: true }).click();
        await page.getByRole('dialog', { name: /Settings/ }).waitFor({ timeout: 5000 });
        await page.waitForTimeout(600);
        await shot(page, 'error-region-settings');
        await page.keyboard.press('Escape');
      } else {
        expect((await errorBar(page).innerText()).match(/key/i), 'the bad-key error does not mention the key');
        await errorBar(page).getByRole('button', { name: 'Close', exact: true }).click();
        expect((await errorBar(page).count()) === 0, 'Close left the error up');
      }
      expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
      return actions.join(' · ');
    });
    await context.close();
  }
}

/** BiTextField's ✦ Fill: nothing sent before the click; a region refusal switches to a
 *  saved DeepSeek key and fills. */
async function fieldChecks(engine, browser) {
  const shot = shooter(engine);
  for (const route of ['', '/region']) {
    const { context, page, leaks, served } = await newContext(browser, { route, serveProviders: { 'api.deepseek.com': '' } });
    if (route) await context.addInitScript(() => sessionStorage.setItem('econgen.secret.ai:deepseek', 'sk-mock-deepseek-0000'));
    await check(engine, route ? 'field ✦ Fill: region refusal, Use DeepSeek fills' : 'field ✦ Fill fills the answer', async () => {
      await openDocument(page, 'english');
      await setLanguage(page, 'EN+中');
      // Question 2 (a) holds the corpus's one model answer: selecting its text opens it.
      await page.locator('#print-root').getByText('Define tax incidence.').first().click();
      const fill = page.getByRole('button', { name: 'Fill 中文', exact: true }).first();
      await fill.waitFor({ timeout: 5000 });
      await fill.scrollIntoViewIfNeeded();
      expect((await fill.locator('svg').count()) === 1, 'no sparkle on the Fill button');
      expect((await mockCount()) === 0 && served.length === 0, 'a request before the Fill click');
      await shot(page, `field-01-button${route.replace('/', '-')}`);
      await fill.click();
      if (route) {
        const use = page.getByRole('button', { name: 'Use DeepSeek', exact: true }).first();
        await use.waitFor({ timeout: 10_000 });
        await shot(page, 'field-02-region');
        await use.click();
      }
      await page.getByText(/^✓ /).first().waitFor({ timeout: 10_000 });
      await shot(page, `field-03-filled${route.replace('/', '-')}`);
      expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
      if (route) expect(served.some((u) => u.includes('api.deepseek.com')), 'the retry did not go to DeepSeek');
    });
    await context.close();
  }
}

// ---- main ----

const GROUPS = { entry: entryChecks, translate: translateChecks, terms: termsChecks, setup: setupChecks, error: errorChecks, field: fieldChecks };
/** Their verbs are paused (`PAUSED_VERBS`): the checks stay, unrun. Unpause the verb, then
 *  move its group back into GROUPS. */
const PAUSED_GROUPS = { answers: answersChecks, source: sourceChecks, quality: qualityChecks };

const mock = await startMockServer(MOCK_PORT);
const app = await startStaticServer(APP_PORT);
try {
  for (const engine of ENGINES) {
    const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' });
    console.log(`${engine}:`);
    try {
      for (const name of ONLY ? ONLY.split(',') : Object.keys(GROUPS)) {
        if (name in PAUSED_GROUPS) console.log(`  ${name}: paused — skipped`);
        else if (!GROUPS[name]) throw new Error(`no group "${name}"`);
        else await GROUPS[name](engine, browser);
      }
      await check(engine, "paused E3's engine was never fetched", () => {
        expect(E3_CHUNKS.length > 0, 'no E3 engine chunk found in out/');
        const got = E3_CHUNKS.filter((f) => fetched.has(f));
        expect(got.length === 0, `fetched ${got.join(', ')}`);
        return E3_CHUNKS.join(', ');
      });
      fetched.clear();
    } finally {
      await browser.close();
    }
  }
} finally {
  mock.close();
  app.close();
}

const failed = results.filter((r) => !r.ok);
for (const engine of ENGINES) {
  const mine = results.filter((r) => r.engine === engine);
  console.log(`${engine}: ${mine.filter((r) => r.ok).length}/${mine.length}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
