import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bi, plain } from '@/model/text';
import type {
  OutputMode,
  QuestionPart,
  StructuredQuestion,
  Worksheet,
} from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { questionMarks } from '@/model/marks';
import { createWorksheet } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';

/**
 * The QAB's per-part answer space (§ the LQ line is a different primitive).
 *
 * A Question-Answer Book puts writing room *inside* a question — 1.(a), its dotted
 * lines, then (b) — so the space has to live on the part and the sub-part, where a flow
 * element cannot reach. Absent prints nothing, like marks: a document authored before
 * the field existed renders byte-identically.
 */
function paragraph(id: string, text: string) {
  return { kind: 'paragraph' as const, id, text: bi(text, text) };
}

function worksheetWith(parts: QuestionPart[]): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [paragraph('stem', 'A country considers reclaiming more land.')],
    parts,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };

/** The rendered node kinds (with markers for text), flattened in order. */
function shapeOf(worksheet: Worksheet): string[] {
  return renderWorksheet(worksheet, STUDENT_EN)
    .items.flatMap((item) =>
      item.type === 'question' ? item.question.nodes : item.layout.nodes,
    )
    .map((node) =>
      node.kind === 'text'
        ? (node.listRef?.marker ?? 'text')
        : node.kind === 'answerSpace'
          ? `space:${node.lines}`
          : node.kind,
    );
}

describe('per-part answer space', () => {
  it('prints a part\'s dotted lines directly after the part', () => {
    const shape = shapeOf(
      worksheetWith([
        { id: 'a', blocks: [paragraph('pa', 'State the change.')], marks: 3, answerSpace: 6 },
        { id: 'b', blocks: [paragraph('pb', 'Explain the change.')], marks: 4 },
      ]),
    );
    const at = shape.indexOf('space:6');
    expect(at).toBeGreaterThan(shape.indexOf('(a)'));
    expect(at).toBeLessThan(shape.indexOf('(b)'));
    // Part (b) asked for none, so none follows it.
    expect(shape.filter((s) => s.startsWith('space:'))).toEqual(['space:6']);
  });

  it('prints each sub-part\'s lines after that sub-part, and the part\'s after the group', () => {
    const shape = shapeOf(
      worksheetWith([
        {
          id: 'a',
          blocks: [paragraph('pa', 'Lead-in.')],
          answerSpace: 4,
          subParts: [
            { id: 'i', blocks: [paragraph('pi', 'First.')], marks: 2, answerSpace: 8 },
            { id: 'ii', blocks: [paragraph('pii', 'Second.')], marks: 3 },
          ],
        },
      ]),
    );
    const spaceI = shape.indexOf('space:8');
    expect(spaceI).toBeGreaterThan(shape.indexOf('(i)'));
    expect(spaceI).toBeLessThan(shape.indexOf('(ii)'));
    // The part's own space follows the whole group.
    expect(shape.indexOf('space:4')).toBeGreaterThan(shape.indexOf('(ii)'));
  });

  it('prints nothing when the field is absent', () => {
    const shape = shapeOf(
      worksheetWith([{ id: 'a', blocks: [paragraph('pa', 'State it.')], marks: 3 }]),
    );
    expect(shape.some((s) => s.startsWith('space:'))).toBe(false);
  });
});

/**
 * A booklet question that asks one thing (§`StructuredQuestion.answerSpace`).
 *
 * Numbered "1." and answered on the lines beneath it, with no (a) to hang marks or
 * writing room on. Before these fields existed the only way to mark such a question or
 * give it space was to invent a part it does not have.
 */
describe('a structured question with no parts', () => {
  const leafWorksheet = (question: Partial<StructuredQuestion>): Worksheet => {
    const worksheet = createWorksheet();
    worksheet.questions = [
      {
        id: 'q1',
        type: 'structured',
        blocks: [paragraph('stem', 'Explain why the policy raises welfare.')],
        parts: [],
        ...question,
      } as StructuredQuestion,
    ];
    worksheet.flow = [{ type: 'question', id: 'q1' }];
    return worksheet;
  };

  it('prints the question\'s own dotted lines under the stem', () => {
    const shape = shapeOf(leafWorksheet({ marks: 8, answerSpace: 10 }));
    expect(shape).toContain('space:10');
    expect(shape.indexOf('space:10')).toBeGreaterThan(shape.indexOf('1.'));
  });

  it('totals its own marks rather than summing an empty part list', () => {
    // The regression this exists for: `parts.reduce(...)` over `[]` is 0, so a question
    // plainly worth 8 reported nothing to the section total or the marks label.
    const question = leafWorksheet({ marks: 8 }).questions[0];
    expect(questionMarks(question)).toBe(8);
  });

  it('prints the marks label on the stem', () => {
    const nodes = renderWorksheet(leafWorksheet({ marks: 8 }), STUDENT_EN).items.flatMap(
      (item) => (item.type === 'question' ? item.question.nodes : []),
    );
    expect(nodes.some((node) => node.kind === 'text' && node.marks === 8)).toBe(true);
  });

  it('puts the marks label on the stem\'s last line, not its first', () => {
    // A multi-paragraph stem must not print "(8 marks)" against its opening sentence
    // with three more paragraphs still to come.
    const worksheet = leafWorksheet({
      blocks: [paragraph('s1', 'A long lead-in.'), paragraph('s2', 'The question itself.')],
      marks: 8,
    });
    const texts = renderWorksheet(worksheet, STUDENT_EN)
      .items.flatMap((item) => (item.type === 'question' ? item.question.nodes : []))
      .filter((node) => node.kind === 'text');
    expect(texts[0].marks).toBeUndefined();
    expect(texts[texts.length - 1].marks).toBe(8);
  });

  it('yields to the parts once one exists', () => {
    // Both fields are ignored with parts present: the marks belong to the part, and a
    // space under the stem would print writing room before the first question is asked.
    const shape = shapeOf(
      leafWorksheet({
        marks: 8,
        answerSpace: 10,
        parts: [{ id: 'a', blocks: [paragraph('pa', 'State it.')], marks: 3 }],
      }),
    );
    expect(shape.some((s) => s.startsWith('space:'))).toBe(false);
    expect(questionMarks(leafWorksheet({
      marks: 8,
      parts: [{ id: 'a', blocks: [paragraph('pa', 'State it.')], marks: 3 }],
    }).questions[0])).toBe(3);
  });
});

describe('a section heading with derived marks', () => {
  it('appends the section total when showMarks is set', () => {
    const worksheet = worksheetWith([
      { id: 'a', blocks: [paragraph('pa', 'State it.')], marks: 3 },
      { id: 'b', blocks: [paragraph('pb', 'Explain it.')], marks: 4 },
    ]);
    worksheet.layout = [
      {
        kind: 'section',
        id: 'secA',
        text: bi('Section A', '甲部'),
        restartNumbering: false,
        showMarks: true,
      },
    ];
    worksheet.flow = [
      { type: 'layout', id: 'secA' },
      { type: 'question', id: worksheet.questions[0].id },
    ];

    const heading = renderWorksheet(worksheet, STUDENT_EN)
      .items.flatMap((item) =>
        item.type === 'question' ? item.question.nodes : item.layout.nodes,
      )
      .find((node) => node.kind === 'text' && plain(node.text.en).startsWith('Section A'));
    expect(heading && heading.kind === 'text' ? plain(heading.text.en) : '').toBe(
      'Section A (7 marks)',
    );
  });
});

describe('the QAB starting shape', () => {
  it('gives a write-in booklet three continuous-numbered sections with derived marks', () => {
    const worksheet = createWorksheetFrom({ cover: 'writeIn' });
    const sections = worksheet.layout.filter((element) => element.kind === 'section');
    expect(sections.map((s) => plain(s.text.en))).toEqual([
      'Section A',
      'Section B',
      'Section C',
    ]);
    for (const section of sections) {
      // A QAB numbers 1..14 straight through — a restart at Section B would be wrong.
      expect(section.restartNumbering).toBe(false);
      expect(section.showMarks).toBe(true);
    }
    // Every layout element must be reachable through the flow (§ the flow invariant).
    const flowIds = new Set(worksheet.flow.map((entry) => entry.id));
    for (const element of worksheet.layout) expect(flowIds.has(element.id)).toBe(true);
  });

  it('keeps the ordinary worksheet sections for the plain classroom document', () => {
    const worksheet = createWorksheetFrom({});
    const sections = worksheet.layout.filter((element) => element.kind === 'section');
    expect(sections).toHaveLength(2);
    expect(sections.every((s) => s.showMarks === undefined)).toBe(true);
  });

  it('gives the MCQ paper its own shape instead of the worksheet sections', () => {
    // An MCQ paper is one run of questions between its lead-in and "END OF PAPER" —
    // the reference (DSE 2021 P1) carries no section headings at all, so the two
    // worksheet sections would be furniture the paper does not have.
    const worksheet = createWorksheetFrom({ cover: 'mcq' });

    expect(worksheet.layout.filter((element) => element.kind === 'section')).toHaveLength(0);
    expect(worksheet.layout.some((element) => element.kind === 'questionCount')).toBe(true);
    expect(
      worksheet.layout.some(
        (element) => element.kind === 'text' && plain(element.text.en) === 'END OF PAPER',
      ),
    ).toBe(true);
  });

  it('seeds the booklet with one sample question, placed under Section A', () => {
    const worksheet = createWorksheetFrom({ documentType: 'lqMock' });
    expect(worksheet.questions).toHaveLength(1);
    const question = worksheet.questions[0];
    expect(question.type).toBe('structured');
    // The sample exists to show the per-part answer space, so it must carry some.
    if (question.type === 'structured') {
      expect(question.parts.some((part) => part.answerSpace !== undefined)).toBe(true);
    }
    // Directly after the first section marker — the booklet's first question lives
    // under "Section A", not after Section C's "Answer any ONE question." note.
    expect(worksheet.flow[0]).toEqual({ type: 'layout', id: worksheet.layout[0].id });
    expect(worksheet.flow[1]).toEqual({ type: 'question', id: question.id });
  });

  it('gives the plain LQ worksheet answer space and no exam apparatus', () => {
    const worksheet = createWorksheetFrom({ documentType: 'lqWorksheet' });
    expect(worksheet.cover).toBeUndefined();
    expect(worksheet.pageFurniture).toBeUndefined();
    expect(worksheet.layout).toHaveLength(0);
    expect(worksheet.questions).toHaveLength(1);
    const question = worksheet.questions[0];
    if (question.type === 'structured') {
      expect(question.parts.some((part) => part.answerSpace !== undefined)).toBe(true);
    }
  });

  it('seeds nothing when the sample is declined', () => {
    // The harness fixture authors its own questions and rebuilds the flow
    // positionally, so it must be able to start from the bare structure.
    const worksheet = createWorksheetFrom({ documentType: 'lqMock', seedSample: false });
    expect(worksheet.questions).toHaveLength(0);
    expect(worksheet.flow).toHaveLength(worksheet.layout.length);
  });

  it('always prints the booklet on the reference’s own margins', () => {
    // The furniture geometry, the dotted pitch and the lines-per-page were all
    // measured against the reference's column, so the booklet's margins are fixed —
    // a passed margins answer is deliberately ignored (§ `QAB_MARGINS`).
    const worksheet = createWorksheetFrom({
      documentType: 'lqMock',
      margins: { top: 720, right: 720, bottom: 720, left: 720 },
    });
    expect(worksheet.pageSetup?.margins).toEqual({
      top: 1296,
      right: 1296,
      bottom: 1440,
      left: 1296,
    });
    // Every other type keeps the teacher's choice.
    const plain = createWorksheetFrom({
      documentType: 'lqWorksheet',
      margins: { top: 720, right: 720, bottom: 720, left: 720 },
    });
    expect(plain.pageSetup?.margins).toEqual({ top: 720, right: 720, bottom: 720, left: 720 });
  });

  it('maps the older cover answers onto the same documents', () => {
    // Callers written before `documentType` existed keep producing what they produced.
    const viaCover = createWorksheetFrom({ cover: 'writeIn' });
    const viaType = createWorksheetFrom({ documentType: 'lqMock' });
    expect(viaCover.pageFurniture).toEqual(viaType.pageFurniture);
    expect(viaCover.layout.map((e) => e.kind)).toEqual(viaType.layout.map((e) => e.kind));
    expect(createWorksheetFrom({ cover: 'mcq' }).cover).toBeDefined();
    expect(createWorksheetFrom({ cover: 'mcq' }).pageFurniture).toBeUndefined();
  });
});

/**
 * Structure is reproduced; wording is not (§ copyright). The QAB gets the same two
 * guards the cover has: a phrase blocklist that always runs, and a 6-word sliding
 * window over the gitignored reference file where it is present.
 */
describe('the QAB copies no reference wording', () => {
  it('ships none of the reference booklet’s distinctive phrases', () => {
    const theirs = [
      'HONG KONG EXAMINATIONS AND ASSESSMENT AUTHORITY',
      'HONG KONG DIPLOMA OF SECONDARY EDUCATION EXAMINATION',
    ];
    const generated = JSON.stringify(createWorksheetFrom({ cover: 'writeIn' })).toLowerCase();
    for (const phrase of theirs) {
      expect(generated, phrase).not.toContain(phrase.toLowerCase());
    }
  });

  it('shares no long phrase with the reference booklet', () => {
    let reference: string;
    try {
      reference = readFileSync(
        new URL('../../real_life_reference/2019_Question_Paper_2.docx', import.meta.url),
      ).toString('latin1');
    } catch {
      return; // Gitignored; the blocklist above is the guard that always runs.
    }

    const worksheet = createWorksheetFrom({ cover: 'writeIn' });
    const sentences: string[] = [];
    for (const element of worksheet.layout) {
      if ('text' in element) sentences.push(plain(element.text.en));
    }
    const note = worksheet.pageFurniture?.marginNote;
    if (note) sentences.push(plain(note.en));
    // The seeded sample question's wording is generated content too.
    for (const question of worksheet.questions) {
      for (const block of question.blocks) {
        if (block.kind === 'paragraph') sentences.push(plain(block.text.en));
      }
      if (question.type === 'structured') {
        for (const part of question.parts) {
          for (const block of part.blocks) {
            if (block.kind === 'paragraph') sentences.push(plain(block.text.en));
          }
        }
      }
    }

    for (const sentence of sentences) {
      const words = sentence.split(/\s+/).filter(Boolean);
      for (let i = 0; i + 6 <= words.length; i += 1) {
        const window = words.slice(i, i + 6).join(' ');
        expect(reference.includes(window), `"${window}"`).toBe(false);
      }
    }
  });
});
