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
  applyResizeBlock,
  replaceBlockById,
} from '@/model/edits';
import { createWorksheet, newId } from '@/model/factories';
import {
  flowOf,
  moveInFlow,
  moveRunInFlow,
  nudgeInFlow,
  type FlowMove,
} from '@/model/flow';
import { defaultFooter, defaultHeader, headerFooterOf } from '@/model/page';
import type {
  Band,
  BandField,
  BiText,
  ContentBlock,
  HeaderFooter,
  LayoutElement,
  OutputMode,
  PageSetup,
  FlowItem,
  Question,
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
  /** Unsaved changes since the last `markSaved`. */
  dirty: boolean;
  lastSavedAt?: string;
  selectedQuestionId?: string;
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
  select: (questionId?: string) => void;
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
  removeMany: (ids: string[]) => void;
  duplicateMany: (ids: string[]) => void;

  // --- In-place editing on the page ------------------------------------------
  applyEdit: (target: EditTarget, next: BiText) => void;
  deleteTarget: (target: EditTarget) => void;
  formatTarget: (target: EditTarget, patch: Partial<TextFormat>) => void;
  resizeBlock: (blockId: string, widthPx: number) => void;
  /** Replace one block by id — the route a page-opened editor commits through. */
  replaceBlock: (blockId: string, next: ContentBlock) => void;

  // --- Page setup, masthead bands, header/footer ------------------------------
  setPageSetup: (patch: Partial<PageSetup>) => void;
  setBands: (bands: Band[]) => void;
  addBand: (band?: Band) => void;
  addBandField: (bandId: string, zone: ZoneName, field: BandField) => void;
  updateBandField: (fieldId: string, patch: Partial<BandField>) => void;
  removeBandField: (fieldId: string) => void;
  moveBandField: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) => void;

  setHeaderFooter: (which: 'header' | 'footer', patch: Partial<HeaderFooter>) => void;
  /**
   * Header/footer rows.
   *
   * The same verbs the masthead uses, because a header row *is* a `Band` — sharing the
   * model means sharing the mutators rather than maintaining a parallel set that drifts.
   */
  addHeaderFooterBand: (which: 'header' | 'footer', band?: Band) => void;
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
  removeHeaderFooterField: (which: 'header' | 'footer', fieldId: string) => void;
  moveHeaderFooterField: (
    which: 'header' | 'footer',
    bandId: string,
    fieldId: string,
    zone: ZoneName,
    beforeId?: string,
  ) => void;
  /** Replace a header/footer's rows wholesale — how a preset is applied. */
  setHeaderFooterBands: (which: 'header' | 'footer', bands: Band[]) => void;
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
 * Place a new item in the flow, after `afterId` when given and at the end otherwise.
 *
 * Both kinds of insert share this: a question and a layout element differ only in which
 * stored list they join, never in how their position is recorded. `patch` carries that
 * list, so the caller decides what is being added and this decides where it goes.
 *
 * The flow is resolved first rather than appended to blindly — a document whose stored
 * flow is missing entries (older saves never listed every id) would otherwise place the
 * new item relative to a list that does not describe what is on the page.
 */
function insertIntoFlow(
  worksheet: Worksheet,
  entry: FlowItem,
  afterId: string | undefined,
  patch: Partial<Worksheet>,
): Worksheet {
  const flow = flowOf(worksheet);
  const at = afterId ? flow.findIndex((item) => item.id === afterId) : -1;
  if (at < 0) flow.push(entry);
  else flow.splice(at + 1, 0, entry);
  return { ...worksheet, ...patch, flow };
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
  dirty: false,
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
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,

  // --- Document --------------------------------------------------------------
  replaceWorksheet: (worksheet) =>
    set({ worksheet, past: [], future: [], dirty: false, selectedQuestionId: undefined }),

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

  select: (selectedQuestionId) => set({ selectedQuestionId }),
  setDragQuestionId: (dragQuestionId) => set({ dragQuestionId }),

  // --- Questions --------------------------------------------------------------

  /**
   * Add a question of a registered type.
   *
   * The type is resolved through the registry rather than switched on here — that is the
   * extension point (§9), and an unknown id is ignored rather than corrupting the
   * document with a question no renderer understands.
   *
   * It lands after `afterId` when given, otherwise at the end. There is no container to
   * choose any more: which section it belongs to follows from which marker precedes it,
   * so "add here" is a position rather than a parent.
   */
  addQuestion: (typeId, afterId) => {
    const definition = listQuestionTypes().find((type) => type.id === typeId);
    if (!definition) return;
    const question = definition.create();
    get().commit((draft) => insertIntoFlow(draft, { type: 'question', id: question.id }, afterId, {
      questions: [...draft.questions, question],
    }));
    set({ selectedQuestionId: question.id });
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
  addLayoutElement: (element, afterId) =>
    get().commit((draft) =>
      insertIntoFlow(draft, { type: 'layout', id: element.id }, afterId, {
        layout: [...draft.layout, element],
      }),
    ),

  updateLayoutElement: (elementId, patch) =>
    get().commit((draft) => ({
      ...draft,
      layout: draft.layout.map((element) =>
        element.id === elementId ? ({ ...element, ...patch } as LayoutElement) : element,
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
  resizeBlock: (blockId, widthPx) =>
    get().commit((draft) => applyResizeBlock(draft, blockId, widthPx)),
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

  addHeaderFooterBand: (which, band) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );
      return {
        ...draft,
        // Adding a row to a disabled header is a clear intent to use it.
        [which]: { ...current, enabled: true, bands: [...current.bands, band ?? createBand()] },
      };
    }),

  removeHeaderFooterBand: (which, bandId) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );
      return {
        ...draft,
        [which]: { ...current, bands: current.bands.filter((band) => band.id !== bandId) },
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

  setHeaderFooterBands: (which, bands) =>
    get().commit((draft) => {
      const current = headerFooterOf(
        draft[which],
        which === 'header' ? defaultHeader : defaultFooter,
      );
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
