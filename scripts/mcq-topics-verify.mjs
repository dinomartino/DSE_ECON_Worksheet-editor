import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * k-0569 (u-wm9e, u-ujbp): the teacher's Question bank by their MCQ topics, in a browser.
 * Seeds one saved paper of real past-paper MCQs that keep the EDB topic codes they were
 * published with (as a teacher's older papers hold them), one already carrying an `@mcq:`
 * tag, and one untagged, then checks and photographs, in English and 中文, at MacBook and
 * iPad widths:
 *  - the topics page: Mentor's section names, and the "need their MCQ topic" strip;
 *  - section C: MCQ topics, and the EDB code still to be picked;
 *  - section F: Circular Flow (the guide's A) sits here;
 *  - Pick the MCQ topic: the candidates as keys; picking one writes the EDB code + @mcq: tag;
 *  - the topic picker (Edit topics) lists MCQ topics;
 *  - the editor's Topics row names the MCQ topic.
 *
 *   npx next dev -p 3570 &
 *   node scripts/mcq-topics-verify.mjs --url=http://localhost:3570 --bank=<local copy of the past paper bank> --out=Outbox/k-0569
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3000');
const OUT = opt('out', '/tmp/mcq-topics-verify');
const BANK = opt('bank', process.env.PASTPAPER_BANK ?? '');
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

// ---- seed ----

const topicFile = (name) => JSON.parse(readFileSync(join(BANK, 'topics', `${name}.json`), 'utf8'));
const take = (file, index, edit = (tags) => tags) => {
  const doc = topicFile(file);
  const q = doc.questions[index];
  return { doc, q: { ...q, tags: edit((q.tags ?? []).filter((t) => typeof t === 'string')) }, gold: file };
};
const picked = [
  take('per-unit-tax', 0),
  take('price-ceiling', 0),
  take('elasticity', 0),
  take('circular-flow', 0),
  take('adas', 0),
  take('opportunity-cost', 0),
  take('quota', 0, (tags) => [...tags, '@mcq:quota']),
  take('scarcity', 0, (tags) => tags.filter((t) => t.includes('/'))),
];
const GOLD = Object.fromEntries(picked.map((p) => [p.q.id, p.gold]));
const DOC = {
  ...picked[0].doc,
  id: 'k0569-mock',
  kind: undefined,
  name: 'Mock 2026 Paper 1 (MCQ topics)',
  title: { en: [{ text: 'Mock 2026 Paper 1' }], zh: [{ text: '2026 模擬試 卷一' }] },
  questions: picked.map((p) => p.q),
  layout: [],
  flow: picked.map((p) => ({ type: 'question', id: p.q.id })),
  createdAt: '2026-11-20T00:00:00.000Z',
  updatedAt: '2026-11-20T00:00:00.000Z',
};
const INDEX = [{ id: DOC.id, title: DOC.name, updatedAt: DOC.updatedAt, questionCount: DOC.questions.length }];

const WORDS = {
  en: {
    bank: /Question bank 題庫|^Question bank$/,
    sectionE: 'Efficiency, Equity & Role of Government',
    pickStrip: 'need their MCQ topic',
    pickRow: 'Market intervention · pick the MCQ topic',
    elasticity: 'Elasticity',
    quota: 'Quota',
    circular: 'Circular Flow',
    perUnitTax: 'Per-unit Tax',
    edit: 'Edit',
  },
  zh: {
    bank: /題庫/,
    sectionE: '效率、公平和政府的角色',
    pickStrip: '需要選定 MCQ 課題',
    pickRow: '政府干預 · 請選 MCQ 課題',
    elasticity: '彈性',
    quota: '配額',
    circular: '經濟活動的循環流程',
    perUnitTax: '從量稅',
    edit: '編輯',
  },
};

const browser = await chromium.launch({ channel: 'chrome' });

async function newPage(lang, viewport) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  context.setDefaultTimeout(20_000);
  await context.addInitScript(
    ([indexJson, docJson, language]) => {
      if (sessionStorage.getItem('k0569-seeded')) return;
      sessionStorage.setItem('k0569-seeded', '1');
      localStorage.clear();
      localStorage.setItem('econ-worksheet-index', indexJson);
      localStorage.setItem('econ-worksheet:k0569-mock', docJson);
      localStorage.setItem('econ-worksheet-last-seen-version', '99.0.0');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: language === 'zh' ? 'zh-HK' : 'en', paper: language }));
    },
    [JSON.stringify(INDEX), JSON.stringify({ ...DOC, language: lang }), lang],
  );
  const page = await context.newPage();
  page.on('pageerror', (err) => console.log(`  PAGE ERR: ${err.message}`));
  return { context, page };
}

const storedTags = (page, qid) =>
  page.evaluate((q) => JSON.parse(localStorage.getItem('econ-worksheet:k0569-mock')).questions.find((x) => x.id === q)?.tags ?? [], qid);

/** The start screen, with the bank set to open on its topics page (it remembers its last screen). */
async function home(page) {
  await page.evaluate(() => localStorage.setItem('econgen.bankLevel', JSON.stringify({ kind: 'topics' }))).catch(() => {});
  await page.goto(APP, { waitUntil: 'networkidle' });
}

async function openBank(page, w) {
  await home(page);
  await page.getByRole('button', { name: w.bank }).first().click();
  await page.locator('[data-bank-pick]').first().waitFor({ timeout: 40_000 });
  await page.waitForTimeout(800);
}

const VIEWPORTS = [
  { name: 'macbook', size: { width: 1440, height: 900 } },
  { name: 'ipad', size: { width: 820, height: 1180 } },
];

for (const lang of ['en', 'zh']) {
  const w = WORDS[lang];
  for (const vp of VIEWPORTS) {
    const tag = `${lang}-${vp.name}`;
    console.log(`\n${tag}`);
    const { context, page } = await newPage(lang, vp.size);
    try {
      await openBank(page, w);

      await check(`${tag}: topics page in Mentor's sections, with the pick strip`, async () => {
        const body = await page.locator('main, body').first().innerText();
        expect(body.includes(w.sectionE), `no "${w.sectionE}"`);
        const strip = await page.locator('[data-bank-pick]').innerText();
        expect(strip.includes(w.pickStrip) && /3/.test(strip), strip);
        await page.screenshot({ path: join(OUT, `${tag}-01-topics.png`) });
        return strip.replace(/\s+/g, ' ');
      });

      await check(`${tag}: section C lists MCQ topics, then the code still to pick`, async () => {
        await page.getByRole('button', { name: /^C\b/ }).first().click();
        await page.locator('[data-rail-entry]').first().waitFor();
        await page.waitForTimeout(600);
        // Rail headings are set in capitals by CSS: compare without case.
        const rail = (await page.evaluate(() => document.body.innerText)).toLowerCase();
        for (const want of [w.elasticity, w.quota, w.pickRow]) expect(rail.includes(want.toLowerCase()), `rail lacks "${want}"`);
        expect(rail.indexOf(w.elasticity.toLowerCase()) < rail.indexOf(w.pickRow.toLowerCase()), 'MCQ topics before the code to pick');
        expect(!/@mcq:|C\.intervention|C\.ped/.test(rail), 'a raw code shows');
        await page.screenshot({ path: join(OUT, `${tag}-02-section-c.png`) });
      });

      await check(`${tag}: the topic picker lists MCQ topics`, async () => {
        const edit = page.getByRole('button', { name: w.edit, exact: true }).first();
        await edit.click();
        const dialog = page.locator('[role="dialog"]').last();
        await dialog.waitFor();
        await dialog.locator('input[type="search"]').fill(lang === 'zh' ? '從量' : 'per-unit');
        await page.waitForTimeout(300);
        const text = await dialog.innerText();
        expect(text.includes(w.perUnitTax), `picker lacks "${w.perUnitTax}"`);
        await page.screenshot({ path: join(OUT, `${tag}-03-picker.png`) });
        await page.keyboard.press('Escape');
        await page.keyboard.press('Escape');
      });

      await check(`${tag}: Circular Flow sits in F`, async () => {
        await openBank(page, w);
        await page.getByRole('button', { name: /^F\b/ }).first().click();
        await page.locator('[data-rail-entry]').first().waitFor();
        await page.waitForTimeout(500);
        const text = await page.evaluate(() => document.body.innerText);
        expect(text.includes(w.circular), `F lacks "${w.circular}"`);
      });

      await check(`${tag}: Pick the MCQ topic offers the candidates${tag === 'en-macbook' ? '; picking one saves the EDB code + @mcq: tag' : ''}`, async () => {
        await openBank(page, w);
        await page.locator('[data-bank-pick]').first().click();
        await page.locator('[data-tag-key]').first().waitFor();
        await page.waitForTimeout(800);
        const keys = await page.locator('[data-tag-key]').allInnerTexts();
        await page.screenshot({ path: join(OUT, `${tag}-04-pick.png`) });
        expect(keys.length >= 2, `keys: ${keys.join(' | ')}`);
        if (tag !== 'en-macbook') return keys.map((k) => k.replace(/\s+/g, ' ')).join(' | ');
        // The question on screen is the one whose candidates the keys are: pick its own topic,
        // then find the question whose stored tags changed.
        const names = { 'Per-unit Tax': 'per-unit-tax', 'Price Ceiling': 'price-ceiling', 'Opportunity cost': 'opportunity-cost' };
        const before = {};
        for (const id of Object.keys(GOLD)) before[id] = JSON.stringify(await storedTags(page, id));
        const index = keys.findIndex((k) => k.includes('Opportunity cost')) >= 0 ? keys.findIndex((k) => k.includes('Opportunity cost')) : keys.findIndex((k) => k.includes('Per-unit Tax'));
        expect(index >= 0, `no key to pick: ${keys.join(' | ')}`);
        const chosen = Object.entries(names).find(([name]) => keys[index].includes(name))[1];
        await page.locator('[data-tag-key]').nth(index).click();
        await page.waitForTimeout(300);
        await page.locator('[data-tag-save]').first().click();
        await page.waitForTimeout(1500);
        const changed = [];
        for (const id of Object.keys(GOLD)) if (JSON.stringify(await storedTags(page, id)) !== before[id]) changed.push(id);
        expect(changed.length === 1, `changed: ${changed.length}`);
        const tags = await storedTags(page, changed[0]);
        expect(tags.includes(`@mcq:${chosen}`), `stored ${JSON.stringify(tags)}`);
        expect(tags.some((t) => /^[A-J]\.[a-z-]+$/.test(t)), `EDB code kept: ${JSON.stringify(tags)}`);
        await page.screenshot({ path: join(OUT, `${tag}-04b-picked-next.png`) });
        return `${GOLD[changed[0]]} picked ${chosen} → ${JSON.stringify(tags)} (was ${before[changed[0]]})`;
      });

      await check(`${tag}: the editor's Topics row names the MCQ topic`, async () => {
        await home(page);
        await page.getByRole('button', { name: /Mock 2026 Paper 1/ }).first().click();
        const elasticity = picked.find((p) => p.gold === 'elasticity').q;
        const side = lang === 'zh' ? 'zh' : 'en';
        const words = (elasticity.blocks?.[0]?.text?.[side] ?? []).map((run) => run.text ?? '').join('');
        const start = words.slice(0, lang === 'zh' ? 8 : 30);
        expect(start, `no words to find the Elasticity question by (${words.slice(0, 80)})`);
        const target = page.getByText(start).first();
        await target.waitFor({ timeout: 40_000 });
        await target.scrollIntoViewIfNeeded();
        await target.click();
        await page.waitForTimeout(1200);
        // The Content tab's tag lines name the MCQ topics too.
        const outline = await page.evaluate(() => document.body.innerText);
        expect(outline.includes(w.elasticity), 'the Content list lacks the MCQ topic');
        await page.screenshot({ path: join(OUT, `${tag}-05a-editor-content.png`) });
        // Choosing the question in the Content list opens its Edit panel.
        await page.getByRole('button', { name: new RegExp(start.slice(0, lang === 'zh' ? 4 : 12)) }).first().click();
        const row = page.locator('[data-topic-row]').first();
        await row.waitFor({ timeout: 20_000 });
        await row.scrollIntoViewIfNeeded();
        const text = await row.innerText();
        expect(text.includes(w.elasticity), `row: ${text.replace(/\s+/g, ' ')}`);
        expect(!/@mcq:|C\.ped/.test(text), 'raw code in the row');
        await page.screenshot({ path: join(OUT, `${tag}-05-editor-topics.png`) });
        return text.replace(/\s+/g, ' ').slice(0, 80);
      });
    } finally {
      await context.close();
    }
  }
}

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
