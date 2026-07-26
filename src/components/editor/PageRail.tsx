'use client';

import { useEffect, useRef, useState } from 'react';
import type { PageComposition } from '@/components/preview/Preview';
import { pageDimensions, pageSetupOf } from '@/model/page';
import { useWorksheetStore } from '@/store/worksheetStore';
import { TrashIcon } from '@/components/ui/icons';
import { useModalLayer } from '@/components/ui/modalLayer';

/**
 * The page rail — a scrolling column of sheets under the add rail.
 *
 * A long worksheet is navigated by *page*, not by question: a teacher checking that
 * Part B starts on a fresh sheet is looking for a place in the printed artifact, and
 * the outline in the right sidebar cannot answer that because it lists questions
 * without knowing where any of them lands. This is the only view of the document that
 * is organised the way the output is.
 *
 * **Pages are derived, not stored.** There is no `Page` in the model — a page is
 * whatever the paginator measured onto one sheet (§preview), and it is reported here
 * through `onPagesChange`. So every action has to be expressed in terms the store
 * understands, which is flow ids:
 *
 * - *navigate* scrolls to the sheet, touching no state at all;
 * - *delete* is `removeMany` over the page's flow ids, in one commit;
 * - *reorder* is `movePage`, which moves that run and pins the seams with page breaks
 *   so the repagination that immediately follows cannot reflow the pages back
 *   together.
 *
 * The card is a **proportioned sketch, not a live thumbnail**. A true thumbnail would
 * mean rendering every page a third time (the paginator's hidden probe is already the
 * second), and at 96px wide the text would be illegible anyway. Bars standing in for
 * blocks answer the question the rail is actually asked — how full is this page, and
 * which one is the short one — at a fraction of the cost.
 */

/**
 * The rail's own width, and the card's within it.
 *
 * Kept as arithmetic rather than two independent numbers because they have to agree:
 * a card wider than the rail minus its padding is silently clipped, which reads as a
 * rendering bug rather than as a layout choice.
 */
const RAIL_WIDTH_PX = 104;
const RAIL_PADDING_PX = 8;
const CARD_WIDTH_PX = RAIL_WIDTH_PX - RAIL_PADDING_PX * 2 - 8; // Leaves room for the scrollbar.

export function PageRail({
  pages,
  activeIndex,
  draggingItemId,
  onDropItemOnPage,
}: {
  pages: PageComposition[];
  /** The page currently scrolled into view, highlighted in the rail. */
  activeIndex: number;
  /**
   * The flow item currently being dragged on the page, if any. While this is set the
   * cards act as drop targets for *it* rather than as draggable pages.
   */
  draggingItemId?: string;
  /** Send that item to the end of the given page. */
  onDropItemOnPage?: (itemId: string, page: PageComposition) => void;
}) {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const removeMany = useWorksheetStore((s) => s.removeMany);
  const movePage = useWorksheetStore((s) => s.movePage);

  const [dragIndex, setDragIndex] = useState<number | undefined>();
  const [dropEdge, setDropEdge] = useState<
    { index: number; position: 'before' | 'after' } | undefined
  >();
  // The card a dragged *question* is hovering over. Kept apart from `dropEdge`, which
  // means "insert the page here": dropping an item onto a card puts it on that page
  // rather than between two of them, so the two gestures need different feedback.
  const [itemOverIndex, setItemOverIndex] = useState<number | undefined>();

  // A question being dragged makes the rail a set of destinations rather than a set of
  // draggable pages — a question cannot be dropped *between* pages, only onto one.
  const receivingItem = Boolean(draggingItemId);
  // The page awaiting delete confirmation. Held by index because that is what the
  // dialog names ("Delete page 3?"); the ids are read at confirm time.
  const [confirming, setConfirming] = useState<number | undefined>();

  // Only the ratio matters, so the raw twips serve — and the card follows a paper or
  // orientation change for free, which a hard-coded A4 aspect would not.
  const { width, height } = pageDimensions(pageSetupOf(worksheet));
  const cardHeight = Math.round((CARD_WIDTH_PX * height) / width);

  // Scroll the real sheet into view. The preview owns the scroll container, so this
  // reaches for the sheet by its published index rather than trying to compute an
  // offset from page height — zoom, margins and the desk padding all affect that, and
  // the browser already knows how to do it correctly.
  const goToPage = (index: number) => {
    document
      .querySelector(`#print-root [data-page-index="${index}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const confirmTarget = confirming !== undefined ? pages[confirming] : undefined;

  return (
    <>
      <div
        className="flex shrink-0 flex-col border-r border-line bg-surface"
        style={{ width: RAIL_WIDTH_PX }}
        aria-label="Pages"
      >
        <p className="px-2 pb-1.5 pt-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.09em] text-ink-subtle">
          Pages
        </p>
        <div
          className="scroll-slim min-h-0 flex-1 overflow-y-auto pb-3"
          style={{ paddingLeft: RAIL_PADDING_PX, paddingRight: RAIL_PADDING_PX }}
        >
          <ol className="flex flex-col items-center gap-2.5">
            {pages.map((page, index) => {
              const isActive = index === activeIndex;
              const isDragging = dragIndex === index;
              const edge = dropEdge?.index === index ? dropEdge.position : undefined;

              return (
                <li key={index} className="relative">
                  {/* The drop indicator sits on the edge the pointer is nearest, the
                      same rule the page's own drag follows. */}
                  {edge && (
                    <span
                      aria-hidden
                      className={`absolute left-0 right-0 z-10 h-0.5 rounded-full bg-accent ${
                        edge === 'before' ? '-top-1' : '-bottom-1'
                      }`}
                    />
                  )}
                  <button
                    type="button"
                    draggable={
                      pages.length > 1 && !page.structuralOnly && !receivingItem
                    }
                    aria-current={isActive}
                    aria-label={`Page ${index + 1}${isActive ? ', current' : ''}`}
                    onClick={() => goToPage(index)}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      setDragIndex(index);
                    }}
                    onDragEnd={() => {
                      setDragIndex(undefined);
                      setDropEdge(undefined);
                    }}
                    onDragOver={(event) => {
                      // A question dragged in from the page: the whole card is one
                      // target, so there is no edge to pick.
                      if (receivingItem) {
                        if (page.structuralOnly) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                        setItemOverIndex(index);
                        return;
                      }
                      if (dragIndex === undefined || dragIndex === index) return;
                      event.preventDefault();
                      const bounds = event.currentTarget.getBoundingClientRect();
                      setDropEdge({
                        index,
                        position:
                          event.clientY < bounds.top + bounds.height / 2
                            ? 'before'
                            : 'after',
                      });
                    }}
                    onDragLeave={() => {
                      setDropEdge(undefined);
                      setItemOverIndex(undefined);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (receivingItem) {
                        setItemOverIndex(undefined);
                        if (draggingItemId && !page.structuralOnly) {
                          onDropItemOnPage?.(draggingItemId, page);
                        }
                        return;
                      }
                      const from = dragIndex;
                      const position = dropEdge?.position ?? 'before';
                      setDragIndex(undefined);
                      setDropEdge(undefined);
                      if (from === undefined || from === index) return;
                      const source = pages[from];
                      const target = pages[index];
                      if (!source || !target) return;
                      movePage(source.flowIds, target.flowIds, position);
                    }}
                    className={`group/page relative block cursor-pointer rounded-[3px] border bg-white transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                      itemOverIndex === index
                        ? // The card the question would land on, called out clearly:
                          // the drop is invisible otherwise, since the rail shows a
                          // sketch rather than the item itself.
                          'border-accent ring-2 ring-accent'
                        : isActive
                          ? 'border-accent shadow-[0_0_0_2px_var(--color-accent-soft)]'
                          : 'border-line hover:border-ink-subtle'
                    } ${isDragging ? 'opacity-40' : ''} ${
                      receivingItem && !page.structuralOnly ? 'cursor-copy' : ''
                    }`}
                    style={{ width: CARD_WIDTH_PX, height: cardHeight }}
                  >
                    <PageSketch page={page} />

                    {/* Deleting is destructive and permanent-feeling, so it stays
                        hidden until the page is hovered — the rail's resting state is
                        for navigating, not for editing. */}
                    {!page.structuralOnly && (
                      <span
                        role="button"
                        tabIndex={-1}
                        aria-label={`Delete page ${index + 1}`}
                        title={`Delete page ${index + 1}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setConfirming(index);
                        }}
                        className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-md bg-surface-raised/90 text-ink-subtle opacity-0 shadow-sm transition-all duration-150 hover:bg-danger-soft hover:text-danger group-hover/page:opacity-100"
                      >
                        <TrashIcon size={11} />
                      </span>
                    )}
                  </button>
                  {/* The number sits under the card rather than on it: printed on the
                      sketch it would read as page content, which is the one thing the
                      sketch is trying to represent. */}
                  <span
                    className={`mt-1 block text-center text-[10px] leading-none tabular-nums ${
                      isActive ? 'font-semibold text-ink' : 'text-ink-subtle'
                    }`}
                  >
                    {index + 1}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {confirmTarget && (
        <ConfirmDelete
          pageNumber={confirming! + 1}
          itemCount={confirmTarget.flowIds.length}
          onCancel={() => setConfirming(undefined)}
          onConfirm={() => {
            removeMany(confirmTarget.flowIds);
            setConfirming(undefined);
          }}
        />
      )}
    </>
  );
}

/**
 * A page's contents as proportional bars.
 *
 * Each flow item becomes one bar, so the sketch shows how full a sheet is and where
 * its content sits — enough to tell page 4 from page 5 at a glance, which is all the
 * rail is asked for. Widths are varied deterministically from the id so the sketch
 * looks like text rather than a bar chart, and stays *stable* across re-renders: a
 * sketch that reshuffled on every keystroke would read as the page changing.
 */
function PageSketch({ page }: { page: PageComposition }) {
  if (page.structuralOnly) {
    return (
      <span className="flex h-full w-full flex-col gap-[3px] p-1.5">
        <span className="h-1 w-2/3 self-center rounded-full bg-ink-subtle/40" />
        <span className="h-[3px] w-1/2 self-center rounded-full bg-ink-subtle/25" />
      </span>
    );
  }

  return (
    <span className="flex h-full w-full flex-col gap-[3px] overflow-hidden p-1.5">
      {page.flowIds.slice(0, 14).map((id) => {
        // A cheap stable hash of the id — same id, same width, every render.
        let hash = 0;
        for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0;
        const width = 55 + (Math.abs(hash) % 45);
        return (
          <span
            key={id}
            className="h-[3px] shrink-0 rounded-full bg-ink-subtle/30"
            style={{ width: `${width}%` }}
          />
        );
      })}
    </span>
  );
}

/**
 * Confirmation for deleting a page.
 *
 * Deleting a page takes everything on it — this is the one action in the rail that
 * destroys content the teacher cannot see at the time they click, since the card is a
 * sketch. So it names the count, and the confirm button carries the destructive
 * weight rather than the dialog as a whole (§weight matches consequence).
 *
 * It is undoable like every other commit, which is why this is a confirmation rather
 * than a two-step gesture — but "you can undo it" is not a reason to make destroying
 * a page as easy as navigating to one.
 */
function ConfirmDelete({
  pageNumber,
  itemCount,
  onCancel,
  onConfirm,
}: {
  pageNumber: number;
  itemCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // A real modal: it claims the keyboard so Delete cannot reach the page underneath and
  // remove a selected question while the teacher is answering "delete this page?".
  useModalLayer();

  // Escape cancels and the confirm button takes focus, so the dialog is dismissable
  // and operable without the mouse that opened it.
  useEffect(() => {
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal
        aria-labelledby="delete-page-title"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-[340px] rounded-2xl border border-line bg-surface-raised p-5 shadow-2xl"
      >
        <h2 id="delete-page-title" className="text-[15px] font-semibold text-ink">
          Delete page {pageNumber}?
        </h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          {itemCount === 1
            ? 'The one item on this page will be removed.'
            : `All ${itemCount} items on this page will be removed.`}{' '}
          <span className="text-ink-subtle">此頁的所有內容將被刪除。</span>
        </p>
        <p className="mt-1 text-[12px] text-ink-subtle">You can undo this with ⌘Z.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="cursor-pointer rounded-lg bg-danger px-3 py-1.5 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Delete page
          </button>
        </div>
      </div>
    </div>
  );
}
