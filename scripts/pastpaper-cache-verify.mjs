import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The Past paper bank's caching (k-0447) against the live bank, in Chrome: which files a
 * teacher's computer asks for on each visit. The live list and topics are real (the data
 * repo's commit, on jsDelivr and GitHub); only `latest.json` is served by this script until
 * the exporter publishes one, and the "publish" in step 3 is simulated (a fake commit whose
 * files are the real ones with one topic changed).
 *
 *   node scripts/pastpaper-cache-verify.mjs <out-dir> [--port=3000]
 *
 * 0. Today's published repo (no latest.json): read from the branch, as before.
 * 1. First visit: latest.json from GitHub; the list and topics from jsDelivr at its commit.
 * 2. Second visit: latest.json only.
 * 3. A publish that changed one topic: the new list and that topic only.
 * 4. jsDelivr down: the same commit from GitHub raw.
 * 5. No connection: topics opened before still open; others say so.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-cache-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const REPO = 'dinomartino/dse-econ-question-bank';
const RAW_MAIN = `https://raw.githubusercontent.com/${REPO}/main/`;
const LATEST = `${RAW_MAIN}latest.json`;
const CDN = (c) => `https://cdn.jsdelivr.net/gh/${REPO}@${c}/`;
const RAW = (c) => `https://raw.githubusercontent.com/${REPO}/${c}/`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const head = (await (await fetch(`https://api.github.com/repos/${REPO}/commits/main`)).json()).sha;
const A = /^[0-9a-f]{40}$/.test(head ?? '') ? head : process.exit(console.log('no commit id for main') || 2);
const B = 'b'.repeat(40); // the simulated publish
const manifestA = await (await fetch(`${CDN(A)}manifest.json`)).text();
const listA = JSON.parse(manifestA);
const bySize = [...listA.topics].sort((x, y) => x.bytes - y.bytes);
const [X, Y, Z] = bySize; // three small topics: X unchanged, Y changed by the publish, Z never opened before offline
// The screen opens the first listed topic by itself on a computer's first visit.
const F = listA.topics[0];
console.log(`live commit ${A.slice(0, 8)}; first topic ${F.id}; topics ${X.id}, ${Y.id}, ${Z.id}`);

// The publish B: Y's file gains a field (the editor ignores it), so its fingerprint changes.
const yText = await (await fetch(`${CDN(A)}${Y.file}`)).text();
const yChanged = JSON.stringify({ ...JSON.parse(yText), publishedBy: 'pastpaper-cache-verify' });
const listB = { ...listA, topics: listA.topics.map((t) => (t.id === Y.id ? { ...t, bytes: Buffer.byteLength(yChanged), sha256: createHash('sha256').update(yChanged).digest('hex') } : t)) };
const manifestB = JSON.stringify(listB);

const json = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body });

async function visit(context, label, { topics, latest, before } = {}) {
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  if (before) await before(page);
  if (latest !== undefined) await page.route(LATEST, (route) => (latest ? route.fulfill(json(latest)) : route.continue()));
  const asked = [];
  page.on('request', (r) => {
    if (/latest\.json|manifest\.json|\/topics\//.test(r.url())) asked.push(r.url());
  });
  await page.goto(`http://localhost:${port}`);
  await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
  await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 60_000 });
  const all = page.locator('[data-pastpaper-screen] nav').getByRole('button', { name: /^Open all$/ });
  if (await all.count()) await all.first().click();
  const shown = {};
  for (const t of topics) {
    await page.locator(`[data-pastpaper-screen] nav [data-pastpaper-topic="${t.id}"]`).click();
    const card = page.locator('[data-pastpaper-screen] main article').first();
    shown[t.id] = await card
      .waitFor({ timeout: 30_000 })
      .then(async () => {
        await page.waitForTimeout(400);
        return (await page.locator('[data-pastpaper-screen] main [role="status"]').first().textContent())?.includes(String(t.questions)) ?? false;
      })
      .catch(() => false);
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, `${label}.png`) });
  const text = (await page.locator('[data-pastpaper-screen]').textContent()) ?? '';
  await page.close();
  return { asked, shown, text };
}

const browser = await chromium.launch({ channel: 'chrome' });
const fresh = () => {
  const dir = mkdtempSync(join(tmpdir(), 'pp-cache-'));
  return { dir, ctx: chromium.launchPersistentContext(dir, { channel: 'chrome', viewport: { width: 1512, height: 950 } }) };
};

// 0. Today's repo, no latest.json: the branch, exactly as before k-0447.
{
  const context = await browser.newContext({ viewport: { width: 1512, height: 950 } });
  const r = await visit(context, '0-no-latest', { topics: [X], latest: null });
  check(r.shown[X.id], `0. no latest.json: ${X.id} shows all ${X.questions} questions`);
  check(same(r.asked, [LATEST, `${RAW_MAIN}manifest.json`, `${RAW_MAIN}${F.file}`, `${RAW_MAIN}${X.file}`]), '0. read from the branch: latest.json (404), the list, the first topic, the topic', r.asked.join(' '));
  await context.close();
}

// 1–3 and 5 share one computer (a persistent profile: IndexedDB and the HTTP cache survive).
const one = fresh();
const context = await one.ctx;
const v1 = await visit(context, '1-first-visit', { topics: [X, Y], latest: JSON.stringify({ version: 1, commit: A, enabled: true }) });
check(v1.shown[X.id] && v1.shown[Y.id], `1. first visit: ${X.id} and ${Y.id} show all their questions`);
check(same(v1.asked, [LATEST, `${CDN(A)}manifest.json`, `${CDN(A)}${F.file}`, `${CDN(A)}${X.file}`, `${CDN(A)}${Y.file}`]), '1. latest.json from GitHub, the list and topics from jsDelivr at the commit', v1.asked.join(' '));

const v2 = await visit(context, '2-second-visit', { topics: [X, Y], latest: JSON.stringify({ version: 1, commit: A, enabled: true }) });
check(v2.shown[X.id] && v2.shown[Y.id], '2. second visit: both topics show');
check(same(v2.asked, [LATEST]), '2. second visit asks for latest.json only', v2.asked.join(' '));

const publishB = async (page) => {
  await page.route(`${CDN(B)}**`, (route) => {
    const url = route.request().url();
    if (url.endsWith('/manifest.json')) return route.fulfill(json(manifestB));
    if (url.endsWith(`/${Y.file}`)) return route.fulfill(json(yChanged));
    return route.fulfill(json('{}')); // any other topic of B would be a wasted download: caught below
  });
};
const v3 = await visit(context, '3-after-publish', { topics: [X, Y], latest: JSON.stringify({ version: 1, commit: B, enabled: true }), before: publishB });
check(v3.shown[X.id] && v3.shown[Y.id], '3. after a publish: both topics show');
check(same(v3.asked, [LATEST, `${CDN(B)}manifest.json`, `${CDN(B)}${Y.file}`]), `3. the publish downloads the new list and the changed topic (${Y.id}) only`, v3.asked.join(' '));

const offline = async (page) => {
  await page.route(/^https:\/\/(raw\.githubusercontent\.com|cdn\.jsdelivr\.net)\//, (route) => route.abort('internetdisconnected'));
};
const v5 = await visit(context, '5-offline', { topics: [X, Y, Z], before: offline });
check(v5.shown[X.id] && v5.shown[Y.id], '5. no connection: the topics opened before still show');
check(!v5.shown[Z.id] && /can’t be reached|offline|Offline/.test(v5.text), `5. no connection: ${Z.id}, never opened, says it can't be reached`);
await context.close();
rmSync(one.dir, { recursive: true, force: true });

// 4. jsDelivr down, nothing kept: the commit from GitHub raw.
{
  const two = fresh();
  const ctx = await two.ctx;
  const cdnDown = async (page) => {
    await page.route(/^https:\/\/cdn\.jsdelivr\.net\//, (route) => route.abort('connectionrefused'));
  };
  const r = await visit(ctx, '4-jsdelivr-down', { topics: [X], latest: JSON.stringify({ version: 1, commit: A, enabled: true }), before: cdnDown });
  check(r.shown[X.id], `4. jsDelivr down: ${X.id} shows all its questions`);
  check(
    same(r.asked, [LATEST, `${CDN(A)}manifest.json`, `${RAW(A)}manifest.json`, `${CDN(A)}${F.file}`, `${RAW(A)}${F.file}`, `${CDN(A)}${X.file}`, `${RAW(A)}${X.file}`]),
    '4. each file tried on jsDelivr, then read from GitHub raw at the same commit',
    r.asked.join(' '),
  );
  await ctx.close();
  rmSync(two.dir, { recursive: true, force: true });
}

await browser.close();
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
