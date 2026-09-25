// The diagram film (`npm run demo:diagrams`): one continuous recording of the diagram
// workflow, with numbered stills captured along the way (cut out of the video). The
// steps are `diagramStoryboard(seed)`; a step that drags a curve to show something
// following it is only filmed when the template in this build really follows.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { CONTEXT, CURSOR_SCRIPT, makeDriver } from './flow.mjs';
import { filmSteps } from './record.mjs';

/** Captions, stills, a curve's geometry, and the rendered-export overlay, in the page. */
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
    /** Number the diagrams on the page (not the graph answer spaces), in page order. */
    tagDiagrams() {
      const found = [...document.querySelectorAll('#print-root svg')].filter(
        (svg) => svg.getBoundingClientRect().width >= 150 && !svg.closest('[data-answer-graph]'),
      );
      document.querySelectorAll('[data-demo-diagram]').forEach((node) => node.removeAttribute('data-demo-diagram'));
      // On the svg's parent: the svg itself is injected markup, replaced on every redraw.
      found.forEach((svg, i) => svg.parentElement.setAttribute('data-demo-diagram', String(i)));
      return found.length;
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
async function drag(d, from, to, steps = 28) {
  await d.moveTo(from.x, from.y);
  await d.wait(250);
  await d.page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    await d.page.mouse.move(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k);
    await d.wait(22);
  }
  await d.moveTo(to.x, to.y);
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

/** Grab curve `name` on the canvas and drag it by (dx, dy) screen pixels. */
async function dragCurve(d, name, dx, dy, k = 0.72) {
  const { lines } = await geometry(d, name);
  if (!lines[0]) throw new Error(`curve "${name}" has no highlight on the canvas`);
  const grab = along(lines[0], k);
  await drag(d, grab, { x: grab.x + dx, y: grab.y + dy });
}

const canvasDone = async (d) => {
  await d.click(d.page.getByRole('button', { name: 'Done', exact: true }));
  await d.wait(700);
};

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
    await d.wait(500);
    await d.click(add);
  }
  await d.wait(900);
}

/** ↔ Span → Bracket, On the x-axis, then click E₁ and E₀: a bracket from Q₁ to Q₀. */
async function addBracket(d) {
  const e1 = (await geometry(d, 'Point (Q1, P1)')).dots[0];
  const e0 = (await geometry(d, 'Point (Q0, P0)')).dots[0];
  await d.click(d.page.getByRole('button', { name: /Span/ }).first());
  await d.wait(500);
  for (const [label, value] of [['Span style', 'bracket'], ['Span position', 'x']]) {
    const select = d.page.getByLabel(label);
    await d.hover(select);
    await d.wait(300);
    await select.selectOption(value);
    await d.wait(500);
  }
  for (const end of [e1, e0]) {
    await d.moveTo(end.x, end.y);
    await d.wait(300);
    await d.page.mouse.click(end.x, end.y);
    await d.wait(600);
  }
  await d.page.keyboard.press('Escape');
  await d.wait(900);
}

/** Open the template popover from `trigger`, search, and pick the card named `name`. */
async function pickTemplate(d, trigger, search, name) {
  // Centred first: the popover opens below its trigger and is only as tall as the room left.
  await reveal(d, trigger);
  await d.click(trigger);
  await d.wait(700);
  await d.page.keyboard.type(search, { delay: 90 });
  await d.wait(700);
  const card = d.page
    .locator('[data-template-group] button')
    .filter({ has: d.page.locator('span.truncate', { hasText: new RegExp(`^${name}$`) }) });
  await card.first().evaluate((node) => node.scrollIntoView({ block: 'nearest' }));
  await d.click(card);
  await d.wait(1100);
}

/** The canvas curve whose name starts with one of `prefixes`, from the seed's report. */
const curveNamed = (info, prefixes) =>
  info.curves.find((c) => prefixes.some((p) => c.startsWith(p)));

// ---- the film ------------------------------------------------------------------------

/**
 * The storyboard for this build. `seed.templates` says what each template holds, so a
 * "drag it and watch it follow" beat is filmed only when something does follow; each
 * beat left out is returned in `notes` for the README.
 */
export function diagramStoryboard(seed) {
  const t = seed.templates;
  const notes = [];
  const steps = [];
  const tax = t['per-unit-tax'];
  const taxFollows = tax.anchoredPoints.length > 0;
  const s1 = curveNamed(tax, ['S1']);
  // The bracket goes on the stem's figure unless its template already marks Q₀–Q₁ on
  // the x-axis; then it goes on the model answer, which starts with no spans.
  const spanOnStem = !tax.spanAxes.includes('x');

  steps.push({
    name: 'Student page',
    caption: 'Opens a worksheet whose part (a) has a graph answer space: blank axes for students.',
    async run(d) {
      await say(d, 'A long question with a graph answer space: blank axes for students to draw on.');
      await d.wait(900);
      await d.click(d.page.getByRole('button', { name: /S5 Market Intervention/ }));
      await d.page.waitForSelector('#print-root .paper');
      await d.wait(900);
      await d.cut(async () => {
        const hint = d.page.getByRole('button', { name: 'Dismiss hint' });
        if (await hint.count()) await hint.click();
      });
      await d.hover(d.page.locator('#print-root [data-answer-graph]'));
      await d.wait(1600);
      await d.still('student-page', 'Student page: part (a) with blank axes to draw on');
    },
  });

  steps.push({
    name: 'Template picker',
    caption: 'Selects the stem, opens **+ Diagram ▾**: 47 templates grouped by syllabus topic. Searches "tax".',
    async run(d) {
      await say(d, 'Insert a diagram: templates are grouped by syllabus topic.');
      await d.click(d.page.locator('#print-root').getByText('The government imposes'));
      await d.wait(900);
      await d.click(d.page.getByRole('button', { name: /\+ Diagram/ }).first());
      await d.wait(900);
      const popover = d.page.locator('[data-template-group]').first();
      await d.hover(popover);
      await d.wheel(70, 12, 60);
      await d.wait(700);
      await d.still('template-picker', 'Template picker, grouped by syllabus topic');
      await say(d, 'Search for a template: "tax".');
      await d.page.keyboard.type('tax', { delay: 140 });
      await d.wait(1200);
      await d.still('template-search', 'Template search: "tax"');
    },
  });

  steps.push({
    name: 'Per-unit tax',
    caption: 'Picks **Per-unit tax**. The figure lands in the stem.',
    async run(d) {
      await say(d, 'Pick Per-unit tax.');
      const card = d.page
        .locator('[data-template-group] button')
        .filter({ has: d.page.locator('span.truncate', { hasText: /^Per-unit tax$/ }) });
      await d.click(card);
      await d.wait(1500);
    },
  });

  steps.push({
    name: 'Open the canvas',
    caption: 'Double-clicks the diagram to open the drawing canvas.',
    async run(d) {
      await say(d, 'Double-click the diagram to draw on it.');
      await dblclick(d, await pageDiagram(d, 0));
      await d.wait(1400);
      await d.still('canvas', 'The drawing canvas: Per-unit tax');
    },
  });

  if (taxFollows && s1) {
    steps.push({
      name: 'Drag S₁',
      caption: 'Drags S₁ up. E₁, the tax wedge and the burden areas follow it.',
      async run(d) {
        await say(d, 'Drag S₁ up: E₁, the tax wedge and the burden areas follow.');
        await dragCurve(d, s1, 0, -42);
        await d.wait(1300);
        await d.still('canvas-after-drag', 'After dragging S₁ up: everything anchored to it followed');
      },
    });
  } else {
    notes.push('"Drag S₁" was left out: in this build the Per-unit tax template has no anchored points, so nothing would follow the curve.');
  }

  steps.push({
    name: 'Shade',
    caption: 'Opens **Shade ▾** (Surplus · Tax & subsidy · Price control · Trade · Monopoly · Revenue · Custom) and adds **DWL of a tax**.',
    async run(d) {
      await say(d, 'Shade ▾ groups the welfare areas by topic. Add the deadweight loss.');
      const menu = d.page.getByRole('menu');
      await d.click(d.page.getByRole('button', { name: /Shade/ }));
      await d.wait(700);
      await d.click(menu.getByRole('tab', { name: 'Surplus' }));
      await d.wait(700);
      await d.click(menu.getByRole('tab', { name: 'Tax & subsidy' }));
      await d.wait(900);
      await d.still('shade-menu', 'Shade ▾ → Tax & subsidy');
      await d.click(menu.getByText('DWL of a tax', { exact: true }));
      await d.wait(700);
      const add = menu.getByRole('button', { name: 'Add', exact: true });
      if (await add.count()) await d.click(add);
      await d.wait(900);
      if (tax.areas.length < 2) {
        await shade(d, 'Tax & subsidy', "Buyers' burden");
        await shade(d, 'Tax & subsidy', "Sellers' burden");
      }
      await d.page.keyboard.press('Escape');
      await d.wait(900);
      await d.still('shaded', 'Hatched areas: the burdens and the deadweight loss');
      if (!spanOnStem) await canvasDone(d);
    },
  });

  const spanStep = {
    name: 'Span',
    caption: `Chooses **↔ Span**, Bracket, On the x-axis, and clicks E₁ then E₀: a bracket from Q₁ to Q₀${spanOnStem ? '' : ' (on the model answer)'}.`,
    async run(d) {
      await say(d, '↔ Span: a bracket from Q₁ to Q₀ on the quantity axis.');
      await addBracket(d);
      await d.still('span', 'A bracket span from Q₁ to Q₀, anchored to E₁ and E₀');
    },
  };
  if (spanOnStem) {
    steps.push({
      ...spanStep,
      async run(d) {
        await spanStep.run(d);
        await canvasDone(d);
      },
    });
  }

  // Breadth: a second diagram in the stem, re-based through four templates, then removed.
  const breadth = [
    {
      id: 'monopoly', search: 'monopoly', card: 'Monopoly', trigger: 'Per-unit tax',
      caption: 'Monopoly', still: 'monopoly',
      curve: curveNamed(t.monopoly, ['D', 'AR']),
      follows: t.monopoly.derivedCurves.length > 0,
      move: [26, -26], text: 'Monopoly: drag D, and MR follows.',
    },
    {
      id: 'deflationary-gap', search: 'gap', card: 'Deflationary gap', trigger: 'Monopoly',
      caption: 'Deflationary gap', still: 'deflationary-gap',
      curve: curveNamed(t['deflationary-gap'], ['AD']),
      follows: t['deflationary-gap'].spans > 0,
      move: [-30, 0], text: 'Deflationary gap: drag AD, and the gap bracket follows.',
    },
    {
      id: 'tariff', search: 'tariff', card: 'Import tariff', trigger: 'Deflationary gap',
      caption: 'Import tariff', still: 'tariff',
      text: 'Import tariff: the imports bracket and the tariff revenue.',
    },
    {
      id: 'ppf-concave-trade', search: 'ppf', card: 'Concave PPF with trade', trigger: 'Import tariff',
      caption: 'Concave PPF with trade', still: 'ppf-trade',
      text: 'Concave PPF with trade: the tangent price line and the consumption line.',
    },
  ];
  breadth.forEach((b, i) => {
    const drags = Boolean(b.move && b.follows && b.curve);
    if (b.move && !drags) {
      notes.push(`The ${b.caption} beat shows the template without dragging it: in this build it has no ${b.id === 'monopoly' ? 'derived MR' : 'anchored span'} to follow the curve.`);
    }
    steps.push({
      name: b.caption,
      caption: i === 0
        ? `Adds a second diagram (**+ Diagram ▾** → ${b.card})${drags ? ', opens it and drags the curve: what depends on it follows' : ''}.`
        : `Re-bases it on **${b.card}** from its **Template ▾**${drags ? ', opens it and drags the curve' : ''}.`,
      async run(d) {
        await say(d, drags || !b.move ? b.text : `${b.caption}.`);
        const trigger = i === 0
          ? d.page.getByRole('button', { name: /\+ Diagram/ }).first()
          : d.page.getByRole('button', { name: `${b.trigger} ▾`, exact: true });
        await pickTemplate(d, trigger, b.search, b.card);
        const figure = await pageDiagram(d, 1);
        await d.hover(figure);
        await d.wait(700);
        if (drags) {
          await dblclick(d, figure);
          await d.wait(1200);
          await dragCurve(d, b.curve, b.move[0], b.move[1]);
          await d.wait(1200);
          await d.still(b.still, `${b.caption}, after dragging ${b.curve}`);
          await canvasDone(d);
        } else {
          await d.wait(900);
          await d.still(b.still, b.caption);
        }
        if (i === breadth.length - 1) {
          const panel = d.page
            .locator('div')
            .filter({ has: d.page.getByRole('button', { name: `${b.card} ▾`, exact: true }) })
            .filter({ has: d.page.getByRole('button', { name: 'Delete block' }) })
            .last();
          const remove = panel.getByRole('button', { name: 'Delete block' }).last();
          await reveal(d, remove);
          await d.click(remove);
          await d.wait(900);
        }
      },
    });
  });

  steps.push({
    name: 'Model diagram',
    caption: 'Part (a) **⋯** → **Add model diagram**, **✎ Draw…**, selects S and **Shift a copy** ↑ by 30%: S₁ and E₁ appear. Shades the DWL.',
    async run(d) {
      await say(d, 'Add a model answer diagram to part (a).');
      const actions = d.page.getByRole('button', { name: 'Actions for part ((a))' });
      await reveal(d, actions);
      await d.click(actions);
      await d.wait(700);
      await d.click(d.page.getByRole('menuitem', { name: 'Add model diagram' }));
      await d.wait(1000);
      const row = d.page.locator('[data-answer-diagram-fields]');
      await reveal(d, row);
      await d.click(row.getByRole('button', { name: /Draw/ }).first());
      await d.wait(1300);
      await say(d, 'Shift S up by the tax: S₁ and the new equilibrium E₁ appear.');
      const { lines } = await geometry(d, 'S');
      const grab = along(lines[0], 0.72);
      await d.moveTo(grab.x, grab.y);
      await d.wait(250);
      await d.page.mouse.click(grab.x, grab.y);
      await d.wait(700);
      await d.click(d.page.getByTitle(/^Shift up/));
      await d.wait(500);
      // A bigger tax than the 15% default, so Q₁ and Q₀ print apart at answer size.
      const by = d.page.locator('.zone-dark aside label').filter({ hasText: /^by/ }).locator('input');
      await d.click(by);
      await d.page.keyboard.press('Meta+A');
      await d.page.keyboard.type('30', { delay: 120 });
      await d.page.keyboard.press('Tab');
      await d.wait(500);
      await d.click(d.page.getByRole('button', { name: 'Shift a copy' }));
      await d.wait(1300);
      await shade(d, 'Tax & subsidy', 'DWL of a tax');
      await d.page.keyboard.press('Escape');
      await d.wait(800);
      await d.still('model-diagram-canvas', 'The model answer, drawn: S shifted up by the tax, with the DWL');
      if (spanOnStem) await canvasDone(d);
    },
  });
  if (!spanOnStem) {
    steps.push({
      ...spanStep,
      async run(d) {
        await spanStep.run(d);
        await canvasDone(d);
      },
    });
  }

  steps.push({
    name: 'Teacher and student',
    caption: 'Switches to **Teacher**: the model diagram prints under the answer. Back to **Student**: it is hidden, the blank axes stay.',
    async run(d) {
      await say(d, 'Teacher copy: the model diagram prints under the answer.');
      await d.click(d.page.getByTitle(/Teacher version/));
      await d.wait(1000);
      await d.hover(await pageDiagram(d, 1));
      await d.wait(1600);
      await d.still('teacher-copy', 'Teacher copy: the model diagram under the answer text');
      await say(d, 'Student copy: the model diagram is hidden; the blank axes stay.');
      await d.click(d.page.getByTitle(/Student version/));
      await d.wait(900);
      await d.hover(d.page.locator('#print-root [data-answer-graph]'));
      await d.wait(1600);
      await d.still('student-copy', 'Student copy: no model diagram, only the blank axes');
    },
  });

  steps.push({
    name: 'Export',
    caption: 'Opens **Export…**, picks .docx, **Both** and **Teacher**, and downloads the teacher copy and the answer key.',
    async run(d) {
      await say(d, 'Export to Word: the teacher copy and the answer key.');
      await d.click(d.page.getByRole('button', { name: /Export/ }).first());
      await d.wait(1100);
      const dialog = d.page.getByRole('dialog');
      await d.click(dialog.getByText('Both', { exact: true }));
      await d.wait(600);
      await d.click(dialog.getByText('Teacher', { exact: true }));
      await d.wait(900);
      await d.still('export-dialog', 'Export: .docx, Both, Teacher');
      await d.download(() => d.click(dialog.getByRole('button', { name: /^Export/ })));
      await d.wait(1000);
      await d.download(() => d.click(d.page.getByRole('button', { name: /Download answer key/ })));
      await d.wait(900);
    },
  });

  steps.push({
    name: 'The .docx',
    caption: 'The two downloaded files, opened in LibreOffice: every diagram is one PNG in the Word file.',
    async run(d) {
      const shown = await d.cut(() => d.renderExports());
      if (!shown) {
        await say(d, 'Done: the teacher copy and the answer key are in Downloads.');
        await d.wait(2000);
        return;
      }
      await say(d, shown.caption);
      await d.page.evaluate((items) => window.__demo.showImages(items), shown.items);
      await d.wait(3600);
      await d.still('docx-rendered', shown.still);
      await d.page.evaluate(() => window.__demo.hideImages());
      await say(d, '');
      await d.wait(900);
    },
  });

  return { steps, notes };
}

// ---- recording ---------------------------------------------------------------------

/**
 * Seed the worksheet, film the storyboard at 2× (the stills are 2× page screenshots),
 * and keep the exported files. Returns the film, the stills (PNG paths), the exports,
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
    notes.push('The rendered .docx pages were skipped: `soffice` (LibreOffice) and `pdftoppm` must both be on PATH.');
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
    const kind = /Answer key/.test(file) ? 'Answer key' : 'Teacher copy';
    items.push({
      src: `data:image/png;base64,${fs.readFileSync(png).toString('base64')}`,
      label: `${kind} · ${counts[i]} ${counts[i] === 1 ? 'diagram' : 'diagrams'} as PNG`,
    });
    log(`  rendered ${path.basename(png)} (${counts[i]} PNG in the .docx)`);
  }
  return {
    items,
    caption: 'Opened in LibreOffice: each diagram is one picture in the Word file.',
    still: `The exported .docx files, page 1, rendered by LibreOffice (${counts.join(' and ')} PNG diagrams)`,
  };
}
