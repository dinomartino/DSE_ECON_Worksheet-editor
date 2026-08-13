import { describe, expect, it } from 'vitest';
import { bi } from '@/model/text';
import type { OutputMode, QuestionPart, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { buildDocxParts } from '@/export/docx';
import { createWorksheet } from '@/model/factories';

/**
 * A part's marks label sits on its *last* text line.
 *
 * DSE 2025 P2 Q9(d) runs lead-in → boxed advertisement → the actual question, and
 * prints "(2 marks)" against the closing sentence — the label belongs to what is being
 * asked, not to the introduction. A single-block part keeps the label on its numbered
 * line, which is why the naive "always the first paragraph" placement looked right on
 * every simple document.
 */
function paragraph(id: string, text: string) {
  return { kind: 'paragraph' as const, id, text: bi(text, text) };
}

function table(id: string) {
  return {
    kind: 'table' as const,
    id,
    rows: [
      { id: `${id}-r1`, cells: [{ id: `${id}-c1`, text: bi('Room attendants', '房務員') }] },
    ],
  };
}

function worksheetWith(part: QuestionPart): Worksheet {
  const question: StructuredQuestion = {
    id: 'q9',
    type: 'structured',
    blocks: [paragraph('stem', 'In the 2024-25 Budget, the Financial Secretary proposed a tax.')],
    parts: [part],
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };

/** Every marks label the IR emits, keyed by the block id the node edits. */
function marksByBlock(worksheet: Worksheet): Array<[string, number]> {
  return renderWorksheet(worksheet, STUDENT_EN)
    .items.flatMap((item) =>
      item.type === 'question' ? item.question.nodes : item.layout.nodes,
    )
    .filter((node): node is Extract<typeof node, { kind: 'text' }> => node.kind === 'text')
    .filter((node) => node.marks !== undefined)
    .map((node) => [
      node.edit?.kind === 'blockText' ? node.edit.blockId : '-',
      node.marks!,
    ]);
}

describe('a part\'s marks label placement', () => {
  it('lands on the closing paragraph of a lead-in → table → question part', () => {
    const part: QuestionPart = {
      id: 'd',
      marks: 2,
      blocks: [
        paragraph('lead', 'The following is a job advertisement for room attendants.'),
        table('ad'),
        paragraph('ask', 'Give ONE advantage and ONE disadvantage of the above method.'),
      ],
    };

    expect(marksByBlock(worksheetWith(part))).toEqual([['ask', 2]]);
  });

  it('stays on the numbered line of a single-block part', () => {
    const part: QuestionPart = {
      id: 'a',
      marks: 3,
      blocks: [paragraph('only', 'Explain whether the proposed HAT is progressive.')],
    };

    expect(marksByBlock(worksheetWith(part))).toEqual([['only', 3]]);
  });

  it('falls back to the lead-in when the part ends in a table', () => {
    const part: QuestionPart = {
      id: 'b',
      marks: 4,
      blocks: [paragraph('lead', 'Complete the table below.'), table('grid')],
    };

    expect(marksByBlock(worksheetWith(part))).toEqual([['lead', 4]]);
  });

  it('applies the same rule to a multi-block sub-part', () => {
    const part: QuestionPart = {
      id: 'c',
      blocks: [paragraph('lead', 'Study the following.')],
      subParts: [
        {
          id: 'i',
          marks: 2,
          blocks: [
            paragraph('sub-lead', 'The following is an extract.'),
            table('extract'),
            paragraph('sub-ask', 'Account for the change.'),
          ],
        },
      ],
    };

    expect(marksByBlock(worksheetWith(part))).toEqual([['sub-ask', 2]]);
  });

  it('prints the label exactly once in the .docx', () => {
    const part: QuestionPart = {
      id: 'd',
      marks: 2,
      blocks: [
        paragraph('lead', 'The following is a job advertisement.'),
        table('ad'),
        paragraph('ask', 'Give ONE advantage of the above method.'),
      ],
    };
    const document = buildDocxParts(worksheetWith(part), STUDENT_EN).documentXml;

    expect(document.match(/\(2\u00a0marks\)/g)).toHaveLength(1);
    // And it sits in the paragraph after the table, not the lead-in before it.
    expect(document.indexOf("(2\u00a0marks)")).toBeGreaterThan(document.indexOf("<w:tbl"));
  });
});
