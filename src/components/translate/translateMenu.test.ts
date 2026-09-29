import { describe, expect, it } from 'vitest';
import type { SlotMeta, TextSlot } from '@/model/textSlots';
import type { BiText } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import { fillVerbFor, pageAiScope, toolbarSettingsEntries, type PageMenuSources } from './translateMenu';

const t = (en: string, zh: string): BiText => ({ en: en ? [{ text: en }] : [], zh: zh ? [{ text: zh }] : [] });
const target: EditTarget = { kind: 'blockText', blockId: 'b1' };

function slot(path: string, text: BiText, over: Partial<TextSlot & SlotMeta> = {}): TextSlot {
  return {
    path,
    text,
    kind: 'stem',
    role: 'print',
    group: { kind: 'question', id: over.questionId, label: 'Question 1' },
    blockIds: [],
    target,
    ...over,
  };
}

/** Hand-built slots; `translateMenu.integration.test.ts` runs the real walker. */
const sources = (slots: TextSlot[]): PageMenuSources => ({
  slotsForTarget: (t2) => slots.filter((s) => JSON.stringify(s.target) === JSON.stringify(t2)),
  slots: () => slots,
});

describe('pageAiScope — text and cell', () => {
  it('is the one printed text that was right-clicked, whatever its languages', () => {
    const one = sources([slot('q:Q1/b:b1', t('Supply', ''), { questionId: 'Q1' })]);
    expect(pageAiScope({ kind: 'text', target, questionId: 'Q1' }, one)).toEqual({ kind: 'paths', paths: ['q:Q1/b:b1'] });
    const both = sources([slot('p', t('Supply', '供應'))]);
    expect(pageAiScope({ kind: 'text', target }, both)).toEqual({ kind: 'paths', paths: ['p'] });
  });

  it('falls back to the question for an unprinted text, and to the paper outside any question', () => {
    const hidden = sources([slot('p', t('Supply', ''), { unprinted: true, questionId: 'Q1' })]);
    expect(pageAiScope({ kind: 'text', target, questionId: 'Q1' }, hidden)).toEqual({ kind: 'questions', ids: ['Q1'] });
    expect(pageAiScope({ kind: 'text', target }, sources([]))).toEqual({ kind: 'paper' });
  });

  it("picks the emitting question's copy of a duplicated block; an unknown copy is ambiguous", () => {
    const copies = [
      slot('q:Q1/b:b1', t('Supply', ''), { questionId: 'Q1' }),
      slot('q:Q2/b:b1', t('Supply', ''), { questionId: 'Q2' }),
    ];
    expect(pageAiScope({ kind: 'text', target, questionId: 'Q2' }, sources(copies))).toEqual({
      kind: 'paths',
      paths: ['q:Q2/b:b1'],
    });
    // No emitting question and two copies in two questions: the paper, never a guess.
    expect(pageAiScope({ kind: 'text', target }, sources(copies))).toEqual({ kind: 'paper' });
    // Two addresses inside one question: that question.
    const twice = [slot('q:Q1/a', t('A', ''), { questionId: 'Q1' }), slot('q:Q1/b', t('B', ''), { questionId: 'Q1' })];
    expect(pageAiScope({ kind: 'text', target }, sources(twice))).toEqual({ kind: 'questions', ids: ['Q1'] });
  });

  it('reads a cell payload as its tableCell target, else its table', () => {
    const cellTarget: EditTarget = { kind: 'tableCell', blockId: 't1', cellId: 'c1' };
    const cell = slot('q:Q1/b:t1/cell:c1', t('Price ($)', ''), { kind: 'tableCell', questionId: 'Q1', target: cellTarget, blockIds: ['t1'] });
    const payload = { kind: 'cell' as const, blockId: 't1', cellId: 'c1', questionId: 'Q1' };
    expect(pageAiScope(payload, sources([cell]))).toEqual({ kind: 'paths', paths: ['q:Q1/b:t1/cell:c1'] });
    const other = { ...cell, target: { ...cellTarget, cellId: 'c2' } };
    expect(pageAiScope(payload, sources([other]))).toEqual({ kind: 'block', blockId: 't1', questionId: 'Q1' });
  });
});

describe('pageAiScope — blocks', () => {
  // A diagram (d1) inside a figure row (fr1): its labels list the outer id first.
  const label = (path: string, questionId: string) =>
    slot(path, t('Demand', ''), { kind: 'diagramLabel', fallsBack: true, questionId, blockIds: ['fr1', 'd1'], target: undefined });

  it('is the block, scoped to the emitting question', () => {
    const slots = [label('q:Q1/a', 'Q1'), label('q:Q2/a', 'Q2')];
    expect(pageAiScope({ kind: 'block', blockId: 'd1', questionId: 'Q1' }, sources(slots))).toEqual({
      kind: 'block',
      blockId: 'd1',
      questionId: 'Q1',
    });
    expect(pageAiScope({ kind: 'block', blockId: 'fr1', questionId: 'Q2' }, sources(slots))).toEqual({
      kind: 'block',
      blockId: 'fr1',
      questionId: 'Q2',
    });
  });

  it('is the paper for a copied block with no emitting question, the question for an empty block', () => {
    const copies = [label('q:Q1/a', 'Q1'), label('q:Q2/a', 'Q2')];
    expect(pageAiScope({ kind: 'block', blockId: 'd1' }, sources(copies))).toEqual({ kind: 'paper' });
    expect(pageAiScope({ kind: 'block', blockId: 'd1' }, sources([label('q:Q1/a', 'Q1')]))).toEqual({ kind: 'block', blockId: 'd1' });
    expect(pageAiScope({ kind: 'block', blockId: 'img', questionId: 'Q3' }, sources(copies))).toEqual({
      kind: 'questions',
      ids: ['Q3'],
    });
  });
});

describe('pageAiScope — the question box', () => {
  it('is that question, even with no slots or a copied question elsewhere', () => {
    const copies = [slot('q:Q1/b:b1', t('Demand', ''), { questionId: 'Q1' }), slot('q:Q2/b:b1', t('Demand', ''), { questionId: 'Q2' })];
    expect(pageAiScope({ kind: 'question', questionId: 'Q2' }, sources(copies))).toEqual({ kind: 'questions', ids: ['Q2'] });
    expect(pageAiScope({ kind: 'question', questionId: 'Q9' }, sources([]))).toEqual({ kind: 'questions', ids: ['Q9'] });
  });
});

describe('fillVerbFor', () => {
  it("preselects the edition's side, or for a bilingual paper the side missing more often", () => {
    const slots = [slot('a', t('One', '')), slot('b', t('', '二')), slot('c', t('', '三')), slot('d', t('', '四'), { unprinted: true })];
    expect(fillVerbFor(slots, 'zh')).toBe('translate.fillZh');
    expect(fillVerbFor(slots, 'en')).toBe('translate.fillEn');
    expect(fillVerbFor(slots, 'bilingual')).toBe('translate.fillEn');
    expect(fillVerbFor([], 'bilingual')).toBe('translate.fillZh');
  });
});

describe('toolbarSettingsEntries', () => {
  it('is Settings… only once a section is registered, with the desktop hint', () => {
    expect(toolbarSettingsEntries({ hasSettings: false })).toEqual([]);
    expect(toolbarSettingsEntries({ hasSettings: true, settingsHint: '⌘,' })).toEqual([{ label: 'Settings…', hint: '⌘,' }]);
    expect(toolbarSettingsEntries({ hasSettings: true })).toEqual([{ label: 'Settings…' }]);
  });
});
