import { createServer } from 'node:http';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * The chat Question studio's browser run (k-0516): the welcome, picking a past-paper question
 * (with its diagram) as the reference, the AI's steps (read, picked key point, write, check),
 * the drafts on the paper, Accept / Reject, Side by side with "What changed", changing the
 * pick (Rewrite them / Keep them), "Make draft 2 harder" (v2 · v1), Add into a new worksheet,
 * saved chats across a reload, ✦ Write like this from the Past paper bank (starts at once),
 * the Trial kit in Settings → AI, and the 中文 interface. Nothing real is reached: the AI is
 * `ai-mock-server.mjs`, the Past paper bank an invented export served from here.
 *
 *   npm run dev -- -p 3216
 *   node scripts/studio-chat-verify.mjs [--url=http://localhost:3216] [--out=/tmp/studio-chat] [--mock-port=8821] [--bank-port=8822]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3216');
const OUT = opt('out', '/tmp/studio-chat');
const MOCK_PORT = Number(opt('mock-port', '8821'));
const BANK_PORT = Number(opt('bank-port', '8822'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
mkdirSync(OUT, { recursive: true });

// ---- an invented Past paper bank: three questions, one with a demand-curve diagram ----

const DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="330" height="250" viewBox="0 0 330 250" font-family="Times New Roman" font-size="13">
<polyline points="50,12 50,220 318,220" fill="none" stroke="#111" stroke-width="1.2"/>
<text x="44" y="8">Price ($)</text><text x="318" y="246" text-anchor="end">Quantity</text><text x="42" y="234" text-anchor="end">0</text>
<line x1="76" y1="40" x2="284" y2="200" stroke="#111" stroke-width="1.6"/><text x="288" y="210">D</text>
<polyline points="50,80 128,80 128,220" fill="none" stroke="#555" stroke-dasharray="3 3"/><polyline points="50,120 180,120 180,220" fill="none" stroke="#555" stroke-dasharray="3 3"/>
<circle cx="128" cy="80" r="3"/><circle cx="180" cy="120" r="3"/><text x="134" y="74">A</text><text x="186" y="114">B</text>
<text x="44" y="84" text-anchor="end">12</text><text x="44" y="124" text-anchor="end">10</text><text x="128" y="234" text-anchor="middle">400</text><text x="180" y="234" text-anchor="middle">600</text></svg>`;
const IMAGE = `data:image/svg+xml;base64,${Buffer.from(DIAGRAM).toString('base64')}`;

const bi = (en, zh = '') => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const question = (n, tag, en, zh, options, key, image) => ({
  id: `pp-q${n}`,
  type: 'mcq',
  blocks: [
    { kind: 'paragraph', id: `pp-q${n}-b`, text: bi(en, zh) },
    ...(image ? [{ kind: 'image', id: `pp-q${n}-img`, src: image, widthPx: 300, heightPx: 227, naturalWidthPx: 330, naturalHeightPx: 250, align: 'center', altText: bi('Demand curve D with points A and B', '需求曲線 D 及 A、B 兩點') }] : []),
  ],
  marks: 1,
  options: options.map(([oe, oz], i) => ({ id: `pp-q${n}-o${i}`, text: bi(oe, oz) })),
  answerIndex: key,
  tags: ['C.ped', tag],
  lineage: { rootId: `pp:${tag}` },
});
const QUESTIONS = [
  question(1, 'DSE2099/P1/Q12', 'The diagram below shows the demand curve for concert tickets. When the price falls from $12 to $10, the quantity demanded rises from 400 to 600. Over this price range, the demand for tickets is', '下圖顯示演唱會門票的需求曲線。當價格由 $12 跌至 $10，需求量由 400 增至 600。在這個價格範圍內，門票的需求', [['price elastic.', '富有價格彈性。'], ['price inelastic.', '缺乏價格彈性。'], ['unitarily elastic.', '屬單一價格彈性。'], ['perfectly inelastic.', '完全缺乏價格彈性。']], 0, IMAGE),
  question(2, 'DSE2099/P1/Q2', 'A taxi company raises its fares by 6% and the number of trips falls by 3%. The price elasticity of demand for its trips is', '一間的士公司把車資提高 6%，載客次數減少 3%。其載客服務的需求價格彈性為', [['0.5', '0.5'], ['2', '2'], ['3', '3'], ['9', '9']], 0),
  question(3, 'CE2099/P2/Q3', 'The demand for table salt is price inelastic mainly because salt', '食用鹽的需求缺乏價格彈性，主要是因為鹽', [['has many close substitutes', '有很多相近的替代品'], ['takes up a very small share of income', '只佔收入很小的比例'], ['is a luxury', '是奢侈品'], ['can be stored for years', '可以儲存多年']], 1),
];
const doc = { v: 3, id: 'pp-bank-C', kind: 'bank', name: 'Demand and elasticity', title: bi('Demand and elasticity'), questions: QUESTIONS, layout: [], flow: QUESTIONS.map((q) => ({ type: 'question', id: q.id })), createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const plain = (q, side) => [q.blocks[0].text[side], ...q.options.map((o) => o.text[side])].map((runs) => runs.map((r) => r.text).join('')).join(' ');
const MANIFEST = {
  version: 1,
  enabled: true,
  questions: QUESTIONS.length,
  topics: [{ id: 'C', title: { en: 'Demand and elasticity', zh: '需求與彈性' }, file: 'topics/C.json', questions: QUESTIONS.length, syllabus: ['C.ped'] }],
  search: { version: 1, questions: QUESTIONS.map((q) => ({ topic: 'C', source: q.tags[1], en: plain(q, 'en'), zh: plain(q, 'zh'), pictures: q.blocks.length > 1 ? 1 : 0 })) },
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
    results.push({ name, ok: false });
    console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};
const PROVIDER_HOSTS = ['generativelanguage.googleapis.com', 'api.deepseek.com', 'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai', 'api.openai.com', 'api.anthropic.com'];

async function newPage(browser, { ui = 'en', slow = 0 } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  context.setDefaultTimeout(20_000);
  const ai = { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK}/v1` } };
  await context.addInitScript(
    ([aiJson, bank, lang]) => {
      if (sessionStorage.getItem('chat-seeded')) return;
      sessionStorage.setItem('chat-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econgen.settings.ai', aiJson);
      sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: bank }));
    },
    [JSON.stringify(ai), BANK, ui],
  );
  const leaks = [];
  await context.route((url) => PROVIDER_HOSTS.includes(url.hostname), (r) => {
    leaks.push(r.request().url());
    return r.fulfill({ status: 599, body: 'blocked' });
  });
  const state = { slow };
  // The mock answers at once; a delay lets the screen be seen while the AI works.
  await context.route(`${MOCK}/**`, async (r) => {
    if (state.slow) await new Promise((res) => setTimeout(res, state.slow));
    return r.continue();
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text()) && errors.push(m.text()));
  return { context, page, leaks, errors, state };
}

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const drafts = (page) => page.locator('[data-chat-draft]');

async function openStudio(page, row = /Question studio 擬題工作室/) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: row }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}

async function pickReference(page) {
  await page.locator('[data-start-pick], [data-add-reference]').first().click();
  const card = page.locator('[data-reference-picker] [data-reference-card]', { hasText: 'DSE2099/P1/Q12' }).first();
  await card.waitFor({ timeout: 30_000 });
  return card;
}

// ---- the run ----

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const { context, page, leaks, errors, state } = await newPage(browser, { slow: 1800 });
  await openStudio(page);

  await check('the studio opens on a chat: welcome, no topic picker, no form', async () => {
    await page.locator('[data-chat-welcome]').waitFor();
    expect((await page.locator('select#studio-key-point, [data-studio-key-point]').count()) === 0, 'a key-point picker is on the screen');
    expect((await page.getByText('Trial kit', { exact: true }).count()) === 0, 'the Trial kit tab is still on the studio');
  });

  await check('Pick a past-paper question: the picker draws questions as they print, with their diagram', async () => {
    const card = await pickReference(page);
    // The cards draw their pages as they come into view.
    await page.locator('[data-reference-picker] img').first().waitFor();
    expect((await page.locator('[data-reference-picker] img').count()) > 0, 'no diagram drawn in the picker');
    await card.click();
    await shot(page, 'A1-picker');
    await page.getByRole('button', { name: 'Use as reference' }).click();
    await page.locator('[data-ref-chip]').waitFor();
    expect((await page.locator('[data-chat-input]').inputValue()).includes('like this'), 'the message was not filled in');
  });

  await check('Send: the AI reads the reference, picks the key point itself, and writes (steps in the chat, drafts on the paper)', async () => {
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-step="pick"][data-state="done"]').waitFor();
    await page.waitForTimeout(400);
    await shot(page, 'A2-writing');
    const picked = await page.locator('[data-pick]').first().getAttribute('data-pick');
    expect(picked === 'C.ped', `picked ${picked}`);
    await drafts(page).nth(2).waitFor({ timeout: 40_000 });
    await page.locator('[data-chat-send]').waitFor();
    return `picked ${picked}`;
  });

  await check('Accept and Reject on each draft; the tray counts what is accepted', async () => {
    await drafts(page).nth(0).locator('[data-accept]').click();
    await drafts(page).nth(1).locator('[data-accept]').click();
    await page.locator('[data-studio-tray]').waitFor();
    await page.locator('[data-chat-canvas] .scroll-slim').evaluate((el) => el.scrollTo(0, 0));
    await shot(page, 'A3-drafts');
    expect((await page.locator('[data-chat-draft][data-state="accepted"]').count()) === 2, 'not two accepted');
  });

  await check('Side by side: the reference (with its diagram) beside each draft, and What changed from the reference', async () => {
    await page.locator('[data-view-button="compare"]').click();
    await page.locator('[data-compare-reference]').waitFor();
    expect((await page.locator('[data-compare-reference] img').count()) > 0, 'the reference is drawn without its diagram');
    expect((await page.locator('[data-changed]').count()) >= 2, 'no What changed lists');
    await shot(page, 'A4-side-by-side');
    await page.locator('[data-view-button="paper"]').click();
  });

  await check('Change the pick (never required): it asks Rewrite them / Keep them; Keep writes nothing', async () => {
    await page.locator('[data-pick-change]').last().click();
    await page.locator('[data-pick-menu] button').nth(1).click();
    await page.locator('[data-chat-ask]').waitFor();
    await shot(page, 'A5-change-pick');
    await page.getByRole('button', { name: 'Keep them' }).click();
    await page.getByText('Kept them as they are.').waitFor();
  });

  await check('"Make draft 3 harder": that draft changes in place, v2 · v1, the others stay', async () => {
    const third = drafts(page).nth(2);
    await third.locator('button', { hasText: 'Harder' }).click();
    await page.locator('[data-chat-draft="3"] [aria-label="Versions of this draft"]').waitFor({ timeout: 40_000 });
    await page.locator('[data-chat-send]').waitFor();
    await page.locator('[data-chat-draft="3"]').scrollIntoViewIfNeeded();
    await shot(page, 'A6-harder-v2');
    expect((await drafts(page).count()) === 3, 'the batch changed size');
  });

  await check('Add: the accepted drafts go into a new worksheet, AI-made', async () => {
    state.slow = 0;
    await page.locator('[data-studio-tray] button', { hasText: /^Add$/ }).click();
    await page.locator('[data-testid="ai-made-chip"]').first().waitFor({ timeout: 20_000 });
    await shot(page, 'A10-added-in-worksheet');
  });

  await check('saved chats: the chat comes back after a reload, from Chats ▾', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await openStudio(page);
    await page.locator('[data-chats-menu]').click();
    await page.locator('[data-chats-list] [role="menuitem"]').first().waitFor();
    await shot(page, 'A7-chats');
    await page.locator('[data-chats-list] [role="menuitem"]').first().click();
    await drafts(page).first().waitFor();
    expect((await page.locator('[data-chat-draft][data-state="added"]').count()) === 2, 'the added drafts are not marked Added');
  });

  await check('✦ Write like this in the Past paper bank opens a new chat and starts at once (no form)', async () => {
    state.slow = 800;
    await page.locator('[data-studio-screen] button', { hasText: /^← Home$/ }).click();
    await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
    await page.locator('[data-pastpaper-card] [data-write-like]').first().click();
    await page.locator('[data-studio-screen]').waitFor();
    await page.locator('[data-chat-ai]').first().waitFor();
    await drafts(page).nth(2).waitFor({ timeout: 40_000 });
    expect((await page.locator('[data-chat-user]').count()) === 1, 'not a fresh chat');
  });

  await check('the Trial kit is in Settings → AI', async () => {
    await page.locator('[data-studio-screen] [data-settings-gear]').first().click();
    await page.getByText('AI & translation', { exact: true }).first().click();
    await page.locator('[data-studio-trial-block]').waitFor();
    await shot(page, 'A8-settings-trial');
    await page.keyboard.press('Escape');
  });

  await check('nothing reached a real provider, and no errors', async () => {
    expect(leaks.length === 0, `reached ${leaks[0]}`);
    expect(errors.length === 0, errors[0]);
  });
  await context.close();

  // 中文 interface: the same screen's words.
  const zh = await newPage(browser, { ui: 'zh-HK' });
  await check('中文: the studio in 繁體中文', async () => {
    await openStudio(zh.page, /擬題工作室/);
    await zh.page.locator('[data-chat-welcome]').waitFor();
    const card = await pickReference(zh.page);
    await card.dblclick();
    await zh.page.locator('[data-chat-send]').click();
    await zh.page.locator('[data-chat-draft]').nth(2).waitFor({ timeout: 40_000 });
    await zh.page.locator('[data-chat-send]').waitFor();
    await shot(zh.page, 'A9-zh');
    expect(zh.errors.length === 0, zh.errors[0]);
  });
  await zh.context.close();
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
