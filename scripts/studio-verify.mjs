import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * The Question studio's browser run (k-0499, package 2): the trial gate, the page, Write with
 * the canned mock provider, the drafts and their checks, the tray (a new worksheet, a bank),
 * "✦ Write like this" from a Past paper card, Stop, and Gemini that cannot be reached (the
 * VPN note). Nothing real is reached: the AI is `ai-mock-server.mjs`, the Past paper bank is
 * a tiny invented export served from here, and requests to the provider hosts are blocked.
 *
 *   npm run dev -- -p 3199   (or any build served somewhere)
 *   node scripts/studio-verify.mjs [--url=http://localhost:3199] [--out=/tmp/studio-verify] [--only=gate,write,tray,like,stop,vpn,zh,layout,label,trial] [--release]
 *
 * The studio is shown by a develop build with nothing turned on, and hidden by a release build
 * (`src/platform/buildChannel.ts`; a build made with `NEXT_PUBLIC_RELEASE_BUILD=1`). The run
 * checks the build it is pointed at: a develop build by default, a release build with `--release`
 * (then `?studio=trial` turns the studio on first, as the other sections need it).
 *
 * Package 3 (the AI-made label and the trial kit) adds `label` (the chip on the page, the Edit
 * panel's note and Checked, the outline's mark, that none of it prints) and `trial` (run the 30
 * invented briefs against the mock, mark drafts, the bar, the report, the record across a reload).
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3199');
const OUT = opt('out', '/tmp/studio-verify');
const ONLY = opt('only', '').split(',').filter(Boolean);
const MOCK_PORT = Number(opt('mock-port', '8791'));
const BANK_PORT = Number(opt('bank-port', '8792'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
const want = (name) => ONLY.length === 0 || ONLY.includes(name);
/** The build under test is a release build (made with NEXT_PUBLIC_RELEASE_BUILD=1): the studio starts hidden. */
const RELEASE = args.includes('--release');
mkdirSync(OUT, { recursive: true });

// ---- an invented Past paper bank: one topic, three questions, and its search index ----

const bi = (en, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const question = (n, tag, en, zh, options, key) => ({
  id: `pp-q${n}`,
  type: 'mcq',
  blocks: [{ kind: 'paragraph', id: `pp-q${n}-b`, text: bi(en, zh) }],
  marks: 1,
  options: options.map(([oe, oz], i) => ({ id: `pp-q${n}-o${i}`, text: bi(oe, oz) })),
  answerIndex: key,
  tags: ['C.ped', tag],
  lineage: { rootId: `pp:${tag}` },
});
const QUESTIONS = [
  question(1, 'DSE2099/P1/Q1', 'When the price of a notebook rises from $10 to $12, the quantity demanded falls from 500 to 450. The price elasticity of demand is closest to', '當一本記事簿的價格由 $10 升至 $12，需求量由 500 減至 450。需求價格彈性最接近', [['0.25', '0.25'], ['0.5', '0.5'], ['2', '2'], ['4', '4']], 1),
  question(2, 'DSE2099/P1/Q2', 'A taxi company raises its fares by 6% and the number of trips falls by 3%. The price elasticity of demand for its trips is', '一間的士公司把車資提高 6%，載客次數減少 3%。其載客服務的需求價格彈性為', [['0.5', '0.5'], ['2', '2'], ['3', '3'], ['9', '9']], 0),
  question(3, 'CE2099/P2/Q3', 'The demand for table salt is price inelastic mainly because salt', '食用鹽的需求缺乏價格彈性，主要是因為鹽', [['has many close substitutes', '有很多相近的替代品'], ['takes up a very small share of income', '只佔收入很小的比例'], ['is a luxury', '是奢侈品'], ['can be stored for years', '可以儲存多年']], 1),
];
const doc = {
  v: 3,
  id: 'pp-bank-C',
  kind: 'bank',
  name: 'Demand and elasticity',
  title: bi('Demand and elasticity'),
  questions: QUESTIONS,
  layout: [],
  flow: QUESTIONS.map((q) => ({ type: 'question', id: q.id })),
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};
const plain = (q, side) => [q.blocks[0].text[side], ...q.options.map((o) => o.text[side])].map((runs) => runs.map((r) => r.text).join('')).join(' ');
const MANIFEST = {
  version: 1,
  enabled: true,
  questions: QUESTIONS.length,
  topics: [{ id: 'C', title: { en: 'Demand and elasticity', zh: '需求與彈性' }, file: 'topics/C.json', questions: QUESTIONS.length, syllabus: ['C.ped'] }],
  search: { version: 1, questions: QUESTIONS.map((q) => ({ topic: 'C', source: q.tags[1], en: plain(q, 'en'), zh: plain(q, 'zh'), pictures: 0 })) },
};

function startBankServer(port) {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const path = new URL(req.url, BANK).pathname;
    if (path === '/manifest.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(MANIFEST));
    if (path === '/topics/C.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(doc));
    res.writeHead(404).end('not found');
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

// ---- helpers ----

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    const first = e.message.split('\n')[0];
    results.push({ name, ok: false, detail: first });
    console.log(`  FAIL ${name} — ${first}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const PROVIDER_HOSTS = ['generativelanguage.googleapis.com', 'api.deepseek.com', 'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];
const mockCount = async () => (await (await fetch(`${MOCK}/__count`)).json()).count;
const mockReset = () => fetch(`${MOCK}/__reset`, { method: 'POST' });

const WORDS = {
  en: { row: /Question studio 擬題工作室/, home: /^← Home$/, pastRow: /Past paper bank 歷屆試題庫/, add: 'Add', keep: /Keep in my 題庫/, write: /✦ Write 3/, stop: 'Stop' },
  'zh-HK': { row: /擬題工作室/, home: /^← 主頁$/, pastRow: /歷屆試題庫/, add: '加入', keep: /存入我的題庫/, write: /✦ 擬 3 題/, stop: '停止' },
};

/** A fresh teacher: AI pointed at the mock (or Gemini with a fake key), the Past paper bank at the invented export, the studio off. */
async function newPage(browser, { ui = 'en', viewport = { width: 1512, height: 950 }, provider = 'custom', route = '', pastPapers = true, secret = true } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  context.setDefaultTimeout(15_000);
  const ai =
    provider === 'custom'
      ? { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK}${route}/v1` } }
      : { v: 1, provider: 'gemini' };
  await context.addInitScript(
    ([aiJson, bank, withBank, lang, secretKey, secretValue]) => {
      if (sessionStorage.getItem('studio-seeded')) return;
      sessionStorage.setItem('studio-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econgen.settings.ai', aiJson);
      if (secretValue) sessionStorage.setItem(secretKey, secretValue);
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'bilingual' }));
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify(withBank ? { v: 1, mode: 'custom', url: bank } : { v: 1, mode: 'off' }));
    },
    [JSON.stringify(ai), BANK, pastPapers, ui, provider === 'custom' ? 'econgen.secret.ai:custom' : 'econgen.secret.ai:gemini', !secret ? '' : provider === 'custom' ? 'sk-mock-verify-0000' : 'AIzaSyFAKEFAKEFAKEFAKEFAKEFAKE0000000'],
  );
  const leaks = [];
  await context.route(
    (url) => PROVIDER_HOSTS.includes(url.hostname),
    (r) => {
      leaks.push(r.request().url());
      // Gemini "cannot be reached": the connection fails, as it does in Hong Kong without a VPN.
      return provider === 'gemini' ? r.abort('failed') : r.fulfill({ status: 599, body: 'blocked by studio-verify' });
    },
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(m.text()));
  await mockReset();
  return { context, page, leaks, errors };
}

const screen = (page) => page.locator('[data-studio-screen]');
const drafts = (page) => page.locator('[data-studio-draft]:not([data-left-out])');
async function openStudio(page, w) {
  await page.getByRole('button', { name: w.row }).first().click();
  await screen(page).waitFor();
}
/** A develop build shows the studio with nothing turned on; a release build needs the address's switch. */
async function enable(page) {
  await page.goto(RELEASE ? `${APP}/?studio=trial` : APP, { waitUntil: 'networkidle' });
}
async function writeThree(page) {
  await page.locator('#studio-key-point').selectOption('C.ped');
  await page.getByRole('radio', { name: '3', exact: true }).click();
  await page.locator('[data-studio-write]').click();
  await drafts(page).nth(2).waitFor({ timeout: 30_000 });
  await page.locator('[data-studio-write]').waitFor();
}

// ---- the run ----

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const w = WORDS.en;

  if (want('gate')) {
    console.log(RELEASE ? 'gate (release build)' : 'gate (develop build)');
    const { context, page, errors } = await newPage(browser);
    await page.goto(APP, { waitUntil: 'networkidle' });
    const rowCount = () => page.getByRole('button', { name: w.row }).count();
    const likeButtons = async () => {
      await page.getByRole('button', { name: w.pastRow }).first().click();
      await page.locator('[data-pastpaper-card]').first().waitFor({ timeout: 30_000 });
      const n = await page.locator('[data-pastpaper-card] [data-write-like]').count();
      await page.getByRole('button', { name: w.home }).first().click();
      await page.getByRole('button', { name: w.pastRow }).first().waitFor();
      return n;
    };
    if (!RELEASE) {
      await check('a develop build shows it from the first launch: the row and ✦ Write like this, nothing turned on', async () => {
        await page.getByRole('button', { name: w.row }).first().waitFor();
        expect((await page.evaluate(() => localStorage.getItem('econgen.settings.questionStudio'))) === null, 'looking at it wrote a setting');
        expect((await likeButtons()) > 0, 'no ✦ Write like this on the Past paper cards');
      });
      await check('the screen opens, says Trial, and has no "Turn the trial off" (a desktop app has no address bar to bring it back)', async () => {
        await openStudio(page, w);
        expect((await screen(page).getByText('Trial', { exact: true }).count()) === 1, 'no Trial tag');
        expect((await screen(page).locator('[data-studio-trial-off]').count()) === 0, 'an off button is there');
        await page.screenshot({ path: `${OUT}/01-empty-en.png` });
        await screen(page).getByRole('button', { name: w.home }).click();
        await page.getByRole('button', { name: w.row }).first().waitFor();
      });
      await check('?studio=off hides it, once, leaves the address clean, and it stays hidden after a reload', async () => {
        await page.goto(`${APP}/?studio=off&nosplash=1`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.pastRow }).first().waitFor();
        expect((await rowCount()) === 0, 'the studio row stayed');
        expect(!page.url().includes('studio='), `address ${page.url()}`);
        expect(page.url().includes('nosplash=1'), `address lost the other parameter: ${page.url()}`);
        expect((await likeButtons()) === 0, '✦ Write like this stayed');
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.pastRow }).first().waitFor();
        expect((await rowCount()) === 0, 'it came back by itself');
      });
      await check('?studio=trial brings it back, once, with the address clean', async () => {
        await page.goto(`${APP}/?studio=trial&nosplash=1`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.row }).first().waitFor();
        expect(!page.url().includes('studio=') && page.url().includes('nosplash=1'), `address ${page.url()}`);
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.row }).first().waitFor();
      });
    } else {
      await check('a release build hides it on a first launch: no Library row, no ✦ Write like this, nothing about it', async () => {
        await page.getByRole('button', { name: w.pastRow }).first().waitFor();
        expect((await rowCount()) === 0, 'the studio row is there');
        expect((await likeButtons()) === 0, 'a write-like button is there');
        expect(!/Question studio|擬題工作室/.test(await page.locator('body').innerText()), 'the start screen mentions it');
      });
      await check('?studio=trial turns it on, once, and leaves the address clean', async () => {
        await page.goto(`${APP}/?studio=trial&nosplash=1`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.row }).first().waitFor();
        expect(!page.url().includes('studio='), `address ${page.url()}`);
        expect(page.url().includes('nosplash=1'), `address lost the other parameter: ${page.url()}`);
        await page.reload({ waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.row }).first().waitFor();
        expect((await likeButtons()) > 0, 'no ✦ Write like this after the switch');
      });
      await check('the screen opens, says Trial, and its foot turns the trial off again', async () => {
        await openStudio(page, w);
        expect((await screen(page).getByText('Trial', { exact: true }).count()) === 1, 'no Trial tag');
        await page.screenshot({ path: `${OUT}/01-empty-en.png` });
        await screen(page).locator('[data-studio-trial-off]').click();
        await page.getByRole('button', { name: w.pastRow }).first().waitFor();
        expect((await rowCount()) === 0, 'the studio row stayed');
      });
      await check('?studio=off turns it off again', async () => {
        await page.goto(`${APP}/?studio=trial`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.row }).first().waitFor();
        await page.goto(`${APP}/?studio=off`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: w.pastRow }).first().waitFor();
        expect((await rowCount()) === 0, 'the studio row stayed');
      });
    }
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('write') || want('tray')) {
    console.log('write');
    const { context, page, leaks, errors } = await newPage(browser);
    await enable(page);
    await openStudio(page, w);
    await check('Write needs a key point, and nothing is sent before it', async () => {
      expect(await page.locator('[data-studio-write]').isDisabled(), 'Write is enabled with no key point');
      expect((await mockCount()) === 0, 'a request left already');
    });
    await check('the form lists what is sent, and writes three drafts with two requests', async () => {
      await page.locator('#studio-key-point').selectOption('C.ped');
      const sends = (await page.locator('[data-studio-sends]').innerText()).replace(/\s+/g, ' ');
      expect(/Sends this to/.test(sends) && /key point/i.test(sends) && /Nothing else/.test(sends), `sends: ${sends}`);
      expect((await mockCount()) === 0, 'a request left before Write');
      await writeThree(page);
      // Write and the blind solve; a third request means a draft was written again (a check failed it).
      expect((await mockCount()) >= 2 && (await mockCount()) <= 4, `requests: ${await mockCount()}`);
      expect((await drafts(page).count()) === 3, 'not three drafts');
      return `${await drafts(page).count()} drafts, ${await mockCount()} requests`;
    });
    await check('each draft is AI-made, shows its key, and carries seven check chips', async () => {
      const card = drafts(page).first();
      expect((await card.getByText('AI-made', { exact: true }).count()) === 1, 'no AI-made chip');
      expect(/Key [A-D]/.test(await card.innerText()), 'no key');
      expect((await card.locator('[data-check]').count()) === 7, 'not seven chips');
      expect((await page.locator('[data-studio-draft] [data-check="copy"]').first().getAttribute('data-state')) === 'pass', 'copy not passed');
    });
    await check('the checks column explains the focused draft, and the session has counts', async () => {
      const checks = page.locator('[data-studio-checks]');
      expect((await checks.locator('[data-check-row]').count()) === 7, 'not seven rows');
      expect((await checks.locator('[data-check-row="key"]').getAttribute('data-state')) === 'pass', 'key row not passed');
      const text = await checks.innerText();
      expect(/compared with 3 past paper questions/.test(text), `compared line: ${text.slice(-260)}`);
      expect(/This session: \d+ requests/.test(text), 'no usage line');
      await page.screenshot({ path: `${OUT}/02-drafts-en.png` });
    });
    await check('Harder changes that draft in place with two more requests, and the other drafts stay', async () => {
      const before = await drafts(page).first().innerText();
      const others = await drafts(page).nth(1).innerText();
      const sent = await mockCount();
      await drafts(page).first().getByRole('button', { name: 'Harder', exact: true }).click();
      await page.waitForFunction((n) => (document.querySelector('[data-studio-usage]')?.textContent ?? '').match(/(\d+) requests/)?.[1] >= n + 2, sent, { timeout: 30_000 });
      await page.waitForTimeout(300);
      expect((await drafts(page).count()) === 3, 'the number of drafts changed');
      expect((await drafts(page).first().innerText()) !== before, 'the draft did not change');
      expect((await drafts(page).nth(1).innerText()) === others, 'another draft changed');
      expect((await mockCount()) >= sent + 2, `requests: ${await mockCount()}`);
    });
    await check('Another adds one beside it; Discard takes one away', async () => {
      await drafts(page).first().getByRole('button', { name: 'Another', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('[data-studio-draft]:not([data-left-out])').length === 4, null, { timeout: 30_000 });
      await drafts(page).nth(1).getByRole('button', { name: 'Discard', exact: true }).click();
      expect((await drafts(page).count()) === 3, 'discard did not remove it');
    });
    await check('nothing reached a real provider (the blind solve request itself is checked under "like")', async () => {
      expect(leaks.length === 0, `leaks: ${leaks.join(', ')}`);
    });
    if (want('tray')) {
      console.log('tray');
      await check('ticking drafts shows the tray; a failed or unticked draft is not offered', async () => {
        await drafts(page).nth(0).getByRole('checkbox').check();
        await drafts(page).nth(1).getByRole('checkbox').check();
        await page.locator('[data-studio-tray]').waitFor();
        expect(/2 picked/.test(await page.locator('[data-studio-tray]').innerText()), 'not 2 picked');
        await page.screenshot({ path: `${OUT}/03-tray-en.png` });
      });
      await check('Add → New worksheet opens the editor with both, one ⌘Z away', async () => {
        await page.locator('[data-studio-tray]').getByRole('button', { name: w.add, exact: true }).click();
        await page.locator('#print-root').waitFor({ timeout: 20_000 });
        await page.waitForFunction(() => /elastic/i.test(document.querySelector('#print-root')?.textContent ?? ''), null, { timeout: 15_000 });
        const text = await page.locator('#print-root').innerText();
        expect(/milk tea|ferry|textbook/i.test(text), `paper text: ${text.slice(0, 160)}`);
        await page.screenshot({ path: `${OUT}/04-added-en.png` });
        return 'two AI-made questions on the paper';
      });
      await check('back in the studio the added drafts are gone and the third is still there', async () => {
        // Leave the editor the way a teacher does (its Econ Studio breadcrumb), never by reloading: the session is in memory.
        await page.getByRole('button', { name: /Econ Studio/ }).first().click();
        await page.getByRole('button', { name: w.row }).first().waitFor({ timeout: 20_000 });
        await openStudio(page, w);
        const left = await drafts(page).count();
        expect(left === 1, `drafts now ${left}`);
        return `${left} drafts left on the sheet`;
      });
      await check('Keep in my 題庫 puts the ticked draft in the one bank, and it leaves the sheet', async () => {
        await drafts(page).first().getByRole('checkbox').check();
        await page.locator('[data-studio-tray]').getByRole('button', { name: w.keep }).click();
        await page.getByText(/kept in/).first().waitFor({ timeout: 15_000 });
        await page.waitForTimeout(400);
        expect((await drafts(page).count()) === 0, 'the draft stayed on the sheet');
        const banks = await page.evaluate(() => {
          const index = JSON.parse(localStorage.getItem('econ-worksheet-index') ?? '[]');
          return index.filter((entry) => JSON.parse(localStorage.getItem(`econ-worksheet:${entry.id}`) ?? '{}').kind === 'bank').length;
        });
        expect(banks === 1, `banks: ${banks}`);
        await page.screenshot({ path: `${OUT}/04b-kept-en.png` });
      });
    }
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('like')) {
    console.log('like');
    const { context, page, errors } = await newPage(browser);
    await enable(page);
    await check('✦ Write like this on a Past paper card opens the studio with it as the example and its key point chosen', async () => {
      await page.getByRole('button', { name: w.pastRow }).first().click();
      await page.locator('[data-pastpaper-card]').first().waitFor({ timeout: 30_000 });
      await page.screenshot({ path: `${OUT}/05-pastpaper-en.png` });
      await page.locator('[data-pastpaper-card] [data-write-like]').first().click();
      await screen(page).waitFor();
      const example = page.locator('[data-studio-example]');
      expect((await example.count()) === 1, 'no example');
      expect(/DSE2099|HKDSE 2099/.test(await example.innerText()), `example: ${await example.innerText()}`);
      expect((await page.locator('#studio-key-point').inputValue()) === 'C.ped', 'key point not chosen');
      const sends = (await page.locator('[data-studio-sends]').innerText()).replace(/\s+/g, ' ');
      expect(/1 question you picked, word for word/.test(sends) && /HKEAA/.test(sends), `sends: ${sends}`);
      await page.screenshot({ path: `${OUT}/06-example-en.png` });
    });
    await check('the request carries the example’s words and never its year or paper', async () => {
      const bodies = [];
      page.on('request', (req) => req.url().startsWith(MOCK) && req.method() === 'POST' && bodies.push(req.postData() ?? ''));
      await page.locator('#studio-key-point').selectOption('C.ped');
      await page.getByRole('radio', { name: '1', exact: true }).click();
      await page.locator('[data-studio-write]').click();
      await drafts(page).first().waitFor({ timeout: 30_000 });
      const write = bodies.find((b) => b.includes('question-studio-write')) ?? '';
      const solve = bodies.find((b) => b.includes('question-studio-solve')) ?? '';
      expect(write.includes('notebook rises from $10 to $12'), 'example words missing from the write request');
      // The system prompts say "HKDSE" themselves; the example's own year (2099) and tag must not travel.
      expect(!/2099/.test(write + solve), 'the example\u2019s year or source tag was sent');
      expect(solve && !solve.includes('notebook') && !solve.includes('explanation') && !solve.includes('syllabus'), 'the solve request carries more than the question');
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('stop')) {
    console.log('stop');
    const { context, page, errors } = await newPage(browser, { route: '/slow' });
    await enable(page);
    await openStudio(page, w);
    await check('Stop during the first write: no drafts, no error', async () => {
      await page.locator('#studio-key-point').selectOption('C.ped');
      await page.locator('[data-studio-write]').click();
      await page.getByRole('button', { name: w.stop, exact: true }).click();
      await page.locator('[data-studio-write]').waitFor();
      await page.waitForTimeout(500);
      expect((await drafts(page).count()) === 0, 'drafts appeared');
      expect((await page.locator('[data-notice="error"]').count()) === 0, 'an error showed');
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('setup')) {
    console.log('setup');
    const { context, page, errors } = await newPage(browser, { secret: false });
    await enable(page);
    await openStudio(page, w);
    await check('no key yet: Write says to set up a provider, with Open Settings, and nothing is sent', async () => {
      await page.locator('#studio-key-point').selectOption('C.ped');
      await page.locator('[data-studio-write]').click();
      const error = page.locator('[data-notice="error"]');
      await error.waitFor({ timeout: 15_000 });
      const text = (await error.innerText()).replace(/\s+/g, ' ');
      expect(/Set up a provider in Settings first/.test(text) && /Open Settings/.test(text), `error: ${text}`);
      expect((await mockCount()) === 0, 'a request left without a key');
      await page.screenshot({ path: `${OUT}/11-setup-en.png` });
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('vpn')) {
    console.log('vpn');
    const { context, page, errors } = await newPage(browser, { provider: 'gemini' });
    await enable(page);
    await openStudio(page, w);
    await check('Gemini that cannot connect says it needs a VPN in Hong Kong, with Try again', async () => {
      await page.locator('#studio-key-point').selectOption('C.ped');
      await page.locator('[data-studio-write]').click();
      const error = page.locator('[data-notice="error"]');
      await error.waitFor({ timeout: 40_000 });
      const text = (await error.innerText()).replace(/\s+/g, ' ');
      expect(/needs a VPN/.test(text), `error: ${text}`);
      expect(/Try again/.test(text), 'no Try again');
      await page.screenshot({ path: `${OUT}/07-vpn-en.png` });
      return text.slice(0, 140);
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('zh')) {
    console.log('zh-HK');
    const z = WORDS['zh-HK'];
    const { context, page, errors } = await newPage(browser, { ui: 'zh-HK' });
    await enable(page);
    await check('the whole page reads in 中文: row, source, drafts, checks, tray', async () => {
      await openStudio(page, z);
      await page.screenshot({ path: `${OUT}/08-empty-zh.png` });
      await page.locator('#studio-key-point').selectOption('C.ped');
      await page.locator('[data-studio-write]').click();
      await drafts(page).nth(2).waitFor({ timeout: 30_000 });
      await drafts(page).first().getByRole('checkbox').check();
      await page.locator('[data-studio-tray]').waitFor();
      await page.screenshot({ path: `${OUT}/09-drafts-zh.png` });
      const text = await screen(page).innerText();
      for (const word of ['擬題工作室', '來源', '草稿', '檢查', '加入', '存入我的題庫', '會把以下內容傳送給']) expect(text.includes(word), `missing ${word}`);
      for (const english of ['Sends this to', 'Key point', 'Drafts', 'Keep in my']) expect(!text.includes(english), `English left: ${english}`);
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }


  if (want('label')) {
    console.log('label');
    const { context, page, errors } = await newPage(browser);
    await enable(page);
    await openStudio(page, w);
    await writeThree(page);
    await drafts(page).nth(0).getByRole('checkbox').check();
    await drafts(page).nth(1).getByRole('checkbox').check();
    await page.locator('[data-studio-tray]').getByRole('button', { name: w.add, exact: true }).click();
    await page.locator('#print-root').waitFor({ timeout: 20_000 });
    // The page being edited is `#print-root`; a second, off-screen copy of it measures the pages.
    const chips = page.locator('#print-root [data-testid="ai-made-chip"]');
    const marks = page.getByRole('img', { name: 'AI-made, not checked yet' });
    await chips.first().waitFor({ timeout: 20_000 });
    await page.waitForTimeout(500);
    await check('both added questions wear the AI-made chip on the page', async () => {
      await page.screenshot({ path: `${OUT}/12-label-page-en.png` });
      expect((await chips.count()) === 2, `chips: ${await chips.count()}`);
      expect(/AI-made · not checked/.test(await chips.first().innerText()), 'chip words');
    });
    await check('the outline marks both questions', async () => {
      expect((await marks.count()) === 2, `outline marks: ${await marks.count()}`);
    });
    await check('the Edit panel of the first question says so and offers Checked', async () => {
      await page.locator('[role="tab"]', { hasText: 'Question 1' }).click();
      const note = page.locator('[data-testid="ai-made-note"]');
      await note.waitFor({ timeout: 10_000 });
      expect(/AI-made, not checked yet/.test(await note.innerText()), 'note words');
      expect((await note.getByRole('button', { name: 'Checked', exact: true }).count()) === 1, 'no Checked button');
      await page.screenshot({ path: `${OUT}/12b-label-note-en.png` });
    });
    await check('none of it prints: no chip is drawn in the print root, and the paper text carries no label', async () => {
      await page.emulateMedia({ media: 'print' });
      const drawn = await page.evaluate(() => [...document.querySelectorAll('#print-root [data-testid="ai-made-chip"]')].filter((el) => el.getClientRects().length > 0).length);
      await page.emulateMedia({ media: 'screen' });
      expect(drawn === 0, `${drawn} chips would print`);
      const paper = (await page.locator('#print-root').innerText()).replace(/AI-made · not checked/g, '');
      expect(!/AI-made|AI 擬題/.test(paper), 'the paper itself names the label');
    });
    await check('Checked clears that question only: one chip, no note, one outline mark left', async () => {
      await page.locator('[data-testid="ai-made-note"]').getByRole('button', { name: 'Checked', exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll('#print-root [data-testid="ai-made-chip"]').length === 1, null, { timeout: 10_000 });
      expect((await page.locator('[data-testid="ai-made-note"]').count()) === 0, 'the note stayed');
      await page.locator('[role="tab"]', { hasText: 'Content' }).click();
      expect((await marks.count()) === 1, `outline marks: ${await marks.count()}`);
      await page.screenshot({ path: `${OUT}/13-label-checked-en.png` });
    });
    await check('Undo puts the label back', async () => {
      await page.keyboard.press('Control+z');
      await page.waitForFunction(() => document.querySelectorAll('#print-root [data-testid="ai-made-chip"]').length === 2, null, { timeout: 10_000 });
      expect((await marks.count()) === 2, 'the outline mark did not come back');
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();

    const zh = await newPage(browser, { ui: 'zh-HK' });
    await enable(zh.page);
    await check('in 中文 the chip, the outline and the note read in 中文', async () => {
      await openStudio(zh.page, WORDS['zh-HK']);
      await writeThree(zh.page);
      await drafts(zh.page).nth(0).getByRole('checkbox').check();
      await zh.page.locator('[data-studio-tray]').getByRole('button', { name: WORDS['zh-HK'].add, exact: true }).click();
      await zh.page.locator('#print-root [data-testid="ai-made-chip"]').first().waitFor({ timeout: 20_000 });
      expect(/AI 擬題 · 未核對/.test(await zh.page.locator('#print-root [data-testid="ai-made-chip"]').first().innerText()), 'chip not in 中文');
      expect((await zh.page.getByRole('img', { name: 'AI 擬題，尚未核對' }).count()) === 1, 'outline mark not in 中文');
      await zh.page.locator('[role="tab"]', { hasText: /題目 1|問題 1|第 1 題/ }).first().click();
      const note = zh.page.locator('[data-testid="ai-made-note"]');
      await note.waitFor({ timeout: 10_000 });
      expect(/AI 擬題，尚未核對/.test(await note.innerText()) && (await note.getByRole('button', { name: '已核對', exact: true }).count()) === 1, 'note not in 中文');
      await zh.page.screenshot({ path: `${OUT}/14-label-zh.png` });
    });
    expect(zh.errors.length === 0, `page errors: ${zh.errors.join(' | ')}`);
    await zh.context.close();
  }

  if (want('trial')) {
    console.log('trial');
    const { context, page, errors } = await newPage(browser);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(APP).origin }).catch(() => undefined);
    await enable(page);
    await openStudio(page, w);
    const progress = page.locator('[data-trial-progress]');
    const cards = page.locator('[data-trial-draft]');
    await check('the Write tab’s drafts carry the trial’s two marks, and a mark there is the same record', async () => {
      await writeThree(page);
      const marks = drafts(page).first().locator('[data-trial-marks]');
      expect((await marks.count()) === 1, 'no marks row on the draft');
      await marks.locator('[data-mark="key-ok"]').click();
      expect((await marks.locator('[data-mark="key-ok"]').getAttribute('aria-pressed')) === 'true', 'the mark did not take');
    });
    await check('the Trial kit tab shows the 30 briefs, your own requests so far, and the first mark you gave', async () => {
      await screen(page).getByRole('radio', { name: 'Trial kit', exact: true }).click();
      await page.locator('[data-studio-trial]').waitFor();
      expect(/0 of 30 briefs have drafts/.test(await progress.innerText()), `progress: ${await progress.innerText()}`);
      expect(/1 of your requests so far/.test(await page.locator('[data-trial-briefs]').innerText()), 'own requests not counted');
      expect((await cards.count()) === 3, `cards: ${await cards.count()}`);
      const first = page.locator('[data-trial-draft] [data-mark="key-ok"][aria-pressed="true"]');
      expect((await first.count()) === 1, 'the mark given on the Write tab is not here');
      await page.screenshot({ path: `${OUT}/15-trial-empty-en.png` });
    });
    await mockReset();
    await check('Run the 30 briefs: every brief gets drafts, the list fills, and nothing is lost on the way', async () => {
      await page.locator('[data-trial-run]').click();
      await page.waitForFunction(() => /30 of 30 briefs have drafts/.test(document.querySelector('[data-trial-progress]')?.textContent ?? ''), null, { timeout: 240_000 });
      expect((await cards.count()) > 30, `cards: ${await cards.count()}`);
      expect((await mockCount()) >= 60, `requests: ${await mockCount()}`);
      expect(/Every brief has drafts/.test(await page.locator('[data-trial-briefs]').innerText()), 'no all-done line');
      expect((await page.locator('[data-trial-run]').count()) === 0, 'Run is still offered');
      await page.screenshot({ path: `${OUT}/16-trial-run-en.png` });
      return `${await cards.count()} drafts to read, ${await mockCount()} requests`;
    });
    await check('a card shows its brief, what was asked, its checks, and the marks to give', async () => {
      const brief = page.locator('[data-trial-draft]', { hasText: 'Brief B01' }).first();
      expect((await brief.count()) === 1, 'no card for B01');
      const text = await brief.innerText();
      expect(/Price elasticity of demand/.test(text), 'what was asked is missing');
      expect((await brief.locator('[data-trial-marks]').count()) === 1, 'no marks');
      expect(/Key [A-D]/.test(text), 'no key');
    });
    await check('marking a draft drops it from "Not marked yet"; twenty marked, the bar is judged', async () => {
      const before = await cards.count();
      for (let i = 0; i < 20; i += 1) {
        const top = cards.first();
        // The first card already holds the key mark given on the Write tab: a second press would take it back.
        if ((await top.locator('[data-mark="key-ok"]').getAttribute('aria-pressed')) !== 'true') await top.locator('[data-mark="key-ok"]').click();
        await top.locator('[data-mark="use-asis"]').click();
        await page.waitForFunction((n) => document.querySelectorAll('[data-trial-draft]').length === n, before - i - 1, { timeout: 10_000 });
      }
      expect((await cards.count()) === before - 20, 'marked drafts stayed in the list');
      const report = await page.locator('[data-trial-report]').innerText();
      expect(/20 of \d+ drafts marked/.test(report), `report: ${report.slice(0, 200)}`);
      expect(/The bar is met/.test(report), `verdict: ${report.slice(0, 260)}`);
      await page.screenshot({ path: `${OUT}/17-trial-report-en.png` });
    });
    await check('All shows the marked ones again, with their marks held', async () => {
      await screen(page).getByRole('radio', { name: 'All', exact: true }).click();
      expect((await page.locator('[data-trial-draft] [data-mark="use-asis"][aria-pressed="true"]').count()) >= 20, 'marks not shown');
    });
    await check('Copy report puts the English report on the clipboard', async () => {
      await page.getByRole('button', { name: 'Copy report', exact: true }).click();
      await page.waitForTimeout(300);
      const text = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
      const shown = await page.locator('[data-trial-report] textarea').inputValue();
      const got = text || shown;
      expect(/^Question studio trial report/.test(got) && /Key defensible: \d+ of \d+/.test(got) && /Verdict: PASS/.test(got), `report: ${got.slice(0, 200)}`);
      expect(!/sk-mock-verify|AIzaSy/.test(got), 'a key is in the report');
    });
    await check('a reload keeps the record: the briefs are still done and the marks still held', async () => {
      await page.reload({ waitUntil: 'networkidle' });
      await openStudio(page, w);
      await screen(page).getByRole('radio', { name: 'Trial kit', exact: true }).click();
      await page.locator('[data-studio-trial]').waitFor();
      expect(/30 of 30 briefs have drafts/.test(await progress.innerText()), `progress: ${await progress.innerText()}`);
      await screen(page).getByRole('radio', { name: 'All', exact: true }).click();
      expect((await page.locator('[data-trial-draft] [data-mark="use-asis"][aria-pressed="true"]').count()) >= 20, 'marks lost on reload');
      expect(/The bar is met/.test(await page.locator('[data-trial-report]').innerText()), 'verdict lost');
    });
    await check('Clear needs a second click, then empties the record', async () => {
      const clear = page.locator('[data-trial-clear]');
      await clear.click();
      expect(/Click again/.test(await clear.innerText()), 'no second-click prompt');
      await clear.click();
      await page.waitForFunction(() => /0 of 30 briefs have drafts/.test(document.querySelector('[data-trial-progress]')?.textContent ?? ''), null, { timeout: 10_000 });
      expect((await cards.count()) === 0, 'cards left');
      expect((await page.evaluate(() => localStorage.getItem('econgen.studioTrial.v1'))) === null, 'the saved record stayed');
    });
    await check('Trial kit in 中文 reads in 中文', async () => {
      await page.evaluate(() => localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'bilingual' })));
      await page.reload({ waitUntil: 'networkidle' });
      await openStudio(page, WORDS['zh-HK']);
      await screen(page).getByRole('radio', { name: '試用工具', exact: true }).click();
      const text = await screen(page).innerText();
      for (const word of ['30 個擬定要求', '你自己的要求', '執行 30 個要求', '目前結果']) expect(text.includes(word), `missing ${word}`);
      await page.screenshot({ path: `${OUT}/18-trial-zh.png` });
    });
    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }

  if (want('layout')) {
    console.log('layout');
    for (const [name, viewport] of [['1024', { width: 1024, height: 768 }], ['390', { width: 390, height: 844 }]]) {
      const { context, page, errors } = await newPage(browser, { viewport });
      await enable(page);
      await check(`${name} px wide: three columns or one stack, nothing cut off`, async () => {
        await openStudio(page, w);
        await page.locator('#studio-key-point').selectOption('C.ped');
        await page.locator('[data-studio-write]').scrollIntoViewIfNeeded();
        await page.locator('[data-studio-write]').click();
        await drafts(page).first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(600);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow <= 1, `horizontal overflow ${overflow}px`);
        await page.screenshot({ path: `${OUT}/10-layout-${name}.png`, fullPage: false });
      });
      await check(`${name} px wide: the Trial kit splits or stacks, nothing cut off`, async () => {
        await screen(page).getByRole('radio', { name: 'Trial kit', exact: true }).click();
        await page.locator('[data-studio-trial]').waitFor();
        await page.waitForTimeout(400);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow <= 1, `horizontal overflow ${overflow}px`);
        await page.screenshot({ path: `${OUT}/19-trial-layout-${name}.png`, fullPage: false });
      });
      expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  mockServer.close();
  bankServer.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
