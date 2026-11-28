import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright-core';

/**
 * k-0595 (u-m9g9): a marking point holds its own diagram or table, in a real browser. Seeds
 * `scripts/point-figures-fixture.test.ts` (a part whose point (1) holds a demand-shift
 * diagram and whose last point holds a table, with a table still in the answer beside the
 * scheme), then, in English at 1440 and 中文 at 1180:
 *
 *   <lang>-key.png        the Marking scheme view: each figure straight under its point
 *   <lang>-panel.png      part (a)'s scheme panel: "In point 1" with the diagram card
 *   <lang>-moved.png      the answer's table moved into point 3 from the point's menu
 *   <lang>-added.png      point 2 given a table through "Add diagram or table"
 *
 * and checks the order on the page, that the move and the add print in the view, and that
 * the saved file holds them in the points (schema 4).
 *
 *   node scripts/point-figures-verify.mjs [--url=http://localhost:3000] [--out=/tmp/point-figures-verify]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const OUT = opt('out', '/tmp/point-figures-verify');
const URL_BASE = opt('url', 'http://localhost:3000');
const APP_VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
mkdirSync(OUT, { recursive: true });
const emit = spawnSync('npx', ['vitest', 'run', 'scripts/point-figures-fixture.test.ts'], {
  stdio: 'inherit',
  env: { ...process.env, POINT_DIR: OUT },
});
if (emit.status !== 0) process.exit(1);

let failures = 0;
const check = (tag, ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  [${tag}] ${label}${ok ? '' : `  ${detail}`}`);
  if (!ok) failures += 1;
};

const json = readFileSync(`${OUT}/point.worksheet.json`, 'utf8');
const worksheet = JSON.parse(json);
const title = 'Point figures harness';
const key = `econ-worksheet:${worksheet.id}`;
const browser = await chromium.launch({ channel: 'chrome', executablePath: process.env.CHROME ?? '/opt/google/chrome/chrome' });
try {
  for (const [tag, size, zh] of [
    ['en', { width: 1440, height: 1000 }, false],
    ['zh', { width: 1180, height: 900 }, true],
  ]) {
    const W = zh
      ? { key: '評卷參考', q: '第1題', p1: '正確圖表', p2: '均衡價格由 P1', p3: '均衡數量由 Q1', p4: '總收入上升', inPoint: '要點 1 內', addFigure: '加入圖表或表格', move: '把答案表格 1 移入此要點', actions: (n) => `要點 ${n} 的操作`, answerTable: '之前' }
      : { key: 'Marking scheme', q: 'Question 1', p1: 'Correct diagram', p2: 'Equilibrium price rises', p3: 'Equilibrium quantity rises', p4: 'Total revenue rises', inPoint: 'In point 1', addFigure: 'Add diagram or table', move: 'Move answer table 1 into this point', actions: (n) => `Actions for point ${n}`, answerTable: 'Before' };
    const context = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });
    await context.addInitScript(
      ([indexJson, k, doc, version, chinese]) => {
        if (window.localStorage.getItem(k)) return;
        window.localStorage.setItem('econ-worksheet-index', indexJson);
        window.localStorage.setItem(k, doc);
        window.localStorage.setItem('econ-worksheet-last-seen-version', version);
        window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: chinese ? 'zh-HK' : 'en', paper: chinese ? 'zh' : 'en' }));
      },
      [JSON.stringify([{ id: worksheet.id, title, updatedAt: worksheet.updatedAt }]), key, json, APP_VERSION, zh],
    );
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(URL_BASE, { waitUntil: 'networkidle' });
    await page.getByRole('button', { name: new RegExp(title) }).first().click();
    await page.waitForSelector('#print-root .paper', { timeout: 60_000 });
    await page.getByText(W.key, { exact: true }).first().click();
    await page.waitForTimeout(2000);

    /** The view's text, and where each needle (text or a figure's block id) sits in document order. */
    const order = async (needles) =>
      page.evaluate((list) => {
        const root = document.querySelector('#print-root');
        const all = [...root.querySelectorAll('*')];
        return list.map((needle) => {
          if (needle.startsWith('#')) {
            const kind = needle.slice(1);
            return all.findIndex((el) => el.matches(kind));
          }
          return all.findIndex((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(needle)));
        });
      }, needles);
    const [p1, svg, p2, p3, p4] = await order([W.p1, '#svg', W.p2, W.p3, W.p4]);
    check(tag, p1 > -1 && svg > p1 && svg < p2, 'the diagram prints straight under point (1), before point (2)', JSON.stringify({ p1, svg, p2 }));
    const tables = await page.evaluate(() => [...document.querySelectorAll('#print-root table')].length);
    check(tag, tables >= 2 && p4 > p3, 'the point table and the answer table print', String(tables));
    await page.locator('#print-root .paper').first().screenshot({ path: `${OUT}/${tag}-key.png` });

    // The panel: select the question, open part (a).
    await page.locator('#print-root').getByText(W.q, { exact: true }).first().click();
    await page.waitForTimeout(1000);
    const toggle = page.locator('button[aria-expanded="false"]').filter({ hasText: '(a)' }).first();
    if (await toggle.count()) await toggle.click();
    await page.waitForTimeout(800);
    const inPoint = page.getByText(W.inPoint, { exact: true });
    check(tag, (await inPoint.count()) > 0, `the panel shows "${W.inPoint}"`);
    if (await inPoint.count()) {
      await inPoint.first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${tag}-panel.png` });
    }

    /** Open point n's menu once the panel has stopped scrolling (a scroll closes a menu). */
    const openMenu = async (n) => {
      const button = page.getByRole('button', { name: W.actions(n) }).first();
      for (let tries = 0; tries < 3; tries += 1) {
        await button.scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await button.click();
        try {
          await page.getByRole('menuitem').first().waitFor({ timeout: 1500 });
          return;
        } catch {
          // closed by a late scroll: try again
        }
      }
    };

    // Move the answer's table into point 3, from point 3's menu.
    await openMenu(3);
    const move = page.getByRole('menuitem', { name: W.move });
    check(tag, (await move.count()) > 0, `point 3's menu offers "${W.move}"`);
    if (await move.count()) {
      await move.first().click();
      await page.waitForTimeout(1200);
      const [q3, table3, q4] = await order([W.p3, '#table', W.p4]);
      const firstTableAfterP3 = await page.evaluate((needle) => {
        const root = document.querySelector('#print-root');
        const all = [...root.querySelectorAll('*')];
        const at = all.findIndex((el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.includes(needle)));
        return all.slice(at).find((el) => el.matches('table'))?.innerText ?? '';
      }, W.p3);
      check(tag, firstTableAfterP3.includes(W.answerTable), 'the moved table prints under point (3)', JSON.stringify({ q3, table3, q4, firstTableAfterP3: firstTableAfterP3.slice(0, 60) }));
      await page.locator('#print-root .paper').first().screenshot({ path: `${OUT}/${tag}-moved.png` });
    }

    // Point 2: Add diagram or table → Table (the table picker's first cell).
    await openMenu(2);
    await page.getByRole('menuitem', { name: W.addFigure }).first().click();
    await page.waitForTimeout(500);
    const box = page.locator('[data-point-figures]').filter({ has: page.getByText(zh ? '要點 2 內' : 'In point 2', { exact: true }) }).first();
    check(tag, (await box.count()) > 0, 'point 2 opens its figure list');
    const stored = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k)), key);
    if (await box.count()) {
      await box.scrollIntoViewIfNeeded();
      const addButtons = await box.locator('[role="group"] button').allInnerTexts();
      check(tag, !addButtons.some((t) => /^(Text|文字)$/.test(t.trim())), 'its Add row has no Text or Source', addButtons.join('|'));
      await page.screenshot({ path: `${OUT}/${tag}-add-row.png` });
    }
    await page.waitForTimeout(1200);
    const doc = await stored();
    const points = doc.questions[0].parts[0].scheme.routes[0].groups[0].points;
    check(tag, doc.schemaVersion === 4, 'saved at schema 4', String(doc.schemaVersion));
    check(tag, points[0].blocks?.[0]?.kind === 'diagram' && points[2].blocks?.[0]?.kind === 'table', 'saved: the diagram in point 1, the moved table in point 3');
    check(tag, !doc.questions[0].parts[0].answerBlocks, 'saved: the answer no longer holds the table');
    check(tag, errors.length === 0, 'no page errors', errors.join(' | '));
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
