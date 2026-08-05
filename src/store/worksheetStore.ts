'use client';

import { create } from 'zustand';
import {
  addField,
  createBand,
  createTextField,
  moveField,
  removeField,
  updateField,
  type ZoneName,
} from '@/model/bands';
import {
  applyDeleteTarget,
  applyEditTarget,
  applyFormatTarget,
  applyInsertBlank,
  applyRunFormatTarget,
  applyResizeBlock,
  mapTableBlock,
  replaceBlockById,
} from '@/model/edits';
import {
  insertColumn,
  insertRow,
  removeColumn,
  removeRow,
  resizeColumn,
  resizeTableEdge,
  setRowHeight,
} from '@/model/table';
import { createWorksheet, newId } from '@/model/factories';
import {
  applyOrder,
  clampAnswerLines,
  clampSpacerPt,
  createAnswerLinesElement,
  createAnswerSpaceElement,
  flowOf,
  moveInFlow,
  moveRunInFlow,
  nudgeInFlow,
  type FlowMove,
} from '@/model/flow';
import { applyBandFieldSide } from '@/model/bandSegments';
import { documentShape } from '@/model/documentShape';
import {
  addCoverLine,
  createCoverPage,
  removeCoverLine,
  setCoverLineFormat,
  setCoverLineText,
  type CoverOptions,
  type CoverPage,
  type CoverRegion,
} from '@/model/cover';
import { defaultFooter, defaultHeader, headerFooterOf } from '@/model/page';
import type {
  Band,
  BandField,
  BandFieldSide,
  BiText,
  ContentBlock,
  HeaderFooter,
  LayoutElement,
  OutputMode,
  PageSetup,
  FlowItem,
  Question,
  RunFormatPatch,
  TextFormat,
  Worksheet,
} from '@/model/types';
import type { EditTarget } from '@/render/ir';
import { listQuestionTypes } from '@/registry';
import { worksheetStore } from '@/storage';

/**
 * The document store. **Every mutation goes through `commit`** — a pure recipe plus an
 * undo push — so undo/redo needs no per-action knowledge. Actions are thin; the real
 * work lives in pure model functions (`model/edits`, `model/flow`, `model/bands`).
 */

/** How many steps of history to keep. Beyond this the oldest are dropped. */
const HISTORY_LIMIT = 100;

interface WorksheetState {
  worksheet: Worksheet;
  mode: OutputMode;
  /**
   * Showing the sheets as they will print. Deliberately not part of `OutputMode`
   * (that is what the exporter reads); editor state, not persisted.
   */
  printPreview: boolean;
  /** Unsaved changes since the last `markSaved`. */
  dirty: boolean;
  lastSavedAt?: string;
  selectedQuestionId?: string;
  /**
   * The flow id a new item lands after, or undefined to append. A **position**, not a
   * selection (two of the page's selections are preview-local and the rail cannot see
   * them). Selecting anything sets it; the gap affordance sets it without selecting.
   */
  insertAnchorId?: string;
  /**
   * A request from the page to open the add rail's insert menu. A counter, not a
   * boolean — two clicks on two gaps must both open it. The rail owns rendering it.
   */
  insertMenuRequest: number;
  /**
   * The table cell last clicked on the page. The sidebar's structural verbs need a
   * subject, and the teacher is in the cell *on the page*. Editor state, never
   * persisted.
   */
  activeCell?: { blockId: string; cellId: string };
  /**
   * A rectangular run of swept cells, stored as two corner **ids** (re-derived from
   * the live table so a structural edit cannot strand it). Editor state.
   */
  cellSelection?: { blockId: string; anchorId: string; focusId: string };
  /** The question currently being dragged on the page, if any. */
  dragQuestionId?: string;
  past: Worksheet[];
  future: Worksheet[];

  // --- History ---------------------------------------------------------------
  commit: (recipe: (draft: Worksheet) => Worksheet) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // --- Document --------------------------------------------------------------
  /** Load a document. Resets history: a load is not an undoable edit. */
  replaceWorksheet: (worksheet: Worksheet) => void;
  updateWorksheet: (patch: Partial<Worksheet>) => void;
  markSaved: () => void;
  /** Persist to storage now, rather than waiting for the autosave debounce. */
  save: () => Promise<void>;
  setMode: (patch: Partial<OutputMode>) => void;
  setPrintPreview: (on: boolean) => void;
  select: (questionId?: string) => void;
  /** Point the add rail at a position: new items land after `flowId`. */
  setInsertAnchor: (flowId?: string) => void;
  /** Anchor at `flowId` and ask the rail to open its insert menu. */
  requestInsertMenu: (flowId?: string) => void;
  /** Report which table cell the page is in, so the sidebar can act on it. */
  setActiveCell: (cell?: { blockId: string; cellId: string }) => void;
  setCellSelection: (
    selection?: { blockId: string; anchorId: string; focusId: string },
  ) => void;
  setDragQuestionId: (questionId?: string) => void;

  // --- Questions --------------------------------------------------------------
  /** Add a question, after `afterId` when given and at the end otherwise. */
  addQuestion: (typeId: string, afterId?: string) => void;
  updateQuestion: (questionId: string, patch: Partial<Question>) => void;
  removeQuestion: (questionId: string) => void;
  duplicateQuestion: (questionId: string) => void;
  /** Nudge a question by `delta` places in the document order. */
  moveQuestion: (questionId: string, delta: number) => void;
  /** Drag-reorder: put `questionId` immediately before `targetId`. */
  reorderQuestion: (questionId: string, targetId: string) => void;

  // --- Layout elements and flow ----------------------------------------------
  addLayoutElement: (element: LayoutElement, afterId?: string) => void;
  updateLayoutElement: (elementId: string, patch: Partial<LayoutElement>) => void;
  removeLayoutElement: (elementId: string) => void;
  nudgeFlowItem: (id: string, direction: -1 | 1) => void;
  reorderFlowItem: (id: string, targetId: string, position?: 'before' | 'after') => void;
  /** Move a whole page's worth of items, as dragged in the page rail. */
  movePage: (sourceIds: string[], targetIds: string[], position: 'before' | 'after') => void;
  /**
   * Move a run to the very front of the document — the one position no anchor can
   * name (an emptied page 1 has no member to aim at).
   */
  moveToDocumentStart: (ids: string[]) => void;
  removeMany: (ids: string[]) => void;
  duplicateMany: (ids: string[]) => void;

  // --- In-place editing on the page ------------------------------------------
  applyEdit: (target: EditTarget, next: BiText) => void;
  deleteTarget: (target: EditTarget) => void;
  formatTarget: (target: EditTarget, patch: Partial<TextFormat>) => void;
  /**
   * Format one character range — the per-run path. Separate from `formatTarget`
   * (whole element); each is one commit, one undo entry.
   */
  formatRuns: (
    target: EditTarget,
    side: 'en' | 'zh',
    start: number,
    end: number,
    patch: RunFormatPatch,
  ) => void;
  /**
   * Insert a fill-in blank at the caret. Its own verb, not a `formatRuns` patch — it
   * changes the *text*.
   */
  insertBlank: (target: EditTarget, side: 'en' | 'zh', start: number, end: number) => void;
  resizeBlock: (blockId: string, widthPx: number) => void;
  /**
   * Extend a sizeable layout element — answer lines by count, a spacer by points.
   * One verb: the element's own kind decides which field holds its size.
   */
  resizeLayoutElement: (elementId: string, value: number) => void;
  /**
   * Divide answer lines: `keep` rows stay, `overflow` becomes new element(s) after —
   * what a drag past the end of the page means. Chopped into `perPage`-sized pieces
   * (a remainder taller than a sheet would overflow its own page). One commit, one
   * undo entry; only ever called from a gesture, never from re-measurement.
   */
  splitLayoutRows: (
    elementId: string,
    keep: number,
    overflow: number,
    perPage: number,
  ) => void;
  /**
   * Write the paginator's resolved counts into every `fill` answer space. The one
   * deliberate bypass of `commit()` — the counts are derived, so they must not spend
   * undo entries. Marks dirty; returns the same state when nothing differs, which is
   * what stops the measure → resolve → re-measure loop.
   */
  resolveAnswerSpaceFills: (counts: ReadonlyMap<string, number>) => void;
  /**
   * Cut a leaf question's answer space to the lines its sheet can hold. Outside
   * history for the same reason as `resolveAnswerSpaceFills`.
   */
  trimQuestionAnswerSpace: (questionId: string, lines: number) => void;
  /** Replace one block by id — the route a page-opened editor commits through. */
  replaceBlock: (blockId: string, next: ContentBlock) => void;
  /**
   * Move one table column boundary. Its own action so a drag handle need not resolve
   * the block and rebuild it at the call site.
   */
  resizeTableColumn: (
    blockId: string,
    index: number,
    delta: number,
    columnCount: number,
  ) => void;
  /** Move one of a table's outer edges, resizing it as a whole. */
  resizeTableEdge: (blockId: string, side: 'left' | 'right', delta: number) => void;
  /** Set a floor on one row's height, in twips. */
  setTableRowHeight: (blockId: string, index: number, twips: number | undefined) => void;
  /**
   * Structural table edits by position, for the page's affordances. Both surfaces end
   * at the pure functions in `model/table.ts`, so they cannot diverge.
   */
  insertTableRow: (blockId: string, index: number) => void;
  removeTableRow: (blockId: string, index: number) => void;
  insertTableColumn: (blockId: string, index: number) => void;
  removeTableColumn: (blockId: string, index: number) => void;

  // --- Page setup, masthead bands, header/footer ------------------------------
  setPageSetup: (patch: Partial<PageSetup>) => void;
  /** Put a mock-exam cover at the front of the document. One commit, one undo press. */
  applyCover: (options: CoverOptions) => void;
  /** Drop the cover page entirely. */
  removeCover: () => void;
  /** Patch the cover's non-line settings (columns, panel boxes, the diagonal rule). */
  updateCover: (patch: Partial<CoverPage>) => void;
  /** Rewrite one cover line, addressed by id — what an in-place page edit commits. */
  setCoverLineText: (lineId: string, text: BiText) => void;
  formatCoverLine: (lineId: string, patch: Partial<TextFormat>) => void;
  addCoverLine: (region: Exclude<CoverRegion, 'panel'>, afterId?: string) => void;
  removeCoverLine: (lineId: string) => void;
  setBands: (bands: Band[]) => void;
  addBand: (band?: Band) => void;
  /** Remove one masthead row, so a row added on the page can be taken back there. */
  removeBand: (bandId: string) => void;
  addBandField: (bandId: string, zone: ZoneName, field: BandField) => void;
  updateBandField: (fieldId: string, patch: Partial<BandField>) => void;
  /**
   * Write authored text into one side of a masthead field. Distinct from
   * `updateBandField`: the destination depends on the field's kind — see
   * `bandFieldSidePatch`.
   */
  setBandFieldText: (fieldId: string, side: BandFieldSide, text: BiText) => void;
  removeBandField: (fieldId: string) => void;
  moveBandField: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) => void;

  setHeaderFooter: (which: 'header' | 'footer', patch: Partial<HeaderFooter>) => void;
  /** Header/footer rows — the same verbs the masthead uses; a header row *is* a `Band`. */
  addHeaderFooterBand: (which: 'header' | 'footer', band?: Band, scope?: BandScope) => void;
  removeHeaderFooterBand: (which: 'header' | 'footer', bandId: string) => void;
  addHeaderFooterField: (
    which: 'header' | 'footer',
    bandId: string,
    zone: ZoneName,
    field: BandField,
  ) => void;
  updateHeaderFooterField: (
    which: 'header' | 'footer',
    fieldId: string,
    patch: Partial<BandField>,
  ) => void;
  /** `setBandFieldText` for a header or footer. */
  setHeaderFooterFieldText: (
    which: 'header' | 'footer',
    fieldId: string,
    side: BandFieldSide,
    text: BiText,
  ) => void;
  removeHeaderFooterField: (which: 'header' | 'footer', fieldId: string) => void;
  moveHeaderFooterField: (
    which: 'header' | 'footer',
    bandId: string,
    fieldId: string,
    zone: ZoneName,
    beforeId?: string,
  ) => void;
  /** Replace a header/footer's rows wholesale — how a preset is applied. */
  setHeaderFooterBands: (which: 'header' | 'footer', bands: Band[], scope?: BandScope) => void;
  /**
   * Choose what page 1 does. One action for all three mutually exclusive states —
   * separate setters could leave a document both blank and carrying first-page rows.
   */
  setFirstPageMode: (which: 'header' | 'footer', mode: FirstPageMode) => void;
  /** Replace the page-1 rows — how a first-page preset is applied. */
  setFirstPageBands: (which: 'header' | 'footer', bands: Band[]) => void;
}

/** What page 1 prints, as a single closed choice. */
export type FirstPageMode = 'same' | 'blank' | 'different';

/**
 * Which of a header/footer's two row lists a structural edit targets. A row being
 * *created* has no id to find, so add/replace must name their list; field edits
 * address by id and need no scope. Defaults to `'running'`.
 */
export type BandScope = 'running' | 'firstPage';

/** Apply a patch to the question with this id. */
function mapQuestion(
  worksheet: Worksheet,
  questionId: string,
  patch: (question: Question) => Question,
): Worksheet {
  return {
    ...worksheet,
    questions: worksheet.questions.map((question) =>
      question.id === questionId ? patch(question) : question,
    ),
  };
}

/**
 * Hold a sizeable layout element to its floor — applied on the way into the document,
 * so both sizing surfaces share one floor.
 */
function clampLayoutElement(element: LayoutElement): LayoutElement {
  if (element.kind === 'answerLines' || element.kind === 'answerSpace') {
    return { ...element, lines: clampAnswerLines(element.lines) };
  }
  if (element.kind === 'spacer') {
    return { ...element, heightPt: clampSpacerPt(element.heightPt) };
  }
  return element;
}

/**
 * Drop an insertion anchor that no longer names anything — a dead anchor silently
 * appends while the rail's label claims a position. Runs in `commit` (the single
 * write path), so undo/redo and future removals are covered without knowing it.
 */
function livingAnchor(anchorId: string | undefined, next: Worksheet): string | undefined {
  if (!anchorId) return undefined;
  return flowOf(next).some((item) => item.id === anchorId) ? anchorId : undefined;
}

/**
 * Place a new item in the flow, after `afterId` when given. An insert is a move and
 * must write **both** lists — `questions` owns question order, so a question
 * positioned only in `flow` prints last. `applyOrder` is the one rule for splitting
 * an ordered flow back into the two lists. An unanchored question lands via
 * `appendIndexFor`, not at the very end.
 */
function insertIntoFlow(
  worksheet: Worksheet,
  entry: FlowItem,
  afterId: string | undefined,
  patch: Partial<Worksheet>,
): Worksheet {
  // The patch carries the new item into `questions` or `layout`; ordering below reads
  // that merged document, so the entry resolves to something that exists.
  const merged = { ...worksheet, ...patch } as Worksheet;
  const flow = flowOf(worksheet);
  const at = afterId ? flow.findIndex((item) => item.id === afterId) : -1;
  if (at < 0) flow.splice(appendIndexFor(merged, flow, entry), 0, entry);
  else flow.splice(at + 1, 0, entry);

  const ordered = applyOrder(merged, flow);
  return { ...merged, questions: ordered.questions, flow: ordered.flow };
}

/**
 * Where an *unanchored* item joins the flow. Both exam papers end in a closing line
 * ("END OF PAPER"), so a question must land ahead of the trailing closing lines, not
 * at the very end. Derived from shape and format, never a stored flag; scoped to
 * `paper1`/`lqMock`; questions only (an unanchored layout element genuinely means the
 * end).
 */
function appendIndexFor(worksheet: Worksheet, flow: FlowItem[], entry: FlowItem): number {
  if (entry.type !== 'question') return flow.length;

  const shape = documentShape(worksheet);
  if (shape !== 'paper1' && shape !== 'lqMock') return flow.length;

  // Walk back over the trailing closing lines. Only a *centred* text element is
  // walked past — centring is what makes a closing line a closing line; ranged-left
  // tail elements (the lead-in, "Answer any ONE question.") introduce what follows.
  // A section marker stops the walk, keeping a new question under the last section.
  const layout = new Map((worksheet.layout ?? []).map((element) => [element.id, element]));
  const closesThePaper = (item: FlowItem): boolean => {
    if (item.type !== 'layout') return false;
    const element = layout.get(item.id);
    return element?.kind === 'text' && element.format?.align === 'center';
  };

  let at = flow.length;
  while (at > 0 && closesThePaper(flow[at - 1])) at -= 1;
  return at;
}

/**
 * Give every id in a question a fresh value.
 *
 * Duplicating has to re-id *through* the nested parts and sub-parts, not just the
 * question: two questions sharing a part id would make an edit to one silently rewrite
 * the other, and the numbering plan would key two entries to the same address.
 */
function withFreshIds(question: Question): Question {
  const next = { ...question, id: newId() } as Question;
  const parts = (next as { parts?: Array<Record<string, unknown>> }).parts;
  if (parts) {
    (next as { parts: unknown }).parts = parts.map((part) => ({
      ...part,
      id: newId(),
      subParts: (part.subParts as Array<Record<string, unknown>> | undefined)?.map((sub) => ({
        ...sub,
        id: newId(),
      })),
    }));
  }
  return next;
}

/** Apply a band mutator to whichever masthead band holds `fieldId`. */
function patchBandHolding(
  worksheet: Worksheet,
  fieldId: string,
  patch: (band: Band) => Band,
): Worksheet {
  return {
    ...worksheet,
    bands: (worksheet.bands ?? []).map((band) => {
      const zones = band.zones ?? { left: [], center: [], right: [] };
      const holds = (['left', 'center', 'right'] as const).some((zone) =>
        (zones[zone] ?? []).some((field) => field.id === fieldId),
      );
      return holds ? patch(band) : band;
    }),
  };
}

/**
 * The `updateField` patch writing `text` into one side of a field. Where the text
 * lives depends on the field's kind, so it is resolved here via `applyBandFieldSide`.
 * Returns an empty patch for a field that no longer exists (stale commit = no-op).
 */
function bandFieldSidePatch(
  band: Band,
  fieldId: string,
  side: BandFieldSide,
  text: BiText,
): Partial<BandField> {
  const zones = band.zones ?? { left: [], center: [], right: [] };
  for (const zone of ['left', 'center', 'right'] as const) {
    const field = (zones[zone] ?? []).find((entry) => entry.id === fieldId);
    if (!field) continue;
    // Diffed against the field so the patch carries only what changed — `updateField`
    // spreads it, and handing back the whole field would overwrite a concurrent format.
    const next = applyBandFieldSide(field, side, text) as Record<string, unknown>;
    const current = field as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const key of new Set([...Object.keys(next), ...Object.keys(current)])) {
      if (next[key] !== current[key]) patch[key] = next[key];
    }
    return patch as Partial<BandField>;
  }
  return {};
}

/** Apply a band mutator inside a header or footer, addressed by band id. */
function patchHeaderFooterBand(
  worksheet: Worksheet,
  which: 'header' | 'footer',
  match: (band: Band) => boolean,
  patch: (band: Band) => Band,
): Worksheet {
  const current = headerFooterOf(
    worksheet[which],
    which === 'header' ? defaultHeader : defaultFooter,
  );

  // Both band lists are searched — a click on a page-1 row reports only ids, so
  // addressing only `bands` would silently drop first-page edits.
  const bands = current.bands.map((band) => (match(band) ? patch(band) : band));
  const firstBands = current.firstPage?.bands.map((band) => (match(band) ? patch(band) : band));

  return {
    ...worksheet,
    [which]: {
      ...current,
      bands,
      ...(current.firstPage && firstBands
        ? { firstPage: { ...current.firstPage, bands: firstBands } }
        : {}),
    },
  };
}

/** Does this band hold a field with this id? */
function bandHolds(band: Band, fieldId: string): boolean {
  const zones = band.zones ?? { left: [], center: [], right: [] };
  return (['left', 'center', 'right'] as const).some((zone) =>
    (zones[zone] ?? []).some((field) => field.id === fieldId),
  );
}

export const useWorksheetStore = create<WorksheetState>((set, get) => ({
  worksheet: createWorksheet(),
  mode: { language: 'en', version: 'student' },
  printPreview: false,
  dirty: false,
  insertMenuRequest: 0,
  past: [],
  future: [],

  // --- History ---------------------------------------------------------------
  // The single write path. A recipe returning the worksheet unchanged commits
  // nothing, so a no-op drag costs no undo entry.
  commit: (recipe) =>
    set((state) => {
      const next = recipe(state.worksheet);
      if (next === state.worksheet) return state;
      return {
        worksheet: { ...next, updatedAt: new Date().toISOString() },
        past: [...state.past, state.worksheet].slice(-HISTORY_LIMIT),
        // A new edit invalidates the redo branch, the way every editor behaves.
        future: [],
        dirty: true,
        insertAnchorId: livingAnchor(state.insertAnchorId, next),
      };
    }),

  undo: () =>
    set((state) => {
      const previous = state.past.at(-1);
      if (!previous) return state;
      return {
        worksheet: previous,
        past: state.past.slice(0, -1),
        future: [state.worksheet, ...state.future],
        dirty: true,
        // Undoing an insert removes the item the anchor just advanced onto.
        insertAnchorId: livingAnchor(state.insertAnchorId, previous),
      };
    }),

  redo: () =>
    set((state) => {
      const next = state.future[0];
      if (!next) return state;
      return {
        worksheet: next,
        past: [...state.past, state.worksheet],
        future: state.future.slice(1),
        dirty: true,
        insertAnchorId: livingAnchor(state.insertAnchorId, next),
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // --- Document --------------------------------------------------------------
  replaceWorksheet: (worksheet) =>
    set({
      worksheet,
      past: [],
      future: [],
      dirty: false,
      selectedQuestionId: undefined,
      // An anchor names an id in the document being replaced, so it means nothing here.
      insertAnchorId: undefined,
    }),

  updateWorksheet: (patch) => get().commit((draft) => ({ ...draft, ...patch })),

  markSaved: () => set({ dirty: false, lastSavedAt: new Date().toISOString() }),

  // Explicit "Save now", not waiting for the autosave debounce.
  save: async () => {
    await worksheetStore.save(get().worksheet);
    get().markSaved();
  },

  // A view change, not an edit: bypasses `commit`, so no history entry and no dirty.
  setMode: (patch) => set((state) => ({ mode: { ...state.mode, ...patch } })),

  // Entering print preview clears the question selection (a ring is editor chrome in
  // a view whose point is what prints). Bypasses `commit` like setMode.
  setPrintPreview: (printPreview) =>
    set(printPreview ? { printPreview, selectedQuestionId: undefined } : { printPreview }),

  // Selecting a question also points the rail at it; clearing the selection clears
  // the anchor so a click on blank paper returns the rail to appending.
  select: (selectedQuestionId) =>
    set({ selectedQuestionId, insertAnchorId: selectedQuestionId }),

  setInsertAnchor: (insertAnchorId) => set({ insertAnchorId }),

  requestInsertMenu: (insertAnchorId) =>
    set((state) => ({
      insertAnchorId,
      insertMenuRequest: state.insertMenuRequest + 1,
    })),

  // A plain click collapses any swept range, as it does in Excel — the two are one
  // selection with two extents, so setting either clears the other's leftovers.
  setActiveCell: (activeCell) => set({ activeCell, cellSelection: undefined }),
  /**
   * Committing a sweep also aims `activeCell` at its anchor, so the panel's structural
   * verbs (insert row above, merge) keep a subject and the range needs no second click.
   */
  setCellSelection: (cellSelection) =>
    set({
      cellSelection,
      activeCell: cellSelection
        ? { blockId: cellSelection.blockId, cellId: cellSelection.anchorId }
        : undefined,
    }),
  setDragQuestionId: (dragQuestionId) => set({ dragQuestionId }),

  // --- Questions --------------------------------------------------------------

  /**
   * Add a question of a registered type (unknown ids are ignored). Lands after
   * `afterId`, defaulting to the stored insertion anchor — callers stay right without
   * knowing the anchor exists; an explicit `afterId` wins. The anchor then advances
   * onto what was just added, or consecutive inserts enter backwards.
   */
  addQuestion: (typeId, afterId) => {
    const definition = listQuestionTypes().find((type) => type.id === typeId);
    if (!definition) return;
    const question = definition.create();
    const anchor = afterId ?? get().insertAnchorId;
    get().commit((draft) => insertIntoFlow(draft, { type: 'question', id: question.id }, anchor, {
      questions: [...draft.questions, question],
    }));
    set({ selectedQuestionId: question.id, insertAnchorId: question.id });
  },

  updateQuestion: (questionId, patch) =>
    get().commit((draft) =>
      mapQuestion(draft, questionId, (question) => ({ ...question, ...patch } as Question)),
    ),

  removeQuestion: (questionId) =>
    get().commit((draft) => ({
      ...draft,
      questions: draft.questions.filter((question) => question.id !== questionId),
      // Drop the flow entry too, so nothing is left pointing at a question that is gone.
      flow: draft.flow.filter((entry) => entry.id !== questionId),
    })),

  duplicateQuestion: (questionId) =>
    get().commit((draft) => {
      const index = draft.questions.findIndex((question) => question.id === questionId);
      if (index < 0) return draft;
      const clone = withFreshIds(draft.questions[index]);
      // Placed straight after the original in both lists, so the copy appears where the
      // teacher is looking rather than at the end of the document.
      return insertIntoFlow(draft, { type: 'question', id: clone.id }, questionId, {
        questions: [
          ...draft.questions.slice(0, index + 1),
          clone,
          ...draft.questions.slice(index + 1),
        ],
      });
    }),

  moveQuestion: (questionId, delta) =>
    get().commit((draft) => {
      const index = draft.questions.findIndex((question) => question.id === questionId);
      if (index < 0) return draft;
      const to = index + delta;
      if (to < 0 || to >= draft.questions.length) return draft;
      const questions = [...draft.questions];
      const [moved] = questions.splice(index, 1);
      questions.splice(to, 0, moved);
      return { ...draft, questions };
    }),

  // Drag-reorder one question: rewrites `questions` (the authority on order). A no-op
  // drag returns the draft untouched, so commit records nothing.
  reorderQuestion: (questionId, targetId) =>
    get().commit((draft) => {
      if (questionId === targetId) return draft;
      const from = draft.questions.findIndex((question) => question.id === questionId);
      const to = draft.questions.findIndex((question) => question.id === targetId);
      if (from < 0 || to < 0) return draft;

      const questions = [...draft.questions];
      const [moved] = questions.splice(from, 1);
      // Re-find the target after the removal, so a downward drag lands where it was
      // dropped rather than one place short.
      const at = questions.findIndex((question) => question.id === targetId);
      questions.splice(at < 0 ? questions.length : at, 0, moved);
      return { ...draft, questions };
    }),

  // --- Layout elements and flow ----------------------------------------------
  // Append a layout element: existence in `layout`, position in `flow`. Defaults to
  // the stored anchor, exactly as addQuestion does.
  addLayoutElement: (element, afterId) => {
    const anchor = afterId ?? get().insertAnchorId;
    get().commit((draft) =>
      insertIntoFlow(draft, { type: 'layout', id: element.id }, anchor, {
        layout: [...draft.layout, element],
      }),
    );
    set({ insertAnchorId: element.id });
  },

  updateLayoutElement: (elementId, patch) =>
    get().commit((draft) => ({
      ...draft,
      layout: draft.layout.map((element) =>
        element.id === elementId
          ? clampLayoutElement({ ...element, ...patch } as LayoutElement)
          : element,
      ),
    })),

  removeLayoutElement: (elementId) =>
    get().commit((draft) => ({
      ...draft,
      layout: draft.layout.filter((element) => element.id !== elementId),
      flow: draft.flow.filter((entry) => entry.id !== elementId),
    })),

  nudgeFlowItem: (id, direction) =>
    get().commit((draft) => applyFlowMove(draft, nudgeInFlow(draft, id, direction))),

  // Move an item next to `targetId`. No cross-section case: with one flow, dragging
  // past a section heading *is* moving into that section.
  reorderFlowItem: (id, targetId, position = 'before') =>
    get().commit((draft) => applyFlowMove(draft, moveInFlow(draft, id, targetId, position))),

  // Move a whole page's worth of items; the run lands relative to the edge member the
  // position names.
  movePage: (sourceIds, targetIds, position) =>
    get().commit((draft) => {
      const anchor = position === 'before' ? targetIds[0] : targetIds.at(-1);
      if (!anchor) return draft;
      if (sourceIds.includes(anchor)) return draft;
      return applyFlowMove(draft, moveRunInFlow(draft, sourceIds, anchor, position));
    }),

  // Land a run at the head of the document: "before the first item not itself moving",
  // through the same moveRunInFlow every other reorder uses.
  moveToDocumentStart: (ids) =>
    get().commit((draft) => {
      const moving = new Set(ids);
      if (moving.size === 0) return draft;
      const first = flowOf(draft).find((entry) => !moving.has(entry.id));
      if (!first) return draft;
      return applyFlowMove(draft, moveRunInFlow(draft, ids, first.id, 'before'));
    }),

  removeMany: (ids) =>
    get().commit((draft) => {
      const set_ = new Set(ids);
      return {
        ...draft,
        questions: draft.questions.filter((question) => !set_.has(question.id)),
        layout: draft.layout.filter((element) => !set_.has(element.id)),
        flow: draft.flow.filter((entry) => !set_.has(entry.id)),
      };
    }),

  duplicateMany: (ids) =>
    get().commit((draft) => {
      const set_ = new Set(ids);
      const questions: Question[] = [];
      const flow = flowOf(draft);
      for (const question of draft.questions) {
        questions.push(question);
        if (!set_.has(question.id)) continue;
        const clone = withFreshIds(question);
        questions.push(clone);
        // Each copy is placed after its own original, so duplicating a selection that
        // spans a section heading keeps every copy on the side of it that it came from.
        const at = flow.findIndex((entry) => entry.id === question.id);
        const entry = { type: 'question' as const, id: clone.id };
        if (at < 0) flow.push(entry);
        else flow.splice(at + 1, 0, entry);
      }
      return questions.length === draft.questions.length
        ? draft
        : { ...draft, questions, flow };
    }),

  // --- In-place editing on the page ------------------------------------------
  applyEdit: (target, next) => get().commit((draft) => applyEditTarget(draft, target, next)),
  deleteTarget: (target) => get().commit((draft) => applyDeleteTarget(draft, target)),
  formatTarget: (target, patch) =>
    get().commit((draft) => applyFormatTarget(draft, target, patch)),
  formatRuns: (target, side, start, end, patch) =>
    get().commit((draft) => applyRunFormatTarget(draft, target, side, start, end, patch)),
  insertBlank: (target, side, start, end) =>
    get().commit((draft) => applyInsertBlank(draft, target, side, start, end)),
  resizeBlock: (blockId, widthPx) =>
    get().commit((draft) => applyResizeBlock(draft, blockId, widthPx)),
  resizeLayoutElement: (elementId, value) =>
    get().commit((draft) => ({
      ...draft,
      layout: draft.layout.map((element) => {
        if (element.id !== elementId) return element;
        if (element.kind === 'answerLines' || element.kind === 'answerSpace') {
          return { ...element, lines: clampAnswerLines(value) };
        }
        if (element.kind === 'spacer') {
          return { ...element, heightPt: clampSpacerPt(value) };
        }
        // An element with no size is returned untouched rather than throwing, so a
        // stale handle firing against a since-deleted element is simply dropped.
        return element;
      }),
    })),
  splitLayoutRows: (elementId, keep, overflow, perPage) =>
    get().commit((draft) => {
      const existing = draft.layout.find((element) => element.id === elementId);
      // Only line elements divide. A spacer is one deliberate gap, and two gaps on two
      // pages is not what asking for a taller one means.
      if (!existing || (existing.kind !== 'answerLines' && existing.kind !== 'answerSpace'))
        return draft;

      // The remainder is cut into sheet-sized pieces. One long element would overflow
      // its own page, which is the very thing the cap exists to prevent. Each piece is
      // the same kind as what split — a QAB answer space continues as answer space.
      const piece =
        existing.kind === 'answerSpace' ? createAnswerSpaceElement : createAnswerLinesElement;
      const size = Math.max(1, Math.floor(perPage));
      const created: LayoutElement[] = [];
      let left = clampAnswerLines(overflow);
      while (left > 0) {
        const take = Math.min(size, left);
        created.push(piece(take));
        left -= take;
      }

      // Everything lands in one commit, so however many pieces it took, the split costs
      // the teacher a single undo press — it was one gesture.
      let next: Worksheet = {
        ...draft,
        layout: [
          ...draft.layout.map((element) =>
            element.id === elementId
              ? { ...element, lines: clampAnswerLines(keep) }
              : element,
          ),
          ...created,
        ],
      };
      // Threaded so each piece follows the previous one, keeping document order.
      let after = elementId;
      for (const element of created) {
        next = insertIntoFlow(next, { type: 'layout', id: element.id }, after, {});
        after = element.id;
      }
      return next;
    }),
  resolveAnswerSpaceFills: (counts) =>
    set((state) => {
      let changed = false;
      const layout = state.worksheet.layout.map((element) => {
        if (element.kind !== 'answerSpace' || !element.fill) return element;
        const lines = counts.get(element.id);
        if (lines === undefined || lines === element.lines) return element;
        changed = true;
        return { ...element, lines: clampAnswerLines(lines) };
      });
      if (!changed) return state;
      // History deliberately untouched — see the interface note. `past`/`future` keep
      // pointing at their own snapshots; a later undo simply restores a worksheet whose
      // fill counts the next measurement pass re-resolves.
      return {
        ...state,
        worksheet: { ...state.worksheet, layout },
        dirty: true,
      };
    }),
  trimQuestionAnswerSpace: (questionId, lines) =>
    set((state) => {
      let changed = false;
      const questions = state.worksheet.questions.map((question) => {
        if (question.id !== questionId || question.type !== 'structured') return question;
        const next = clampAnswerLines(lines);
        if (question.answerSpace === undefined || question.answerSpace === next) return question;
        changed = true;
        return { ...question, answerSpace: next };
      });
      if (!changed) return state;
      // History untouched, exactly as `resolveAnswerSpaceFills` leaves it.
      return {
        ...state,
        worksheet: { ...state.worksheet, questions },
        dirty: true,
      };
    }),
  replaceBlock: (blockId, next) =>
    get().commit((draft) => replaceBlockById(draft, blockId, next)),
  resizeTableColumn: (blockId, index, delta, columnCount) =>
    get().commit((draft) =>
      mapTableBlock(draft, blockId, (block) => resizeColumn(block, index, delta, columnCount)),
    ),
  resizeTableEdge: (blockId, side, delta) =>
    get().commit((draft) =>
      mapTableBlock(draft, blockId, (block) => resizeTableEdge(block, side, delta)),
    ),
  setTableRowHeight: (blockId, index, twips) =>
    get().commit((draft) =>
      mapTableBlock(draft, blockId, (block) => setRowHeight(block, index, twips)),
    ),
  insertTableRow: (blockId, index) =>
    get().commit((draft) => mapTableBlock(draft, blockId, (block) => insertRow(block, index))),
  removeTableRow: (blockId, index) =>
    get().commit((draft) => mapTableBlock(draft, blockId, (block) => removeRow(block, index))),
  insertTableColumn: (blockId, index) =>
    get().commit((draft) => mapTableBlock(draft, blockId, (block) => insertColumn(block, index))),
  removeTableColumn: (blockId, index) =>
    get().commit((draft) => mapTableBlock(draft, blockId, (block) => removeColumn(block, index))),

  // --- Page setup, masthead bands, header/footer ------------------------------
  setPageSetup: (patch) =>
    get().commit((draft) => ({
      ...draft,
      pageSetup: {
        paper: 'A4',
        orientation: 'portrait',
        margins: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        ...draft.pageSetup,
        ...patch,
      },
    })),

  applyCover: (options) =>
    // One field, so one assignment — the payoff of modelling a cover as a page rather
    // than as a run of layout elements to thread into the flow.
    get().commit((draft) => ({ ...draft, cover: createCoverPage(options) })),
  removeCover: () => get().commit((draft) => ({ ...draft, cover: undefined })),
  updateCover: (patch) =>
    get().commit((draft) =>
      draft.cover ? { ...draft, cover: { ...draft.cover, ...patch } } : draft,
    ),
  setCoverLineText: (lineId, text) =>
    get().commit((draft) =>
      draft.cover ? { ...draft, cover: setCoverLineText(draft.cover, lineId, text) } : draft,
    ),
  formatCoverLine: (lineId, patch) =>
    get().commit((draft) =>
      draft.cover ? { ...draft, cover: setCoverLineFormat(draft.cover, lineId, patch) } : draft,
    ),
  addCoverLine: (region, afterId) =>
    get().commit((draft) =>
      draft.cover ? { ...draft, cover: addCoverLine(draft.cover, region, afterId) } : draft,
    ),
  removeCoverLine: (lineId) =>
    get().commit((draft) =>
      draft.cover ? { ...draft, cover: removeCoverLine(draft.cover, lineId) } : draft,
    ),
  setBands: (bands) => get().commit((draft) => ({ ...draft, bands })),

  addBand: (band) =>
    get().commit((draft) => ({ ...draft, bands: [...(draft.bands ?? []), band ?? createBand()] })),

  removeBand: (bandId) =>
    get().commit((draft) => ({
      ...draft,
      bands: (draft.bands ?? []).filter((band) => band.id !== bandId),
    })),

  addBandField: (bandId, zone, field) =>
    get().commit((draft) => ({
      ...draft,
      bands: (draft.bands ?? []).map((band) =>
        band.id === bandId ? addField(band, zone, field) : band,
      ),
    })),

  // Addressed by field id alone: the caller edits a field it can see, and making it
  // name the band as well would be a second thing to get wrong for no benefit.
  updateBandField: (fieldId, patch) =>
    get().commit((draft) => patchBandHolding(draft, fieldId, (band) =>
      updateField(band, fieldId, patch),
    )),

  setBandFieldText: (fieldId, side, text) =>
    get().commit((draft) =>
      patchBandHolding(draft, fieldId, (band) =>
        updateField(band, fieldId, bandFieldSidePatch(band, fieldId, side, text)),
      ),
    ),

  removeBandField: (fieldId) =>
    get().commit((draft) => patchBandHolding(draft, fieldId, (band) => removeField(band, fieldId))),

  moveBandField: (bandId, fieldId, zone, beforeId) =>
    get().commit((draft) => ({
      ...draft,
      bands: (draft.bands ?? []).map((band) =>
        band.id === bandId ? moveField(band, fieldId, zone, beforeId) : band,
      ),
    })),

  setHeaderFooter: (which, patch) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );
      return { ...draft, [which]: { ...current, ...patch } };
    }),

  addHeaderFooterBand: (which, band, scope = 'running') =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );
      const row = band ?? createBand();

      // A write aimed at page 1 *creates* the separation when there is none — a row
      // aimed at page 1 is itself the request for page 1 to differ.
      if (scope === 'firstPage') {
        const existing = current.firstPage?.bands ?? [];
        return {
          ...draft,
          [which]: {
            ...current,
            enabled: true,
            showOnFirstPage: true,
            firstPage: { ...current.firstPage, bands: [...existing, row] },
          },
        };
      }

      return {
        ...draft,
        // Adding a row to a disabled header is a clear intent to use it.
        [which]: { ...current, enabled: true, bands: [...current.bands, row] },
      };
    }),

  removeHeaderFooterBand: (which, bandId) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );

      // Both lists are filtered (the two never share an id), or a page-1 row is
      // undeletable.
      return {
        ...draft,
        [which]: {
          ...current,
          bands: current.bands.filter((band) => band.id !== bandId),
          ...(current.firstPage
            ? {
                firstPage: {
                  ...current.firstPage,
                  bands: current.firstPage.bands.filter((band) => band.id !== bandId),
                },
              }
            : {}),
        },
      };
    }),

  addHeaderFooterField: (which, bandId, zone, field) =>
    get().commit((draft) =>
      patchHeaderFooterBand(draft, which, (band) => band.id === bandId, (band) =>
        addField(band, zone, field),
      ),
    ),

  updateHeaderFooterField: (which, fieldId, patch) =>
    get().commit((draft) =>
      patchHeaderFooterBand(draft, which, (band) => bandHolds(band, fieldId), (band) =>
        updateField(band, fieldId, patch),
      ),
    ),

  /** `setBandFieldText` for a header or footer; see the note there on why it is its own action. */
  setHeaderFooterFieldText: (which, fieldId, side, text) =>
    get().commit((draft) =>
      patchHeaderFooterBand(draft, which, (band) => bandHolds(band, fieldId), (band) =>
        updateField(band, fieldId, bandFieldSidePatch(band, fieldId, side, text)),
      ),
    ),

  removeHeaderFooterField: (which, fieldId) =>
    get().commit((draft) =>
      patchHeaderFooterBand(draft, which, (band) => bandHolds(band, fieldId), (band) =>
        removeField(band, fieldId),
      ),
    ),

  moveHeaderFooterField: (which, bandId, fieldId, zone, beforeId) =>
    get().commit((draft) =>
      patchHeaderFooterBand(draft, which, (band) => band.id === bandId, (band) =>
        moveField(band, fieldId, zone, beforeId),
      ),
    ),

  setHeaderFooterBands: (which, bands, scope = 'running') =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );

      // A preset aimed at page 1 replaces page 1's rows only, creating the separation
      // when there is none (as addHeaderFooterBand does).
      if (scope === 'firstPage') {
        return {
          ...draft,
          [which]: {
            ...current,
            enabled: true,
            showOnFirstPage: true,
            firstPage: { ...current.firstPage, bands },
          },
        };
      }

      return { ...draft, [which]: { ...current, enabled: true, bands } };
    }),

  setFirstPageMode: (which, mode) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );

      if (mode === 'same' || mode === 'blank') {
        // `firstPage` is dropped rather than emptied: an empty-but-present variant would
        // read as "page 1 deliberately prints nothing", which is the *other* state.
        const rest = { ...current };
        delete rest.firstPage;
        return { ...draft, [which]: { ...rest, showOnFirstPage: mode === 'same' } };
      }

      // "Different" starts from a *copy* of the running rows rather than an empty list:
      // a teacher choosing it almost always wants "like the others, but with the school
      // name" — starting blank would make them rebuild the header they already have.
      // Ids are regenerated so the two lists never share a band id, which would make
      // `patchHeaderFooterBand` edit both at once.
      return {
        ...draft,
        [which]: {
          ...current,
          enabled: true,
          showOnFirstPage: true,
          firstPage: current.firstPage ?? { bands: current.bands.map(cloneBand) },
        },
      };
    }),

  setFirstPageBands: (which, bands) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );
      return {
        ...draft,
        [which]: {
          ...current,
          enabled: true,
          firstPage: { ...(current.firstPage ?? {}), bands },
        },
      };
    }),
}));

/**
 * Copy a band with fresh ids.
 *
 * The page-1 list must not share a band or field id with the running list: both are
 * searched by id when a field is edited on the page, so a shared id would apply one
 * keystroke to both lists at once.
 */
function cloneBand(band: Band): Band {
  const zones = band.zones ?? { left: [], center: [], right: [] };
  const copyZone = (fields: BandField[] | undefined) =>
    (fields ?? []).map((field) => ({ ...field, id: newId() }));
  return {
    ...band,
    id: newId(),
    zones: {
      left: copyZone(zones.left),
      center: copyZone(zones.center),
      right: copyZone(zones.right),
    },
  };
}

/**
 * Apply a flow move to a section.
 *
 * `moveInFlow` and friends return the reordered flow plus, when the moved item is a
 * question, the reordered `questions` array — because `questions` owns question order
 * and the two must be rewritten together or they disagree about which question is third.
 */
function applyFlowMove(worksheet: Worksheet, move: FlowMove): Worksheet {
  return { ...worksheet, flow: move.flow, questions: move.questions };
}
