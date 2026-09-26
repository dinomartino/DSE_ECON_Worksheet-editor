// The draw-diagram clip, adapted from scripts/demo/diagrams.mjs: the same seed (its
// `diagramPlot` projection of content.mjs's unit-space drawing), the same selectors and
// the same in-page helpers (its PAGE_SCRIPT, read from the module), in one tight take.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DIAGRAMS } from '../../demo/content.mjs';
import { openDiagramDoc } from './app.mjs';
import { CAPTURE_BUILD, settle } from './session.mjs';

export const DIAGRAM_DONE_STATE = path.join(CAPTURE_BUILD, 'diagram-done-state.json');
const DEMO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../demo/diagrams.mjs');

/** diagrams.mjs's PAGE_SCRIPT (`window.__demo`: stage, textAt, rows, selection, …), not exported there. */
export function demoPageScript() {
  const match = /const PAGE_SCRIPT = `([\s\S]*?)\n`;/.exec(fs.readFileSync(DEMO, 'utf8'));
  if (!match) throw new Error('capture: PAGE_SCRIPT not found in scripts/demo/diagrams.mjs');
  return new Function(`return \`${match[1]}\n\`;`)();
}

const panel = (page) => page.locator('.zone-dark aside');
const tool = (page, name) => page.locator('.zone-dark header').getByRole('button', { name, exact: true });

/** SVG pixel → screen for the open canvas, checked against the seed's projection. */
async function stageMap(page, seed) {
  const s = await page.evaluate(() => window.__demo.stage());
  if (!s) throw new Error('capture: the drawing canvas is not open');
  if (Math.abs(s.svgWidth - seed.canvas.widthPx) > 0.5 || Math.abs(s.svgHeight - seed.canvas.heightPx) > 0.5) {
    throw new Error(`capture: blank diagram is ${s.svgWidth}×${s.svgHeight}, the seed projected ${seed.canvas.widthPx}×${seed.canvas.heightPx}`);
  }
  return (p) => ({ x: s.left + (p.x * s.width) / s.svgWidth, y: s.top + (p.y * s.height) / s.svgHeight });
}

const along = (line, k) => ({ x: line.from.x + (line.to.x - line.from.x) * k, y: line.from.y + (line.to.y - line.from.y) * k });

export function loadDiagramSeed() {
  return JSON.parse(fs.readFileSync(path.join(CAPTURE_BUILD, 'diagram-seed.json'), 'utf8'));
}

/** Open the diagram question and its canvas (off camera). */
export async function openCanvas(page) {
  await page.evaluate(demoPageScript());
  await openDiagramDoc(page);
  await page.evaluate(() => window.__demo.tagDiagrams());
  const box = await page.locator('[data-demo-diagram="0"]').boundingBox();
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await settle(page, 1200);
}

export const drawDiagramClip = {
  pointer: { x: 1180, y: 560 },
  async prepare({ page }) {
    await openCanvas(page);
  },
  async record(r, { page }) {
    const seed = loadDiagramSeed();
    const map = await stageMap(page, seed);
    const c = seed.canvas;
    const { draw } = DIAGRAMS;
    const text = (t) => () => page.evaluate((x) => window.__demo.textAt(x), t);
    const field = (label) => panel(page).getByLabel(`${label} (English)`);

    const near = { dur: 0.28, dwell: 0.03 }; // panel to panel
    const far = { dur: 0.36, dwell: 0.03 }; // canvas to panel and back

    await r.hold(0.05);
    // Demand and supply: one drag each, then the name.
    await r.click(tool(page, 'Curve'), { ...far, dur: 0.45, label: 'Curve' });
    await r.drag(map(c.demand.from), map(c.demand.to), { dur: 0.6, approach: 0.4, settle: 0.05, label: 'demand' });
    await r.click(field('Label'), { ...far, label: 'Label' });
    await r.type(draw.demand.label, { cps: 8 });
    await r.click(tool(page, 'Curve'), { ...far, label: 'Curve' });
    await r.drag(map(c.supply.from), map(c.supply.to), { dur: 0.6, approach: 0.4, settle: 0.05, label: 'supply' });
    await r.click(field('Label'), { ...far, label: 'Label' });
    await r.type(draw.supply.label, { cps: 8 });

    // E₀: the point snaps to the crossing; name it, drop both guides, tick Q₀ and P₀.
    await r.click(tool(page, 'Point'), { ...far, label: 'Point' });
    const e0 = map(c.e0);
    await r.click({ x: e0.x + 7, y: e0.y - 6 }, { ...far, dwell: 0.06, label: 'E0' });
    await r.click(panel(page).getByRole('button', { name: /^Label E/ }), { ...far, label: 'Label E0' });
    await r.click(panel(page).getByLabel('Drop to x'), { ...near, label: 'Drop to x' });
    await r.click(panel(page).getByLabel('Drop to y'), { ...near, dur: 0.2, label: 'Drop to y' });
    await r.click(field('x-axis tick'), { ...near, label: 'x tick' });
    await r.type('Q0', { cps: 12 });
    await r.click(field('y-axis tick'), { ...near, dur: 0.22, label: 'y tick' });
    await r.type('P0', { cps: 12 });
    for (const tick of ['Q0', 'P0']) {
      await r.dblclick(text(tick), { ...far, gap: 4 });
      await r.hold(0.07);
      await r.press('End');
      await r.click(page.getByRole('button', { name: 'Subscript', exact: true }), { ...near, dur: 0.22, label: 'Subscript' });
      await r.hold(0.05);
      await r.press('Enter');
    }

    // The tax: select S, shift a copy up by the tax.
    await r.click(map(along(c.supply, 0.82)), { ...far, label: 'S' });
    const shiftUp = panel(page).getByTitle(/^Shift up/);
    await r.frame(() => shiftUp.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'smooth' })));
    await r.hold(0.33);
    await r.click(shiftUp, { ...far, label: 'Shift up' });
    const by = panel(page).locator('label').filter({ hasText: /^by/ }).locator('input');
    await r.click(by, { ...near, dur: 0.22, label: 'by' });
    await r.press('Meta+A', { label: 'select' });
    await r.type(String(draw.taxPercent), { cps: 12 });
    await r.press('Tab');
    await r.click(panel(page).getByRole('button', { name: 'Shift a copy' }), { ...near, label: 'Shift a copy' });
    await r.hold(0.15);
    await r.click(map(c.e1), { ...far, label: 'E1' });
    await r.click(panel(page).getByRole('button', { name: /^Label E/ }), { ...far, label: 'Label E1' });

    // Shade ▾ → Tax & subsidy → tax revenue, then the deadweight loss.
    const menu = page.getByRole('menu');
    for (const [i, preset] of ['Tax revenue', 'DWL of a tax'].entries()) {
      await r.click(page.getByRole('button', { name: /Shade/ }), { ...far, label: 'Shade' });
      await r.hold(0.08);
      if (i === 0) await r.click(menu.getByRole('tab', { name: 'Tax & subsidy' }), { ...near, label: 'Tax & subsidy' });
      await r.click(menu.getByText(preset, { exact: true }), { ...near, label: preset });
      await r.hold(0.06);
      const add = menu.getByRole('button', { name: 'Add', exact: true });
      if (await add.count()) await r.click(add, { ...near, label: 'Add' });
      await r.hold(0.12);
    }
    await r.click(page.getByRole('button', { name: 'Done', exact: true }), { ...far, dur: 0.45, label: 'Done' });
    await r.hold(0.1);
    await r.moveTo({ x: 1000, y: 560 }, { dur: 0.7 });
  },
  /** Keep the finished document for the stills, sheets, layers and export. */
  async after({ page, ctx }) {
    await page.evaluate(() => window.__vt.auto(true));
    await settle(page, 2500); // autosave
    fs.writeFileSync(DIAGRAM_DONE_STATE, JSON.stringify(await ctx.storageState()));
  },
};
