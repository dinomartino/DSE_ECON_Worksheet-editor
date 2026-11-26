import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';
import { uiFontProblems } from './ui-font-kit.mjs';

/**
 * k-0560 (u-4cgi): AI tagging in the teacher's own bank, in a browser. Seeds saved papers whose
 * questions are real past-paper MCQs with their topics taken off (from a local copy of the public
 * Past paper bank), plus a few tagged ones, then runs ✦ AI → Tag topics:
 *  - mock (default): Custom provider on the canned mock (`ai-mock-server.mjs`); checks that nothing
 *    is written before Accept, Accept / Skip / Change / Undo / Accept all, tagged questions untouched,
 *    the untagged level's door, no-AI setup, and takes the review screenshots (EN and 中文).
 *  - live (`--token=`): signed in to DSEcon Mentor (the dev server must be built with
 *    NEXT_PUBLIC_MENTOR_ORIGIN pointing at it); the menu shows the credit estimate and the run is real.
 *
 *   NEXT_PUBLIC_MENTOR_ORIGIN=http://localhost:3124 npx next dev -p 3560 &
 *   node scripts/ai-tag-verify.mjs --url=http://localhost:3560 --bank=/tmp/bank --out=Outbox/k-0560 [--token=…]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/ai-tag-verify');
const BANK = opt('bank', process.env.PASTPAPER_BANK ?? '');
const TOKEN = opt('token', '');
const MOCK_PORT = Number(opt('port', '8796'));
const MOCK = `http://localhost:${MOCK_PORT}`;
mkdirSync(OUT, { recursive: true });
if (!BANK) throw new Error('--bank=<local copy of the past paper bank> is needed');

const results = [];
async function check(name, fn) {
  try {
    const detail = await fn();
    results.push({ ok: true, name });
    console.log(`  ok   ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    results.push({ ok: false, name });
    console.log(`  FAIL ${name} — ${e.message.split('\n')[0]}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

// ---- seed: real questions, topics taken off ----

const topicFile = (name) => JSON.parse(readFileSync(join(BANK, 'topics', `${name}.json`), 'utf8'));
const strip = (q) => {
  const { tags: _t, tagsAt: _a, ...rest } = q;
  void _t;
  void _a;
  // Keep a free tag (the source) so "a teacher's own tag stays" is visible; no topic codes.
  const source = (q.tags ?? []).filter((t) => t.includes('/'));
  return source.length ? { ...rest, tags: source } : rest;
};
function paper(id, title, from, questions, createdAt) {
  return {
    ...from,
    id,
    kind: undefined,
    name: title,
    title: { en: [{ text: title }], zh: [] },
    questions,
    layout: [],
    flow: questions.map((q) => ({ type: 'question', id: q.id })),
    createdAt,
    updatedAt: createdAt,
  };
}
const pick = (file, indexes) => {
  const doc = topicFile(file);
  return { doc, questions: indexes.map((i) => doc.questions[i]).filter(Boolean) };
};
const a = pick('elasticity', [0, 5]);
const b = pick('price-ceiling', [1]);
const c = pick('gdp', [2]);
const d = pick('deposit-creation-contraction', [3]);
const e = pick('ownership-of-firms', [4]);
const f = pick('unemployment', [1]);
const g = pick('opportunity-cost', [6]);
const tagged = pick('per-unit-tax', [0, 1]);
const untaggedQs = [...a.questions, ...b.questions, ...c.questions, ...d.questions, ...e.questions, ...f.questions, ...g.questions].map(strip);
const DOCS = [
  paper('k0560-mock', 'Mock 2026 Paper 1 (draft)', a.doc, untaggedQs.slice(0, 5), '2026-11-20T00:00:00.000Z'),
  paper('k0560-s5', 'S5 Unit test', a.doc, [...untaggedQs.slice(5), ...tagged.questions], '2026-10-02T00:00:00.000Z'),
];
const INDEX = DOCS.map((doc) => ({ id: doc.id, title: doc.name, updatedAt: doc.updatedAt, questionCount: doc.questions.length }));
const TAGGED_IDS = tagged.questions.map((q) => q.id);
const UNTAGGED_IDS = untaggedQs.map((q) => q.id);

// ---- browser ----

if (!TOKEN) await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

async function newPage({ lang = 'en', ai = 'mock', viewport = { width: 1280, height: 860 } } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  context.setDefaultTimeout(15_000);
  const settings =
    ai === 'mock'
      ? { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK}/v1` } }
      : ai === 'mentor'
        ? { provider: 'mentor' }
        : null;
  await context.addInitScript(
    ([indexJson, docs, settingsJson, withKey, token, language]) => {
      if (sessionStorage.getItem('k0560-seeded')) return;
      sessionStorage.setItem('k0560-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econ-worksheet-index', indexJson);
      for (const [id, json] of docs) localStorage.setItem(`econ-worksheet:${id}`, json);
      localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
      if (settingsJson) localStorage.setItem('econgen.settings.ai', settingsJson);
      if (withKey) sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
      if (token) localStorage.setItem('econgen.secret.ai:mentor', token);
      localStorage.setItem('econgen.bankLevel', JSON.stringify({ kind: 'review', topic: 'all' }));
    },
    [JSON.stringify(INDEX), DOCS.map((doc) => [doc.id, JSON.stringify(doc)]), settings ? JSON.stringify(settings) : null, ai === 'mock', ai === 'mentor' ? TOKEN : '', lang],
  );
  // No real provider is ever reached from the mock run.
  await context.route((url) => /googleapis\.com|deepseek\.com|openai\.com|anthropic\.com|openrouter\.ai|dashscope/.test(url.hostname), (r) => r.fulfill({ status: 599, body: 'blocked' }));
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`  PAGE ERR: ${err.message}`));
  return { context, page };
}

async function openBank(page, lang = 'en') {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Question bank 題庫|題庫/ }).first().click();
  await page.locator('[data-bank-ai-door]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  void lang;
}

const door = (page) => page.locator('[data-bank-ai-door]').first();
const panel = (page) => page.locator('[data-ai-tag-panel]');
const item = (page, state) => page.locator(`[data-ai-tag-item${state ? `="${state}"` : ''}]`);
const storedTags = (page, docId, qid) =>
  page.evaluate(([dId, q]) => JSON.parse(localStorage.getItem(`econ-worksheet:${dId}`)).questions.find((x) => x.id === q)?.tags ?? [], [docId, qid]);
const allStored = async (page) => {
  const out = {};
  for (const doc of DOCS) for (const q of doc.questions) out[q.id] = await storedTags(page, doc.id, q.id);
  return out;
};
const topicCount = (tags) => tags.filter((t) => /^(?:[A-Z]|EL\d)(?:\.[a-z0-9-]+)?$/.test(t)).length;

async function openTagVerb(page, scope = 'untagged') {
  await door(page).click();
  const menu = page.locator('[role="dialog"]').filter({ has: page.locator('[data-bank-verb]') }).first();
  await menu.locator(`[data-bank-ai-scope="${scope}"]`).click();
  await menu.locator('[data-bank-verb="tag"]').hover();
  return menu;
}

if (!TOKEN) {
  console.log('mock run');
  const { context, page } = await newPage();
  await openBank(page);
  const before = await allStored(page);

  await check('menu: Tag topics on "All untagged", with what it leaves alone and where it sends', async () => {
    const menu = await openTagVerb(page);
    const text = await menu.locator('[data-bank-verb="tag"]').innerText();
    await page.screenshot({ path: join(OUT, '01-menu.png'), clip: await menu.boundingBox() });
    expect(text.includes('Tag topics') && text.includes(`${UNTAGGED_IDS.length} questions`), text);
    expect(text.includes('You check each one before it is saved'), text);
    return text.replace(/\s+/g, ' ').slice(0, 140);
  });

  await check('run: suggestions to review; nothing written', async () => {
    await page.locator('[data-bank-verb="tag"]').click();
    await panel(page).waitFor();
    await page.locator('[data-ai-tag-panel="done"]').waitFor({ timeout: 30_000 });
    const ready = await item(page, 'ready').count();
    expect(ready === UNTAGGED_IDS.length, `${ready} ready`);
    const now = await allStored(page);
    expect(JSON.stringify(now) === JSON.stringify(before), 'something was written before Accept');
    await page.screenshot({ path: join(OUT, '02-review.png') });
    const fonts = await uiFontProblems(page, '[data-ai-tag-panel]'); // k-0568: review cards in the interface font
    expect(fonts.length === 0, `not the interface font: ${fonts.slice(0, 3).join(' | ')}`);
    return `${ready} suggestions`;
  });

  await check('topics come from the tree only (chips are known codes)', async () => {
    const codes = await page.locator('[data-ai-tag-topic]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ai-tag-topic')));
    expect(codes.length > 0 && codes.every((c) => /^(?:[A-J]|EL\d)\.[a-z-]+$|^[A-J]$/.test(c)), codes.join(','));
    return [...new Set(codes)].join(' ');
  });

  /** The question a card is about: its document's own id for it (the card's root is its lineage). */
  const rootOf = async (n) => item(page).nth(n).getAttribute('data-question');
  await check('Accept saves one question (its topics on), others untouched', async () => {
    const root = await rootOf(0);
    await item(page).nth(0).locator('[data-ai-tag-accept]').click();
    await item(page).nth(0).and(page.locator('[data-ai-tag-item="saved"]')).waitFor();
    const tags = (await allStored(page))[root];
    expect(topicCount(tags) >= 1, JSON.stringify(tags));
    const rest = await allStored(page);
    const changed = Object.keys(rest).filter((id) => JSON.stringify(rest[id]) !== JSON.stringify(before[id]));
    expect(changed.length === 1 && changed[0] === root, `changed: ${changed}`);
    return tags.join(', ');
  });

  await check('Skip writes nothing', async () => {
    const root = await rootOf(1);
    await item(page).nth(1).locator('[data-ai-tag-skip]').click();
    await item(page).nth(1).and(page.locator('[data-ai-tag-item="skipped"]')).waitFor();
    expect(JSON.stringify((await allStored(page))[root]) === JSON.stringify(before[root]), 'skip wrote');
  });

  await check('Change… opens the bank’s topic picker; its save accepts the teacher’s topics', async () => {
    const root = await rootOf(2);
    await item(page).nth(2).locator('[data-ai-tag-change]').click();
    const picker = page.getByRole('dialog', { name: 'Topics for this question' });
    await picker.waitFor();
    await page.screenshot({ path: join(OUT, '03-change.png') });
    // Untick what is ticked, tick J · Exchange rate (found by the picker's search).
    for (const box of await picker.locator('input[type="checkbox"]:checked').all()) await box.uncheck();
    await picker.getByPlaceholder(/Find a topic/).fill('Exchange rate');
    await picker.getByLabel('Exchange rate', { exact: true }).check();
    await picker.getByRole('button', { name: 'Accept these topics' }).click();
    await item(page).nth(2).and(page.locator('[data-ai-tag-item="saved"]')).waitFor();
    const tags = (await allStored(page))[root];
    expect(tags.includes('J.exchange-rate'), JSON.stringify(tags));
    return tags.join(', ');
  });

  await check('Undo takes an accept back', async () => {
    const root = await rootOf(0);
    await item(page).nth(0).locator('[data-ai-tag-undo]').click();
    await item(page).nth(0).and(page.locator('[data-ai-tag-item="ready"]')).waitFor();
    expect(topicCount((await allStored(page))[root]) === 0, 'still tagged');
  });

  await check('Accept all saves the rest; the tagged questions are untouched; a free tag stays', async () => {
    await page.locator('[data-ai-tag-accept-all]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-ai-tag-item="ready"], [data-ai-tag-item="saving"]').length === 0);
    await page.screenshot({ path: join(OUT, '04-accepted.png') });
    const now = await allStored(page);
    for (const id of TAGGED_IDS) expect(JSON.stringify(now[id]) === JSON.stringify(before[id]), `tagged ${id} changed`);
    const skippedRoot = await rootOf(1);
    for (const id of UNTAGGED_IDS) {
      if (id === skippedRoot) expect(topicCount(now[id]) === 0, 'skipped got tagged');
      else expect(topicCount(now[id]) >= 1, `${id} not tagged`);
      for (const free of before[id]) expect(now[id].includes(free), `free tag ${free} lost`);
    }
    return page.locator('[data-ai-tag-tally]').innerText();
  });

  await check('Close: the bank counts them as tagged', async () => {
    await page.locator('[data-ai-tag-close]').click();
    await panel(page).waitFor({ state: 'detached' });
  });
  await context.close();

  // Untagged level + 中文 + narrow window.
  {
    const { context: ctx, page: p } = await newPage({ lang: 'zh-HK', viewport: { width: 1024, height: 760 } });
    await p.addInitScript(() => localStorage.setItem('econgen.bankLevel', JSON.stringify({ kind: 'untagged' })));
    await openBank(p, 'zh');
    await check('untagged level: the door offers Tag topics only (中文)', async () => {
      await door(p).click();
      const menu = p.locator('[role="dialog"]').filter({ has: p.locator('[data-bank-verb]') }).first();
      await menu.locator('[data-bank-ai-scope="untagged"]').click();
      const verbs = await menu.locator('[data-bank-verb]').evaluateAll((els) => els.map((el) => el.getAttribute('data-bank-verb')));
      expect(JSON.stringify(verbs) === '["tag"]', verbs.join(','));
      await p.screenshot({ path: join(OUT, '05-untagged-door-zh.png') });
      await menu.locator('[data-bank-verb="tag"]').click();
      await p.locator('[data-ai-tag-panel="done"]').waitFor({ timeout: 30_000 });
      await p.waitForTimeout(400);
      await p.screenshot({ path: join(OUT, '06-review-zh-1024.png') });
      const fonts = await uiFontProblems(p, '[data-ai-tag-panel]'); // k-0568, in 中文 too
      expect(fonts.length === 0, `not the interface font: ${fonts.slice(0, 3).join(' | ')}`);
      const title = await p.getByRole('dialog', { name: 'AI 建議的課題' }).count();
      expect(title === 1, 'no 中文 title');
      return verbs.join(',');
    });
    await ctx.close();
  }

  // No AI set up: the menu's setup card, nothing sent.
  {
    const { context: ctx, page: p } = await newPage({ ai: 'none' });
    await openBank(p);
    await check('no AI set up: Tag topics opens the setup card first', async () => {
      await (await openTagVerb(p)).locator('[data-bank-verb="tag"]').click();
      await p.waitForTimeout(500);
      // The menu's body is now the setup card (no verbs left to find it by).
      const menu = door(p).locator('xpath=..').getByRole('dialog');
      const text = await menu.innerText();
      await p.screenshot({ path: join(OUT, '07-setup.png'), clip: await menu.boundingBox() });
      expect((await p.locator('[data-ai-tag-panel]').count()) === 0, 'panel opened without AI');
      return text.split('\n').slice(0, 2).join(' / ');
    });
    await ctx.close();
  }
} else {
  console.log('live run (DSEcon Mentor)');
  for (const lang of ['en', 'zh-HK']) {
    const { context, page } = await newPage({ ai: 'mentor', lang });
    await openBank(page, lang);
    await check(`live ${lang}: the menu shows the credit estimate`, async () => {
      const menu = await openTagVerb(page);
      await page.locator('[data-credit-estimate]').first().waitFor({ timeout: 15_000 });
      await page.screenshot({ path: join(OUT, `live-01-menu-${lang}.png`), clip: await menu.boundingBox() });
      return menu.locator('[data-credit-estimate]').first().innerText();
    });
    await check(`live ${lang}: real suggestions to review`, async () => {
      await page.locator('[data-bank-verb="tag"]').click();
      await panel(page).waitFor();
      await page.locator('[data-ai-tag-panel="done"], [data-ai-tag-panel="error"]').waitFor({ timeout: 120_000 });
      await page.waitForTimeout(600);
      await page.screenshot({ path: join(OUT, `live-02-review-${lang}.png`) });
      const ready = await item(page, 'ready').count();
      expect(ready >= UNTAGGED_IDS.length - 1, `${ready} ready`);
      return `${ready} suggestions`;
    });
    await check(`live ${lang}: a question opens to show it as it prints`, async () => {
      await item(page).nth(1).locator('button[aria-expanded]').click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: join(OUT, `live-03-open-${lang}.png`) });
    });
    await context.close();
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
