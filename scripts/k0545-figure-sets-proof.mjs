import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results } from './studio-verify-kit.mjs';

/**
 * k-0545's proof: four past-paper questions with several diagrams remade in the Question
 * studio with the mock AI (no live AI), in English and in 中文: HKDSE 2023 Paper 1 Q36 and
 * 2026 Q38 (a grid of tax graphs (1)–(4)), 2024 Q11 and Q29 (a diagram under every option).
 * Each reference is picked from the real past-paper bank (a local clone, never committed);
 * the AI's replies are `src/diagramGen/setFixtures.json` (synthetic questions). Checks: one
 * diagram request for all the figures, every figure drawn on the card, the key check, Accept
 * → Add puts a figure grid or option diagrams in a new worksheet. Screenshots to --out.
 *
 *   npm run dev -- -p 3245
 *   PASTPAPER_BANK=/path/to/dse-econ-question-bank node scripts/k0545-figure-sets-proof.mjs [--url=http://localhost:3245] [--out=…]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3245');
const OUT = opt('out', '/tmp/k0545-proof');
const MOCK_PORT = Number(opt('mock-port', '8841'));
const BANK_PORT = Number(opt('bank-port', '8842'));
const BANK_DIR = process.env.PASTPAPER_BANK ?? '/root/kp-econ-work/publish/dse-econ-question-bank';
mkdirSync(OUT, { recursive: true });
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
configure({ mock: MOCK, bank: BANK });
if (!existsSync(path.join(BANK_DIR, 'manifest.json'))) {
  console.error(`No past-paper bank at ${BANK_DIR}: set PASTPAPER_BANK.`);
  process.exit(2);
}

/** The bank clone as a static site (CORS on), as the app reads a custom bank URL. */
function startBank(port) {
  const server = createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const file = path.join(BANK_DIR, decodeURIComponent(new URL(req.url, BANK).pathname));
    if (!file.startsWith(BANK_DIR) || !existsSync(file) || !statSync(file).isFile()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': file.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

const CASES = [
  { id: 'q36', tag: /2023 Paper 1 Q36|2023.*第\s*36/, search: 'describe a progressive tax', grid: true },
  { id: 'q38', tag: /2026 Paper 1 Q38|2026.*第\s*38/, search: 'equality principle', grid: true },
  { id: 'q11', tag: /2024 Paper 1 Q11|2024.*第\s*11/, search: 'pilots in Mainland', grid: false },
  { id: 'q29', tag: /2024 Paper 1 Q29|2024.*第\s*29/, search: 'highly skilled foreign talents', grid: false },
];

const bankServer = await startBank(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  for (const ui of (process.env.PROOF_UI ?? 'en,zh-HK').split(',')) {
    const lang = ui === 'en' ? 'en' : 'zh';
    for (const c of CASES.filter((x) => !process.env.PROOF_CASE || x.id === process.env.PROOF_CASE)) {
      await check(`${lang} ${c.id}: remade from the past paper with ${c.grid ? 'a grid (1)–(4)' : 'a diagram under every option'}`, async () => {
        const { context, page, errors, leaks } = await newPage(browser, { ui, bank: BANK, viewport: { width: 1440, height: 1000 } });
        try {
          await page.goto(APP, { waitUntil: 'networkidle' });
          await page.getByRole('button', { name: /Question studio 擬題工作室|擬題工作室/ }).first().click();
          await page.locator('[data-studio-screen]').waitFor();
          await page.locator('[data-start-pick], [data-add-reference]').first().click();
          const picker = page.locator('[data-reference-picker]');
          await picker.locator('header input[type="search"], input[type="search"]').first().fill(c.search);
          const card = picker.locator('[data-reference-card]').filter({ hasText: c.tag }).first();
          await card.waitFor({ timeout: 40_000 });
          await card.click();
          await page.waitForTimeout(600);
          await page.screenshot({ path: `${OUT}/${c.id}-${lang}-1-reference.png` });
          await page.getByRole('button', { name: /Use as reference|用作參考/ }).click();
          await page.locator('[data-ref-chip]').waitFor();
          await fetch(`${MOCK}/__reset`, { method: 'POST' });
          // What each AI request was: its task, from the system prompt's marker or the payload.
          const asked = [];
          page.on('request', (r) => {
            if (!r.url().startsWith(MOCK) || r.method() !== 'POST') return;
            try {
              const body = JSON.parse(r.postData() ?? '{}');
              const system = body.messages?.find((m) => m.role === 'system')?.content ?? '';
              const user = [...(body.messages ?? [])].reverse().find((m) => m.role === 'user')?.content ?? '';
              const task = /You draw diagrams/.test(system) ? (JSON.parse(user.slice(user.indexOf('{'), user.lastIndexOf('}') + 1)).task ?? 'diagram') : (system.match(/Task: ([a-z-]+)/)?.[1] ?? 'other');
              asked.push(task);
            } catch {
              asked.push('?');
            }
          });
          await page.locator('[data-chat-send]').click();
          const draft = page.locator('[data-chat-draft]').first();
          await draft.waitFor({ timeout: 60_000 });
          await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
          await page.waitForTimeout(800);
          const figures = await draft.locator('svg, img').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 80).length);
          expect(figures >= 4, `${figures} figures on the card`);
          const keyChip = await draft.locator('[data-key-check]').getAttribute('data-key-check').catch(() => null);
          await draft.scrollIntoViewIfNeeded();
          await page.screenshot({ path: `${OUT}/${c.id}-${lang}-2-draft.png` });
          await draft.screenshot({ path: `${OUT}/${c.id}-${lang}-2-card.png` });
          // Pick, write, ONE diagram request for every figure, solve.
          const requests = asked.length;
          expect(asked.filter((t) => t.startsWith('diagram')).length === 1 && asked.includes('diagram-set'), `AI requests: ${asked.join(', ')}`);
          // Accept, then Add into a new worksheet.
          await draft.locator('[data-accept]').click();
          await page.locator('[data-studio-tray] button', { hasText: /^(Add|加入)$/ }).click();
          await page.locator('[data-testid="ai-made-chip"]').first().waitFor({ timeout: 20_000 });
          await page.waitForTimeout(1200);
          const paper = page.locator('#print-root');
          const pageFigures = await paper.locator('svg').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().width > 80).length);
          expect(pageFigures >= 4, `${pageFigures} figures on the worksheet page`);
          await page.screenshot({ path: `${OUT}/${c.id}-${lang}-3-worksheet.png` });
          expect(!errors.length, `page errors: ${errors.join(' | ')}`);
          expect(!leaks.length, `requests to a real AI: ${leaks.join(', ')}`);
          return `${figures} figures, ${requests} requests (${asked.join(', ')}), key check ${keyChip ?? 'quiet (ok)'}`;
        } finally {
          await context.close();
        }
      });
    }
  }
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`);
process.exit(failed ? 1 : 0);
