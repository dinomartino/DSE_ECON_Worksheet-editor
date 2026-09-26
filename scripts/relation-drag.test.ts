/**
 * Not a unit test: writes a worksheet of relation-bearing templates and, for each, one
 * canvas drag (press and release in the diagram's own SVG pixels, from `diagramPlot`),
 * for `scripts/relation-drag.mjs`. Run with `npx vitest run scripts/relation-drag.test.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createDiagramBlock, createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { getDiagramTemplate } from '@/model/diagramTemplates';
import { curveYAt } from '@/model/diagramAnchors';
import { spanGeometry } from '@/model/diagramSpans';
import { bi, plain } from '@/model/text';
import { axisSpanClearance, diagramPlot, type Projection } from '@/render/diagram';
import { spanLayout } from '@/render/diagramSpan';
import type { Diagram, DiagramPoint } from '@/model/diagram';

const OUT = process.env.DRAG_DIR ?? '/tmp/relation-drag';

/**
 * What to grab, and by how much to move it, in unit space — or, for something drawn
 * outside the plot (an axis span), `grabPx`/`byPx` in the SVG's own pixels.
 */
interface Case {
  id: string;
  /** The template, when `id` is a variant of one. */
  template?: string;
  what: string;
  grab?: (d: Diagram) => DiagramPoint;
  by?: DiagramPoint;
  grabPx?: (d: Diagram, proj: Projection) => DiagramPoint;
  byPx?: DiagramPoint;
}

const CASES: Case[] = [
  { id: 'per-unit-tax', what: 'drag S1 up', by: { x: 0, y: 0.08 }, grab: (d) => on(d, 'S1', 0.3) },
  {
    id: 'per-unit-tax-flip',
    template: 'per-unit-tax',
    what: 'drag S1 below S0: the wedge arrow turns to point down',
    by: { x: 0, y: -0.42 },
    grab: (d) => on(d, 'S1', 0.3),
  },
  {
    id: 'demand-shift-span',
    template: 'demand-shift',
    what: 'drag the Q arrow (outside the x-axis) further out',
    byPx: { x: 0, y: 14 },
    grabPx: (d, proj) => {
      const span = d.spans!.find((s) => s.along === 'x')!;
      const [a, b] = spanLayout(d, span, proj, 1, axisSpanClearance(d, proj, 1, 'en'))!.lines[0];
      return { x: (a.x + b.x) / 2 - 4, y: a.y };
    },
  },
  { id: 'tariff', what: 'drag D right', by: { x: 0.08, y: 0 }, grab: (d) => on(d, 'D', 0.72) },
  { id: 'tariff-welfare', what: 'drag D right', by: { x: 0.07, y: 0 }, grab: (d) => on(d, 'D', 0.72) },
  { id: 'monopoly', what: 'drag D up', by: { x: 0, y: 0.07 }, grab: (d) => on(d, 'D', 0.8) },
  {
    id: 'ppf-concave-trade',
    what: 'drag production B up the frontier',
    by: { x: -0.1, y: 0.1 },
    grab: (d) => d.points.find((p) => plain(p.label?.en) === 'B')!.at,
  },
  { id: 'deflationary-gap', what: 'drag AD right', by: { x: 0.08, y: 0 }, grab: (d) => on(d, 'AD', 0.75) },
  { id: 'inflationary-gap', what: 'drag AD left', by: { x: -0.08, y: 0 }, grab: (d) => on(d, 'AD', 0.8) },
  {
    id: 'inflationary-gap-span',
    template: 'inflationary-gap',
    what: 'drag the gap arrow (above the output axis) up',
    by: { x: 0, y: 0.06 },
    grab: (d) => {
      const [a, b] = spanGeometry(d, d.spans![0])!.ends;
      return { x: a.x + (b.x - a.x) * 0.3, y: a.y };
    },
  },
];

function on(d: Diagram, name: string, x: number): DiagramPoint {
  const curve = d.curves.find((c) => plain(c.label?.en) === name)!;
  return { x, y: curveYAt(curve, x)! };
}

it('emits the drag worksheet and its targets', () => {
  mkdirSync(OUT, { recursive: true });
  const worksheet = createWorksheet();
  worksheet.title = bi('Relation drags', '關係拖曳');
  const targets = CASES.map((c) => {
    const template = getDiagramTemplate(c.template ?? c.id)!;
    // A variant gets its own heading, so the harness opens the right copy.
    const name = c.template ? `${plain(template.name.en)} (${c.id})` : plain(template.name.en);
    const question = createStructuredQuestion();
    const block = createDiagramBlock(c.template ?? c.id);
    question.blocks = [createParagraphBlock(bi(name, name)), block];
    worksheet.questions.push(question);
    const proj = diagramPlot(block.diagram, {
      widthPx: block.widthPx,
      heightPx: block.heightPx,
      language: 'en',
      fonts: worksheet.fonts,
    });
    const px = (p: DiagramPoint) => ({ x: proj.px(p.x), y: proj.py(p.y) });
    const from = c.grabPx ? c.grabPx(block.diagram, proj) : px(c.grab!(block.diagram));
    const to = c.byPx
      ? { x: from.x + c.byPx.x, y: from.y + c.byPx.y }
      : px({ x: proj.ux(from.x) + c.by!.x, y: proj.uy(from.y) + c.by!.y });
    return { id: c.id, what: c.what, name, widthPx: block.widthPx, from, to };
  });
  writeFileSync(`${OUT}/drag.worksheet.json`, JSON.stringify(worksheet));
  writeFileSync(`${OUT}/drag.targets.json`, JSON.stringify(targets, null, 2));
});
