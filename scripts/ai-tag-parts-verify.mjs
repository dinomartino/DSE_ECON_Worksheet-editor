import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { MOCK_MODEL, startMockServer } from './ai-mock-server.mjs';

/**
 * k-0560 / u-g13t: AI tagging part by part, in a browser. Seeds one saved paper with three
 * untagged structured questions with parts (invented, HKDSE Paper 2 style: (a)/(b)/(c), one with
 * (b)(i)/(b)(ii)) and one MC, then runs ✦ AI → Tag topics:
 *  - mock (default): the canned mock answers each part from its own words; checks part rows,
 *    nothing written before Accept, Accept / Change… / Skip / Undo on one part, Accept all parts,
 *    each part's own list in the stored document, and takes screenshots (EN, 中文, phone width).
 *  - live (`--token=`): signed in to DSEcon Mentor (dev server built with NEXT_PUBLIC_MENTOR_ORIGIN
 *    pointing at it): the real run, the same checks, screenshots named live-parts-*.
 *
 *   NEXT_PUBLIC_MENTOR_ORIGIN=http://localhost:3124 npx next dev -p 3560 &
 *   node scripts/ai-tag-parts-verify.mjs --url=http://localhost:3560 --out=Outbox/k-0560/screens [--token=…]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/ai-tag-parts-verify');
const TOKEN = opt('token', '');
const MOCK_PORT = Number(opt('port', '8797'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const PREFIX = TOKEN ? 'live-parts' : 'parts';
mkdirSync(OUT, { recursive: true });

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

// ---- seed: invented questions with parts, no topics ----

const runs = (text) => (text ? [{ text }] : []);
const bi = (en, zh = '') => ({ en: runs(en), zh: runs(zh) });
let seq = 0;
const nid = (p = 'tp') => `${p}-${(seq += 1)}`;
const para = (en, zh) => ({ kind: 'paragraph', id: nid('b'), text: bi(en, zh) });
const part = (en, marks, subs) =>
  subs
    ? { id: nid('p'), blocks: [para(en)], subParts: subs.map(([text, m]) => ({ id: nid('s'), blocks: [para(text)], marks: m })) }
    : { id: nid('p'), blocks: [para(en)], marks };
const lq = (stem, parts) => ({ id: nid('q'), type: 'structured', blocks: [para(stem)], parts });

const RENT = lq('The government of an economy sets a maximum rent (a rent ceiling) on private flats below the equilibrium rent.', [
  part('With the aid of a diagram, explain why there will be a shortage of private flats.', 4),
  part('Explain whether the rent ceiling will lead to a deadweight loss in the market for private flats.', 3),
  part('Suggest ONE non-price method landlords may use to choose their tenants.', 2),
]);
const JOBS = lq('In the first quarter of a year, the labour force of an economy was 3.8 million and 152 000 people were unemployed.', [
  part('Calculate the unemployment rate. Show your working.', 2),
  part('The economy then went into a recession.', undefined, [
    ['Explain how the recession may raise the unemployment rate.', 3],
    ['Explain ONE fiscal policy measure the government may adopt to reduce unemployment.', 3],
  ]),
]);
const DRINKS = lq('Company X, a soft-drink producer, has recently bought a sugar plantation.', [
  part('Identify the type of integration involved. Explain ONE motive for it.', 3),
  part('Company X raised the price of its drinks by 10% and its total revenue rose. What does this tell you about the price elasticity of demand for its drinks? Explain.', 3),
  part('Company X is a limited company. State ONE advantage of a limited company over a partnership.', 2),
]);
const MC = {
  id: nid('q'),
  type: 'mcq',
  blocks: [para('Which of the following is an example of a free good?')],
  options: ['Sea water in the ocean', 'A free newspaper', 'Books in a public library', 'A free school lunch'].map((en) => ({ id: nid('o'), text: bi(en) })),
  marks: 1,
  answerIndex: 0,
};
const QUESTIONS = [RENT, JOBS, DRINKS, MC];
const DOC = {
  schemaVersion: 1,
  id: 'k0560-parts',
  name: 'S6 Mock Paper 2 (draft)',
  title: bi('S6 Mock Paper 2 (draft)'),
  instructions: bi('Answer ALL questions.'),
  fonts: { latin: 'Times New Roman', eastAsia: 'PMingLiU' },
  pageSetup: { paper: 'A4', orientation: 'portrait', margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
  header: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
  footer: { enabled: true, rule: false, showOnFirstPage: true, bands: [] },
  questions: QUESTIONS,
  layout: [],
  flow: QUESTIONS.map((q) => ({ type: 'question', id: q.id })),
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};
const INDEX = [{ id: DOC.id, title: DOC.name, updatedAt: DOC.updatedAt, questionCount: QUESTIONS.length }];

// ---- browser ----

if (!TOKEN) await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

async function newPage({ lang = 'en', viewport = { width: 1280, height: 900 } } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  context.setDefaultTimeout(15_000);
  const settings = TOKEN ? { provider: 'mentor' } : { v: 1, provider: 'custom', models: { custom: MOCK_MODEL }, baseUrls: { custom: `${MOCK}/v1` } };
  await context.addInitScript(
    ([indexJson, doc, settingsJson, token, language]) => {
      if (sessionStorage.getItem('k0560-parts-seeded')) return;
      sessionStorage.setItem('k0560-parts-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econ-worksheet-index', indexJson);
      localStorage.setItem(`econ-worksheet:${JSON.parse(doc).id}`, doc);
      localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language, paper: 'en' }));
      localStorage.setItem('econgen.settings.ai', settingsJson);
      if (token) localStorage.setItem('econgen.secret.ai:mentor', token);
      else sessionStorage.setItem('econgen.secret.ai:custom', 'sk-mock-verify-0000');
      localStorage.setItem('econgen.bankLevel', JSON.stringify({ kind: 'review', topic: 'all' }));
    },
    [JSON.stringify(INDEX), JSON.stringify(DOC), JSON.stringify(settings), TOKEN, lang],
  );
  if (!TOKEN) await context.route((url) => /googleapis\.com|deepseek\.com|openai\.com|anthropic\.com|openrouter\.ai|dashscope/.test(url.hostname), (r) => r.fulfill({ status: 599, body: 'blocked' }));
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`  PAGE ERR: ${err.message}`));
  return { context, page };
}

async function runTagging(page) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Question bank 題庫|題庫/ }).first().click();
  const door = page.locator('[data-bank-ai-door]').first();
  await door.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1200);
  await door.click();
  const menu = page.locator('[role="dialog"]').filter({ has: page.locator('[data-bank-verb]') }).first();
  await menu.locator('[data-bank-ai-scope="untagged"]').click();
  await menu.locator('[data-bank-verb="tag"]').hover();
  const estimate = TOKEN ? await page.locator('[data-credit-estimate]').first().innerText({ timeout: 15_000 }).catch(() => '') : '';
  await menu.locator('[data-bank-verb="tag"]').click();
  // Over 20 items would ask first; four questions never do.
  await page.locator('[data-ai-tag-panel]').waitFor();
  await page.locator('[data-ai-tag-panel="done"], [data-ai-tag-panel="error"]').waitFor({ timeout: 180_000 });
  await page.waitForTimeout(500);
  return estimate;
}

/** Each stored question's lists: its own, and each part's and sub-part's by label. */
const stored = (page) =>
  page.evaluate((docId) => {
    const doc = JSON.parse(localStorage.getItem(`econ-worksheet:${docId}`));
    const letter = (i) => String.fromCharCode(97 + i);
    const roman = ['i', 'ii', 'iii', 'iv', 'v'];
    return Object.fromEntries(
      doc.questions.map((q) => {
        const lists = { q: q.tags ?? [] };
        (q.parts ?? []).forEach((p, i) => {
          lists[`(${letter(i)})`] = p.tags ?? [];
          (p.subParts ?? []).forEach((s, j) => (lists[`(${letter(i)})(${roman[j]})`] = s.tags ?? []));
        });
        return [q.id, lists];
      }),
    );
  }, DOC.id);
const card = (page, q) => page.locator(`[data-ai-tag-item][data-question="${q.id}"]`);
const partRow = (page, q, label) => card(page, q).locator(`[data-ai-tag-part][aria-label="Part ${label}"]`);
const partState = (page, q, label) => partRow(page, q, label).getAttribute('data-ai-tag-part');
const topics = (lists) => lists.filter((t) => /^(?:[A-Z]|EL\d)(?:\.[a-z0-9-]+)?$/.test(t));

console.log(TOKEN ? 'live run (DSEcon Mentor)' : 'mock run');
const { context, page } = await newPage();
const before = await (async () => {
  const estimate = await runTagging(page);
  if (estimate) console.log(`  estimate: ${estimate.replace(/\s+/g, ' ')}`);
  return stored(page);
})();

await check('each question with parts is suggested part by part; the MC as a whole', async () => {
  const labels = async (q) => card(page, q).locator('[data-ai-tag-part]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
  expect(JSON.stringify(await labels(RENT)) === '["Part (a)","Part (b)","Part (c)"]', String(await labels(RENT)));
  expect(JSON.stringify(await labels(JOBS)) === '["Part (a)","Part (b)(i)","Part (b)(ii)"]', String(await labels(JOBS)));
  expect((await card(page, MC).locator('[data-ai-tag-part]').count()) === 0, 'MC has part rows');
  expect((await card(page, MC).locator('[data-ai-tag-topic]').count()) >= 1, 'MC has no suggestion');
  const ready = await page.locator('[data-ai-tag-part="ready"]').count();
  expect(ready >= 8, `${ready} parts ready of 9`);
  await page.screenshot({ path: join(OUT, `${PREFIX}-01-review.png`), fullPage: false });
  const chips = async (q, label) => partRow(page, q, label).locator('[data-ai-tag-topic]').evaluateAll((els) => els.map((el) => el.getAttribute('data-ai-tag-topic')).join('+'));
  const lines = [];
  for (const [q, name, ls] of [[RENT, 'rent', ['(a)', '(b)', '(c)']], [JOBS, 'jobs', ['(a)', '(b)(i)', '(b)(ii)']], [DRINKS, 'drinks', ['(a)', '(b)', '(c)']]]) {
    lines.push(`${name} ${(await Promise.all(ls.map(async (l) => `${l}=${await chips(q, l)}`))).join(' ')}`);
  }
  return lines.join(' | ');
});

await check('nothing written before Accept', async () => {
  expect(JSON.stringify(await stored(page)) === JSON.stringify(before), 'written');
});

await check('Accept on part (a) saves that part only', async () => {
  await partRow(page, RENT, '(a)').locator('[data-ai-tag-accept]').click();
  await page.waitForFunction(([id]) => document.querySelector(`[data-question="${id}"] [aria-label="Part (a)"]`)?.getAttribute('data-ai-tag-part') === 'saved', [RENT.id]);
  const now = (await stored(page))[RENT.id];
  expect(topics(now['(a)']).length >= 1, JSON.stringify(now));
  expect(topics(now['(b)']).length === 0 && topics(now['(c)']).length === 0, `others: ${JSON.stringify(now)}`);
  return now['(a)'].join(',');
});

await check('Change… on part (b) opens the picker for that part; its save writes part (b) only', async () => {
  await partRow(page, RENT, '(b)').locator('[data-ai-tag-change]').click();
  const picker = page.getByRole('dialog', { name: 'Topics for part (b)' });
  await picker.waitFor();
  await page.screenshot({ path: join(OUT, `${PREFIX}-02-change-part.png`) });
  // One at a time: the list reflows (a 題型 row goes) as each comes off.
  while ((await picker.locator('input[type="checkbox"]:checked').count()) > 0) await picker.locator('input[type="checkbox"]:checked').first().uncheck();
  await picker.getByPlaceholder(/Find a topic/).fill('Efficiency');
  await picker.getByLabel('Efficiency', { exact: true }).check();
  await picker.getByRole('button', { name: 'Accept these topics' }).click();
  await page.waitForFunction(([id]) => document.querySelector(`[data-question="${id}"] [aria-label="Part (b)"]`)?.getAttribute('data-ai-tag-part') === 'saved', [RENT.id]);
  const now = (await stored(page))[RENT.id];
  expect(JSON.stringify(topics(now['(b)'])) === '["E.efficiency"]', JSON.stringify(now));
  expect(topics(now['(c)']).length === 0, 'part (c) written');
});

await check('Skip on part (c) writes nothing', async () => {
  await partRow(page, RENT, '(c)').locator('[data-ai-tag-skip]').click();
  expect((await partState(page, RENT, '(c)')) === 'skipped', 'not skipped');
  expect(topics((await stored(page))[RENT.id]['(c)']).length === 0, 'written');
});

await check('Undo on part (a) takes back part (a) only, after part (b) was saved', async () => {
  await partRow(page, RENT, '(a)').locator('[data-ai-tag-undo]').click();
  await page.waitForFunction(([id]) => document.querySelector(`[data-question="${id}"] [aria-label="Part (a)"]`)?.getAttribute('data-ai-tag-part') === 'ready', [RENT.id]);
  const now = (await stored(page))[RENT.id];
  expect(topics(now['(a)']).length === 0, `(a) ${JSON.stringify(now)}`);
  expect(JSON.stringify(topics(now['(b)'])) === '["E.efficiency"]', `(b) ${JSON.stringify(now)}`);
});

await check('Accept all parts saves every waiting part of that question, sub-parts on their own', async () => {
  await card(page, JOBS).locator('[data-ai-tag-accept-parts]').click();
  await page.waitForFunction(([id]) => [...document.querySelectorAll(`[data-question="${id}"] [data-ai-tag-part]`)].every((el) => el.getAttribute('data-ai-tag-part') === 'saved'), [JOBS.id]);
  const now = (await stored(page))[JOBS.id];
  for (const label of ['(a)', '(b)(i)', '(b)(ii)']) expect(topics(now[label]).length >= 1, `${label} ${JSON.stringify(now)}`);
  await page.screenshot({ path: join(OUT, `${PREFIX}-03-after.png`) });
  return ['(a)', '(b)(i)', '(b)(ii)'].map((l) => `${l}=${topics(now[l]).join('+')}`).join(' ');
});

await check('Accept all (footer) saves the rest; the skipped part stays untagged', async () => {
  await page.locator('[data-ai-tag-accept-all]').click();
  await page.waitForFunction(() => document.querySelectorAll('[data-ai-tag-part="ready"], [data-ai-tag-part="saving"], [data-ai-tag-item="ready"]').length === 0);
  const now = await stored(page);
  expect(topics(now[RENT.id]['(c)']).length === 0, 'skipped part tagged');
  expect(topics(now[RENT.id]['(a)']).length >= 1, 'rent (a) not saved');
  for (const label of ['(a)', '(b)', '(c)']) expect(topics(now[DRINKS.id][label]).length >= 1, `drinks ${label}`);
  expect(topics(now[MC.id].q).length >= 1, 'MC not saved');
  return page.locator('[data-ai-tag-tally]').innerText();
});
await context.close();

for (const [lang, viewport, name] of [
  ['zh-HK', { width: 1280, height: 900 }, 'zh'],
  ['en', { width: 390, height: 844 }, 'phone'],
]) {
  const { context: ctx, page: p } = await newPage({ lang, viewport });
  await check(`review in ${name}`, async () => {
    await runTagging(p);
    expect((await p.locator('[data-ai-tag-part]').count()) === 9, 'not 9 part rows');
    await p.screenshot({ path: join(OUT, `${PREFIX}-04-review-${name}.png`) });
    if (name === 'zh') expect((await p.getByText('按分題建議').count()) >= 1, 'no 中文 part heading');
    if (name === 'phone') {
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow <= 1, `page scrolls sideways by ${overflow}px`);
    }
  });
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
