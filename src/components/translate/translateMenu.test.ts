import { describe, expect, it } from 'vitest';
import type { SlotMeta, TextSlot } from '@/model/textSlots';
import type { BiText } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import {
  AMBIGUOUS_TITLE,
  flowItemsRequest,
  layoutIdsWithText,
  outlineTranslateItem,
  pageTranslateItems,
  paperRequest,
  toolbarMenuEntries,
  type PageMenuSources,
} from './translateMenu';

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
const sources = (slots: TextSlot[], kinds: Record<string, string> = {}): PageMenuSources => ({
  slotsForTarget: (t2) => slots.filter((s) => JSON.stringify(s.target) === JSON.stringify(t2)),
  slots: () => slots,
  blockKind: (id) => kinds[id],
});

describe('pageTranslateItems — text and cell', () => {
  it('offers Fill for the missing side, auto-starting on that one path', () => {
    const items = pageTranslateItems('w1', { kind: 'text', target }, sources([slot('q:Q1/b:b1', t('Supply', ''), { questionId: 'Q1' })]), false);
    expect(items.map((i) => i.label)).toEqual(['Fill 中文', 'Translate this question…']);
    expect(items[0].request).toEqual({
      worksheetId: 'w1',
      mode: 'translate',
      scope: { kind: 'paths', paths: ['q:Q1/b:b1'] },
      autoStart: true,
    });
    expect(items[1].request?.scope).toEqual({ kind: 'questions', ids: ['Q1'] });

    const zhOnly = pageTranslateItems('w1', { kind: 'text', target }, sources([slot('p', t('', '供應'))]), false);
    expect(zhOnly.map((i) => i.label)).toEqual(['Fill English']);
  });

  it('offers Re-translate (never auto-started) when both sides exist, and nothing for an empty text', () => {
    const both = pageTranslateItems('w1', { kind: 'text', target }, sources([slot('p', t('Supply', '供應'))]), false);
    expect(both.map((i) => [i.label, i.request?.retranslate, i.request?.autoStart])).toEqual([
      ['Re-translate into 中文…', 'zh', undefined],
      ['Re-translate into English…', 'en', undefined],
    ]);
    expect(pageTranslateItems('w1', { kind: 'text', target }, sources([slot('p', t('', ''))]), false)).toEqual([]);
  });

  it('never offers Fill for an unprinted text', () => {
    const items = pageTranslateItems('w1', { kind: 'text', target }, sources([slot('p', t('Supply', ''), { unprinted: true })]), false);
    expect(items).toEqual([]);
  });

  it("picks the emitting question's copy of a duplicated block, whatever is selected", () => {
    const copies = [
      slot('q:Q1/b:b1', t('Supply', ''), { questionId: 'Q1' }),
      slot('q:Q2/b:b1', t('Supply', ''), { questionId: 'Q2' }),
    ];
    const second = pageTranslateItems('w1', { kind: 'text', target, questionId: 'Q2' }, sources(copies), false);
    expect(second[0].request?.scope).toEqual({ kind: 'paths', paths: ['q:Q2/b:b1'] });
    expect(second[1].request?.scope).toEqual({ kind: 'questions', ids: ['Q2'] });

    const unknown = pageTranslateItems('w1', { kind: 'text', target }, sources(copies), false);
    expect(unknown).toEqual([{ label: 'Translate…', disabled: true, title: AMBIGUOUS_TITLE }]);
  });

  it('reads a cell payload as its tableCell target', () => {
    const cell = slot('q:Q1/b:t1/cell:c1', t('Price ($)', ''), {
      kind: 'tableCell',
      questionId: 'Q1',
      target: { kind: 'tableCell', blockId: 't1', cellId: 'c1' },
    });
    const items = pageTranslateItems(
      'w1',
      { kind: 'cell', blockId: 't1', cellId: 'c1', questionId: 'Q1' },
      sources([{ ...cell, blockIds: ['t1'] }], { t1: 'table' }),
      false,
    );
    expect(items[0]).toMatchObject({ label: 'Fill 中文', request: { scope: { kind: 'paths', paths: ['q:Q1/b:t1/cell:c1'] } } });
    expect(items.map((i) => i.label)).toEqual(['Fill 中文', 'Translate this table', 'Translate this question…']);
  });

  it('is empty for a read-only document', () => {
    expect(pageTranslateItems('w1', { kind: 'text', target }, sources([slot('p', t('Supply', ''))]), true)).toEqual([]);
  });
});

describe('pageTranslateItems — blocks', () => {
  // A diagram (d1) inside a figure row (fr1): its labels list the outer id first.
  const label = (path: string, questionId: string, text = t('Demand', '')) =>
    slot(path, text, { kind: 'diagramLabel', fallsBack: true, questionId, blockIds: ['fr1', 'd1'], target: undefined });

  it('finds the labels of a diagram inside a figure row, scoped to the emitting question', () => {
    const slots = [label('q:Q1/a', 'Q1'), label('q:Q1/b', 'Q1'), label('q:Q2/a', 'Q2')];
    const items = pageTranslateItems('w1', { kind: 'block', blockId: 'd1', questionId: 'Q1' }, sources(slots, { d1: 'diagram' }), false);
    expect(items).toEqual([
      {
        label: 'Translate labels in this figure',
        request: {
          worksheetId: 'w1',
          mode: 'translate',
          scope: { kind: 'block', blockId: 'd1', questionId: 'Q1' },
          autoStart: true,
        },
      },
    ]);
    const outer = pageTranslateItems('w1', { kind: 'block', blockId: 'fr1', questionId: 'Q2' }, sources(slots), false);
    expect(outer[0].request?.scope).toEqual({ kind: 'block', blockId: 'fr1', questionId: 'Q2' });
  });

  it('names a table, skips Setup only for a few texts, and is disabled when the copy is unknown', () => {
    const cells = Array.from({ length: 4 }, (_, i) =>
      slot(`q:Q1/c${i}`, t(`Row ${i}`, ''), { kind: 'tableCell', questionId: 'Q1', blockIds: ['t1'] }),
    );
    const table = pageTranslateItems('w1', { kind: 'block', blockId: 't1', questionId: 'Q1' }, sources(cells, { t1: 'table' }), false);
    expect(table[0]).toMatchObject({ label: 'Translate this table' });
    expect(table[0].request?.autoStart).toBeUndefined();

    const copies = [label('q:Q1/a', 'Q1'), label('q:Q2/a', 'Q2')];
    expect(pageTranslateItems('w1', { kind: 'block', blockId: 'd1' }, sources(copies), false)).toEqual([
      { label: 'Translate labels in this figure', disabled: true, title: AMBIGUOUS_TITLE },
    ]);
  });

  it('offers nothing when every text in the block is already bilingual', () => {
    const done = [label('q:Q1/a', 'Q1', t('Demand', '需求'))];
    expect(pageTranslateItems('w1', { kind: 'block', blockId: 'd1', questionId: 'Q1' }, sources(done), false)).toEqual([]);
  });
});

describe('toolbarMenuEntries', () => {
  it('adds Translate and Check terms, and Settings only once a section is registered', () => {
    const none = toolbarMenuEntries({ worksheetId: 'w1', readOnly: false, hasSettings: false });
    expect(none.translate.map((e) => e.label)).toEqual(['Translate…', 'Check terms…']);
    expect(none.translate[1].run).toEqual({ kind: 'translate', request: paperRequest('w1', 'check') });
    expect(none.settings).toEqual([]);
    const some = toolbarMenuEntries({ worksheetId: 'w1', readOnly: false, hasSettings: true, settingsHint: '⌘,' });
    expect(some.settings).toEqual([{ label: 'Settings…', hint: '⌘,', run: { kind: 'settings' } }]);
  });

  it('drops the Translate items but keeps Settings in a read-only document', () => {
    const readOnly = toolbarMenuEntries({ worksheetId: 'w1', readOnly: true, hasSettings: true });
    expect(readOnly.translate).toEqual([]);
    expect(readOnly.settings.map((e) => [e.label, e.hint])).toEqual([['Settings…', undefined]]);
  });
});

describe('other entry points', () => {
  it('builds the toolbar, marquee and Outline requests', () => {
    expect(paperRequest('w1')).toEqual({ worksheetId: 'w1', mode: 'translate', scope: { kind: 'paper' } });
    expect(paperRequest('w1', 'check').mode).toBe('check');
    expect(flowItemsRequest('w1', ['Q1', 'L1']).scope).toEqual({ kind: 'flowItems', ids: ['Q1', 'L1'] });
    expect(outlineTranslateItem('w1', { kind: 'question', id: 'Q1' }, false)).toEqual({
      label: 'Translate question…',
      request: { worksheetId: 'w1', mode: 'translate', scope: { kind: 'questions', ids: ['Q1'] } },
    });
    expect(outlineTranslateItem('w1', { kind: 'layout', id: 'L1', holdsText: true }, false)?.request?.scope).toEqual({
      kind: 'flowItems',
      ids: ['L1'],
    });
    expect(outlineTranslateItem('w1', { kind: 'layout', id: 'L2', holdsText: false }, false)).toBeNull();
    expect(outlineTranslateItem('w1', { kind: 'question', id: 'Q1' }, true)).toBeNull();
  });

  it('offers a layout row Translate only when the walker finds printed text in it', () => {
    const layout = { kind: 'layout' as const, label: 'Page · Section A heading' };
    const ids = layoutIdsWithText([
      slot('flow.L1.text', t('Section A', ''), { group: { ...layout, id: 'L1' }, flowId: 'L1' }),
      slot('flow.L2.prefix', t('', '本卷共有'), { group: { ...layout, id: 'L2' }, flowId: 'L2', unprinted: true }),
      slot('title', t('Title', '')),
    ]);
    expect([...ids]).toEqual(['L1']);
  });
});
