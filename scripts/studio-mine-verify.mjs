import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The Question studio's "My questions" references in a browser (k-0529, u-ov6l): the reference
 * picker's second side lists the teacher's own saved MC questions (other types left out and
 * counted), with search, topic and date filters, a preview drawn as it prints (table, diagram,
 * answer, explanation), recently used first, a page at a time on a large bank; the picked
 * question goes to the AI like a past-paper reference (its explanation and picture too), the
 * drafts say what they are based on, and the teacher's own document is never changed. Nothing
 * real is reached: the AI is `ai-mock-server.mjs`, the Past paper bank an invented export.
 *
 *   npm run dev -- -p 3229
 *   node scripts/studio-mine-verify.mjs [--url=http://localhost:3229] [--out=/tmp/studio-mine] [--mock-port=8831] [--bank-port=8832]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3229');
const OUT = opt('out', '/tmp/studio-mine');
const MOCK_PORT = Number(opt('mock-port', '8831'));
const BANK_PORT = Number(opt('bank-port', '8832'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
mkdirSync(OUT, { recursive: true });
configure({ mock: MOCK, bank: BANK });
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// ---- the teacher's own saved papers: MC questions (one with a table, one with a diagram), an LQ ----

const runs = (text) => (text ? [{ text }] : []);
const bi = (en, zh) => ({ en: runs(en), zh: runs(zh) });
let seq = 0;
const nid = (p = 'mv') => `${p}-${(seq += 1)}`;
const DIAGRAM = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200" font-family="Times New Roman" font-size="13"><polyline points="40,10 40,180 290,180" fill="none" stroke="#111"/><line x1="60" y1="30" x2="270" y2="170" stroke="#111" stroke-width="1.6"/><text x="272" y="166">D</text><line x1="60" y1="170" x2="270" y2="30" stroke="#111" stroke-width="1.6"/><text x="272" y="34">S</text><text x="10" y="14">Price</text><text x="290" y="196" text-anchor="end">Quantity</text></svg>`;
const IMAGE = `data:image/svg+xml;base64,${Buffer.from(DIAGRAM).toString('base64')}`;
const options = (list) => list.map(([en, zh]) => ({ id: nid(), text: bi(en, zh) }));
const mcq = (tags, en, zh, list, key, extra = {}, more = []) => ({
  id: nid('q'),
  type: 'mcq',
  blocks: [{ kind: 'paragraph', id: nid(), text: bi(en, zh) }, ...more],
  marks: 1,
  options: options(list),
  answerIndex: key,
  tags,
  ...extra,
});
const table = (rows) => ({
  kind: 'table',
  id: nid('t'),
  rows: rows.map((cells) => ({ id: nid(), cells: cells.map(([en, zh]) => ({ id: nid(), text: bi(en, zh ?? en) })) })),
});

const TABLE_Q = mcq(
  ['C.ped'],
  'The table shows the price and quantity demanded of bubble tea. Between $30 and $25, the demand for bubble tea is',
  '下表顯示珍珠奶茶的價格及需求量。在 $30 至 $25 之間，珍珠奶茶的需求',
  [['price elastic.', '富有價格彈性。'], ['price inelastic.', '缺乏價格彈性。'], ['unitarily elastic.', '屬單一價格彈性。'], ['perfectly elastic.', '完全富有價格彈性。']],
  0,
  { explanation: bi('Price falls by 1/6 but quantity rises by 1/2, so demand is elastic.', '價格下跌六分之一，需求量上升二分之一，故需求富有彈性。') },
  [table([[['Price ($)', '價格 ($)'], ['Quantity (cups)', '數量（杯）']], [['30'], ['200']], [['25'], ['300']]])],
);
const DIAGRAM_Q = mcq(
  ['C.equilibrium'],
  'Refer to the diagram. If the government sets a price ceiling below the equilibrium price, there will be',
  '參閱下圖。若政府把價格上限定於均衡價格之下，將會出現',
  [['a surplus.', '過剩。'], ['a shortage.', '短缺。'], ['no change.', '沒有改變。'], ['a fall in demand.', '需求下降。']],
  1,
  {},
  [{ kind: 'image', id: nid('img'), src: IMAGE, widthPx: 300, heightPx: 200, naturalWidthPx: 300, naturalHeightPx: 200, align: 'center', altText: bi('Demand and supply', '供求') }],
);
const PLAIN_Q = mcq(['A.scarcity'], 'Which of the following is a free good?', '以下哪項是免費物品？', [['Sea water in the ocean', '海洋中的海水'], ['A free newspaper', '免費報章'], ['Public library books', '公共圖書館的書'], ['Free school lunch', '免費學校午餐']], 0);
const OLD_Q = mcq(['F.trade'], 'If a country’s currency depreciates, its exports will become', '若一國貨幣貶值，其出口貨品會變得', [['more expensive to foreigners.', '對外國人來說更貴。'], ['cheaper to foreigners.', '對外國人來說更便宜。'], ['less competitive.', '更缺乏競爭力。'], ['unchanged in price abroad.', '在外國的價格不變。']], 1);
const LQ = {
  id: nid('lq'),
  type: 'structured',
  blocks: [{ kind: 'paragraph', id: nid(), text: bi('Explain the law of demand with an example.', '舉例解釋需求定律。') }],
  parts: [{ id: nid(), blocks: [{ kind: 'paragraph', id: nid(), text: bi('State the law.', '寫出定律。') }], marks: 2 }],
  marks: 2,
  tags: ['C.lawofdemand'],
};

const paperDoc = (id, name, zh, questions, satOn) => ({
  schemaVersion: 1,
  id,
  name,
  title: bi(name, zh),
  instructions: bi('Answer ALL questions.', '回答全部問題。'),
  fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
  pageSetup: { paper: 'A4', orientation: 'portrait', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  header: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
  footer: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
  questions,
  layout: [],
  flow: questions.map((q) => ({ type: 'question', id: q.id })),
  satOn,
  createdAt: `${satOn}T00:00:00.000Z`,
  updatedAt: `${satOn}T00:00:00.000Z`,
});
const today = new Date();
const daysAgo = (n) => new Date(today.getTime() - n * 86_400_000).toISOString().slice(0, 10);
const MOCK_PAPER = paperDoc('mv-mock', 'Mock 2026 · Paper 1', '模擬試 2026 · 卷一', [PLAIN_Q, TABLE_Q, DIAGRAM_Q, LQ], daysAgo(10));
const OLD_PAPER = paperDoc('mv-old', 'Quiz 2024', '小測 2024', [OLD_Q], daysAgo(500));
const seedOf = (docs) => ({
  'econ-worksheet-last-seen-version': VERSION,
  'econ-worksheet-index': JSON.stringify(docs.map((d) => ({ id: d.id, title: d.name, updatedAt: d.updatedAt }))),
  ...Object.fromEntries(docs.map((d) => [`econ-worksheet:${d.id}`, JSON.stringify(d)])),
});
const SEED = seedOf([MOCK_PAPER, OLD_PAPER]);

/** A large bank: 60 papers × 40 MC questions = 2400, to show the list stays quick and pages. */
function bigSeed() {
  const docs = [];
  for (let p = 0; p < 60; p += 1) {
    const qs = [];
    for (let i = 0; i < 40; i += 1) qs.push(mcq([p % 2 ? 'C.ped' : 'E.money'], `Paper ${p} question ${i}: which statement about demand is correct?`, `第 ${p} 卷第 ${i} 題：以下哪項關於需求的描述正確？`, [['A', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D']], i % 4));
    docs.push(paperDoc(`mv-big-${p}`, `Big paper ${p}`, `大型試卷 ${p}`, qs, daysAgo(p * 9)));
  }
  return seedOf(docs);
}

// ---- helpers ----

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const picker = (page) => page.locator('[data-reference-picker]');
async function openStudio(page, row = /Question studio 擬題工作室/) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: row }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}
async function openMine(page) {
  await page.locator('[data-start-pick], [data-add-reference]').first().click();
  await picker(page).waitFor();
  await page.locator('[data-picker-source="mine"]').click();
  await page.locator('[data-my-questions]').waitFor();
}
const cards = (page) => page.locator('[data-my-card]');
const savedDoc = (page, id) => page.evaluate((key) => localStorage.getItem(key), `econ-worksheet:${id}`);

// ---- the run ----

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const { context, page, leaks, errors } = await newPage(browser, { slow: 900, seed: SEED });
  const sent = [];
  context.on('request', (r) => r.url().startsWith(MOCK) && r.method() === 'POST' && sent.push(r.postData() ?? ''));
  await openStudio(page);
  const before = await savedDoc(page, MOCK_PAPER.id);

  await check('k-0529: the picker has two sides; My questions lists my MC questions only and says the LQ is left out', async () => {
    await openMine(page);
    await page.locator('[data-my-card]').first().waitFor({ timeout: 30_000 });
    expect((await cards(page).count()) === 4, `${await cards(page).count()} cards`);
    const status = await page.locator('[data-my-list] [role="status"]').innerText();
    expect(status.includes('4 multiple-choice questions'), status);
    expect((await page.locator('[data-my-only-mc]').innerText()).includes('1 other question is not listed'), 'no MC-only note');
    expect(!(await page.locator('[data-my-list]').innerText()).includes('law of demand'), 'the LQ is listed');
    // Newest paper first.
    expect((await cards(page).last().innerText()).includes('Quiz 2024'), 'the 2024 quiz is not last');
    await shot(page, 'k0529-en-my-questions');
  });

  await check('k-0529: search, topic and date filters', async () => {
    await page.locator('[data-my-search]').fill('bubble tea');
    await page.waitForTimeout(300);
    expect((await cards(page).count()) === 1, `search: ${await cards(page).count()}`);
    await page.locator('[data-my-search]').fill('');
    await page.locator('[data-my-topic="F"]').click();
    expect((await cards(page).count()) === 1 && (await cards(page).first().innerText()).includes('Quiz 2024'), 'topic F');
    await page.locator('[data-my-topic=""]').click();
    await page.locator('[data-my-when="month"]').click();
    expect((await cards(page).count()) === 3, `past month: ${await cards(page).count()}`);
    await page.locator('[data-my-when="older"]').click();
    expect((await cards(page).count()) === 1, `older: ${await cards(page).count()}`);
    await page.locator('[data-my-when="any"]').click();
  });

  await check('k-0529: the preview draws the question as it prints: table, answer, explanation; a diagram too', async () => {
    await cards(page).filter({ hasText: 'bubble tea' }).click();
    const preview = page.locator('[data-my-preview]');
    await preview.locator('[data-reference-sheet]').waitFor();
    await page.waitForFunction(() => {
      const host = document.querySelector('[data-my-preview] [data-reference-sheet]');
      return [...(host?.querySelectorAll('*') ?? [])].some((el) => el.shadowRoot?.querySelector('table'));
    });
    expect((await preview.locator('[data-reference-answer]').innerText()).includes('A'), 'no answer chip');
    expect((await preview.locator('[data-reference-explanation]').innerText()).includes('elastic'), 'no explanation');
    expect((await page.locator('[data-reference-picker] footer [role="status"]').innerText()).includes('Mock 2026 · Paper 1 · Q2'), 'footer does not name it');
    await shot(page, 'k0529-en-preview-table');
    await cards(page).filter({ hasText: 'price ceiling' }).click();
    await page.waitForFunction(() => {
      const host = document.querySelector('[data-my-preview] [data-reference-sheet]');
      return [...(host?.querySelectorAll('*') ?? [])].some((el) => el.shadowRoot?.querySelector('img'));
    });
    await shot(page, 'k0529-en-preview-diagram');
  });

  await check('k-0529: Use as reference: a chip in the composer, the box stays empty (k-0528)', async () => {
    await cards(page).filter({ hasText: 'bubble tea' }).click();
    await page.locator('[data-my-preview] [data-reference-explanation]').waitFor();
    await page.getByRole('button', { name: 'Use as reference' }).click();
    await picker(page).waitFor({ state: 'detached' });
    const chip = page.locator('[data-ref-chip]');
    await chip.waitFor();
    expect((await chip.innerText()).includes('Mock 2026 · Paper 1 · Q2'), await chip.innerText());
    expect((await page.locator('[data-chat-input]').inputValue()) === '', 'the box was filled in');
  });

  await check('k-0529: Send: the AI gets the stem, options, key, explanation of my question; drafts say what they are based on', async () => {
    sent.length = 0;
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-chat-draft]').nth(2).waitFor({ timeout: 60_000 });
    await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    const write = sent.find((body) => body.includes('bubble tea') && body.includes('examples'));
    expect(write, 'no request carried my question');
    expect(write.includes('Price falls by 1/6'), 'the explanation was not sent');
    expect(write.includes('\\"key\\":\\"A\\"') || write.includes('"key":"A"') || /key\\?"\s*:\s*\\?"A/.test(write), 'the key was not sent');
    expect(!write.includes('Mock 2026'), 'the paper name was sent to the AI');
    const based = page.locator('[data-chat-draft]').first().locator('[data-draft-based-on]');
    expect((await based.innerText()).includes('Based on Mock 2026 · Paper 1 · Q2'), await based.innerText());
    await page.locator('[data-chat-draft]').first().scrollIntoViewIfNeeded();
    await shot(page, 'k0529-en-drafts-based-on');
  });

  await check('k-0529: my own question was never changed', async () => {
    expect((await savedDoc(page, MOCK_PAPER.id)) === before, 'the saved paper changed');
  });

  await check('k-0529: reopened, the picker is on My questions with the one just used first; a click outside or Esc closes it', async () => {
    await page.locator('[data-add-reference]').click();
    await page.locator('[data-my-questions]').waitFor();
    await cards(page).first().waitFor();
    const first = await cards(page).first().innerText();
    expect(first.includes('Recently used') && first.includes('bubble tea'), first);
    await shot(page, 'k0529-en-recent-first');
    await page.mouse.click(8, 8);
    await picker(page).waitFor({ state: 'detached', timeout: 3000 });
    await page.locator('[data-add-reference]').click();
    await picker(page).waitFor();
    await page.keyboard.press('Escape');
    await picker(page).waitFor({ state: 'detached', timeout: 3000 });
  });

  await check('nothing reached a real provider, and no errors', async () => {
    expect(leaks.length === 0, `reached ${leaks[0]}`);
    expect(errors.length === 0, errors[0]);
  });
  await context.close();

  // A large bank: 2400 MC questions.
  const big = await newPage(browser, { seed: bigSeed() });
  await check('k-0529: a large bank (2400 questions) opens quickly and shows a page at a time', async () => {
    await openStudio(big.page);
    // Let the 題庫 index read the saved papers first (a first launch only).
    await openMine(big.page);
    await big.page.locator('[data-my-list] [role="status"]', { hasText: '2400 multiple-choice' }).waitFor({ timeout: 90_000 });
    await big.page.keyboard.press('Escape');
    const started = Date.now();
    await openMine(big.page);
    await cards(big.page).first().waitFor();
    const opened = Date.now() - started;
    expect((await cards(big.page).count()) === 40, `${await cards(big.page).count()} cards drawn`);
    await big.page.locator('[data-my-more]').click();
    expect((await cards(big.page).count()) === 80, 'Show more did not add a page');
    const t = Date.now();
    await big.page.locator('[data-my-search]').fill('Paper 7 question 3');
    await big.page.locator('[data-my-list] [role="status"]', { hasText: 'of 2400' }).waitFor();
    const searched = Date.now() - t;
    await shot(big.page, 'k0529-en-large-bank');
    expect(opened < 3000, `opened in ${opened} ms`);
    expect(big.errors.length === 0, big.errors[0]);
    return `opened in ${opened} ms, search in ${searched} ms`;
  });
  await big.context.close();

  // 中文 interface.
  const zh = await newPage(browser, { ui: 'zh-HK', seed: SEED });
  await check('中文: My questions in 繁體中文', async () => {
    await openStudio(zh.page, /擬題工作室/);
    await openMine(zh.page);
    await cards(zh.page).first().waitFor({ timeout: 30_000 });
    expect((await zh.page.locator('[data-picker-source="mine"]').innerText()) === '我的題目', 'side name');
    expect((await zh.page.locator('[data-my-only-mc]').innerText()).includes('暫時只限 MC'), 'MC-only note');
    await cards(zh.page).filter({ hasText: 'bubble tea' }).click();
    await zh.page.locator('[data-my-preview] [data-reference-explanation]').waitFor();
    expect((await zh.page.locator('[data-my-preview] [data-reference-answer]').innerText()).includes('答案'), 'answer chip');
    await shot(zh.page, 'k0529-zh-my-questions');
    await zh.page.getByRole('button', { name: '用作參考' }).click();
    await zh.page.locator('[data-chat-send]').click();
    await zh.page.locator('[data-chat-draft]').nth(2).waitFor({ timeout: 60_000 });
    await zh.page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    expect((await zh.page.locator('[data-chat-draft]').first().locator('[data-draft-based-on]').innerText()).startsWith('參考：'), 'based-on chip');
    await zh.page.locator('[data-chat-draft]').first().scrollIntoViewIfNeeded();
    await shot(zh.page, 'k0529-zh-drafts-based-on');
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
