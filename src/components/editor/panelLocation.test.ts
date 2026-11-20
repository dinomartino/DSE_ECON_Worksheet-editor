import { describe, expect, it } from 'vitest';
import '@/registry';
import { createDrqQuestion } from '@/model/drq';
import { editTargetKey } from '@/model/edits';
import type { ContentBlock, StructuredQuestion } from '@/model/types';
import { panelLocation } from './panelLocation';

/** The right panel's sticky "where am I" line (k-0474). */

const words = { stem: 'Question text', source: (letter: string) => `Source ${letter}`, teacher: 'Teacher only' };
const at = (question: StructuredQuestion, key: string | undefined) =>
  panelLocation(question, key, words).map((crumb) => `${crumb.kind}:${crumb.label}`);

describe('panelLocation', () => {
  const question = createDrqQuestion();
  const sources = question.blocks.filter((block): block is Extract<ContentBlock, { kind: 'source' }> => block.kind === 'source');

  it('names the question text, and the source a selection is inside', () => {
    expect(at(question, editTargetKey({ kind: 'blockText', blockId: question.blocks[0].id }))).toEqual(['stem:Question text']);
    expect(at(question, editTargetKey({ kind: 'sourceLabel', blockId: sources[1].id }))).toEqual(['stem:Question text', 'source:Source B']);
    const table = sources[0].blocks[0];
    if (table.kind !== 'table') throw new Error('Source A holds a table');
    const cell = editTargetKey({ kind: 'tableCell', blockId: table.id, cellId: table.rows[0].cells[0].id });
    expect(at(question, cell)).toEqual(['stem:Question text', 'source:Source A']);
  });

  it('names the part and sub-part, and their teacher-only answer', () => {
    const [, , c, , e] = question.parts;
    expect(at(question, editTargetKey({ kind: 'blockText', blockId: c.blocks[0].id }))).toEqual(['part:(c)']);
    const sub = c.subParts![1];
    expect(at(question, editTargetKey({ kind: 'blockText', blockId: sub.blocks[0].id }))).toEqual(['part:(c)', 'subPart:(ii)']);
    expect(at(question, editTargetKey({ kind: 'subPartAnswer', questionId: question.id, partId: c.id, subPartId: sub.id }))).toEqual([
      'part:(c)',
      'subPart:(ii)',
      'scheme:Teacher only',
    ]);
    expect(at(question, editTargetKey({ kind: 'partAnswer', questionId: question.id, partId: e.id }))).toEqual(['part:(e)', 'scheme:Teacher only']);
    // The essay note before (e) belongs to (e).
    expect(at(question, editTargetKey({ kind: 'blockText', blockId: e.blocksBefore![0].id }))).toEqual(['part:(e)']);
  });

  it('says nothing for no selection or one outside this question', () => {
    expect(at(question, undefined)).toEqual([]);
    expect(at(question, editTargetKey({ kind: 'blockText', blockId: 'elsewhere' }))).toEqual([]);
    expect(at(question, 'layoutText:x')).toEqual([]);
  });
});
