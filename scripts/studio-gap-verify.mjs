import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results } from './studio-verify-kit.mjs';

/**
 * k-0544 step 7 in the browser: a past-paper question whose four diagrams sit in a numbered grid
 * (the shape of HKDSE 2023 Paper 1 Q36), picked as the reference, is written like: the chat says
 * the studio can make only one diagram per question for now, and each draft card says it is not
 * the same form (a read, not a red warning). English and 中文. The AI is `ai-mock-server.mjs`;
 * the bank is one invented question served from here.
 *
 *   npm run dev -- -p 3216
 *   node scripts/studio-gap-verify.mjs [--url=http://localhost:3216] [--out=/tmp/studio-gap]
 */
const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3216');
const OUT = opt('out', '/tmp/studio-gap');
const MOCK_PORT = Number(opt('mock-port', '8831'));
const BANK_PORT = Number(opt('bank-port', '8832'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
mkdirSync(OUT, { recursive: true });
configure({ mock: MOCK, bank: BANK });

const graph = (path, y) =>
  `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="260" height="190" font-family="Times New Roman" font-size="12"><polyline points="30,10 30,170 250,170" fill="none" stroke="#111"/><text x="34" y="14">${y}</text><text x="250" y="186" text-anchor="end">Taxable income ($)</text><path d="${path}" fill="none" stroke="#111" stroke-width="1.6"/></svg>`).toString('base64')}`;
const bi = (en, zh = en) => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const cell = (n, src) => ({ id: `g-c${n}`, text: bi(`(${n})`), align: 'center', vAlign: 'top', image: { src, widthPx: 260, heightPx: 190, altText: bi('') } });
const GRID = {
  id: 'pp-grid',
  type: 'mcq',
  blocks: [
    { kind: 'paragraph', id: 'g-p', text: bi('Which of the following diagrams describe a progressive tax?', '下列哪些圖描繪累進稅？') },
    {
      kind: 'table',
      id: 'g-t',
      borders: 'none',
      rows: [
        { id: 'g-r1', cells: [cell(1, graph('M30,170 L230,30', 'Tax payment ($)')), cell(2, graph('M30,170 L230,30', 'Average tax rate (%)'))] },
        { id: 'g-r2', cells: [cell(3, graph('M30,170 Q90,60 230,40', 'Tax payment ($)')), cell(4, graph('M30,170 Q90,60 230,40', 'Average tax rate (%)'))] },
      ],
    },
  ],
  marks: 1,
  options: [
    ['(1) and (2) only', '只有(1)、(2)'],
    ['(1) and (3) only', '只有(1)、(3)'],
    ['(2) and (4) only', '只有(2)、(4)'],
    ['(3) and (4) only', '只有(3)、(4)'],
  ].map(([en, zh], i) => ({ id: `g-o${i}`, text: bi(en, zh) })),
  answerIndex: 2,
  tags: ['I.fiscal', 'DSE2099/P1/Q36'],
  lineage: { rootId: 'pp:DSE2099/P1/Q36' },
};
const DOC = { v: 3, id: 'pp-bank-I', kind: 'bank', name: 'Taxation', title: bi('Taxation'), questions: [GRID], layout: [], flow: [{ type: 'question', id: GRID.id }], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const MANIFEST = {
  version: 1,
  enabled: true,
  questions: 1,
  topics: [{ id: 'I', title: { en: 'Taxation', zh: '稅收' }, file: 'topics/I.json', questions: 1, syllabus: ['I.fiscal'] }],
  search: { version: 1, questions: [{ topic: 'I', source: 'DSE2099/P1/Q36', en: 'Which of the following diagrams describe a progressive tax?', zh: '下列哪些圖描繪累進稅？', pictures: 4 }] },
};
const bankServer = await new Promise((resolve) => {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const path = new URL(req.url, BANK).pathname;
    if (path === '/manifest.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(MANIFEST));
    if (path === '/topics/I.json') return res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(DOC));
    res.writeHead(404).end('not found');
  });
  server.listen(BANK_PORT, () => resolve(server));
});
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome', executablePath: process.env.CHROME ?? '/opt/google/chrome/chrome' });

async function run(ui) {
  const { context, page, leaks, errors } = await newPage(browser, { ui, bank: BANK });
  const words = ui === 'en'
    ? { row: /Question studio/, use: 'Use as reference', note: 'can make only one diagram per question', card: 'not the same form', what: '4 diagrams' }
    : { row: /擬題工作室/, use: /用作參考/, note: '每題只能繪畫一幅圖', card: '形式不同', what: '有 4 幅圖' };
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: words.row }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
  await check(`(${ui}) a Q36-style grid as the reference: the chat and every card say the studio cannot make that form yet`, async () => {
    await page.locator('[data-start-pick], [data-add-reference]').first().click();
    const card = page.locator('[data-reference-picker] [data-reference-card]', { hasText: 'DSE2099/P1/Q36' }).first();
    await card.waitFor({ timeout: 30_000 });
    await card.click();
    await page.getByRole('button', { name: words.use }).click();
    await page.locator('[data-ref-chip]').waitFor();
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-chat-draft]').first().waitFor({ timeout: 60_000 });
    await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    const note = page.getByText(words.note);
    await note.first().waitFor({ timeout: 20_000 });
    const noteText = await note.first().textContent();
    expect(noteText.includes(words.what), `the note does not name the diagrams: "${noteText}"`);
    await page.screenshot({ path: `${OUT}/${ui}-chat-note.png` });
    const cards = await page.locator('[data-chat-draft]').count();
    // The card's format check is a read (amber), never a red warning; its words open from the chip.
    const first = page.locator('[data-chat-draft]').first();
    const chip = first.locator('[data-check="shape"]');
    const state = await chip.getAttribute('data-state');
    expect(state === 'look', `the format check is ${state}, not look`);
    await chip.click();
    await first.getByText(words.card).first().waitFor({ timeout: 10_000 });
    await first.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${OUT}/${ui}-card.png` });
    expect(leaks.length === 0, `a real provider was reached: ${leaks.join(', ')}`);
    expect(errors.length === 0, `errors: ${errors.join(' | ').slice(0, 300)}`);
    return `${cards} draft(s)`;
  });
  await context.close();
}

try {
  await run('en');
  await run('zh-HK');
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
