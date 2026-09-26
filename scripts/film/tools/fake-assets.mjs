#!/usr/bin/env node
// Synthetic stand-in assets in build/fake-assets/ (served only when the real asset store
// lacks a file). Follows the capture contract (FILM.md §6): a clip `type-mcq` with frame
// numbers burnt in (to check frame mapping) plus events, a still and a sheet. Obviously
// fake by design — grey UI, "SYNTHETIC" label — so it can never pass for product footage.
//   node scripts/film/tools/fake-assets.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright-core';
import { FAKE_ASSETS } from './serve.mjs';

const CLIP = { name: 'type-mcq', fps: 60, frames: 180, width: 1440, height: 900 };
const TEXT = 'Which of the following shifts the supply curve?';

const page = (frame) => {
  const t = frame / CLIP.fps;
  const n = Math.max(0, Math.min(TEXT.length, Math.floor((t - 0.4) * 30)));
  const cx = 420 + 260 * Math.min(1, t / 0.4);
  const cy = 330 + 30 * Math.min(1, t / 0.4);
  return `<!doctype html><html><body style="margin:0;width:${CLIP.width}px;height:${CLIP.height}px;background:#EDE8E0;font-family:-apple-system,system-ui">
  <div style="position:absolute;left:0;top:0;right:0;height:56px;background:#F7F4EF;border-bottom:1px solid #D8D2C8"></div>
  <div style="position:absolute;left:24px;top:16px;width:140px;height:24px;border-radius:6px;background:#D9D3C9"></div>
  <div style="position:absolute;left:370px;top:90px;width:700px;height:900px;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="position:absolute;left:60px;top:60px;width:300px;height:14px;background:#E3DED6"></div>
    <div style="position:absolute;left:60px;top:230px;font-size:19px;color:#1D1D1F">1.&nbsp;&nbsp;${TEXT.slice(0, n)}<span style="border-left:2px solid #0D77C9;margin-left:1px"></span></div>
    ${[0, 1, 2, 3].map((i) => `<div style="position:absolute;left:84px;top:${280 + i * 36}px;width:${260 - i * 30}px;height:12px;background:${t > 2 + i * 0.25 ? '#CFC9BF' : '#F2EFEA'}"></div>`).join('')}
  </div>
  <div style="position:absolute;right:28px;bottom:22px;font:600 64px -apple-system;color:#B8B1A6">${String(frame).padStart(3, '0')}</div>
  <div style="position:absolute;left:28px;bottom:26px;font:600 20px -apple-system;letter-spacing:.2em;color:#B8B1A6">SYNTHETIC TEST CLIP</div>
  <svg style="position:absolute;left:${cx}px;top:${cy}px" width="22" height="30" viewBox="0 0 22 30"><path d="M2 2 L2 24 L8 18 L12 28 L16 26 L12 16 L20 16 Z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>
  </body></html>`;
};

const events = [
  { t: 0.4, kind: 'click', x: 1360, y: 720, label: 'double-click stem' },
  ...Array.from(TEXT, (_, i) => ({ t: 0.4 + (i + 1) / 30, kind: 'key', x: 0, y: 0, label: TEXT[i] })),
  { t: 2.5, kind: 'toggle', x: 1200, y: 60, label: 'EN+中' },
];

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ viewport: { width: CLIP.width, height: CLIP.height }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
const dir = resolve(FAKE_ASSETS, 'clips', CLIP.name);
mkdirSync(dir, { recursive: true });
for (let f = 0; f < CLIP.frames; f++) {
  await p.setContent(page(f));
  await p.screenshot({ path: resolve(dir, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 90 });
}
writeFileSync(
  resolve(FAKE_ASSETS, 'clips', `${CLIP.name}.json`),
  JSON.stringify({ ...CLIP, duration: CLIP.frames / CLIP.fps, events, synthetic: true }, null, 2),
);

mkdirSync(resolve(FAKE_ASSETS, 'stills'), { recursive: true });
await p.setContent(page(150));
await p.screenshot({ path: resolve(FAKE_ASSETS, 'stills/editor-clean.png') });

mkdirSync(resolve(FAKE_ASSETS, 'sheets'), { recursive: true });
await p.setViewportSize({ width: 794, height: 1123 });
await p.setContent(`<!doctype html><body style="margin:0;width:794px;height:1123px;background:#fff;font-family:-apple-system">
  <div style="position:absolute;left:72px;top:64px;font:700 22px -apple-system;color:#1D1D1F">Synthetic sheet</div>
  ${Array.from({ length: 22 }, (_, i) => `<div style="position:absolute;left:72px;top:${150 + i * 40}px;width:${420 + ((i * 97) % 230)}px;height:10px;background:#E4E0DA"></div>`).join('')}
  <div style="position:absolute;right:40px;bottom:30px;font:600 14px -apple-system;letter-spacing:.2em;color:#C0BAB0">SYNTHETIC</div></body>`);
await p.screenshot({ path: resolve(FAKE_ASSETS, 'sheets/quiz-1.png') });
await browser.close();
console.log(`fake assets → ${FAKE_ASSETS}`);
