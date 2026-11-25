import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

/**
 * Saved chats' pictures kept outside localStorage, in a real browser (k-0551). Seeds chats as
 * the k-0545 build saved them (pictures inline) beside worksheets, near the ~5 MB limit, then:
 * the first load moves the pictures to IndexedDB and keeps every chat; a reload reads them
 * back; a picture no chat names is tidied at start; a save that does not fit raises a notice
 * in English and 中文, and the next save that fits takes it down.
 *
 *   npx next dev -p 3551
 *   node scripts/chat-pictures-verify.mjs [--url=http://localhost:3551] [--out=/tmp/k0551] [--chats=14]
 */

const args = process.argv.slice(2);
const opt = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const APP = opt('url', 'http://localhost:3551');
const OUT = opt('out', '/tmp/k0551');
const CHATS = Number(opt('chats', '14'));
mkdirSync(OUT, { recursive: true });

const CHATS_KEY = 'econgen.studioChats.v1';
const FILLER = 'k0551.filler';
const LIMIT = 5 * 1024 * 1024;

const results = [];
async function check(name, fn) {
  try {
    const note = await fn();
    results.push({ name, ok: true, note });
    console.log(`PASS ${name}${note ? ` (${note})` : ''}`);
  } catch (error) {
    results.push({ name, ok: false, note: String(error?.message ?? error) });
    console.log(`FAIL ${name}: ${error?.message ?? error}`);
  }
}
const expect = (cond, message) => {
  if (!cond) throw new Error(message);
};

/** A base64 picture of `length` characters, its bytes from `seed` (as large as a bank diagram). */
function picture(seed, length = 60_000) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let x = (seed * 2654435761) >>> 0;
  let body = '';
  for (let i = 0; i < length; i += 1) {
    x = (Math.imul(x, 1103515245) + 12345) >>> 0;
    body += alphabet[x >>> 26];
  }
  return `data:image/png;base64,${body}`;
}

const bi = (en, zh) => ({ en, zh });
/** A saved chat exactly as the k-0545 build wrote it: the reference's pictures inline, twice (reference + draft's request). */
function oldChat(i) {
  const at = new Date(Date.UTC(2026, 10, 20, 8, i)).toISOString();
  const source = {
    id: `DSE20${10 + i}/P1/Q${i + 1}`,
    label: `DSE 20${10 + i} Paper 1 Q${i + 1}`,
    stem: bi(`Chat ${i + 1}: the diagram shows the market for pens. A unit tax is imposed. Which is correct?`, `對話 ${i + 1}：圖表顯示筆的市場。政府徵收從量稅。以下哪項正確？`),
    statements: [],
    options: [bi('A', 'A'), bi('B', 'B'), bi('C', 'C'), bi('D', 'D')],
    answerIndex: 1,
    hasFigure: true,
    figurePlaces: ['stem', 'stem'],
    figureBlocks: [
      { kind: 'image', id: `img-${i}-a`, src: picture(i * 2 + 1), widthPx: 300, heightPx: 200 },
      { kind: 'image', id: `img-${i}-b`, src: picture(i * 2 + 2), widthPx: 300, heightPx: 200 },
    ],
  };
  const studio = {
    id: `s${i}`,
    status: 'ok',
    checks: [],
    attempt: 1,
    draft: { stem: bi(`Draft for chat ${i + 1}`, `第 ${i + 1} 個對話的草稿`), statements: [], options: [bi('1', '1'), bi('2', '2'), bi('3', '3'), bi('4', '4')], answerIndex: 0, explanation: bi('', '') },
  };
  return {
    v: 1,
    id: `old${i}`,
    createdAt: at,
    updatedAt: at,
    refs: [{ source, who: 'you', keyPoint: 'C.ped' }],
    turns: [
      { id: `u${i}`, role: 'user', text: `Write one like chat ${i + 1}`, refs: [source.label] },
      { id: `a${i}`, role: 'ai', steps: [], notes: [], draftIds: [`d${i}`] },
    ],
    drafts: [{ id: `d${i}`, no: 1, turnId: `a${i}`, state: 'open', older: [], entry: { draft: studio, request: { keyPoint: 'C.ped', points: [], examples: [source], count: 1, level: 'same', shape: 'any', sides: ['en'], note: '' } } }],
    picks: [],
    settings: { count: 1, level: 'same', language: 'en' },
    lastText: '',
  };
}

const old = Array.from({ length: CHATS }, (_, i) => oldChat(i)).reverse();
const oldRaw = JSON.stringify(old);

async function newPage(browser, { ui = 'en', seed = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  context.setDefaultTimeout(30_000);
  await context.addInitScript(
    ([lang, chats, chatsKey, fillerKey, seedIt]) => {
      if (sessionStorage.getItem('k0551-seeded')) return;
      sessionStorage.setItem('k0551-seeded', '1');
      localStorage.setItem('econgen.settings.language', JSON.stringify({ v: 1, ui: lang, paper: 'en' }));
      if (!seedIt) return;
      localStorage.setItem(chatsKey, chats);
      // Worksheets and the rest: storage left nearly full.
      localStorage.setItem(fillerKey, 'w'.repeat(1_200_000));
      let used = 0;
      for (let i = 0; i < localStorage.length; i += 1) used += localStorage.key(i).length + localStorage.getItem(localStorage.key(i)).length;
      sessionStorage.setItem('k0551-before', JSON.stringify({ used, chatsLength: chats.length, inline: chats.includes('data:image'), chats: JSON.parse(chats).length }));
    },
    [ui, oldRaw, CHATS_KEY, FILLER, seed],
  );
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { context, page, errors };
}

async function openStudio(page) {
  await page.goto(APP, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /擬題工作室/ }).first().click();
  await page.locator('[data-studio-screen]').waitFor();
}

const storageState = (page) =>
  page.evaluate(
    async ([chatsKey]) => {
      let used = 0;
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        used += k.length + (localStorage.getItem(k)?.length ?? 0);
      }
      const raw = localStorage.getItem(chatsKey) ?? '';
      const rows = await new Promise((resolve) => {
        const req = indexedDB.open('econ-studio-pictures');
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('pictures')) return resolve([]);
          const all = db.transaction('pictures', 'readonly').objectStore('pictures').getAll();
          all.onsuccess = () => resolve(all.result.map((r) => ({ id: r.id, length: r.dataUrl.length, savedAt: r.savedAt })));
          all.onerror = () => resolve([]);
        };
        req.onerror = () => resolve([]);
      });
      return { used, chatsLength: raw.length, inline: raw.includes('data:image'), tokens: (raw.match(/studio-pic:/g) ?? []).length, chats: JSON.parse(raw || '[]').length, rows };
    },
    [CHATS_KEY],
  );

async function waitFor(page, test, ms = 20_000) {
  const start = Date.now();
  let state;
  while (Date.now() - start < ms) {
    state = await storageState(page);
    if (test(state)) return state;
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out; last state ${JSON.stringify({ ...state, rows: state?.rows.length })}`);
}

const savedChatsInMenu = async (page) => {
  await page.locator('[data-chats-menu]').click();
  const n = await page.locator('[data-chats-list] [role="menuitem"]').count();
  await page.keyboard.press('Escape');
  return n;
};

/** A save from the open chat: its level changed in the settings. */
async function changeLevel(page, label) {
  await page.locator('[data-chat-settings]').click();
  await page.locator('[data-chat-settings-pop]').getByRole('button', { name: label, exact: true }).click();
  await page.keyboard.press('Escape');
}

async function openFirstSavedChat(page) {
  await page.locator('[data-chats-menu]').click();
  await page.locator('[data-chats-list] [role="menuitem"]').first().click();
}

/** Fills localStorage to the last unit: any save that grows by a character then fails. */
const fillToTheBrim = (page) =>
  page.evaluate(([key]) => {
    let step = 1 << 20;
    while (step >= 1) {
      try {
        localStorage.setItem(key, (localStorage.getItem(key) ?? '') + 'w'.repeat(step));
      } catch {
        step >>= 1;
      }
    }
  }, [FILLER]);

const browser = await chromium.launch({ channel: 'chrome' });
const proof = {};
try {
  const { page, errors, context } = await newPage(browser);
  await check('seeded as the k-0545 build saved them: pictures inline, storage nearly full', async () => {
    await page.goto(APP, { waitUntil: 'networkidle' });
    // As seeded, before the app read it (the chat store loads with the page).
    const s = JSON.parse(await page.evaluate(() => sessionStorage.getItem('k0551-before')));
    proof.before = { used: s.used, chatsLength: s.chatsLength };
    expect(s.inline && s.chats === CHATS, 'seed missing');
    expect(s.used > 0.8 * LIMIT, `only ${s.used} used`);
    return `${CHATS} chats, chat list ${(s.chatsLength / 1048576).toFixed(2)} MB, storage ${(s.used / 1048576).toFixed(2)} of 5.00 MB`;
  });

  await check('first load moves every picture to IndexedDB, every chat kept', async () => {
    await openStudio(page);
    const s = await waitFor(page, (x) => !x.inline && x.rows.length > 0);
    proof.after = { used: s.used, chatsLength: s.chatsLength, pictures: s.rows.length };
    expect(s.chats === CHATS, `${s.chats} chats saved`);
    expect(s.rows.length === CHATS * 2, `${s.rows.length} pictures kept`);
    expect(s.rows.every((r) => r.length === 60_022), 'a picture changed size');
    expect((await savedChatsInMenu(page)) === CHATS, 'Chats ▾ lost some');
    await page.screenshot({ path: `${OUT}/1-moved.png` });
    return `chat list ${(s.chatsLength / 1024).toFixed(0)} KB (was ${(proof.before.chatsLength / 1048576).toFixed(2)} MB), ${s.tokens} tokens for ${s.rows.length} pictures`;
  });

  await check('a picture no chat names is tidied at the next start; named ones stay', async () => {
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open('econ-studio-pictures');
          req.onsuccess = () => {
            const tx = req.result.transaction('pictures', 'readwrite');
            tx.objectStore('pictures').put({ id: 'orphan-1', dataUrl: 'data:image/png;base64,ORPHAN', savedAt: 0 });
            tx.oncomplete = () => resolve(undefined);
          };
        }),
    );
    expect((await storageState(page)).rows.some((r) => r.id === 'orphan-1'), 'orphan not planted');
    await openStudio(page);
    const s = await waitFor(page, (x) => !x.rows.some((r) => r.id === 'orphan-1'));
    expect(s.rows.length === CHATS * 2, `${s.rows.length} pictures left`);
    expect(s.chats === CHATS, 'a chat went');
    return `${s.rows.length} named pictures kept`;
  });

  await check('a save that does not fit raises a notice (English), and the next that fits takes it down', async () => {
    await openFirstSavedChat(page);
    await fillToTheBrim(page);
    await changeLevel(page, 'Harder');
    const notice = page.getByText('Chats not saved');
    await notice.waitFor();
    await page.screenshot({ path: `${OUT}/2-full-en.png` });
    const text = await page.locator('body').innerText();
    const said = /Storage on this computer is full, so the oldest (chat|(\d+) chats) of your (\d+) could not be kept/.exec(text);
    expect(said, 'no full message');
    const left = said[2] ? Number(said[2]) : 1;
    const s = await storageState(page);
    // The newest kept, the oldest left out (still open until the page closes), as the notice says.
    expect(s.chats === CHATS - left, `${s.chats} saved, notice says ${left} left of ${CHATS}`);
    // Room made (a worksheet deleted): the next save keeps every chat again.
    await page.evaluate(([key]) => localStorage.setItem(key, 'w'.repeat(1_200_000)), [FILLER]);
    await changeLevel(page, 'Easier');
    await notice.waitFor({ state: 'detached' });
    const after = await storageState(page);
    expect(after.chats === CHATS, `${after.chats} saved after room was made`);
    return `${left} oldest left out and named in the notice; all ${CHATS} saved again once there was room, notice gone`;
  });

  await check('no page errors', async () => {
    expect(errors.length === 0, errors.join(' | '));
  });
  await context.close();

  const zh = await newPage(browser, { ui: 'zh-HK' });
  await check('the notice in 中文', async () => {
    await openStudio(zh.page);
    await waitFor(zh.page, (x) => !x.inline && x.rows.length > 0);
    await openFirstSavedChat(zh.page);
    await fillToTheBrim(zh.page);
    await changeLevel(zh.page, '較難');
    await zh.page.getByText('對話未能儲存').waitFor();
    await zh.page.screenshot({ path: `${OUT}/3-full-zh.png` });
    const text = await zh.page.locator('body').innerText();
    expect(text.includes('儲存空間已滿'), 'no 中文 message');
  });
  await zh.context.close();
} finally {
  await browser.close();
}

writeFileSync(`${OUT}/results.json`, JSON.stringify({ results, proof }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`${results.length - failed}/${results.length} passed; screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
