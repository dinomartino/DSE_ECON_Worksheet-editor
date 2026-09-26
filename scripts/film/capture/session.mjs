// Shared capture plumbing: where things go, the browser, and a page on the virtual clock.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { CONTEXT, CURSOR_SCRIPT } from '../../demo/flow.mjs';
import { ASSETS, BUILD, MAIN_ROOT } from '../paths.mjs';
import { virtualTimeScript } from './vtime.mjs';
import { trackNetwork } from './recorder.mjs';

export const PORT = 3941;
/** The film's "now": Tuesday 29 September 2026, 10:24 in Hong Kong. */
export const EPOCH = Date.UTC(2026, 8, 29, 2, 24, 0);
export const CAPTURE_BUILD = path.join(BUILD, 'capture');
export const REVIEW = path.join(BUILD, 'capture-review');
export const OUT = {
  clips: path.join(ASSETS, 'clips'),
  stills: path.join(ASSETS, 'stills'),
  sheets: path.join(ASSETS, 'sheets'),
  diagram: path.join(ASSETS, 'diagram'),
  export: path.join(ASSETS, 'export'),
};
export { ASSETS, BUILD, MAIN_ROOT };

export function ensureOut() {
  for (const dir of [CAPTURE_BUILD, REVIEW, ...Object.values(OUT)]) fs.mkdirSync(dir, { recursive: true });
}

/** System Chrome, headless; `dpr` is forced so CDP captures come out in device pixels. */
export function launch(dpr = 2) {
  return chromium.launch({ channel: 'chrome', args: [`--force-device-scale-factor=${dpr}`] });
}

export const CONTEXT_OPTIONS = { ...CONTEXT, colorScheme: 'light', reducedMotion: 'no-preference' };

/**
 * A page on the virtual clock (§ vtime.mjs), loaded from `state`, following real time
 * (`__vt.auto`) until a recording takes over.
 */
export async function openPage(browser, { url, state, dpr = 2, log = () => {} }) {
  const ctx = await browser.newContext({
    ...CONTEXT_OPTIONS, deviceScaleFactor: dpr, storageState: state, acceptDownloads: true,
  });
  await ctx.addInitScript(virtualTimeScript({ epoch: EPOCH }));
  await ctx.addInitScript(CURSOR_SCRIPT);
  // The drawn pointer on its own layer, so sub-pixel steps of a slow glide still move it.
  await ctx.addInitScript(() => {
    const add = () => {
      const css = document.createElement('style');
      css.textContent = '#__demo_cursor { will-change: transform; }';
      document.documentElement.appendChild(css);
    };
    if (document.documentElement) add();
    else document.addEventListener('DOMContentLoaded', add);
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  const net = trackNetwork(page);
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.__vt.auto(true));
  await page.evaluate(() => document.fonts.ready);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, net, cdp };
}

/** Stop following real time, start the wall clock, and step `seconds` of virtual time uncaptured. */
export async function freeze(page, seconds = 0.6) {
  await page.evaluate(() => {
    window.__vt.auto(false);
    window.__vt.startWall();
  });
  const steps = Math.round(seconds * 60);
  for (let i = 0; i < steps; i++) await page.evaluate(() => window.__vt.frame(1000 / 60));
}

/** Wait (real time) while the clock follows it: for app work off camera. */
export const settle = (page, ms = 600) => page.waitForTimeout(ms);

/** Show or hide the drawn pointer. */
export const pointer = (page, show) =>
  page.evaluate((on) => {
    const node = document.getElementById('__demo_cursor');
    if (node) node.style.visibility = on ? '' : 'hidden';
  }, show);
