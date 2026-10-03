import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * The question bank's ✦ AI browser run: Fill missing 中文 into every identical copy (an
 * edited copy left alone), Undo all, a 25-question batch that asks first and stops part-way,
 * Check terms with Replace across copies, the SetupCard with no key, and a region error.
 * Serves the built `out/`, points Custom at the canned mock (`ai-mock-server.mjs`); no real
 * provider is ever reached (each attempt is stubbed and fails the run).
 *
 *   npm run build && node scripts/bank-ai-verify.mjs [--seed=seed.json] [--out=/tmp/bank-ai-verify]
 *        [--engines=chromium,webkit] [--only=fill,batch,terms,setup,error,layout]
 *
 * `--seed` adds a saved-documents set ({ index, docs: [[id, json]] }) under the run's own
 * documents, so the bank looks like a teacher's; without it the bank holds only those.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const OUT = opt('out', '/tmp/bank-ai-verify');
const ENGINES = opt('engines', 'chromium,webkit').split(',');
const ONLY = opt('only', '');
const SEED = opt('seed', '');
const MOCK_PORT = Number(opt('port', '8788'));
const APP_PORT = Number(opt('app-port', '3418'));
const MOCK_ORIGIN = `http://localhost:${MOCK_PORT}`;
const APP = `http://localhost:${APP_PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' };
function startStaticServer(port) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, APP).pathname);
    const base = join(ROOT, 'out', path);
    const file = [base, `${base}.html`, join(base, 'index.html')].find((p) => p.startsWith(join(ROOT, 'out')) && existsSync(p) && statSync(p).isFile());
    if (!file) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ---- fixtures: plain saved JSON, as a released build writes it ----

const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const template = JSON.parse(readFileSync(join(ROOT, 'src/test/corpus/v1-published.json'), 'utf8'));
const bi = (en, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });

function mcq(id, en, zh, options, extra = {}) {
  return {
    id,
    type: 'mcq',
    blocks: [{ kind: 'paragraph', id: `${id}-b`, text: bi(en, zh) }],
    marks: 1,
    options: options.map(([oe, oz], i) => ({ id: `${id}-o${i}`, text: bi(oe, oz) })),
    answerIndex: 0,
    ...extra,
  };
}

function doc(id, title, questions, createdAt) {
  const { cover: _cover, pageFurniture: _furniture, ...rest } = structuredClone(template);
  void _cover;
  void _furniture;
  return {
    ...rest,
    id,
    name: title,
    title: bi(title),
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question', id: q.id })),
    createdAt,
    updatedAt: createdAt,
  };
}

const COPY_STEM = 'Which of the following describes a perfectly inelastic supply curve?';
const COPY_OPTIONS = [['A vertical line', ''], ['A horizontal line', ''], ['An upward-sloping line', ''], ['A downward-sloping line', '']];
/** The stem with a bold run inside, so a fill's mark on the paper must cross runs. */
const COPY_RUNS = [{ text: 'Which of the following describes a ' }, { text: 'perfectly inelastic', bold: true }, { text: ' supply curve?' }];
const copyQ = (id, stem) => {
  const q = mcq(id, stem ?? COPY_STEM, '', COPY_OPTIONS, { tags: ['C.pes'], ...(id === 'bq-orig' ? {} : { lineage: { rootId: 'bq-orig', fromDocId: 'bank-ai-a' } }) });
  if (stem === undefined) q.blocks[0].text.en = structuredClone(COPY_RUNS);
  return q;
};
const TERMS_OPTIONS = [['rise', '上升'], ['fall', '下跌'], ['stay the same', '不變'], ['double', '倍增']];
const termsQ = (id) => mcq(id, 'Supply falls, so the price will', '供給減少，因此價格會', TERMS_OPTIONS, { tags: ['EL2.trade-theory'], ...(id === 'bq-terms' ? {} : { lineage: { rootId: 'bq-terms', fromDocId: 'bank-ai-t1' } }) });
const BATCH = Array.from({ length: 25 }, (_, i) =>
  mcq(`bq-batch-${i + 1}`, `Growth question ${i + 1}: which factor raises long-run output?`, '', [['More capital', ''], ['Higher prices', ''], ['Lower wages', ''], ['A tariff', '']], { tags: ['EL2.growth'] }),
);

const OWN = {
  copyA: doc('bank-ai-a', 'Copies A (newest)', [copyQ('bq-orig')], '2026-09-20T00:00:00.000Z'),
  copyB: doc('bank-ai-b', 'Copies B', [copyQ('bq-copy-b')], '2026-06-01T00:00:00.000Z'),
  copyC: doc('bank-ai-c', 'Copies C (edited)', [copyQ('bq-copy-c', `${COPY_STEM} Explain.`)], '2026-03-01T00:00:00.000Z'),
  batch: doc('bank-ai-batch', 'Growth batch', BATCH, '2026-05-01T00:00:00.000Z'),
  termsA: doc('bank-ai-t1', 'Terms A', [termsQ('bq-terms')], '2026-04-01T00:00:00.000Z'),
  termsB: doc('bank-ai-t2', 'Terms B', [termsQ('bq-terms-b')], '2026-04-02T00:00:00.000Z'),
};

const seed = SEED ? JSON.parse(readFileSync(SEED, 'utf8')) : { index: [], docs: [] };
const INDEX = [...Object.values(OWN).map((d) => ({ id: d.id, title: d.name, updatedAt: d.updatedAt, questionCount: d.questions.length })), ...seed.index];
const DOCS = [...Object.values(OWN).map((d) => [d.id, JSON.stringify(d)]), ...seed.docs];

// ---- the run ----

const results = [];
async function check(engine, name, fn) {
  try {
    const detail = await fn();
    results.push({ engine, name, ok: true, detail });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    const waiting = e.message.split('\n').find((line) => line.includes('waiting for'));
    const detail = [e.message.split('\n')[0], waiting?.trim()].filter(Boolean).join(' · ');
    results.push({ engine, name, ok: false, detail });
    console.log(`  FAIL ${name} — ${detail}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

const mockCount = async () => (await (await fetch(`${MOCK_ORIGIN}/__count`)).json()).count;
const mockReset = () => fetch(`${MOCK_ORIGIN}/__reset`, { method: 'POST' });

/** Storage as a returning teacher has it; the bank opens at `level`. */
async function newContext(browser, { viewport = { width: 1280, height: 800 }, dark = false, route = '', secret = true, settings = true, level } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, colorScheme: dark ? 'dark' : 'light' });
  context.setDefaultTimeout(10_000);
  const ai = { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK_ORIGIN}${route}/v1` } };
  await context.addInitScript(
    ([indexJson, docs, version, settingsJson, withSecret, levelJson]) => {
      if (sessionStorage.getItem('bank-ai-seeded')) return;
      sessionStorage.setItem('bank-ai-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econ-worksheet-index', indexJson);
      for (const [id, json] of docs) localStorage.setItem(`econ-worksheet:${id}`, json);
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      if (settingsJson) localStorage.setItem('econgen.settings.ai', settingsJson);
      if (withSecret) sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
      if (levelJson) localStorage.setItem('econgen.bankLevel', levelJson);
    },
    [JSON.stringify(INDEX), DOCS, VERSION, settings ? JSON.stringify(ai) : null, secret, level ? JSON.stringify(level) : null],
  );
  const leaks = [];
  await context.route(
    (url) => PROVIDER_HOSTS.includes(url.hostname),
    async (r) => {
      leaks.push(r.request().url());
      return r.fulfill({ status: 599, body: 'blocked by bank-ai-verify' });
    },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  await mockReset();
  return { context, page, leaks };
}

async function openBank(page) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Question bank 題庫/ }).click();
  await page.locator('aside[aria-label="Questions"]').first().waitFor({ timeout: 15_000 });
  await page.waitForTimeout(1200);
}

const railRow = (page, text) => page.locator('[data-rail-root]').filter({ hasText: text });
const door = (page) => page.locator('[data-bank-ai-door]');
const menu = (page) => page.getByRole('dialog', { name: 'AI tools' });
const verb = (page, id) => menu(page).locator(`[data-bank-verb="${id}"]`);
const bar = (page) => page.locator('[data-bank-ai-bar]');
const barButton = (page, name) => bar(page).getByRole('button', { name, exact: true });
/** A saved question's stem 中文, straight from storage. */
const stemZh = (page, docId, questionId) =>
  page.evaluate(([d, q]) => {
    const saved = JSON.parse(localStorage.getItem(`econ-worksheet:${d}`) ?? 'null');
    const question = saved?.questions.find((x) => x.id === q);
    return (question?.blocks?.[0]?.text?.zh ?? []).map((run) => run.text).join('');
  }, [docId, questionId]);
const optionZh = (page, docId, questionId) =>
  page.evaluate(([d, q]) => {
    const saved = JSON.parse(localStorage.getItem(`econ-worksheet:${d}`) ?? 'null');
    const question = saved?.questions.find((x) => x.id === q);
    return (question?.options ?? []).map((o) => o.text.zh.map((run) => run.text).join(''));
  }, [docId, questionId]);
/** Marks drawn on the paper preview (inside its shadow root). */
const paperMarks = (page) =>
  page.evaluate(() => [...document.querySelectorAll('[aria-label^="The question as it prints"]')].reduce((n, host) => n + (host.shadowRoot?.querySelectorAll('[data-ai-mark]').length ?? 0), 0));

const shooter = (engine, tag) => (page, name) => page.screenshot({ path: `${OUT}/${engine}-${tag}-${name}.png` });

async function fillChecks(engine, browser) {
  const shot = shooter(engine, '1280');
  const { context, page, leaks } = await newContext(browser, { level: { kind: 'review', topic: 'C.pes' } });
  await openBank(page);
  await check(engine, 'filter: Missing 中文 keeps only questions lacking 中文', async () => {
    const before = await page.locator('[data-rail-root]').count();
    await page.getByRole('button', { name: /^Filter/ }).click();
    await page.getByRole('dialog', { name: 'Filter questions' }).locator('select').nth(4).selectOption('zh');
    await page.waitForTimeout(300);
    await shot(page, 'filter-01-missing');
    await page.getByRole('dialog', { name: 'Filter questions' }).getByRole('button', { name: 'Done' }).click();
    const after = await page.locator('[data-rail-root]').count();
    const text = await page.locator('[data-rail-root]').first().innerText();
    expect(after === 1 && text.includes('perfectly inelastic'), `${before} → ${after}: ${text}`);
    return `${before} → ${after} questions`;
  });
  await check(engine, 'door: ⌘J / Ctrl+J opens the menu, Esc closes it', async () => {
    await railRow(page, 'perfectly inelastic').first().click();
    await page.waitForTimeout(500);
    await page.keyboard.press('ControlOrMeta+j');
    await menu(page).waitFor({ timeout: 3000 });
    await page.keyboard.press('Escape');
    await menu(page).waitFor({ state: 'detached', timeout: 3000 });
    expect((await page.locator('[data-rail-root]').count()) > 0, 'Esc left the review page');
  });
  await check(engine, 'fill: the door lists Fill missing 中文 for the question on screen; nothing sent yet', async () => {
    await railRow(page, 'perfectly inelastic').first().click();
    await page.waitForTimeout(500);
    await door(page).click();
    await menu(page).waitFor();
    await shot(page, 'fill-01-menu');
    const text = await verb(page, 'fill.zh').innerText();
    expect(text.includes('Fill missing 中文') && text.includes('1 question'), `row says ${text}`);
    expect((await mockCount()) === 0, 'a request left before the click');
    return text.replace(/\s+/g, ' ');
  });
  await check(engine, 'fill: both identical copies get 中文, the edited copy does not', async () => {
    await verb(page, 'fill.zh').click();
    await bar(page).getByText('Filled 中文 in 1 question').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    await shot(page, 'fill-02-review');
    const [a, b, c] = [await stemZh(page, 'bank-ai-a', 'bq-orig'), await stemZh(page, 'bank-ai-b', 'bq-copy-b'), await stemZh(page, 'bank-ai-c', 'bq-copy-c')];
    expect(a.startsWith('譯：') && a === b, `A "${a}" B "${b}"`);
    expect(c === '', `edited copy changed: "${c}"`);
    const [oa, ob] = [await optionZh(page, 'bank-ai-a', 'bq-orig'), await optionZh(page, 'bank-ai-b', 'bq-copy-b')];
    expect(JSON.stringify(oa) === JSON.stringify(ob) && oa.every((t) => t.startsWith('譯：')), 'options differ between copies');
    // The paper as the bank wrote it, for an export check (`.docx` is the load-bearing output).
    writeFileSync(`${OUT}/${engine}-translated-copy.json`, await page.evaluate(() => localStorage.getItem('econ-worksheet:bank-ai-b')));
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
    return `A = B = ${a}`;
  });
  await check(engine, 'fill: the bank still shows one question (2 versions), marked in the rail and on the paper', async () => {
    const rows = await railRow(page, 'perfectly inelastic').count();
    const text = await railRow(page, 'perfectly inelastic').first().innerText();
    expect(rows === 1, `${rows} rail rows`);
    expect(text.includes('2 versions'), `row: ${text}`);
    expect((await page.locator('[data-bank-ai]').count()) >= 1, 'no ✦ in the rail');
    const marks = await paperMarks(page);
    expect(marks > 0, 'no marks on the paper');
    // The stem's 中文 holds a bold run: its mark crosses it.
    const stemMarked = await page.evaluate(() =>
      [...document.querySelectorAll('[aria-label^="The question as it prints"]')].some((host) =>
        [...(host.shadowRoot?.querySelectorAll('[data-ai-mark]') ?? [])].some((mark) => mark.textContent.includes('譯：Which')),
      ),
    );
    expect(stemMarked, 'the stem (split across runs) is not marked');
    expect((await page.locator('[data-bank-ai-note]').count()) === 1, 'no note above the paper');
    return `${marks} marks on the paper`;
  });
  await check(engine, 'fill: Undo all puts both copies back', async () => {
    await barButton(page, 'Undo all').click();
    await bar(page).waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(600);
    await shot(page, 'fill-03-undone');
    const [a, b] = [await stemZh(page, 'bank-ai-a', 'bq-orig'), await stemZh(page, 'bank-ai-b', 'bq-copy-b')];
    expect(a === '' && b === '', `A "${a}" B "${b}"`);
    const notice = await page.getByText('Put back 1 question as it was.').count();
    expect(notice > 0, 'no notice');
  });
  await context.close();
}

async function batchChecks(engine, browser) {
  const shot = shooter(engine, '1280');
  const { context, page, leaks } = await newContext(browser, { route: '/slow', level: { kind: 'review', topic: 'EL2' } });
  await openBank(page);
  await check(engine, 'batch: 25 questions shown ask first, with a rough time', async () => {
    await door(page).click();
    await menu(page).locator('[data-bank-ai-scope="shown"]').click();
    const text = await verb(page, 'fill.zh').innerText();
    expect(text.includes('25 questions'), `row says ${text}`);
    await verb(page, 'fill.zh').click();
    const confirm = menu(page).locator('[data-bank-ai-confirm]');
    await confirm.waitFor();
    await shot(page, 'batch-01-confirm');
    const line = await confirm.innerText();
    expect(line.includes('Translate 25 questions?') && /about \d+ minutes?/.test(line), `confirm says ${line}`);
    expect((await mockCount()) === 0, 'sent before the confirm');
    return line.split('\n')[0];
  });
  await check(engine, 'batch: Stop part-way keeps what is done', async () => {
    await menu(page).getByRole('button', { name: 'Translate 25' }).click();
    await bar(page).getByText(/2 of 25/).waitFor({ timeout: 20_000 });
    await shot(page, 'batch-02-running');
    await barButton(page, 'Stop').click();
    const summary = bar(page).getByText(/^Stopped\. \d+ of 25 done/);
    await summary.waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await shot(page, 'batch-03-stopped');
    const said = await summary.innerText();
    const done = Number(/Stopped\. (\d+) of 25/.exec(said)[1]);
    const filled = [];
    for (let i = 1; i <= 25; i += 1) filled.push((await stemZh(page, 'bank-ai-batch', `bq-batch-${i}`)) !== '');
    const count = filled.filter(Boolean).length;
    expect(count === done, `said ${done}, stored ${count}`);
    expect(done >= 2 && done < 25, `done ${done}`);
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
    return said;
  });
  await context.close();
}

async function termsChecks(engine, browser) {
  const shot = shooter(engine, '1280');
  const { context, page, leaks } = await newContext(browser, { level: { kind: 'review', topic: 'EL2.trade-theory' } });
  await openBank(page);
  await check(engine, 'terms: keyless, finds 供給, Replace fixes every identical copy', async () => {
    await railRow(page, 'Supply falls').first().click();
    await page.waitForTimeout(400);
    await door(page).click();
    await verb(page, 'terms').click();
    await bar(page).getByText(/to fix/).waitFor({ timeout: 10_000 });
    await page.waitForTimeout(600);
    await shot(page, 'terms-01-findings');
    const note = page.locator('[data-bank-ai-note]');
    expect((await note.innerText()).includes('供應'), 'the note does not offer 供應');
    const replace = bar(page).getByRole('button', { name: /^Replace \d+$/ });
    await replace.click();
    await page.waitForTimeout(800);
    await shot(page, 'terms-02-replaced');
    const [a, b] = [await stemZh(page, 'bank-ai-t1', 'bq-terms'), await stemZh(page, 'bank-ai-t2', 'bq-terms-b')];
    expect(a.includes('供應') && a === b, `A "${a}" B "${b}"`);
    expect((await mockCount()) === 0 && leaks.length === 0, 'Check terms sent something');
    return a;
  });
  await check(engine, 'terms: Undo all takes the replacement back in both copies', async () => {
    await barButton(page, 'Undo all').click();
    await page.waitForTimeout(800);
    const [a, b] = [await stemZh(page, 'bank-ai-t1', 'bq-terms'), await stemZh(page, 'bank-ai-t2', 'bq-terms-b')];
    expect(a.includes('供給') && b.includes('供給'), `A "${a}" B "${b}"`);
  });
  await context.close();
}

async function setupChecks(engine, browser) {
  const shot = shooter(engine, '1280');
  const { context, page, leaks } = await newContext(browser, { settings: false, secret: false, level: { kind: 'review', topic: 'C.pes' } });
  await openBank(page);
  await check(engine, 'no key: Fill opens the SetupCard; nothing sent', async () => {
    await railRow(page, 'perfectly inelastic').first().click();
    await door(page).click();
    await verb(page, 'fill.zh').click();
    await menu(page).locator('[data-setup-card]').waitFor();
    await page.waitForTimeout(300);
    await shot(page, 'setup-01-card');
    expect((await menu(page).getByRole('button', { name: 'Save & continue' }).count()) === 1, 'no Save & continue');
    expect((await mockCount()) === 0 && leaks.length === 0, 'something was sent');
  });
  await context.close();
}

async function errorChecks(engine, browser) {
  const shot = shooter(engine, '1280');
  const { context, page, leaks } = await newContext(browser, { route: '/region', level: { kind: 'review', topic: 'C.pes' } });
  await openBank(page);
  await check(engine, 'error: a region refusal shows the error bar with Try again; nothing written', async () => {
    await railRow(page, 'perfectly inelastic').first().click();
    await door(page).click();
    await verb(page, 'fill.zh').click();
    const alert = page.getByRole('alert', { name: 'AI' });
    await alert.waitFor({ timeout: 10_000 });
    await shot(page, 'error-01-region');
    const text = await alert.innerText();
    expect(text.includes('Try again'), `bar says ${text}`);
    expect((await stemZh(page, 'bank-ai-a', 'bq-orig')) === '', 'written despite the error');
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
    return text.split('\n')[0];
  });
  await context.close();
}

/** Layout at 1024×768 and in dark: the menu, a review, a confirm. Screenshots, plus overflow checks. */
async function layoutChecks(engine, browser) {
  for (const [w, h, dark] of [[1024, 768, false], [1024, 768, true], [1280, 800, true]]) {
    const tag = `${w}${dark ? '-dark' : ''}`;
    const shot = shooter(engine, tag);
    const { context, page } = await newContext(browser, { viewport: { width: w, height: h }, dark, level: { kind: 'review', topic: 'C.pes' } });
    await openBank(page);
    await check(engine, `layout ${tag}: menu and review fit, no horizontal scroll`, async () => {
      await railRow(page, 'perfectly inelastic').first().click();
      await door(page).click();
      await menu(page).waitFor();
      await shot(page, 'layout-01-menu');
      const box = await menu(page).boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= w, `menu at ${box?.x}..${box && box.x + box.width}`);
      await verb(page, 'fill.zh').click();
      await bar(page).getByText('Filled 中文 in 1 question').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(700);
      await shot(page, 'layout-02-review');
      const barBox = await bar(page).boundingBox();
      expect(barBox && barBox.x >= 0 && barBox.x + barBox.width <= w, 'bar off screen');
      const scroll = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(scroll <= 0, `horizontal scroll ${scroll}px`);
    });
    await context.close();
  }
}

const GROUPS = { fill: fillChecks, batch: batchChecks, terms: termsChecks, setup: setupChecks, error: errorChecks, layout: layoutChecks };

const mock = await startMockServer(MOCK_PORT);
const app = await startStaticServer(APP_PORT);
try {
  for (const engine of ENGINES) {
    console.log(`\n${engine}`);
    const browser = engine === 'webkit' ? await webkit.launch() : await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
    for (const [name, run] of Object.entries(GROUPS)) {
      if (ONLY && !ONLY.split(',').includes(name)) continue;
      await run(engine, browser);
    }
    await browser.close();
  }
} finally {
  mock.close();
  app.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
