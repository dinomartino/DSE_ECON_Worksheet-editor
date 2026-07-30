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
  applyRunFormatTarget,
  applyResizeBlock,
  replaceBlockById,
} from '@/model/edits';
import { createWorksheet, newId } from '@/model/factories';
import {
  applyOrder,
  clampAnswerLines,
  clampSpacerPt,
  createAnswerLinesElement,
  flowOf,
  moveInFlow,
  moveRunInFlow,
  nudgeInFlow,
  type FlowMove,
} from '@/model/flow';
import { applyBandFieldSide } from '@/model/bandSegments';
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
 * The document store (§10).
 *
 * One rule shapes everything here: **every mutation goes through `commit`**, which
 * applies a pure recipe to the current worksheet and pushes the previous value onto the
 * undo stack. Nothing else writes `worksheet`, so undo/redo needs no per-action
 * knowledge — and because numbering and marks are derived rather than stored (§3.5),
 * a reorder or a delete needs no renumbering pass either.
 *
 * The actions are deliberately thin. The real work lives in pure model functions
 * (`model/edits`, `model/flow`, `model/bands`) that are unit-tested without a store,
 * and each action's job is to name the intent and route it through `commit` so it
 * becomes undoable and autosaved.
 */

/** How many steps of history to keep. Beyond this the oldest are dropped. */
const HISTORY_LIMIT = 100;

interface WorksheetState {
  worksheet: Worksheet;
  mode: OutputMode;
  /**
   * Showing the sheets as they will print: no editing, no chrome.
   *
   * Deliberately *not* part of `OutputMode`. That is the document's own state — which
   * language, student or teacher — and it is what the exporter reads; a view toggle
   * that reached `.docx` generation would be a bug waiting to happen. This is a
   * property of the editor, so it lives beside the mode rather than inside it, and it
   * is not persisted: a worksheet reopens ready to edit.
   */
  printPreview: boolean;
  /** Unsaved changes since the last `markSaved`. */
  dirty: boolean;
  lastSavedAt?: string;
  selectedQuestionId?: string;
  /**
   * The flow id a new item lands after, or undefined to append.
   *
   * **The add rail can only insert where it can see.** Its destination used to be
   * `selectedQuestionId` alone, so selecting a *layout* element — a heading, a
   * divider, a page break — left it undefined and the new item silently went to the
   * end of the document. That selection lives in `Preview`'s local state, because a
   * divider has nothing for the sidebar to inspect, and the rail sits outside the
   * preview; there was no way for it to know.
   *
   * So the anchor is a **position**, not a selection: one id naming the item to land
   * behind, whatever kind it is. Selecting anything on the page sets it, and the gap
   * affordance sets it without selecting anything at all — which is the case that
   * has no neighbour to nominate.
   *
   * It is deliberately not derived from the three selections. Two of them are local
   * to the preview and the third means "show this in the inspector"; folding a
   * *destination* into them would make clearing the inspector also move where content
   * lands, and a marquee of five items would have no single answer to give.
   */
  insertAnchorId?: string;
  /**
   * A request from the page to open the add rail's insert menu.
   *
   * The `+` in a gap and the rail's own buttons open the same menu, so the page has to
   * be able to raise it. It is a counter rather than a boolean: two clicks on two
   * different gaps must both open the menu, and a boolean already true the second time
   * would be a no-op — the affordance would work once and then appear dead.
   *
   * The rail still owns *rendering* the menu; this only asks. That keeps the flyout's
   * markup, its outside-click handling and its Escape key in one place instead of
   * giving the page a second copy to keep in step.
   */
  insertMenuRequest: number;
  /**
   * The table cell last clicked on the page, as `{ blockId, cellId }`.
   *
   * The sidebar's table panel is **structure only** — insert a row, merge, align — and
   * every one of those verbs needs a subject. The subject is whichever cell the teacher
   * is in, and they are in it *on the page*, because that is where the table is legible
   * at full width. So the page reports the cell and the panel acts on it, rather than the
   * panel rendering a second grid of inputs to click in.
   *
   * It is not part of the document: which cell has focus is editor state, and persisting
   * it would restore a selection into a table that may have been reshaped since.
   */
  activeCell?: { blockId: string; cellId: string };
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
   * Move a run to the very front of the document, keeping its order.
   *
   * The one position no anchor can name. Every other drop is expressed relative to an
   * existing item, but the first sheet has nothing before it to aim at — and if its
   * content has all been dragged away it has no members to aim at either, which is what
   * left an emptied page 1 permanently unfillable.
   */
  moveToDocumentStart: (ids: string[]) => void;
  removeMany: (ids: string[]) => void;
  duplicateMany: (ids: string[]) => void;

  // --- In-place editing on the page ------------------------------------------
  applyEdit: (target: EditTarget, next: BiText) => void;
  deleteTarget: (target: EditTarget) => void;
  formatTarget: (target: EditTarget, patch: Partial<TextFormat>) => void;
  /**
   * Format one character range inside a target — the per-run path.
   *
   * Separate verb from `formatTarget` because the subject is different: that one
   * overrides the whole element, this one rewrites the runs so only the selected
   * characters differ. Both are one `commit`, so either is a single undo entry.
   */
  formatRuns: (
    target: EditTarget,
    side: 'en' | 'zh',
    start: number,
    end: number,
    patch: RunFormatPatch,
  ) => void;
  resizeBlock: (blockId: string, widthPx: number) => void;
  /**
   * Extend a sizeable layout element — answer lines by count, a spacer by points.
   *
   * One verb for both, taking a bare number, because the caller is a drag handle on the
   * page and a stepper in the sidebar: neither should have to know which *field* the
   * element stores its size in. The element's own kind decides that here, which is what
   * keeps the two surfaces from spelling the same edit differently.
   */
  resizeLayoutElement: (elementId: string, value: number) => void;
  /**
   * Divide answer lines in two: `keep` rows stay, `overflow` rows become a **new
   * element** immediately after.
   *
   * This is what a drag past the end of the page means. The cap stops any single
   * element growing taller than a sheet — the one overflow the paginator cannot fix by
   * moving something — so asking for more has to produce another element rather than an
   * oversized one. The new element is real: its own id, its own outline row, its own
   * entry in the export, separately movable and deletable afterwards.
   *
   * It is deliberately one `commit`, so the whole split is a single undo entry, and it
   * is only ever called from a gesture. A split driven by re-measurement would fire
   * while typing into the question above and silently rewrite the flow.
   *
   * `perPage` is how many rows a *fresh* sheet holds. The overflow is chopped into
   * elements of that size rather than one long one, because a remainder larger than a
   * whole page would overflow its own sheet and reintroduce exactly the problem the cap
   * exists to prevent — dragging for 48 lines on a page with room for 16 produces
   * 16 + 26 + 6, not 16 + 32.
   */
  splitLayoutRows: (
    elementId: string,
    keep: number,
    overflow: number,
    perPage: number,
  ) => void;
  /** Replace one block by id — the route a page-opened editor commits through. */
  replaceBlock: (blockId: string, next: ContentBlock) => void;

  // --- Page setup, masthead bands, header/footer ------------------------------
  setPageSetup: (patch: Partial<PageSetup>) => void;
  setBands: (bands: Band[]) => void;
  addBand: (band?: Band) => void;
  /** Remove one masthead row, so a row added on the page can be taken back there. */
  removeBand: (bandId: string) => void;
  addBandField: (bandId: string, zone: ZoneName, field: BandField) => void;
  updateBandField: (fieldId: string, patch: Partial<BandField>) => void;
  /**
   * Write authored text into one side of a masthead field.
   *
   * Distinct from `updateBandField` because the destination depends on the field's kind,
   * which only the store has in hand — see `bandFieldSidePatch`.
   */
  setBandFieldText: (fieldId: string, side: BandFieldSide, text: BiText) => void;
  removeBandField: (fieldId: string) => void;
  moveBandField: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) => void;

  setHeaderFooter: (which: 'header' | 'footer', patch: Partial<HeaderFooter>) => void;
  /**
   * Header/footer rows.
   *
   * The same verbs the masthead uses, because a header row *is* a `Band` — sharing the
   * model means sharing the mutators rather than maintaining a parallel set that drifts.
   */
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
   * Choose what page 1 does (§ `HeaderFooter.firstPage`).
   *
   * One action for all three states rather than three, because they are mutually
   * exclusive: reaching any one of them has to clear the other two, and separate setters
   * would let a document end up both blank on page 1 *and* carrying first-page rows.
   */
  setFirstPageMode: (which: 'header' | 'footer', mode: FirstPageMode) => void;
  /** Replace the page-1 rows — how a first-page preset is applied. */
  setFirstPageBands: (which: 'header' | 'footer', bands: Band[]) => void;
}

/** What page 1 prints, as a single closed choice. */
export type FirstPageMode = 'same' | 'blank' | 'different';

/**
 * Which of a header/footer's two row lists a structural edit targets.
 *
 * A header in "different" mode holds two independent lists — the running rows and page
 * 1's own — and *adding* or *replacing* a row has to say which it means. Field-level
 * edits do not need this because they address a field by id and `patchHeaderFooterBand`
 * finds whichever list holds it; a row being *created* has no id to find yet.
 *
 * Defaulting to `'running'` keeps every existing caller correct: before this, "+ Row"
 * and every preset wrote to `bands` unconditionally, which is exactly the bug — a
 * teacher looking at page 1 clicked "+ Row" and the row appeared on page 2.
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
 * Hold a sizeable layout element to its floor.
 *
 * Applied on the way *into* the document rather than at each caller, because both
 * surfaces that size these elements — the sidebar's number field and the page's own
 * edge drag — end up here, and a floor enforced in two places is a floor that will
 * eventually disagree with itself. A drag that overshoots therefore lands on one line
 * rather than on nothing (§`MIN_ANSWER_LINES`).
 */
function clampLayoutElement(element: LayoutElement): LayoutElement {
  if (element.kind === 'answerLines') {
    return { ...element, lines: clampAnswerLines(element.lines) };
  }
  if (element.kind === 'spacer') {
    return { ...element, heightPt: clampSpacerPt(element.heightPt) };
  }
  return element;
}

/**
 * Drop an insertion anchor that no longer names anything in the document.
 *
 * Deleting the anchored item would otherwise leave the rail pointing at a ghost, and
 * `insertIntoFlow` treats an id it cannot find exactly like no id at all — so the next
 * insert would quietly append to the end while the rail's label still claimed a
 * position. That is the same silent-append failure the anchor exists to remove.
 *
 * It runs in `commit` rather than in the four removal actions because `commit` is the
 * single write path: undo, redo and any future action that drops an item are all
 * covered without knowing they exist. The cost is one flow scan per edit, on a document
 * whose flow the paginator already walks several times per render.
 */
function livingAnchor(anchorId: string | undefined, next: Worksheet): string | undefined {
  if (!anchorId) return undefined;
  return flowOf(next).some((item) => item.id === anchorId) ? anchorId : undefined;
}

/**
 * Place a new item in the flow, after `afterId` when given and at the end otherwise.
 *
 * Both kinds of insert share this: a question and a layout element differ only in which
 * stored list they join, never in how their position is recorded. `patch` carries that
 * list, so the caller decides what is being added and this decides where it goes.
 *
 * The flow is resolved first rather than appended to blindly — a document whose stored
 * flow is missing entries (older saves never listed every id) would otherwise place the
 * new item relative to a list that does not describe what is on the page.
 *
 * **The position has to be written into both lists**, not just `flow`. `questions` is
 * the authority on question order (§flow), so a question appended to that array prints
 * last no matter where its flow entry sits — which is exactly what happened when an
 * insert was anchored anywhere but the end: the flow said "after the Section B
 * heading", `resolveFlow` read the array, and the question appeared on the last page.
 * A layout element never showed the fault, since `layout` carries existence only and
 * `flow` alone positions it.
 *
 * `applyOrder` is the one rule for splitting an ordered flow back into the two stored
 * lists, shared with every move. Deriving `questions` here by hand would be a second
 * copy of it, and the two would eventually disagree about a case like this one.
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
  if (at < 0) flow.push(entry);
  else flow.splice(at + 1, 0, entry);

  const ordered = applyOrder(merged, flow);
  return { ...merged, questions: ordered.questions, flow: ordered.flow };
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
 * The `updateField` patch that writes `text` into one side of a field.
 *
 * Resolved from the field itself, because where authored text lives depends on the kind:
 * a `text` field stores it as `text`, a computed one as `prefix` or `suffix`. Looking the
 * field up here keeps that branching inside `applyBandFieldSide` and off every caller —
 * a component editing a header knows which *side* it clicked, never which kind it is.
 *
 * Returns an empty patch for a field that no longer exists, so a stale commit from a
 * field deleted mid-edit is a no-op rather than an error.
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

  /*
   * Both band lists are searched, because a page-1 variant is edited **on page 1** by
   * the very same `BandEditor` — a click there reports only a band id and a field id, so
   * addressing only `bands` would silently drop every edit made to the first-page rows.
   * Only the list that actually holds the match is rewritten, so an id that appears in
   * neither leaves the document untouched rather than clearing a list.
   */
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
  /**
   * The single write path.
   *
   * A recipe that returns the worksheet unchanged commits nothing: that is what makes a
   * no-op drag (onto itself, onto an unknown target) cost no undo entry, which the store
   * tests assert directly.
   */
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

  /**
   * Save immediately.
   *
   * The autosave debounce (§6) covers ordinary editing; this is the explicit "Save now",
   * which a teacher reaches for before closing the tab and should not have to trust a
   * timer for.
   */
  save: async () => {
    await worksheetStore.save(get().worksheet);
    get().markSaved();
  },

  /**
   * Switching language or version is a **view** change, not an edit.
   *
   * It therefore bypasses `commit` entirely: it must not enter the history (undo would
   * appear to do nothing) and must not mark the document dirty. The hidden language's
   * content is never touched — patch-never-replace (§5.2).
   */
  setMode: (patch) => set((state) => ({ mode: { ...state.mode, ...patch } })),

  /*
   * Entering print preview clears the question selection.
   *
   * A selection is an editing state, and the preview's whole claim is that nothing on
   * screen belongs to the editor — a ring left behind would be visible in a view whose
   * point is to show only what prints. It is also what `handlePdf` does before calling
   * `window.print()`, for the same reason.
   *
   * Like `setMode` this bypasses `commit`: a view toggle is not a document edit, so it
   * must not enter the undo history or mark the worksheet dirty.
   */
  setPrintPreview: (printPreview) =>
    set(printPreview ? { printPreview, selectedQuestionId: undefined } : { printPreview }),

  /*
   * Selecting a question also points the rail at it.
   *
   * "Add after the thing I am looking at" is what a single click already meant before
   * the anchor existed, and keeping that costs nothing — the anchor is simply now able
   * to hold a layout element too. Clearing the selection clears the anchor, so a click
   * on blank paper returns the rail to appending, which is what an empty page means.
   */
  select: (selectedQuestionId) =>
    set({ selectedQuestionId, insertAnchorId: selectedQuestionId }),

  setInsertAnchor: (insertAnchorId) => set({ insertAnchorId }),

  requestInsertMenu: (insertAnchorId) =>
    set((state) => ({
      insertAnchorId,
      insertMenuRequest: state.insertMenuRequest + 1,
    })),

  setActiveCell: (activeCell) => set({ activeCell }),
  setDragQuestionId: (dragQuestionId) => set({ dragQuestionId }),

  // --- Questions --------------------------------------------------------------

  /**
   * Add a question of a registered type.
   *
   * The type is resolved through the registry rather than switched on here — that is the
   * extension point (§9), and an unknown id is ignored rather than corrupting the
   * document with a question no renderer understands.
   *
   * It lands after `afterId`, **defaulting to the stored insertion anchor**, and at the
   * end when there is neither. There is no container to choose any more: which section
   * it belongs to follows from which marker precedes it, so "add here" is a position
   * rather than a parent.
   *
   * The default matters because the anchor is the store's own answer to "where is the
   * teacher working". Requiring every caller to pass it means each new surface — the
   * rail, the outline's menu, a keyboard shortcut — has to remember to, and the one
   * that forgets appends silently. Defaulting here makes them right without knowing the
   * anchor exists; an explicit `afterId` still wins, which is what a drop target needs.
   *
   * **The anchor advances onto what was just added**, so a second insert lands after
   * the first rather than beside it. Leaving it on the original neighbour makes each
   * new item land *above* the previous one, so adding three questions writes them into
   * the document backwards — with the rail's own label the only clue, and it would be
   * telling the truth.
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

  /**
   * Drag-reorder one question relative to another.
   *
   * `questions` stays the authority on question order (§ section flow invariant), so
   * this rewrites that array rather than the flow. A drag onto itself or onto an id
   * that is not a question returns the draft untouched, so `commit` records nothing.
   */
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
  /**
   * Append a layout element, optionally right after an existing item.
   *
   * The element lands in `layout` and its position in `flow`; those are the two halves
   * the flow invariant keeps separate — `layout` owns existence, `flow` owns position.
   */
  addLayoutElement: (element, afterId) => {
    // Defaults to the stored anchor, exactly as `addQuestion` does — the two must place
    // things by the same rule or the rail's label would be true for one and not the other.
    const anchor = afterId ?? get().insertAnchorId;
    get().commit((draft) =>
      insertIntoFlow(draft, { type: 'layout', id: element.id }, anchor, {
        layout: [...draft.layout, element],
      }),
    );
    // The anchor advances onto the new element, for the same reason it does after a
    // question: consecutive inserts must read down the page, not up it.
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

  /**
   * Move an item next to `targetId`.
   *
   * There is no cross-section case to handle: with one document-wide flow, dragging a
   * question past a section heading *is* moving it into that section, because a
   * question belongs to whichever marker precedes it. This used to need a whole second
   * branch that rewrote two sections in one commit.
   */
  reorderFlowItem: (id, targetId, position = 'before') =>
    get().commit((draft) => applyFlowMove(draft, moveInFlow(draft, id, targetId, position))),

  /**
   * Move a whole page's worth of items, as dragged in the page rail.
   *
   * The rail hands over the target *page's* ids; the run lands relative to the edge
   * member that position names — before the first when dropping above, after the last
   * when dropping below — so a page dropped between two sheets lands between them
   * rather than inside the target.
   */
  movePage: (sourceIds, targetIds, position) =>
    get().commit((draft) => {
      const anchor = position === 'before' ? targetIds[0] : targetIds.at(-1);
      if (!anchor) return draft;
      if (sourceIds.includes(anchor)) return draft;

      /*
       * The run is ordered as a unit, in one move.
       *
       * This used to be the hardest action in the store: a page's items need not all
       * live in one section, so every id had to be carried into the anchor's section
       * first and only then ordered. With one document-wide flow there are no
       * containers to reconcile — a page is just a run of ids, which is what the rail
       * always believed it was handing over.
       */
      return applyFlowMove(draft, moveRunInFlow(draft, sourceIds, anchor, position));
    }),

  /*
   * Land a run at the head of the document.
   *
   * Expressed as "before the first item that is not itself moving" rather than as a
   * splice, so it goes through the same `moveRunInFlow` every other reorder uses and
   * inherits its one guarantee: document order is preserved among the members
   * regardless of the order they were selected in.
   *
   * With nothing staying put the document is entirely this run, so its order is already
   * whatever it is and there is nothing to commit.
   */
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
  resizeBlock: (blockId, widthPx) =>
    get().commit((draft) => applyResizeBlock(draft, blockId, widthPx)),
  resizeLayoutElement: (elementId, value) =>
    get().commit((draft) => ({
      ...draft,
      layout: draft.layout.map((element) => {
        if (element.id !== elementId) return element;
        if (element.kind === 'answerLines') {
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
      // Only answer lines divide. A spacer is one deliberate gap, and two gaps on two
      // pages is not what asking for a taller one means.
      if (!existing || existing.kind !== 'answerLines') return draft;

      // The remainder is cut into sheet-sized pieces. One long element would overflow
      // its own page, which is the very thing the cap exists to prevent.
      const size = Math.max(1, Math.floor(perPage));
      const created: LayoutElement[] = [];
      let left = clampAnswerLines(overflow);
      while (left > 0) {
        const take = Math.min(size, left);
        created.push(createAnswerLinesElement(take));
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
  replaceBlock: (blockId, next) =>
    get().commit((draft) => replaceBlockById(draft, blockId, next)),

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

  /*
   * Write authored text into one side of a masthead field.
   *
   * Separate from `updateBandField` because *where* the text goes depends on the field's
   * kind — a `text` field stores it as `text`, a computed one as `prefix` or `suffix` —
   * and only the store has the field in hand to ask. Callers would otherwise have to
   * look the kind up themselves to build the patch, which is exactly the branching
   * `applyBandFieldSide` exists to remove.
   */
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

      /*
       * A row added while page 1 is the surface being edited joins page 1's list. The
       * scope is passed rather than inferred from `current.firstPage` being present,
       * because a document in "different" mode still has running rows a teacher edits
       * from page 2 — presence tells us the list exists, not which one is meant.
       *
       * Writing to page 1 **creates** the separation when there is none. Requiring
       * `firstPage` to exist first meant a page-1 row silently landed in the running
       * list, so the surface a teacher was looking at was not the one they edited — the
       * same "separate it first, then edit it" ordering the panel used to impose. A row
       * aimed at page 1 is itself the request for page 1 to differ.
       */
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

      // Both lists are filtered, for the reason `patchHeaderFooterBand` searches both: a
      // row deleted on page 1 reports only its own id, and the two lists never share one
      // (`cloneBand` re-ids on copy), so filtering both removes exactly the row clicked.
      // Addressing only `bands` left a page-1 row undeletable.
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

      /*
       * Applying a preset to page 1 replaces page 1's rows only. Sending it to the
       * running list instead — which is what happened before the scope existed — reads
       * to the teacher as the preset having done nothing at all, since the page they
       * are looking at is unchanged.
       *
       * As with `addHeaderFooterBand`, a write aimed at page 1 **creates** the separation
       * rather than requiring it: choosing a cover layout is the request for page 1 to
       * differ, so it must not first be routed into the running rows.
       */
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
