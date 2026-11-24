import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

/**
 * The DSEcon Mentor account against a REAL Mentor (k-0519): a dev server with hosted AI on
 * (`Outbox/k-0518/CONTRACT.md`), real Gemini calls, so keep runs few. Serves the built `out/`
 * with Settings pointing the account at --api, then, in steps (--only=a,b):
 *   signin   Settings → Sign in, the dev site's Allow page (website session cookie from
 *            --cookie-file, a JSON {name,value,domain,path}), the credits and packs;
 *   studio   one studio send: a past-paper reference with its diagram (a picture to the AI),
 *            one question with a diagram, streamed;
 *   import   one import check of --docx on the import review;
 *   broke    no credits (`--set-state` balance 0): the error and its buttons;
 *   cap      the month's limit (`--set-state` month-spent): the error and its buttons.
 * The sign-in is kept between runs in --state (mode 600, outside the repo). Screenshots → --out.
 * `--set-state` is the command that changes the test account on the dev database, given the
 * words after it (`balance 0`, `month-spent 2500`, `reset`).
 *
 *   NEXT_PUBLIC_MENTOR_ORIGIN=http://localhost:3124 npm run build && \
 *   node scripts/hosted-ai-live.mjs --api=http://localhost:3124/api/app/v1 \
 *     --cookie-file=… --docx=… --out=/tmp/hosted-ai-live --state=/tmp/zz/state.json \
 *     [--set-state="node …/set-state.mjs"] [--only=signin,studio,import,broke,cap]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const API = opt('api', 'http://localhost:3124/api/app/v1');
const SITE = new URL(API).origin;
const OUT = opt('out', '/tmp/hosted-ai-live');
const STATE = opt('state', '/tmp/hosted-ai-live-state.json');
const COOKIE_FILE = opt('cookie-file');
const DOCX = opt('docx');
const SET_STATE = opt('set-state');
const SET_STATE_CWD = opt('set-state-cwd', process.cwd());
const ONLY = opt('only', 'signin,studio,import,broke,cap').split(',');
const APP_PORT = Number(opt('app-port', '3421'));
const BANK_PORT = Number(opt('bank-port', '3422'));
const APP = `http://localhost:${APP_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PROVIDER_HOSTS = ['generativelanguage.googleapis.com', 'api.deepseek.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];

mkdirSync(OUT, { recursive: true });
if (!existsSync(join(ROOT, 'out/index.html'))) {
  console.error('out/ is missing: run `npm run build` first.');
  process.exit(1);
}
// The Mentor a build talks to is fixed when it is built (src/ai/mentorOrigin.ts), never stored.
const chunks = join(ROOT, 'out/_next/static/chunks');
if (!readdirSync(chunks).some((f) => f.endsWith('.js') && readFileSync(join(chunks, f), 'utf8').includes(SITE))) {
  console.error(`out/ was not built for ${SITE}: run NEXT_PUBLIC_MENTOR_ORIGIN=${SITE} npm run build first.`);
  process.exit(1);
}

// ---- static app and an invented Past paper bank (one question with a demand-curve diagram) ----

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const serve = (port, handler) => new Promise((resolve) => { const s = createServer(handler); s.listen(port, () => resolve(s)); });
const appServer = await serve(APP_PORT, (req, res) => {
  const path = decodeURIComponent(new URL(req.url, APP).pathname);
  const base = join(ROOT, 'out', path);
  const file = [base, `${base}.html`, join(base, 'index.html')].find((p) => p.startsWith(join(ROOT, 'out')) && existsSync(p) && statSync(p).isFile());
  if (!file) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' }).end(readFileSync(file));
});

const DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="250" viewBox="0 0 330 250" font-family="Times New Roman" font-size="13">
<polyline points="50,12 50,220 318,220" fill="none" stroke="#111" stroke-width="1.2"/>
<text x="44" y="8">Price ($)</text><text x="318" y="246" text-anchor="end">Quantity</text><text x="42" y="234" text-anchor="end">0</text>
<line x1="76" y1="40" x2="284" y2="200" stroke="#111" stroke-width="1.6"/><text x="288" y="210">D</text>
<polyline points="50,80 128,80 128,220" fill="none" stroke="#555" stroke-dasharray="3 3"/><polyline points="50,120 180,120 180,220" fill="none" stroke="#555" stroke-dasharray="3 3"/>
<circle cx="128" cy="80" r="3"/><circle cx="180" cy="120" r="3"/><text x="134" y="74">A</text><text x="186" y="114">B</text>
<text x="44" y="84" text-anchor="end">12</text><text x="44" y="124" text-anchor="end">10</text><text x="128" y="234" text-anchor="middle">400</text><text x="180" y="234" text-anchor="middle">600</text></svg>`;
/** The diagram as a PNG: the studio sends PNG, JPEG, WebP or GIF pictures, never SVG (`src/questionStudio/figures.ts`). */
async function diagramPng() {
  const b = await chromium.launch({ channel: 'chrome' });
  const p = await b.newPage({ viewport: { width: 330, height: 250 } });
  await p.setContent(`<body style="margin:0;background:#fff">${DIAGRAM}</body>`);
  const png = await p.locator('svg').screenshot({ type: 'png' });
  await b.close();
  return `data:image/png;base64,${png.toString('base64')}`;
}
const PICTURE = await diagramPng();
const bi = (en, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const Q = {
  id: 'pp-q1',
  type: 'mcq',
  blocks: [
    { kind: 'paragraph', id: 'pp-q1-b', text: bi('The diagram below shows the demand curve for concert tickets. When the price falls from $12 to $10, the quantity demanded rises from 400 to 600. Over this price range, the demand for tickets is', '下圖顯示演唱會門票的需求曲線。當價格由 $12 跌至 $10，需求量由 400 增至 600。在這個價格範圍內，門票的需求') },
    { kind: 'image', id: 'pp-q1-img', src: PICTURE, widthPx: 300, heightPx: 227, naturalWidthPx: 330, naturalHeightPx: 250, align: 'center', altText: bi('Demand curve D with points A and B', '需求曲線 D 及 A、B 兩點') },
  ],
  marks: 1,
  options: [['price elastic.', '富有價格彈性。'], ['price inelastic.', '缺乏價格彈性。'], ['unitarily elastic.', '屬單一價格彈性。'], ['perfectly inelastic.', '完全缺乏價格彈性。']].map(([en, zh], i) => ({ id: `pp-q1-o${i}`, text: bi(en, zh) })),
  answerIndex: 0,
  tags: ['C.ped', 'DSE2099/P1/Q12'],
  lineage: { rootId: 'pp:DSE2099/P1/Q12' },
};
const BANK_DOC = { v: 3, id: 'pp-bank-C', kind: 'bank', name: 'Demand and elasticity', title: bi('Demand and elasticity'), questions: [Q], layout: [], flow: [{ type: 'question', id: Q.id }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const MANIFEST = {
  version: 1, enabled: true, questions: 1,
  topics: [{ id: 'C', title: { en: 'Demand and elasticity', zh: '需求與彈性' }, file: 'topics/C.json', questions: 1, syllabus: ['C.ped'] }],
  search: { version: 1, questions: [{ topic: 'C', source: 'DSE2099/P1/Q12', en: 'concert tickets demand price elastic', zh: '演唱會門票', pictures: 1 }] },
};
const bankServer = await serve(BANK_PORT, (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const path = new URL(req.url, BANK).pathname;
  if (path === '/manifest.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(MANIFEST));
  if (path === '/topics/C.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(BANK_DOC));
  res.writeHead(404).end('not found');
});

// A worksheet for the error steps: the frozen corpus with its 中文 emptied (only read).
const corpus = JSON.parse(readFileSync(join(ROOT, 'src/test/corpus/v1-published.json'), 'utf8'));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const englishOnly = (node) => {
  if (Array.isArray(node)) return node.map(englishOnly);
  if (!node || typeof node !== 'object') return node;
  const out = Object.fromEntries(Object.entries(node).map(([k, v]) => [k, englishOnly(v)]));
  if (Array.isArray(node.en) && Array.isArray(node.zh)) out.zh = [];
  return out;
};
const DOC = { ...englishOnly(corpus), id: 'hosted-ai-live', title: { en: [{ text: 'Hosted AI live' }], zh: [] } };

// ---- the run ----

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ name, ok: false });
    console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const setState = (...words) => {
  if (!SET_STATE) throw new Error('no --set-state command given');
  const [cmd, ...rest] = SET_STATE.split(' ');
  return execFileSync(cmd, [...rest, ...words], { cwd: SET_STATE_CWD, encoding: 'utf8' }).trim().split('\n').at(-1);
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  ...(existsSync(STATE) && !ONLY.includes('signin') ? { storageState: STATE } : {}),
});
context.setDefaultTimeout(20_000);
await context.addInitScript(
  ([bank, doc, version]) => {
    if (sessionStorage.getItem('live-seeded')) return;
    sessionStorage.setItem('live-seeded', '1');
    localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: bank }));
    localStorage.setItem('econ-worksheet-last-seen-version', version);
    const index = JSON.parse(localStorage.getItem('econ-worksheet-index') ?? '[]');
    if (!index.some((row) => row.id === doc.id)) {
      localStorage.setItem('econ-worksheet-index', JSON.stringify([...index, { id: doc.id, title: 'Hosted AI live', updatedAt: doc.updatedAt }]));
      localStorage.setItem(`econ-worksheet:${doc.id}`, JSON.stringify(doc));
    }
  },
  [BANK, DOC, VERSION],
);
const leaks = [];
await context.route((url) => PROVIDER_HOSTS.includes(url.hostname), (route) => {
  leaks.push(route.request().url());
  return route.fulfill({ status: 599, body: 'blocked' });
});
/** Every call to Mentor: path, feature, stream, pictures; never the body itself. */
const calls = [];
context.on('request', (req) => {
  if (!req.url().startsWith(API) || req.method() === 'OPTIONS') return;
  let body = {};
  try {
    body = JSON.parse(req.postData() ?? '{}');
  } catch {}
  const pictures = JSON.stringify(body.request?.contents ?? []).split('"inlineData"').length - 1;
  calls.push({ path: req.url().slice(API.length), feature: body.feature, stream: body.stream, pictures });
});
context.on('response', async (res) => {
  if (!res.url().startsWith(API) || res.request().method() === 'OPTIONS') return;
  const hit = [...calls].reverse().find((c) => c.path === res.url().slice(API.length) && c.status === undefined);
  if (hit) hit.status = res.status();
});

const page = await context.newPage();
page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
const shot = (name) => page.screenshot({ path: join(OUT, `${name}.png`) });
const META = process.platform === 'darwin' ? 'Meta' : 'Control';
const settings = page.getByRole('dialog', { name: /Settings/ });
const account = settings.locator('[data-mentor-account]');
const home = async () => page.goto(APP, { waitUntil: 'networkidle' });
const openSettings = async () => {
  await page.keyboard.press(`${META}+Comma`);
  await account.waitFor();
};
const callsSince = (n) => calls.slice(n);
const credits = async () => (await account.locator('text=/credits left/').innerText()).trim();

await home();

if (ONLY.includes('signin')) {
  await check('Sign in with DSEcon Mentor against the dev server: code, Allow on the site, credits and packs', async () => {
    expect(COOKIE_FILE, '--cookie-file is needed to Allow on the dev site');
    const cookie = JSON.parse(readFileSync(COOKIE_FILE, 'utf8'));
    await context.addCookies([{ ...cookie, domain: new URL(SITE).hostname, path: cookie.path ?? '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
    await openSettings();
    await account.getByRole('button', { name: 'Sign in with DSEcon Mentor' }).click();
    const codeEl = account.locator('p.font-mono');
    await codeEl.waitFor();
    const code = (await codeEl.innerText()).trim();
    await shot('01-signin-code');
    const site = await context.newPage();
    await site.goto(`${SITE}/link?code=${encodeURIComponent(code)}`, { waitUntil: 'networkidle' });
    await site.screenshot({ path: join(OUT, '02-allow-page.png') });
    await site.getByRole('button', { name: /^Allow|允許/ }).first().click();
    await site.waitForTimeout(1500);
    await site.screenshot({ path: join(OUT, '03-allowed.png') });
    await site.close();
    await settings.locator('[data-mentor-account="signedIn"]').waitFor({ timeout: 30_000 });
    await account.locator('text=/credits left/').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await shot('04-signed-in');
    const packs = await account.locator('[data-mentor-packs]').innerText().catch(() => '');
    await context.storageState({ path: STATE });
    chmodSync(STATE, 0o600);
    expect(!(await page.content()).includes('dsm_'), 'a token is in the page');
    return `code ${code}; ${await credits()}; ${packs}`;
  });
  await page.keyboard.press('Escape');
}

if (ONLY.includes('studio')) {
  await check('Question studio on the account: a reference with its diagram, one question with a diagram, streamed', async () => {
    const before = calls.length;
    await home();
    await page.getByRole('button', { name: /Question studio 擬題工作室/ }).first().click();
    await page.locator('[data-studio-screen]').waitFor();
    await page.locator('[data-start-pick], [data-add-reference]').first().click();
    const card = page.locator('[data-reference-picker] [data-reference-card]', { hasText: 'DSE2099/P1/Q12' }).first();
    await card.waitFor({ timeout: 30_000 });
    await card.click();
    await page.getByRole('button', { name: 'Use as reference' }).click();
    await page.locator('[data-ref-chip]').waitFor();
    await page.locator('[data-chat-input]').fill('Write 1 question like this, with its own diagram.');
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-chat-draft]').first().waitFor({ timeout: 120_000 });
    await shot('05-studio-writing');
    await page.locator('[data-chat-send]').waitFor({ timeout: 240_000 });
    await page.waitForTimeout(800);
    await shot('06-studio-done');
    const sent = callsSince(before).filter((c) => c.path === '/ai/generate');
    expect(sent.length > 0, 'nothing went to /ai/generate');
    expect(sent.some((c) => c.stream === true), 'no streamed call');
    expect(sent.some((c) => c.pictures > 0), 'the reference picture never went to the AI');
    expect(sent.every((c) => c.status === 200), `a call failed: ${sent.map((c) => `${c.feature}:${c.status}`).join(', ')}`);
    const drafts = await page.locator('[data-chat-draft]').count();
    const diagrams = await page.locator('[data-chat-draft] svg, [data-chat-draft] img').count();
    return `${sent.length} calls (${sent.map((c) => `${c.feature}${c.stream ? '~' : ''}${c.pictures ? `+${c.pictures}pic` : ''}`).join(', ')}); ${drafts} draft(s), ${diagrams} picture(s)/diagram(s) on the paper`;
  });
}

if (ONLY.includes('import')) {
  await check('Import check on the account: the review bar’s ✦ AI check of a Word paper', async () => {
    expect(DOCX, '--docx is needed');
    const before = calls.length;
    await home();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /^Import from Word, PDF or picture/ }).first().click()]);
    await chooser.setFiles([DOCX]);
    const dialog = page.getByRole('dialog').first();
    const review = dialog.getByRole('button', { name: /^Review the paper/ });
    await Promise.race([review.waitFor({ timeout: 60_000 }), dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 })]);
    if (await review.count()) await review.click();
    await dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 });
    await dialog.locator('[data-check-import]').click().catch(() => undefined);
    await page.waitForTimeout(600);
    await shot('07-import-estimate');
    await dialog.locator('[data-ai-bar]').click();
    await dialog.locator('[data-ai-check="done"], [data-ai-check="failed"]').waitFor({ timeout: 180_000 });
    await page.waitForTimeout(500);
    await shot('08-import-checked');
    const state = await dialog.locator('[data-ai-check]').getAttribute('data-ai-check');
    const sent = callsSince(before).filter((c) => c.path === '/ai/generate');
    expect(state === 'done', `the check ${state}: ${(await dialog.locator('[data-ai-check]').innerText()).replace(/\n/g, ' | ')}`);
    expect(sent.length > 0 && sent.every((c) => c.feature === 'importCheck' && c.status === 200), `calls ${JSON.stringify(sent)}`);
    await page.keyboard.press('Escape');
    return `${sent.length} call(s); ${(await dialog.locator('[data-ai-check]').innerText().catch(() => '')).split('\n')[0]}`;
  });
}

/** Runs ✦ AI → Fill missing 中文 on the seeded paper and returns the error bar. */
async function failingRun(expectText, shotName) {
  await home();
  await page.getByRole('button', { name: /Hosted AI live/ }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
  await page.getByRole('radio', { name: '中文', exact: true }).first().click();
  await page.locator('[data-ai-door]').click();
  const menu = page.getByRole('dialog', { name: 'AI tools' });
  await menu.waitFor();
  await menu.locator('[data-verb^="translate."]').first().click();
  const error = page.getByRole('alert', { name: 'AI' });
  await error.getByText(expectText).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(300);
  await shot(shotName);
  const buttons = await error.getByRole('button').allInnerTexts();
  await page.keyboard.press('Escape');
  return buttons.map((b) => b.trim()).filter(Boolean);
}

if (ONLY.includes('broke')) {
  await check('No credits: Mentor refuses before Google; the error says so, with Buy credits and Use my own key', async () => {
    const said = setState('balance', '0');
    const before = calls.length;
    const buttons = await failingRun(/Not enough AI credits/, '09-no-credits');
    const sent = callsSince(before).filter((c) => c.path === '/ai/generate');
    expect(sent.length > 0 && sent.every((c) => c.status === 402), `calls ${JSON.stringify(sent)}`);
    expect(buttons.includes('Buy credits') && buttons.includes('Use my own key…'), `buttons ${buttons.join(', ')}`);
    return `${said}; buttons: ${buttons.join(' · ')}`;
  });
}

if (ONLY.includes('cap')) {
  await check('The month’s limit: Mentor refuses; the error says so, with Use my own key', async () => {
    const said = setState('month-spent', '2500');
    const before = calls.length;
    const buttons = await failingRun(/monthly AI limit/, '10-monthly-cap');
    const sent = callsSince(before).filter((c) => c.path === '/ai/generate');
    expect(sent.length > 0 && sent.every((c) => c.status === 429), `calls ${JSON.stringify(sent)}`);
    expect(buttons.includes('Use my own key…'), `buttons ${buttons.join(', ')}`);
    return `${said}; buttons: ${buttons.join(' · ')}`;
  });
}

if (SET_STATE && (ONLY.includes('broke') || ONLY.includes('cap'))) console.log(`  reset: ${setState('reset')}`);

await check('Settings afterwards: the credits Mentor reports', async () => {
  await home();
  await openSettings();
  await account.locator('text=/credits left/').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
  await shot('11-settings-after');
  return await credits();
});

writeFileSync(join(OUT, 'calls.json'), JSON.stringify(calls, null, 2));
await browser.close();
appServer.close();
bankServer.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · ${calls.filter((c) => c.path === '/ai/generate').length} generate call(s) · leaks: ${leaks.length} · screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
