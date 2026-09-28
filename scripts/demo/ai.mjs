// The ✦ AI film (`npm run demo:ai`): a bilingual worksheet with some 中文 missing, filled
// by ✦ AI → Fill missing 中文, stepped through, then Check terms against the EDB glossary
// with one fix applied. One continuous recording of the built app, framed by the virtual
// camera (§ camera.mjs), subtitled (§ subtitles.mjs). The worksheet is seeded off camera
// (ai-seed.test.ts); the provider is Gemini answered in the browser (ai-provider.mjs).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { AI } from './content.mjs';
import { CONTEXT, CURSOR_SCRIPT, VIEWPORT, makeDriver, question } from './flow.mjs';
import { filmSteps } from './record.mjs';
import { LOOK, withSubtitles } from './subtitles.mjs';
import { withCamera } from './camera.mjs';
import { cannedGemini, GEMINI_HOST } from './ai-provider.mjs';

/** The menu's width (src/components/ai/AiMenu.tsx:AI_MENU_WIDTH). */
const AI_MENU_WIDTH = 360;

/** Every other provider the app knows: never reached, or the film fails. */
const OTHER_PROVIDERS = [
  'api.deepseek.com', 'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'openrouter.ai',
  'api.openai.com', 'api.anthropic.com',
];

const door = (page) => page.locator('[data-ai-door]');
const menu = (page) => page.getByRole('dialog', { name: 'AI tools' });
const verb = (page, id) => menu(page).locator(`[data-verb="${id}"]`);
const bar = (page) => page.getByRole('status', { name: 'AI' });
/** The review card beside the page text (not the menu, which is also a dialog). */
const card = (page, tone) => page.getByRole('dialog').filter({ hasText: tone });
/** The page text (an edit target) holding `text`. */
const onPage = (page, text) => page.locator('#print-root [data-page-target]').filter({ hasText: text }).first();
const pageText = (page) => page.locator('#print-root').innerText();

const [QUESTION_1, PART_A, , PART_C] = [AI.mcq.stem.en, ...AI.structured.parts.map((p) => p.en)];
const FILLS = [AI.mcq.stem, ...AI.structured.parts].filter((t) => t.zh === null).map((t) => t.fill);

const W = VIEWPORT.width;
const H = VIEWPORT.height;
/** Output px the subtitle capsule takes at the bottom, by lines, with a margin (§ subtitles.mjs:LOOK). */
const SUBTITLE_BAND = { 1: LOOK.bottom + LOOK.line + 2 * LOOK.padY + 12, 2: LOOK.bottom + 2 * LOOK.line + 2 * LOOK.padY + 12 };

/**
 * Point the camera at `targets` (locators or boxes), clear of the AI bar. The bar floats at the bottom of
 * the window, right where the subtitles sit, so while it shows, the frame ends above it;
 * the targets also stay above the subtitle band (`lines` of subtitle). Throws when they
 * cannot: scroll them up first.
 */
async function frame(d, targets, { name, pad = 30, maxZoom = 1.8, lines = 2, withBar = false } = {}) {
  if (withBar) {
    // The bar itself in frame: only while no subtitle is up (it would sit on the bar).
    if (d.cues.at(-1)?.text) throw new Error(`camera: ${name} shows the AI bar under a subtitle`);
    targets = [...targets, bar(d.page)];
  }
  const boxes = [];
  for (const t of targets) {
    const b = typeof t.first === 'function' ? await t.first().boundingBox() : t;
    if (!b) throw new Error(`camera: ${name} has no box`);
    boxes.push(b);
  }
  // Padded, but only up to the window's edges.
  const top = Math.max(0, Math.min(...boxes.map((b) => b.y)) - pad);
  const bottom = Math.min(H, Math.max(...boxes.map((b) => b.y + b.height)) + pad);
  const left = Math.max(0, Math.min(...boxes.map((b) => b.x)) - pad);
  const right = Math.min(W, Math.max(...boxes.map((b) => b.x + b.width)) + pad);
  const barBox = (await bar(d.page).count()) ? await bar(d.page).boundingBox() : null;
  const floor = barBox && !withBar ? barBox.y - 6 : H;
  for (let w = Math.ceil(Math.max(W / maxZoom, right - left, (bottom - top) * (W / H)) / 16) * 16; w < W; w += 16) {
    const h = (w * H) / W;
    const band = withBar ? 0 : (SUBTITLE_BAND[lines] * w) / W;
    // Centred on the targets and the band under them, never below the floor.
    const y = Math.max(0, Math.min(floor - h, top - (h - (bottom - top) - band) / 2));
    if (top >= y && bottom <= y + h - band && y + h <= floor) {
      const x = Math.min(Math.max((left + right) / 2 - w / 2, 0), W - w);
      return d.focus({ x, y, width: w, height: h }, { name, pad: 0, room: 0, maxZoom: W / w });
    }
  }
  throw new Error(`camera: ${name} (y ${Math.round(top)}–${Math.round(bottom)}) does not fit above the ` +
    `${barBox ? `AI bar (y ${Math.round(floor)})` : 'subtitles'}`);
}

/** Scroll the page (visibly) until `loc`'s top sits near `y`. */
async function scrollTo(d, loc, y) {
  // Wheel scrolling is smooth: send the whole distance, let it land, then correct.
  for (let pass = 0; pass < 3; pass++) {
    let off = (await loc.first().boundingBox()).y - y;
    if (Math.abs(off) < 20) return;
    while (Math.abs(off) >= 1) {
      const step = Math.sign(off) * Math.min(Math.abs(off), 60);
      await d.page.mouse.wheel(0, step);
      off -= step;
      await d.wait(35);
    }
    await d.wait(450);
  }
}

/** A click on the canvas beside the page: clears the selection a click on page text makes. */
async function clickBesidePage(d) {
  const paper = await d.page.locator('#print-root .paper').first().boundingBox();
  const x = paper.x + paper.width + 40;
  await d.moveTo(x, 470);
  await d.wait(150);
  await d.page.mouse.click(x, 470);
  await d.wait(250);
}

/** Opens ✦ AI from the toolbar, framed with its menu. */
async function openMenu(d, say) {
  // One move: the button and where its menu will open (right-aligned under it, § AiButton).
  const b = await door(d.page).boundingBox();
  const room = { x: b.x + b.width - AI_MENU_WIDTH, y: b.y, width: AI_MENU_WIDTH, height: b.height + 280 };
  await frame(d, [door(d.page), room], {
    name: 'the ✦ AI button and its menu', pad: 24, maxZoom: 2,
  });
  if (say) await d.say(say);
  await d.click(door(d.page), { hover: 450 });
  await menu(d.page).waitFor();
  if (!(await menu(d.page).getByText('Whole paper', { exact: true }).count())) {
    throw new Error('✦ AI opened on a selection, not the whole paper');
  }
  await d.wait(250);
}

export function aiStoryboard(seed) {
  return [
    {
      name: 'Missing 中文',
      caption: `A bilingual worksheet (EN+中) with the 中文 of ${seed.untranslated} texts missing ("Double-click to add 中文"); the **✦ AI** button's badge reads ${seed.untranslated}.`,
      async run(d) {
        await d.wait(400); // the poster frame stays clean
        await d.say('Some 中文 still missing?');
        await d.hover(d.page.locator('#print-root').getByText('Double-click to add 中文').first(), { at: 0.5 });
        await frame(d, [question(d.page, 0)], { name: 'question 1', pad: 40, lines: 1 });
        await d.wait(1300);
        await d.focus(null);
      },
    },
    {
      name: 'Fill missing 中文',
      caption: `Opens **✦ AI** and clicks **Fill missing 中文**: "Sends ${seed.untranslated} texts to Google Gemini with your key".`,
      async run(d) {
        await openMenu(d, 'One click on ✦ AI fills it in.');
        await d.hover(verb(d.page, 'translate.fillZh'), { at: 0.3 });
        await d.wait(900);
        await d.click(verb(d.page, 'translate.fillZh'), { hover: 200 });
        await bar(d.page).getByText(/^Filled \d+ 中文 texts?/).waitFor({ timeout: 20_000 });
        const text = await pageText(d.page);
        const missing = FILLS.filter((f) => !text.includes(f));
        if (missing.length || /譯：|EN: /.test(text)) throw new Error(`the fill is not on the page as canned: ${missing.join(' | ')}`);
        const look = await d.page.locator('#print-root [data-ai-mark="look"]').count();
        if (look) throw new Error(`${look} filled texts came back marked "look"; the film shows clean inserts`);
      },
    },
    {
      name: 'On the page',
      caption: 'The 中文 is on the page, highlighted. Clicks the first highlight: its card shows the English it came from; **›** steps to part (a), scrolling the page to it.',
      async run(d) {
        const stem = onPage(d.page, QUESTION_1);
        await frame(d, [question(d.page, 0)], { name: 'the filled question', pad: 40 });
        await d.say('Straight onto the page, using\nthe EDB glossary’s terms.');
        await d.wait(700);
        await d.click(stem, { hover: 350 });
        const inserted = card(d.page, 'Inserted');
        await inserted.waitFor();
        await d.wait(300);
        await frame(d, [stem, inserted], { name: 'the first inserted text and its card' });
        await d.wait(700);
        await d.say('Step through them with ›,\neach beside its English.');
        await d.click(inserted.getByRole('button', { name: 'Next' }), { hover: 300 });
        // The page scrolls (a) to the middle; the card follows it.
        await d.wait(900);
        await frame(d, [onPage(d.page, PART_A), inserted], { name: 'part (a) and its card' });
        await d.wait(1200);
        await d.click(inserted.getByRole('button', { name: 'Close' }), { hover: 200 });
        // Clicking the highlight also selected the question; ✦ AI would open on it alone.
        await clickBesidePage(d);
      },
    },
    {
      name: 'Check terms',
      caption: 'Opens **✦ AI** again and clicks **Check terms against EDB glossary** (marked free: no key). 消費者剩餘 in part (c) gets a wavy underline.',
      async run(d) {
        await openMenu(d, 'Check terms reads your own 中文\nagainst the EDB glossary, no key needed.');
        await d.hover(verb(d.page, 'check.terms'), { at: 0.3 });
        await d.wait(700);
        await d.click(verb(d.page, 'check.terms'), { hover: 200 });
        await bar(d.page).getByRole('button', { name: /^1 finding$/ }).waitFor();
        await d.moveTo(700, 480);
        await scrollTo(d, onPage(d.page, PART_C), 540);
        // The underline and the bar's "1 finding", with no subtitle over the bar.
        await d.say('');
        await frame(d, [onPage(d.page, PART_C)], { name: 'part (c), underlined, and the AI bar', withBar: true });
        await d.wait(700);
      },
    },
    {
      name: 'Replace the term',
      caption: `Clicks **1 finding** on the AI bar; the card beside part (c) reads "consumer surplus — EDB: ${AI.planted.fix}". Clicks **Replace with ${AI.planted.fix}**.`,
      async run(d) {
        const partC = onPage(d.page, PART_C);
        // The chip, not the text: a click on page text selects it, and the page scrolls.
        await d.click(bar(d.page).getByRole('button', { name: /^1 finding$/ }), { hover: 300 });
        const finding = card(d.page, 'Finding');
        await finding.waitFor();
        await d.wait(700); // the page scrolls (c) to the middle; the card follows
        await frame(d, [partC, finding], { name: 'the finding card', pad: 24, lines: 1 });
        await d.say(`One click swaps in the EDB term, ${AI.planted.fix}.`);
        await d.wait(800);
        await d.click(finding.getByRole('button', { name: `Replace with ${AI.planted.fix}` }), { hover: 350 });
        await d.wait(300);
        if (!(await pageText(d.page)).includes(AI.planted.fix)) throw new Error(`${AI.planted.fix} is not on the page`);
        await d.wait(1300);
      },
    },
    {
      name: 'Finished page',
      caption: 'Closes the card, clicks **Done** on the AI bar, and scrolls back to the finished bilingual questions.',
      async run(d) {
        await d.click(card(d.page, 'Finding').getByRole('button', { name: 'Close' }), { hover: 200 });
        await d.say('');
        await clickBesidePage(d);
        await d.focus(null);
        await d.click(bar(d.page).getByRole('button', { name: 'Done' }), { hover: 250 });
        await d.wait(300);
        await d.moveTo(1000, 480);
        // Both questions, from the first fill to the fixed term, above the subtitle.
        await scrollTo(d, question(d.page, 0), 150);
        await frame(d, [question(d.page, 0), onPage(d.page, PART_C)], { name: 'the finished questions', pad: 24, lines: 1 });
        await d.say('Every 中文 filled in, and checked.');
        await d.wait(2000);
      },
    },
  ];
}

/**
 * Seed the worksheet and the AI settings, open it in EN+中 off camera, and film the
 * storyboard at 2×. Returns the film and notes.
 */
export async function recordAi({ browser, url, root, tmpDir, log }) {
  log('ai: seeding…');
  const seedFile = path.join(tmpDir, 'ai-seed.json');
  const emit = spawnSync('npx', ['vitest', 'run', 'scripts/demo/ai-seed.test.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DEMO_SEED: seedFile },
  });
  if (emit.status !== 0) throw new Error(`ai: the seed failed\n${emit.stdout}\n${emit.stderr}`);
  const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  const doc = seed.worksheet;

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const title = doc.title.en.map((r) => r.text).join('');
  const ctx = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2 });
  await ctx.addInitScript(
    ([indexJson, key, json, seen]) => {
      // Seeded once per context: a reload must keep the film's own edits.
      if (window.localStorage.getItem('__demo_seeded')) return;
      window.localStorage.setItem('econ-worksheet-index', indexJson);
      window.localStorage.setItem(key, json);
      window.localStorage.setItem('econ-worksheet-last-seen-version', seen);
      // Gemini, set up as a teacher leaves it: no key screen on camera. Not a real key.
      window.localStorage.setItem('econgen.settings.ai', JSON.stringify({ v: 1, provider: 'gemini' }));
      window.sessionStorage.setItem('econgen.secret.ai:gemini', 'AIzaDemoFilmNotARealKey000000000000000');
      window.localStorage.setItem('__demo_seeded', '1');
    },
    [JSON.stringify([{ id: doc.id, title, updatedAt: doc.updatedAt }]), `econ-worksheet:${doc.id}`, JSON.stringify(doc), version],
  );
  await ctx.addInitScript(CURSOR_SCRIPT);
  const errors = [];
  let requests = 0;
  await ctx.route((u) => u.hostname === GEMINI_HOST, cannedGemini(seed.fills, {
    onError: (m) => errors.push(m),
    onRequest: () => (requests += 1),
  }));
  await ctx.route((u) => OTHER_PROVIDERS.includes(u.hostname), (route) => {
    errors.push(`the app tried ${route.request().url()}`);
    return route.abort();
  });

  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  page.setDefaultTimeout(10_000); // a renamed control fails the film fast
  const d = withCamera(withSubtitles(makeDriver(page, { smooth: true, url })));

  // Off camera: open the worksheet in EN+中, where the missing 中文 shows and is counted.
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: new RegExp(title) }).first().click();
  await page.waitForSelector('#print-root .paper');
  await d.wait(700);
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.click();
  await page.getByRole('radio', { name: 'EN+中', exact: true }).first().click();
  await d.wait(900);
  const badge = (await door(page).innerText()).replace(/\s+/g, ' ').trim();
  if (badge !== `AI ${seed.untranslated}`) throw new Error(`ai: the ✦ AI button reads "${badge}", not "AI ${seed.untranslated}"`);
  if ((await page.locator('#print-root .paper').count()) !== 1) throw new Error('ai: the worksheet is not one page in EN+中');
  await page.mouse.move(820, 520);
  await d.wait(300);

  const rec = await filmSteps({ ctx, page, d, steps: aiStoryboard(seed), tmpDir, log });
  await ctx.close();
  if (errors.length) throw new Error(`ai: the canned provider was asked for something it cannot answer:\n  ${errors.join('\n  ')}`);
  if (requests === 0) throw new Error('ai: Fill missing 中文 never reached the provider');
  log(`ai: ${requests} request(s) answered by the canned provider`);
  return { rec, notes: [] };
}
