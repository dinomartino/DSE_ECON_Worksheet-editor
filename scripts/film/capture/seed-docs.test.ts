/**
 * Not a unit test: emits the film's library documents as stored JSON, for
 * `scripts/film/capture/seed.mjs`. Built with the start screen's own constructor
 * (`createWorksheetFrom`, as the New worksheet form calls it), then filled with the demo's
 * original questions (`scripts/demo/content.mjs`), so the papers have real pages.
 *
 * Run with `FILM_SEED=<file> npx vitest run scripts/film/capture/seed-docs.test.ts`.
 */
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { createParagraphBlock } from '@/model/factories';
import { createWorksheetFrom, type DocumentType } from '@/model/newWorksheet';
import { bi } from '@/model/text';
import type { McqQuestion, Question, StructuredQuestion, Worksheet } from '@/model/types';
import { stringifyWorksheet, summarize } from '@/storage/document';
import { DIAGRAMS, LIBRARY, MCQS, STRUCTURED } from '../../demo/content.mjs';

const OUT = process.env.FILM_SEED ?? '/tmp/film-seed-docs.json';
let n = 0;
const id = (prefix: string) => `${prefix}${String(++n).padStart(4, '0')}`;
const para = (en: string, zh = '') => ({ ...createParagraphBlock(bi(en, zh)), id: id('b') });

function mcq(m: (typeof MCQS)[number]): McqQuestion {
  return {
    id: id('q'),
    type: 'mcq',
    blocks: [para(m.stem[0], m.stem[1])],
    marks: 1,
    options: m.options.map(([en, zh]) => ({ id: id('o'), text: bi(en, zh) })),
    answerIndex: 'ABCD'.indexOf(m.answer),
  };
}

function structured(): StructuredQuestion {
  return {
    id: id('q'),
    type: 'structured',
    blocks: [para(STRUCTURED.stem[0], STRUCTURED.stem[1])],
    parts: STRUCTURED.parts.map((part) => ({
      id: id('p'),
      blocks: [para(part.text[0], part.text[1])],
      marks: part.marks,
      answerSpace: part.lines + 4,
      answer: bi(part.scheme[0], part.scheme[1]),
    })),
  };
}

function taxQuestion(): StructuredQuestion {
  return {
    id: id('q'),
    type: 'structured',
    blocks: [para(DIAGRAMS.stem)],
    parts: [{ id: id('p'), blocks: [para(DIAGRAMS.part.text)], marks: DIAGRAMS.part.marks, answerSpace: 12 }],
  };
}

const TYPES: Record<string, DocumentType> = {
  'Paper 1 mock · MCQ': 'paper1',
  'Paper 2 mock · booklet': 'lqMock',
  'LQ worksheet': 'lqWorksheet',
};

/** Insert `questions` into the flow after the entry at `after` (a flow index). */
function place(doc: Worksheet, after: number, questions: Question[]) {
  doc.questions.push(...questions);
  doc.flow.splice(after + 1, 0, ...questions.map((q) => ({ type: 'question' as const, id: q.id })));
}

function build(template: string, name: string): Worksheet {
  const doc = createWorksheetFrom({
    documentType: TYPES[template],
    title: name,
    paper: 'A4',
    sections: true,
    coverDetails: { school: '', examName: '' },
  });
  if (TYPES[template] === 'paper1') {
    // The sample MCQ gives way to the demo's three, between the lead-in and END OF PAPER.
    doc.flow = doc.flow.filter((entry) => entry.type !== 'question');
    doc.questions = [];
    place(doc, 0, MCQS.map(mcq));
  } else if (TYPES[template] === 'lqMock') {
    // Section A: the sample and the tax question; Section B: the cigarette tax.
    place(doc, 1, [structured()]);
    const sectionB = doc.flow.findIndex((entry) => entry.type === 'layout' && entry.id === doc.layout[2].id);
    place(doc, sectionB, [taxQuestion()]);
  } else {
    place(doc, doc.flow.length - 1, [structured(), taxQuestion()]);
  }
  return doc;
}

it('emits the film library documents', () => {
  const docs = LIBRARY.map(([template, name]) => {
    const doc = build(template, name);
    return { template, key: `econ-worksheet:${doc.id}`, json: stringifyWorksheet(doc), summary: summarize(doc) };
  });
  writeFileSync(OUT, JSON.stringify({ docs }));
});
