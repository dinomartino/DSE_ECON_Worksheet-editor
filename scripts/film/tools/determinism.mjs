#!/usr/bin/env node
// Determinism check (FILM.md §5.2): the same film times rendered in order in one page and
// shuffled in another must give byte-identical screenshots.
//   node scripts/film/tools/determinism.mjs [--final] [--times=0.5,15.9,…] [--assets=fake]
import { serve, FAKE_ASSETS } from './serve.mjs';
import { launchOnGpu, openStage } from './chrome.mjs';
import { parseArgs, plan } from '../render.mjs';

const args = parseArgs(process.argv.slice(2));
const P = plan(args);
const times = String(args.times ?? '0.5,5.5,9.7,15.9,16.2,47.9,48.1,63.7,64.3,81.1,84.2,86.4,92.9')
  .split(',')
  .map((t) => Math.round(Number(t) * P.fps) / P.fps);
const server = await serve(args.assets === 'fake' ? { assets: FAKE_ASSETS, fallbacks: [] } : {});
const size = { w: P.w, h: P.h, fps: P.fps, shutter: P.shutter };
const { browser, gpu } = await launchOnGpu(server.url, size);

async function shots(order) {
  const { context, page } = await openStage(browser, server.url, size);
  const cdp = await context.newCDPSession(page);
  const out = new Map();
  for (const t of order) {
    await page.evaluate((x) => window.film.seek(x), t);
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    out.set(t, data);
  }
  await context.close();
  return out;
}

const shuffled = [...times].reverse();
shuffled.push(shuffled.shift());
const a = await shots(times);
const b = await shots(shuffled);
const bad = times.filter((t) => a.get(t) !== b.get(t));
await browser.close();
await server.close();
console.log(`GPU: ${gpu.renderer}`);
console.log(`${P.w}×${P.h} shutter ${P.shutter}: ${times.length - bad.length}/${times.length} identical in and out of order`);
if (bad.length) {
  console.log(`differ at: ${bad.join(', ')}`);
  process.exitCode = 1;
}
