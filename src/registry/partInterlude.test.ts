import { describe, expect, it } from 'vitest';
import { bi, plain } from '@/model/text';
import type { ContentBlock, OutputMode, QuestionPart, StructuredQuestion, Worksheet } from '@/model/types';
import { renderWorksheet } from '@/render/worksheet';
import { createWorksheet } from '@/model/factories';
import { STEM_TEXT_INDENT, PART_TEXT_INDENT } from '@/model/numbering';
import { applyDeleteTarget, applyEditTarget, targetQuestionId } from '@/model/edits';

/**
 * The mid-question interlude (§`QuestionPart.blocksBefore`).
 *
 * DSE 2019 P2 Q6 asks (a) off a balance sheet, prints "Suppose the central bank sells
 * $200 million worth of government bonds…" as a plain unnumbered paragraph, then asks
 * (b) and (c) about the new situation. The sentence takes no letter and no marks, and it
 * sits at the *stem's* text column — level with the question, a step left of the parts.
 */
function paragraph(id: string, text: string): ContentBlock {
  return { kind: 'paragraph', id, text: bi(text, text) };
}

function worksheetWith(parts: QuestionPart[]): Worksheet {
  const question: StructuredQuestion = {
    id: 'q1',
    type: 'structured',
    blocks: [paragraph('stem', 'The table shows the balance sheet of a banking system.')],
    parts,
  };
  const worksheet = createWorksheet();
  worksheet.questions = [question];
  worksheet.flow = [{ type: 'question', id: question.id }];
  return worksheet;
}

const STUDENT_EN: OutputMode = { language: 'en', version: 'student' };

function nodesOf(worksheet: Worksheet) {
  return renderWorksheet(worksheet, STUDENT_EN).questions[0].nodes;
}

/** Markers in order, with unnumbered paragraphs shown as their own text. */
function shapeOf(worksheet: Worksheet): string[] {
  return nodesOf(worksheet).map((node) =>
    node.kind === 'text'
      ? (node.listRef?.marker ?? plain(node.text.en) ?? 'text')
      : node.kind,
  );
}

/** Q6's own shape: (a), an interlude, then (b). */
const Q6: QuestionPart[] = [
  { id: 'a', blocks: [paragraph('pa', 'Find the required reserve ratio.')], marks: 1 },
  {
    id: 'b',
    blocksBefore: [paragraph('mid', 'Suppose the central bank sells $200 million of bonds.')],
    blocks: [paragraph('pb', 'Calculate the new monetary base.')],
    marks: 2,
  },
  { id: 'c', blocks: [paragraph('pc', 'Calculate the change in money supply.')], marks: 3 },
];

describe('a part can carry unnumbered text above it', () => {
  it('prints between the part above and its own number', () => {
    const shape = shapeOf(worksheetWith(Q6));
    const interlude = shape.findIndex((s) => s.startsWith('Suppose'));

    expect(interlude).toBeGreaterThan(shape.indexOf('(a)'));
    expect(interlude).toBeLessThan(shape.indexOf('(b)'));
    // It takes no letter of its own — the parts still read (a), (b), (c).
    expect(shape.filter((s) => /^\([a-z]\)$/.test(s))).toEqual(['(a)', '(b)', '(c)']);
  });

  it('sits at the stem\'s text column, not the part\'s', () => {
    // Level with the question it re-scopes. At `PART_TEXT_INDENT` it would read as a
    // continuation of (a) above rather than a new scenario for (b) and (c).
    const node = nodesOf(worksheetWith(Q6)).find(
      (n) => n.kind === 'text' && plain(n.text.en).startsWith('Suppose'),
    )!;
    expect(node.kind).toBe('text');
    if (node.kind !== 'text') return;
    expect(node.indent).toBe(STEM_TEXT_INDENT);
    expect(node.indent).not.toBe(PART_TEXT_INDENT);
    // No number and no marks: it asks nothing.
    expect(node.listRef).toBeUndefined();
    expect(node.marks).toBeUndefined();
  });

  it('keeps with the part it introduces', () => {
    // Or Word breaks the page between the new scenario and the only question using it.
    const node = nodesOf(worksheetWith(Q6)).find(
      (n) => n.kind === 'text' && plain(n.text.en).startsWith('Suppose'),
    )!;
    if (node.kind !== 'text') return;
    expect(node.keepNext).toBe(true);
  });

  it('is separated from the part above and the part below', () => {
    // The page runs on a fixed 12pt line with no paragraph spacing, so separation is a
    // spent line (§ one fixed line). One before the interlude, one after it.
    const shape = shapeOf(worksheetWith(Q6));
    const at = shape.findIndex((s) => s.startsWith('Suppose'));
    expect(shape[at - 1]).toBe('spacer');
    expect(shape[at + 1]).toBe('spacer');
    expect(shape[at + 2]).toBe('(b)');
  });

  it('does not double the gap when the interlude ends in a hard break', () => {
    const shape = shapeOf(
      worksheetWith([
        { id: 'a', blocks: [paragraph('pa', 'First.')], marks: 1 },
        {
          id: 'b',
          blocksBefore: [
            { kind: 'paragraph', id: 'mid', text: bi('New scenario.\n', 'New scenario.\n') },
          ],
          blocks: [paragraph('pb', 'Second.')],
          marks: 2,
        },
      ]),
    );
    const at = shape.findIndex((s) => s.startsWith('New scenario'));
    // The trailing break already spent the line, so `pushGap` adds none.
    expect(shape[at + 1]).toBe('(b)');
  });

  it('renders nothing when absent', () => {
    // Absent prints nothing, like marks — a document authored before the field existed
    // renders byte-identically.
    const without = worksheetWith([
      { id: 'a', blocks: [paragraph('pa', 'Find the ratio.')], marks: 1 },
      { id: 'b', blocks: [paragraph('pb', 'Calculate the base.')], marks: 2 },
    ]);
    const empty = worksheetWith([
      { id: 'a', blocks: [paragraph('pa', 'Find the ratio.')], marks: 1 },
      { id: 'b', blocksBefore: [], blocks: [paragraph('pb', 'Calculate the base.')], marks: 2 },
    ]);
    expect(JSON.stringify(nodesOf(empty))).toBe(JSON.stringify(nodesOf(without)));
  });

  it('carries a table, not only text', () => {
    // A revised balance sheet before (b) is exactly the case the reference prints, and
    // the block walks read `parts` structurally so it costs nothing.
    const shape = shapeOf(
      worksheetWith([
        { id: 'a', blocks: [paragraph('pa', 'First.')], marks: 1 },
        {
          id: 'b',
          blocksBefore: [
            {
              kind: 'table',
              id: 'tbl',
              rows: [{ id: 'r', cells: [{ id: 'c', text: bi('Reserves', '') }] }],
            },
          ],
          blocks: [paragraph('pb', 'Second.')],
          marks: 2,
        },
      ]),
    );
    expect(shape).toContain('table');
    expect(shape.indexOf('table')).toBeLessThan(shape.indexOf('(b)'));
  });
});

describe('the interlude is editable like any other block', () => {
  const worksheet = worksheetWith(Q6);

  it('takes a blockText edit target', () => {
    const node = nodesOf(worksheet).find(
      (n) => n.kind === 'text' && plain(n.text.en).startsWith('Suppose'),
    )!;
    if (node.kind !== 'text') return;
    expect(node.edit).toEqual({ kind: 'blockText', blockId: 'mid' });
  });

  it('is reachable by every block walk', () => {
    // Findable but unwritable is the failure this guards: the two walks must reach the
    // same lists, or typing into the interlude would be dropped on the floor.
    const next = applyEditTarget(
      worksheet,
      { kind: 'blockText', blockId: 'mid' },
      bi('Rewritten.', 'Rewritten.'),
    );
    const block = (next.questions[0] as StructuredQuestion).parts[1].blocksBefore![0];
    expect(block.kind === 'paragraph' ? plain(block.text.en) : '').toBe('Rewritten.');

    // And the question that owns it is found, so selecting the interlude selects its
    // question rather than nothing.
    expect(targetQuestionId(worksheet, { kind: 'blockText', blockId: 'mid' })).toBe('q1');

    // Deleting it removes the block, leaving the part it introduced intact.
    const deleted = applyDeleteTarget(worksheet, { kind: 'blockText', blockId: 'mid' });
    const parts = (deleted.questions[0] as StructuredQuestion).parts;
    expect(parts[1].blocksBefore).toEqual([]);
    expect(parts[1].blocks).toHaveLength(1);
  });
});
