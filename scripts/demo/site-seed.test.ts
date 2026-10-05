/**
 * Not a unit test: writes the website screenshots' seed as JSON, for
 * `scripts/demo/screenshots.mjs`.
 *
 * - `docs`: the worksheets in content.mjs:SITE, built from the model's own factories,
 *   each with the index row `storage/document.ts:summarize` writes for it.
 * - `graphs`: the saved graphs in SITE.graphs, as `econ-graph:<id>` records.
 *
 * Fails, instead of writing, when a screenshot would show the app objecting to its own
 * demo: any term the EDB glossary flags, in the seeded papers or in the quiz the harness
 * types (content.mjs:MCQS, STRUCTURED), whose flags the Export dialog would print.
 *
 * Run with `npx vitest run scripts/demo/site-seed.test.ts` (DEMO_SEED sets the file).
 */
import { writeFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadGlossary } from '@/glossary/load';
import {
  createAnswerDiagram,
  createMcqQuestion,
  createParagraphBlock,
  createPart,
  createStructuredQuestion,
  createWorksheet,
  newId,
} from '@/model/factories';
import { createGraph, stringifyGraph } from '@/model/graph';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { bi } from '@/model/text';
import type { McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { summarize } from '@/storage/document';
import { buildTermCheck } from '@/translate/termCheck';
import { MCQS, SITE, STRUCTURED } from './content.mjs';

const OUT = process.env.DEMO_SEED ?? '/tmp/site-demo-seed.json';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const at = (daysAgo: number, minutes = 0) => new Date(NOW - daysAgo * DAY - minutes * 60_000).toISOString();

/** [English, 中文]; content.mjs is untyped, so pairs arrive as plain arrays. */
type Pair = string[];
const bp = (p: Pair) => bi(p[0], p[1]);
interface Mcq { stem: Pair; options: Pair[]; answer: string; tags?: string[] }
interface Part {
  text: Pair;
  marks: number;
  lines: number;
  tags?: string[];
  diagram?: string;
  points?: Array<Array<string | number>>;
  scheme?: Pair;
}
interface Structured { stem: Pair; parts: Part[] }

function mcq(m: Mcq): McqQuestion {
  const q = createMcqQuestion();
  q.blocks = [createParagraphBlock(bp(m.stem))];
  q.options = q.options.map((option, i) => ({ ...option, text: bp(m.options[i]) }));
  q.answerIndex = 'ABCD'.indexOf(m.answer);
  if (m.tags) q.tags = [...m.tags];
  return q;
}

function scheme(points: Array<Array<string | number>>): MarkScheme {
  return {
    routes: [{
      id: newId(),
      groups: [{ id: newId(), points: points.map(([en, zh, marks]) => ({ id: newId(), text: bi(String(en), String(zh)), marks: Number(marks) })) }],
    }],
  };
}

function structured(s: Structured): StructuredQuestion {
  const q = createStructuredQuestion();
  q.blocks = [createParagraphBlock(bp(s.stem))];
  q.parts = s.parts.map((p) => ({
    ...createPart(),
    blocks: [createParagraphBlock(bp(p.text))],
    marks: p.marks,
    answerSpace: p.lines,
    ...(p.tags ? { tags: [...p.tags] } : {}),
    ...(p.points ? { scheme: scheme(p.points) } : {}),
    ...(p.scheme ? { answer: bp(p.scheme) } : {}),
    ...(p.diagram ? { answerDiagram: createAnswerDiagram(p.diagram) } : {}),
  }));
  return q;
}

/** A classroom worksheet: the factory's Section A and B, each with its questions under it. */
function paper(title: Pair, mcqs: Question[], longs: Question[]): Worksheet {
  const doc = createWorksheet();
  doc.title = bp(title);
  const [sectionA, sectionB] = doc.layout;
  doc.questions = [...mcqs, ...longs];
  doc.flow = [
    { type: 'layout', id: sectionA.id },
    ...mcqs.map((q) => ({ type: 'question' as const, id: q.id })),
    { type: 'layout', id: sectionB.id },
    ...longs.map((q) => ({ type: 'question' as const, id: q.id })),
  ];
  return doc;
}

it('emits the website screenshots seed', async () => {
  const glossary = await loadGlossary();
  const flagged = (doc: Worksheet) =>
    buildTermCheck(doc, glossary, { kind: 'paper' }).flatMap((row) =>
      row.checks.map((check) => `${check.en}: "${check.found?.text ?? '(missing)'}", the EDB has "${check.expected}"`));

  const quiz = paper(['', ''], (MCQS as unknown as Mcq[]).map(mcq), [structured(STRUCTURED as unknown as Structured)]);
  expect(flagged(quiz), 'the typed quiz (content.mjs:MCQS, STRUCTURED)').toEqual([]);

  const docs = SITE.papers.map((p) => {
    const doc = paper(p.title, (p.mcqs as unknown as Mcq[]).map(mcq), (p.structured as unknown as Structured[]).map(structured));
    doc.id = p.id;
    doc.name = p.name;
    doc.classes = [...p.classes];
    doc.createdAt = at(p.daysAgo + 1);
    doc.updatedAt = at(p.daysAgo);
    expect(flagged(doc), p.name).toEqual([]);
    return { doc, summary: summarize(doc) };
  });

  const graphs = SITE.graphs.map(([template, name, daysAgo], i) => {
    if (typeof template !== 'string' || typeof name !== 'string' || typeof daysAgo !== 'number') throw new Error('SITE.graphs: [template, name, daysAgo]');
    const graph = { ...createGraph(template, 'en', at(daysAgo, i)), name };
    return { id: graph.id, json: stringifyGraph(graph) };
  });

  writeFileSync(OUT, JSON.stringify({ docs, graphs }));
});
