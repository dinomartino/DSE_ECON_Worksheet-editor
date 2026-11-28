import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The studio's review tools in a browser (k-0598): a real request against the mock AI, the Note
 * box and quick tags under the reply, the note on the chat, Export for review → All chats into
 * one .zip (read back here: HOW-TO-READ, index, conversation.md with the note under its reply
 * and the calls behind it, raw.json, the system prompt once; no key, no picture data), an older
 * chat exported as "no behind-the-scenes record", notes kept across a reload, the 中文
 * interface, and nothing at all without the develop-build browser switch (the desktop app shows
 * them by itself; a release build never).
 *
 *   npm run dev -- -p 3263
 *   node scripts/studio-review-verify.mjs [--url=http://localhost:3263] [--out=/tmp/studio-review] [--mock-port=8831] [--bank-port=8832]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3263');
const OUT = opt('out', '/tmp/studio-review');
const MOCK_PORT = Number(opt('mock-port', '8831'));
const BANK_PORT = Number(opt('bank-port', '8832'));
mkdirSync(OUT, { recursive: true });
configure({ mock: `http://localhost:${MOCK_PORT}`, bank: `http://localhost:${BANK_PORT}/` });

const WEB_KEY = 'econgen.studioReview.web';
const OLD_CHAT = {
  v: 1,
  id: 'old-chat-before-k0598',
  createdAt: '2026-11-20T09:00:00.000Z',
  updatedAt: '2026-11-20T09:05:00.000Z',
  refs: [],
  turns: [
    { id: 'u-old', role: 'user', text: 'An older request, made before the review tool', refs: [] },
    { id: 'a-old', role: 'ai', steps: [{ kind: 'write', state: 'done', count: 1 }], notes: [{ kind: 'written', ok: 1, look: 0, failed: 0 }], draftIds: [] },
  ],
  drafts: [],
  picks: [{ code: 'C.ped', reason: '' }],
  settings: { count: 1, level: 'same', language: 'en' },
  lastText: 'An older request, made before the review tool',
};
const seed = { [WEB_KEY]: '1', 'econgen.studioChats.v1': JSON.stringify([OLD_CHAT]) };

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

async function openStudio(page, row = /Question studio 擬題工作室/) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: row }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}

async function openChat(page, words) {
  await page.locator('[data-chats-menu]').click();
  await page.locator('[data-chats-list]').getByRole('menuitem', { name: new RegExp(words) }).click();
}

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });
const NOTE = 'Wanted the numbers in a table, not in the stem. Good would be: one table, two prices.';
const CHAT_NOTE = 'Trying elasticity questions with numbers for F.4.';

try {
  const { context, page, leaks, errors } = await newPage(browser, { seed });
  // Chrome's Save As picker cannot be driven here: the save falls back to a download, like Safari.
  await context.addInitScript(() => {
    delete window.showSaveFilePicker;
  });
  await openStudio(page);

  await check('a request against the mock AI: the reply gets a Note box with quick tags; the chat gets its note; the header Export for review', async () => {
    await page.locator('[data-chat-input]').fill('2 MC on price elasticity of demand with numbers');
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-chat-draft]').first().waitFor({ timeout: 60_000 });
    await page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
    await page.locator('[data-review-note]').first().waitFor();
    expect((await page.locator('[data-review-chat-note]').count()) === 1, 'no chat note box');
    expect((await page.locator('[data-review-export]').count()) === 1, 'no Export for review in the header');
    await shot(page, 'A1-reply-with-note-box');
  });

  await check('writing a note and tagging the reply Wrong; a note on the whole chat', async () => {
    const box = page.locator('[data-review-note]').first();
    await box.locator('[data-review-note-toggle]').click();
    await box.locator('textarea').fill(NOTE);
    await box.locator('[data-review-tag="wrong"]').click();
    expect((await box.locator('[data-review-tag="wrong"]').getAttribute('aria-pressed')) === 'true', 'Wrong not pressed');
    const chatNote = page.locator('[data-review-chat-note]');
    await chatNote.getByRole('button').click();
    await chatNote.locator('textarea').fill(CHAT_NOTE);
    await page.waitForTimeout(800);
    await shot(page, 'A2-note-and-tag');
  });

  let zipPath = '';
  await check('Export for review → All chats: one .zip saved', async () => {
    await page.locator('[data-review-export]').click();
    await page.locator('[data-review-export-menu]').waitFor();
    await shot(page, 'A3-export-menu');
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.locator('[data-review-export-all]').click()]);
    zipPath = `${OUT}/${download.suggestedFilename()}`;
    await download.saveAs(zipPath);
    expect(/^studio-review-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/.test(download.suggestedFilename()), `name ${download.suggestedFilename()}`);
    await page.waitForTimeout(400);
    await shot(page, 'A4-exported-notice');
  });

  await check('the .zip: HOW-TO-READ, index, a conversation.md and raw.json per chat, the system prompt once, no key, no picture data', async () => {
    const zip = await JSZip.loadAsync(readFileSync(zipPath));
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/'));
    const root = names[0].split('/')[0];
    const file = (p) => zip.file(`${root}/${p}`)?.async('string');
    expect(names.some((n) => n.endsWith('/HOW-TO-READ.md')) && names.some((n) => n.endsWith('/index.md')), `missing top files: ${names.join(', ')}`);
    const convs = names.filter((n) => n.endsWith('/conversation.md'));
    expect(convs.length === 2, `conversations: ${convs.length}`);
    const live = convs.find((n) => n.includes('price-elasticity'));
    const old = convs.find((n) => n.includes('older-request'));
    const md = await zip.file(live).async('string');
    expect(md.includes(`> ${CHAT_NOTE}`), 'the chat note is not in conversation.md');
    expect(md.includes(`> ${NOTE}`) && md.includes('tagged **wrong**'), 'the reply note or tag is missing');
    expect(md.indexOf(`> ${NOTE}`) < md.indexOf('<summary>Behind the scenes'), 'the note is not under its reply');
    expect(/#### Call \d+: studio\.write/.test(md), 'no studio.write call in conversation.md');
    expect(/#### Call \d+: studio\.pick/.test(md), 'no studio.pick call');
    expect(md.includes('see prompts/p-'), 'the system prompt is not pointed to');
    expect((await zip.file(old).async('string')).includes('No behind-the-scenes record'), 'the old chat does not say it has no record');
    const raw = JSON.parse(await zip.file(live.replace('conversation.md', 'raw.json')).async('string'));
    const traces = Object.values(raw.traces);
    const calls = traces.flatMap((t) => t.events).filter((e) => e.t === 'call');
    expect(calls.length >= 2 && calls.every((c) => c.reply !== undefined && c.turns.length > 0), 'calls without their prompt or reply');
    const prompts = names.filter((n) => n.includes('/prompts/'));
    expect(prompts.length >= 1, 'no prompts/ files');
    const refs = new Set(calls.map((c) => c.system?.prompt).filter(Boolean));
    expect(refs.size <= prompts.length, 'more prompt refs than prompt files');
    const all = (await Promise.all(names.map((n) => zip.file(n).async('string')))).join('\n');
    expect(!all.includes('sk-mock-verify-0000'), 'the key went into the export');
    expect(!all.includes('data:image'), 'picture data went into the export');
    writeFileSync(`${OUT}/sample-conversation.md`, md);
    return `${names.length} files, ${calls.length} calls, ${prompts.length} prompt file(s), ${(await file('index.md')).split('\n').length} index lines`;
  });

  await check('notes are kept across a reload (IndexedDB), and an older chat gets a Note box too', async () => {
    await openStudio(page);
    await openChat(page, 'price elasticity');
    const box = page.locator('[data-review-note]').first();
    await box.locator('textarea').waitFor();
    expect((await box.locator('textarea').inputValue()) === NOTE, 'the note did not come back');
    expect((await box.locator('[data-review-tag="wrong"]').getAttribute('aria-pressed')) === 'true', 'the tag did not come back');
    expect((await page.locator('[data-review-chat-note] textarea').inputValue()) === CHAT_NOTE, 'the chat note did not come back');
    await openChat(page, 'older request');
    await page.locator('[data-review-note="a-old"]').waitFor();
    await shot(page, 'A5-older-chat');
  });

  await check('no request reached a real provider; no page errors', async () => {
    expect(leaks.length === 0, `leaks: ${leaks.join(', ')}`);
    expect(errors.length === 0, `errors: ${errors.slice(0, 3).join(' | ')}`);
  });
  await context.close();

  const zh = await newPage(browser, { ui: 'zh-HK', seed });
  await openStudio(zh.page, /擬題工作室/);
  await check('中文: the Note box, tags and Export for review in Hong Kong Chinese', async () => {
    await openChat(zh.page, 'older request');
    const box = zh.page.locator('[data-review-note="a-old"]');
    await box.waitFor();
    await box.locator('[data-review-note-toggle]').click();
    const text = await box.innerText();
    expect(text.includes('備註') && text.includes('有錯') && text.includes('不清楚'), `words: ${text}`);
    await zh.page.locator('[data-review-export]').click();
    expect((await zh.page.locator('[data-review-export-menu]').innerText()).includes('所有對話'), 'menu not in Chinese');
    await shot(zh.page, 'B1-zh');
  });
  await zh.context.close();

  const plain = await newPage(browser, { seed: { 'econgen.studioChats.v1': JSON.stringify([OLD_CHAT]) } });
  await openStudio(plain.page);
  await check('a browser without the develop-build switch shows none of it (the desktop app shows it by itself)', async () => {
    await openChat(plain.page, 'older request');
    await plain.page.locator('[data-chat-ai]').first().waitFor();
    expect((await plain.page.locator('[data-review-note], [data-review-chat-note], [data-review-export]').count()) === 0, 'review tools shown');
    await shot(plain.page, 'C1-off-in-a-browser');
  });
  await plain.context.close();
  copyFileSync(zipPath, `${OUT}/sample-export.zip`);
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; pictures in ${OUT}`);
process.exit(failed.length ? 1 : 0);
