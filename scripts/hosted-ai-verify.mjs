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
 * audit fixes: an Idempotency-Key on each generate (allowed through CORS, CONTRACT v1.3), the 14-day web sign-in, "Shared computer" (this tab only), and a sign-out Mentor
 * can't confirm (signed out here, with the warning and Open my account). v1.4 (u-1zca): buy any
 * whole HK$ amount: quick picks, the amount box, the live credits line, the range error, Buy.
 * k-0524 (u-fs5v): the AI status chip (Set up AI → credits from each receipt → amber when low →
 * red with Buy credits at 0 → own key), live refresh on focus with never two reads at once, Buy's
 * fast poll until the payment lands, the studio header and composer chip, the red Sign out; a crop
 * of the chip per state in English and 中文 (`chip-<state>-<en|zh>.png`). k-0526 (u-uw4t): no
 * status bar any more: the editor reaches the window's bottom with no chip on it, so the chip's
 * states are read in the Question studio's header; no reads on focus while no chip is shown.
 * k-0527 (u-ypm9): signed in AND an own key saved: sign-in keeps Mentor (today's default),
 * Settings' "Use for AI" choice and the chip's menu switch in one click, "Not enough credits →
 * Use my own key (Gemini)" switches and re-runs on Google with Mentor charged nothing, Mentor
 * chosen sends nothing to Google, forgetting the key falls back to Mentor; `k0527-*.png` EN + 中.
 *
 *   npm run build && node scripts/hosted-ai-verify.mjs [--out=/tmp/hosted-ai-verify] [--engines=chromium,webkit] [--app-port=3419]
 *   NEXT_PUBLIC_MENTOR_ORIGIN=https://<preview> npm run build && node scripts/hosted-ai-verify.mjs --mentor=<preview host>
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/hosted-ai-verify');
const ENGINES = opt('engines', 'chromium,webkit').split(',');
const APP_PORT = Number(opt('app-port', '3419'));
const APP = `http://localhost:${APP_PORT}`;
const ROOT = fileURLToPath(new URL('..', import.meta.url));
// A build made with NEXT_PUBLIC_MENTOR_ORIGIN (src/ai/mentorOrigin.ts): pass its host to stand in there
// instead; then nothing may reach dseconmentor.com, and the account card must say it is a test build.
const MENTOR = opt('mentor', 'dseconmentor.com');
const TEST_BUILD = MENTOR !== 'dseconmentor.com';
const OTHER_HOSTS = [...(TEST_BUILD ? ['dseconmentor.com', 'www.dseconmentor.com'] : []), 'generativelanguage.googleapis.com', 'api.deepseek.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];

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
  const state = { credits: 500, polls: 0, signedIn: true, requests: [], charged: 0, logoutFails: false, creditReads: 0, inflight: 0, maxInflight: 0 };
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
      // Slow enough that a second read sent meanwhile would overlap (k-0524: never two at once).
      state.creditReads++;
      state.inflight++;
      state.maxInflight = Math.max(state.maxInflight, state.inflight);
      await new Promise((r) => setTimeout(r, 150));
      state.inflight--;
      return route.fulfill(json({ status: 'on', balance: state.credits, trial: { credits: 500, grantedAt: new Date().toISOString() }, model: 'gemini-4-hydrogen', rates: { creditsPerHkd: 100, hkdPerUsd: 7.8, inputPerMillionTokens: 1170, outputPerMillionTokens: 5850 }, estimates: { studioWorksheet: 280, importCheck: 50, translate: 50, answerKey: 80 }, extraPct: 10, buy: { unitHkd: 1, minHkd: 50, maxHkd: 1000, quickPicks: [{ hkd: 50, credits: 4170 }, { hkd: 100, credits: 8560 }, { hkd: 200, credits: 17350 }], stripeFee: { pct: 3.4, fixedHkd: 2.35 }, urlTemplate: `https://${MENTOR}/account?amount={hkd}#ai-credits` }, buyUrl: `https://${MENTOR}/account#ai-credits`, pricingUrl: `https://${MENTOR}/pricing#ai-credits` }));
    }
    if (path === '/ai/generate') {
      if (!authed) return route.fulfill(relayError(401, 'unauthorized'));
      if (state.credits <= 0) return route.fulfill(json({ error: 'insufficient_credits', balance: state.credits, needed: 40 }, 402));
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
  // k-0527: while `google.open`, Google's API is the own key's provider (answered with a 400 and
  // counted), not a leak; Mentor's requests are counted by the stand-in.
  const google = { open: false, calls: [] };
  await context.route((url) => OTHER_HOSTS.includes(url.hostname), (route) => {
    const url = route.request().url();
    if (google.open && url.includes('generativelanguage.googleapis.com')) {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST' } });
      google.calls.push(url);
      return route.fulfill({ status: 400, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 400, message: 'stand-in: stop here', status: 'INVALID_ARGUMENT' } }) });
    }
    leaks.push(url);
    return route.fulfill({ status: 599, body: 'blocked' });
  });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log(`  PAGE ERR: ${e.message}`));
  const shot = (name) => page.screenshot({ path: `${OUT}/${engine}-${name}.png` });
  const aiMenu = page.getByRole('dialog', { name: 'AI tools' });
  const card = aiMenu.locator('[data-setup-card]');
  const settings = page.getByRole('dialog', { name: /Settings/ });
  const account = settings.locator('[data-mentor-account]');
  // The chip lives in the Question studio's header (no status bar since k-0526).
  const studioHeader = page.locator('header:has([data-ai-chip])');
  const chip = page.locator('header [data-ai-chip]');
  const fmt = (n) => new Intl.NumberFormat('en-HK', { maximumFractionDigits: 0 }).format(Math.floor(n));
  const setLang = (ui) =>
    page.evaluate((ui) => {
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui, paper: 'en' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'econgen.settings.language' }));
    }, ui);
  /** The chip, cropped from the studio's header, in English and 中文. */
  const chipShot = async (name, scope = studioHeader) => {
    for (const ui of ['en', 'zh-HK']) {
      await setLang(ui);
      await page.waitForTimeout(300);
      const box = await scope.boundingBox();
      const width = Math.min(560, box.width);
      await page.screenshot({ path: `${OUT}/${engine}-chip-${name}-${ui === 'en' ? 'en' : 'zh'}.png`, clip: { x: box.x + box.width - width, y: Math.max(0, box.y - 6), width, height: box.height + 12 } });
    }
    await setLang('en');
    await page.waitForTimeout(200);
  };
  const chipSays = async (pattern, timeout = 8000) => {
    const started = Date.now();
    for (;;) {
      const text = (await chip.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
      if (pattern.test(text)) return text;
      if (Date.now() - started > timeout) throw new Error(`chip says "${text}", wanted ${pattern}`);
      await page.waitForTimeout(150);
    }
  };
  const wake = () => page.evaluate(() => window.dispatchEvent(new Event('focus')));
  const openDoc = async () => {
    await page.getByRole('button', { name: /Hosted AI verify/ }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
  };
  /** Editor → the Question studio (its header carries the chip). */
  const toStudio = async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Econ Studio home' }).first().click();
    await page.getByRole('button', { name: /Question studio/ }).first().click();
    await chip.waitFor({ timeout: 10_000 });
  };
  /** The Question studio → back to the worksheet. */
  const toEditor = async () => {
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Home/ }).first().click();
    await page.getByRole('button', { name: /Hosted AI verify/ }).first().waitFor();
    await openDoc();
  };

  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Hosted AI verify/ }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 15_000 });
  await page.getByRole('radio', { name: '中文', exact: true }).first().click();
  await page.waitForTimeout(400);

  await check(engine, 'no status bar: the editor reaches the window\'s bottom, no chip on it (k-0526)', async () => {
    expect((await page.locator('[data-ai-status-bar], footer[aria-label="AI status"]').count()) === 0, 'the status bar is back');
    expect((await page.locator('[data-ai-chip]').count()) === 0, 'a chip on the editor screen');
    const gap = await page.evaluate(() => {
      // The shell's screen pane (EditorHost's flex-1 box around the editor) ends at the window's bottom.
      let pane = document.querySelector('#print-root');
      while (pane?.parentElement && !pane.parentElement.classList.contains('h-screen')) pane = pane.parentElement;
      return Math.round(window.innerHeight - (pane?.getBoundingClientRect().bottom ?? 0));
    });
    expect(Math.abs(gap) <= 1, `${gap}px left under the editor`);
    await page.screenshot({ path: `${OUT}/${engine}-00-editor-no-status-bar.png` });
    return `bottom gap ${gap}px`;
  });

  await check(engine, 'chip: "Set up AI" with no AI, in the studio header; a click opens Settings → AI', async () => {
    await toStudio();
    await chipSays(/^Set up AI$/);
    expect((await chip.getAttribute('data-ai-chip')) === 'setup', 'not the setup chip');
    await chipShot('setup');
    await chip.locator('button').first().click();
    await account.waitFor();
    await page.keyboard.press('Escape');
    await settings.waitFor({ state: 'hidden' });
    expect(mentor.state.requests.length === 0, 'the chip sent a request');
    await toEditor();
  });

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

  await check(engine, 'chip: the credits from the last receipt, no extra read', async () => {
    const reads = mentor.state.creditReads;
    await toStudio();
    const text = await chipSays(new RegExp(`^AI credits ${fmt(mentor.state.credits).replace(',', ',')}$`));
    expect(mentor.state.creditReads === reads, 'the receipt still needed a read');
    await chipShot('credits');
    return text;
  });

  await check(engine, 'live: credits bought elsewhere show on focus, no reload; never two reads at once', async () => {
    await page.waitForTimeout(3200);
    mentor.state.credits = 9003.6;
    mentor.state.maxInflight = 0;
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    });
    const text = await chipSays(/^AI credits 9,003$/);
    expect(mentor.state.maxInflight <= 1, `${mentor.state.maxInflight} reads at once`);
    await shot('03c-chip-live');
    return text;
  });

  await check(engine, 'chip: amber under one studio run (280 credits, Mentor\'s estimate)', async () => {
    await page.waitForTimeout(3200);
    mentor.state.credits = 150;
    await wake();
    await chipSays(/^AI credits 150$/);
    expect((await chip.getAttribute('data-ai-chip-tone')) === 'low', 'not amber');
    const title = await chip.locator('button').first().getAttribute('title');
    expect(/under 280 credits/.test(title ?? ''), `tooltip: ${title}`);
    if (TEST_BUILD) expect((await chip.locator('[data-ai-chip-test]').count()) === 1 && title.includes(`Test build: uses the DSEcon Mentor at ${MENTOR}`), 'no test-build hint on the chip');
    await chipShot('low');
    mentor.state.credits = 9003.6;
    await page.waitForTimeout(3200);
    await wake();
    await chipSays(/^AI credits 9,003$/);
    await toEditor();
  });

  await check(engine, 'live: no chip on screen (the editor), no reads on focus', async () => {
    await page.waitForTimeout(3200);
    const reads = mentor.state.creditReads;
    await wake();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForTimeout(1500);
    expect(mentor.state.creditReads === reads, `${mentor.state.creditReads - reads} read(s) with no chip shown`);
  });

  await check(engine, 'Settings: the account card, credits, Advanced closed, no token in the page', async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${META}+Comma`);
    await account.waitFor();
    await settings.getByRole('button', { name: /AI/ }).first().click().catch(() => undefined);
    await account.getByText(/credits left/).waitFor();
    await page.waitForTimeout(300);
    await shot('04-settings-signed-in');
    const signOut = account.locator('[data-mentor-sign-out]');
    const look = await signOut.evaluate((el) => {
      const s = getComputedStyle(el);
      return { color: s.color, background: s.backgroundColor };
    });
    const rgb = (c) => (c.match(/[\d.]+/g) ?? []).map(Number);
    const [r, g, b] = rgb(look.color);
    expect(r > g + 60 && r > b + 60, `Sign out is not red: ${look.color}`);
    expect(!/rgba\(0, 0, 0, 0\)|transparent/.test(look.background), `Sign out has no fill: ${look.background}`);
    await signOut.screenshot({ path: `${OUT}/${engine}-04a-sign-out-red.png` });
    expect((await account.getAttribute('data-mentor-account')) === 'signedIn', 'not signed in');
    expect(!(await settings.locator('[data-provider="gemini"]').isVisible().catch(() => false)), 'own-key providers shown while the account is in use');
    expect(!(await page.content()).includes(TOKEN), 'the token is in the DOM');
    expect((await account.locator('[data-mentor-kept]').getAttribute('data-mentor-kept')) === 'browser', 'no "kept in this browser" line');
    return (await account.getByText(/credits left/).innerText()).trim();
  });

  if (TEST_BUILD) {
    await check(engine, `a test build: the card names ${MENTOR}`, async () => {
      const line = account.locator('[data-mentor-server]');
      const text = (await line.innerText()).trim();
      expect(text === `Test build: uses the DSEcon Mentor at ${MENTOR}, not dseconmentor.com.`, `line: ${text}`);
      await shot('03b-test-build');
      return text;
    });
  }

  await check(engine, 'Buy any amount: quick picks, the live line, the range error, Buy opens the amount (v1.4)', async () => {
    const buy = account.locator('[data-mentor-buy]');
    const box = buy.locator('[data-buy-amount]');
    const line = buy.locator('[data-buy-line]');
    expect((await line.innerText()).includes('≈ 4,170 credits · ≈ 145 questions'), `first line: ${await line.innerText()}`);
    await buy.locator('[data-buy-pick="200"]').click();
    expect((await box.inputValue()) === '200', 'the quick pick did not fill the box');
    expect((await line.innerText()).includes('≈ 17,350 credits · ≈ 615 questions'), `200: ${await line.innerText()}`);
    await box.fill('40');
    expect((await line.innerText()).includes('Enter a whole amount from HK$50 to HK$1,000.'), `40: ${await line.innerText()}`);
    expect(await buy.getByRole('button', { name: 'Buy credits' }).isDisabled(), 'Buy enabled for HK$40');
    await box.fill('75');
    await page.waitForTimeout(150);
    await shot('04b-buy-75');
    expect((await line.innerText()).includes('≈ 6,370 credits · ≈ 225 questions'), `75: ${await line.innerText()}`);
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await buy.getByRole('button', { name: 'Buy credits' }).click();
    const opened = await popup;
    expect(opened?.url() === `https://${MENTOR}/account?amount=75#ai-credits`, `opened ${opened?.url()}`);
    await opened?.close();
    return (await line.innerText()).trim();
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

  await check(engine, 'chip: red at 0 with Buy credits (from the 402 balance); after Buy it polls until the payment lands', async () => {
    await toStudio();
    await chipSays(/^AI credits 0\s*Buy credits$/);
    expect((await chip.getAttribute('data-ai-chip-tone')) === 'out', 'not red');
    await chipShot('out');
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await chip.locator('[data-ai-chip-buy]').click();
    const opened = await popup;
    expect(opened?.url().includes('/account#ai-credits'), `Buy opened ${opened?.url()}`);
    await opened?.close();
    await page.bringToFront();
    const reads = mentor.state.creditReads;
    const started = Date.now();
    mentor.state.credits = 4170;
    const text = await chipSays(/^AI credits 4,170$/, 12_000);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    expect(Date.now() - started < 8000, `took ${secs}s (no 5 s poll)`);
    const after = mentor.state.creditReads;
    await page.waitForTimeout(6000);
    expect(mentor.state.creditReads === after, 'still polling after the balance changed');
    return `${text} after ${secs}s, ${after - reads} read(s)`;
  });

  await check(engine, 'the Question studio: chip in its header and beside the cost line in the composer', async () => {
    const header = page.locator('header [data-ai-chip="credits"]');
    await header.waitFor({ timeout: 10_000 });
    const composer = page.locator('[data-chat-ai-status]');
    await composer.waitFor();
    expect((await composer.locator('[data-ai-chip="credits"]').count()) === 1, 'no chip in the composer');
    const estimate = await composer.locator('[data-credit-estimate]').innerText().catch(() => '');
    expect(/^Uses about [\d,]+ credits$/.test(estimate.trim()), `cost line: ${estimate}`);
    await page.waitForTimeout(300);
    await shot('07b-studio');
    await setLang('zh-HK');
    await page.waitForTimeout(400);
    await shot('07c-studio-zh');
    await setLang('en');
    await toEditor();
    return estimate.trim();
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

  await check(engine, 'chip: an own key says whose, with no balance', async () => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      localStorage.setItem('econgen.secret.ai:gemini', 'AIzaSyVerify0123456789abcdefghijklmnopq');
      const raw = JSON.parse(localStorage.getItem('econgen.settings.ai') ?? '{}');
      localStorage.setItem('econgen.settings.ai', JSON.stringify({ ...raw, provider: 'gemini' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'econgen.secret.ai:gemini' }));
      window.dispatchEvent(new StorageEvent('storage', { key: 'econgen.settings.ai' }));
    });
    await toStudio();
    const text = await chipSays(/^AI: own key \(Gemini\)$/);
    await chipShot('ownkey');
    await toEditor();
    return text;
  });

  // ---- k-0527: signed in AND an own key saved ----
  const choiceField = settings.locator('[data-ai-choice-field]');
  const providerNow = () => page.evaluate(() => JSON.parse(localStorage.getItem('econgen.settings.ai') ?? '{}').provider);
  const generates = () => mentor.state.requests.filter((r) => r.path === '/ai/generate' && r.auth).length;
  const openSettingsAi = async () => {
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${META}+Comma`);
    await account.waitFor();
  };
  /** Runs the first translate verb from the ✦ AI menu and waits for it to end (done or an error). */
  const runVerb = async () => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await page.locator('[data-ai-door]').click();
    await aiMenu.waitFor();
    await aiMenu.locator('[data-verb^="translate."]').first().click();
    await page.locator('[role="alert"][aria-label="AI"], [role="status"][aria-label="AI"]').first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1500);
  };

  await check(engine, 'both: signing in with an own key saved keeps today\'s default (Mentor credits), and Settings shows "Use for AI"', async () => {
    mentor.state.polls = 0;
    mentor.state.signedIn = true;
    mentor.state.logoutFails = false;
    mentor.state.credits = 9003.6;
    await openSettingsAi();
    const popup = context.waitForEvent('page', { timeout: 5000 }).catch(() => null);
    await account.getByRole('button', { name: 'Sign in with DSEcon Mentor' }).click();
    await (await popup)?.close();
    await settings.locator('[data-mentor-account="signedIn"]').waitFor({ timeout: 20_000 });
    await choiceField.waitFor();
    expect((await providerNow()) === 'mentor', `provider after sign-in: ${await providerNow()}`);
    expect((await choiceField.getAttribute('data-ai-choice-field')) === 'mentor', 'the choice does not say Mentor');
    await account.getByText(/credits left/).waitFor();
    // Page-wide locators: in 中文 the dialog is no longer named "Settings".
    const field = page.locator('[data-ai-choice-field]');
    const card = page.locator('[data-mentor-account]');
    for (const ui of ['en', 'zh-HK']) {
      await setLang(ui);
      await page.waitForTimeout(350);
      await field.scrollIntoViewIfNeeded();
      const a = await field.boundingBox();
      const b = await card.boundingBox();
      await page.screenshot({ path: `${OUT}/${engine}-k0527-settings-choice-${ui === 'en' ? 'en' : 'zh'}.png`, clip: { x: a.x - 12, y: a.y - 12, width: a.width + 24, height: b.y + b.height - a.y + 24 } });
    }
    await setLang('en');
    expect(!(await account.getByRole('button', { name: 'Use my DSEcon Mentor account' }).isVisible().catch(() => false)), 'the card still offers its own switch');
  });

  await check(engine, 'Settings: "My own key (Gemini)" switches, remembered across a reload', async () => {
    await choiceField.locator('[data-ai-choice="own"]').click();
    await settings.locator('[data-ai-choice-field="own"]').waitFor();
    expect((await providerNow()) === 'gemini', `provider: ${await providerNow()}`);
    await page.reload({ waitUntil: 'networkidle' });
    await openDoc();
    expect((await providerNow()) === 'gemini', 'the choice did not survive a reload');
    await openSettingsAi();
    await settings.locator('[data-ai-choice-field="own"]').waitFor();
    await page.keyboard.press('Escape');
  });

  await check(engine, 'own key chosen: a run goes to Google only, Mentor charges nothing', async () => {
    google.open = true;
    const before = { mentor: generates(), google: google.calls.length };
    await runVerb();
    google.open = false;
    expect(generates() === before.mentor, `${generates() - before.mentor} request(s) to Mentor while "own key" is chosen`);
    expect(google.calls.length > before.google, 'the run never reached Google');
    return `${google.calls.length - before.google} to Google, 0 to Mentor`;
  });

  await check(engine, 'the studio chip says which one and switches in one click (menu)', async () => {
    await toStudio();
    await chipSays(/^AI: own key \(Gemini\)$/);
    expect((await chip.getAttribute('data-ai-chip-choice')) === 'own', 'chip choice not own');
    await chip.locator('button').first().click();
    const menu = page.locator('[data-ai-choice-menu]');
    await menu.waitFor();
    for (const ui of ['en', 'zh-HK']) {
      await setLang(ui);
      await page.waitForTimeout(350);
      const a = await studioHeader.boundingBox();
      const b = await menu.boundingBox();
      const x = Math.max(0, Math.min(b.x, a.x + a.width - 560) - 12);
      await page.screenshot({ path: `${OUT}/${engine}-k0527-chip-menu-${ui === 'en' ? 'en' : 'zh'}.png`, clip: { x, y: Math.max(0, a.y), width: a.x + a.width - x, height: b.y + b.height - a.y + 12 } });
    }
    await setLang('en');
    expect((await menu.locator('[data-ai-choice="own"]').getAttribute('aria-checked')) === 'true', 'own not checked');
    await menu.locator('[data-ai-choice="mentor"]').click();
    await menu.waitFor({ state: 'hidden' });
    const text = await chipSays(/^AI credits [\d,]+$/);
    expect((await providerNow()) === 'mentor', `provider: ${await providerNow()}`);
    // The composer's chip shows the same choice.
    expect((await page.locator('[data-chat-ai-status] [data-ai-chip]').getAttribute('data-ai-chip-choice')) === 'mentor', 'the composer chip disagrees');
    await toEditor();
    return text;
  });

  await check(engine, 'Mentor chosen: a run goes to Mentor only, nothing to Google or the key', async () => {
    google.open = true;
    const before = { mentor: generates(), google: google.calls.length, leaks: leaks.length };
    await runVerb();
    google.open = false;
    expect(google.calls.length === before.google && leaks.length === before.leaks, 'a request went to Google while Mentor is chosen');
    expect(generates() > before.mentor, 'the run never reached Mentor');
    return `${generates() - before.mentor} to Mentor, 0 to Google`;
  });

  await check(engine, 'Not enough credits → "Use my own key (Gemini)" switches the choice and re-runs on Google, no charge', async () => {
    mentor.state.credits = 0;
    google.open = true;
    await runVerb();
    const error = page.getByRole('alert', { name: 'AI' });
    await error.getByText(/Not enough AI credits/).waitFor({ timeout: 15_000 });
    const button = error.getByRole('button', { name: 'Use my own key (Gemini)', exact: true });
    expect(await button.isVisible(), 'no "Use my own key (Gemini)"');
    await shot('k0527-use-own-key');
    const before = { charged: mentor.state.charged, google: google.calls.length };
    await button.click();
    await page.waitForTimeout(2500);
    google.open = false;
    expect((await providerNow()) === 'gemini', `provider: ${await providerNow()}`);
    expect(google.calls.length > before.google, 'the retry never reached Google');
    expect(mentor.state.charged === before.charged, 'Mentor charged');
    mentor.state.credits = 9003.6;
  });

  await check(engine, 'forgetting the own key in use falls back to Mentor, and the choice goes away', async () => {
    await openSettingsAi();
    await settings.locator('[data-ai-choice-field="own"]').waitFor();
    const row = settings.locator('section[aria-label="Your keys"] li').first();
    await row.getByRole('button', { name: 'Forget', exact: true }).click();
    await row.getByText('Forget this key?').waitFor();
    await row.getByRole('button', { name: 'Forget', exact: true }).click();
    await choiceField.waitFor({ state: 'detached', timeout: 5000 });
    expect((await providerNow()) === 'mentor', `provider: ${await providerNow()}`);
    await page.keyboard.press('Escape');
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
