import { describe, expect, it } from 'vitest';
import { createParagraphBlock, createStructuredQuestion, createTableBlock, createWorksheet } from '@/model/factories';
import { editTargetKey } from '@/model/edits';
import { bi } from '@/model/text';
import type { StructuredQuestion, TableBlock, Worksheet } from '@/model/types';
import { withFlow } from '@/test/fixtures';
import { scopeFromSelection, scopeLabel } from './scope';

function paper(): { ws: Worksheet; q1: StructuredQuestion; q2: StructuredQuestion; table: TableBlock } {
  const q1 = createStructuredQuestion();
  q1.blocks = [createParagraphBlock(bi('Explain demand.', ''))];
  const q2 = createStructuredQuestion();
  const table = createTableBlock(2, 2);
  q2.blocks = [createParagraphBlock(bi('Study the table.', '')), table];
  const ws = withFlow(createWorksheet(), [q1, q2]);
  return { ws, q1, q2, table };
}

describe('scopeFromSelection', () => {
  it('is the whole paper with nothing selected', () => {
    const { ws } = paper();
    expect(scopeFromSelection({ worksheet: ws })).toEqual({ kind: 'paper' });
    expect(scopeLabel(ws, { kind: 'paper' })).toBe('Whole paper');
  });

  it('is one question, labelled with its derived number', () => {
    const { ws, q2 } = paper();
    const scope = scopeFromSelection({ worksheet: ws, selectedQuestionId: q2.id });
    expect(scope).toEqual({ kind: 'questions', ids: [q2.id] });
    expect(scopeLabel(ws, scope)).toBe('Question 2');
  });

  it('is the selected page text as one path, before the question', () => {
    const { ws, q1 } = paper();
    const key = editTargetKey({ kind: 'blockText', blockId: q1.blocks[0].id });
    const scope = scopeFromSelection({ worksheet: ws, selectedQuestionId: q1.id, selectedTargetKey: key });
    expect(scope.kind).toBe('paths');
    expect(scope.kind === 'paths' && scope.paths).toHaveLength(1);
    expect(scopeLabel(ws, scope)).toBe('This text');
  });

  it('is the table for a swept cell range', () => {
    const { ws, q2, table } = paper();
    const [a, b] = table.rows[0].cells;
    const scope = scopeFromSelection({
      worksheet: ws,
      selectedQuestionId: q2.id,
      cellSelection: { blockId: table.id, anchorId: a.id, focusId: b.id },
    });
    expect(scope).toEqual({ kind: 'block', blockId: table.id, questionId: q2.id });
    expect(scopeLabel(ws, scope)).toBe('This table');
  });

  it('is the multi-selection: questions when all are questions, else flow items', () => {
    const { ws, q1, q2 } = paper();
    const both = scopeFromSelection({ worksheet: ws, selectedFlowIds: [q1.id, q2.id] });
    expect(both).toEqual({ kind: 'questions', ids: [q1.id, q2.id] });
    expect(scopeLabel(ws, both)).toBe('2 questions');
    const heading = ws.layout[0].id;
    const mixed = scopeFromSelection({ worksheet: ws, selectedFlowIds: [q1.id, heading] });
    expect(mixed).toEqual({ kind: 'flowItems', ids: [q1.id, heading] });
    expect(scopeLabel(ws, mixed)).toBe('2 items');
  });

  it('is the selected layout element', () => {
    const { ws } = paper();
    const id = ws.layout[0].id;
    expect(scopeFromSelection({ worksheet: ws, selectedElementId: id })).toEqual({ kind: 'flowItems', ids: [id] });
  });

  it('falls through a key that names no text to the question', () => {
    const { ws, q1 } = paper();
    expect(scopeFromSelection({ worksheet: ws, selectedQuestionId: q1.id, selectedTargetKey: 'nothing:here' })).toEqual({
      kind: 'questions',
      ids: [q1.id],
    });
  });
});
