/**
 * Not a unit test: emits film v2's seed documents as stored JSON, for
 * `scripts/film2/capture/seed.mjs`. Built with the New worksheet form's own constructor
 * (`createWorksheetFrom`), then filled with the original questions in `content.mjs`:
 * the marking-scheme paper (MC rationales, marking points, a diagram whose answer layer
 * draws the answer, an essay with levels and EC) and the 題庫 library (tagged, with
 * classes and dates).
 *
 * Run with `FILM2_SEED=<file> FILM2_EPOCH=<ms> npx vitest run scripts/film2/capture/seed-docs.test.ts`.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import type { Diagram } from '@/model/diagram';
import { createDiagramBlock, createParagraphBlock } from '@/model/factories';
import { createMarkEc } from '@/model/markScheme';
import type { MarkScheme } from '@/model/markSchemeTypes';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { bi } from '@/model/text';
import type { McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { stringifyWorksheet, summarize } from '@/storage/document';
import { AGE_HOURS, ANSWER_DOC, LIBRARY, PAPER } from './content.mjs';

type Pair = [string, string];
const OUT = process.env.FILM2_SEED ?? '/tmp/film2-seed-docs.json';
const EPOCH = Number(process.env.FILM2_EPOCH ?? Date.UTC(2026, 8, 29, 2, 24, 0));
const HOUR = 3600e3;
let n = 0;
const id = (prefix: string) => `${prefix}${String(++n).padStart(4, '0')}`;
const para = ([en, zh]: Pair) => ({ ...createParagraphBlock(bi(en, zh)), id: id('b') });
const points = (rows: Array<[string, string, number?]>): MarkScheme => ({
  routes: [
    {
      id: id('r'),
      groups: [
        {
          id: id('g'),
          points: rows.map(([en, zh, marks]) => ({ id: id('m'), text: bi(en, zh), ...(marks ? { marks } : {}) })),
        },
      ],
    },
  ],
});

function mcq(tags: string[], stem: Pair, options: Pair[], answer: number, rationale?: Pair[]): McqQuestion {
  return {
    id: id('q'),
    type: 'mcq',
    tags,
    blocks: [para(stem)],
    marks: 1,
    options: options.map(([en, zh], k) => ({
      id: id('o'),
      text: bi(en, zh),
      ...(rationale ? { rationale: bi(rationale[k][0], rationale[k][1]) } : {}),
    })),
    answerIndex: answer,
  };
}

function structured(tags: string[], stem: Pair, parts: Array<{ text: Pair; marks: number; scheme?: MarkScheme }>): StructuredQuestion {
  return {
    id: id('q'),
    type: 'structured',
    tags,
    blocks: [para(stem)],
    parts: parts.map((p) => ({
      id: id('p'),
      blocks: [para(p.text)],
      marks: p.marks,
      answerSpace: Math.max(3, p.marks * 2),
      ...(p.scheme ? { scheme: p.scheme } : {}),
    })),
  };
}

/**
 * The tax template with its curves, points and tax span on the answer layer: students see
 * blank axes. Its burden shading and legend answer another question, so they go.
 */
function answerLayerDiagram(template: string) {
  const block = createDiagramBlock(template);
  const d: Diagram = block.diagram;
  const flag = <T extends object>(list: T[] | undefined) => (list ?? []).map((e) => ({ ...e, answer: true as const }));
  const diagram = {
    ...d,
    curves: flag(d.curves),
    points: flag(d.points),
    labels: [],
    arrows: flag(d.arrows),
    areas: [],
    spans: flag(d.spans),
  } as Diagram;
  return { ...block, id: id('d'), diagram };
}

/** A classroom worksheet with Section A and B; MCQs go under A, the rest under B. */
function build(
  name: string,
  title: Pair,
  questions: Question[],
  meta: { classes?: string[]; satOn?: string; sections?: boolean },
): Worksheet {
  const doc = createWorksheetFrom({
    documentType: 'classroom', name, title: title[0], titleZh: title[1], paper: 'A4', sections: meta.sections ?? true,
  });
  const sections = doc.flow.filter((e) => e.type === 'layout').map((e) => e.id);
  const mcqs = questions.filter((q) => q.type === 'mcq');
  const rest = questions.filter((q) => q.type !== 'mcq');
  doc.flow = doc.flow.filter((e) => e.type !== 'question');
  doc.questions = [...mcqs, ...rest];
  const at = (sectionId: string | undefined) => (sectionId ? doc.flow.findIndex((e) => e.id === sectionId) : -1);
  const entry = (q: Question) => ({ type: 'question' as const, id: q.id });
  doc.flow.splice(at(sections[0]) + 1, 0, ...mcqs.map(entry));
  const b = sections[1] ? at(sections[1]) : doc.flow.length - 1;
  doc.flow.splice(b + 1, 0, ...rest.map(entry));
  if (meta.classes) doc.classes = meta.classes;
  if (meta.satOn) doc.satOn = meta.satOn;
  const age = (AGE_HOURS as Record<string, number>)[name] ?? 3;
  doc.createdAt = new Date(EPOCH - age * HOUR - 2 * HOUR).toISOString();
  doc.updatedAt = new Date(EPOCH - age * HOUR).toISOString();
  return doc;
}

/** The tax question: blank axes for the student, the answer drawn on them for the teacher. */
function diagramQuestion(): StructuredQuestion {
  const g = PAPER.diagram;
  const dq = structured(g.tags, g.stem as Pair, [{ text: g.part as Pair, marks: g.marks, scheme: points(g.points as Array<[string, string, number]>) }]);
  dq.parts[0].blocks.push(answerLayerDiagram(g.template));
  dq.parts[0].answerSpace = 4;
  return dq;
}

/** The answer-layer clip's document: the tax question alone, out of the bank (it is in the paper). */
function diagramPractice(): Worksheet {
  const doc = build(ANSWER_DOC.name, ANSWER_DOC.title as Pair, [diagramQuestion()], { sections: false });
  doc.bankHidden = true;
  return doc;
}

function paper(): Worksheet {
  const mcqs = PAPER.mcqs.map((m) => mcq(m.tags, m.stem as Pair, m.options as Pair[], m.answer, m.rationale as Pair[]));
  const s = PAPER.structured;
  const sq = structured(s.tags, s.stem as Pair, s.parts.map((p) => ({
    text: p.text as Pair, marks: p.marks, scheme: points(p.points as Array<[string, string, number]>),
  })));
  const dq = diagramQuestion();
  const e = PAPER.essay;
  const essay: StructuredQuestion = {
    id: id('q'),
    type: 'structured',
    tags: e.tags,
    blocks: [para(e.stem as Pair)],
    marks: e.marks,
    parts: [],
    answerSpace: 14,
    showTotalMarks: true,
    scheme: {
      ...points(e.points as Array<[string, string]>),
      levels: e.levels.map(([min, max, en, zh]) => ({ id: id('l'), min: min as number, max: max as number, descriptor: bi(en as string, zh as string) })),
      ec: createMarkEc(),
    },
  };
  return build(PAPER.name, PAPER.title as Pair, [...mcqs, sq, dq, essay], PAPER);
}

function library(): Worksheet[] {
  return LIBRARY.map((w) => {
    const qs = w.q.map((row) => {
      const [tags, en, zh, rest, answer] = row as [string[], string, string, Array<[string, string, number?]>, number?];
      if (typeof answer === 'number') return mcq(tags, [en, zh], rest.map(([a, b]) => [a, b] as Pair), answer);
      return structured(tags, [en, zh], rest.map(([a, b, marks]) => ({ text: [a, b] as Pair, marks: marks ?? 2 })));
    });
    return build(w.name, w.title as Pair, qs, w);
  });
}

it('emits the film v2 seed documents', () => {
  const docs = [paper(), diagramPractice(), ...library()].map((doc) => ({
    name: doc.name,
    key: `econ-worksheet:${doc.id}`,
    json: stringifyWorksheet(doc),
    summary: summarize(doc),
  }));
  writeFileSync(OUT, JSON.stringify({ docs }));
});
