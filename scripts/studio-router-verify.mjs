import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { check, configure, expect, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The studio's Jev pre-router (k-0567, u-5sy9), live in a browser on DSEcon Mentor dev: a saved
 * chat with three drafts, then messages the computer can't place. An edit Jev is sure of starts
 * at once (one `/ai/decide` call, feature `studio.read`, no main-model read); an unclear one
 * asks "Which draft do you mean?" at once; a new request goes to the main model's read
 * directly (its words already say new). English at desktop width, 中文 at iPhone width.
 *
 *   (Mentor dev on :3567 with HOSTED_AI=on and TYPESAFE_API_KEY)
 *   NEXT_PUBLIC_MENTOR_ORIGIN=http://localhost:3567 npx next dev -p 3560 &
 *   K0567_SEED=/tmp/k0567/router/seed-chats.json npx vitest run --config vitest.eval.config.ts evals/studioRouterE2e.eval.ts -t "seed chats"
 *   node scripts/studio-router-verify.mjs --token=<Mentor app token> --seed=/tmp/k0567/router/seed-chats.json [--out=…]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3560');
const MENTOR = opt('mentor', 'http://localhost:3567');
const OUT = opt('out', '/tmp/k0567/router-shots');
const TOKEN = opt('token', '');
const SEED = JSON.parse(readFileSync(opt('seed', '/tmp/k0567/router/seed-chats.json'), 'utf8'));
const BANK_PORT = Number(opt('bank-port', '8862'));
const ONLY = opt('only', '');
mkdirSync(OUT, { recursive: true });
configure({ mock: 'http://localhost:1', bank: `http://localhost:${BANK_PORT}/` });
if (!TOKEN) throw new Error('--token= (a Mentor dev app token)');

const bankServer = await startBankServer(BANK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

async function open(lang, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
  context.setDefaultTimeout(30_000);
  const chats = SEED.filter((c) => c.id === `chat-live-${lang}`);
  await context.addInitScript(
    ([token, chatsJson, lang, bank]) => {
      if (sessionStorage.getItem('router-seeded')) return;
      sessionStorage.setItem('router-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
      localStorage.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider: 'mentor' }));
      localStorage.setItem('econgen.secret.ai:mentor', token);
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang === 'zh' ? 'zh-HK' : 'en', paper: lang === 'zh' ? 'zh' : 'en' }));
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: bank }));
      localStorage.setItem('econgen.studioChats.v1', chatsJson);
    },
    [TOKEN, JSON.stringify(chats), lang, `http://localhost:${BANK_PORT}/`],
  );
  // What reached Mentor: each AI call's path and feature, in order.
  const calls = [];
  context.on('request', (req) => {
    const url = req.url();
    if (!url.startsWith(`${MENTOR}/api/app/v1/ai/`) || req.method() !== 'POST') return;
    let feature = '';
    try {
      feature = JSON.parse(req.postData() ?? '{}').feature ?? '';
    } catch {
      /* not JSON */
    }
    calls.push({ path: new URL(url).pathname.split('/').pop(), feature, at: Date.now() });
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Question studio|擬題工作室/ }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
  await page.locator('[data-chats-menu]').click();
  await page.locator('[data-chats-list] button', { hasText: lang === 'zh' ? '出三題關於彈性的題目' : 'Three questions on elasticity' }).first().click();
  await page.locator('[data-chat-draft]').nth(2).waitFor();
  return { context, page, calls, errors };
}

/** Sends `text`; resolves when the reply has started acting (the change step, a question back, or a write) and when it is done. */
async function send(page, text) {
  const t0 = Date.now();
  await page.locator('[data-chat-input]').fill(text);
  await page.locator('[data-chat-send]').click();
  return t0;
}
const idle = (page, timeout = 240_000) => page.locator('[data-chat-send]').waitFor({ timeout });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

const SCRIPTS = {
  en: {
    viewport: { width: 1440, height: 900 },
    edit: { text: 'the table question has too many columns', draft: 2 },
    unclear: 'make it harder',
    fresh: 'write one on price ceilings',
  },
  zh: {
    viewport: { width: 393, height: 852 },
    edit: { text: '有個表嗰題啲數字改細啲', draft: 2 },
    unclear: '改深少少',
    fresh: '出一題關於最高限價',
  },
};

try {
  for (const lang of ['en', 'zh']) {
    if (ONLY && ONLY !== lang) continue;
    const s = SCRIPTS[lang];
    const { context, page, calls, errors } = await open(lang, s.viewport);
    console.log(`live ${lang}`);

    await check(`${lang}: unclear words ask "which draft?" at once, with no main-model read`, async () => {
      const from = calls.length;
      const t0 = await send(page, s.unclear);
      await page.locator('[data-chat-ask="which"]').last().waitFor({ timeout: 60_000 });
      const asked = Date.now() - t0;
      await idle(page);
      await shot(page, `${lang}-1-which-draft`);
      const mine = calls.slice(from);
      expect(mine.length === 1 && mine[0].feature === 'studio.read', `calls: ${JSON.stringify(mine)}`);
      return `asked after ${(asked / 1000).toFixed(1)} s`;
    });

    await check(`${lang}: an edit Jev is sure of starts at once — one studio.read call, no main-model read`, async () => {
      const from = calls.length;
      const t0 = await send(page, s.edit.text);
      await page.locator(`[data-step="change"]`).last().waitFor({ timeout: 60_000 });
      const started = Date.now() - t0;
      await shot(page, `${lang}-2-edit-started`);
      await idle(page);
      await page.locator('[data-note="changed"]').last().waitFor({ timeout: 10_000 });
      await shot(page, `${lang}-3-edit-done`);
      const mine = calls.slice(from);
      expect(mine[0]?.path === 'decide' && mine[0]?.feature === 'studio.read', `first call: ${JSON.stringify(mine[0])}`);
      expect(!mine.some((c) => c.feature === 'studio.pick'), `a main-model read was sent: ${JSON.stringify(mine)}`);
      const note = await page.locator('[data-note="changed"]').last().textContent();
      expect(note.includes(String(s.edit.draft)), `changed note: ${note}`);
      return `change started after ${(started / 1000).toFixed(1)} s; calls ${mine.map((c) => `${c.path}:${c.feature}`).join(', ')}`;
    });

    await check(`${lang}: a new request goes straight to the main model's read (no Jev: the words already say new), then writes`, async () => {
      const from = calls.length;
      await send(page, s.fresh);
      await idle(page, 300_000);
      await shot(page, `${lang}-4-new`);
      const mine = calls.slice(from);
      expect(mine[0]?.feature === 'studio.pick', `first: ${JSON.stringify(mine[0])}`);
      expect(!mine.some((c) => c.feature === 'studio.read'), `Jev was asked: ${JSON.stringify(mine)}`);
      expect((await page.locator('[data-chat-draft]').count()) >= 4, 'no new draft');
      return mine.map((c) => `${c.path}:${c.feature}`).join(', ');
    });

    expect(errors.length === 0, `page errors: ${errors.join(' | ')}`);
    await context.close();
  }
} finally {
  await browser.close();
  bankServer.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
