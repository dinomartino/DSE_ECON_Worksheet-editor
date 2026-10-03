#!/usr/bin/env node
// Stills of a scene file that is not in the timeline (stage ?lab=<id>), e.g. scenes/_lab.js:
//   node scripts/film2/tools/lab.mjs [--scene=_lab] [--dur=8] --at=0.5,2,3.5 [--w=960]
// → $FILM_OUT/lab/<scene>-<t>.png. Also prints the scene's shot-list lint (lib/camera.js).
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { OUT } from '../paths.mjs';
import { serve } from './serve.mjs';
import { launch, openStage } from '../../film/tools/chrome.mjs';

const a = Object.fromEntries(process.argv.slice(2).map((x) => /^--([^=]+)(?:=(.*))?$/.exec(x)).filter(Boolean).map((m) => [m[1], m[2] ?? true]));
const scene = a.scene ?? '_lab', dur = Number(a.dur ?? 8), w = Number(a.w ?? 960), h = Math.round((w * 9) / 16);
const times = String(a.at ?? '1').split(',').map(Number);
const dir = resolve(OUT, 'lab');
mkdirSync(dir, { recursive: true });
const server = await serve();
const browser = await launch();
try {
  const { context, page, logs } = await openStage(browser, server.url, { w, h, fps: 60, shutter: 1, extra: `&lab=${scene}&labdur=${dur}` });
  const { problems } = await page.evaluate(() => window.film.shots());
  for (const p of problems) console.log(`shot lint: ${p}`);
  for (const t of times) {
    await page.evaluate((x) => window.film.seek(x), t);
    const file = resolve(dir, `${scene}-${t.toFixed(3)}.png`);
    await page.screenshot({ path: file });
    console.log(file);
  }
  if (logs.length) console.log(logs.join('\n'));
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
