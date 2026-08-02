import { describe, expect, it } from 'vitest';
import { partMarks, questionMarks, worksheetMarks } from '@/model/marks';
import { bi } from '@/model/text';
import type { OutputMode, QuestionPart, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { buildDocxParts } from '@/export/docx';
import { worksheetPlainText } from '@/export/clipboard';
import { createWorksheet } from '@/model/factories';

/**
 * A group of sub-parts sharing one marks label.
 *
 * DSE 2019 P2 Q13(b) prints nothing on (i) and "(5 marks)" on (ii) — the label belongs
 * to the pair. Before sub-part marks were optional the only way to write that was
 * `marks: 0` on (i), which printed a literal "(0 marks)"; the paper's shape was
 * unreachable, and the workaround was visibly wrong on the page.
 *
 * The label is derived, so it must agree across all three backends (§ one IR, three
 * backends) — a shared label that reaches the preview but not the .docx is the exact
 * class of bug the single IR exists to prevent.
 */
function paragraph(id: string, text: string) {
  return { kind: 'paragraph' as const, id, text: bi(text, text) };
}

/** Q13(b): a lead-in, two sub-parts, one "(5 marks)" covering both. */
function sharedLabelPart(): QuestionPart {
  return {
    id: 'b',
    blocks: [paragraph('pb', 'Technology advance lowers the cost of components.')],
    marks: 5,
    subParts: [
      { id: 'i', blocks: [paragraph('pi', 'Indicate the new output and price.')] },
      { id: 'ii', blocks: [paragraph('pii', 'Discuss the effect on efficiency.')] },
    ],
  };
}

function worksheetWith(part: QuestionPart): Worksheet {
  const question: StructuredQuestion = {
    id: 'q13',
    type: 'structured',
    blocks: [paragraph('stem', 'Grape Limited is the only manufacturer of smartphones.')],
    parts: [part],
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };

/** Every marks label the IR emits, paired with the list marker it sits on. */
function marksByMarker(worksheet: Worksheet): Array<[string, number]> {
  return renderWorksheet(worksheet, STUDENT_EN)
    .items.flatMap((item) =>
      item.type === 'question' ? item.question.nodes : item.layout.nodes,
    )
    .filter((node): node is Extract<typeof node, { kind: 'text' }> => node.kind === 'text')
    .filter((node) => node.marks !== undefined)
    .map((node) => [node.listRef?.marker ?? '-', node.marks!]);
}

describe('sub-parts sharing one marks label', () => {
  it('prints the label once, on the last sub-part of the group', () => {
    expect(marksByMarker(worksheetWith(sharedLabelPart()))).toEqual([['(ii)', 5]]);
  });

  it('leaves per-sub-part marks alone when any sub-part carries its own', () => {
    const part = sharedLabelPart();
    part.subParts![0].marks = 2;
    part.subParts![1].marks = 5;

    // Sub-parts win: the part's stale `marks: 5` must not displace them.
    expect(marksByMarker(worksheetWith(part))).toEqual([
      ['(i)', 2],
      ['(ii)', 5],
    ]);
    expect(partMarks(part)).toBe(7);
  });

  it('totals a shared group from the part, not from the empty sub-parts', () => {
    const part = sharedLabelPart();
    // Summing the sub-parts would report 0 for a part plainly worth 5, understating the
    // question, its section and the paper total.
    expect(partMarks(part)).toBe(5);
    expect(questionMarks(worksheetWith(part).questions[0])).toBe(5);
    expect(worksheetMarks(worksheetWith(part))).toBe(5);
  });

  it('emits no marks run for an unmarked sub-part in the .docx', () => {
    const document = buildDocxParts(worksheetWith(sharedLabelPart()), STUDENT_EN).documentXml;

    // The .docx label's interior space is a no-break space (§ `marksText`), so the
    // label can never tear across a line wrap.
    expect(document).toContain('(5\u00a0marks)');
    // The bug this replaces: `marks: 0` on (i) printed a literal "(0 marks)".
    expect(document).not.toContain('(0\u00a0marks)');
    expect(document.match(/\(5\u00a0marks\)/g)).toHaveLength(1);
  });

  it('agrees with the .docx in the clipboard backend', () => {
    const text = worksheetPlainText(worksheetWith(sharedLabelPart()), STUDENT_EN);

    expect(text).toContain('(5 marks)');
    expect(text).not.toContain('(0 marks)');
  });

  it('still prints a genuine zero when a sub-part is deliberately marked 0', () => {
    const part = sharedLabelPart();
    part.subParts![0].marks = 0;
    part.subParts![1].marks = 5;

    // Absent and zero are different documents; only absent prints nothing.
    expect(marksByMarker(worksheetWith(part))).toEqual([
      ['(i)', 0],
      ['(ii)', 5],
    ]);
  });
});
