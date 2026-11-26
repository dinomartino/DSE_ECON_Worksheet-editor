import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';
import { uiFontProblems } from './ui-font-kit.mjs';

/**
 * AI controls use the interface font, in English and 中文 (k-0568, user u-0ydl). The ✦ Write
 * panel's drafts sit on the page, inside `.paper`: their header chips and buttons (✦ AI draft ·
 * would be Q5, No problems found, Key D, Ask, ✕ Reject, ✓ Accept) took the paper's Times New
 * Roman / PMingLiU, because `font-sans` named a font variable that was never defined. Checks
 * the draft header, the AI-made chip an accepted draft wears, the Write panel, the ✦ AI menu
 * and the studio's chat (chip menu, composer, draft card header), and that the paper's own
 * question text keeps the paper's face. Pictures: `<out>/<lang>-*.png`.
 *
 *   npm run dev -- -p 3216
 *   node scripts/ai-ui-font-verify.mjs [--url=http://localhost:3216] [--out=/tmp/ai-ui-font] [--mock-port=8841] [--bank-port=8842]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3216');
const OUT = opt('out', '/tmp/ai-ui-font');
const MOCK_PORT = Number(opt('mock-port', '8841'));
const BANK_PORT = Number(opt('bank-port', '8842'));
mkdirSync(OUT, { recursive: true });
configure({ mock: `http://localhost:${MOCK_PORT}`, bank: `http://localhost:${BANK_PORT}/` });
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

// ---- an invented Paper 1 (the Write panel's own test paper, scripts/studio-panel-verify.mjs) ----


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
const ready = (page) => page.locator('#print-root [data-ai-ghost-status="ok"], #print-root [data-ai-ghost-status="look"]');
const none = (problems) => expect(problems.length === 0, problems.slice(0, 3).join(' | '));

async function openPaper(page) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Mock 2026 · Paper 1/ }).first().click();
  await page.waitForSelector('#print-root .paper', { timeout: 30_000 });
  await page.waitForTimeout(1200);
}

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  for (const ui of ['en', 'zh-HK']) {
    const lang = ui === 'en' ? 'en' : 'zh';
    const { context, page, leaks, errors } = await newPage(browser, { ui, seed });
    await openPaper(page);

    await check(`${lang}: the AI draft on the page: header chips and buttons in the interface font`, async () => {
      await page.locator('[data-sidebar-tab="write"]').click();
      await page.locator('[data-write-panel]').waitFor();
      await page.locator('#print-root [data-flow-id]').nth(3).click({ position: { x: 4, y: 4 } });
      await page.locator('[data-write-gap-go]').click();
      await ready(page).first().waitFor({ timeout: 60_000 });
      await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
      await page.waitForTimeout(500);
      const head = page.locator('#print-root [data-ai-ghost-head]').first();
      await head.scrollIntoViewIfNeeded();
      await page.locator('#print-root').evaluate(() => window.scrollBy(0, -80));
      await shot(page, `${lang}-1-draft-on-page`);
      const box = await head.boundingBox();
      await page.screenshot({ path: `${OUT}/${lang}-1-draft-header.png`, clip: { x: box.x - 8, y: box.y - 6, width: box.width + 16, height: box.height + 40 } });
      none(await uiFontProblems(page, '#print-root [data-ai-ghost-head]'));
      return (await head.innerText()).replace(/\s+/g, ' ');
    });

    await check(`${lang}: the paper's own question text keeps the paper's face (serif)`, async () => {
      const font = await page.locator('#print-root .paper').first().evaluate((el) => getComputedStyle(el).fontFamily);
      expect(/Times New Roman|PMingLiU|serif/.test(font) && font !== (await page.evaluate(() => getComputedStyle(document.body).fontFamily)), font);
      return font.slice(0, 50);
    });

    await check(`${lang}: the ✦ Write panel in the interface font`, async () => {
      none(await uiFontProblems(page, '[data-write-panel]'));
    });

    await check(`${lang}: Accept: the AI-made chip on the page in the interface font`, async () => {
      await page.locator('#print-root [data-ai-ghost] [data-ghost-accept]').first().click();
      const chip = page.locator('#print-root [data-testid="ai-made-chip"]').first();
      await chip.waitFor({ timeout: 10_000 });
      await chip.scrollIntoViewIfNeeded();
      await page.locator('#print-root').evaluate(() => window.scrollBy(0, -80));
      await shot(page, `${lang}-2-ai-made-chip`);
      none(await uiFontProblems(page, '#print-root [data-testid="ai-made-chip"]'));
    });

    await check(`${lang}: the ✦ AI menu in the interface font`, async () => {
      await page.locator('[data-ai-door]').first().click();
      const menu = page.locator('[role="menu"]').first();
      await menu.waitFor({ timeout: 10_000 });
      await shot(page, `${lang}-3-ai-menu`);
      none(await uiFontProblems(page, '[role="menu"]'));
      await page.keyboard.press('Escape');
    });

    await check(`${lang}: the studio chat: draft card header, composer and AI chip in the interface font`, async () => {
      await page.goto(APP, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: /Question studio|擬題/ }).first().click();
      await page.locator('[data-chat-input]').waitFor({ timeout: 30_000 });
      await page.locator('[data-chat-input]').fill(lang === 'en' ? 'Write 1 question on price ceilings' : '擬寫 1 條關於價格上限的題目');
      await page.locator('[data-chat-send]').click();
      const card = page.locator('[data-chat-draft]').first();
      await card.waitFor({ timeout: 60_000 });
      await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
      await page.waitForTimeout(500);
      await shot(page, `${lang}-4-studio`);
      none([
        ...(await uiFontProblems(page, '[data-chat-draft] > header')),
        ...(await uiFontProblems(page, '[data-chat-column]')),
      ]);
    });

    await check(`${lang}: nothing reached a real provider, no errors`, async () => {
      expect(leaks.length === 0, `reached ${leaks[0]}`);
      expect(errors.length === 0, errors[0]);
    });
    await context.close();
  }
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
