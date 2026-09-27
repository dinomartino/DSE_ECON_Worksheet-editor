// System Chrome for the stage, on the GPU. Headless first; if WebGL falls back to a
// software rasteriser, the caller relaunches headed with the window off-screen.
import { chromium } from 'playwright-core';

export const GPU_ARGS = [
  '--use-angle=metal',
  '--enable-gpu',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--force-color-profile=srgb',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion',
  '--hide-scrollbars',
  '--mute-audio',
];

const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i;
export const isSoftware = (gpu) => SOFTWARE.test(`${gpu?.renderer} ${gpu?.vendor}`);

export async function launch({ headed = false } = {}) {
  const args = [...GPU_ARGS];
  if (headed) args.push('--window-position=-2400,-2400', '--window-size=400,300');
  return chromium.launch({ channel: 'chrome', headless: !headed, args });
}

/** Opens the stage at `size` in a fresh context; resolves { context, page, gpu }. */
export async function openStage(browser, base, { w, h, fps, shutter, extra = '' }) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, colorScheme: 'dark' });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.stack ?? e.message}`));
  const url = `${base}/film/stage/index.html?w=${w}&h=${h}&fps=${fps}&shutter=${shutter}${extra}`;
  await page.goto(url);
  await page.waitForFunction(() => window.film && typeof window.film.seek === 'function', null, { timeout: 30_000 });
  await page.evaluate(() => window.film.ready());
  const gpu = await page.evaluate(() => window.film.gpu());
  return { context, page, gpu, logs };
}

/**
 * Launches Chrome and checks the GPU. Returns { browser, gpu, headed }. Throws when only
 * a software renderer is available (unless allowSoftware).
 */
export async function launchOnGpu(base, size, { allowSoftware = false, forceHeaded = false } = {}) {
  for (const headed of forceHeaded ? [true] : [false, true]) {
    const browser = await launch({ headed });
    const { context, gpu } = await openStage(browser, base, { ...size, w: 64, h: 36 });
    await context.close();
    if (!isSoftware(gpu) || allowSoftware) return { browser, gpu, headed };
    await browser.close();
    if (headed) throw new Error(`WebGL is on a software renderer (${gpu.renderer}); refusing to render.`);
  }
  throw new Error('unreachable');
}
