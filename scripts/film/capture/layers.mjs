// The finished diagram split into registration-aligned transparent layers. The page's own
// SVG (as `diagramSvg` drew it for the printed sheet) is classified element by element
// against the stored diagram — its emission order is fixed: ground, area fills, axes,
// axis texts, curves, arrows, spans, points, labels, area labels — then rasterised
// once per layer at the same size, everything else hidden.
import fs from 'node:fs';
import path from 'node:path';
import { DIAGRAMS } from '../../demo/content.mjs';
import { CONTEXT_OPTIONS } from './session.mjs';

export const LAYERS = ['areas', 'axes', 'guides', 'curves', 'shift', 'points'];
const WIDTH = 1200; // CSS px; ×2 → 2400 px frames

/** In the page: the layer of each child of `svg` (a markup string), from `model`. */
function classify(svgMarkup, model) {
  const root = new DOMParser().parseFromString(svgMarkup, 'image/svg+xml').documentElement;
  const kids = [...root.children];
  const out = [];
  const flat = (runs) => (runs ?? []).map((r) => r.text).join('');
  const side = (bi) => (flat(bi?.en).trim() ? bi.en : bi?.zh ?? []);
  const lines = (bi) => {
    const text = flat(side(bi));
    return text.trim() ? text.replace(/\r\n?/g, '\n').split('\n').length : 0;
  };
  const tag = (i) => kids[i]?.tagName.toLowerCase();
  const fail = (why) => {
    throw new Error(`layers: ${why} at child ${out.length} <${tag(out.length)}> (of ${kids.length})`);
  };
  const take = (layer, n = 1, want) => {
    for (let k = 0; k < n; k++) {
      if (out.length >= kids.length) fail(`ran out of elements for ${layer}`);
      if (want && tag(out.length) !== want) fail(`expected <${want}> for ${layer}`);
      out.push(layer);
    }
  };
  const text = (layer, bi) => {
    const n = lines(bi);
    const expect = flat(side(bi)).replace(/\s+/g, '');
    const got = kids.slice(out.length, out.length + n).map((k) => k.textContent).join('').replace(/\s+/g, '');
    if (n && got !== expect) fail(`${layer} text "${got}" is not the model's "${expect}"`);
    take(layer, n, 'text');
  };

  take('ground', 1, 'rect');
  const firstHead = kids.findIndex((k) => k.hasAttribute('data-arrowhead'));
  if (firstHead < 2) fail('no axis arrowhead');
  while (out.length < firstHead - 1) take('areas');
  take('axes', 4, 'path');
  while (tag(out.length) === 'text') {
    const style = kids[out.length].getAttribute('style') ?? '';
    take(/bold|underline/.test(style) ? 'axes' : 'guides');
  }
  for (const curve of model.curves) {
    if ((curve.points?.length ?? 0) < 2) continue;
    const runs = side(curve.label);
    const shifted = runs.length > 0 && runs[runs.length - 1].vertAlign === 'subscript';
    const layer = shifted ? 'shift' : 'curves';
    if (!kids[out.length]?.getAttribute('stroke-linejoin')) fail('expected a curve path');
    take(layer, 1, 'path');
    text(layer, curve.label);
  }
  for (const arrow of model.arrows ?? []) {
    take('shift', 1, 'path');
    if (!kids[out.length]?.hasAttribute('data-arrowhead')) fail('expected an arrowhead');
    take('shift', 1, 'path');
    text('shift', arrow.label);
  }
  if ((model.spans ?? []).length) fail('spans are not split yet');
  for (const point of model.points) {
    take('guides', (point.dropTo ?? []).length, 'path');
    if (point.dot !== false) take('points', 1, 'circle');
    text('points', point.label);
    text('guides', point.xTickLabel);
    text('guides', point.yTickLabel);
  }
  for (const label of model.labels ?? []) text('curves', label.text);
  for (const area of model.areas ?? []) {
    if (!lines(area.label)) continue;
    if (kids[out.length]?.hasAttribute('data-leader')) take('areas', 2, 'path');
    text('areas', area.label);
  }
  if (out.length !== kids.length) fail(`${kids.length - out.length} elements left over`);
  return out;
}

/** The page's diagram and its stored model (the page must be in print preview). */
async function readDiagram(page) {
  return page.evaluate((title) => {
    window.__demo.tagDiagrams();
    const svg = document.querySelector('[data-demo-diagram="0"] svg');
    const docs = Object.keys(localStorage).filter((k) => k.startsWith('econ-worksheet:')).map((k) => JSON.parse(localStorage.getItem(k)));
    const doc = docs.find((d) => (d.title?.en ?? []).map((r) => r.text).join('') === title);
    const block = doc?.questions.flatMap((q) => q.blocks).find((b) => b.kind === 'diagram');
    return { svg: svg?.outerHTML, model: block?.diagram };
  }, DIAGRAMS.title);
}

export async function splitDiagram({ browser, page, outDir, reviewDir, log = () => {} }) {
  const { svg, model } = await readDiagram(page);
  if (!svg || !model) throw new Error('layers: no diagram on the page, or no model in storage');
  const layerOf = await page.evaluate(`(${classify.toString()})(${JSON.stringify(svg)}, ${JSON.stringify(model)})`);

  const ctx = await browser.newContext({ ...CONTEXT_OPTIONS, viewport: { width: WIDTH + 40, height: 1100 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage();
  await p.setContent(`<!doctype html><html><body style="margin:0;background:transparent"><div id="d" style="display:inline-block">${svg}</div></body></html>`);
  await p.evaluate(() => document.fonts.ready);
  const size = await p.evaluate((w) => {
    const el = document.querySelector('#d svg');
    const [, , vw, vh] = el.getAttribute('viewBox').split(/\s+/).map(Number);
    el.setAttribute('width', String(w));
    el.setAttribute('height', String((w * vh) / vw));
    return { w, h: (w * vh) / vw };
  }, WIDTH);
  const element = p.locator('#d svg');
  fs.mkdirSync(outDir, { recursive: true });
  const shoot = async (name, keep) => {
    await p.evaluate(([layers, keepList]) => {
      [...document.querySelector('#d svg').children].forEach((el, i) => {
        el.style.visibility = layers[i] !== 'ground' && keepList.includes(layers[i]) ? 'visible' : 'hidden';
      });
    }, [layerOf, keep]);
    const file = path.join(outDir, `${name}.png`);
    await element.screenshot({ path: file, omitBackground: true, animations: 'disabled', caret: 'hide' });
    return file;
  };
  await shoot('full', LAYERS);
  for (const layer of LAYERS) await shoot(layer, [layer]);

  // Composite the layers (in LAYERS order) and diff against full.png.
  const images = Object.fromEntries(['full', ...LAYERS].map((n) => [n, `data:image/png;base64,${fs.readFileSync(path.join(outDir, `${n}.png`)).toString('base64')}`]));
  const check = await p.evaluate(async ({ images: srcs, order }) => {
    const load = (src) => new Promise((resolve) => { const im = new Image(); im.onload = () => resolve(im); im.src = src; });
    const full = await load(srcs.full);
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const a = canvas(full.width, full.height).getContext('2d');
    a.drawImage(full, 0, 0);
    const b = canvas(full.width, full.height).getContext('2d');
    const sizes = [];
    for (const name of order) {
      const im = await load(srcs[name]);
      sizes.push([name, im.width, im.height]);
      b.drawImage(im, 0, 0);
    }
    const da = a.getImageData(0, 0, full.width, full.height).data;
    const db = b.getImageData(0, 0, full.width, full.height).data;
    let sum = 0;
    let max = 0;
    let over = 0;
    const diff = canvas(full.width, full.height).getContext('2d');
    const out = diff.createImageData(full.width, full.height);
    for (let i = 0; i < da.length; i += 4) {
      // Compare premultiplied over white, the way the layers will be seen on paper.
      const px = (d, k) => (d[k] * d[i + 3] + 255 * (255 - d[i + 3])) / 255;
      const e = Math.max(Math.abs(px(da, i) - px(db, i)), Math.abs(px(da, i + 1) - px(db, i + 1)), Math.abs(px(da, i + 2) - px(db, i + 2)));
      sum += e;
      if (e > max) max = e;
      if (e > 8) over++;
      out.data[i] = 255;
      out.data[i + 1] = 255 - Math.min(255, e * 4);
      out.data[i + 2] = 255 - Math.min(255, e * 4);
      out.data[i + 3] = 255;
    }
    diff.putImageData(out, 0, 0);
    return {
      width: full.width, height: full.height, sizes,
      meanDiff: +(sum / (da.length / 4)).toFixed(4), maxDiff: Math.round(max), pixelsOver8: over,
      diffPng: diff.canvas.toDataURL('image/png'),
    };
  }, { images, order: LAYERS });
  await ctx.close();

  const aligned = check.sizes.every(([, w, h]) => w === check.width && h === check.height);
  if (!aligned) throw new Error(`layers: sizes differ ${JSON.stringify(check.sizes)}`);
  fs.mkdirSync(reviewDir, { recursive: true });
  fs.writeFileSync(path.join(reviewDir, 'diagram-composite-diff.png'), Buffer.from(check.diffPng.split(',')[1], 'base64'));
  const counts = Object.fromEntries(['ground', ...LAYERS].map((l) => [l, layerOf.filter((x) => x === l).length]));
  const report = {
    width: check.width, height: check.height, cssWidth: size.w, scale: 2,
    order: LAYERS, elements: counts,
    check: { meanDiff: check.meanDiff, maxDiff: check.maxDiff, pixelsOver8: check.pixelsOver8, of: check.width * check.height },
    note: 'Layers composited in `order` and compared with full.png over white; differences are only where layers overlap in a different paint order.',
  };
  fs.writeFileSync(path.join(outDir, 'layers.json'), JSON.stringify(report, null, 1));
  log(`  layers: ${JSON.stringify(counts)}`);
  return { layers: LAYERS, width: check.width, height: check.height, check: report.check };
}
