// Shared driving for the demo: a mouse that travels visibly, and the app actions both
// the recording and the screenshots are built from. Selectors are the app's own roles
// and aria-labels, so a renamed control fails here loudly rather than silently.
import { MCQS, STRUCTURED, QUIZ_NAME, LIBRARY } from './content.mjs';

export const VIEWPORT = { width: 1440, height: 900 };
export const CONTEXT = { viewport: VIEWPORT, locale: 'en-US', timezoneId: 'Asia/Hong_Kong' };

/** A drawn arrow and click ring: the screencast never shows the OS pointer. */
export const CURSOR_SCRIPT = `
(() => {
  const install = () => {
    if (document.getElementById('__demo_cursor')) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.innerHTML = '<svg width="22" height="28" viewBox="0 0 22 28" xmlns="http://www.w3.org/2000/svg"><path d="M2 2 L2 22 L7.5 17 L11 25.5 L14.5 24 L11 15.8 L18.5 15.8 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;width:22px;height:28px;pointer-events:none;z-index:2147483647;transform:translate(-100px,-100px);';
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(13,119,201,0.28);pointer-events:none;z-index:2147483646;opacity:0;';
    document.documentElement.appendChild(ring);
    document.documentElement.appendChild(c);
    window.addEventListener('mousemove', (e) => {
      c.style.transform = 'translate(' + (e.clientX - 2) + 'px,' + (e.clientY - 2) + 'px)';
    }, true);
    window.addEventListener('mousedown', (e) => {
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
      ring.style.transition = 'none'; ring.style.opacity = '1'; ring.style.transform = 'scale(0.4)';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ring.style.transition = 'opacity .45s ease, transform .45s ease';
        ring.style.opacity = '0'; ring.style.transform = 'scale(1.3)';
      }));
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
`;

/**
 * The mouse and keyboard. `smooth` glides the pointer and scrolls the page in small
 * wheel steps (for the video); otherwise every move is instant (for screenshots).
 */
export function makeDriver(page, { smooth = false, url } = {}) {
  let cx = VIEWPORT.width / 2;
  let cy = VIEWPORT.height / 2;
  const wait = (ms) => page.waitForTimeout(ms);

  async function moveTo(x, y) {
    const steps = smooth ? Math.max(8, Math.min(40, Math.round(Math.hypot(x - cx, y - cy) / 18))) : 1;
    await page.mouse.move(x, y, { steps });
    cx = x;
    cy = y;
  }

  /** Scroll the page canvas until `loc` sits inside the visible band. */
  async function ensureVisible(loc) {
    for (let i = 0; i < 60; i++) {
      const b = await loc.boundingBox();
      if (!b) throw new Error('demo: element has no box (hidden or detached)');
      const over = b.y + b.height - 780;
      const under = 90 - b.y;
      if (over <= 0 && under <= 0) return b;
      if (!smooth) {
        await loc.scrollIntoViewIfNeeded();
        await page.mouse.move(560, 450);
        await page.mouse.wheel(0, over > 0 ? over + 200 : -(under + 200));
        await wait(250);
        continue;
      }
      await moveTo(Math.min(Math.max(cx, 200), 900), Math.min(Math.max(cy, 120), 800));
      await page.mouse.wheel(0, over > 0 ? Math.min(over + 120, 90) : -Math.min(under + 120, 90));
      await wait(45);
    }
    return loc.boundingBox();
  }

  /** Where to point at `loc`: its centre, or `dx` of the way in (capped at 60px). */
  async function point(loc, dx = 0.5) {
    const onPage = await loc.evaluate((el) => !!el.closest('#print-root'));
    const b = onPage ? await ensureVisible(loc) : await loc.boundingBox();
    const x = dx === 0.5 ? b.x + b.width / 2 : b.x + Math.min(b.width * dx, 60);
    return { x, y: b.y + b.height / 2 };
  }

  async function hover(loc, { at = 0.5 } = {}) {
    await loc.first().waitFor({ state: 'visible' });
    const { x, y } = await point(loc.first(), at);
    await moveTo(x, y);
  }

  async function click(loc, { hover: dwell = 180 } = {}) {
    await loc.first().waitFor({ state: 'visible' });
    const { x, y } = await point(loc.first());
    await moveTo(x, y);
    await wait(dwell);
    await page.mouse.click(x, y);
  }

  /** Double-click a field on the page, type (`delay` 0 = pasted at once), Enter commits. */
  async function typeInto(loc, text, { delay = 30, after = 250 } = {}) {
    await loc.first().waitFor({ state: 'visible' });
    const { x, y } = await point(loc.first(), 0.2);
    await moveTo(x, y);
    await wait(150);
    await page.mouse.dblclick(x, y);
    await wait(180);
    if (delay) await page.keyboard.type(text, { delay });
    else await page.keyboard.insertText(text);
    await wait(80);
    await page.keyboard.press('Enter');
    await wait(after);
  }

  async function wheel(dy, times, pause = 35) {
    for (let i = 0; i < times; i++) {
      await page.mouse.wheel(0, dy);
      await wait(pause);
    }
  }

  /** Scroll `loc` into the visible band, as a click would, without clicking. */
  async function show(loc) {
    await loc.first().waitFor({ state: 'visible' });
    await point(loc.first());
  }

  return { page, url, moveTo, hover, click, typeInto, wheel, wait, show };
}

// ---- locators --------------------------------------------------------------

/** The i-th question on the page (0-based, page order). */
export const question = (page, i) => page.locator('#print-root [data-question-id]').nth(i);
/**
 * The j-th editable field of question i. Bilingual mode alternates EN, 中文:
 * MCQ = stem, then A..D; structured = stem, then (a), (b), ...
 */
export const field = (page, i, j) => question(page, i).locator('[role=textbox]').nth(j);
export const flowRow = (page, text) =>
  page.locator('#print-root [data-flow-id]').filter({ hasText: text }).first();

// ---- app actions (instant; used to build documents off camera) -------------

export async function createWorksheet(d, template, { bilingual = false, name } = {}) {
  const { page } = d;
  await page.goto(d.url, { waitUntil: 'networkidle' });
  await page.getByText(template, { exact: true }).first().click();
  await d.wait(300);
  if (bilingual) await page.getByRole('dialog').getByTitle('Bilingual').click();
  await page.getByRole('button', { name: /Create worksheet/ }).click();
  await d.wait(1200);
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.click();
  if (name) {
    await page.getByTitle(/click to rename/).click();
    await d.wait(200);
    await page.keyboard.press('Meta+A');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
    await d.wait(300);
  }
}

/** Insert a question in the gap below the flow row containing `rowText`. */
export async function insertBelow(d, rowText, kind) {
  const row = flowRow(d.page, rowText);
  await row.hover();
  await row.getByRole('button', { name: 'Insert here' }).click();
  await d.page.getByRole('menuitem', { name: kind }).click();
  await d.wait(500);
}

export async function addFromRail(d, kind) {
  await d.page.getByRole('button', { name: /^Question/ }).click();
  await d.page.getByRole('menuitem', { name: kind }).click();
  await d.wait(500);
}

export const answerButton = (page, letter) =>
  page.getByRole('radio', { name: new RegExp(`^Option ${letter}`) });

export async function fillMcq(d, i, m) {
  const { page } = d;
  await d.typeInto(field(page, i, 0), m.stem[0], { delay: 0 });
  await d.typeInto(field(page, i, 1), m.stem[1], { delay: 0 });
  for (let k = 0; k < 4; k++) {
    await d.typeInto(field(page, i, 2 + 2 * k), m.options[k][0], { delay: 0 });
    await d.typeInto(field(page, i, 3 + 2 * k), m.options[k][1], { delay: 0 });
  }
  await question(page, i).locator('[role=textbox]').first().click();
  await d.wait(250);
  await answerButton(page, m.answer).click();
  await d.wait(250);
}

export const partInput = (page, letter, what) =>
  page.locator(
    `[aria-label="Part ((${letter})) ${what === 'marks' ? 'marks' : 'answer space (dotted lines)'}"]`,
  );

export async function fillStructured(d, i, s) {
  const { page } = d;
  await d.typeInto(field(page, i, 0), s.stem[0], { delay: 0 });
  await d.typeInto(field(page, i, 1), s.stem[1], { delay: 0 });
  for (let p = 0; p < s.parts.length; p++) {
    const part = s.parts[p];
    const letter = String.fromCharCode(97 + p);
    if (p > 0) {
      await page.getByRole('button', { name: '+ Part' }).click();
      await d.wait(400);
    }
    await d.typeInto(field(page, i, 2 + 2 * p), part.text[0], { delay: 0 });
    await d.typeInto(field(page, i, 3 + 2 * p), part.text[1], { delay: 0 });
    for (const [what, value] of [['marks', part.marks], ['lines', part.lines]]) {
      const input = partInput(page, letter, what);
      await input.fill(String(value));
      await input.press('Tab');
    }
    await d.wait(300);
    const scheme = (lang) =>
      page.locator(`[aria-label="Answer / marking scheme (teacher version) (${lang})"]`).nth(p);
    for (const [lang, text] of [['English', part.scheme[0]], ['中文', part.scheme[1]]]) {
      await scheme(lang).click();
      await page.keyboard.insertText(text);
      await page.keyboard.press('Tab');
      await d.wait(200);
    }
  }
}

/** The full quiz: MCQs under Section A, the structured question under Section B. */
export async function buildQuiz(d) {
  await createWorksheet(d, 'Classroom worksheet', { bilingual: true, name: QUIZ_NAME });
  await insertBelow(d, 'Section A', /Multiple Choice/);
  for (let i = 0; i < MCQS.length; i++) {
    if (i > 0) await addFromRail(d, /Multiple Choice/);
    await fillMcq(d, i, MCQS[i]);
  }
  await insertBelow(d, 'Section B', /Structured/);
  await fillStructured(d, MCQS.length, STRUCTURED);
}

/** The other saved documents on the start screen. Renaming makes each one save. */
export async function buildLibrary(d) {
  for (const [template, name] of LIBRARY) {
    await createWorksheet(d, template, { name });
    await d.wait(1500);
  }
}
