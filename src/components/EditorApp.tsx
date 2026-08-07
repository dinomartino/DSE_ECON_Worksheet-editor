'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Preview, type PageComposition } from '@/components/preview/Preview';
import { dropRunAnchor } from '@/components/preview/pagination';
import { AddRail } from '@/components/editor/AddRail';
import { PageRail } from '@/components/editor/PageRail';
import { Sidebar } from '@/components/editor/Sidebar';
import { DocumentSettings } from '@/components/editor/DocumentSettings';
import { Toolbar } from '@/components/editor/Toolbar';
import { IconButton } from '@/components/ui';
import { ChevronRightIcon, CloseIcon } from '@/components/ui/icons';
import { createTextField, type ZoneName } from '@/model/bands';
import { DiagramCanvas } from '@/components/editor/DiagramCanvas';
import { findDiagramBlock, formatOfTarget, targetQuestionId, textOfTarget } from '@/model/edits';
import { toRunPatch } from '@/model/text';
import type { BandFieldSide, BiText, TextFormat } from '@/model/types';
import type { EditTarget } from '@/render/ir';
import { useWorksheetStore, type BandScope } from '@/store/worksheetStore';
import { worksheetStore } from '@/storage';

/** Two-pane shell (§5.1): structural editor on the left, live preview on the right. */
export function EditorApp({ onOpenFiles }: { onOpenFiles: () => void }) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const mode = useWorksheetStore((s) => s.mode);
  const printPreview = useWorksheetStore((s) => s.printPreview);
  const setPrintPreview = useWorksheetStore((s) => s.setPrintPreview);
  const dirty = useWorksheetStore((s) => s.dirty);
  const selectedQuestionId = useWorksheetStore((s) => s.selectedQuestionId);
  const select = useWorksheetStore((s) => s.select);
  const undo = useWorksheetStore((s) => s.undo);
  const redo = useWorksheetStore((s) => s.redo);
  const markSaved = useWorksheetStore((s) => s.markSaved);
  const applyEdit = useWorksheetStore((s) => s.applyEdit);
  const deleteTarget = useWorksheetStore((s) => s.deleteTarget);
  const replaceBlock = useWorksheetStore((s) => s.replaceBlock);
  const formatTarget = useWorksheetStore((s) => s.formatTarget);
  const formatRuns = useWorksheetStore((s) => s.formatRuns);
  const insertBlank = useWorksheetStore((s) => s.insertBlank);
  const resizeBlock = useWorksheetStore((s) => s.resizeBlock);
  const resizeLayoutElement = useWorksheetStore((s) => s.resizeLayoutElement);
  const resizeTableColumn = useWorksheetStore((s) => s.resizeTableColumn);
  const resizeTableEdge = useWorksheetStore((s) => s.resizeTableEdge);
  const setTableRowHeight = useWorksheetStore((s) => s.setTableRowHeight);
  const insertTableRow = useWorksheetStore((s) => s.insertTableRow);
  const removeTableRow = useWorksheetStore((s) => s.removeTableRow);
  const insertTableColumn = useWorksheetStore((s) => s.insertTableColumn);
  const removeTableColumn = useWorksheetStore((s) => s.removeTableColumn);
  const addCoverLine = useWorksheetStore((s) => s.addCoverLine);
  const removeCoverLine = useWorksheetStore((s) => s.removeCoverLine);
  const splitLayoutRows = useWorksheetStore((s) => s.splitLayoutRows);
  const trimQuestionAnswerSpace = useWorksheetStore((s) => s.trimQuestionAnswerSpace);
  const resolveAnswerSpaceFills = useWorksheetStore((s) => s.resolveAnswerSpaceFills);
  const reorderFlowItem = useWorksheetStore((s) => s.reorderFlowItem);
  const moveBandField = useWorksheetStore((s) => s.moveBandField);
  const updateBandField = useWorksheetStore((s) => s.updateBandField);
  const setBandFieldText = useWorksheetStore((s) => s.setBandFieldText);
  const removeBandField = useWorksheetStore((s) => s.removeBandField);
  const addBandField = useWorksheetStore((s) => s.addBandField);
  const addBand = useWorksheetStore((s) => s.addBand);
  const removeBand = useWorksheetStore((s) => s.removeBand);
  const moveHeaderFooterField = useWorksheetStore((s) => s.moveHeaderFooterField);
  const updateHeaderFooterField = useWorksheetStore((s) => s.updateHeaderFooterField);
  const setHeaderFooterFieldText = useWorksheetStore((s) => s.setHeaderFooterFieldText);
  const removeHeaderFooterField = useWorksheetStore((s) => s.removeHeaderFooterField);
  const addHeaderFooterField = useWorksheetStore((s) => s.addHeaderFooterField);
  const addHeaderFooterBand = useWorksheetStore((s) => s.addHeaderFooterBand);
  const removeHeaderFooterBand = useWorksheetStore((s) => s.removeHeaderFooterBand);
  const addQuestion = useWorksheetStore((s) => s.addQuestion);
  const removeQuestion = useWorksheetStore((s) => s.removeQuestion);
  const removeLayoutElement = useWorksheetStore((s) => s.removeLayoutElement);
  const removeMany = useWorksheetStore((s) => s.removeMany);
  const movePage = useWorksheetStore((s) => s.movePage);
  const moveToDocumentStart = useWorksheetStore((s) => s.moveToDocumentStart);
  const duplicateMany = useWorksheetStore((s) => s.duplicateMany);

  const scrollerRef = useRef<HTMLElement>(null);

  // How the flow landed on sheets, as reported by the paginator. Pages exist nowhere
  // in the model — they are measured — so the rail can only be told, never derive it.
  const [pages, setPages] = useState<PageComposition[]>([]);
  /** Whether the page rail (left-side page thumbnails) is expanded. */
  const [pageRailOpen, setPageRailOpen] = useState(true);
  /**
   * The diagram opened by double-clicking it on the page, held by **id**.
   *
   * An id rather than the block itself, so the canvas always renders the current
   * geometry: holding the object would freeze it at the moment it was opened, and every
   * edit would then be applied on top of a stale base.
   */
  const [drawingBlockId, setDrawingBlockId] = useState<string | undefined>();
  const foundDrawingBlock = drawingBlockId
    ? findDiagramBlock(worksheet, drawingBlockId)
    : undefined;
  // A pie chart never opens the axes canvas: its slices are data, edited in the
  // sidebar panel, and the canvas's whole gesture vocabulary is about curves.
  const drawingBlock = foundDrawingBlock?.diagram.pie ? undefined : foundDrawingBlock;
  const [activePage, setActivePage] = useState(0);
  /**
   * Whether the document-settings dialog is open.
   *
   * Held here rather than in the toolbar or the sidebar because both open it — the
   * toolbar for "set up this document", the sidebar's Settings button for "change what
   * this worksheet is called" — and a dialog owned by either would be unreachable from
   * the other.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The items being dragged on the page, mirrored here so the rail can receive them.
  // A run, because a drag begun inside a multi-selection carries all of it.
  const [draggingItemIds, setDraggingItemIds] = useState<string[] | undefined>();

  /*
   * Which sheet the reader is looking at, for the rail's highlight.
   *
   * Chosen as the page covering the *upper third* of the viewport rather than the one
   * with the most pixels visible: at a zoom where two sheets fit on screen, a "most
   * visible" rule flickers between them on the smallest scroll, while the top of the
   * viewport is unambiguously where reading happens.
   *
   * A scroll listener rather than an IntersectionObserver, because the answer depends
   * on ordering the candidates by position — which the observer reports piecemeal, one
   * threshold crossing at a time.
   */
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    let queued = false;
    const measure = () => {
      queued = false;
      const line = scroller.getBoundingClientRect().top + scroller.clientHeight / 3;
      const sheets = scroller.querySelectorAll<HTMLElement>(
        '#print-root [data-page-index]',
      );
      let current = 0;
      for (const sheet of sheets) {
        const rect = sheet.getBoundingClientRect();
        if (rect.top <= line) current = Number(sheet.dataset.pageIndex ?? 0);
        else break;
      }
      setActivePage(current);
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    measure();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [pages.length]);

  // Derived from the reactive worksheet, so pressing Bold re-renders the toolbar with
  // the button now active rather than leaving it showing the previous state.
  const formatOf = useCallback(
    (target: EditTarget) => formatOfTarget(worksheet, target),
    [worksheet],
  );

  /*
   * Add an instruction to the cover.
   *
   * The region is bound here rather than passed through the preview: the instruction
   * list is the only cover region whose length is the teacher's to decide
   * (§ `EditContext.coverLines`), so a region parameter would have exactly one legal
   * value. `useCallback` over a store action, like every other handler the preview
   * takes — `ItemBody` memoises on handler identity, so a fresh closure per render
   * would defeat the memo boundary for the whole sheet.
   */
  const addCoverInstruction = useCallback(
    (afterId?: string) => addCoverLine('instructions', afterId),
    [addCoverLine],
  );

  // The target's current text, so the toolbar can report what a selected *range*
  // carries rather than what the whole element does.
  const textOf = useCallback(
    (target: EditTarget) => textOfTarget(worksheet, target),
    [worksheet],
  );

  /*
   * Format the selected characters rather than the whole element.
   *
   * The toolbar speaks `TextFormat` (what an element overrides); a run carries a
   * `RunFormat`. `toRunPatch` drops the paragraph-only fields — alignment and spacing
   * cannot belong to three words inside a paragraph — and maps the bar's "clear this"
   * (`undefined`) onto the run patch's explicit `null`, which is the only way to say
   * "remove this attribute" in a patch that is spread over an existing run.
   */
  const handleFormatRuns = useCallback(
    (
      target: EditTarget,
      side: 'en' | 'zh',
      start: number,
      end: number,
      // `vertAlign` is run-only and has no place on `TextFormat` (§per-run formatting):
      // an element cannot sensibly be wholly subscript, so it rides as an extra field
      // rather than being added to the element type.
      patch: TextFormat & { vertAlign?: 'superscript' | 'subscript' },
    ) => {
      formatRuns(target, side, start, end, toRunPatch(patch));
    },
    [formatRuns],
  );

  // Masthead editing, bundled so it threads through one prop. A new field starts as
  // empty text, which the teacher then types into on the page.
  // The same four verbs for the page header and footer. They address different band
  // lists, so they are separate handler sets rather than one shared closure — but the
  // shape is identical, which is what lets one `BandEditor` serve all three surfaces.
  // One factory for both edges: they differ only in which band list they name, so two
  // hand-written copies would only be somewhere for the six verbs to drift apart.
  const edgeEditing = useCallback(
    (which: 'header' | 'footer') => ({
      onMove: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) =>
        moveHeaderFooterField(which, bandId, fieldId, zone, beforeId),
      onEditField: (fieldId: string, text: BiText, side: BandFieldSide) =>
        setHeaderFooterFieldText(which, fieldId, side, text),
      onRemoveField: (fieldId: string) => removeHeaderFooterField(which, fieldId),
      onAddField: (bandId: string, zone: ZoneName) =>
        addHeaderFooterField(which, bandId, zone, createTextField()),
      // The scope comes from the sheet the click landed on, so a row added while looking
      // at page 1 of a document whose page 1 differs joins page 1's own list.
      onAddRow: (scope: BandScope) => addHeaderFooterBand(which, undefined, scope),
      onRemoveRow: (bandId: string) => removeHeaderFooterBand(which, bandId),
    }),
    [
      moveHeaderFooterField,
      setHeaderFooterFieldText,
      removeHeaderFooterField,
      addHeaderFooterField,
      addHeaderFooterBand,
      removeHeaderFooterBand,
    ],
  );

  const headerEditing = useMemo(() => edgeEditing('header'), [edgeEditing]);
  const footerEditing = useMemo(() => edgeEditing('footer'), [edgeEditing]);

  const bandEditing = useMemo(
    () => ({
      onMove: moveBandField,
      onEditField: (fieldId: string, text: BiText, side: BandFieldSide) =>
        setBandFieldText(fieldId, side, text),
      onRemoveField: removeBandField,
      onAddField: (bandId: string, zone: ZoneName) =>
        addBandField(bandId, zone, createTextField()),
      // The masthead has one list, so its scope is fixed — the argument is accepted and
      // ignored rather than the handler having a different shape from the other two.
      onAddRow: () => addBand(),
      onRemoveRow: removeBand,
    }),
    [moveBandField, setBandFieldText, removeBandField, addBandField, addBand, removeBand],
  );

  /*
   * Dragging on the page.
   *
   * One call for every case, and now a direct pass-through: with a single document
   * flow there is no home section to resolve and nothing to move "across", so this no
   * longer has to look anything up before delegating.
   */
  const handleReorder = reorderFlowItem;

  /*
   * Move a whole marquee selection in one drag.
   *
   * `movePage` is already exactly this verb — it orders a run of ids relative to an
   * anchor, in one commit, preserving document order among the members. It was written
   * for the page rail, where the run happens to be "a page", but nothing about it is
   * page-specific: a page was only ever a run of ids. So a bulk drag on the page reuses
   * it rather than adding a second way to reorder several things at once.
   *
   * The anchor is wrapped in a one-element array because the rail hands over a whole
   * page and picks an edge from it; with a single target both edges are that target.
   */
  const handleReorderMany = useCallback(
    (ids: string[], targetId: string, position: 'before' | 'after') => {
      movePage(ids, [targetId], position);
    },
    [movePage],
  );

  /*
   * Drop a question onto a page card — the way to reach a page that is off screen.
   * The run (never one id) lands at the end of the target page via `movePage`: one
   * commit, order preserved. A run already ending the page is a no-op, not a commit.
   */
  const handleDropItemsOnPage = useCallback(
    (itemIds: string[], target: PageComposition) => {
      const anchor = dropRunAnchor(itemIds, target);
      if (anchor) movePage(itemIds, [anchor], 'after');
      // A page that has no anchor at all — every id on it is moving, or it is the empty
      // first sheet, which can carry no break because nothing precedes it — is reached
      // by landing the run at the very front of the document instead.
      else if (itemIds.length > 0 && target.index === 0) moveToDocumentStart(itemIds);
    },
    [movePage, moveToDocumentStart],
  );

  // Editing text on the page also selects the question it belongs to, so the sidebar
  // follows along and shows the rest of that question's fields.
  const handleEdit = useCallback(
    (target: EditTarget, next: BiText) => {
      applyEdit(target, next);
      const owner = targetQuestionId(useWorksheetStore.getState().worksheet, target);
      if (owner) select(owner);
    },
    [applyEdit, select],
  );

  // Adding from the empty page: it appends, which is what an empty document wants.
  const handleAddFirstQuestion = useCallback(
    (typeId: string) => addQuestion(typeId),
    [addQuestion],
  );

  // Deleting a layout element from the page. A click knows only the element's own id,
  // which is now all removal needs — this used to have to find the owning section first.
  const handleDeleteLayout = removeLayoutElement;

  // Debounced autosave (§6).
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void worksheetStore.save(worksheet).then(markSaved);
    }, 1200);
    return () => clearTimeout(timer);
  }, [worksheet, dirty, markSaved]);

  /*
   * Print preview is a class on `<body>`, not a prop threaded through the preview.
   *
   * The rules that strip the page down are the *print* rules, written once for both
   * `@media print` and `body.print-preview` (see `globals.css`). Driving it from one
   * class is what guarantees the preview shows what printing produces rather than a
   * second, separately-maintained impression of it — and it means a control added
   * later needs `data-print-hide` exactly once to be correct in both.
   */
  useEffect(() => {
    document.body.classList.toggle('print-preview', printPreview);
    return () => document.body.classList.remove('print-preview');
  }, [printPreview]);

  // Escape leaves the preview — the way out of any full-surface mode.
  useEffect(() => {
    if (!printPreview) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setPrintPreview(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [printPreview, setPrintPreview]);

  // Undo/redo shortcuts (§11.13).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return;
      // While typing, ⌘Z belongs to the text field — it should take back a character,
      // not roll the whole document to its previous commit. Document-level undo
      // applies only when focus is outside an input.
      const active = document.activeElement;
      if (
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLInputElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex h-screen flex-col bg-surface">
      <Toolbar onOpenSettings={() => setSettingsOpen(true)} onOpenFiles={onOpenFiles} />
      {/* Three columns: the add rail (how content gets on the page), the page itself
          (where it is edited), and the sidebar (structure and off-page fields). The
          rail sits on the left because that is where every creative tool puts its
          insert affordance, and because it must never be what gets pushed off-screen
          when the window narrows. */}
      <div className="flex min-h-0 flex-1">
        <AddRail />
        {/* The page rail sits beside the add rail rather than under it: both are
            full-height columns, and stacking them would give each half a screen —
            enough for neither a long insert menu nor a long document. */}
        {pages.length > 1 && (
          <div
            className="relative flex shrink-0 overflow-hidden border-r border-line bg-surface transition-[width] duration-200 ease-in-out"
            style={{ width: pageRailOpen ? 152 : 28 }}
          >
            <div
              className="flex shrink-0 transition-opacity duration-150 ease-in-out"
              style={{
                width: 152,
                minWidth: 152,
                opacity: pageRailOpen ? 1 : 0,
                // The content fades out before the rail finishes narrowing (opacity
                // duration < width duration) so nothing is left snapping into the clip
                // edge — by the time the width animation reaches 28px the content has
                // already disappeared rather than being cut off mid-fade.
                transitionDelay: pageRailOpen ? '50ms' : '0ms',
                pointerEvents: pageRailOpen ? 'auto' : 'none',
              }}
            >
              <PageRail
                pages={pages}
                activeIndex={activePage}
                draggingItemIds={draggingItemIds}
                onDropItemsOnPage={handleDropItemsOnPage}
                onToggle={() => setPageRailOpen(false)}
              />
            </div>
            <div
              className="absolute inset-0 flex items-start justify-center pt-3 transition-opacity duration-150 ease-in-out"
              style={{
                opacity: pageRailOpen ? 0 : 1,
                transitionDelay: pageRailOpen ? '0ms' : '100ms',
                pointerEvents: pageRailOpen ? 'none' : 'auto',
              }}
            >
              <button
                type="button"
                aria-label="Show page rail"
                title="Show page rail"
                onClick={() => setPageRailOpen(true)}
                className="flex cursor-pointer items-center justify-center rounded-lg p-1 text-ink-muted hover:bg-surface-hover hover:text-ink transition-colors"
              >
                <ChevronRightIcon size={14} />
              </button>
            </div>
          </div>
        )}
        {/* `pt-14` rather than `pt-6`: the format toolbar docks inside the top of this
            scroller, and the reserved band is what keeps it off the paper instead of
            floating over the first lines of the document. The space is constant rather
            than appearing with the selection, because growing the padding on click
            would scroll the page under the pointer mid-edit. */}
        <main
          ref={scrollerRef}
          className="scroll-slim min-w-0 flex-1 overflow-auto bg-desk px-6 pb-16 pt-14"
        >
          <Preview
            worksheet={worksheet}
            mode={mode}
            selectedQuestionId={selectedQuestionId}
            onSelectQuestion={select}
            onEdit={handleEdit}
            onDelete={deleteTarget}
            onDeleteQuestion={removeQuestion}
            onDeleteLayout={handleDeleteLayout}
            onBulkDelete={removeMany}
            onBulkDuplicate={duplicateMany}
            onFormat={formatTarget}
            onFormatRuns={handleFormatRuns}
            onInsertBlank={insertBlank}
            formatOf={formatOf}
            textOf={textOf}
            onResizeBlock={resizeBlock}
            onResizeRows={resizeLayoutElement}
            onResizeTableColumn={resizeTableColumn}
            onResizeTableEdge={resizeTableEdge}
            onResizeTableRow={setTableRowHeight}
            onInsertTableRow={insertTableRow}
            onRemoveTableRow={removeTableRow}
            onInsertTableColumn={insertTableColumn}
            onRemoveTableColumn={removeTableColumn}
            onAddCoverInstruction={addCoverInstruction}
            onRemoveCoverLine={removeCoverLine}
            onSplitRows={splitLayoutRows}
            onTrimQuestionAnswerSpace={trimQuestionAnswerSpace}
            onResolveFills={resolveAnswerSpaceFills}
            onOpenBlock={setDrawingBlockId}
            onReorder={handleReorder}
            onReorderMany={handleReorderMany}
            bandEditing={bandEditing}
            headerEditing={headerEditing}
            footerEditing={footerEditing}
            onAddQuestion={handleAddFirstQuestion}
            // `setPages` is referentially stable, which the preview's publish effect
            // depends on — a fresh closure each render would re-notify forever.
            onPagesChange={setPages}
            onDragItemChange={setDraggingItemIds}
          />
        </main>
        <Sidebar pages={pages} onOpenSettings={() => setSettingsOpen(true)} />
      </div>

      {settingsOpen && <DocumentSettings onClose={() => setSettingsOpen(false)} />}

      {/* The how-to-edit hint. It was a grey line of text pinned above the page, which
          pushed the document down and read as a disclaimer. As a floating pill it sits
          out of the document's way and can be dismissed once it has been learned —
          a permanent instruction is a sign the interface failed to be obvious. */}
      <HintPill />

      {/* The drawing canvas, opened by double-clicking a diagram on the page.
          Rendered here rather than inside the sidebar's DiagramEditor because that panel
          only exists while its question is open — a diagram reached from the page has no
          panel mounted to host it. Edits commit through `replaceBlock`, which addresses
          the block by id and so needs no knowledge of which question owns it.
          `drawingBlock` is looked up fresh each render, so closing and reopening never
          resurrects stale geometry, and a block deleted while open simply unmounts. */}
      {drawingBlock && (
        <DiagramCanvas
          block={drawingBlock}
          onChange={(next) => replaceBlock(next.id, next)}
          onClose={() => setDrawingBlockId(undefined)}
        />
      )}
    </div>
  );
}

function HintPill() {
  const [dismissed, setDismissed] = useState(false);
  const printPreview = useWorksheetStore((s) => s.printPreview);

  // It retires itself. A how-to-edit hint is only useful until it has been read once,
  // and a permanent instruction strip is a standing admission that the interface is
  // not self-evident — so it fades after a few seconds rather than living on the
  // canvas forever. Dismissing early does the same thing sooner.
  useEffect(() => {
    const timer = setTimeout(() => setDismissed(true), 9000);
    return () => clearTimeout(timer);
  }, []);

  // Not in print preview: it teaches an interaction that mode deliberately removes, so
  // it would be instructing the teacher to do something the page no longer allows.
  if (dismissed || printPreview) return null;
  return (
    // `data-print-hide` so anything that strips page chrome (print CSS, the screenshot
    // harness) drops the pill — it floats over the sheet, so a capture of the page
    // otherwise carries it.
    <div
      data-print-hide
      className="pointer-events-none fixed bottom-4 left-[76px] right-[400px] z-20 flex justify-center"
    >
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line bg-surface-raised/95 py-1.5 pl-4 pr-1.5 text-[12px] text-ink-muted shadow-lg backdrop-blur">
        <span>
          Click text to select · double-click to edit
          <span className="ml-2 text-ink-subtle">按頁面文字即可編輯</span>
        </span>
        <IconButton label="Dismiss hint" onClick={() => setDismissed(true)}>
          <CloseIcon size={14} />
        </IconButton>
      </div>
    </div>
  );
}
