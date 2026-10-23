import { beforeEach, describe, expect, it } from 'vitest';
// The registry loads first: the store and model modules below reach back into it and need it whole.
import '@/registry';
import { resolveMessages } from '@/i18n/catalogue';
import { createWorksheet } from '@/model/factories';
import { bi } from '@/model/text';
import type { LanguageMode, McqQuestion, Worksheet } from '@/model/types';
import { resolveOptionLayout } from '@/registry/mcq';
import { notify, resetNoticesForTest, runNoticeAction, useNoticeStore, type Notice } from '@/store/notices';
import { useWorksheetStore } from '@/store/worksheetStore';
import { withFlow } from '@/test/fixtures';
import { buildOptionLayoutPaper, withFigures } from '@/test/optionLayoutFixture';
import { DOCUMENT_SETTINGS_MESSAGES } from './DocumentSettings.messages';
import { applyOptionLayout } from './optionLayoutAction';

/**
 * Setup → Option layout for all MC questions, as the buttons run it: on the real store, with
 * the notices a teacher sees. One click is one history step (⌘Z), says how many questions it
 * changed, and offers an Undo that only ever undoes its own click.
 */

const store = () => useWorksheetStore.getState();
const en = resolveMessages(DOCUMENT_SETTINGS_MESSAGES, 'en');
const zh = resolveMessages(DOCUMENT_SETTINGS_MESSAGES, 'zh-HK');

const mcqs = (worksheet: Worksheet) => worksheet.questions.filter((q): q is McqQuestion => q.type === 'mcq');
const layouts = () => mcqs(store().worksheet).map(resolveOptionLayout);
const notice = (): Notice | undefined => useNoticeStore.getState().notices.find((n) => n.id === 'option-layout-all');

function open(worksheet: Worksheet, language: LanguageMode = 'en') {
  useWorksheetStore.setState({
    worksheet,
    past: [],
    future: [],
    dirty: false,
    readOnly: false,
    mode: { language, version: 'student' },
  });
}

beforeEach(() => {
  resetNoticesForTest();
  open(buildOptionLayoutPaper().worksheet);
});

describe('a click', () => {
  it('sets every MC question in one history step', () => {
    expect(applyOptionLayout('inline', en, notify)).toBe(3);
    expect(layouts()).toEqual(['inline', 'inline', 'inline', 'stacked']);
    expect(store().past).toHaveLength(1);
    expect(store().dirty).toBe(true);
  });

  it('says how many it changed, and which it had to leave', () => {
    applyOptionLayout('inline', en, notify);
    const raised = notice()!;
    expect(raised.tone).toBe('success');
    expect(raised.body).toBe('Changed 3 of 4 MC questions.');
    expect(raised.details).toEqual(['Left as they are: 1 figure question, which can’t go in a row.']);
    // A result with a convenience button: it fades, and ⌘Z stays.
    expect(raised.autoHide).toBe(true);
    expect(raised.actions?.map((action) => action.label)).toEqual(['Undo']);
  });

  it('says nothing about figures when none were left', () => {
    applyOptionLayout('columns2', en, notify);
    expect(notice()!.body).toBe('Changed 4 of 4 MC questions.');
    expect(notice()!.details).toBeUndefined();
  });

  it('replaces its notice instead of stacking a second', () => {
    applyOptionLayout('inline', en, notify);
    applyOptionLayout('columns2', en, notify);
    expect(useNoticeStore.getState().notices.filter((n) => n.id === 'option-layout-all')).toHaveLength(1);
    // The second click's result: the three rows go to 2 columns, and the figure question joins them.
    expect(notice()!.body).toBe('Changed 4 of 4 MC questions.');
  });

  it('fits in the language the page is showing', () => {
    open(buildOptionLayoutPaper().worksheet, 'zh');
    applyOptionLayout('fit', en, notify);
    expect(layouts()).toEqual(['inline', 'inline', 'columns2', 'columns2']);

    open(buildOptionLayoutPaper().worksheet, 'en');
    applyOptionLayout('fit', en, notify);
    expect(layouts()).toEqual(['inline', 'columns2', 'stacked', 'columns2']);
  });
});

describe('its Undo', () => {
  it('puts every layout back in one step, as ⌘Z does', () => {
    const before = store().worksheet;
    applyOptionLayout('columns2', en, notify);
    const [undo] = notice()!.actions!;
    expect(undo.live?.()).toBe(true);

    runNoticeAction('option-layout-all', undo);
    expect(store().worksheet).toBe(before);
    expect(store().past).toHaveLength(0);
    expect(notice()).toBeUndefined();
    // And it can be done again.
    store().redo();
    expect(layouts()).toEqual(['columns2', 'columns2', 'columns2', 'columns2']);
  });

  it('is retired by any later edit, and then undoes nothing', () => {
    applyOptionLayout('inline', en, notify);
    const [undo] = notice()!.actions!;
    store().updateWorksheet({ title: bi('Edited after', '') });
    expect(undo.live?.()).toBe(false);

    undo.run();
    expect(store().worksheet.title).toEqual(bi('Edited after', ''));
    expect(layouts()).toEqual(['inline', 'inline', 'inline', 'stacked']);
  });

  it('is retired by ⌘Z, which already undid it', () => {
    applyOptionLayout('inline', en, notify);
    const [undo] = notice()!.actions!;
    store().undo();
    expect(undo.live?.()).toBe(false);
    undo.run();
    expect(store().past).toHaveLength(0);
    expect(store().future).toHaveLength(1);
  });

  it('is the Undo of its own click, not of the one before', () => {
    applyOptionLayout('inline', en, notify);
    const [first] = notice()!.actions!;
    applyOptionLayout('columns2', en, notify);
    expect(first.live?.()).toBe(false);
    first.run();
    expect(layouts()).toEqual(['columns2', 'columns2', 'columns2', 'columns2']);
  });
});

describe('when there is nothing to change', () => {
  it('says so, and records no history', () => {
    expect(applyOptionLayout('stacked', en, notify)).toBe(0);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
    expect(notice()).toMatchObject({
      tone: 'info',
      body: 'Nothing to change: every MC question already has this layout.',
    });
    expect(notice()!.actions).toBeUndefined();
  });

  it('says it again for Fit each question', () => {
    applyOptionLayout('fit', en, notify);
    const past = store().past.length;
    expect(applyOptionLayout('fit', en, notify)).toBe(0);
    expect(store().past).toHaveLength(past);
    expect(notice()!.body).toBe('Nothing to change: every MC question already has the layout that fits its options.');
  });

  it('still says why a figure question was not moved', () => {
    const paper = buildOptionLayoutPaper();
    open(withFlow(createWorksheet(), [paper.figures]));
    expect(applyOptionLayout('inline', en, notify)).toBe(0);
    expect(notice()!.details).toEqual(['Left as they are: 1 figure question, which can’t go in a row.']);
    expect(store().past).toHaveLength(0);
  });

  it('is a paper that cannot be edited', () => {
    useWorksheetStore.setState({ readOnly: true });
    const before = store().worksheet;
    expect(applyOptionLayout('inline', en, notify)).toBe(0);
    expect(store().worksheet).toBe(before);
    expect(notice()).toBeUndefined();
  });

  it('is a paper whose questions were authored with figures only', () => {
    const paper = buildOptionLayoutPaper();
    open(withFlow(createWorksheet(), [withFigures(paper.short)]));
    expect(applyOptionLayout('inline', en, notify)).toBe(0);
  });
});

describe('in 繁體中文', () => {
  it('says the result and offers 復原', () => {
    applyOptionLayout('inline', zh, notify);
    const raised = notice()!;
    expect(raised.body).toBe('已更改 3 題（共 4 題 MC）。');
    expect(raised.details).toEqual(['維持不變：1 題圖形選項題，圖形選項不能橫列。']);
    expect(raised.actions?.map((action) => action.label)).toEqual(['復原']);
  });

  it('says when nothing needed changing', () => {
    applyOptionLayout('stacked', zh, notify);
    expect(notice()!.body).toBe('沒有需要更改：每題 MC 都已是這個排列。');
  });
});
