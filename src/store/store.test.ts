import { beforeEach, describe, expect, it } from 'vitest';
import { questionMarks } from '@/model/marks';
import {
  createAnswerLinesElement,
  createPageBreakElement,
  createSpacerElement,
  createStimulusElement,
  createTextElement,
  resolveFlow,
  MIN_ANSWER_LINES,
  MIN_SPACER_PT,
} from '@/model/flow';
import { computeNumbering } from '@/model/numbering';
import { createWorksheetFrom } from '@/model/newWorksheet';
import { HEADER_FOOTER_PRESETS } from '@/model/bands';
import {
  defaultHeader,
  firstPageHeaderFooter,
  firstPageModeOf,
  headerFooterOf,
  pageBandScope,
} from '@/model/page';
import { bi, plain, rt } from '@/model/text';
import type { TranslationWrite } from '@/model/textSlots';
import { mapWorksheetTexts } from '@/model/textWalk';
import { createWorksheet } from '@/model/factories';
import { questionIdOwners } from '@/model/lineage';
import type { DiagramBlock, McqQuestion, Question, StructuredQuestion, TableBlock } from '@/model/types';
import { buildAcceptanceWorksheet, withFlow } from '@/test/fixtures';
import { richMcq, richStructured } from '@/test/idFixture';
import { buildTranslateFixture } from '@/test/translateFixture';
import { lastQuestionGap, unanchoredQuestionAfter, useWorksheetStore } from './worksheetStore';

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

    // No id the copy holds is the original's (diagram geometry aside, which is scoped).
    const owned = (question: Question) => [...questionIdOwners(question)].map(({ owner }) => owner.id);
    expect(owned(clone).filter((id) => owned(original).includes(id))).toEqual([]);
  });

  it.each([
    ['duplicateQuestion', (id: string) => store().duplicateQuestion(id)],
    ['duplicateMany', (id: string) => store().duplicateMany([id])],
  ])('%s: editing the copy leaves the original untouched', (_name, duplicate) => {
    useWorksheetStore.setState({ worksheet: withFlow(createWorksheet(), [richStructured(), richMcq()]) });
    duplicate(store().worksheet.questions[0].id);
    duplicate(store().worksheet.questions[2].id);
    const [original, copy, mcq, mcqCopy] = store().worksheet.questions as [
      StructuredQuestion,
      StructuredQuestion,
      McqQuestion,
      McqQuestion,
    ];

    const stem = copy.blocks[0];
    store().applyEdit({ kind: 'blockText', blockId: stem.id }, bi('Edited stem', '已改題幹'));
    const table = copy.blocks[1] as TableBlock;
    store().applyEdit(
      { kind: 'tableCell', blockId: table.id, cellId: table.rows[0].cells[0].id },
      bi('Edited cell', '已改'),
    );
    const answer = copy.parts[0].answerDiagram!;
    store().replaceBlock(answer.id, { ...answer, widthPx: 123 });
    store().applyEdit(
      { kind: 'mcqOption', questionId: mcqCopy.id, optionId: mcqCopy.options[0].id },
      bi('Edited option', '已改選項'),
    );
    const optionDiagram = mcqCopy.options[0].blocks![0] as DiagramBlock;
    store().replaceBlock(optionDiagram.id, { ...optionDiagram, widthPx: 77 });

    const after = store().worksheet.questions;
    expect(after[0]).toEqual(original);
    expect(after[2]).toEqual(mcq);
    const edited = after[1] as StructuredQuestion;
    const editedMcq = after[3] as McqQuestion;
    expect(edited.blocks[0].kind === 'paragraph' && plain(edited.blocks[0].text.en)).toBe('Edited stem');
    expect(plain((edited.blocks[1] as TableBlock).rows[0].cells[0].text.en)).toBe('Edited cell');
    expect(edited.parts[0].answerDiagram!.widthPx).toBe(123);
    expect(plain(editedMcq.options[0].text.en)).toBe('Edited option');
    expect((editedMcq.options[0].blocks![0] as DiagramBlock).widthPx).toBe(77);
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

/** The settings panel reads its three-way control from `firstPageModeOf`. */
describe('first-page mode round-trips (§ page 1 can differ)', () => {
  const header = () => headerFooterOf(store().worksheet.header, defaultHeader);

  beforeEach(() => {
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[0].build());
  });

  it('reads back every mode it was set to', () => {
    for (const mode of ['different', 'blank', 'same', 'different', 'same'] as const) {
      store().setFirstPageMode('header', mode);
      expect(firstPageModeOf(header())).toBe(mode);
    }
  });

  it('agrees with what page 1 prints', () => {
    store().setFirstPageMode('header', 'same');
    expect(firstPageHeaderFooter(header()).bands).toEqual(header().bands);
    store().setFirstPageMode('header', 'blank');
    expect(firstPageHeaderFooter(header()).bands).toEqual([]);
    store().setFirstPageMode('header', 'different');
    expect(firstPageHeaderFooter(header()).bands).toBe(header().firstPage!.bands);
  });

  it('"same" keeps the running rows and drops the page-1 rows', () => {
    const running = header().bands.map((b) => b.id);
    store().setFirstPageMode('header', 'different');
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[2].build(), 'firstPage');
    store().setFirstPageMode('header', 'same');
    expect(header().firstPage).toBeUndefined();
    expect(header().bands.map((b) => b.id)).toEqual(running);
  });

  it('reads an empty page-1 list as its own rows, not as blank', () => {
    store().setFirstPageMode('header', 'different');
    store().setHeaderFooterBands('header', [], 'firstPage');
    expect(firstPageModeOf(header())).toBe('different');
  });

  it('lets page-1 rows win over a stale showOnFirstPage: false', () => {
    expect(
      firstPageModeOf({ ...header(), showOnFirstPage: false, firstPage: { bands: [] } }),
    ).toBe('different');
  });
});

/** A row added on a sheet goes to the list that sheet prints (`pageBandScope`). */
describe('page-1 row scope follows the first-page mode', () => {
  const header = () => headerFooterOf(store().worksheet.header, defaultHeader);

  beforeEach(() => {
    store().setHeaderFooterBands('header', HEADER_FOOTER_PRESETS[0].build());
  });

  it('page 1 edits the running rows only when it prints them', () => {
    store().setFirstPageMode('header', 'same');
    expect(pageBandScope(header(), 1)).toBe('running');
    store().setFirstPageMode('header', 'blank');
    expect(pageBandScope(header(), 1)).toBe('firstPage');
    store().setFirstPageMode('header', 'different');
    expect(pageBandScope(header(), 1)).toBe('firstPage');
  });

  it('later pages always edit the running rows', () => {
    for (const mode of ['same', 'blank', 'different'] as const) {
      store().setFirstPageMode('header', mode);
      expect(pageBandScope(header(), 2)).toBe('running');
    }
  });

  it('a row added on a blank page 1 lands on page 1 alone', () => {
    store().setFirstPageMode('header', 'blank');
    const running = header().bands.map((b) => b.id);
    store().addHeaderFooterBand('header', undefined, pageBandScope(header(), 1));
    const value = header();
    expect(value.bands.map((b) => b.id)).toEqual(running);
    expect(firstPageModeOf(value)).toBe('different');
    expect(firstPageHeaderFooter(value).bands).toHaveLength(1);
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

    const load = (documentType: 'paper1' | 'lqMock' | 'classroom', sections?: boolean) => {
      store().replaceWorksheet(createWorksheetFrom({ documentType, seedSample: false, sections }));
    };
    // One question already in place, anchor cleared: the next add takes the append rule.
    const seedOne = (typeId: string) => {
      store().addQuestion(typeId);
      store().setInsertAnchor(undefined);
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

      seedOne('structured');
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
      seedOne('structured');
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

    it('places an unanchored stimulus ahead of the closing line, as question content', () => {
      // A stimulus introduces the questions that follow it — and the anchor advances
      // onto it, so questions added next land behind it. Appending it past
      // "END OF PAPER" dragged that whole group after the line.
      load('paper1');
      const closing = store().worksheet.layout.at(-1)!;
      const element = createStimulusElement();
      store().addLayoutElement(element);
      const order = ids();
      expect(order.indexOf(element.id)).toBeLessThan(order.indexOf(closing.id));
      expect(order.at(-1)).toBe(closing.id);
    });

    it('appends when the document has no questions and no sections', () => {
      load('classroom', false);
      store().addQuestion('mcq');
      expect(ids().at(-1)).toBe(store().selectedQuestionId);
    });

    it('leaves a classroom worksheet appending past its own trailing element', () => {
      // Nothing is known to close a worksheet, so a teacher's trailing note keeps
      // whatever position they gave it and the question goes after it, as always.
      load('classroom', false);
      const note = createTextElement(bi('A closing thought', ''));
      store().addLayoutElement(
        note.kind === 'text' ? { ...note, format: { align: 'center' } } : note,
      );
      store().setInsertAnchor(undefined);
      store().addQuestion('mcq');
      expect(ids().at(-1)).toBe(store().selectedQuestionId);
    });
  });

  /*
   * A sectioned document's first question goes into its first section. Appending put a
   * new classroom worksheet's first question below "Section B", with Section A empty,
   * on every unanchored path: the rail, the outline's "Add here", the 題庫 tab's Enter
   * and Fill, and "add to last worksheet" from the bank screen.
   */
  describe('the first question of a sectioned document', () => {
    const ids = () => resolveFlow(store().worksheet).map((item) => item.id);
    const sections = () => store().worksheet.layout.filter((el) => el.kind === 'section');
    const load = (documentType: 'classroom' | 'lqMock' | 'paper1') =>
      store().replaceWorksheet(createWorksheetFrom({ documentType, seedSample: false }));

    it('lands in Section A of a new classroom worksheet, numbered 1', () => {
      load('classroom');
      const [a, b] = sections();
      store().addQuestion('mcq');
      const added = store().selectedQuestionId!;
      expect(ids()).toEqual([a.id, added, b.id]);
      expect(computeNumbering(store().worksheet).byQuestionId.get(added)?.number).toBe(1);
    });

    it('keeps consecutive adds in Section A, in order', () => {
      load('classroom');
      const [a, b] = sections();
      store().addQuestion('mcq');
      const one = store().selectedQuestionId!;
      store().addQuestion('mcq');
      const two = store().selectedQuestionId!;
      expect(ids()).toEqual([a.id, one, two, b.id]);
    });

    it('lands in Section B when Section B is the anchor', () => {
      load('classroom');
      const [a, b] = sections();
      store().setInsertAnchor(b.id);
      store().addQuestion('structured');
      expect(ids()).toEqual([a.id, b.id, store().selectedQuestionId]);
    });

    it('lands under the booklet’s Section A, ahead of "END OF SECTION A"', () => {
      load('lqMock');
      const [a, b] = sections();
      store().addQuestion('structured');
      const order = ids();
      const added = order.indexOf(store().selectedQuestionId!);
      expect(added).toBe(order.indexOf(a.id) + 1);
      // The closing line stays between the question and Section B.
      expect(order.indexOf(b.id)).toBe(added + 2);
    });

    it('takes bank copies (Enter, Fill, add to last worksheet) into Section A, in order', () => {
      load('classroom');
      const [a, b] = sections();
      const copies = store().insertQuestionCopies([richMcq(), richMcq()], { fromDocId: 'elsewhere' });
      expect(ids()).toEqual([a.id, ...copies, b.id]);
    });

    it('takes a generated set and its stimulus into Section A', () => {
      load('classroom');
      const [a, b] = sections();
      const lead = createStimulusElement();
      const report = store().insertQuestionBatch([{ typeId: 'mcq', fill: (q) => q }], {
        worksheetId: store().worksheet.id,
        lead,
      });
      if (!report.ok) throw new Error('batch refused');
      expect(ids()).toEqual([a.id, lead.id, ...report.questionIds, b.id]);
    });

    it('still appends an unanchored layout element, which means the end', () => {
      load('classroom');
      const spacer = createSpacerElement();
      store().addLayoutElement(spacer);
      expect(ids().at(-1)).toBe(spacer.id);
    });

    it('leaves the drag range reaching past the last section', () => {
      // A drop is placed by the pointer; only the unanchored default moved.
      load('classroom');
      expect(lastQuestionGap(store().worksheet)).toBe(ids().length);
    });

    it('names Section A as the destination until the document holds a question', () => {
      load('classroom');
      const [a] = sections();
      expect(unanchoredQuestionAfter(store().worksheet)).toBe(a.id);
      store().addQuestion('mcq');
      expect(unanchoredQuestionAfter(store().worksheet)).toBeUndefined();
    });

    it('changes nothing on a Paper 1, which has no sections', () => {
      load('paper1');
      expect(unanchoredQuestionAfter(store().worksheet)).toBeUndefined();
    });
  });

  /*
   * With nothing selected, a question goes to the section made for its type. A new
   * classroom worksheet's first Structured question used to land in "Section A: Multiple
   * Choice"; with questions in both, an MCQ appended under "Section B: Structured".
   */
  describe('a new question goes to the section that fits its type', () => {
    const ids = () => resolveFlow(store().worksheet).map((item) => item.id);
    const sections = () => store().worksheet.layout.filter((el) => el.kind === 'section');
    const load = (documentType: 'classroom' | 'lqMock', seedSample = false) =>
      store().replaceWorksheet(createWorksheetFrom({ documentType, seedSample }));
    const add = (typeId: string) => {
      store().setInsertAnchor(undefined);
      store().addQuestion(typeId);
      return store().selectedQuestionId!;
    };

    it('puts a first Structured question in Section B of a new classroom worksheet', () => {
      load('classroom');
      const [a, b] = sections();
      const added = add('structured');
      expect(ids()).toEqual([a.id, b.id, added]);
    });

    it('keeps a first MCQ in Section A', () => {
      load('classroom');
      const [a, b] = sections();
      const added = add('mcq');
      expect(ids()).toEqual([a.id, added, b.id]);
    });

    it('sorts unanchored adds of both types into their own sections, in order', () => {
      load('classroom');
      const [a, b] = sections();
      const s1 = add('structured');
      const m1 = add('mcq');
      const s2 = add('structured');
      const m2 = add('mcq');
      expect(ids()).toEqual([a.id, m1, m2, b.id, s1, s2]);
    });

    it('reads the Chinese heading as well as the English', () => {
      load('classroom');
      const [a, b] = sections();
      // A teacher who cleared the English keeps 甲部：多項選擇題 / 乙部：結構性問題.
      store().updateLayoutElement(a.id, { text: bi('', '甲部：多項選擇題') });
      store().updateLayoutElement(b.id, { text: bi('', '乙部：結構性問題') });
      const added = add('structured');
      expect(ids()).toEqual([a.id, b.id, added]);
    });

    it('reads a neutral heading by what it already holds', () => {
      load('classroom');
      const [a, b] = sections();
      store().updateLayoutElement(a.id, { text: bi('Part 1', '') });
      store().updateLayoutElement(b.id, { text: bi('Part 2', '') });
      store().setInsertAnchor(a.id);
      store().addQuestion('mcq');
      const m1 = store().selectedQuestionId!;
      store().setInsertAnchor(b.id);
      store().addQuestion('structured');
      const s1 = store().selectedQuestionId!;
      const m2 = add('mcq');
      expect(ids()).toEqual([a.id, m1, m2, b.id, s1]);
    });

    it('leaves a document filled against its headings as it is', () => {
      // Older builds put every question under Section B: its MCQs say what it is for.
      load('classroom');
      const [a, b] = sections();
      store().setInsertAnchor(b.id);
      store().addQuestion('mcq');
      const m1 = store().selectedQuestionId!;
      const m2 = add('mcq');
      const s1 = add('structured');
      expect(ids()).toEqual([a.id, b.id, m1, m2, s1]);
    });

    it('still inserts after the selected question, whatever its section', () => {
      load('classroom');
      const [a, b] = sections();
      const m1 = add('mcq');
      // The MCQ is selected, so the anchor is on it: the teacher chose the place.
      store().addQuestion('structured');
      expect(ids()).toEqual([a.id, m1, store().selectedQuestionId, b.id]);
    });

    it('leaves the booklet alone: its headings name no type', () => {
      load('lqMock');
      const [a] = sections();
      const added = add('structured');
      expect(ids().indexOf(added)).toBe(ids().indexOf(a.id) + 1);
    });

    it('names the destination per type for the flyout', () => {
      load('classroom');
      const [a, b] = sections();
      expect(unanchoredQuestionAfter(store().worksheet, 'mcq')).toBe(a.id);
      // Section B is last, so "at the end" is the truth for a structured question.
      expect(unanchoredQuestionAfter(store().worksheet, 'structured')).toBeUndefined();
      const s1 = add('structured');
      expect(unanchoredQuestionAfter(store().worksheet, 'mcq')).toBe(a.id);
      const m1 = add('mcq');
      expect(unanchoredQuestionAfter(store().worksheet, 'mcq')).toBe(m1);
      expect(unanchoredQuestionAfter(store().worksheet, 'structured')).toBeUndefined();
      expect(ids()).toEqual([a.id, m1, b.id, s1]);
    });

    it('sends each bank copy to its own section when nothing is selected', () => {
      load('classroom');
      const [a, b] = sections();
      const [m1, s1, m2] = store().insertQuestionCopies([richMcq(), richStructured(), richMcq()], {
        fromDocId: 'elsewhere',
      });
      expect(ids()).toEqual([a.id, m1, m2, b.id, s1]);
    });

    it('keeps bank copies together after a selected question', () => {
      load('classroom');
      const [a, b] = sections();
      const m1 = add('mcq');
      const copies = store().insertQuestionCopies([richStructured(), richMcq()], { fromDocId: 'elsewhere' });
      expect(ids()).toEqual([a.id, m1, ...copies, b.id]);
    });

    it('takes a generated structured set and its stimulus into Section B', () => {
      load('classroom');
      const [a, b] = sections();
      const lead = createStimulusElement();
      const report = store().insertQuestionBatch(
        [{ typeId: 'structured', fill: (q) => q }, { typeId: 'structured', fill: (q) => q }],
        { worksheetId: store().worksheet.id, lead },
      );
      if (!report.ok) throw new Error('batch refused');
      expect(ids()).toEqual([a.id, b.id, lead.id, ...report.questionIds]);
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

describe('applyTranslations', () => {
  const STEM = 'q:mcq1/blocks/b:mcq1-stem';
  const fillStem = (source = 'Which is correct?'): TranslationWrite => ({
    path: STEM, side: 'zh', sourceSnapshot: rt(source), targetSnapshot: [], next: rt('哪項正確？'),
  });
  beforeEach(() => {
    const ws = mapWorksheetTexts(buildTranslateFixture(), (slot) =>
      slot.path === STEM ? { ...slot.text, zh: [] } : slot.text,
    );
    useWorksheetStore.setState({ worksheet: ws, past: [], future: [], dirty: false, readOnly: false });
  });

  it('commits the batch as one undo step, and undo restores it exactly', () => {
    const before = JSON.stringify(store().worksheet);
    const report = store().applyTranslations([fillStem()], { worksheetId: 'kitchen-sink' });
    expect(report).toEqual({ applied: 1, skipped: [], resized: 0 });
    expect(store().past).toHaveLength(1);
    expect(store().dirty).toBe(true);
    store().undo();
    expect(JSON.stringify(store().worksheet)).toBe(before);
  });

  it('an all-stale batch makes no history entry and leaves the document clean', () => {
    const worksheet = store().worksheet;
    const report = store().applyTranslations([fillStem('Something else')], { worksheetId: 'kitchen-sink' });
    expect(report.skipped).toEqual([{ path: STEM, reason: 'sourceChanged' }]);
    expect(store().worksheet).toBe(worksheet);
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });

  it('refuses a read-only document and another document', () => {
    useWorksheetStore.setState({ readOnly: true });
    expect(store().applyTranslations([fillStem()], { worksheetId: 'kitchen-sink' }).refused).toBe('readOnly');
    expect(store().past).toHaveLength(0);
    useWorksheetStore.setState({ readOnly: false });
    expect(store().applyTranslations([fillStem()], { worksheetId: 'other' }).refused).toBe('otherDocument');
    expect(store().past).toHaveLength(0);
    expect(store().dirty).toBe(false);
  });
});

describe('insertQuestionCopies', () => {
  const ids = (question: Question) => [...questionIdOwners(question)].map(({ owner }) => owner.id);

  it('inserts copies after the anchor, in order, as one undo, and returns their ids', () => {
    const before = store().worksheet;
    const anchor = before.questions[0].id;
    const sources = [richStructured(), richMcq()];
    const newIds = store().insertQuestionCopies(sources, { fromDocId: 'bank-doc', afterId: anchor });

    const after = store().worksheet;
    expect(newIds).toHaveLength(2);
    expect(after.questions.map((q) => q.id).slice(0, 3)).toEqual([anchor, ...newIds]);
    const flowIds = after.flow.map((entry) => entry.id);
    expect(flowIds.indexOf(newIds[0])).toBe(flowIds.indexOf(anchor) + 1);
    expect(flowIds.indexOf(newIds[1])).toBe(flowIds.indexOf(anchor) + 2);
    expect(store().insertAnchorId).toBe(newIds[1]);

    newIds.forEach((id, i) => {
      const copy = after.questions.find((q) => q.id === id)!;
      expect(copy.lineage).toMatchObject({ rootId: sources[i].id, fromDocId: 'bank-doc' });
      expect(ids(copy).filter((x) => ids(sources[i]).includes(x))).toEqual([]);
    });

    expect(store().past).toHaveLength(1);
    store().undo();
    expect(store().worksheet).toEqual(before);
  });

  it('defaults to the insertion anchor, and keeps a copy of a copy on its root', () => {
    const anchor = store().worksheet.questions[1].id;
    useWorksheetStore.setState({ insertAnchorId: anchor });
    const original = richMcq();
    const [firstId] = store().insertQuestionCopies([original]);
    const first = store().worksheet.questions.find((q) => q.id === firstId)!;
    const [secondId] = store().insertQuestionCopies([first]);
    const qids = store().worksheet.questions.map((q) => q.id);
    expect(qids.indexOf(firstId)).toBe(qids.indexOf(anchor) + 1);
    expect(qids.indexOf(secondId)).toBe(qids.indexOf(firstId) + 1);
    expect(store().worksheet.questions.find((q) => q.id === secondId)!.lineage?.rootId).toBe(original.id);
  });

  it('does nothing when read-only or given nothing', () => {
    expect(store().insertQuestionCopies([])).toEqual([]);
    useWorksheetStore.setState({ readOnly: true });
    expect(store().insertQuestionCopies([richMcq()])).toEqual([]);
    expect(store().past).toHaveLength(0);
    useWorksheetStore.setState({ readOnly: false });
  });
});
