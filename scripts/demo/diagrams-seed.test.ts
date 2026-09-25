/**
 * Not a unit test: writes the diagram demo's seed as JSON, for `scripts/demo/diagrams.mjs`.
 *
 * - `worksheet`: one long question with a graph answer space, built from the model's own
 *   factories so the seed cannot drift from the schema.
 * - `templates`: what each template the film opens actually holds (anchored points,
 *   derived curves, spans, areas), read from the same source the app is built from. A
 *   step that drags a curve to show something following it only drags when it will.
 *
 * Run with `npx vitest run scripts/demo/diagrams-seed.test.ts` (DEMO_SEED sets the file).
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildFromTemplate } from '@/model/diagramTemplates';
import { createParagraphBlock, createStructuredQuestion, createWorksheet } from '@/model/factories';
import { bi, plain } from '@/model/text';
import { DIAGRAMS } from './content.mjs';

const OUT = process.env.DEMO_SEED ?? '/tmp/diagram-demo-seed.json';
const en = (text: string) => bi(text, '');
/** Subscript digits as plain ones, the way the canvas lists names ("S₁" → "S1"). */
const flat = (text: string) => text.replace(/[₀-₉]/g, (c) => String(c.charCodeAt(0) - 0x2080));

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
  part.answer = en(DIAGRAMS.part.answer);
  part.answerSpace = DIAGRAMS.part.lines;
  part.answerGraph = {
    lines: DIAGRAMS.part.graphLines,
    width: 'half',
    yTitle: en('Price'),
    xTitle: en('Quantity'),
    showOrigin: true,
  };
  doc.questions = [question];
  return doc;
}

function relations(templateId: string) {
  const diagram = buildFromTemplate(templateId);
  const name = (label: Parameters<typeof plain>[0]) => flat(plain(label));
  return {
    curves: diagram.curves.map((c) => name(c.label?.en)),
    anchoredPoints: diagram.points.filter((p) => p.anchor).map((p) => name(p.label?.en)),
    derivedCurves: diagram.curves.filter((c) => c.derive).map((c) => name(c.label?.en)),
    spans: (diagram.spans ?? []).length,
    spanAxes: (diagram.spans ?? []).map((s) => s.along ?? 'none'),
    areas: (diagram.areas ?? []).map((a) => name(a.label?.en)),
  };
}

it('emits the diagram demo seed', () => {
  const templates = Object.fromEntries(DIAGRAMS.templates.map((id: string) => [id, relations(id)]));
  writeFileSync(OUT, JSON.stringify({ worksheet: worksheet(), templates }));
});
