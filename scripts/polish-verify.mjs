import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results } from './studio-verify-kit.mjs';

/**
 * Improve wording (k-0549) in a browser: ✦ AI → Improve wording (HKDSE style) on a paper of
 * two bilingual MC questions off the house style. The bar says what was suggested and offers
 * Accept all / Discard; a card beside each changed text shows the words out and in and the
 * reason; Accept writes that text (bold NOT on the page); a change that moves a number is
 * shown as Not offered with no Accept; Accept all is one Undo. English and 中文 interfaces,
 * desktop widths (the editor is desktop only). The AI is `ai-mock-server.mjs`; nothing real
 * is reached.
 *
 *   npm run dev -- -p 3249
 *   node scripts/polish-verify.mjs [--url=http://localhost:3249] [--out=/tmp/polish] [--mock-port=8858]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3249');
const OUT = opt('out', '/tmp/polish');
const MOCK_PORT = Number(opt('mock-port', '8858'));
mkdirSync(OUT, { recursive: true });
configure({ mock: `http://localhost:${MOCK_PORT}`, bank: 'http://localhost:1/' });

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const corpus = JSON.parse(readFileSync(join(ROOT, 'src/test/corpus/v1-published.json'), 'utf8'));
const VERSION = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;

const t = (en, zh) => ({ en: [{ text: en }], zh: [{ text: zh }] });
const mcq = (id, stem, options, answerIndex) => ({
  id,
  type: 'mcq',
  marks: 1,
  blocks: [{ kind: 'paragraph', id: `${id}-stem`, text: t(...stem) }],
  options: options.map((o, n) => ({ id: `${id}-o${n}`, text: t(...o) })),
  answerIndex,
});

/** Two MC questions off the house style; Q2's option C carries the mock's "!num" (its number moves). */
function fixture() {
  const doc = structuredClone(corpus);
  doc.id = 'polish-verify';
  doc.title = { en: [{ text: 'Polish verify' }], zh: [] };
  doc.questions = [
    mcq('pq1', ['Suppose the price of Good X rises. Which one of the following will not happen?', '假設物品 X 的價格上升, 下面哪一個不會出現?'], [
      ['Its quantity demanded falls.', '其需求量下降。'],
      ["Its demand curve doesn't shift.", '其需求曲線不會移動。'],
      ['Its supply is not affected.', '其供應不受影響。'],
      ['Its total revenue may rise.', '其總收入可能上升。'],
    ], 1),
    mcq('pq2', ['A firm sells 1,000 units at $20 each. Which one of the following is correct?', '一家公司以每件 $20 出售 1,000 件產品. 下面哪一個是正確的?'], [
      ['Its total revenue is $20,000.', '其總收入為 $20,000。'],
      ['Its total revenue is $2,000.', '其總收入為 $2,000。'],
      ['Its total revenue is $200. !num', '其總收入為 $200。!num'],
      ["We can't tell its total revenue.", '無法得知其總收入。'],
    ], 0),
  ];
  const layout = doc.flow.filter((item) => item.type !== 'question');
  doc.flow = [layout[0], { type: 'question', id: 'pq1' }, { type: 'question', id: 'pq2' }, ...layout.slice(1)];
  return doc;
}

const DOC = fixture();
const seed = {
  'econ-worksheet-index': JSON.stringify([{ id: DOC.id, title: 'Polish verify', updatedAt: DOC.updatedAt }]),
  [`econ-worksheet:${DOC.id}`]: JSON.stringify(DOC),
  'econ-worksheet-last-seen-version': VERSION,
};

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const WORDS = {
  en: { label: 'Improve wording (HKDSE style)', head: 'suggested changes', acceptAll: /^Accept all \(\d+\)$/, discard: 'Discard', accept: 'Accept', kicker: 'Suggested wording', blocked: 'Not offered', accepted: 'Accepted' },
  'zh-HK': { label: '改善題目字眼（HKDSE 風格）', head: '項建議修改', acceptAll: /^全部接受（\d+）$/, discard: '捨棄', accept: '接受', kicker: '建議字眼', blocked: '不會套用', accepted: '已接受' },
};

const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  for (const ui of ['en', 'zh-HK']) {
    for (const width of ui === 'en' ? [1440, 1180] : [1440]) {
      const w = WORDS[ui];
      const tag = `${ui}-${width}`;
      const { context, page, errors, leaks } = await newPage(browser, { ui, seed, viewport: { width, height: 900 } });
      const bar = page.getByRole('status', { name: 'AI' });
      const card = page.locator('[role="dialog"]').filter({ has: page.locator('[data-diff]') });
      await check(`${tag}: ✦ AI menu offers Improve wording beside Check terms`, async () => {
        await page.goto(APP, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Polish verify/ }).first().click();
        await page.waitForSelector('#print-root .paper', { timeout: 20_000 });
        await page.waitForTimeout(800);
        await page.locator('[data-ai-door]').click();
        const row = page.locator('[data-verb="check.wording"]');
        await row.waitFor();
        const order = await page.locator('[data-verb]').evaluateAll((rows) => rows.map((r) => r.getAttribute('data-verb')));
        expect(order.indexOf('check.wording') === order.indexOf('check.terms') + 1, `order ${order.join(', ')}`);
        expect(((await row.textContent()) ?? '').includes(w.label), `row "${await row.textContent()}"`);
        await row.hover();
        await page.waitForTimeout(250);
        await shot(page, `${tag}-1-menu`);
        await row.click();
        await bar.getByText(w.head).first().waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
        await shot(page, `${tag}-2-bar`);
        const text = (await bar.textContent()) ?? '';
        expect(w.acceptAll.test(((await bar.getByRole('button', { name: w.acceptAll }).textContent()) ?? '').trim()), `bar "${text}"`);
        expect(text.includes(w.discard), `no Discard in "${text}"`);
        expect(text.includes('HKDSE'), `no style count in "${text}"`);
      });

      await check(`${tag}: a card shows the diff and the reason; Accept writes bold NOT on the page`, async () => {
        await bar.getByRole('button', { name: ui === 'en' ? 'Next' : '下一個' }).click();
        await card.waitFor();
        await page.waitForTimeout(400);
        await shot(page, `${tag}-3-card`);
        const body = (await card.textContent()) ?? '';
        expect(body.includes(w.kicker), `kicker in "${body.slice(0, 80)}"`);
        expect((await card.locator('[data-diff-op="del"]').count()) > 0 && (await card.locator('[data-diff-op="ins"]').count()) > 0, 'diff marks');
        expect((await card.locator('[data-diff]').count()) === 2, 'both languages');
        expect(body.includes(ui === 'en' ? 'HKDSE house style' : 'HKDSE 風格'), `reason in "${body}"`);
        await card.getByRole('button', { name: w.accept, exact: true }).click();
        await page.waitForTimeout(500);
        const bold = await page.locator('#print-root [data-question-id="pq1"] strong, #print-root [data-question-id="pq1"] b, #print-root [data-question-id="pq1"] [style*="font-weight"]').allTextContents();
        const pageText = await page.locator('#print-root').innerText();
        expect(pageText.includes('Which of the following will NOT happen?'), 'page text not updated');
        expect(bold.some((b) => b.includes('NOT')), `bold ${JSON.stringify(bold)}`);
        await shot(page, `${tag}-4-accepted`);
      });

      await check(`${tag}: a change that moves a number is shown as not offered, with no Accept`, async () => {
        const chip = bar.getByRole('button', { name: ui === 'en' ? /failed/ : /失敗/ });
        await chip.click();
        await card.waitFor();
        await page.waitForTimeout(400);
        const body = (await card.textContent()) ?? '';
        expect(body.includes(w.blocked), `kicker in "${body.slice(0, 80)}"`);
        expect((await card.getByRole('button', { name: w.accept, exact: true }).count()) === 0, 'Accept shown on a blocked change');
        await shot(page, `${tag}-5-blocked`);
      });

      await check(`${tag}: Accept all is one commit, undone by one Undo`, async () => {
        const before = await page.locator('#print-root').innerText();
        await bar.getByRole('button', { name: w.acceptAll }).click();
        await page.waitForTimeout(600);
        const after = await page.locator('#print-root').innerText();
        expect(after !== before && after.includes('cannot tell'), 'nothing changed');
        expect(after.includes('$20 000') || after.includes('1 000'), 'thousands not respaced');
        await shot(page, `${tag}-6-accept-all`);
        const notice = page.getByText(new RegExp(w.accepted)).first();
        await notice.waitFor();
        await page.getByRole('button', { name: ui === 'en' ? 'Undo' : '復原', exact: true }).first().click();
        await page.waitForTimeout(500);
        expect((await page.locator('#print-root').innerText()) === before, 'Undo did not restore the page');
      });
      if (leaks.length) {
        results.push({ name: `${tag}: no real provider reached`, ok: false });
        console.log(`  FAIL leaks ${leaks.join(', ')}`);
      }
      if (errors.length) console.log(`  page errors (${tag}): ${errors.slice(0, 3).join(' | ')}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed; screenshots in ${OUT}`);
process.exit(failed.length ? 1 : 0);
