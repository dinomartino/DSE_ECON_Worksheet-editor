import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The editor's ✦ Write panel, in a browser (k-0516 package B): a paper with tagged questions
 * opens on the Write tab's opener (its topics, the first one with no question offered in one
 * click); the click on Q4 sets where drafts go; the AI's steps in the panel, its drafts on the
 * page as dashed "would be Q5…" questions where Accept puts them; Accept (one ⌘Z takes it back
 * out, and the draft returns), Reject, Accept all; drafts never print; the chat comes back
 * after a reload, apart from the studio's own chats; the 中文 interface. Nothing real is
 * reached: the AI is `ai-mock-server.mjs`, the Past paper bank an invented export.
 *
 *   npm run dev -- -p 3216
 *   node scripts/studio-panel-verify.mjs [--url=http://localhost:3216] [--out=/tmp/studio-panel] [--mock-port=8831] [--bank-port=8832]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3216');
const OUT = opt('out', '/tmp/studio-panel');
const MOCK_PORT = Number(opt('mock-port', '8831'));
const BANK_PORT = Number(opt('bank-port', '8832'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
mkdirSync(OUT, { recursive: true });
configure({ mock: MOCK, bank: BANK });
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// ---- an invented Paper 1 with six tagged MC questions (topics A, B, D, E, F: no C) ----

const runs = (text) => (text ? [{ text }] : []);
const bi = (en, zh) => ({ en: runs(en), zh: runs(zh) });
let seq = 0;
const nid = () => `pv-${(seq += 1)}`;
const mcq = (tag, en, zh, options, key) => ({
  id: nid(),
  type: 'mcq',
  blocks: [{ kind: 'paragraph', id: nid(), text: bi(en, zh) }],
  marks: 1,
  options: options.map(([oe, oz]) => ({ id: nid(), text: bi(oe, oz) })),
  answerIndex: key,
  tags: [tag],
});
const QUESTIONS = [
  mcq('A.scarcity', 'Which of the following is a free good?', '以下哪項是免費物品？', [['Sea water in the ocean', '海洋中的海水'], ['A free newspaper', '免費報章'], ['Public library books', '公共圖書館的書'], ['Free school lunch', '免費學校午餐']], 0),
  mcq('B.firms', 'A sole proprietorship differs from a partnership in that the owner', '獨資企業與合夥企業的分別在於東主', [['has unlimited liability.', '負無限債務責任。'], ['bears all the profit and loss alone.', '獨自承擔所有盈虧。'], ['must register with the government.', '必須向政府登記。'], ['can raise capital by issuing shares.', '可發行股票集資。']], 1),
  mcq('D.gdp', 'Which of the following is included in Hong Kong’s GDP?', '以下哪項計算在香港的本地生產總值內？', [['Pocket money from parents', '父母給的零用錢'], ['A new flat built this year', '今年興建的新樓宇'], ['Buying second-hand cars', '購買二手汽車'], ['Old age allowance', '高齡津貼']], 1),
  mcq('E.money', 'If the required reserve ratio is 20%, the maximum banking multiplier is', '若法定儲備比率為 20%，最大的銀行體系貨幣乘數為', [['2', '2'], ['4', '4'], ['5', '5'], ['20', '20']], 2),
  mcq('F.trade', 'If a country’s currency depreciates, its exports will become', '若一國貨幣貶值，其出口貨品會變得', [['more expensive to foreigners.', '對外國人來說更貴。'], ['cheaper to foreigners.', '對外國人來說更便宜。'], ['less competitive.', '更缺乏競爭力。'], ['unchanged in price abroad.', '在外國的價格不變。']], 1),
  mcq('A.ppc', 'A point inside a production possibility frontier shows that', '生產可能曲線以內的一點表示', [['resources are not fully employed.', '資源沒有被全面使用。'], ['the economy grows.', '經濟增長。'], ['output is unattainable.', '產量無法達到。'], ['opportunity cost is zero.', '機會成本為零。']], 0),
];
const NOW = '2026-11-23T00:00:00.000Z';
const PAPER = {
  schemaVersion: 1,
  id: 'pv-paper',
  name: 'Mock 2026 · Paper 1',
  title: bi('Mock 2026 · Paper 1', '模擬試 2026 · 卷一'),
  instructions: bi('Answer ALL questions.', '回答全部問題。'),
  fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
  pageSetup: { paper: 'A4', orientation: 'portrait', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  header: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
  footer: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
  questions: QUESTIONS,
  layout: [],
  flow: QUESTIONS.map((q) => ({ type: 'question', id: q.id })),
  createdAt: NOW,
  updatedAt: NOW,
};
const seed = {
  'econ-worksheet-last-seen-version': VERSION,
  'econ-worksheet-index': JSON.stringify([{ id: PAPER.id, title: PAPER.name, updatedAt: NOW }]),
  [`econ-worksheet:${PAPER.id}`]: JSON.stringify(PAPER),
};

// ---- helpers ----

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
/** Wait, and on a timeout keep a picture of what the page showed. */
const waitOr = (page, locator, name, timeout = 20_000) =>
  locator.waitFor({ timeout }).catch(async (e) => {
    await shot(page, `debug-${name}`);
    throw new Error(`${name}: ${e.message.split('\n')[0]}`);
  });
const ghosts = (page) => page.locator('#print-root [data-ai-ghost]');
const ready = (page) => page.locator('#print-root [data-ai-ghost-status="ok"], #print-root [data-ai-ghost-status="look"]');
const questionCount = (page) => page.evaluate((id) => JSON.parse(localStorage.getItem(`econ-worksheet:${id}`) ?? '{}').questions?.length ?? 0, PAPER.id);

async function openPaper(page, name = /Mock 2026 · Paper 1/) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1200);
}
const openWrite = async (page) => {
  await page.locator('[data-sidebar-tab="write"]').click();
  await page.locator('[data-write-panel]').waitFor();
};
/** Saved: the autosave has written the paper (it waits a moment after an edit). */
const saved = async (page, n) => {
  for (let i = 0; i < 40; i += 1) {
    if ((await questionCount(page)) === n) return true;
    await page.waitForTimeout(250);
  }
  return false;
};

// ---- the run ----

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const { context, page, leaks, errors, state } = await newPage(browser, { slow: 1400, seed });
  await openPaper(page);

  await check('the editor offers ✦ Write beside Content, Question and 題庫; it opens on the paper’s topics, C offered', async () => {
    await openWrite(page);
    await page.locator('[data-write-opener]').waitFor();
    const gap = await page.locator('[data-write-gap]').getAttribute('data-write-gap');
    expect(gap === 'C', `gap ${gap}`);
    const counts = await page.locator('[data-write-coverage] [data-topic]').evaluateAll((els) => els.map((e) => `${e.dataset.topic}${e.dataset.count}`).join(' '));
    expect(counts.startsWith('A2 B1 C0 D1 E1 F1'), counts);
    expect((await page.locator('select#studio-key-point, [data-studio-key-point]').count()) === 0, 'a key-point picker');
    return counts;
  });

  await check('a click on Q4 is where drafts go: "Writing for Mock 2026 · Paper 1 · after Q4"', async () => {
    await page.locator('#print-root [data-flow-id]').nth(3).click({ position: { x: 4, y: 4 } });
    await page.waitForTimeout(300);
    expect(await page.locator('[data-write-panel]').isVisible(), 'the click left the Write tab');
    const where = await page.locator('[data-write-where]').innerText();
    expect(/after Q4/.test(where), where);
    await shot(page, 'B1-opener');
    return where.replace(/\s+/g, ' ');
  });

  await check('Write 3: the AI picks the key point itself (a step), drafts appear on the page after Q4 as "would be Q5, Q6, Q7"', async () => {
    await page.locator('[data-write-gap-go]').click();
    await page.locator('[data-step="pick"][data-state="done"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(300);
    await shot(page, 'B2-writing');
    await ready(page).nth(2).waitFor({ timeout: 60_000 });
    await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(800);
    const heads = await page.locator('#print-root [data-ai-ghost-head]').allInnerTexts();
    expect(heads.length === 3, `${heads.length} drafts`);
    expect(/would be Q5/.test(heads[0]) && /would be Q7/.test(heads[2]), heads.join(' | '));
    // Q5 on the page is the first draft: the paper's own Q5 moved down by three.
    const printed = await page.locator('#print-root').evaluate((root) => root.innerText);
    expect(printed.indexOf('If a country') > printed.indexOf('would be Q7'), 'the drafts are not after Q4');
    await ghosts(page).first().scrollIntoViewIfNeeded();
    await page.locator('#print-root').evaluate(() => window.scrollBy(0, -60));
    await shot(page, 'B3-drafts-on-page');
    return heads.map((h) => h.split('\n')[0]).join(' · ');
  });

  await check('drafts are never in the document and never print (data-print-hide, nothing saved)', async () => {
    expect((await questionCount(page)) === 6, 'a draft reached the saved paper');
    const hidden = await ghosts(page).evaluateAll((els) => els.every((el) => el.closest('[data-print-hide]')));
    expect(hidden, 'a draft prints');
  });

  await check('Accept puts the draft into the paper there (Q5), AI-made; the panel says In the paper', async () => {
    state.slow = 0;
    await ghosts(page).first().locator('[data-ghost-accept]').click();
    expect(await saved(page, 7), 'not saved with 7 questions');
    await page.locator('[data-write-draft="1"][data-state="added"]').waitFor();
    expect((await page.locator('#print-root [data-testid="ai-made-chip"]').count()) >= 1, 'the added question is not marked AI-made');
    expect((await ghosts(page).count()) === 2, 'two drafts should be left on the page');
    const heads = await page.locator('#print-root [data-ai-ghost-head]').allInnerTexts();
    expect(/would be Q6/.test(heads[0]), heads[0]);
    await page.locator('[data-write-drafts]').scrollIntoViewIfNeeded();
    await shot(page, 'B4-accepted');
  });

  await check('⌘Z takes it back out, and the draft is back on the page', async () => {
    await page.locator('#print-root .paper').first().click({ position: { x: 30, y: 30 } });
    await page.keyboard.press('Control+z');
    expect(await saved(page, 6), 'the undo did not take it out');
    await page.locator('[data-write-draft="1"][data-state="open"]').waitFor();
    expect((await ghosts(page).count()) === 3, `${await ghosts(page).count()} drafts on the page`);
  });

  await check('Reject takes a draft off the page; Accept all without problems adds the rest in one go', async () => {
    await ghosts(page).nth(1).locator('[data-ghost-reject]').click();
    await page.locator('[data-write-draft="2"][data-state="rejected"]').waitFor();
    expect((await ghosts(page).count()) === 2, 'the rejected draft is still on the page');
    const all = page.locator('[data-write-accept-all]');
    const label = await all.innerText();
    await all.click();
    expect(await saved(page, 8), 'not saved with 8 questions');
    expect((await ghosts(page).count()) === 0, 'drafts left on the page');
    // Both went in where they were drawn, after Q4 (the undo put the cursor back there).
    const fifth = await page.evaluate((id) => {
      const doc = JSON.parse(localStorage.getItem(`econ-worksheet:${id}`) ?? '{}');
      const q = doc.questions[4];
      return q.blocks[0].text.en.map((r) => r.text).join('');
    }, PAPER.id);
    expect(!/If a country/.test(fifth), `Q5 is the paper's own: ${fifth}`);
    await page.locator('[data-write-drafts]').scrollIntoViewIfNeeded();
    await shot(page, 'B5-accept-all');
    return label;
  });

  await check('Ask about a draft from the page: the change lands on that draft in place (v2), on the page', async () => {
    state.slow = 900;
    await page.locator('[data-chat-input]').fill('Write 2 more');
    await page.locator('[data-chat-send]').click();
    await waitOr(page, ready(page).nth(1), 'more-drafts', 60_000);
    await waitOr(page, page.locator('[data-chat-send]'), 'more-done', 60_000);
    await ghosts(page).first().locator('[data-ghost-ask]').click();
    await page.locator('[data-draft-chip]').waitFor({ timeout: 5000 }).catch(async (e) => {
      await shot(page, 'debug-ask');
      throw e;
    });
    await page.locator('[data-chat-input]').fill('Make it harder: use numbers');
    await page.locator('[data-chat-send]').click();
    await waitOr(page, page.getByText(/is now v2/), 'changed', 60_000);
    await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    await ghosts(page).first().scrollIntoViewIfNeeded();
    await shot(page, 'B6-changed-v2');
  });

  await check('k-0528: in the panel the ⚙ options close on a click on the page and on Esc; the draft rows use line icons', async () => {
    const button = page.locator('[data-write-panel] [data-chat-settings]');
    const pop = page.locator('[data-write-panel] [data-chat-settings-pop]');
    await button.click();
    await pop.waitFor();
    await shot(page, 'k0528-panel-options');
    await page.locator('#print-root').click({ position: { x: 20, y: 20 } });
    await pop.waitFor({ state: 'detached', timeout: 2000 });
    await button.click();
    await pop.waitFor();
    await page.keyboard.press('Escape');
    await pop.waitFor({ state: 'detached', timeout: 2000 });
    const asks = page.locator('[data-write-panel] [data-ask]');
    if ((await asks.count()) > 0) expect(!/\p{Extended_Pictographic}/u.test(await asks.first().textContent()), 'an emoji is left on Ask about this');
    expect((await button.locator('svg').count()) === 1, 'the options button has no line icon');
  });

  await check('the chat comes back after a reload (this paper’s), apart from the studio’s Chats', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await openPaper(page);
    await openWrite(page);
    await page.locator('[data-chat-ai]').first().waitFor();
    await ready(page).first().waitFor({ timeout: 20_000 });
    const keys = await page.evaluate(() => ({ panel: localStorage.getItem('econgen.paperChats.v1') !== null, studio: localStorage.getItem('econgen.studioChats.v1') }));
    expect(keys.panel && keys.studio === null, JSON.stringify(keys));
    await shot(page, 'B7-after-reload');
  });

  await check('the Content tab hides the drafts; Write shows them again', async () => {
    await page.locator('[data-sidebar-tab="content"]').click();
    await page.waitForTimeout(400);
    expect((await ghosts(page).count()) === 0, 'drafts stayed on the page');
    await openWrite(page);
    await ready(page).first().waitFor();
  });

  await check('nothing reached a real provider, and no errors', async () => {
    expect(leaks.length === 0, `reached ${leaks[0]}`);
    expect(errors.length === 0, errors[0]);
  });
  await context.close();

  const zh = await newPage(browser, { ui: 'zh-HK', seed });
  await check('中文: the Write tab in 繁體中文', async () => {
    await openPaper(zh.page);
    await openWrite(zh.page);
    await zh.page.locator('[data-write-gap-go]').click();
    await ready(zh.page).nth(2).waitFor({ timeout: 60_000 });
    await zh.page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    await ghosts(zh.page).first().scrollIntoViewIfNeeded();
    await shot(zh.page, 'B8-zh');
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
