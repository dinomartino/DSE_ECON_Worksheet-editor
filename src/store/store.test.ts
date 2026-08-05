import { beforeEach, describe, expect, it } from 'vitest';
import { questionMarks } from '@/model/marks';
import {
  createAnswerLinesElement,
  createPageBreakElement,
  createSpacerElement,
  createTextElement,
  resolveFlow,
  MIN_ANSWER_LINES,
  MIN_SPACER_PT,
} from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { HEADER_FOOTER_PRESETS } from '@/model/bands';
import { defaultHeader, firstPageHeaderFooter, headerFooterOf } from '@/model/page';
import { bi, plain } from '@/model/text';
import type { McqQuestion, StructuredQuestion } from '@/model/types';
import { buildAcceptanceWorksheet } from '@/test/fixtures';
import { useWorksheetStore } from './worksheetStore';

const store = () => useWorksheetStore.getState();

beforeEach(() => {
  useWorksheetStore.setState({
    worksheet: buildAcceptanceWorksheet(),
    past: [],
    future: [],
    mode: { language: 'bilingual', version: 'student' },
    selectedQuestionId: undefined,
    insertAnchorId: undefined,
    insertMenuRequest: 0,
    dirty: false,
  });
});

describe('undo/redo (§10, §11.13)', () => {
  it('undoes and redoes an edit', () => {
    const questionId = store().worksheet.questions[0].id;

    store().updateQuestion(questionId, { marks: 5 });
    expect((store().worksheet.questions[0] as McqQuestion).marks).toBe(5);
    expect(store().canUndo()).toBe(true);

    store().undo();
    expect((store().worksheet.questions[0] as McqQuestion).marks).toBe(1);

    store().redo();
    expect((store().worksheet.questions[0] as McqQuestion).marks).toBe(5);
  });

  it('undoes an add, a delete and a reorder', () => {
    const before = store().worksheet.questions.length;

    store().addQuestion('mcq');
    expect(store().worksheet.questions.length).toBe(before + 1);
    store().undo();
    expect(store().worksheet.questions.length).toBe(before);

    const firstId = store().worksheet.questions[0].id;
    store().removeQuestion(firstId);
    expect(store().worksheet.questions.find((q) => q.id === firstId)).toBeUndefined();
    store().undo();
    expect(store().worksheet.questions[0].id).toBe(firstId);

    const secondId = store().worksheet.questions[1].id;
    store().moveQuestion(firstId, 1);
    expect(store().worksheet.questions[0].id).toBe(secondId);
    store().undo();
    expect(store().worksheet.questions[0].id).toBe(firstId);
  });

  it('discards the redo branch once a new edit lands', () => {
    const questionId = store().worksheet.questions[0].id;
    store().updateQuestion(questionId, { marks: 3 });
    store().undo();
    expect(store().canRedo()).toBe(true);

    store().updateQuestion(questionId, { marks: 7 });
    expect(store().canRedo()).toBe(false);
  });

  it('is a no-op at the ends of the history', () => {
    const snapshot = store().worksheet;
    store().undo();
    expect(store().worksheet).toBe(snapshot);
    store().redo();
    expect(store().worksheet).toBe(snapshot);
  });

  it('treats loading a document as a fresh history, not an undoable edit', () => {
    store().updateWorksheet({ title: bi('Changed', '改變') });
    expect(store().canUndo()).toBe(true);

    store().replaceWorksheet(buildAcceptanceWorksheet());
    expect(store().canUndo()).toBe(false);
    expect(store().canRedo()).toBe(false);
  });
});

describe('question operations (§5.3)', () => {
  it('duplicates a question with fresh ids throughout', () => {
    const worksheet = store().worksheet;
    const original = worksheet.questions[5] as StructuredQuestion;

    store().duplicateQuestion(original.id);
    // The copy lands immediately after its original, wherever that is.
    const questions = store().worksheet.questions;
    const clone = questions[6] as StructuredQuestion;

    expect(questions.length).toBe(8);
    expect(clone.id).not.toBe(original.id);
    expect(clone.parts[0].id).not.toBe(original.parts[0].id);
    expect(clone.parts[1].subParts![0].id).not.toBe(original.parts[1].subParts![0].id);
    // Content is identical, and derived marks match.
    expect(questionMarks(clone)).toBe(questionMarks(original));

    const stemText = (question: StructuredQuestion) => {
      const block = question.parts[0].blocks[0];
      return block.kind === 'paragraph' ? plain(block.text.en) : '';
    };
    expect(stemText(clone)).toBe(stemText(original));
    expect(stemText(clone)).toBeTruthy();
  });

  it('moves a question under another section and renumbers', () => {
    // "Into Section B" is now "after Section B's heading" — there is no container to
    // move it into, so the same `reorderFlowItem` every drag uses expresses it.
    const questionId = store().worksheet.questions[0].id;
    const sectionB = store().worksheet.layout.filter((e) => e.kind === 'section')[1];

    store().reorderFlowItem(questionId, sectionB.id, 'after');

    // Section B restarts at 1, and the question now leads its run.
    const plan = computeNumbering(store().worksheet);
    expect(plan.byQuestionId.get(questionId)!.number).toBe(1);
    expect(plan.byQuestionId.get(questionId)!.sectionId).toBe(sectionB.id);
  });

  it('drag-reorders a question to a target position (§5.1)', () => {
    const ids = store().worksheet.questions.map((q) => q.id);

    // Drag the first question onto the fourth's position. The tail beyond the questions
    // this drag touches is spelled out rather than assumed, since the document is one
    // flat list now and not five questions in a section.
    const tail = ids.slice(5);
    store().reorderQuestion(ids[0], ids[3]);
    expect(store().worksheet.questions.map((q) => q.id)).toEqual([
      ids[1], ids[2], ids[0], ids[3], ids[4], ...tail,
    ]);

    // Dragging backwards puts it directly before the target.
    store().reorderQuestion(ids[4], ids[1]);
    expect(store().worksheet.questions.map((q) => q.id)).toEqual([
      ids[4], ids[1], ids[2], ids[0], ids[3], ...tail,
    ]);

    // And it is undoable like any other edit.
    store().undo();
    store().undo();
    expect(store().worksheet.questions.map((q) => q.id)).toEqual(ids);
  });

  it('drag-reorders across a section boundary', () => {
    const sourceId = store().worksheet.questions[0].id;
    const targetId = store().worksheet.questions[6].id;

    store().reorderQuestion(sourceId, targetId);

    const ids = store().worksheet.questions.map((q) => q.id);
    expect(ids.indexOf(sourceId)).toBe(ids.indexOf(targetId) - 1);
  });

  it('ignores a drag onto itself or onto an unknown question', () => {
    const ids = store().worksheet.questions.map((q) => q.id);
    store().reorderQuestion(ids[0], ids[0]);
    store().reorderQuestion(ids[0], 'not-a-question');
    expect(store().worksheet.questions.map((q) => q.id)).toEqual(ids);
    expect(store().canUndo()).toBe(false);
  });

  it('adds a question through the registry and selects it', () => {
    store().addQuestion('structured');
    const added = store().worksheet.questions.at(-1)!;
    expect(added.type).toBe('structured');
    expect(store().selectedQuestionId).toBe(added.id);
  });

  it('ignores an unknown question type rather than corrupting the document', () => {
    const before = store().worksheet.questions.length;
    store().addQuestion('does-not-exist');
    expect(store().worksheet.questions.length).toBe(before);
  });
});

describe('output mode (§5.4)', () => {
  it('drives language and version independently', () => {
    store().setMode({ language: 'zh' });
    expect(store().mode).toEqual({ language: 'zh', version: 'student' });
    store().setMode({ version: 'teacher' });
    expect(store().mode).toEqual({ language: 'zh', version: 'teacher' });
  });

  it('never clears hidden-language content when the mode changes (§5.2)', () => {
    const questionId = store().worksheet.questions[0].id;
    const stem = () => {
      const block = store().worksheet.questions[0].blocks[0];
      return block.kind === 'paragraph' ? block.text : { en: [], zh: [] };
    };

    expect(plain(stem().en)).toBeTruthy();
    expect(plain(stem().zh)).toBeTruthy();

    // Switch to English-only and edit the visible side, exactly as the sidebar does:
    // patch one language, leave the other untouched.
    store().setMode({ language: 'en' });
    const block = store().worksheet.questions[0].blocks[0];
    if (block.kind === 'paragraph') {
      store().updateQuestion(questionId, {
        blocks: [{ ...block, text: { ...block.text, en: [{ text: 'Rewritten in EN' }] } }],
      });
    }

    // The Chinese side survives, and reappears when the mode switches back.
    expect(plain(stem().en)).toBe('Rewritten in EN');
    expect(plain(stem().zh)).toBe('當需求下降時會發生甚麼？');

    store().setMode({ language: 'bilingual' });
    expect(plain(stem().zh)).toBe('當需求下降時會發生甚麼？');

    // Switching mode is a view change, not an edit — it must not enter the history.
    store().undo();
    expect(plain(stem().en)).toBe('What happens when demand falls?');
    expect(plain(stem().zh)).toBe('當需求下降時會發生甚麼？');
  });
});

describe('moving a page (§page rail)', () => {
  /*
   * A page is not a thing in the model — the rail hands the store the ids the
   * paginator measured onto one sheet. These cover the two ways that indirection used
   * to lose content: a run whose members did not all live in one section, and a page
   * whose own break was left out of the run it belongs to.
   *
   * The first of those is no longer expressible. A run spanning a section heading is
   * just a run, because there are no containers for it to span — which is why the
   * store's `movePage` lost the carrying loop that used to precede the move.
   */
  const orderOf = () => store().worksheet.questions.map((question) => question.id);
  // Display order, questions and layout elements together — the order the page is
  // actually paginated from, which is what a page move has to get right.
  const flowIds = () => resolveFlow(store().worksheet).map((item) => item.id);

  it('moves a run that spans a section heading, without stranding any of it', () => {
    const sectionB = store().worksheet.layout.filter((e) => e.kind === 'section')[1];
    // Two questions from before the heading, dropped after the last question.
    const run = orderOf().slice(0, 2);
    const anchor = orderOf().at(-1)!;

    store().movePage(run, [anchor], 'after');

    const ids = orderOf();
    // The whole run moved together and stayed in document order.
    expect(ids.slice(-2)).toEqual(run);
    // It is past Section B's heading now, so those questions read under Section B.
    const flow = flowIds();
    expect(flow.indexOf(run[0])).toBeGreaterThan(flow.indexOf(sectionB.id));
  });

  it('moves a page break along with the page it opened', () => {
    const questionIds = orderOf();
    const pageBreak = createPageBreakElement();
    store().addLayoutElement(pageBreak, questionIds[1]);
    const breakId = pageBreak.id;

    // The page the break opens: the break itself, then the question on it. This is
    // exactly the shape `PageComposition.flowIds` reports.
    store().movePage([breakId, questionIds[2]], [questionIds[0]], 'before');

    const order = flowIds();
    // The break stays immediately in front of its own question. Leaving it behind is
    // what made a dragged page reflow back to roughly where it started.
    expect(order.indexOf(breakId)).toBe(order.indexOf(questionIds[2]) - 1);
    expect(order.indexOf(breakId)).toBeLessThan(order.indexOf(questionIds[0]));
  });

  it('refuses to drop a page onto itself', () => {
    const ids = orderOf().slice(0, 2);
    const before = orderOf();
    store().movePage(ids, [ids[0]], 'before');
    expect(orderOf()).toEqual(before);
  });

  /*
   * Getting back to page 1.
   *
   * The first sheet is the one destination no anchor can name: nothing precedes it, so
   * it can never carry a page break, and once its content is dragged away it has no
   * members either. Dropping onto its card had nothing to order against, which left an
   * emptied page 1 permanently blank — the items were gone and the only route back
   * refused the drop.
   */
  it('lands a run at the head of the document', () => {
    const ids = orderOf();
    const run = ids.slice(-2);

    store().moveToDocumentStart(run);

    // The run leads the document and kept its own order.
    expect(orderOf().slice(0, 2)).toEqual(run);
  });

  it('puts the run in front of a leading layout element too', () => {
    // The head of the *flow*, not just of `questions` — page 1 may open with a section
    // heading, and landing after it would put the items under the wrong section.
    const heading = store().worksheet.layout.filter((e) => e.kind === 'section')[0];
    const run = orderOf().slice(-1);

    store().moveToDocumentStart(run);

    const order = flowIds();
    expect(order.indexOf(run[0])).toBeLessThan(order.indexOf(heading.id));
  });

  it('does nothing when the run is the whole document', () => {
    const all = flowIds();
    const before = flowIds();
    store().moveToDocumentStart(all);
    expect(flowIds()).toEqual(before);
  });
});

/**
 * Sizing answer lines and blank space.
 *
 * Both are edited from two surfaces — a stepper in the outline and a drag handle on the
 * page — so the floor is enforced in the store rather than in either of them. A floor
 * held in two places is one that eventually disagrees with itself.
 */
describe('extending answer lines and blank space', () => {
  it('sets a line count from either surface through one verb', () => {
    const element = createAnswerLinesElement(4);
    store().addLayoutElement(element);

    store().resizeLayoutElement(element.id, 9);

    const stored = store().worksheet.layout.find((e) => e.id === element.id);
    expect(stored).toMatchObject({ kind: 'answerLines', lines: 9 });
  });

  it('never drops below one line, however far a drag overshoots', () => {
    // Zero lines renders as absence: the element is still in the flow and still in the
    // outline, but invisible on the page — so the teacher adds another one.
    const element = createAnswerLinesElement(3);
    store().addLayoutElement(element);

    store().resizeLayoutElement(element.id, -5);

    expect(store().worksheet.layout.find((e) => e.id === element.id)).toMatchObject({
      lines: MIN_ANSWER_LINES,
    });
  });

  it('holds a spacer to a height that still takes space', () => {
    const element = createSpacerElement(48);
    store().addLayoutElement(element);

    store().resizeLayoutElement(element.id, 0);

    expect(store().worksheet.layout.find((e) => e.id === element.id)).toMatchObject({
      heightPt: MIN_SPACER_PT,
    });
  });

  it('clamps a size patched in through updateLayoutElement too', () => {
    // The sidebar's other edits route through the generic patch verb, so the floor
    // cannot live only in `resizeLayoutElement`.
    const element = createAnswerLinesElement(4);
    store().addLayoutElement(element);

    store().updateLayoutElement(element.id, { lines: 0 });

    expect(store().worksheet.layout.find((e) => e.id === element.id)).toMatchObject({
      lines: MIN_ANSWER_LINES,
    });
  });

  it('leaves an element with no size untouched', () => {
    // A stale handle firing against a since-deleted element must be dropped, not throw.
    const element = createPageBreakElement();
    store().addLayoutElement(element);

    store().resizeLayoutElement(element.id, 12);

    expect(store().worksheet.layout.find((e) => e.id === element.id)).toEqual(element);
  });

  it('is one undo entry per commit', () => {
    const element = createAnswerLinesElement(4);
    store().addLayoutElement(element);

    store().resizeLayoutElement(element.id, 10);
    store().undo();

    expect(store().worksheet.layout.find((e) => e.id === element.id)).toMatchObject({
      lines: 4,
    });
  });
  it('splits into a second element when a drag asks for more than the page holds', () => {
    // The cap stops any single element outgrowing a sheet — the one overflow the
    // paginator cannot fix by moving something — so asking for more has to produce
    // another element rather than an oversized one.
    const element = createAnswerLinesElement(20);
    store().addLayoutElement(element);

    store().splitLayoutRows(element.id, 20, 8, 26);

    const rows = store().worksheet.layout.filter((e) => e.kind === 'answerLines');
    expect(rows.map((e) => (e as { lines: number }).lines)).toEqual([20, 8]);
    // The new element is real: its own id, so it is separately movable and deletable.
    expect(rows[1].id).not.toBe(element.id);
  });

  it('puts the new element immediately after the one it came from', () => {
    const first = createAnswerLinesElement(4);
    const later = createSpacerElement(24);
    store().addLayoutElement(first);
    store().addLayoutElement(later);

    store().splitLayoutRows(first.id, 12, 5, 26);

    const created = store().worksheet.layout.find(
      (e) => e.kind === 'answerLines' && e.id !== first.id,
    )!;
    const order = resolveFlow(store().worksheet).map((i) => i.id);
    expect(order.indexOf(created.id)).toBe(order.indexOf(first.id) + 1);
    // ...and before whatever already followed, so the overflow reads in document order.
    expect(order.indexOf(created.id)).toBeLessThan(order.indexOf(later.id));
  });

  it('is one undo entry, because one gesture made it', () => {
    const element = createAnswerLinesElement(20);
    store().addLayoutElement(element);

    store().splitLayoutRows(element.id, 20, 8, 26);
    store().undo();

    const rows = store().worksheet.layout.filter((e) => e.kind === 'answerLines');
    expect(rows).toHaveLength(1);
    expect((rows[0] as { lines: number }).lines).toBe(20);
  });

  it('refuses to divide a spacer, which is one gap rather than a run', () => {
    // Two gaps on two pages is not what asking for a taller one means.
    const element = createSpacerElement(48);
    store().addLayoutElement(element);

    store().splitLayoutRows(element.id, 48, 20, 26);

    expect(store().worksheet.layout.filter((e) => e.kind === 'spacer')).toHaveLength(1);
    expect(store().worksheet.layout.filter((e) => e.kind === 'answerLines')).toHaveLength(0);
  });
  it('cuts an overflow longer than a page into sheet-sized pieces', () => {
    // Dragging for 48 lines on a page with room for 16 must not produce 16 + 32: the
    // 32 would overflow its own sheet, reintroducing the very thing the cap prevents.
    const element = createAnswerLinesElement(4);
    store().addLayoutElement(element);

    store().splitLayoutRows(element.id, 16, 32, 26);

    const rows = store()
      .worksheet.layout.filter((e) => e.kind === 'answerLines')
      .map((e) => (e as { lines: number }).lines);
    expect(rows).toEqual([16, 26, 6]);
  });

  it('keeps the pieces of a long overflow in document order', () => {
    const element = createAnswerLinesElement(4);
    store().addLayoutElement(element);

    store().splitLayoutRows(element.id, 16, 32, 26);

    const order = resolveFlow(store().worksheet).map((i) => i.id);
    const ids = store()
      .worksheet.layout.filter((e) => e.kind === 'answerLines')
      .map((e) => e.id);
    const positions = ids.map((id) => order.indexOf(id));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

/**
 * A header in "different" mode holds two independent row lists, and every structural
 * action has to say which one it means. Before `BandScope`, "+ Row" and every preset
 * wrote to the running list unconditionally — so a teacher looking at page 1, clicking
 * the controls that page 1 offers, changed page 2 and saw nothing happen where they
 * were looking. Both failure directions are silent, so both are asserted here.
 */
describe('first-page header rows (§ page 1 can differ)', () => {
  const header = () => headerFooterOf(store().worksheet.header, defaultHeader);

  beforeEach(() => {
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[0].build());
    store().setFirstPageMode('header', 'different');
  });

  it('starts page 1 as a copy of the running rows, with its own ids', () => {
    const value = header();
    expect(value.firstPage?.bands).toHaveLength(value.bands.length);
    const runningIds = new Set(value.bands.map((b) => b.id));
    expect(value.firstPage!.bands.every((b) => !runningIds.has(b.id))).toBe(true);
  });

  it('adds a row to page 1 without touching the running rows', () => {
    const before = header();
    store().addHeaderFooterBand('header', undefined, 'firstPage');
    const after = header();
    expect(after.firstPage!.bands).toHaveLength(before.firstPage!.bands.length + 1);
    expect(after.bands).toHaveLength(before.bands.length);
  });

  it('applies a preset to page 1 without touching the running rows', () => {
    const runningBefore = header().bands;
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[2].build(), 'firstPage');
    const after = header();
    expect(after.firstPage!.bands).toHaveLength(3);
    expect(after.bands.map((b) => b.id)).toEqual(runningBefore.map((b) => b.id));
  });

  it('still writes to the running rows by default', () => {
    const before = header();
    store().addHeaderFooterBand('header');
    const after = header();
    expect(after.bands).toHaveLength(before.bands.length + 1);
    expect(after.firstPage!.bands).toHaveLength(before.firstPage!.bands.length);
  });

  it('deletes a page-1 row by its own id, leaving the running rows alone', () => {
    const before = header();
    const target = before.firstPage!.bands[0].id;
    store().removeHeaderFooterBand('header', target);
    const after = header();
    expect(after.firstPage!.bands.some((b) => b.id === target)).toBe(false);
    expect(after.firstPage!.bands).toHaveLength(before.firstPage!.bands.length - 1);
    expect(after.bands).toHaveLength(before.bands.length);
  });
});

/**
 * A write aimed at page 1 **creates** the separation rather than requiring it.
 *
 * The panel used to make a teacher build a running header first, then choose "Its own
 * rows" — which copied it — then edit the copy. That is backwards from how a paper is
 * made: the cover is the first thing decided. The store enforced the same ordering, and
 * silently: with `scope: 'firstPage'` but no `firstPage` yet, the row fell through to the
 * running list, so the surface being looked at was not the one being edited.
 */
describe('page 1 can be built first (§ page 1 can differ)', () => {
  const header = () => headerFooterOf(store().worksheet.header, defaultHeader);

  // A header with no rows yet — the state a teacher starts a cover from. The acceptance
  // fixture ships one, which would hide exactly the fall-through this guards against.
  beforeEach(() => {
    store().setHeaderFooterBands('header', []);
  });

  it('a page-1 preset on a fresh header writes page 1, not the running rows', () => {
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[1].build(), 'firstPage');
    const value = header();
    expect(value.firstPage?.bands).toHaveLength(HEADER_FOOTER_PRESETS[1].build().length);
    // The running list stays empty: choosing a cover says nothing about later pages.
    expect(value.bands).toHaveLength(0);
  });

  it('a page-1 row on a fresh header writes page 1, not the running rows', () => {
    store().addHeaderFooterBand('header', undefined, 'firstPage');
    const value = header();
    expect(value.firstPage?.bands).toHaveLength(1);
    expect(value.bands).toHaveLength(0);
  });

  it('enables the edge and prints on page 1, since building it is the intent to use it', () => {
    store().addHeaderFooterBand('header', undefined, 'firstPage');
    const value = header();
    expect(value.enabled).toBe(true);
    // Not `showOnFirstPage: false`, which is the *other* state — deliberately blank.
    expect(value.showOnFirstPage).toBe(true);
  });

  it('leaves the running rows alone when page 1 is built after them', () => {
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[0].build());
    const runningIds = header().bands.map((b) => b.id);
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[1].build(), 'firstPage');
    const value = header();
    expect(value.bands.map((b) => b.id)).toEqual(runningIds);
    expect(value.firstPage?.bands).toHaveLength(HEADER_FOOTER_PRESETS[1].build().length);
  });

  it('resolves to page 1 differing, so the .docx emits a first-page part', () => {
    store().addHeaderFooterBand('header', undefined, 'firstPage');
    expect(firstPageHeaderFooter(header()).differs).toBe(true);
  });
});

/*
 * The insertion anchor: where the add rail puts the next item.
 *
 * The bug these guard is silent in both directions — an insert that lands somewhere
 * other than where the rail said costs a teacher an undo and a hunt through the
 * document, and nothing on screen explains it.
 */
describe('insertion anchor (§where things land)', () => {
  const flowIds = () => resolveFlow(store().worksheet).map((item) => item.id);

  it('points at a question when one is selected', () => {
    const questionId = store().worksheet.questions[1].id;
    store().select(questionId);
    expect(store().insertAnchorId).toBe(questionId);
  });

  it('clears when the selection is cleared, so the rail returns to appending', () => {
    store().select(store().worksheet.questions[0].id);
    store().select(undefined);
    expect(store().insertAnchorId).toBeUndefined();
  });

  it('holds a layout element, which selectedQuestionId could never express', () => {
    // The original bug: a heading or divider is selectable on the page, but that
    // selection lives in the preview, so the rail saw nothing and appended.
    const element = store().worksheet.layout[0];
    store().setInsertAnchor(element.id);
    expect(store().insertAnchorId).toBe(element.id);
  });

  it('inserts a question after the anchored layout element, not at the end', () => {
    const element = store().worksheet.layout[0];
    store().setInsertAnchor(element.id);
    store().addQuestion('mcq');

    const ids = flowIds();
    const added = store().selectedQuestionId!;
    expect(ids.indexOf(added)).toBe(ids.indexOf(element.id) + 1);
    // The tell for the old behaviour: it would have gone last.
    expect(ids.at(-1)).not.toBe(added);
  });

  it('advances onto what was just added, so consecutive inserts read down the page', () => {
    const first = store().worksheet.questions[0].id;
    store().setInsertAnchor(first);

    store().addQuestion('mcq');
    const one = store().selectedQuestionId!;
    expect(store().insertAnchorId).toBe(one);

    store().addQuestion('mcq');
    const two = store().selectedQuestionId!;

    const ids = flowIds();
    // Without the advance the second lands *above* the first and the document reads
    // backwards from what the teacher clicked.
    expect(ids.indexOf(two)).toBe(ids.indexOf(one) + 1);
  });

  it('advances onto a layout element too', () => {
    store().setInsertAnchor(store().worksheet.questions[0].id);
    store().addLayoutElement(createSpacerElement());
    const spacer = store().worksheet.layout.at(-1)!;
    expect(store().insertAnchorId).toBe(spacer.id);
  });

  it('drops an anchor whose item was deleted, rather than pointing at a ghost', () => {
    const questionId = store().worksheet.questions[0].id;
    store().setInsertAnchor(questionId);
    store().removeQuestion(questionId);
    // A dangling id inserts like no id at all, so the rail would claim a position and
    // silently append. Clearing it makes the label tell the truth instead.
    expect(store().insertAnchorId).toBeUndefined();
  });

  it('drops an anchor onto a deleted layout element', () => {
    const element = store().worksheet.layout[0];
    store().setInsertAnchor(element.id);
    store().removeLayoutElement(element.id);
    expect(store().insertAnchorId).toBeUndefined();
  });

  it('survives an edit that does not remove the anchored item', () => {
    const questionId = store().worksheet.questions[0].id;
    store().setInsertAnchor(questionId);
    store().updateQuestion(questionId, { marks: 3 });
    expect(store().insertAnchorId).toBe(questionId);
  });

  it('drops the anchor when undo removes the item it advanced onto', () => {
    store().setInsertAnchor(store().worksheet.questions[0].id);
    store().addQuestion('mcq');
    const added = store().insertAnchorId;
    store().undo();
    expect(added).toBeDefined();
    expect(store().insertAnchorId).toBeUndefined();
  });

  it('clears on loading another document, whose ids are unrelated', () => {
    store().setInsertAnchor(store().worksheet.questions[0].id);
    store().replaceWorksheet(buildAcceptanceWorksheet());
    expect(store().insertAnchorId).toBeUndefined();
  });

  /*
   * An unanchored question joins the questions, rather than falling past the paper's
   * closing lines.
   *
   * Both exam papers end in one: "END OF PAPER" on a Paper 1, "END OF SECTION A/B" and
   * "END OF PAPER" in the booklet. Appending blindly put every added question after the
   * line announcing the paper had finished — and the cover tells the candidate to check
   * for exactly that line after the last question, so the document contradicted itself.
   * Derived from position, never a stored flag: a closing line is an ordinary text
   * element a teacher may drag, reword or delete.
   */
  describe('an unanchored question lands with the questions', () => {
    const ids = () => resolveFlow(store().worksheet).map((item) => item.id);

    const load = (documentType: 'paper1' | 'lqMock' | 'classroom') => {
      store().replaceWorksheet(createWorksheetFrom({ documentType, seedSample: false }));
    };

    it('goes before "END OF PAPER" on a Paper 1, not after it', () => {
      load('paper1');
      const closing = store().worksheet.layout.at(-1)!;
      store().addQuestion('mcq');

      const order = ids();
      const added = store().selectedQuestionId!;
      expect(order.indexOf(added)).toBeLessThan(order.indexOf(closing.id));
      // The old behaviour, and the tell a teacher actually saw on the page.
      expect(order.at(-1)).toBe(closing.id);
    });

    it('keeps consecutive unanchored adds in order, all ahead of the closing line', () => {
      load('paper1');
      const closing = store().worksheet.layout.at(-1)!;

      store().addQuestion('mcq');
      const one = store().selectedQuestionId!;
      // Clear the anchor, so each add takes the unanchored path rather than riding the
      // advance — this is the case that used to scatter questions past the closing line.
      store().setInsertAnchor(undefined);
      store().addQuestion('mcq');
      const two = store().selectedQuestionId!;

      const order = ids();
      expect(order.indexOf(two)).toBe(order.indexOf(one) + 1);
      expect(order.indexOf(two)).toBeLessThan(order.indexOf(closing.id));
    });

    it('lands under the booklet’s last section, ahead of "END OF PAPER"', () => {
      load('lqMock');
      const elements = store().worksheet.layout;
      const closing = elements.at(-1)!;
      const lastSection = elements.filter((el) => el.kind === 'section').at(-1)!;

      store().addQuestion('structured');
      const order = ids();
      const added = order.indexOf(store().selectedQuestionId!);

      expect(added).toBeLessThan(order.indexOf(closing.id));
      // A section is what a question belongs *to*: walking past Section C would file it
      // at the end of Section B, a different part of the paper than where it appears.
      expect(added).toBeGreaterThan(order.indexOf(lastSection.id));
    });

    /*
     * The walk steps over closing lines only — everything else at the tail of a paper
     * *introduces* the questions and must stay above them. Both of these were found by
     * walking too far, and neither is visible in a unit test of the closing line alone.
     */
    it('stays below the lead-in, which counts the questions it introduces', () => {
      load('paper1');
      const leadIn = store().worksheet.layout.find((el) => el.kind === 'questionCount')!;
      store().addQuestion('mcq');
      const order = ids();
      // Above it, "There are 2 questions in this paper." prints after the questions.
      expect(order.indexOf(store().selectedQuestionId!)).toBeGreaterThan(order.indexOf(leadIn.id));
    });

    it('stays below "Answer any ONE question.", which tells the candidate how to treat them', () => {
      load('lqMock');
      const note = store().worksheet.layout.find((el) =>
        el.kind === 'text' && el.format?.align !== 'center',
      )!;
      store().addQuestion('structured');
      const order = ids();
      expect(order.indexOf(store().selectedQuestionId!)).toBeGreaterThan(order.indexOf(note.id));
    });

    it('still appends a layout element, which has no closing line to fall behind', () => {
      // Adding a divider or a note after "END OF PAPER" is a thing a teacher may mean,
      // so only questions are placed by this rule.
      load('paper1');
      store().addLayoutElement(createSpacerElement());
      expect(ids().at(-1)).toBe(store().worksheet.layout.at(-1)!.id);
    });

    it('appends when the document has no questions yet', () => {
      load('classroom');
      store().addQuestion('mcq');
      expect(ids().at(-1)).toBe(store().selectedQuestionId);
    });

    it('leaves a classroom worksheet appending past its own trailing element', () => {
      // Nothing is known to close a worksheet, so a teacher's trailing note keeps
      // whatever position they gave it and the question goes after it, as always.
      load('classroom');
      const note = createTextElement(bi('A closing thought', ''));
      store().addLayoutElement(
        note.kind === 'text' ? { ...note, format: { align: 'center' } } : note,
      );
      store().setInsertAnchor(undefined);
      store().addQuestion('mcq');
      expect(ids().at(-1)).toBe(store().selectedQuestionId);
    });
  });

  it('counts each menu request, so a second gap re-opens the menu', () => {
    // A boolean already true would make the second click a no-op and the affordance
    // would read as dead on every gap after the first.
    const target = store().worksheet.questions[1].id;
    store().requestInsertMenu(target);
    const first = store().insertMenuRequest;
    store().requestInsertMenu(store().worksheet.layout[0].id);
    expect(store().insertMenuRequest).toBeGreaterThan(first);
    expect(store().insertAnchorId).toBe(store().worksheet.layout[0].id);
  });
});
