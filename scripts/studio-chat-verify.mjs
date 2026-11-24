import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { startMockServer } from './ai-mock-server.mjs';
import { check, configure, expect, newPage, results, startBankServer } from './studio-verify-kit.mjs';

/**
 * The chat Question studio's browser run (k-0516): the welcome, picking a past-paper question
 * (with its diagram) as the reference, the AI's steps (read, picked key point, write, check),
 * the drafts on the paper, Accept / Reject, Side by side with "What changed", changing the
 * pick (Rewrite them / Keep them), "Make draft 2 harder" (v2 · v1), Add into a new worksheet,
 * saved chats across a reload, ✦ Write like this from the Past paper bank (starts at once),
 * the Trial kit in Settings → AI, and the 中文 interface. Nothing real is reached: the AI is
 * `ai-mock-server.mjs`, the Past paper bank an invented export served from here.
 *
 *   npm run dev -- -p 3216
 *   node scripts/studio-chat-verify.mjs [--url=http://localhost:3216] [--out=/tmp/studio-chat] [--mock-port=8821] [--bank-port=8822]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3216');
const OUT = opt('out', '/tmp/studio-chat');
const MOCK_PORT = Number(opt('mock-port', '8821'));
const BANK_PORT = Number(opt('bank-port', '8822'));
const MOCK = `http://localhost:${MOCK_PORT}`;
const BANK = `http://localhost:${BANK_PORT}/`;
mkdirSync(OUT, { recursive: true });
configure({ mock: MOCK, bank: BANK });

const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });
const drafts = (page) => page.locator('[data-chat-draft]');

async function openStudio(page, row = /Question studio 擬題工作室/) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: row }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}

async function pickReference(page) {
  await page.locator('[data-start-pick], [data-add-reference]').first().click();
  const card = page.locator('[data-reference-picker] [data-reference-card]', { hasText: 'DSE2099/P1/Q12' }).first();
  await card.waitFor({ timeout: 30_000 });
  return card;
}

// ---- the run ----

const bankServer = await startBankServer(BANK_PORT);
const mockServer = await startMockServer(MOCK_PORT);
const browser = await chromium.launch({ channel: 'chrome' });

try {
  const { context, page, leaks, errors, state } = await newPage(browser, { slow: 1800 });
  await openStudio(page);

  await check('the studio opens on a chat: welcome, no topic picker, no form', async () => {
    await page.locator('[data-chat-welcome]').waitFor();
    expect((await page.locator('select#studio-key-point, [data-studio-key-point]').count()) === 0, 'a key-point picker is on the screen');
    expect((await page.getByText('Trial kit', { exact: true }).count()) === 0, 'the Trial kit tab is still on the studio');
  });

  await check('Pick a past-paper question: the picker draws questions as they print, with their diagram', async () => {
    const card = await pickReference(page);
    // The cards draw their pages as they come into view.
    await page.locator('[data-reference-picker] img').first().waitFor();
    expect((await page.locator('[data-reference-picker] img').count()) > 0, 'no diagram drawn in the picker');
    await card.click();
    await shot(page, 'A1-picker');
    await page.getByRole('button', { name: 'Use as reference' }).click();
    await page.locator('[data-ref-chip]').waitFor();
    // k-0528 (u-5ev0): nothing is typed into the box; the placeholder says Send writes N like this.
    const input = page.locator('[data-chat-input]');
    expect((await input.inputValue()) === '', `the box was filled in: "${await input.inputValue()}"`);
    expect((await input.getAttribute('placeholder')).includes('like this'), 'the placeholder does not say what Send does');
    expect(await input.evaluate((el) => el === document.activeElement), 'the caret is not in the box');
    expect(await page.locator('[data-chat-send]').isEnabled(), 'Send is off with a reference and an empty box');
    await shot(page, 'k0528-empty-box-with-reference');
  });

  await check('k-0528: the ⚙ popover closes on a press outside, Esc, focus leaving; its button toggles; a choice keeps it open', async () => {
    const button = page.locator('[data-chat-settings]');
    const pop = page.locator('[data-chat-settings-pop]');
    const open = async () => {
      await button.click();
      await pop.waitFor();
    };
    const closed = async (why) => {
      await pop.waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
      expect((await pop.count()) === 0, `still open after ${why}`);
    };
    await open();
    await pop.getByRole('button', { name: '5', exact: true }).click();
    await pop.getByRole('button', { name: 'Harder', exact: true }).click();
    expect(await pop.isVisible(), 'a choice closed it');
    await shot(page, 'k0528-options-open');
    await pop.getByRole('button', { name: '3', exact: true }).click();
    await pop.getByRole('button', { name: 'Same', exact: true }).click();
    // Blank space in the chat column.
    const log = await page.locator('[data-chat-column] [role="log"]').boundingBox();
    // Between the welcome and the popover (the popover sits over the log's lower part).
    await page.mouse.click(log.x + log.width / 2, log.y + log.height * 0.45);
    await closed('a click on blank space');
    await open();
    await page.locator('[data-chat-input]').click();
    await closed('a click in the message box');
    await open();
    await page.locator('[data-chat-canvas]').click({ position: { x: 30, y: 200 } });
    await closed('a click on the paper side');
    await open();
    await pop.getByRole('button', { name: '3', exact: true }).focus();
    await page.keyboard.press('Escape');
    await closed('Esc');
    expect(await button.evaluate((el) => el === document.activeElement), 'Esc did not give focus back to ⚙');
    await open();
    await button.click();
    await closed('a second click on ⚙');
    await open();
    await pop.getByRole('button', { name: 'Both', exact: true }).focus();
    await page.keyboard.press('Shift+Tab');
    expect(await pop.isVisible(), 'Shift+Tab within it closed it');
    await page.locator('[data-chat-input]').focus();
    await closed('focus moving to the box');
    expect((await button.textContent()).includes('3 · Same level · English'), `settings now ${await button.textContent()}`);
  });

  await check('Send: the AI reads the reference, picks the key point itself, and writes (steps in the chat, drafts on the paper)', async () => {
    await page.locator('[data-chat-send]').click();
    await page.locator('[data-step="pick"][data-state="done"]').waitFor();
    await page.waitForTimeout(400);
    await shot(page, 'A2-writing');
    // The words land on the paper before the checks finish (a custom server sends each draft whole; Gemini and the others word by word).
    await page.locator('[data-chat-draft]').first().waitFor({ timeout: 40_000 });
    expect(await page.locator('[data-chat-stop]').isVisible(), 'the drafts only showed once the run had ended');
    await shot(page, 'A2b-words-arrive');
    const picked = await page.locator('[data-pick]').first().getAttribute('data-pick');
    expect(picked === 'C.ped', `picked ${picked}`);
    await drafts(page).nth(2).waitFor({ timeout: 40_000 });
    await page.locator('[data-chat-send]').waitFor();
    return `picked ${picked}`;
  });

  await check('Accept and Reject on each draft; the tray counts what is accepted', async () => {
    await drafts(page).nth(0).locator('[data-accept]').click();
    await drafts(page).nth(1).locator('[data-accept]').click();
    await page.locator('[data-studio-tray]').waitFor();
    await page.locator('[data-chat-canvas] .scroll-slim').evaluate((el) => el.scrollTo(0, 0));
    await shot(page, 'A3-drafts');
    expect((await page.locator('[data-chat-draft][data-state="accepted"]').count()) === 2, 'not two accepted');
  });

  await check('Side by side: the reference (with its diagram) beside each draft, and What changed from the reference', async () => {
    await page.locator('[data-view-button="compare"]').click();
    await page.locator('[data-compare-reference]').waitFor();
    expect((await page.locator('[data-compare-reference] img').count()) > 0, 'the reference is drawn without its diagram');
    expect((await page.locator('[data-changed]').count()) >= 2, 'no What changed lists');
    await shot(page, 'A4-side-by-side');
    await page.locator('[data-view-button="paper"]').click();
  });

  await check('k-0528: the Change key point menu closes on a press outside and on Esc (focus back to Change)', async () => {
    const change = page.locator('[data-pick-change]').last();
    await change.click();
    await page.locator('[data-pick-menu]').waitFor();
    await page.locator('[data-chat-canvas]').click({ position: { x: 30, y: 200 } });
    await page.locator('[data-pick-menu]').waitFor({ state: 'detached', timeout: 2000 });
    await change.click();
    await page.locator('[data-pick-menu]').waitFor();
    await page.keyboard.press('Escape');
    await page.locator('[data-pick-menu]').waitFor({ state: 'detached', timeout: 2000 });
    expect(await change.evaluate((el) => el === document.activeElement), 'Esc did not give focus back to Change');
  });

  await check('k-0528: Ask about this has a line icon, no emoji', async () => {
    const ask = drafts(page).first().locator('[data-ask]');
    expect((await ask.locator('svg').count()) === 1, 'no icon');
    expect(!/\p{Extended_Pictographic}/u.test(await ask.textContent()), `emoji left: ${await ask.textContent()}`);
    await drafts(page).first().scrollIntoViewIfNeeded();
    await shot(page, 'k0528-ask-icon');
  });

  await check('Change the pick (never required): it asks Rewrite them / Keep them; Keep writes nothing', async () => {
    await page.locator('[data-pick-change]').last().click();
    await page.locator('[data-pick-menu] button').nth(1).click();
    await page.locator('[data-chat-ask]').waitFor();
    await shot(page, 'A5-change-pick');
    await page.getByRole('button', { name: 'Keep them' }).click();
    await page.getByText('Kept them as they are.').waitFor();
  });

  await check('"Make draft 3 harder": that draft changes in place, v2 · v1, the others stay', async () => {
    const third = drafts(page).nth(2);
    await third.locator('button', { hasText: 'Harder' }).click();
    await page.locator('[data-chat-draft="3"] [data-version-button="2"]').waitFor({ timeout: 40_000 });
    await page.locator('[data-chat-send]').waitFor();
    await page.locator('[data-chat-draft="3"]').scrollIntoViewIfNeeded();
    await shot(page, 'A6-harder-v2');
    expect((await drafts(page).count()) === 3, 'the batch changed size');
  });

  await check('Add: the accepted drafts go into a new worksheet, AI-made', async () => {
    state.slow = 0;
    await page.locator('[data-studio-tray] button', { hasText: /^Add$/ }).click();
    await page.locator('[data-testid="ai-made-chip"]').first().waitFor({ timeout: 20_000 });
    await shot(page, 'A10-added-in-worksheet');
  });

  await check('saved chats: the chat comes back after a reload, from Chats ▾', async () => {
    await page.reload({ waitUntil: 'networkidle' });
    await openStudio(page);
    await page.locator('[data-chats-menu]').click();
    await page.locator('[data-chats-list] [role="menuitem"]').first().waitFor();
    await shot(page, 'A7-chats');
    // k-0528: Esc and a press outside close it too.
    await page.keyboard.press('Escape');
    await page.locator('[data-chats-list]').waitFor({ state: 'detached', timeout: 2000 });
    expect(await page.locator('[data-chats-menu]').evaluate((el) => el === document.activeElement), 'Esc did not give focus back to Chats');
    await page.locator('[data-chats-menu]').click();
    await page.locator('[data-chat-canvas]').click({ position: { x: 30, y: 200 } });
    await page.locator('[data-chats-list]').waitFor({ state: 'detached', timeout: 2000 });
    await page.locator('[data-chats-menu]').click();
    await page.locator('[data-chats-list] [role="menuitem"]').first().click();
    await drafts(page).first().waitFor();
    expect((await page.locator('[data-chat-draft][data-state="added"]').count()) === 2, 'the added drafts are not marked Added');
  });

  await check('✦ Write like this in the Past paper bank opens a new chat and starts at once (no form)', async () => {
    state.slow = 800;
    await page.locator('[data-studio-screen] button', { hasText: /^← Home$/ }).click();
    await page.getByRole('button', { name: /Past paper bank 歷屆試題庫/ }).first().click();
    await page.locator('[data-pastpaper-card] [data-write-like]').first().click();
    await page.locator('[data-studio-screen]').waitFor();
    await page.locator('[data-chat-ai]').first().waitFor();
    await drafts(page).nth(2).waitFor({ timeout: 40_000 });
    expect((await page.locator('[data-chat-user]').count()) === 1, 'not a fresh chat');
  });

  await check('the Trial kit is in Settings → AI', async () => {
    await page.locator('[data-studio-screen] [data-settings-gear]').first().click();
    await page.getByText('AI & translation', { exact: true }).first().click();
    await page.locator('[data-studio-trial-block]').waitFor();
    await shot(page, 'A8-settings-trial');
    await page.locator('[data-studio-trial-block] button', { hasText: 'Open the trial kit' }).click();
    await page.locator('[data-studio-trial]').first().waitFor();
    await page.waitForTimeout(2500);
    await shot(page, 'A8b-trial-kit');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  });

  await check('nothing reached a real provider, and no errors', async () => {
    expect(leaks.length === 0, `reached ${leaks[0]}`);
    expect(errors.length === 0, errors[0]);
  });
  await context.close();

  // u-na4k: in a short window the picker's topic list (and the year list) scroll on their own,
  // inside the dialog, so the last topic can be reached by wheel and by keyboard.
  const short = await newPage(browser, { viewport: { width: 1280, height: 560 }, bank: `${BANK}big/` });
  await check('a short window: the picker’s topics scroll inside the dialog, the last one reachable (wheel, keyboard); the years too', async () => {
    await openStudio(short.page);
    await short.page.locator('[data-start-pick]').click();
    const rail = short.page.locator('[data-reference-rail]');
    await rail.locator('[data-pastpaper-topics]').waitFor({ timeout: 30_000 });
    await rail.getByRole('button', { name: 'Open all' }).click();
    const last = rail.getByRole('button', { name: /Topic J4/ });
    await last.waitFor({ state: 'attached' });
    const fits = async (locator) => {
      const box = await locator.boundingBox();
      const frame = await rail.boundingBox();
      return box !== null && frame !== null && box.y >= frame.y - 1 && box.y + box.height <= frame.y + frame.height + 1;
    };
    expect(!(await fits(last)), 'the list is not longer than the window: nothing proven');
    const list = rail.locator('[data-pastpaper-topics] .overflow-y-auto').first();
    const frame = await list.boundingBox();
    await short.page.mouse.move(frame.x + frame.width / 2, frame.y + frame.height / 2);
    for (let i = 0; i < 30 && !(await fits(last)); i += 1) {
      await short.page.mouse.wheel(0, 400);
      await short.page.waitForTimeout(80);
    }
    expect(await fits(last), 'the wheel never brought Topic J4 into view');
    await shot(short.page, 'A11-picker-short-window');
    // The keyboard: back to the top, then Tab through the rows to the last one.
    await list.evaluate((el) => el.scrollTo(0, 0));
    await rail.getByRole('button', { name: /Topic J3/ }).focus();
    await short.page.keyboard.press('Tab');
    const focused = await short.page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(/Topic J4/.test(focused), `focus went to ${focused}`);
    expect(await fits(last), 'the focused last topic is out of view');
    await last.click();
    // By year: the same rail, its list scrolls within the dialog too.
    await rail.locator('[data-pastpaper-view-switch] button', { hasText: 'By year' }).click();
    const years = rail.locator('[data-pastpaper-years] .overflow-y-auto').first();
    await years.waitFor();
    const yearsBox = await years.boundingBox();
    const railBox = await rail.boundingBox();
    expect(yearsBox.y + yearsBox.height <= railBox.y + railBox.height + 1, 'the year list runs past the dialog');
    const scrolls = await years.evaluate((el) => el.scrollHeight > el.clientHeight);
    if (scrolls) {
      await years.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await shot(short.page, 'A11b-years-short-window');
    }
    expect(short.errors.length === 0, short.errors[0]);
    return scrolls ? 'years scroll too' : 'years fit';
  });
  await short.context.close();

  // k-0530: the teacher edits a draft by hand (words, key, diagram), with no AI call; every version is in a drop list.
  for (const ui of ['en', 'zh-HK']) {
    const k = await newPage(browser, ui === 'en' ? {} : { ui });
    const en = ui === 'en';
    await check(`k-0530 (${ui}): Edit a draft by hand (words, key, diagram): no AI call, a new version, Undo edit, the version list`, async () => {
      await openStudio(k.page, en ? undefined : /擬題工作室/);
      const card = await pickReference(k.page);
      await card.dblclick();
      await k.page.locator('[data-ref-chip]').waitFor();
      await k.page.locator('[data-chat-send]').click();
      await k.page.locator('[data-chat-draft]').nth(2).waitFor({ timeout: 40_000 });
      await k.page.locator('[data-chat-send]').waitFor({ timeout: 60_000 });
      const draft = k.page.locator('[data-chat-draft="1"]');
      // Every request to the AI from here on is counted: an edit must make none.
      let aiCalls = 0;
      k.page.on('request', (r) => {
        if (r.url().startsWith(MOCK)) aiCalls += 1;
      });
      await draft.locator('[data-edit]').click();
      const form = draft.locator('[data-draft-editor]');
      await form.waitFor();
      await draft.scrollIntoViewIfNeeded();
      await shot(k.page, `k0530-${ui}-edit-form`);
      // The stem's English box (the editor's own rich-text field).
      const stem = form.locator('[data-panel-side="en"] [contenteditable="true"]').first();
      await stem.click();
      await k.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      const mine = en ? 'A bakery raises the price of a loaf from $20 to $25 and sells 300 loaves a day instead of 400. Demand for the bread is' : 'A bakery raises the price of a loaf from $20 to $25. Demand is';
      await k.page.keyboard.type(mine);
      // The key: a letter that is not the AI's key, then Undo (back to the AI's), then that letter again.
      const aiKey = Number(await form.getAttribute('data-answer'));
      const pick = ['A', 'B', 'C', 'D'][(aiKey + 1) % 4];
      await form.locator(`[data-edit-key="${pick}"]`).check();
      await form.locator('[data-edit-undo]').click();
      let undone = false;
      for (let i = 0; i < 20 && !undone; i += 1) {
        undone = Number(await form.getAttribute('data-answer')) === aiKey;
        if (!undone) await k.page.waitForTimeout(100);
      }
      expect(undone, `Undo did not take the key back to the AI's (${await form.getAttribute('data-answer')} ≠ ${aiKey})`);
      await form.locator(`[data-edit-key="${pick}"]`).check();
      // The diagram: open it in the worksheet's diagram editor, clear it, Done.
      const fig = form.locator('[data-edit-diagram-preview] svg');
      const before = await fig.locator('path, line, polyline').count();
      await form.locator('[data-edit-diagram-open]').click();
      const done = k.page.getByRole('button', { name: en ? 'Done' : '完成', exact: true });
      await done.waitFor();
      await shot(k.page, `k0530-${ui}-diagram-editor`);
      await k.page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
      await k.page.keyboard.press('Delete');
      await done.click();
      const after = await fig.locator('path, line, polyline').count();
      expect(after < before, `the diagram did not change (${before} → ${after})`);
      await form.locator('[data-edit-save]').click();
      await form.waitFor({ state: 'detached', timeout: 10_000 });
      expect(aiCalls === 0, `the edit called the AI ${aiCalls} time(s)`);
      await draft.scrollIntoViewIfNeeded();
      await shot(k.page, `k0530-${ui}-edited-card`);
      const flat = async () => ((await draft.textContent()) ?? '').replace(/\s+/g, ' ');
      const text = await flat();
      // The question is drawn in the sheet's own shadow root: a locator reaches it, textContent does not.
      const edited = () => draft.getByText('A bakery raises the price', { exact: false }).count();
      expect((await edited()) > 0, `the card does not show the edited stem: ${JSON.stringify(text.slice(0, 200))}`);
      expect(await draft.locator('[data-edited-chip]').isVisible(), 'no Edited chip');
      expect((await draft.locator('[data-version-button="2"]').count()) === 1, 'the edit is not version 2');
      expect(text.includes(en ? `Key ${pick}` : `答案 ${pick}`), `the key did not change to ${pick}`);
      const key = draft.locator('[data-check="key"]');
      expect((await key.getAttribute('data-state')) === 'skipped', `key check is ${await key.getAttribute('data-state')}, not "check again"`);
      await draft.scrollIntoViewIfNeeded();
      await shot(k.page, `k0530-${ui}-edited-card`);
      // The version list: newest first, the shown one ticked; picking v1 shows the AI's again, nothing renumbers.
      await draft.locator('[data-version-button]').click();
      const list = k.page.locator('[data-version-list]');
      await list.waitFor();
      const rows = await list.locator('[data-version-row]').evaluateAll((els) => els.map((e) => e.getAttribute('data-version-row')));
      expect(rows.join(',') === '2,1', `rows ${rows.join(',')}`);
      await shot(k.page, `k0530-${ui}-version-list`);
      await k.page.keyboard.press('Escape');
      await list.waitFor({ state: 'detached', timeout: 2000 });
      await draft.locator('[data-undo-edit]').click();
      expect((await draft.locator('[data-version-button="1"]').count()) === 1, 'Undo edit did not show version 1');
      expect((await edited()) === 0, 'version 1 still shows the edit');
      await draft.locator('[data-version-button]').click();
      await list.locator('[data-version-row="2"]').click();
      expect((await draft.locator('[data-version-button="2"]').count()) === 1, 'picking version 2 did not show it');
      // Add takes the version shown: accept it and add it into a new worksheet.
      expect(aiCalls === 0, `the version list called the AI ${aiCalls} time(s)`);
      await draft.locator('[data-accept]').click();
      await k.page.locator('[data-studio-tray] button', { hasText: en ? /^Add$/ : /^加入$/ }).click();
      await k.page.locator('#print-root').getByText('A bakery raises the price', { exact: false }).first().waitFor({ timeout: 20_000 });
      expect(k.errors.length === 0, k.errors[0]);
    });
    await k.context.close();
  }

  // k-0531: a draft with a table is drawn as a table; a near-copy is shown with a red warning, never left out.
  for (const ui of ['en', 'zh-HK']) {
    const k = await newPage(browser, ui === 'en' ? {} : { ui });
    await check(`k-0531 (${ui}): a table draft shows its table; a near-copy is a normal card with a red warning, nothing left out`, async () => {
      await openStudio(k.page, ui === 'en' ? undefined : /擬題工作室/);
      const card = await pickReference(k.page);
      await card.dblclick();
      await k.page.locator('[data-ref-chip]').waitFor();
      await k.page.locator('[data-chat-input]').fill('!table !copy');
      await k.page.locator('[data-chat-send]').click();
      await k.page.locator('[data-chat-draft]').nth(2).waitFor({ timeout: 40_000 });
      await k.page.locator('[data-chat-send]').waitFor({ timeout: 40_000 });
      const first = k.page.locator('[data-chat-draft="1"]');
      expect((await first.locator('table').count()) >= 1, 'the table draft has no table');
      const cells = await first.locator('table td, table th').allTextContents();
      expect(cells.some((c) => c.includes('85')), `table cells: ${cells.slice(0, 6).join(' / ')}`);
      expect(!(await first.innerText()).includes(' | '), 'pipes printed on the card');
      await first.scrollIntoViewIfNeeded();
      await shot(k.page, `k0531-${ui}-table-draft`);
      const warned = k.page.locator('[data-chat-draft][data-warned]');
      expect((await warned.count()) === 1, `${await warned.count()} warned drafts`);
      expect(await warned.locator('[data-draft-warning]').isVisible(), 'the warning is not shown');
      const warning = await warned.locator('[data-draft-warning]').innerText();
      expect(ui === 'en' ? /Too close to|word for word/.test(warning) : /太相似|一字不差/.test(warning), `warning: ${warning}`);
      expect(await warned.locator('[data-accept]').isVisible(), 'a warned draft cannot be accepted');
      expect((await k.page.locator('[data-left-out]').count()) === 0, 'a Left out list is still there');
      const note = await k.page.locator('[data-chat-ai]').last().innerText();
      expect(ui === 'en' ? /3 drafts are ready\..*1 has a warning/s.test(note) : /3 份草稿已完成.*1 份有警告/s.test(note), `note: ${note}`);
      await warned.scrollIntoViewIfNeeded();
      await shot(k.page, `k0531-${ui}-warned-draft`);
      await warned.locator('[data-accept]').click();
      expect((await warned.getAttribute('data-state')) === 'accepted', 'Accept did nothing on a warned draft');
      expect(k.errors.length === 0, k.errors[0]);
    });
    await k.context.close();
  }

  // 中文 interface: the same screen's words.
  const zh = await newPage(browser, { ui: 'zh-HK' });
  await check('中文: the studio in 繁體中文', async () => {
    await openStudio(zh.page, /擬題工作室/);
    await zh.page.locator('[data-chat-welcome]').waitFor();
    const card = await pickReference(zh.page);
    await card.dblclick();
    // k-0528: empty box + a reference; Send works and means "N like this".
    await zh.page.locator('[data-ref-chip]').waitFor();
    expect((await zh.page.locator('[data-chat-input]').inputValue()) === '', 'the box was filled in');
    await shot(zh.page, 'k0528-zh-empty-box-with-reference');
    await zh.page.locator('[data-chat-settings]').click();
    await zh.page.locator('[data-chat-settings-pop]').waitFor();
    await shot(zh.page, 'k0528-zh-options-open');
    await zh.page.locator('[data-chat-canvas]').click({ position: { x: 30, y: 200 } });
    await zh.page.locator('[data-chat-settings-pop]').waitFor({ state: 'detached', timeout: 2000 });
    await zh.page.locator('[data-chat-send]').click();
    await zh.page.locator('[data-chat-user]', { hasText: '仿照這題擬 3 題' }).waitFor();
    await zh.page.locator('[data-chat-draft]').nth(2).waitFor({ timeout: 40_000 });
    await zh.page.locator('[data-chat-send]').waitFor();
    await shot(zh.page, 'A9-zh');
    await zh.page.locator('[data-chat-draft]').first().scrollIntoViewIfNeeded();
    await shot(zh.page, 'k0528-zh-ask-icon');
    expect(zh.errors.length === 0, zh.errors[0]);
  });
  await zh.context.close();
} finally {
  await browser.close();
  bankServer.close();
  mockServer.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
