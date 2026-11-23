import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * k-0501: the import review's AI check, in a real browser. Serves a built `out/`, opens a
 * `.docx` in the import dialog, then runs the AI check against a canned provider that the
 * browser itself answers (`context.route`: no request leaves the machine, no real key):
 *   - clean: every batch answers "nothing to report", 1.5 s each (the row shows progress);
 *   - found: one note on Question 1 (the summary counts it);
 *   - region: Gemini refuses the location, as in Hong Kong without a VPN.
 * Screenshots of the review land in --out. `--before` drives the old build (k-0494's panel:
 * Check import, then Also ask the AI) to show what the teacher saw.
 *
 *   npm run build && node scripts/import-ai-verify.mjs --file=/path/paper.docx --out=/tmp/k0501 \
 *     [--name=p1] [--mode=clean|found|region] [--lang=en|zh-HK] [--width=1440] [--delay=1500] [--before] [--root=out]
 *
 * Point --file and --out outside the repo when the paper is real.
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const FILE = opt('file');
const OUT = opt('out', '/tmp/import-ai-verify');
const NAME = opt('name', 'paper');
const MODE = opt('mode', 'clean');
const LANG = opt('lang', 'en');
const WIDTH = Number(opt('width', '1440'));
const BEFORE = args.includes('--before');
const ROOT = opt('root', 'out');
const PORT = Number(opt('port', '3511'));
/** Each canned answer's delay: long enough for the row's running state to be seen. */
const DELAY = Number(opt('delay', '1500'));
if (!FILE) {
  console.error('--file=<paper.docx> is required');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain', '.wasm': 'application/wasm' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const base = join(ROOT, path);
  const file = [base, `${base}.html`, join(base, 'index.html')].find((p) => existsSync(p) && statSync(p).isFile());
  if (!file) return res.writeHead(404).end('not found');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(PORT, resolve));
const APP = `http://localhost:${PORT}`;
const VERSION = JSON.parse(readFileSync('package.json', 'utf8')).version;
const MOCK = 'http://localhost:8799/v1';

const completion = (content) => ({ id: 'mock', object: 'chat.completion', model: 'mock', choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };
let asked = 0;
const leaks = [];

const browser = await chromium.launch({ channel: 'chrome' });
let failed = false;
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failed = true;
};
try {
  const touch = WIDTH < 1000;
  const context = await browser.newContext({ viewport: { width: WIDTH, height: touch ? (WIDTH < 500 ? 844 : 1180) : 900 }, deviceScaleFactor: 2, hasTouch: touch, isMobile: WIDTH < 500 });
  const ai = MODE === 'region' ? { v: 1, provider: 'gemini' } : { v: 1, provider: 'custom', models: { custom: 'mock' }, baseUrls: { custom: MOCK } };
  await context.addInitScript(
    ([version, settings, provider, lang]) => {
      localStorage.setItem('econ-worksheet-last-seen-version', version);
      localStorage.setItem('econgen.settings.ai', settings);
      sessionStorage.setItem(`econgen.secret.ai:${provider}`, 'sk-mock-verify-0000');
      if (lang !== 'en') localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang }));
    },
    [VERSION, JSON.stringify(ai), ai.provider, LANG],
  );
  // The canned provider, answered inside the browser.
  await context.route('http://localhost:8799/**', async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (req.url().endsWith('/models')) return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ object: 'list', data: [{ id: 'mock' }] }) });
    asked++;
    await new Promise((r) => setTimeout(r, DELAY));
    let items = [];
    if (MODE === 'found') {
      const body = JSON.parse(req.postData() ?? '{}');
      const user = JSON.parse(body.messages?.at(-1)?.content ?? '{}');
      const first = user.questions?.find((q) => q.key === 'q1');
      const ref = first?.paper?.find((e) => typeof e.text === 'string')?.ref;
      if (ref) items = [{ key: 'q1', ref, issue: 'merged', text: 'Two of the file’s lines seem to run together here.', op: 'none', from: '', to: '', marks: 0 }];
    }
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(completion(JSON.stringify({ items }))) });
  });
  await context.route(
    (url) => ['generativelanguage.googleapis.com', 'api.openai.com', 'api.deepseek.com', 'openrouter.ai', 'api.anthropic.com'].includes(url.hostname),
    (route) => {
      if (MODE === 'region' && route.request().url().includes('generativelanguage')) {
        asked++;
        return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { code: 400, message: 'User location is not supported for the API use.', status: 'FAILED_PRECONDITION' } }) });
      }
      leaks.push(route.request().url());
      return route.fulfill({ status: 599, body: 'blocked' });
    },
  );
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.goto(APP, { waitUntil: 'networkidle' });
  const importName = LANG === 'en' ? /^Import from Word, PDF or picture/ : /匯入/;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: importName }).first().click()]);
  await chooser.setFiles([FILE]);
  const dialog = page.getByRole('dialog').first();
  const review = dialog.getByRole('button', { name: LANG === 'en' ? /^Review the paper/ : /檢視試卷|審閱/ });
  await Promise.race([review.waitFor({ timeout: 60_000 }), dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 })]);
  if (await review.count()) await review.click();
  await dialog.locator('[data-line]').first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(800);
  const shot = (what) => page.screenshot({ path: join(OUT, `${NAME}-${what}.png`) });

  if (BEFORE) {
    await shot('before-1-review');
    check((await dialog.locator('[data-ai-bar]').count()) === 0, 'before: no AI button on the review bar');
    await dialog.locator('[data-check-import]').click();
    await page.waitForTimeout(600);
    await shot('before-2-check-open');
    await dialog.getByRole('button', { name: /Also ask the AI|同時詢問 AI/ }).click();
    await page.waitForTimeout(700);
    await shot('before-3-asking');
    await dialog.getByRole('button', { name: /Also ask the AI|同時詢問 AI/ }).waitFor({ timeout: 120_000 });
    await page.waitForTimeout(500);
    await shot('before-4-after-ai');
    console.log(`before: provider asked ${asked} times; panel text: ${(await dialog.locator('[data-import-check]').innerText()).split('\n').slice(0, 3).join(' | ')}`);
  } else {
    const bar = dialog.locator('[data-ai-bar]');
    check((await bar.count()) === 1 && (await bar.isVisible()), 'the ✦ AI check button is on the review bar before anything is opened');
    await shot('1-review');
    await bar.click();
    const row = dialog.locator('[data-ai-check]');
    await row.waitFor({ timeout: 10_000 });
    if (MODE !== 'region') {
      await dialog.locator('[data-ai-check="running"]').waitFor({ timeout: 20_000 });
      await page.waitForTimeout(Math.min(2600, DELAY * 0.6));
      await shot('2-running');
      const text = await row.innerText();
      check(/checked|已檢查/.test(text) && /so far|已用/.test(text), `while running the row says how far and how long: ${text.replace(/\n/g, ' | ')}`);
    }
    await dialog.locator('[data-ai-check="done"], [data-ai-check="failed"]').waitFor({ timeout: 180_000 });
    await page.waitForTimeout(500);
    await shot('3-done');
    const text = (await row.innerText()).replace(/\n/g, ' | ');
    console.log(`row: ${text}`);
    console.log(`bar: ${await bar.innerText()}`);
    if (MODE === 'clean') check(/no problems found|沒有發現問題/.test(text), 'clean: says the AI found nothing');
    if (MODE === 'found') check(/to look at|要看/.test(text) && (await dialog.locator('[data-finding="ai"]').count()) > 0, 'found: summary counts it and the finding is listed');
    if (MODE === 'region') check(/AI check failed|AI 檢查失敗/.test(text) && /VPN/.test(text), 'region: says it failed and why (VPN)');
    check(/Checked:|檢查了：|rule check above|規則檢查/.test(text), 'a summary line follows the headline');
    // Closing and reopening the panel keeps the summary.
    await dialog.locator('[data-check-import]').click();
    await page.waitForTimeout(300);
    await bar.click();
    await page.waitForTimeout(300);
    check((await dialog.locator('[data-ai-check="done"], [data-ai-check="failed"]').count()) === 1, 'the bar button reopens the panel with the last result');
  }
  console.log(`provider asked ${asked} times`);
  check(leaks.length === 0, `no real provider reached (${leaks.length})`);
} catch (error) {
  console.log('FAIL', error.message);
  failed = true;
} finally {
  await browser.close();
  server.close();
}
process.exit(failed ? 1 : 0);
