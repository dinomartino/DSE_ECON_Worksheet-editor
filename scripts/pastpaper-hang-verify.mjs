import { chromium } from 'playwright-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

/**
 * A bank question's number hangs as on the paper (user u-7gdr): its text, wrapped lines too,
 * starts at one column right of the "3.", in the Past paper bank's cards (search, the editor's
 * 題庫 tab), My bank's preview and the editor itself, in EN and 中文. Against a local export
 * served from the gitignored `public/pastpaper-bank/` (never committed).
 *
 *   node scripts/pastpaper-hang-verify.mjs <out-dir> [--port=3000] [--label=after] [--docx]
 *
 * `--label` prefixes the screenshots (run once on the old build as `before`); `--docx` also
 * saves the Word files the Export dialog writes, for a LibreOffice look.
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-hang-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const label = args.find((a) => a.startsWith('--label='))?.slice(8) ?? 'after';
const withDocx = args.includes('--docx');
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (ok, what, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

/** Long stem, statements over a table, a passage pair, picture options. */
const SAMPLES = ['CE2009/P2/Q3', 'DSE2024/P1/Q23', 'DSE2026/P1/Q2', 'CE2010/P2/Q11', 'DSE2016/P1/Q34'];

/**
 * In a drawn question (a shadow root or the editor page): for every paragraph led by a marker,
 * the left edge of each line of its text, the first line's measured after the marker. A
 * hanging paragraph has them all equal.
 */
function measureLines(root) {
  const out = [];
  const markerRe = /^\s*(\d+\.|[A-D]\.|\(\d+\))\s*/;
  for (const p of root.querySelectorAll('p, div')) {
    if (p.querySelector('p, div, table, img')) continue;
    const text = p.textContent ?? '';
    const m = markerRe.exec(text);
    if (!m || text.length < 30) continue;
    const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
    let seen = 0;
    const lefts = new Map();
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const value = node.nodeValue ?? '';
      for (let i = 0; i < value.length; i += 1) {
        const at = seen + i;
        if (at < m[0].length || /\s/.test(value[i])) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        const top = Math.round(r.top / 4);
        if (!lefts.has(top)) lefts.set(top, r.left);
      }
      seen += value.length;
    }
    if (lefts.size > 1) out.push({ marker: m[1], lines: [...lefts.values()].map((x) => Math.round(x * 10) / 10) });
  }
  return out;
}

const browser = await chromium.launch({ channel: 'chrome' });

async function openBank(zh) {
  const page = await browser.newPage({ viewport: { width: 1512, height: 950 }, deviceScaleFactor: 2, acceptDownloads: true });
  page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
  await page.addInitScript(
    ([zhUi]) => {
      delete window.showSaveFilePicker;
      if (sessionStorage.getItem('pp-seeded')) return;
      sessionStorage.setItem('pp-seeded', '1');
      localStorage.setItem('econgen.settings.pastPapers', JSON.stringify({ v: 1, mode: 'custom', url: '/pastpaper-bank/' }));
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: zhUi ? 'zh-HK' : 'en', paper: zhUi ? 'zh' : 'en' }));
    },
    [zh],
  );
  await page.goto(URL);
  const row = page.getByRole('button', { name: new RegExp(zh ? '歷屆試題庫' : 'Past paper bank 歷屆試題庫') }).first();
  await row.waitFor({ timeout: 60_000 });
  await row.click();
  await page.locator('[data-pastpaper-screen] nav li').first().waitFor({ timeout: 30_000 });
  return page;
}

const findCard = async (page, tag, zh) => {
  await page.getByRole('searchbox').first().fill(tag);
  await page.locator('[data-pastpaper-screen]').getByRole('radio', { name: zh ? '所有課題' : 'Every topic' }).click().catch(() => {});
  await page.waitForTimeout(2500);
  const card = page.locator('[data-pastpaper-screen] article').first();
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  return card;
};

const cardLines = (card) =>
  card.evaluate((el, fn) => {
    const host = el.querySelector('div[style*="absolute"]');
    const measure = new Function(`return (${fn})`)();
    return host?.shadowRoot ? measure(host.shadowRoot) : [];
  }, measureLines.toString());

const judge = (where, lines, mustWrap = true) => {
  const wrapped = lines.filter((l) => l.lines.length > 1);
  const off = wrapped.filter((l) => Math.max(...l.lines) - Math.min(...l.lines) > 1.5);
  check((wrapped.length > 0 || !mustWrap) && off.length === 0, `${where}: ${wrapped.length} wrapped numbered paragraph(s), every line at one column`, JSON.stringify(off.slice(0, 2)));
};

async function walk(zh) {
  const lang = zh ? 'zh' : 'en';
  const page = await openBank(zh);
  for (const tag of SAMPLES) {
    const card = await findCard(page, tag, zh);
    const lines = await cardLines(card);
    if (tag !== 'DSE2016/P1/Q34') judge(`[${label} ${lang}] bank card ${tag}`, lines, tag !== 'CE2010/P2/Q11');
    await card.screenshot({ path: `${OUT}/${label}-${lang}-card-${tag.replaceAll('/', '-')}.png` });
  }

  // The editor: the same question as the real MCQ rendering, and in the 題庫 tab beside it.
  const card = await findCard(page, 'CE2009/P2/Q3', zh);
  await card.locator('input[type="checkbox"]').check();
  const second = await findCard(page, 'DSE2024/P1/Q23', zh);
  await second.locator('input[type="checkbox"]').check();
  await page.locator('[role="region"] select').selectOption('new:paper1');
  await page.locator('[role="region"]').getByRole('button', { name: zh ? '加入' : 'Add', exact: true }).click();
  await page.locator('[data-print-hide]').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  await page.getByRole('tab', { name: /題庫/ }).click();
  await page.getByRole('radio', { name: zh ? '歷屆試題' : 'Past papers' }).click();
  await page.locator('[data-pastpaper-tab] select').first().waitFor({ timeout: 30_000 });
  await page.locator('[data-pastpaper-tab] select').first().selectOption('three-basic-economic-problems');
  await page.waitForTimeout(2500);
  const tabCard = page.locator('[data-pastpaper-tab] article', { hasText: zh ? '2009 卷二 第 3 題' : '2009 Paper 2 Q3' }).first();
  await tabCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  judge(`[${label} ${lang}] 題庫 tab card CE2009/P2/Q3`, await cardLines(tabCard));
  await page.screenshot({ path: `${OUT}/${label}-${lang}-editor-and-tab.png` });

  if (withDocx) {
    for (const [language, title] of [['en', 'English only'], ['zh', '中文 only']]) {
      if ((language === 'zh') !== zh) continue;
      await page.getByRole('button', { name: zh ? /^匯出/ : /^Export/ }).first().click();
      const exporter = page.getByRole('dialog');
      await exporter.getByText('.docx', { exact: true }).click();
      await exporter.getByRole('radiogroup').filter({ has: page.getByTitle(zh ? '只有中文' : title) }).first().getByTitle(zh ? '只有中文' : title).click().catch(() => {});
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), exporter.getByRole('button', { name: /\.docx/ }).last().click()]);
      const bytes = readFileSync(await download.path());
      writeFileSync(`${OUT}/${label}-${language}-paper1.docx`, bytes);
      await page.keyboard.press('Escape');
    }
  }
  await page.close();
}

async function myBank(zh) {
  // Copy to my question bank, then My bank's own preview of the copy.
  const lang = zh ? 'zh' : 'en';
  const page = await openBank(zh);
  const card = await findCard(page, 'CE2009/P2/Q3', zh);
  await card.locator('input[type="checkbox"]').check();
  await page.locator('[role="region"]').getByRole('button', { name: zh ? '複製到我的題庫' : 'Copy to my question bank' }).click();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: zh ? /主頁/ : /Home/ }).first().click();
  await page.getByRole('button', { name: zh ? /^題庫/ : /^Question bank/ }).first().click();
  await page.waitForTimeout(2000);
  // With no worksheet yet, My bank opens on its welcome; its search finds the copy.
  await page.getByRole('searchbox').first().fill(zh ? '孕婦' : 'pregnant');
  await page.waitForTimeout(3000);
  const shot = `${OUT}/${label}-${lang}-my-bank.png`;
  await page.screenshot({ path: shot });
  const lines = await page.evaluate((fn) => {
    const measure = new Function(`return (${fn})`)();
    // My bank draws the copy with the editor's own preview, in the page itself: its first
    // paragraph's lines, the absolutely placed "1." aside.
    void measure;
    // The preview paper sits in a shadow root (as the bank's cards); the list row beside it does not count.
    const roots = [...document.querySelectorAll('*')].flatMap((host) => (host.shadowRoot ? [host.shadowRoot] : []));
    const els = roots.flatMap((root) => [...root.querySelectorAll('div, p')]).filter((el) => {
      const t = el.textContent ?? '';
      return t.includes('A large number of pregnant') && t.includes("Hong Kong's public hospitals.") && !t.includes('The above suggestion');
    });
    const el = els[els.length - 1];
    if (!el) return [];
    const lefts = new Map();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    // The number itself is not the text: skip it, whether in the flow or placed aside.
    const skip = /^\s*\d+\.\s*/.exec(el.textContent ?? '')?.[0].length ?? 0;
    let seen = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = seen;
      seen += node.nodeValue.length;
      if (getComputedStyle(node.parentElement).position === 'absolute') continue;
      for (let i = 0; i < node.nodeValue.length; i += 1) {
        if (start + i < skip || /\s/.test(node.nodeValue[i])) continue;
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        if (!r.width) continue;
        const top = Math.round(r.top / 4);
        if (!lefts.has(top)) lefts.set(top, Math.round(r.left * 10) / 10);
      }
    }
    return [{ marker: '1.', lines: [...lefts.values()] }];
  }, measureLines.toString());
  judge(`[${label} ${lang}] My bank preview`, lines);
  await page.close();
}

try {
  if (!args.includes('--my-bank-only')) {
    await walk(false);
    await walk(true);
  }
  await myBank(false);
} finally {
  await browser.close();
}
console.log(failures ? `${failures} FAILED` : 'all passed');
process.exit(failures ? 1 : 0);
