import { describe, expect, it, vi } from 'vitest';
import '@/registry';
import { resolveMessages } from '@/i18n/catalogue';
import { createSourceBlock, createStructuredQuestion } from '@/model/factories';
import { createWorksheetFrom } from '@/model/newWorksheet';
import type { ContentBlock, Worksheet } from '@/model/types';
import { ADD_RAIL_MESSAGES } from './AddRail.messages';
import { buildInsertEntries, type InsertEntry } from './insertEntries';

/** Insert → Source…: a DRQ's data source started with a table, a stakeholder diagram or text (k-0469). */

function withQuestion(documentType: 'classroom' | 'paper1'): { worksheet: Worksheet; questionId: string } {
  const worksheet = createWorksheetFrom({ documentType });
  const question = createStructuredQuestion();
  return {
    worksheet: { ...worksheet, questions: [...worksheet.questions, question], flow: [...worksheet.flow, { type: 'question', id: question.id }] },
    questionId: question.id,
  };
}

function entries(worksheet: Worksheet, afterId: string | undefined, insertBlockAtAnchor = vi.fn()) {
  return buildInsertEntries({
    m: resolveMessages(ADD_RAIL_MESSAGES, 'en'),
    english: true,
    worksheet,
    afterId,
    labelFor: (id) => (id ? 'Q1' : undefined),
    addQuestion: vi.fn(),
    addLayoutElement: vi.fn(),
    insertBlockAtAnchor,
  }).layout;
}

const sourceEntry = (list: InsertEntry[]) => list.find((entry) => entry.id === 'source');

describe('Insert → Source…', () => {
  it('offers a source with a table, a stakeholder diagram or text, landing in the question', () => {
    const { worksheet, questionId } = withQuestion('classroom');
    const entry = sourceEntry(entries(worksheet, questionId));
    expect(entry?.label).toBe('Source…');
    expect(entry?.hint).toBe('into Q1');
    expect(entry?.choices?.map((choice) => choice.id)).toEqual(['source-table', 'source-stakeholders', 'source-text']);
    // Right after Picture…, beside the other things that go into a question.
    expect(entries(worksheet, questionId).map((e) => e.id).slice(0, 3)).toEqual(['table', 'picture', 'source']);
  });

  it('is withheld on a Paper 1, which holds MC questions only', () => {
    const { worksheet, questionId } = withQuestion('paper1');
    expect(sourceEntry(entries(worksheet, questionId))).toBeUndefined();
  });

  it('inserts the source with its body, lettered after the sources already there', () => {
    const { worksheet, questionId } = withQuestion('classroom');
    const insert = vi.fn();
    const run = (w: Worksheet, id: string) => sourceEntry(entries(w, questionId, insert))!.choices!.find((c) => c.id === id)!.run!(questionId);

    run(worksheet, 'source-table');
    const first = insert.mock.calls[0][0] as Extract<ContentBlock, { kind: 'source' }>;
    expect(insert.mock.calls[0][1]).toBe(questionId);
    expect(first.label?.en[0].text).toBe('Source A: ');
    expect(first.blocks.map((block) => block.kind)).toEqual(['table']);

    const withA: Worksheet = {
      ...worksheet,
      questions: worksheet.questions.map((q) => (q.id === questionId ? { ...q, blocks: [...q.blocks, createSourceBlock('A')] } : q)),
    };
    run(withA, 'source-stakeholders');
    const second = insert.mock.calls[1][0] as Extract<ContentBlock, { kind: 'source' }>;
    expect(second.label?.en[0].text).toBe('Source B: ');
    expect(second.label?.zh[0].text).toBe('資料B：');
    expect(second.blocks[0]).toMatchObject({ kind: 'diagram', align: 'center' });
    expect(second.blocks[0].kind === 'diagram' && second.blocks[0].diagram.stakeholder?.stakeholders.length).toBe(4);

    run(withA, 'source-text');
    expect((insert.mock.calls[2][0] as Extract<ContentBlock, { kind: 'source' }>).blocks.map((b) => b.kind)).toEqual(['paragraph']);
  });

  it('with no question to go into, still names where it lands', () => {
    const { worksheet } = withQuestion('classroom');
    expect(sourceEntry(entries(worksheet, undefined))?.hint).toBe('as a new question');
  });
});
