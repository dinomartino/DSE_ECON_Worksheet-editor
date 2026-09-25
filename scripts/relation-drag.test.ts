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
import { bi, plain } from '@/model/text';
import { diagramPlot } from '@/render/diagram';
import type { Diagram, DiagramPoint } from '@/model/diagram';

const OUT = process.env.DRAG_DIR ?? '/tmp/relation-drag';

/** What to grab, and by how much to move it, in unit space. */
const CASES: Array<{ id: string; grab: (d: Diagram) => DiagramPoint; by: DiagramPoint; what: string }> = [
  { id: 'per-unit-tax', what: 'drag S1 up', by: { x: 0, y: 0.08 }, grab: (d) => on(d, 'S1', 0.3) },
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
    const question = createStructuredQuestion();
    const block = createDiagramBlock(c.id);
    question.blocks = [createParagraphBlock(getDiagramTemplate(c.id)!.name), block];
    worksheet.questions.push(question);
    const proj = diagramPlot(block.diagram, {
      widthPx: block.widthPx,
      heightPx: block.heightPx,
      language: 'en',
      fonts: worksheet.fonts,
    });
    const from = c.grab(block.diagram);
    const to = { x: from.x + c.by.x, y: from.y + c.by.y };
    const px = (p: DiagramPoint) => ({ x: proj.px(p.x), y: proj.py(p.y) });
    return { id: c.id, what: c.what, name: plain(getDiagramTemplate(c.id)!.name.en), widthPx: block.widthPx, from: px(from), to: px(to) };
  });
  writeFileSync(`${OUT}/drag.worksheet.json`, JSON.stringify(worksheet));
  writeFileSync(`${OUT}/drag.targets.json`, JSON.stringify(targets, null, 2));
});
