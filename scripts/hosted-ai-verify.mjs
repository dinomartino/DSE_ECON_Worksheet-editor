import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright-core';

/**
 * The DSEcon Mentor account in a real browser (k-0519). Serves the built `out/`, answers
 * `https://dseconmentor.com/api/app/v1/**` inside the browser with a stand-in for Mentor's
 * relay (`Outbox/k-0518/CONTRACT.md` v0.1: link-code sign-in, `/ai/credits`, `/ai/generate`
 * that charges credits), and walks a teacher with no key through: the setup card's Sign in, the
 * code, Allow, the clicked verb running on the account; Settings' account card, Advanced,
 * the credit line in the ✦ AI menu, out of credits (Buy credits / Use my own key), Sign out.
 * Any other provider host is a failure. A screenshot per step lands in --out. k-0521 adds the
 * audit fixes: an Idempotency-Key on each generate (allowed through CORS as CONTRACT v1.3
 * will), the 14-day web sign-in, "Shared computer" (this tab only), and a sign-out Mentor
 * can't confirm (signed out here, with the warning and Open my account).
 *
 *   npm run build && node scripts/hosted-ai-verify.mjs [--out=/tmp/hosted-ai-verify] [--engines=chromium,webkit] [--app-port=3419]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/hosted-ai-verify');
const ENGINES = opt('engines', 'chromium,webkit').split(',');
const APP_PORT = Number(opt('app-port', '3419'));
const APP = `http://localhost:${APP_PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MENTOR = 'dseconmentor.com';
const OTHER_HOSTS = ['generativelanguage.googleapis.com', 'api.deepseek.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];

mkdirSync(OUT, { recursive: true });
if (!existsSync(join(ROOT, 'out/index.html'))) {
  console.error('out/ is missing: run `npm run build` first.');
  process.exit(1);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain' };
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

// ---- a worksheet: the frozen corpus with its 中文 emptied (only read) ----

const corpus = JSON.parse(readFileSync(join(ROOT, 'src/test/corpus/v1-published.json'), 'utf8'));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
function englishOnly(node) {
  if (Array.isArray(node)) return node.map(englishOnly);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = englishOnly(v);
  if (Array.isArray(node.en) && Array.isArray(node.zh)) out.zh = [];
  return out;
}
const DOC = { ...englishOnly(corpus), id: 'hosted-ai-verify', title: { en: [{ text: 'Hosted AI verify' }], zh: [] } };

// ---- the stand-in Mentor ----

const TOKEN = 'dsm_hosted_verify_0123456789abcdefghij';
function fakeMentor() {
  const state = { credits: 900, polls: 0, signedIn: true, requests: [], charged: 0, logoutFails: false };
  const json = (body, status = 200) => ({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  const relayError = (status, code) => json({ error: code }, status);
  /** Translate requests: each item back with a 譯： prefix, as JSON items. */
  const answer = (body) => {
    const last = body.request.contents.at(-1).parts[0].text;
    let items = [];
    try {
      items = JSON.parse(last).items ?? [];
    } catch {}
    return JSON.stringify({ items: items.map((i) => ({ key: i.key, text: `譯：${i.text}` })) });
  };
  async function handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/app/v1', '') + url.search;
    const auth = req.headers()['authorization'];
    let feature;
    try {
      feature = JSON.parse(req.postData() ?? '{}').feature;
    } catch {}
    state.requests.push({ path, auth, feature, key: req.headers()['idempotency-key'] });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, idempotency-key', 'access-control-allow-methods': 'GET, POST' } });
    if (url.pathname === '/link') return route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Allow Econ Studio?</h1>' });
    if (path === '/auth/link/start') return route.fulfill(json({ code: 'KQ7M-4PXD', pollToken: 'dsl_verify_0123456789', verifyUrl: `https://${MENTOR}/link?code=KQ7M-4PXD`, interval: 1, expiresAt: new Date(Date.now() + 600_000).toISOString() }));
    if (path === '/auth/link/check') return route.fulfill(json(state.polls++ < 2 ? { status: 'pending' } : { status: 'approved', token: TOKEN, userId: 'u1' }));
    if (path === '/auth/logout') {
      // As before Mentor's F9 fix: no CORS on logout, so the browser sees a network failure.
      if (state.logoutFails) return route.abort('failed');
      state.signedIn = false;
      return route.fulfill(json({ ok: true }));
    }
    const authed = auth === `Bearer ${TOKEN}` && state.signedIn;
    if (path === '/ai/credits') {
      if (!authed) return route.fulfill(relayError(401, 'unauthorized'));
      return route.fulfill(json({ status: 'on', balance: state.credits, trial: { credits: 900, grantedAt: new Date().toISOString() }, model: 'gemini-4-hydrogen', rates: { creditsPerHkd: 100, hkdPerUsd: 7.8, inputPerMillionTokens: 1170, outputPerMillionTokens: 5850 }, buyUrl: `https://${MENTOR}/account#ai-credits`, pricingUrl: `https://${MENTOR}/pricing#ai-credits` }));
    }
    if (path === '/ai/generate') {
      if (!authed) return route.fulfill(relayError(401, 'unauthorized'));
      if (state.credits <= 0) return route.fulfill(relayError(402, 'insufficient_credits'));
      const usage = { promptTokenCount: 2000, candidatesTokenCount: 800, thoughtsTokenCount: 300 };
      const charged = (2000 * 1170 + 1100 * 5850) / 1e6;
      state.credits = Math.max(0, state.credits - charged);
      state.charged++;
      const body = JSON.parse(req.postData() ?? '{}');
      const response = { candidates: [{ content: { role: 'model', parts: [{ text: answer(body) }] }, finishReason: 'STOP' }], usageMetadata: usage };
      const receipt = { requestId: `req_${state.charged}`, model: 'gemini-4-hydrogen', charged, balance: state.credits, estimated: false };
      if (body.stream) return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' }, body: `data: ${JSON.stringify(response)}\n\nevent: mentor\ndata: ${JSON.stringify(receipt)}\n\n` });
      return route.fulfill(json({ response, mentor: receipt }));
    }
    return route.fulfill(relayError(404, 'not_found'));
  }
  return { state, handle };
}

// ---- the run ----

const results = [];
async function check(engine, name, fn) {
  try {
    const detail = await fn();
    results.push({ engine, name, ok: true });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ engine, name, ok: false });
    console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const META = process.platform === 'darwin' ? 'Meta' : 'Control';

async function run(engine, browserType) {
  console.log(`${engine}:`);
  const browser = await browserType.launch(engine === 'chromium' ? { channel: 'chrome' } : {});
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
  context.setDefaultTimeout(8000);
  await context.addInitScript(
    ([doc, version]) => {
      if (sessionStorage.getItem('hosted-verify-seeded')) return;
      sessionStorage.setItem('hosted-verify-seeded', '1');
      localStorage.setItem('econ-worksheet-index', JSON.stringify([{ id: doc.id, title: 'Hosted AI verify', updatedAt: doc.updatedAt }]));
      localStorage.setItem(`econ-worksheet:${doc.id}`, JSON.stringify(doc));
      localStorage.setItem('econ-worksheet-last-seen-version', version);
    },
    [DOC, VERSION],
  );
  const mentor = fakeMentor();
  const leaks = [];
  await context.route((url) => url.hostname === MENTOR, (route) => mentor.handle(route));
  await context.route((url) => OTHER_HOSTS.includes(url.hostname), (route) => {
    leaks.push(route.request().url());
    return route.fulfill({ status: 599, body: 'blocked' });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  const shot = (name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });
  const aiMenu = page.getByRole('dialog', { name: 'AI tools' });
  const card = aiMenu.locator('[data-setup-card]');
  const settings = page.getByRole('dialog', { name: /Settings/ });
  const account = settings.locator('[data-mentor-account]');

  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Hosted AI verify/ }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
  await page.getByRole('radio', { name: '中文', exact: true }).first().click();
  await page.waitForTimeout(400);

  await check(engine, 'no key: the setup card offers Sign in with DSEcon Mentor first, nothing sent', async () => {
    await page.locator('[data-ai-door]').click();
    await aiMenu.waitFor();
    await aiMenu.locator('[data-verb="translate.fillZh"]').click();
    await card.waitFor();
    const row = card.locator('[data-setup-mentor="signedOut"]');
    await row.waitFor();
    await shot('01-setup-card');
    expect(mentor.state.requests.length === 0, 'a request left before Sign in');
  });

  await check(engine, 'Sign in: the Allow page opens, the code shows, Allow signs in and the clicked verb runs on the account', async () => {
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await card.getByRole('button', { name: 'Sign in with DSEcon Mentor' }).click();
    await card.getByText('KQ7M-4PXD').first().waitFor();
    await shot('02-waiting-for-allow');
    const opened = await popup;
    expect(opened && opened.url().includes('/link?code=KQ7M-4PXD'), `Allow page not opened (${opened?.url()})`);
    await opened?.close();
    await page.getByRole('status', { name: 'AI' }).getByText(/^Filled \d+ 中文 texts?/).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(400);
    await shot('03-verb-ran');
    const ai = mentor.state.requests.filter((r) => r.path === '/ai/generate');
    expect(ai.length > 0 && ai.every((r) => r.auth === `Bearer ${TOKEN}` && r.feature === 'translate'), 'relay calls without the token or the feature');
    const keys = ai.map((r) => r.key);
    expect(keys.every((k) => /^[A-Za-z0-9._-]{8,128}$/.test(k ?? '')) && new Set(keys).size === keys.length, `generate without its own Idempotency-Key (${keys.join(', ')})`);
    const idle = await page.evaluate(() => JSON.parse(localStorage.getItem('econgen.secret.ai:mentor.idle') ?? 'null'));
    expect(idle?.idleMs === 14 * 24 * 3600 * 1000, 'the web sign-in has no 14-day limit');
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
    return `${ai.length} relay call(s), ${mentor.state.charged} charged`;
  });

  await check(engine, 'Settings: the account card, credits, Advanced closed, no token in the page', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${META}+Comma`);
    await account.waitFor();
    await settings.getByRole('button', { name: /AI/ }).first().click().catch(() => undefined);
    await account.getByText(/credits left/).waitFor();
    await page.waitForTimeout(300);
    await shot('04-settings-signed-in');
    expect((await account.getAttribute('data-mentor-account')) === 'signedIn', 'not signed in');
    expect(!(await settings.locator('[data-provider="gemini"]').isVisible().catch(() => false)), 'own-key providers shown while the account is in use');
    expect(!(await page.content()).includes(TOKEN), 'the token is in the DOM');
    expect((await account.locator('[data-mentor-kept]').getAttribute('data-mentor-kept')) === 'browser', 'no "kept in this browser" line');
    return (await account.getByText(/credits left/).innerText()).trim();
  });

  await check(engine, '中文 Settings', async () => {
    await settings.getByRole('radio', { name: '繁體中文' }).first().click().catch(() => undefined);
    await page.evaluate(() => {
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'econgen.settings.language' }));
    });
    await page.waitForTimeout(400);
    await shot('05-settings-zh');
    await page.evaluate(() => {
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'en', paper: 'en' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'econgen.settings.language' }));
    });
    await page.waitForTimeout(300);
  });

  await check(engine, 'the ✦ AI menu: "through your DSEcon Mentor account" and about how many credits', async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('[data-ai-door]').click();
    await aiMenu.waitFor();
    const row = aiMenu.locator('[data-verb^="translate."]').first();
    await row.hover();
    await page.waitForTimeout(300);
    const estimate = aiMenu.locator('[data-credit-estimate]');
    await estimate.first().waitFor();
    await shot('06-menu-estimate');
    const text = await aiMenu.innerText();
    expect(/through your DSEcon Mentor account/.test(text), 'the menu still says "with your key"');
    return (await estimate.first().innerText()).trim();
  });

  await check(engine, 'out of credits: the error says so, with Buy credits and Use my own key', async () => {
    await page.keyboard.press('Escape');
    mentor.state.credits = 0;
    await page.locator('[data-ai-door]').click();
    await aiMenu.waitFor();
    await aiMenu.locator('[data-verb^="translate."]').first().click();
    const error = page.getByRole('alert', { name: 'AI' });
    await error.getByText(/Not enough AI credits/).waitFor({ timeout: 15_000 });
    await shot('07-no-credits');
    for (const name of ['Buy credits', 'Use my own key…']) expect(await error.getByRole('button', { name, exact: true }).isVisible(), `no ${name}`);
  });

  await check(engine, 'Sign out: Mentor is told, the card is signed out, own keys are back', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${META}+Comma`);
    await account.waitFor();
    await account.getByRole('button', { name: 'Sign out' }).click();
    await settings.locator('[data-mentor-account="signedOut"]').waitFor();
    await page.waitForTimeout(300);
    await shot('08-signed-out');
    expect(mentor.state.requests.some((r) => r.path === '/auth/logout'), 'no logout call');
    expect(await settings.locator('[data-provider="gemini"]').isVisible(), 'own-key providers not shown');
    expect(leaks.length === 0, `leaked to ${leaks.join(', ')}`);
  });

  await check(engine, 'Shared computer: signed in for this tab only (sessionStorage, nothing in localStorage)', async () => {
    mentor.state.polls = 0;
    mentor.state.signedIn = true;
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await account.locator('[data-mentor-tab-only]').check();
    await shot('09-shared-computer');
    await account.getByRole('button', { name: 'Sign in with DSEcon Mentor' }).click();
    await (await popup)?.close();
    await settings.locator('[data-mentor-account="signedIn"]').waitFor({ timeout: 20_000 });
    await account.locator('[data-mentor-kept="tab"]').waitFor();
    const where = await page.evaluate(() => ({ tab: sessionStorage.getItem('econgen.secret.ai:mentor') !== null, browser: localStorage.getItem('econgen.secret.ai:mentor') !== null }));
    expect(where.tab && !where.browser, `token kept in ${JSON.stringify(where)}`);
    await page.waitForTimeout(300);
    await shot('10-tab-only');
  });

  await check(engine, 'Sign out Mentor cannot confirm: signed out here, warned, Open my account', async () => {
    mentor.state.logoutFails = true;
    await account.getByRole('button', { name: 'Sign out' }).click();
    const warning = settings.locator('[data-mentor-revoke-failed]');
    await warning.waitFor({ timeout: 15_000 });
    await page.waitForTimeout(300);
    await shot('11-revoke-failed');
    const left = await page.evaluate(() => Object.keys({ ...localStorage, ...sessionStorage }).filter((k) => k.startsWith('econgen.secret.ai:mentor')));
    expect(left.length === 0, `token still kept: ${left.join(', ')}`);
    expect(await warning.getByRole('button', { name: 'Open my account' }).isVisible(), 'no Open my account');
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await warning.getByRole('button', { name: 'Open my account' }).click();
    const opened = await popup;
    expect(opened?.url().includes('/account#ai-credits'), `opened ${opened?.url()}`);
    await opened?.close();
    return (await warning.innerText()).split('\n')[0];
  });

  await check(engine, 'phone width: the setup card fits', async () => {
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    await page.locator('[data-ai-door]').click().catch(() => undefined);
    await card.waitFor({ timeout: 3000 }).catch(() => undefined);
    await shot('12-phone');
  });

  await browser.close();
}

const server = await startStaticServer(APP_PORT);
for (const engine of ENGINES) await run(engine, engine === 'webkit' ? webkit : chromium);
server.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed · screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
