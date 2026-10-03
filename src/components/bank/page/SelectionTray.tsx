'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/components/ui';
import { marksLabel, sourceLabel, typeLabel } from '@/components/bank/BankRow';
import type { BankRow } from '@/library/types';
import { useMessages } from '@/i18n/language';
import { cartTopicLabel, cartTotals, isSortedByType, readCartOpen, sortLabel, stepTarget, typeSplitLabel, writeCartOpen } from './bankCart';
import { mixLabel, rowKey, traySummary, type BankTarget, type NewTargetType } from './bankPage';
import { BANK_PAGE_MESSAGES } from './bankPage.messages';
import { SELECTION_TRAY_MESSAGES } from './SelectionTray.messages';

/** A drag in flight: local until release, when the store is written once. */
interface Drag {
  key: string;
  pointerId: number;
  startY: number;
  /** Past the threshold: a press that never moves is not a drag. */
  moving: boolean;
  /** The gap the row would drop into: 0 before the first row … n after the last. */
  gap: number;
  /** Where the line is drawn, relative to the list. */
  lineTop: number;
  /** The list's scroll position, pinned: WebKit scrolls a captured pointer's container on its own. */
  scroll: number;
}

type Control = 'handle' | 'up' | 'down' | 'remove';

const NEW_FROM = { classroom: 'newWorksheet', paper1: 'newPaper1', lqMock: 'newPaper2' } as const satisfies Record<NewTargetType, string>;

/**
 * The cart: what is picked, in the order it will print, and what to do with it. The bar
 * sums it up (count, marks, MCQ/LQ split, minutes) and holds the actions; the list above
 * it names each pick (excerpt, topic, type, marks, where it lives) and reorders them by
 * drag, the ↑ ↓ buttons or Alt+↑ ↓. One filled button, as the "Adding to" picker sets
 * it: Add to “Mock”, or New worksheet / Paper 1 / Paper 2 from these.
 */
export function SelectionTray({
  rows,
  target,
  busy,
  canUndo,
  onRemove,
  onMove,
  onSortByType,
  onClear,
  onUndo,
  onDismiss,
  onSetTopic,
  onAdd,
}: {
  /** The picks, in cart order. */
  rows: readonly BankRow[];
  /** Where the one action puts them (the "Adding to" picker): a saved paper, or a new document. */
  target: BankTarget;
  busy: boolean;
  /** The list was just emptied here and can come back. */
  canUndo: boolean;
  onRemove: (key: string) => void;
  /** Move the pick to sit before `beforeKey`, or to the end. */
  onMove: (key: string, beforeKey?: string) => void;
  onSortByType: () => void;
  onClear: () => void;
  onUndo: () => void;
  /** Closing an emptied tray: the Undo is forgotten. */
  onDismiss: () => void;
  onSetTopic: () => void;
  onAdd: () => void;
}) {
  const m = useMessages(SELECTION_TRAY_MESSAGES);
  const w = useMessages(BANK_PAGE_MESSAGES);
  const [open, setOpenState] = useState(readCartOpen);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    writeCartOpen(next);
  };
  const totals = cartTotals(rows);
  const split = typeSplitLabel(totals);
  const mix = mixLabel(traySummary(rows).mix);
  const empty = rows.length === 0;
  const keys = rows.map(rowKey);
  const sorted = isSortedByType(rows.map((row) => row.typeId));
  const listRef = useRef<HTMLOListElement>(null);
  const [drag, setDragState] = useState<Drag>();
  // Pointer events read the drag as it is now, not as the last render saw it.
  const dragRef = useRef<Drag | undefined>(undefined);
  const setDrag = (next: Drag | undefined) => {
    dragRef.current = next;
    setDragState(next);
  };
  // Keyboard moves and removals put focus back on the same control of the row it lands on.
  const refocus = useRef<{ key?: string; control: Control } | undefined>(undefined);

  useLayoutEffect(() => {
    const want = refocus.current;
    if (!want) return;
    refocus.current = undefined;
    const list = listRef.current;
    if (!list) return;
    const row = want.key ? rowNode(list, want.key) : undefined;
    const target = row?.querySelector<HTMLElement>(`[data-cart-control="${want.control}"]:not(:disabled)`) ?? row?.querySelector<HTMLElement>('[data-cart-control="handle"]');
    (target ?? list.closest<HTMLElement>('[data-cart-panel]')?.querySelector<HTMLElement>('[data-cart-heading]'))?.focus();
  });

  // The emptied tray, closed: nothing to undo any more.
  useEffect(() => () => onDismiss(), [onDismiss]);

  // Esc during a drag cancels it, before the screen's own Esc (a window listener) goes up a level.
  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setDrag(undefined);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [drag]);

  const move = (key: string, delta: -1 | 1, control: Control) => {
    const before = stepTarget(keys, key, delta);
    if (before === null) return;
    refocus.current = { key, control };
    onMove(key, before);
  };
  const remove = (key: string, control: Control) => {
    const at = keys.indexOf(key);
    refocus.current = { key: keys[at + 1] ?? keys[at - 1], control };
    onRemove(key);
  };

  const onRowKey = (event: ReactKeyboardEvent<HTMLLIElement>, key: string) => {
    const control = ((event.target as HTMLElement).closest('[data-cart-control]')?.getAttribute('data-cart-control') ?? 'handle') as Control;
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      move(key, event.key === 'ArrowUp' ? -1 : 1, control);
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      // Between rows, not the review page's ↑ ↓ (the screen's listener stands down on a handled key).
      event.preventDefault();
      const next = keys[keys.indexOf(key) + (event.key === 'ArrowUp' ? -1 : 1)];
      const node = next && listRef.current ? rowNode(listRef.current, next) : undefined;
      (node?.querySelector<HTMLElement>(`[data-cart-control="${control}"]:not(:disabled)`) ?? node?.querySelector<HTMLElement>('[data-cart-control="handle"]'))?.focus();
      return;
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(key, control);
    }
  };

  /* Drag: pointer capture on the handle; the gap is re-read on each move; one write on release. */
  const rowRects = () => [...(listRef.current?.querySelectorAll<HTMLElement>('[data-cart-key]') ?? [])].map((node) => node.getBoundingClientRect());
  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>, key: string) => {
    if (event.button !== 0 || busy) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = keys.indexOf(key);
    setDrag({ key, pointerId: event.pointerId, startY: event.clientY, moving: false, gap: at, lineTop: 0, scroll: listRef.current?.scrollTop ?? 0 });
  };
  const onHandleMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    const list = listRef.current;
    if (!current || !list || event.pointerId !== current.pointerId) return;
    if (!current.moving && Math.abs(event.clientY - current.startY) < 4) return;
    // Pinned, except near an edge, where the list scrolls a step toward the pointer.
    const box = list.getBoundingClientRect();
    let scroll = current.scroll;
    if (event.clientY < box.top + 20) scroll = Math.max(0, scroll - 8);
    else if (event.clientY > box.bottom - 20) scroll = Math.min(list.scrollHeight - list.clientHeight, scroll + 8);
    list.scrollTop = scroll;
    const rects = rowRects();
    let gap = rects.findIndex((rect) => event.clientY < rect.top + rect.height / 2);
    if (gap < 0) gap = rects.length;
    const edge = gap < rects.length ? rects[gap].top : (rects[rects.length - 1]?.bottom ?? box.top);
    setDrag({ ...current, moving: true, gap, lineTop: edge - box.top + list.scrollTop, scroll });
  };
  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) return;
    setDrag(undefined);
    if (!current.moving) return;
    const at = keys.indexOf(current.key);
    // Dropping into the gap on either side of itself leaves it where it was.
    if (current.gap === at || current.gap === at + 1) return;
    onMove(current.key, keys[current.gap]);
  };

  const summaryText = empty ? m.isEmpty : undefined;

  return (
    <div
      role="region"
      aria-label={m.yourList}
      data-cart-panel
      className="flex shrink-0 animate-slide-up-in flex-col border-t border-line-strong bg-surface"
    >
      {open && (
        <div className="border-b border-line">
          <div className="flex items-center gap-3 px-4 pb-1 pt-2">
            <h2 data-cart-heading tabIndex={-1} className="min-w-0 flex-1 truncate text-[11.5px] text-ink-subtle outline-none">
              <span className="font-semibold uppercase tracking-[0.08em]">{m.yourList}</span>
              {!empty && <span>{m.orderHint}</span>}
            </h2>
            {!empty && (
              <Button
                variant="subtle"
                size="sm"
                onClick={onSortByType}
                disabled={busy || sorted}
                title={sorted ? m.sortedTitle : m.sortTitle}
              >
                {sortLabel()}
              </Button>
            )}
          </div>
          {empty ? (
            <p className="px-4 pb-3 pt-1 text-[12.5px] leading-relaxed text-ink-muted">
              {m.emptyHint}
            </p>
          ) : (
            <ol
              ref={listRef}
              aria-label={m.listLabel}
              className="scroll-slim relative max-h-[min(34vh,320px)] overflow-y-auto pb-1.5"
            >
              {rows.map((row, index) => {
                const key = keys[index];
                const excerpt = row.excerpt.en || row.excerpt.zh || m.untitled;
                const topic = cartTopicLabel(row.tags);
                const meta = [topic ?? w.noTopic, typeLabel(row.typeId), marksLabel(row.marks), sourceLabel(row)].join(' · ');
                const dragging = drag?.moving && drag.key === key;
                return (
                  <li
                    key={key}
                    data-cart-key={key}
                    onKeyDown={(event) => onRowKey(event, key)}
                    className={`grid grid-cols-[22px_20px_minmax(0,1fr)_auto] items-center gap-x-1.5 px-3 py-1 transition-colors duration-100 ${
                      dragging ? 'bg-surface-sunken opacity-60' : 'hover:bg-surface-hover'
                    }`}
                  >
                    <button
                      type="button"
                      data-cart-control="handle"
                      aria-label={m.handleLabel(index + 1)}
                      title={m.handleTitle}
                      onPointerDown={(event) => onHandleDown(event, key)}
                      onPointerMove={onHandleMove}
                      onPointerUp={onHandleUp}
                      onPointerCancel={() => setDrag(undefined)}
                      className="grid h-7 w-[22px] cursor-grab touch-none place-items-center rounded-md text-ink-subtle transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent active:cursor-grabbing"
                    >
                      <GripGlyph />
                    </button>
                    <span className="text-right text-[12px] tabular-nums text-ink-subtle">{index + 1}</span>
                    <div className="min-w-0 py-0.5">
                      <p className="truncate text-[12.5px] leading-[1.4] text-ink" title={excerpt}>
                        {excerpt}
                      </p>
                      <p className="truncate text-[11px] tabular-nums text-ink-subtle" title={meta}>
                        {meta}
                      </p>
                    </div>
                    <span className="flex items-center">
                      <RowButton control="up" label={m.moveUp(index + 1)} disabled={busy || index === 0} onClick={() => move(key, -1, 'up')}>
                        ↑
                      </RowButton>
                      <RowButton
                        control="down"
                        label={m.moveDown(index + 1)}
                        disabled={busy || index === rows.length - 1}
                        onClick={() => move(key, 1, 'down')}
                      >
                        ↓
                      </RowButton>
                      <RowButton control="remove" label={m.takeOff(index + 1)} disabled={busy} onClick={() => remove(key, 'remove')}>
                        ×
                      </RowButton>
                    </span>
                  </li>
                );
              })}
              {drag?.moving && (
                <li aria-hidden className="pointer-events-none absolute inset-x-3 h-0.5 -translate-y-px rounded-full bg-accent" style={{ top: drag.lineTop }} />
              )}
            </ol>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[12.5px] tabular-nums text-ink" title={mix ? m.topicsTitle(mix) : undefined} aria-live="polite">
          {summaryText ? (
            <span className="text-ink-muted">{summaryText}</span>
          ) : (
            <>
              <b className="font-semibold">
                {w.questions(totals.count)}
              </b>
              <span className="text-ink-muted">
                {' · '}
                {marksLabel(totals.marks)}
                {split && ` · ${split}`} · {m.minutes(totals.minutes)}
              </span>
            </>
          )}
        </p>
        {empty ? (
          <>
            {canUndo && (
              <Button variant="subtle" size="sm" onClick={onUndo}>
                {m.undo}
              </Button>
            )}
            <Button variant="subtle" size="sm" onClick={onDismiss}>
              {m.close}
            </Button>
          </>
        ) : (
          <>
            <Button variant="subtle" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? m.hide : m.show}
            </Button>
            <Button variant="subtle" size="sm" onClick={onClear} disabled={busy} title={m.clearTitle}>
              {m.clear}
            </Button>
          </>
        )}
        <Button size="sm" onClick={onSetTopic} disabled={busy || empty}>
          {m.setTopic}
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={onAdd}
          disabled={busy || empty}
          title={target.kind === 'paper' ? m.addToTitle(target.summary.title) : undefined}
          className="max-w-[260px]"
        >
          <span className="truncate">
            {target.kind === 'paper' ? m.addTo(target.summary.title) : m[NEW_FROM[target.documentType]]}
          </span>
        </Button>
      </div>
    </div>
  );
}

/** A row by its key; keys hold a NUL separator, which no attribute selector can spell. */
function rowNode(list: HTMLElement, key: string): HTMLElement | undefined {
  return [...list.querySelectorAll<HTMLElement>('[data-cart-key]')].find((node) => node.dataset.cartKey === key);
}

function RowButton({
  control,
  label,
  disabled,
  onClick,
  children,
}: {
  control: Control;
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      data-cart-control={control}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded-md text-[13px] leading-none text-ink-muted transition-colors duration-150 hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-default disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function GripGlyph() {
  return (
    <svg aria-hidden focusable="false" width={10} height={14} viewBox="0 0 10 14" fill="currentColor">
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="7" cy="3" r="1.2" />
      <circle cx="3" cy="7" r="1.2" />
      <circle cx="7" cy="7" r="1.2" />
      <circle cx="3" cy="11" r="1.2" />
      <circle cx="7" cy="11" r="1.2" />
    </svg>
  );
}
