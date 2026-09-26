// The diagram film (`npm run demo:diagrams`): a supply-and-demand diagram drawn from
// blank axes through the real canvas, the job teachers otherwise fight Word for. One
// continuous recording, with numbered stills captured along the way (cut out of the
// video). The steps are `diagramStoryboard(seed)`; every gesture lands where the seed's
// `diagramPlot` projection says the unit-space drawing in content.mjs sits.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { DIAGRAMS } from './content.mjs';
import { CONTEXT, CURSOR_SCRIPT, makeDriver } from './flow.mjs';
import { filmSteps } from './record.mjs';

/** Captions, stills, canvas geometry, and the rendered-export overlay, in the page. */
const PAGE_SCRIPT = `
(() => {
  const flat = (s) => (s || '').replace(/[\\u2080-\\u2089]/g, (c) => String(c.charCodeAt(0) - 0x2080)).replace(/\\s+/g, ' ').trim();
  const canvas = () => document.querySelector('.zone-dark.fixed.inset-0');
  const el = (id, css) => {
    let node = document.getElementById(id);
    if (!node) {
      node = document.createElement('div');
      node.id = id;
      node.style.cssText = css;
      document.documentElement.appendChild(node);
    }
    return node;
  };
  window.__demo = {
    caption(text) {
      const c = el('__demo_caption', 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);max-width:880px;padding:11px 20px;border-radius:12px;background:rgba(20,20,20,.88);color:#fff;font:500 17px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;text-align:center;z-index:2147483645;pointer-events:none;opacity:0;transition:opacity .25s ease;box-shadow:0 8px 28px rgba(0,0,0,.28)');
      if (text) c.textContent = text;
      c.style.opacity = text ? '1' : '0';
    },
    /** Hide or show the drawn pointer and the caption, for a clean still. */
    chrome(show) {
      for (const id of ['__demo_cursor', '__demo_caption']) {
        const node = document.getElementById(id);
        if (node) node.style.visibility = show ? '' : 'hidden';
      }
    },
    /** Number the diagrams on the page, in page order. */
    tagDiagrams() {
      const found = [...document.querySelectorAll('#print-root svg')].filter(
        (svg) => svg.getBoundingClientRect().width >= 150 && !svg.closest('[data-answer-graph]'),
      );
      document.querySelectorAll('[data-demo-diagram]').forEach((node) => node.removeAttribute('data-demo-diagram'));
      // On the svg's parent: the svg itself is injected markup, replaced on every redraw.
      found.forEach((svg, i) => svg.parentElement.setAttribute('data-demo-diagram', String(i)));
      return found.length;
    },
    /**
     * The drawing surface on screen, and the size of the SVG it scales: the canvas draws
     * the diagram at its stored pixel size and zooms the box, so SVG pixel p is at
     * left + p * (width / svgWidth).
     */
    stage() {
      const surface = canvas()?.querySelector('div.relative.select-none.bg-white');
      const svg = surface?.querySelector('svg');
      if (!svg) return null;
      const r = surface.getBoundingClientRect();
      return {
        left: r.left, top: r.top, width: r.width, height: r.height,
        svgWidth: Number(svg.getAttribute('width')), svgHeight: Number(svg.getAttribute('height')),
      };
    },
    /** The centre of the canvas text reading \`text\` ("Q0" matches "Q₀"), on screen. */
    textAt(text) {
      const node = [...(canvas()?.querySelectorAll('div.relative.select-none.bg-white svg text') ?? [])]
        .find((t) => flat(t.textContent) === flat(text));
      if (!node) return null;
      const r = node.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    /** Select an element on the open canvas by its row in "On this diagram". */
    selectRow(name) {
      const rows = [...(canvas()?.querySelectorAll('aside button') ?? [])];
      const row = rows.find((b) => flat(b.querySelector('span')?.textContent) === flat(name));
      if (!row) return false;
      row.click();
      return true;
    },
    /** The names listed under "On this diagram", with their kind. */
    rows() {
      return [...(canvas()?.querySelectorAll('aside button') ?? [])]
        .map((b) => [...b.querySelectorAll('span')].map((s) => flat(s.textContent)))
        .filter((spans) => spans.length >= 2)
        .map((spans) => ({ name: spans[0], kind: spans[spans.length - 1].toLowerCase() }));
    },
    /** The selection's highlight on the canvas, in screen pixels. */
    selection() {
      const root = canvas();
      if (!root) return { lines: [], dots: [] };
      const screen = (node, x, y) => {
        const svg = node.ownerSVGElement;
        const p = svg.createSVGPoint();
        p.x = x;
        p.y = y;
        const q = p.matrixTransform(svg.getScreenCTM());
        return { x: q.x, y: q.y };
      };
      const lines = [...root.querySelectorAll('polyline[stroke="#0ea5e9"]')].map((line) =>
        line.getAttribute('points').trim().split(/\\s+/).map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          return screen(line, x, y);
        }),
      );
      const dots = [...root.querySelectorAll('circle[fill="#0ea5e9"]:not([fill-opacity])')].map((c) =>
        screen(c, Number(c.getAttribute('cx')), Number(c.getAttribute('cy'))),
      );
      return { lines, dots };
    },
    /** A full-screen card showing images (the rendered export) with a label under each. */
    showImages(items) {
      const o = el('__demo_overlay', 'position:fixed;inset:0;z-index:2147483600;display:flex;gap:28px;align-items:center;justify-content:center;background:rgba(40,38,34,.94);padding:40px 40px 110px');
      o.innerHTML = '';
      for (const { src, label } of items) {
        const fig = document.createElement('figure');
        fig.style.cssText = 'margin:0;display:flex;flex-direction:column;align-items:center;gap:10px;height:100%';
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'height:calc(100% - 30px);width:auto;background:#fff;box-shadow:0 10px 40px rgba(0,0,0,.45)';
        const cap = document.createElement('figcaption');
        cap.textContent = label;
        cap.style.cssText = 'color:#f4f1ea;font:500 14px/1.3 -apple-system,BlinkMacSystemFont,sans-serif';
        fig.append(img, cap);
        o.append(fig);
      }
      o.style.display = 'flex';
    },
    hideImages() {
      const o = document.getElementById('__demo_overlay');
      if (o) o.remove();
    },
  };
})();
`;

// ---- driving helpers ---------------------------------------------------------------

const say = (d, text) => d.page.evaluate((t) => window.__demo.caption(t), text);

/** Scroll a sidebar control into the middle of its scroller, on camera. */
async function reveal(d, loc) {
  await loc.first().waitFor({ state: 'attached' });
  await loc.first().evaluate((node) => node.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  await d.wait(750);
}

/** The n-th diagram on the page (§ PAGE_SCRIPT.tagDiagrams). */
async function pageDiagram(d, n) {
  await d.page.evaluate(() => window.__demo.tagDiagrams());
  return d.page.locator(`[data-demo-diagram="${n}"]`);
}

async function dblclick(d, loc) {
  await d.hover(loc);
  await d.wait(250);
  const b = await loc.first().boundingBox();
  await d.page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
}

/** Glide to `from`, press, travel to `to` in visible steps, release. */
async function drag(d, from, to, steps = 36) {
  await d.moveTo(from.x, from.y);
  await d.wait(300);
  await d.page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    // Eased, so the stroke starts and lands gently rather than jumping.
    const k = 0.5 - Math.cos((Math.PI * i) / steps) / 2;
    await d.page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    await d.wait(24);
  }
  await d.moveTo(to.x, to.y);
  await d.wait(120);
  await d.page.mouse.up();
}

/** Where a canvas element is on screen, read off camera by selecting its row. */
async function geometry(d, name) {
  return d.cut(async () => {
    if (!(await d.page.evaluate((n) => window.__demo.selectRow(n), name))) {
      const rows = await d.page.evaluate(() => window.__demo.rows());
      throw new Error(`no "${name}" on the canvas (has: ${rows.map((r) => r.name).join(', ')})`);
    }
    await d.wait(120);
    const shape = await d.page.evaluate(() => window.__demo.selection());
    await d.page.keyboard.press('Escape');
    await d.wait(120);
    return shape;
  });
}

/**
 * SVG pixel → screen, for the open canvas. Fails if the block is not the size the seed
 * projected: then the seed's `diagramPlot` numbers describe some other picture.
 */
async function stageMap(d, seed) {
  const s = await d.page.evaluate(() => window.__demo.stage());
  if (!s) throw new Error('the drawing canvas is not open');
  const { widthPx, heightPx } = seed.canvas;
  if (Math.abs(s.svgWidth - widthPx) > 0.5 || Math.abs(s.svgHeight - heightPx) > 0.5) {
    throw new Error(`the blank diagram is ${s.svgWidth}×${s.svgHeight}, the seed projected ${widthPx}×${heightPx}`);
  }
  return (p) => ({ x: s.left + (p.x * s.width) / s.svgWidth, y: s.top + (p.y * s.height) / s.svgHeight });
}

const canvasPanel = (d) => d.page.locator('.zone-dark aside');
const tool = (d, name) => d.page.locator('.zone-dark header').getByRole('button', { name, exact: true });

/** Type into one of the canvas inspector's text fields (its English box). */
async function typeField(d, label, text) {
  await d.click(canvasPanel(d).getByLabel(`${label} (English)`), { hover: 250 });
  await d.wait(200);
  await d.page.keyboard.type(text, { delay: 170 });
  await d.wait(450);
}

/** The same, replacing what the field holds. */
async function retypeField(d, label, text) {
  await d.click(canvasPanel(d).getByLabel(`${label} (English)`), { hover: 250 });
  await d.wait(200);
  await d.page.keyboard.press('Meta+A');
  await d.page.keyboard.type(text, { delay: 170 });
  await d.wait(450);
}

/** A point `k` of the way along a polyline (by length). */
function along(line, k) {
  const lengths = line.slice(1).map((p, i) => Math.hypot(p.x - line[i].x, p.y - line[i].y));
  let left = lengths.reduce((a, b) => a + b, 0) * k;
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i]) {
      const t = lengths[i] ? left / lengths[i] : 0;
      return { x: line[i].x + (line[i + 1].x - line[i].x) * t, y: line[i].y + (line[i + 1].y - line[i].y) * t };
    }
    left -= lengths[i];
  }
  return line[line.length - 1];
}

/** Curve tool, drag from → to, then name it in the inspector. */
async function drawCurve(d, map, line, label) {
  await d.click(tool(d, 'Curve'), { hover: 300 });
  await d.wait(500);
  await drag(d, map(line.from), map(line.to));
  await d.wait(700);
  await typeField(d, 'Label', label);
}

/** Double-click the canvas text reading `raw` (a tick, a curve's name) and lower its last character. */
async function subscriptLast(d, raw) {
  const at = await d.page.evaluate((t) => window.__demo.textAt(t), raw);
  if (!at) throw new Error(`no "${raw}" drawn on the canvas`);
  await d.moveTo(at.x, at.y);
  await d.wait(250);
  await d.page.mouse.dblclick(at.x, at.y);
  await d.wait(500);
  await d.page.keyboard.press('End');
  await d.click(d.page.getByRole('button', { name: 'Subscript', exact: true }), { hover: 300 });
  await d.wait(400);
  await d.page.keyboard.press('Enter');
  await d.wait(500);
}

/** Shade ▾ → group → preset, confirming the curves when the menu asks which. */
async function shade(d, group, preset) {
  const menu = d.page.getByRole('menu');
  await d.click(d.page.getByRole('button', { name: /Shade/ }));
  await d.wait(600);
  await d.click(menu.getByRole('tab', { name: group }));
  await d.wait(700);
  await d.click(menu.getByText(preset, { exact: true }));
  await d.wait(600);
  const add = menu.getByRole('button', { name: 'Add', exact: true });
  if (await add.count()) {
    await d.wait(400);
    await d.click(add);
  }
  await d.wait(900);
}

/**
 * Click empty paper in the canvas's top-right corner: a click on nothing clears the
 * selection. Not Escape, which closes the canvas when nothing is selected.
 */
async function deselect(d, map, seed) {
  const at = map({ x: seed.canvas.widthPx * 0.93, y: seed.canvas.heightPx * 0.08 });
  await d.moveTo(at.x, at.y);
  await d.wait(150);
  await d.page.mouse.click(at.x, at.y);
}

const canvasDone = async (d) => {
  await d.click(d.page.getByRole('button', { name: 'Done', exact: true }));
  await d.wait(700);
};

// ---- the film ------------------------------------------------------------------------

/**
 * The storyboard: blank axes → D and S → E₀ → a tax shifts S up (S₁, E₁) → shaded
 * revenue and deadweight loss → on the page → exported to Word → templates, in passing.
 */
export function diagramStoryboard(seed) {
  const notes = [];
  const steps = [];
  const { draw } = DIAGRAMS;
  /** SVG pixel → screen, set when the canvas opens. */
  let map = null;
  const within = (line, k) => ({
    x: line.from.x + (line.to.x - line.from.x) * k,
    y: line.from.y + (line.to.y - line.from.y) * k,
  });

  steps.push({
    name: 'The question',
    caption: 'Opens a worksheet with a per-unit tax question and no diagram yet. In Word, this diagram means a pile of loose lines and text boxes.',
    async run(d) {
      await say(d, 'In Word, a supply-and-demand diagram is a pile of loose lines and text boxes. Here it takes about a minute.');
      await d.wait(1200);
      await d.click(d.page.getByRole('button', { name: /S5 Market Intervention/ }));
      await d.page.waitForSelector('#print-root .paper');
      await d.wait(700);
      await d.cut(async () => {
        const hint = d.page.getByRole('button', { name: 'Dismiss hint' });
        if (await hint.count()) await hint.click();
      });
      await d.hover(d.page.locator('#print-root').getByText('The government imposes'));
      await d.wait(2400);
      await d.still('question', 'The question, before the diagram');
    },
  });

  steps.push({
    name: 'Blank axes',
    caption: 'Selects the question stem and chooses **+ Diagram ▾ → Blank axes**.',
    async run(d) {
      await say(d, 'Select the question, then + Diagram ▾ → Blank axes.');
      await d.click(d.page.locator('#print-root').getByText('The government imposes'));
      await d.wait(800);
      await d.click(d.page.getByRole('button', { name: /\+ Diagram/ }).first());
      await d.wait(900);
      const card = d.page
        .locator('[data-template-group] button')
        .filter({ has: d.page.locator('span.truncate', { hasText: /^Blank axes$/ }) });
      await d.click(card);
      await d.wait(1400);
    },
  });

  steps.push({
    name: 'Open the canvas',
    caption: 'Double-clicks the new diagram. The drawing canvas opens on axes already titled Price and Quantity.',
    async run(d) {
      await say(d, 'Double-click it to draw. The axes are already titled Price and Quantity.');
      await dblclick(d, await pageDiagram(d, 0));
      await d.wait(1500);
      map = await stageMap(d, seed);
      await d.still('blank-canvas', 'The drawing canvas on blank axes');
    },
  });

  steps.push({
    name: 'Demand',
    caption: `Picks **Curve**, drags one stroke down to the right, and types "${draw.demand.label}" as its label.`,
    async run(d) {
      await say(d, `Curve tool: one drag draws demand. Name it ${draw.demand.label}.`);
      await drawCurve(d, map, seed.canvas.demand, draw.demand.label);
      await d.wait(600);
    },
  });

  steps.push({
    name: 'Supply',
    caption: `Draws supply the same way, upward, and labels it "${draw.supply.label}".`,
    async run(d) {
      await say(d, `Again for supply: ${draw.supply.label}.`);
      await drawCurve(d, map, seed.canvas.supply, draw.supply.label);
      await d.wait(500);
      await deselect(d, map, seed);
      await d.wait(800);
      await d.still('demand-supply', 'Demand and supply, each drawn with one drag');
    },
  });
  /** Point tool, click a little off `at` so the snap is visible, name it, drop the guides. */
  const markPoint = async (d, at, { dwell = 900 } = {}) => {
    await d.click(tool(d, 'Point'), { hover: 300 });
    await d.wait(500);
    const aim = map(at);
    await d.moveTo(aim.x + 7, aim.y - 6);
    await d.wait(dwell);
    await d.page.mouse.click(aim.x + 7, aim.y - 6);
    await d.wait(800);
    await d.click(canvasPanel(d).getByRole('button', { name: /^Label E/ }), { hover: 300 });
    await d.wait(600);
    await d.click(canvasPanel(d).getByLabel('Drop to x'), { hover: 250 });
    await d.wait(500);
    await d.click(canvasPanel(d).getByLabel('Drop to y'), { hover: 250 });
    await d.wait(700);
  };
  /** The selected point's Q and P ticks, numbered n, with the n lowered on the canvas. */
  const tickPoint = async (d, n) => {
    await typeField(d, 'x-axis tick', `Q${n}`);
    await typeField(d, 'y-axis tick', `P${n}`);
    await subscriptLast(d, `Q${n}`);
    await subscriptLast(d, `P${n}`);
    await deselect(d, map, seed);
    await d.wait(700);
  };

  steps.push({
    name: 'Equilibrium',
    caption: 'Picks **Point** and clicks near the crossing: the point snaps onto it. **Label E₀**, then **Drop to x** and **Drop to y** draw the dashed guides.',
    async run(d) {
      await say(d, 'Point tool: click near the crossing and it snaps on. Name it E₀, with dashed lines to both axes.');
      await markPoint(d, seed.canvas.e0);
      await d.wait(300);
    },
  });

  steps.push({
    name: 'Axis marks',
    speed: 2,
    caption: 'Types "Q0" and "P0" as the point\'s axis ticks, then double-clicks each on the canvas and presses **X₂** to lower the 0: Q₀ and P₀.',
    async run(d) {
      await say(d, 'Mark Q₀ and P₀ on the axes. X₂ turns the 0 into a subscript.');
      await tickPoint(d, 0);
      await d.wait(300);
      await d.still('equilibrium', 'E₀, snapped to the crossing, with P₀ and Q₀');
    },
  });

  if (seed.shiftNamesCopy) {
    steps.push({
      name: 'The tax',
      caption: `Clicks S, chooses **Shift curve ↑** by ${draw.taxPercent}% and **Shift a copy**: S₁, the shift arrow and the new equilibrium with P₁ and Q₁ appear. **Label E₁** names it.`,
      async run(d) {
        await say(d, 'The tax: select S and shift a copy up. S₁, the arrow and the new equilibrium appear, already marked P₁ and Q₁.');
        const grab = map(within(seed.canvas.supply, 0.82));
        await d.moveTo(grab.x, grab.y);
        await d.wait(400);
        await d.page.mouse.click(grab.x, grab.y);
        await d.wait(800);
        const panel = canvasPanel(d);
        await reveal(d, panel.getByRole('button', { name: 'Shift a copy' }));
        await d.click(panel.getByTitle(/^Shift up/), { hover: 300 });
        await d.wait(500);
        const by = panel.locator('label').filter({ hasText: /^by/ }).locator('input');
        await d.click(by);
        await d.page.keyboard.press('Meta+A');
        await d.page.keyboard.type(String(draw.taxPercent), { delay: 150 });
        await d.page.keyboard.press('Tab');
        await d.wait(500);
        await d.click(panel.getByRole('button', { name: 'Shift a copy' }), { hover: 350 });
        await d.wait(1600);
        // The copy stays selected, its inspector over the "On this diagram" list.
        await deselect(d, map, seed);
        await d.wait(900);
        // The new equilibrium: click its dot, then one click names it.
        const e1 = (await geometry(d, 'Point (Q1, P1)')).dots[0];
        if (!e1) throw new Error('the shift made no new equilibrium');
        await d.moveTo(e1.x, e1.y);
        await d.wait(300);
        await d.page.mouse.click(e1.x, e1.y);
        await d.wait(700);
        await d.click(panel.getByRole('button', { name: /^Label E/ }), { hover: 300 });
        await d.wait(700);
        await deselect(d, map, seed);
        await d.wait(1000);
        await d.still('tax', 'The tax: S shifted up to S₁, with the new equilibrium E₁');
      },
    });
  } else {
    notes.push(
      'The tax is drawn by duplicating S and dragging the copy up, not with **Shift a copy**: in this build ' +
        'that names a copy of an English-only label S₅₀ (and its ticks P₅₀, Q₅₀), because the empty Chinese ' +
        'label counts as taken (`src/model/diagramShift.ts:shiftedLabel`).',
    );
    steps.push({
      name: 'The tax',
      speed: 1.5,
      caption: `Clicks S, **Duplicate**, and drags the copy up by the tax (${draw.taxPercent}% of the price axis). Renames it S1 and lowers the 1 with **X₂**: S₁. Draws the shift **Arrow** from S to S₁.`,
      async run(d) {
        await say(d, 'The tax shifts supply up. Select S, duplicate it, and drag the copy up.');
        const grab = map(within(seed.canvas.supply, 0.82));
        await d.moveTo(grab.x, grab.y);
        await d.wait(400);
        await d.page.mouse.click(grab.x, grab.y);
        await d.wait(700);
        await d.click(tool(d, 'Duplicate'), { hover: 350 });
        await d.wait(800);
        // The copy lands a step down and right, selected; its highlight says exactly where.
        const copy = (await d.page.evaluate(() => window.__demo.selection())).lines[0];
        if (!copy) throw new Error('Duplicate left no selected copy');
        const target = map(seed.canvas.taxed.from);
        const from = along(copy, 0.55);
        await drag(d, from, { x: from.x + target.x - copy[0].x, y: from.y + target.y - copy[0].y }, 40);
        await d.wait(700);
        await say(d, 'Name the copy S₁, and draw the shift arrow.');
        const taxed = map(within(seed.canvas.taxed, 0.82));
        await d.moveTo(taxed.x, taxed.y);
        await d.wait(300);
        await d.page.mouse.click(taxed.x, taxed.y);
        await d.wait(600);
        await retypeField(d, 'Label', `${draw.supply.label}1`);
        await subscriptLast(d, `${draw.supply.label}1`);
        // The arrow: from just above S to just below S₁, straight up.
        const k = 0.72;
        const base = within(seed.canvas.supply, k);
        const rise = seed.canvas.unitY * (draw.taxPercent / 100);
        await d.click(tool(d, 'Arrow'), { hover: 300 });
        await d.wait(400);
        await drag(d, map({ x: base.x, y: base.y - rise * 0.15 }), map({ x: base.x, y: base.y - rise * 0.85 }), 24);
        await deselect(d, map, seed);
        await d.wait(1000);
      },
    });
    steps.push({
      name: 'New equilibrium',
      speed: 2,
      caption: 'Marks the new crossing the same way: **Point**, **Label E₁**, both dashed guides, and Q₁ and P₁.',
      async run(d) {
        await say(d, 'Mark the new equilibrium the same way: E₁, with Q₁ and P₁.');
        await markPoint(d, seed.canvas.e1, { dwell: 500 });
        await tickPoint(d, 1);
        await d.wait(600);
        await d.still('tax', 'The tax: S shifted up to S₁, with the new equilibrium E₁');
      },
    });
  }

  steps.push({
    name: 'Shade',
    caption: 'Opens **Shade ▾ → Tax & subsidy** and adds **Tax revenue**, then **DWL of a tax**: both found from the curves already drawn.',
    async run(d) {
      await say(d, 'Shade ▾ finds the areas from the curves: the tax revenue, then the deadweight loss.');
      await shade(d, 'Tax & subsidy', 'Tax revenue');
      await shade(d, 'Tax & subsidy', 'DWL of a tax');
      await deselect(d, map, seed);
      await d.wait(1600);
      await d.still('shaded', 'Tax revenue and the deadweight loss, shaded');
    },
  });

  steps.push({
    name: 'On the page',
    caption: 'Clicks **Done**. The diagram sits in the question on the printed page.',
    async run(d) {
      await say(d, 'Done. The diagram is in the question, exactly as it will print.');
      await canvasDone(d);
      await d.hover(await pageDiagram(d, 0));
      await d.wait(2600);
      await d.still('on-page', 'The finished diagram in the question, on the page');
    },
  });

  steps.push({
    name: 'Export',
    caption: 'Opens **Export…** and exports the question paper as .docx.',
    async run(d) {
      await say(d, 'Export to Word.');
      await d.click(d.page.getByRole('button', { name: /Export/ }).first());
      await d.wait(1200);
      const dialog = d.page.getByRole('dialog');
      await d.download(() => d.click(dialog.getByRole('button', { name: /^Export/ }), { hover: 400 }));
      await d.wait(1000);
    },
  });

  steps.push({
    name: 'The .docx',
    caption: 'The downloaded file, opened in LibreOffice: the diagram is one picture in the Word file.',
    async run(d) {
      const shown = await d.cut(() => d.renderExports());
      if (!shown) {
        await say(d, 'Done: the question paper is in Downloads.');
        await d.wait(2000);
        return;
      }
      await say(d, shown.caption);
      await d.page.evaluate((items) => window.__demo.showImages(items), shown.items);
      await d.wait(3800);
      await d.still('docx', shown.still);
      await d.page.evaluate(() => window.__demo.hideImages());
      await d.wait(500);
    },
  });

  steps.push({
    name: 'Templates',
    caption: `Opens **+ Diagram ▾** for a moment: ${seed.templateCount} ready-made templates, edited on the same canvas.`,
    async run(d) {
      await say(d, `Want a head start? + Diagram ▾ also has ${seed.templateCount} ready-made templates, edited the same way.`);
      // Centred first: the popover opens below its trigger and is only as tall as the room left.
      const trigger = d.page.getByRole('button', { name: /\+ Diagram/ }).first();
      await reveal(d, trigger);
      await d.click(trigger);
      await d.wait(2600);
      await d.still('templates', `+ Diagram ▾: blank axes and ${seed.templateCount} ready-made templates`);
      await d.page.keyboard.press('Escape');
      await d.wait(700);
      await say(d, '');
      await d.wait(600);
    },
  });

  return { steps, notes };
}

// ---- recording ---------------------------------------------------------------------

/**
 * Seed the worksheet, film the storyboard at 2× (the stills are 2× page screenshots),
 * and keep the exported file. Returns the film, the stills (PNG paths), the exports,
 * and notes on anything left out.
 */
export async function recordDiagrams({ browser, url, root, tmpDir, outDir, log }) {
  log('diagrams: seeding…');
  const seedFile = path.join(tmpDir, 'diagram-seed.json');
  const emit = spawnSync('npx', ['vitest', 'run', 'scripts/demo/diagrams-seed.test.ts'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, DEMO_SEED: seedFile },
  });
  if (emit.status !== 0) throw new Error(`diagrams: the seed failed\n${emit.stdout}\n${emit.stderr}`);
  const seed = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
  const { steps, notes } = diagramStoryboard(seed);

  const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
  const doc = JSON.stringify(seed.worksheet);
  const index = JSON.stringify([{ id: seed.worksheet.id, title: seed.worksheet.title.en.map((r) => r.text).join(''), updatedAt: seed.worksheet.updatedAt }]);
  const ctx = await browser.newContext({ ...CONTEXT, deviceScaleFactor: 2, acceptDownloads: true });
  await ctx.addInitScript(
    ([indexJson, key, json, seen]) => {
      // Seeded once per context: a reload must keep the film's own edits.
      if (window.localStorage.getItem('__demo_seeded')) return;
      window.localStorage.setItem('econ-worksheet-index', indexJson);
      window.localStorage.setItem(key, json);
      // Not a first run and not an update: no "What's new" over the start screen.
      window.localStorage.setItem('econ-worksheet-last-seen-version', seen);
      window.localStorage.setItem('__demo_seeded', '1');
    },
    [index, `econ-worksheet:${seed.worksheet.id}`, doc, version],
  );
  await ctx.addInitScript(CURSOR_SCRIPT);
  await ctx.addInitScript(PAGE_SCRIPT);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => log(`  page error: ${e.message}`));
  page.setDefaultTimeout(10_000); // a renamed control fails the film fast
  const d = makeDriver(page, { smooth: true, url });

  const stills = [];
  const exportDir = path.join(outDir, 'export');
  fs.mkdirSync(exportDir, { recursive: true });
  const downloads = [];
  d.still = async (slug, caption) => {
    await d.cut(async () => {
      await page.evaluate(() => window.__demo.chrome(false));
      const file = `${String(stills.length + 1).padStart(2, '0')}-${slug}`;
      const png = path.join(tmpDir, `${file}.png`);
      await page.screenshot({ path: png });
      stills.push({ file, caption, png });
      await page.evaluate(() => window.__demo.chrome(true));
    });
  };
  d.download = async (trigger) => {
    const [download] = await Promise.all([page.waitForEvent('download'), trigger()]);
    const target = path.join(exportDir, download.suggestedFilename());
    await download.saveAs(target);
    downloads.push(target);
  };
  d.renderExports = () => renderExports({ downloads, exportDir, tmpDir, notes, log });

  await page.goto(url, { waitUntil: 'networkidle' });
  await d.wait(800);
  await page.mouse.move(820, 520);
  const rec = await filmSteps({ ctx, page, d, steps, tmpDir, log });
  await ctx.close();
  return { rec, stills, downloads, notes };
}

/**
 * Open each downloaded .docx the way a teacher would: LibreOffice renders page 1 to PNG.
 * Returns what to show on camera, or null (and a note) when `soffice` is missing.
 */
async function renderExports({ downloads, exportDir, tmpDir, notes, log }) {
  const counts = [];
  for (const file of downloads) {
    const zip = await JSZip.loadAsync(fs.readFileSync(file));
    counts.push(Object.keys(zip.files).filter((name) => /^word\/media\/.+\.png$/.test(name)).length);
  }
  const has = (bin) => spawnSync('which', [bin]).status === 0;
  if (!has('soffice') || !has('pdftoppm')) {
    notes.push('The rendered .docx page was skipped: `soffice` (LibreOffice) and `pdftoppm` must both be on PATH.');
    return null;
  }
  const items = [];
  const profile = `file://${path.join(tmpDir, 'lo-profile')}`;
  for (const [i, file] of downloads.entries()) {
    const work = path.join(tmpDir, `render-${i}.docx`);
    fs.copyFileSync(file, work);
    execFileSync('soffice', [`-env:UserInstallation=${profile}`, '--headless', '--convert-to', 'pdf', '--outdir', tmpDir, work], { stdio: 'ignore' });
    const base = path.join(exportDir, `${path.basename(file, '.docx')} page 1`);
    execFileSync('pdftoppm', ['-r', '110', '-png', '-f', '1', '-l', '1', '-singlefile', path.join(tmpDir, `render-${i}.pdf`), base]);
    const png = `${base}.png`;
    const kind = /Answer key/.test(file) ? 'Answer key' : /Teacher/.test(file) ? 'Teacher copy' : 'Question paper';
    items.push({
      src: `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`,
      label: `${kind} · ${counts[i]} ${counts[i] === 1 ? 'diagram' : 'diagrams'} as PNG`,
    });
    log(`  rendered ${path.basename(png)} (${counts[i]} PNG in the .docx)`);
  }
  return {
    items,
    caption: 'Opened in LibreOffice: the diagram is one picture in the Word file, so nothing can slide out of place.',
    still: `The exported .docx, page 1, rendered by LibreOffice (${counts.join(' and ')} PNG ${counts.length === 1 && counts[0] === 1 ? 'diagram' : 'diagrams'})`,
  };
}
