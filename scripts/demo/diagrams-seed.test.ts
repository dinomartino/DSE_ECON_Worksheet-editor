/**
 * Not a unit test: writes the diagram demo's seed as JSON, for `scripts/demo/diagrams.mjs`.
 *
 * - `worksheet`: one structured question with no diagram yet, built from the model's own
 *   factories so the seed cannot drift from the schema. The film adds the diagram.
 * - `canvas`: where the film's gestures land on the drawing canvas, in the SVG's own
 *   pixels — the blank-axes block `+ Diagram` inserts, projected by `diagramPlot`, the
 *   projection the canvas itself inverts. The film checks the block has this size.
 * - `shiftNamesCopy`: whether this build's "Shift a copy" names the film's copy S₁.
 * - `templateCount`: the ready-made templates besides blank axes, for the last caption.
 *
 * Run with `npx vitest run scripts/demo/diagrams-seed.test.ts` (DEMO_SEED sets the file).
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { DiagramPoint } from '@/model/diagram';
import { drawn } from '@/model/diagramDraw';
import { shiftCurve } from '@/model/diagramShift';
import { createBlankDiagram, DIAGRAM_TEMPLATES } from '@/model/diagramTemplates';
import { createDiagramBlock, createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi, plain } from '@/model/text';
import { diagramPlot } from '@/render/diagram';
import { DIAGRAMS } from './content.mjs';

const OUT = process.env.DEMO_SEED ?? '/tmp/diagram-demo-seed.json';
const en = (text: string) => bi(text, '');

function worksheet() {
  const doc = createWorksheet();
  doc.title = en(DIAGRAMS.title);
  // One question and no section headings: the film is about the figure, not the paper.
  doc.layout = [];
  doc.flow = [];
  const question = createStructuredQuestion();
  question.blocks = [createParagraphBlock(en(DIAGRAMS.stem))];
  const part = question.parts[0];
  part.blocks = [createParagraphBlock(en(DIAGRAMS.part.text))];
  part.marks = DIAGRAMS.part.marks;
  part.answerSpace = DIAGRAMS.part.lines;
  doc.questions = [question];
  return doc;
}

/** Where two straight lines cross, in unit space. */
function crossing(a: [DiagramPoint, DiagramPoint], b: [DiagramPoint, DiagramPoint]): DiagramPoint {
  const [p, q] = a;
  const [r, s] = b;
  const d = (q.x - p.x) * (s.y - r.y) - (q.y - p.y) * (s.x - r.x);
  const t = ((r.x - p.x) * (s.y - r.y) - (r.y - p.y) * (s.x - r.x)) / d;
  return { x: p.x + t * (q.x - p.x), y: p.y + t * (q.y - p.y) };
}

function canvas(doc: ReturnType<typeof worksheet>) {
  const block = createDiagramBlock('blank');
  const { widthPx, heightPx } = block;
  const plot = diagramPlot(block.diagram, { widthPx, heightPx, language: 'en', fonts: doc.fonts });
  const px = (at: DiagramPoint) => ({ x: plot.px(at.x), y: plot.py(at.y) });
  const { demand, supply, taxPercent } = DIAGRAMS.draw;
  const up = (at: DiagramPoint) => ({ x: at.x, y: at.y + taxPercent / 100 });
  return {
    widthPx,
    heightPx,
    /** One unit of the price axis, in SVG pixels. */
    unitY: plot.py(0) - plot.py(1),
    demand: { from: px(demand.from), to: px(demand.to) },
    supply: { from: px(supply.from), to: px(supply.to) },
    taxed: { from: px(up(supply.from)), to: px(up(supply.to)) },
    e0: px(crossing([demand.from, demand.to], [supply.from, supply.to])),
    e1: px(crossing([demand.from, demand.to], [up(supply.from), up(supply.to)])),
  };
}

/**
 * Whether "Shift a copy" names the copy S₁ when the curves carry English labels only —
 * the labels the film types in an English worksheet. Where it does not, the film moves
 * a duplicate by hand instead of showing a misnamed copy.
 */
function shiftNamesCopy(): boolean {
  const { demand, supply, taxPercent } = DIAGRAMS.draw;
  const named = (text: string) => ({ en: [{ text }], zh: [] });
  const d = { ...drawn.curve('d', demand.from, demand.to), label: named(demand.label) };
  const s = { ...drawn.curve('s', supply.from, supply.to), label: named(supply.label) };
  let n = 0;
  const shifted = shiftCurve({ ...createBlankDiagram(), curves: [d, s] }, 's', { x: 0, y: taxPercent / 100 }, () => `n${n++}`);
  const copy = shifted?.diagram.curves.find((c) => c.id === shifted.curveId);
  return plain(copy?.label?.en) === `${supply.label}1`;
}

it('emits the diagram demo seed', () => {
  const doc = worksheet();
  const templateCount = DIAGRAM_TEMPLATES.filter((template) => template.id !== 'blank').length;
  writeFileSync(OUT, JSON.stringify({ worksheet: doc, canvas: canvas(doc), shiftNamesCopy: shiftNamesCopy(), templateCount }));
});
