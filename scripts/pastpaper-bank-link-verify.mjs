import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';

/**
 * A past-paper copy and the teacher's 題庫 (k-0559), in a real browser against the live built-in
 * Past paper bank. Copies put into a worksheet carry `lineage.pastPaper` and stay out of the 題庫
 * until edited; editing in and undoing out; copies from older builds (no mark) show, and
 * Settings → Past paper bank → "Past paper questions in my bank" takes them out (adds the mark only).
 *
 *   node scripts/pastpaper-bank-link-verify.mjs <out-dir> [--port=3000]
 *
 * The 題庫 count is the Question bank screen's header, "N questions · M worksheets".
 */

const args = process.argv.slice(2);
const OUT = args.find((a) => !a.startsWith('--')) ?? '/tmp/pastpaper-bank-link-verify';
const port = args.find((a) => a.startsWith('--port='))?.slice(7) ?? '3000';
const URL = `http://localhost:${port}`;
mkdirSync(OUT, { recursive: true });

let failures = 0;
let checks = 0;
const check = (ok, what, detail = '') => {
  checks += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failures += 1;
};

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const page = await context.newPage();
page.on('pageerror', (e) => console.log('PAGE ERR:', e.message));
page.on('dialog', (d) => void d.accept());

const lang = (l) =>
  page.evaluate((v) => localStorage.setItem('econgen.settings.language', JSON.stringify(v === 'zh' ? { v: 1, ui: 'zh-HK', paper: 'zh' } : { v: 1, ui: 'en', paper: 'en' })), l);
const shot = (name, p = page) => p.screenshot({ path: `${OUT}/${name}.png` });
const SAVE_WAIT = 2500;

/** Documents as saved: { id: worksheet JSON } */
const docs = (p = page) =>
  p.evaluate(() => {
    const out = {};
    for (const k of Object.keys(localStorage)) if (k.startsWith('econ-worksheet:')) out[k.slice(15)] = JSON.parse(localStorage.getItem(k));
    return out;
  });
const plain = (questions) => JSON.stringify(questions, (key, value) => (key === 'lineage' ? undefined : value));

/** The 題庫 count: the Question bank screen's header, “N questions · M worksheets”. */
async function bankCount(p = page, { search } = {}) {
  await p.goto(URL);
  await p.getByRole('button', { name: /Question bank 題庫/ }).first().click();
  await p.waitForFunction(() => /\d+\s(questions?|條題目)[^\n]{0,6}\d+\s(worksheets?|份)/.test(document.body.innerText), undefined, { timeout: 30_000 }).catch(async (e) => { console.log(JSON.stringify(await p.evaluate(() => document.body.innerText.slice(0, 160)))); await p.screenshot({ path: OUT + '/debug.png' }); throw e; });
  await p.waitForTimeout(3500);
  const text = await p.evaluate(() => /\d+\s(questions?|條題目)[^\n]{0,6}\d+\s(worksheets?|份)[^\n]*/.exec(document.body.innerText)?.[0] ?? '');
  const n = Number(/(\d+)\s+questions?/.exec(text)?.[1] ?? /(\d+)\s*條題目/.exec(text)?.[1]);
  if (search) {
    const box = p.getByPlaceholder(/Search every question/);
    await box.fill(search);
    await p.waitForTimeout(1500);
  }
  return n;
}

const openSettingsSection = async () => {
  await page.goto(URL);
  await page.getByRole('button', { name: /Settings|設定/ }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByText(/^(Past paper bank|歷屆試題庫)$/).first().click();
  await page.locator('[data-old-copies]').waitFor({ timeout: 30_000 });
  await page.locator('[data-old-copies]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
};

// ---- 1. a teacher's own worksheet, then the bank before ----
await page.goto(URL);
await lang('en');
await page.goto(URL);
await page.getByRole('button', { name: /Open a sample paper/ }).first().click();
await page.waitForTimeout(SAVE_WAIT + 1500);
// The sample is bankHidden; clear that so its 4 questions stand in for the teacher's own writing.
await page.goto(URL);
await page.evaluate(() => {
  function bump(d) {
    // The bank caches rows by the document's updatedAt: a hand edit must move it, as a save does.
    const at = new Date(Date.now() + 1000).toISOString();
    d.updatedAt = at;
    const idx = JSON.parse(localStorage.getItem('econ-worksheet-index') ?? '[]');
    for (const row of idx) if (row.id === d.id) row.updatedAt = at;
    localStorage.setItem('econ-worksheet-index', JSON.stringify(idx));
  }
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('econ-worksheet:')) continue;
    const d = JSON.parse(localStorage.getItem(k));
    d.bankHidden = false;
    bump(d);
    localStorage.setItem(k, JSON.stringify(d));
  }
});
const A = await bankCount();
await shot('01-bank-before');
check(A > 0, `1. the 題庫 holds the teacher's own questions (A = ${A})`);

// ---- 2. import two ways ----
// (a) the editor's 題庫 tab -> Past papers -> Insert on two cards
await page.goto(URL);
await page.getByRole('button', { name: 'New worksheet' }).first().click();
await page.getByPlaceholder(/Demand and supply quiz/).fill('Imports A');
await page.getByRole('button', { name: 'Create worksheet' }).click();
await page.getByRole('tab', { name: /題庫/ }).click({ timeout: 30_000 });
await page.getByRole('radio', { name: 'Past papers' }).click();
const cards = page.locator('[data-pastpaper-tab] article');
await cards.first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);
for (const i of [0, 1]) {
  await cards.nth(i).getByRole('button', { name: 'Insert', exact: true }).click();
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(SAVE_WAIT);
await shot('02-worksheet-with-past-papers');
let all = await docs();
const docA = Object.entries(all).find(([, d]) => JSON.stringify(d.questions).includes('pastPaper'));
check(docA && docA[1].questions.length === 2, `2a. the worksheet holds the 2 inserted questions (${docA?.[1].questions.length})`);
check(docA?.[1].questions.every((q) => /^(DSE|CE|AL)/.test(q.lineage?.pastPaper?.tag ?? '') && q.lineage?.pastPaper?.key), `2a. each has lineage.pastPaper (${docA?.[1].questions.map((q) => q.lineage?.pastPaper?.tag).join(', ')})`);

// (b) the Past paper bank screen -> tick two -> Add (a new worksheet)
const before = new Set(Object.keys(all));
await page.goto(URL);
await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
await page.locator('[data-pastpaper-screen] nav [data-pastpaper-topic]').first().waitFor({ timeout: 90_000 });
await page.locator('[data-pastpaper-screen] nav [data-pastpaper-topic]').nth(6).click();
await page.locator('[data-pastpaper-screen] article').first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);
const boxes = page.locator('[data-pastpaper-screen] article input[type=checkbox]');
await boxes.nth(0).check();
await boxes.nth(1).check();
await page.getByRole('button', { name: 'Add', exact: true }).click();
await page.locator('#print-root, [data-page]').first().waitFor({ timeout: 30_000 }).catch(async (e) => { await p.screenshot({ path: OUT + '/debug.png' }); throw e; });
await page.waitForTimeout(SAVE_WAIT + 1500);
all = await docs();
const newIds = Object.keys(all).filter((id) => !before.has(id));
const docB = newIds.length === 1 ? all[newIds[0]] : undefined;
check(docB !== undefined && docB.questions.length >= 2, `2b. the screen made a new worksheet with ${docB?.questions.length} questions`);
check(docB?.questions.every((q) => /^(DSE|CE|AL)/.test(q.lineage?.pastPaper?.tag ?? '') && q.lineage?.pastPaper?.key), `2b. each has lineage.pastPaper (${docB?.questions.map((q) => q.lineage?.pastPaper?.tag).join(', ')})`);
await shot('02b-worksheet-from-bank-screen');
const imported = (docA?.[1].questions.length ?? 0) + (docB?.questions.length ?? 0);

// ---- 3. the 題庫 is unchanged ----
const A3 = await bankCount();
await shot('03-bank-after-import');
check(A3 === A, `3. the 題庫 still holds ${A} after ${imported} past paper questions went into worksheets (${A3})`);

// ---- 4. edit one imported question ----
await page.goto(URL);
await page.getByText('Imports A', { exact: true }).first().click();
await page.locator('#print-root').waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
const NEW = 'ZQXMARKER wording';
const stem = page.locator('#print-root').getByText(/positive statement|Which of the following/).first();
await stem.click();
await page.keyboard.press('End');
await page.keyboard.type(` ${NEW}`);
await page.waitForTimeout(SAVE_WAIT + 1000);
all = await docs();
const editedDoc = all[docA[0]];
check(JSON.stringify(editedDoc.questions).includes('ZQXMARKER'), 'saved document holds the new words');
const A4 = await bankCount(page, { search: 'ZQXMARKER' });
await shot('04-bank-after-edit');
check(A4 === A + 1, `4. the 題庫 now holds ${A + 1}: the edited question (${A4})`);
const hits = await page.getByText(/ZQXMARKER/).count();
check(hits >= 1, `4. the edited question is found by its new words (${hits} hit)`);
const A4b = await bankCount();

// ---- 5. older builds: no mark ----
await page.goto(URL);
await page.waitForTimeout(1500);
const unmarked = await page.evaluate(() => {
  function bump(d) {
    // The bank caches rows by the document's updatedAt: a hand edit must move it, as a save does.
    const at = new Date(Date.now() + 1000).toISOString();
    d.updatedAt = at;
    const idx = JSON.parse(localStorage.getItem('econ-worksheet-index') ?? '[]');
    for (const row of idx) if (row.id === d.id) row.updatedAt = at;
    localStorage.setItem('econ-worksheet-index', JSON.stringify(idx));
  }
  let n = 0;
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('econ-worksheet:')) continue;
    const d = JSON.parse(localStorage.getItem(k));
    let touched = false;
    for (const q of d.questions) if (q.lineage?.pastPaper) { delete q.lineage.pastPaper; touched = true; n += 1; }
    if (touched) { bump(d); localStorage.setItem(k, JSON.stringify(d)); }
  }
  return n;
});
const B = await bankCount();
await shot('05-bank-old-copies');
check(B > A4b, `5. with the marks stripped (${unmarked} questions) the 題庫 shows them: B = ${B} (> ${A4b})`);

// ---- 6. Settings: find them ----
const beforeDocs = await docs();
const byId = (o) => Object.keys(o).sort().map((id) => o[id].questions);
const beforeClean = plain(byId(beforeDocs));
await openSettingsSection();
await page.locator('[data-old-copies-find]').click();
await page.locator('[data-old-copies-found], [data-old-copies-none], [role="alert"]').first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(500);
const foundAttr = await page.locator('[data-old-copies-found]').getAttribute('data-old-copies-found').catch(() => null);
const foundNum = Number(foundAttr);
await page.locator('[data-old-copies]').scrollIntoViewIfNeeded();
await shot('06-settings-found-en');
console.log(`found text: ${(await page.locator('[data-old-copies]').innerText()).replace(/\n+/g, ' / ')}`);
check(foundNum === B - A4b, `6. Find them lists ${foundNum}, = B - (A+1) = ${B - A4b}`);
await page.locator('[data-old-copies-take-out]').click();
await page.locator('[data-old-copies-confirm]').waitFor();
await page.locator('[data-old-copies]').scrollIntoViewIfNeeded();
await shot('07-settings-confirm-en');
await page.locator('[data-old-copies-confirm]').click();
await page.locator('[data-old-copies-done]').waitFor({ timeout: 30_000 }).catch(async (e) => { await p.screenshot({ path: OUT + '/debug.png' }); throw e; });
await shot('08-settings-done-en');
const doneText = await page.locator('[data-old-copies-done]').innerText();
check(new RegExp(`${foundNum}\\b`).test(doneText), `6. the result line says: ${doneText.replace(/\n/g, ' ')}`);

// ---- 7. the 題庫 afterwards; worksheets untouched ----
const afterById = await docs();
const afterDocs = Object.values(afterById);
const A7 = await bankCount();
await shot('09-bank-after-cleanup');
check(A7 === A4b, `7. the 題庫 is back to ${A4b}: only the edited question (${A7})`);
const afterClean = plain(byId(afterById));
let where = '';
if (afterClean !== beforeClean) {
  let i = 0;
  while (afterClean[i] === beforeClean[i]) i += 1;
  where = `first difference at ${i}: before ...${beforeClean.slice(Math.max(0, i - 60), i + 80)} | after ...${afterClean.slice(Math.max(0, i - 60), i + 80)}; docs before ${Object.keys(beforeDocs).length} after ${afterDocs.length}`;
}
check(afterClean === beforeClean, '7. every worksheet has the same questions and text as before the clean-up (lineage aside)', where);
const nowMarked = afterDocs.flatMap((d) => d.questions).filter((q) => q.lineage?.pastPaper).length;
check(nowMarked === foundNum, `7. the clean-up only added the mark: ${nowMarked} questions marked`);

// ---- 8. again: none ----
await openSettingsSection();
await page.locator('[data-old-copies-find]').click();
await page.locator('[data-old-copies-none]').waitFor({ timeout: 90_000 });
await shot('08b-settings-none-en');
check(true, '8. Find them again: none');

// ---- 9. 中文 ----
await page.goto(URL);
await lang('zh');
await page.evaluate(() => {
  function bump(d) {
    // The bank caches rows by the document's updatedAt: a hand edit must move it, as a save does.
    const at = new Date(Date.now() + 1000).toISOString();
    d.updatedAt = at;
    const idx = JSON.parse(localStorage.getItem('econ-worksheet-index') ?? '[]');
    for (const row of idx) if (row.id === d.id) row.updatedAt = at;
    localStorage.setItem('econ-worksheet-index', JSON.stringify(idx));
  }
  for (const k of Object.keys(localStorage)) {
    if (!k.startsWith('econ-worksheet:')) continue;
    const d = JSON.parse(localStorage.getItem(k));
    let touched = false;
    for (const q of d.questions) if (q.lineage?.pastPaper) { delete q.lineage.pastPaper; touched = true; }
    if (touched) { bump(d); localStorage.setItem(k, JSON.stringify(d)); }
  }
});
await openSettingsSection();
await page.locator('[data-old-copies-find]').click();
await page.locator('[data-old-copies-found], [data-old-copies-none]').first().waitFor({ timeout: 90_000 });
const zhFound = Number(await page.locator('[data-old-copies-found]').getAttribute('data-old-copies-found').catch(() => 0));
await page.locator('[data-old-copies]').scrollIntoViewIfNeeded();
await shot('10-settings-found-zh');
const zhText = await page.locator('[data-old-copies]').innerText();
console.log(`zh text: ${zhText.replace(/\n+/g, ' / ')}`);
check(zhFound > 0 && /我的題庫中的歷屆試題/.test(zhText) && /尋找|未修改/.test(zhText), `9. 中文: found ${zhFound}, the section reads in 中文`);
await page.locator('[data-old-copies-take-out]').click();
await page.locator('[data-old-copies-confirm]').waitFor();
await page.locator('[data-old-copies]').scrollIntoViewIfNeeded();
await shot('11-settings-confirm-zh');
check((await page.locator('[data-old-copies-confirm]').innerText()).trim() === '移出', '9. 中文: the confirm button reads 移出');
await page.getByRole('button', { name: '取消' }).last().click();
await lang('en');

// ---- 10. undo ----
const page2 = await context.newPage();
page2.on('pageerror', (e) => console.log('PAGE2 ERR:', e.message));
await page.goto(URL);
await page.getByRole('button', { name: 'New worksheet' }).first().click();
await page.getByPlaceholder(/Demand and supply quiz/).fill('Undo check');
await page.getByRole('button', { name: 'Create worksheet' }).click();
await page.getByRole('tab', { name: /題庫/ }).click({ timeout: 30_000 });
await page.getByRole('radio', { name: 'Past papers' }).click();
await page.locator('[data-pastpaper-tab] article').first().waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);
await page.locator('[data-pastpaper-tab] article').nth(2).getByRole('button', { name: 'Insert', exact: true }).click();
await page.waitForTimeout(SAVE_WAIT);
const base = await bankCount(page2);
const q = page.locator('#print-root').getByText(/\S{4,}/).filter({ hasNotText: /Answer ALL|Section/ }).first();
await q.click();
await page.keyboard.press('End');
await page.keyboard.type(' UNDOWORDS');
await page.waitForTimeout(SAVE_WAIT + 1000);
const edited = await bankCount(page2);
check(edited === base + 1, `10. editing an inserted question puts it in the 題庫 (${base} -> ${edited})`);
for (let i = 0; i < 10; i += 1) {
  const text = await page.locator('#print-root').innerText();
  if (!text.includes('UNDOWORDS')) break;
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(300);
}
await page.waitForTimeout(SAVE_WAIT + 1000);
await shot('12-editor-after-undo');
check(!(await page.locator('#print-root').innerText()).includes('UNDOWORDS'), '10. undo took the new words out');
const undone = await bankCount(page2);
check(undone === base, `10. undone back to the original words, it leaves the 題庫 again (${undone})`);

console.log(`A = ${A}, A+1 = ${A4}, B = ${B}, found = ${foundNum}`);
await browser.close();
console.log(`${checks} checks, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
