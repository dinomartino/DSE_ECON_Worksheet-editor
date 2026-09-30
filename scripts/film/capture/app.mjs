// App actions for off-camera preparation, on a page whose clock follows real time.
// Selectors are the app's own roles, titles and aria-labels (as scripts/demo/flow.mjs).
import { DIAGRAMS, QUIZ_NAME } from '../../demo/content.mjs';
import { question } from '../../demo/flow.mjs';
import { settle } from './session.mjs';

export const SCROLLER = 'main.overflow-auto';

/** Open a saved document from the start screen by (part of) its name. */
export async function openDoc(page, name) {
  const title = name.split(':')[0];
  await page.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).first().click();
  await page.waitForSelector('#print-root .paper');
  await settle(page, 900);
  const hint = page.getByRole('button', { name: 'Dismiss hint' });
  if (await hint.count()) await hint.click();
  await settle(page, 300);
}

export const openQuiz = (page) => openDoc(page, QUIZ_NAME);

/** The toolbar crumb's home button: back to the start screen without a reload (the editor stays loaded). */
export async function backToStart(page) {
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('button', { name: /home$/ }).click();
  await settle(page, 900);
}
export const openDiagramDoc = (page) => openDoc(page, DIAGRAMS.title);

/** EN | 中文 | EN+中 in the toolbar. */
export const LANGUAGE_TITLE = { en: 'English only', zh: '中文 only', bilingual: 'Bilingual' };
export async function setLanguage(page, language) {
  await page.getByTitle(LANGUAGE_TITLE[language], { exact: true }).click();
  await settle(page, 400);
}

export async function setVersion(page, version) {
  await page.getByTitle(version === 'teacher' ? /^Teacher version/ : /^Student version/).click();
  await settle(page, 400);
}

/** Nothing selected: the sidebar back on Content, no editing affordance active. */
export async function deselect(page) {
  await page.keyboard.press('Escape');
  await settle(page, 200);
  const close = page.getByRole('button', { name: 'Close editor' });
  if (await close.count()) await close.first().click();
  await page.evaluate(() => document.activeElement?.blur?.());
  await settle(page, 400);
}

/** Select question `i` (page order) from the outline: the inspector opens, no text is focused. */
export async function selectQuestion(page, i) {
  const tab = page.getByRole('tab', { name: /^Content/ });
  if (await tab.count()) await tab.click();
  await settle(page, 300);
  await page.locator('aside button[aria-current]').nth(i).click();
  await settle(page, 700);
}

export async function scrollPage(page, top) {
  await page.evaluate(([s, y]) => { document.querySelector(s).scrollTop = y; }, [SCROLLER, top]);
  await settle(page, 300);
}

/** Scroll the page so `loc` sits `margin` px below the scroller's top. */
export async function scrollToShow(page, loc, margin = 90) {
  const top = await loc.first().evaluate((el, [s, m]) => {
    const sc = document.querySelector(s);
    return sc.scrollTop + el.getBoundingClientRect().top - sc.getBoundingClientRect().top - m;
  }, [SCROLLER, margin]);
  await scrollPage(page, Math.max(0, top));
}

/** Print preview on (sheets as they print) or off. */
export async function setPrintPreview(page, on) {
  await page.getByTitle(on ? /^See the sheets exactly as they will print/ : /^Edit the worksheet on the page/).click();
  await settle(page, 500);
}

/** Zoom the page `steps` × 10% with the zoom control (negative zooms out). */
export async function zoomBy(page, steps) {
  const button = page.getByRole('button', { name: steps > 0 ? 'Zoom in' : 'Zoom out', exact: true });
  for (let i = 0; i < Math.abs(steps); i++) {
    await button.click();
    await settle(page, 250);
  }
}

export { question };
