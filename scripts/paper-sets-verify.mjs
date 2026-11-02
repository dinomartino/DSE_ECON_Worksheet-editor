import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Paper sets, step A (k-0299), walked as a teacher in Chrome:
 *
 *   node scripts/paper-sets-verify.mjs [--zh] [--port=3117] [--out=/tmp/paper-sets]
 *
 * Builds Paper 1 (with a school), Paper 2 (the form must offer the same school), a classroom
 * worksheet and an unrelated Paper 1; makes a set from Paper 1 (Paper 2 suggested), checks the
 * frame, opens Paper 1 and switches to Paper 2 by the strip, checks Export ticks Paper 1, prints
 * nothing of the strip, duplicates Paper 1 (copy outside the set, 中 suffix), renames and
 * ungroups. Screenshots go to --out. Exits 1 on any failed check.
 */

const args = process.argv.slice(2);
const zh = args.includes('--zh');
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3117';
const OUT = args.find((a) => a.startsWith('--out='))?.slice(6) ?? '/tmp/paper-sets';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });
const tag = zh ? 'zh' : 'en';

const W = zh
  ? {
      newWorksheet: '新增工作紙', name: '名稱', create: /建立工作紙/, school: '學校', home: 'Econ Studio 主頁',
      paper1: /^Paper 1 Mock · MCQ/, paper2: /^Paper 2 Mock · 答題簿/, classroom: /^課堂工作紙/,
      actionsFor: (t) => `「${t}」的操作`, makeSet: '建立套卷…', make: '建立套卷', leaveSet: '移出套卷', setName: '套卷名稱',
      duplicate: '建立副本', copySuffix: '（副本）', set: '套卷', export: /^匯出/, alsoInclude: '一併包含', answerKey: /評卷參考/, word: 'Word',
      renameSet: '重新命名套卷…', rename: '重新命名', ungroup: '解散套卷', setActions: (n) => `套卷「${n}」的操作`, dismissHint: '關閉提示',
      thisSet: '同一套卷', open: (t) => `開啟「${t}」`,
    }
  : {
      newWorksheet: 'New worksheet', name: 'Name', create: /Create worksheet/, school: 'School', home: 'Econ Studio home',
      paper1: /^Paper 1 mock · MCQ/, paper2: /^Paper 2 mock · booklet/, classroom: /^Classroom worksheet/,
      actionsFor: (t) => `Actions for ${t}`, makeSet: 'Make a set…', make: 'Make set', leaveSet: 'Remove from set', setName: 'Set name',
      duplicate: 'Duplicate', copySuffix: ' (copy)', set: 'Set', export: /^Export/, alsoInclude: 'Also include', answerKey: /Answer key/, word: 'Word',
      renameSet: 'Rename set…', rename: 'Rename', ungroup: 'Ungroup', setActions: (n) => `Actions for the set ${n}`, dismissHint: 'Dismiss hint',
      thisSet: 'This set', open: (t) => `Open ${t}`,
    };

const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
if (zh) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('econgen.settings.language')) {
      window.localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: 'zh-HK', paper: 'en' }));
    }
  });
}
await page.goto(URL, { waitUntil: 'networkidle' });

const shot = (name) => page.screenshot({ path: `${OUT}/${tag}-${name}.png` });
const home = async () => {
  await page.getByRole('button', { name: W.home, exact: true }).click();
  await page.getByRole('button', { name: W.newWorksheet, exact: true }).first().waitFor();
  // The grid's entrance (≈ 450 ms) re-renders the cards; a menu opened during it closes.
  await page.waitForTimeout(700);
};
const create = async (kind, name, school) => {
  const dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: W.newWorksheet, exact: true }).first().click();
  await dialog.getByRole('radio', { name: kind }).click();
  await dialog.getByLabel(W.name, { exact: true }).fill(name);
  let offered;
  if (school !== undefined) {
    const box = dialog.getByLabel(W.school, { exact: true });
    offered = await box.inputValue();
    if (school) await box.fill(school);
  }
  await page.getByRole('button', { name: W.create }).click();
  await page.locator('#print-root .paper').first().waitFor({ timeout: 20_000 });
  const hint = page.getByRole('button', { name: W.dismissHint });
  if (await hint.count()) await hint.first().click();
  await home();
  return offered;
};
const cardMenu = (title) => page.getByRole('button', { name: W.actionsFor(title), exact: true }).first();
const menuItem = (name) => page.getByRole('menuitem', { name, exact: true });

const P1 = 'S6 Mock Paper 1 2026-27';
const P2 = 'S6 Mock Paper 2 2026-27';
const SET = 'S6 Mock 2026-27';

// 1. Four documents; the form remembers the school.
await create(W.paper1, P1, 'St Mary College');
const offered = await create(W.paper2, P2, '');
check(offered === 'St Mary College', `Paper 2's form offers the school typed for Paper 1 (got "${offered}")`);
await create(W.classroom, 'Unit 3 Demand');
await create(W.paper1, 'S5 Final Paper 1', undefined);
check((await page.locator('[data-paper-set]').count()) === 0, 'no set before one is made');

// 2. A classroom worksheet is not offered a set; Paper 1 is.
await cardMenu('Unit 3 Demand').click();
check((await menuItem(W.makeSet).count()) === 0, 'a classroom worksheet has no Make a set…');
await page.keyboard.press('Escape');
await cardMenu(P1).click();
await menuItem(W.makeSet).click();
const dialog = page.getByRole('dialog');
check((await dialog.getByLabel(W.setName).inputValue()) === SET, 'the set name is proposed from Paper 1’s name');
const p2Box = dialog.getByRole('checkbox', { name: new RegExp(P2) });
check(await p2Box.isChecked(), 'Paper 2 is suggested (ticked)');
const s5Box = dialog.getByRole('checkbox', { name: /S5 Final Paper 1/ });
check(!(await s5Box.isChecked()), 'the unrelated paper is offered, not ticked');
check((await dialog.getByRole('checkbox', { name: /Unit 3 Demand/ }).count()) === 0, 'a worksheet is never offered');
await shot('make-set-dialog');
await dialog.getByRole('button', { name: W.make, exact: true }).click();
await page.locator('[data-paper-set]').first().waitFor();

// 3. The frame.
const frame = page.locator('[data-paper-set]').first();
const frameText = await frame.innerText();
check(frameText.includes(SET) && frameText.includes(W.set), 'the frame names the set and says Set');
check(frameText.includes(P1) && frameText.includes(P2) && !frameText.includes('S5 Final'), 'the frame holds Paper 1 and Paper 2 only');
check(frameText.indexOf(P1) < frameText.indexOf(P2), 'Paper 1 before Paper 2');
await shot('dashboard-set');

// 4. Open Paper 1: the strip; switch to Paper 2 by it.
await frame.getByRole('button', { name: new RegExp(P1) }).first().click();
const strip = page.locator('[data-paper-set-strip]');
await strip.waitFor({ timeout: 20_000 });
check((await strip.innerText()).includes(SET), 'the editor strip names the set');
await shot('editor-strip');
await strip.getByRole('button', { name: W.open(P2) }).click();
await page.waitForFunction((t) => document.title.includes(t) || !!document.querySelector('[data-paper-set-strip] [aria-current="page"]'), P2);
await page.waitForTimeout(800);
const current = await strip.locator('[aria-current="page"]').innerText();
check(current.includes('Paper 2'), `switching opens Paper 2 (current chip: ${current})`);

// 5. Print hides the strip.
await page.emulateMedia({ media: 'print' });
check(!(await strip.isVisible()), 'the strip is not printed');
await page.emulateMedia({ media: 'screen' });

// 6. Export → Answer key → Word: Also include has Paper 1 ticked.
await page.getByRole('button', { name: W.export }).first().click();
const exp = page.getByRole('dialog');
await exp.getByRole('radio', { name: W.answerKey }).first().click();
const wordRadio = exp.getByRole('radio', { name: W.word });
if (await wordRadio.count()) await wordRadio.first().click();
await exp.getByText(W.alsoInclude, { exact: true }).waitFor({ timeout: 10_000 });
const p1Pick = exp.getByRole('checkbox', { name: new RegExp(P1) });
check(await p1Pick.isChecked(), 'Export pre-ticks Paper 1 in Also include');
check((await exp.getByText(W.thisSet).count()) > 0, 'Also include marks the set’s paper');
const s5Pick = exp.getByRole('checkbox', { name: /S5 Final Paper 1/ });
check(!(await s5Pick.isChecked()), 'an unrelated paper stays unticked');
await shot('export-also-include');
await page.keyboard.press('Escape');
await home();

// 7. Duplicate Paper 1: the copy leaves the set.
await cardMenu(P1).click();
await menuItem(W.duplicate).click();
const copyTitle = `${P1}${W.copySuffix}`;
await page.getByText(copyTitle).first().waitFor();
const inFrame = await page.locator('[data-paper-set]').first().innerText();
check(!inFrame.includes(copyTitle), `the copy "${copyTitle}" is outside the set`);
await shot('after-duplicate');

// 8. Rename the set, then ungroup it.
await page.getByRole('button', { name: W.setActions(SET), exact: true }).click();
await menuItem(W.renameSet).click();
await page.getByRole('dialog').getByRole('textbox').fill('S6 Mock 2026-27 (Feb)');
await page.getByRole('dialog').getByRole('button', { name: W.rename, exact: true }).click();
await page.getByText('S6 Mock 2026-27 (Feb)').first().waitFor();
check(true, 'the set is renamed');
await page.reload({ waitUntil: 'networkidle' });
await page.locator('[data-paper-set]').first().waitFor();
check((await page.locator('[data-paper-set]').first().innerText()).includes('S6 Mock 2026-27 (Feb)'), 'the set survives a reload');
await page.getByRole('button', { name: W.setActions('S6 Mock 2026-27 (Feb)'), exact: true }).click();
await menuItem(W.ungroup).click();
await page.waitForTimeout(600);
check((await page.locator('[data-paper-set]').count()) === 0, 'Ungroup removes the frame');

await browser.close();
console.log(failures.length === 0 ? `\nall checks pass (${tag})` : `\n${failures.length} failed (${tag})`);
process.exit(failures.length === 0 ? 0 : 1);
