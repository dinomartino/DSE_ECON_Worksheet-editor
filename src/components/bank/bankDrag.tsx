'use client';

import {
  useEffect,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { DRAG_THRESHOLD_PX } from '@/components/start/dashboardDrag';
import { DragChip } from '@/components/ui/DragGhost';
import { useModalLayer } from '@/components/ui/modalLayer';
import { gestureKey } from '@/components/ui/undoChord';
import { useMessages } from '@/i18n/language';
import type { BankRow } from '@/library/types';
import { flowOf } from '@/model/flow';
import { copyQuestion } from '@/model/lineage';
import type { Question, Worksheet } from '@/model/types';
import { lastQuestionGap, useWorksheetStore } from '@/store/worksheetStore';
import type { WorksheetStore } from '@/storage';
import { commitBankCopies, loadBankCopies, type InsertReport, type LoadedCopies } from './bankSession';
import { BANK_REVIEW_MESSAGES } from './messages';
import { pickSlot, type SlotBox, type SlotGeometry } from './dropSlot';

/**
 * Drag a question from the 題庫 tab onto the page. While it is in hand the page shows the
 * result (the question in place, faded; the rest renumbered and re-paginated); release
 * commits once through `commitBankCopies` (one ⌘Z), Esc or a release off the page puts
 * the page back as it was. Nothing reaches the worksheet store until the drop, and
 * undo/redo stand down until then (`isBankDragActive`): the page is showing a document
 * the store does not hold.
 *
 * Pointer events, captured once the press becomes a drag (as `useDocumentDrag`): the
 * desktop webview never delivers HTML5 `dragover`. The pointer's position lives in the
 * session below and is read once per frame; this store changes only when the drag
 * starts, ends, its question is read, or the slot changes, so the page re-paginates per
 * slot, never per pointer frame.
 */

export interface BankDragState {
  /** The drag in progress: which row, and the chip's words. */
  active: { key: string; label: string; x: number; y: number } | null;
  /** The provisional copy, once its source document is read. Never stored. */
  ghost: Question | null;
  /** The flow gap it would land in (`dropSlot.ts`); `null` = off the page. */
  slot: number | null;
}

const IDLE: BankDragState = { active: null, ghost: null, slot: null };

export const useBankDrag: UseBoundStore<StoreApi<BankDragState>> = create<BankDragState>(() => IDLE);

/** Presses here never start a drag: anything typed into or chosen from. */
const IGNORE = 'input, textarea, select, [data-drag-ignore]';
/** After a slot change the page re-paginates; hold the slot until it has settled. */
const SETTLE_MS = 120;
/** Auto-scroll: the band at the scroller's top and bottom edge, and its top speed. */
const HOT_ZONE_PX = 96;
const MAX_SPEED_PX = 22;
/** How far either side of the sheet column still counts as over the page. */
const COLUMN_SLACK_PX = 56;
const CHIP_OFFSET = { x: 12, y: 10 };

interface Session {
  key: string;
  row: BankRow;
  el: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  phase: 'pressed' | 'dragging';
  frame: number;
  loaded?: LoadedCopies;
  loading?: Promise<LoadedCopies>;
  slot: number | null;
  settleUntil: number;
  onReport?: (report: InsertReport) => void;
  source?: Pick<WorksheetStore, 'load'>;
  /** The row's scrolling ancestors, held for the drag (`holdScrollers`). */
  hold?: ScrollHold;
}

let session: Session | null = null;
let chip: HTMLElement | null = null;
let swallowClick = false;

/**
 * While a press is held, no text selection starts: WebKit otherwise sweeps a selection
 * across the sidebar and the page as the pointer travels, `user-select: none` or not.
 */
const blockSelection = (event: Event) => event.preventDefault();
function holdSelection(on: boolean) {
  if (typeof document === 'undefined' || !document.addEventListener) return;
  if (on) document.addEventListener('selectstart', blockSelection, true);
  else document.removeEventListener('selectstart', blockSelection, true);
}

/**
 * WebKit (Safari, the Mac app) autoscrolls the scroll container a press started in toward
 * the pointer, for as long as the button is held: dragging a row out to the page ran the
 * 題庫 list to its top or its end, and it stayed there. So from the drag's start until the
 * button is up, the row's scrolling ancestors are held where they were: put back on every
 * scroll event and every drag frame (before paint). The page's own scroller is never one of
 * them; the drag scrolls it on purpose.
 */
export interface ScrollHold {
  /** Put every held scroller back where it was. */
  restore(): void;
  /** Stop holding: now, or once the button is up (Esc ends a drag with it still down). */
  release(buttonUp: boolean): void;
}

export function holdScrollers(from: HTMLElement): ScrollHold {
  const none: ScrollHold = { restore: () => undefined, release: () => undefined };
  if (typeof document === 'undefined' || !document.addEventListener) return none;
  const page = document.getElementById('print-root');
  const held: Array<{ el: HTMLElement; top: number; left: number }> = [];
  for (let el = from.parentElement; el && el !== document.body; el = el.parentElement) {
    if (page && el.contains(page)) break;
    if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
      held.push({ el, top: el.scrollTop, left: el.scrollLeft });
    }
  }
  if (held.length === 0) return none;
  const restore = (only?: EventTarget | null) => {
    for (const { el, top, left } of held) {
      if (only && only !== el) continue;
      if (el.scrollTop !== top) el.scrollTop = top;
      if (el.scrollLeft !== left) el.scrollLeft = left;
    }
  };
  // Scroll events do not bubble; a capturing listener on the document sees every element's.
  const onScroll = (event: Event) => restore(event.target);
  document.addEventListener('scroll', onScroll, true);
  let released = false;
  const stop = () => {
    if (released) return;
    released = true;
    document.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('pointerup', stop, true);
    window.removeEventListener('pointercancel', stop, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('blur', stop);
    restore();
  };
  const onMove = (event: PointerEvent) => {
    if ((event.buttons & 1) === 0) stop();
  };
  return {
    restore: () => restore(),
    release: (buttonUp) => {
      if (buttonUp) return stop();
      restore();
      window.addEventListener('pointerup', stop, true);
      window.addEventListener('pointercancel', stop, true);
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('blur', stop);
    },
  };
}

/** The press is over (a click, or the end of a drag). */
function endPress() {
  session = null;
  holdSelection(false);
}
let flowCache: { worksheet: Worksheet; index: Map<string, number>; maxSlot: number } | undefined;

function flowIndex(worksheet: Worksheet) {
  if (flowCache?.worksheet !== worksheet) {
    flowCache = {
      worksheet,
      index: new Map(flowOf(worksheet).map((entry, index) => [entry.id, index])),
      maxSlot: lastQuestionGap(worksheet),
    };
  }
  return flowCache;
}

const contains = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

/**
 * The page under the pointer, read off the visible sheets. Scoped to `#print-root`: the
 * pagination probe renders every item a second time.
 */
function measureGeometry(x: number, y: number, ghostId: string | undefined, index: Map<string, number>): {
  geometry: SlotGeometry;
  y: number;
} {
  const none = { geometry: { onPage: false, items: [], ghost: [] }, y };
  const root = document.getElementById('print-root');
  const scroller = root?.closest('main');
  if (!root || !scroller) return none;
  const view = scroller.getBoundingClientRect();
  const column = root.getBoundingClientRect();
  const overColumn =
    x >= Math.max(view.left, column.left - COLUMN_SLACK_PX) && x <= Math.min(view.right, column.right + COLUMN_SLACK_PX);
  if (!overColumn) return none;
  // Above or below the scroller (auto-scrolling) reads as its edge.
  const at = Math.max(view.top, Math.min(view.bottom, y));
  const cover = root.querySelector('[data-cover-page]')?.getBoundingClientRect();
  if (cover && at >= cover.top && at <= cover.bottom) return { ...none, y: at };

  const items: SlotBox[] = [];
  const ghost: Array<{ top: number; bottom: number }> = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-flow-id]')) {
    const id = el.dataset.flowId!;
    const rect = el.getBoundingClientRect();
    if (id === ghostId) ghost.push({ top: rect.top, bottom: rect.bottom });
    else if (index.has(id)) items.push({ index: index.get(id)!, top: rect.top, bottom: rect.bottom });
  }
  // A page a break opened and nothing has landed on: its box names the break.
  for (const el of root.querySelectorAll<HTMLElement>('[data-layout-id]')) {
    const id = el.dataset.layoutId!;
    if (el.closest('[data-flow-id]') || !index.has(id)) continue;
    const rect = el.getBoundingClientRect();
    items.push({ index: index.get(id)!, top: rect.top, bottom: rect.bottom, blank: true });
  }
  const overBand = Array.from(root.querySelectorAll('[data-band-box]')).some((band) =>
    contains(band.getBoundingClientRect(), Math.min(Math.max(x, column.left), column.right), at),
  );
  return { geometry: { onPage: true, overBand, items, ghost }, y: at };
}

function placeChip(x: number, y: number) {
  if (chip) chip.style.transform = `translate(${x + CHIP_OFFSET.x}px, ${y + CHIP_OFFSET.y}px)`;
}

/** One frame of an active drag: scroll near an edge, move the chip, re-aim the slot. */
function tick() {
  const s = session;
  if (!s || s.phase !== 'dragging') return;
  const scroller = document.getElementById('print-root')?.closest('main');
  if (scroller) {
    const view = scroller.getBoundingClientRect();
    if (s.x >= view.left && s.x <= view.right) {
      const fromTop = s.y - view.top;
      const fromBottom = view.bottom - s.y;
      const speed =
        fromTop < HOT_ZONE_PX
          ? -MAX_SPEED_PX * Math.min(1, (HOT_ZONE_PX - fromTop) / HOT_ZONE_PX)
          : fromBottom < HOT_ZONE_PX
            ? MAX_SPEED_PX * Math.min(1, (HOT_ZONE_PX - fromBottom) / HOT_ZONE_PX)
            : 0;
      if (speed !== 0) scroller.scrollTop += speed;
    }
  }
  placeChip(s.x, s.y);
  s.hold?.restore();

  const now = performance.now();
  if (now >= s.settleUntil) {
    const worksheet = useWorksheetStore.getState().worksheet;
    const { index, maxSlot } = flowIndex(worksheet);
    const ghostId = useBankDrag.getState().ghost?.id;
    const { geometry, y } = measureGeometry(s.x, s.y, ghostId, index);
    const next = pickSlot(y, geometry, s.slot, { maxSlot });
    if (next !== s.slot) {
      s.slot = next;
      s.settleUntil = now + SETTLE_MS;
      useBankDrag.setState({ slot: next });
    }
  }
  s.frame = requestAnimationFrame(tick);
}

function releasePointer(s: Session, buttonUp: boolean) {
  cancelAnimationFrame(s.frame);
  try {
    if (s.el.hasPointerCapture(s.pointerId)) s.el.releasePointerCapture(s.pointerId);
  } catch {
    // Already released.
  }
  s.hold?.release(buttonUp);
  s.hold = undefined;
  s.el.style.cursor = '';
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  // The release's click lands on the row; it must not act as a click.
  swallowClick = true;
  window.setTimeout(() => {
    swallowClick = false;
  }, 0);
}

function begin(s: Session, label: string) {
  s.phase = 'dragging';
  s.hold = holdScrollers(s.el);
  try {
    s.el.setPointerCapture(s.pointerId);
  } catch {
    // The pointer is already gone; the next event ends the drag.
  }
  s.el.style.cursor = 'grabbing';
  document.body.style.cursor = 'grabbing';
  document.body.style.userSelect = 'none';
  window.getSelection()?.removeAllRanges();
  useBankDrag.setState({ active: { key: s.key, label, x: s.x, y: s.y }, ghost: null, slot: null });

  s.loading = loadBankCopies([s.row], s.source);
  void s.loading.then((loaded) => {
    if (session !== s) return;
    s.loaded = loaded;
    const found = loaded.found[0];
    // A fresh-id copy: the provisional question can never collide with an id on the page.
    if (found) useBankDrag.setState({ ghost: copyQuestion(found.question, found.docId) });
  });
  s.frame = requestAnimationFrame(tick);
}

/**
 * End the drag. `drop` commits at the current slot; otherwise the page goes back.
 * `buttonUp`: the button is known to be up (a release, a cancelled pointer).
 */
function finish(drop: boolean, buttonUp = false) {
  const s = session;
  endPress();
  if (!s || s.phase !== 'dragging') return;
  releasePointer(s, buttonUp);
  const slot = s.slot;
  if (!drop || slot === null) {
    useBankDrag.setState(IDLE);
    return;
  }
  // The commit and the end of the preview land in the same tick, so the page never
  // shows the unchanged document between them.
  const commit = (loaded: LoadedCopies) => {
    const report = commitBankCopies(loaded, { at: slot });
    useBankDrag.setState(IDLE);
    s.onReport?.(report);
  };
  if (s.loaded) commit(s.loaded);
  else void s.loading?.then(commit, () => useBankDrag.setState(IDLE));
}

/** Esc, a lost pointer, a blurred window: the page returns exactly to how it was. */
export function cancelBankDrag() {
  finish(false);
}

/**
 * A drag is in hand, or dropped and not yet committed. Read synchronously by the page's
 * ⌘Z: undoing now would change the document under the provisional page.
 */
export function isBankDragActive(): boolean {
  return useBankDrag.getState().active !== null;
}

/** What a key does while the drag lasts: Esc cancels; undo/redo are swallowed, not acted on. */
export const bankDragKey = gestureKey;

/** Test seam: aim the drag as a pointer over the page would. */
export function aimBankDragForTest(slot: number | null) {
  if (!session) return;
  session.slot = slot;
  useBankDrag.setState({ slot });
}

/** Test seam. */
export function resetBankDragForTest() {
  if (session) {
    cancelAnimationFrame(session.frame);
    session.hold?.release(true);
  }
  endPress();
  flowCache = undefined;
  useBankDrag.setState(IDLE);
}

export interface RowDragProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

/**
 * A row's pointer handlers: a press that travels `DRAG_THRESHOLD_PX` (or leaves the row)
 * becomes a drag; a still press stays a click. `source` is where the question is read
 * from (the saved documents; a test passes its own).
 */
export function rowDragHandlers(
  row: BankRow,
  key: string,
  label: string,
  { onReport, source }: { onReport?: (report: InsertReport) => void; source?: Pick<WorksheetStore, 'load'> } = {},
): RowDragProps {
  const move = (event: ReactPointerEvent<HTMLElement>, left: boolean) => {
    const s = session;
    if (!s || s.key !== key || event.pointerId !== s.pointerId) return;
    s.x = event.clientX;
    s.y = event.clientY;
    if (s.phase === 'dragging') return;
    if (left ? (event.buttons & 1) === 1 : Math.hypot(s.x - s.startX, s.y - s.startY) >= DRAG_THRESHOLD_PX) {
      begin(s, label);
    }
  };
  return {
    onPointerDown: (event) => {
      if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey) return;
      if (event.pointerType === 'touch' || session) return;
      if ((event.target as Element).closest(IGNORE)) return;
      session = {
        key,
        row,
        el: event.currentTarget,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        phase: 'pressed',
        frame: 0,
        slot: null,
        settleUntil: 0,
        ...(onReport ? { onReport } : {}),
        ...(source ? { source } : {}),
      };
      holdSelection(true);
    },
    onPointerMove: (event) => move(event, false),
    onPointerLeave: (event) => move(event, true),
    onPointerUp: (event) => {
      const s = session;
      if (!s || event.pointerId !== s.pointerId) return;
      // A press that never travelled is a click: let it through.
      if (s.phase === 'pressed') endPress();
      else finish(true, true);
    },
    onPointerCancel: () => {
      if (session?.phase === 'pressed') endPress();
      else finish(false, true);
    },
    onLostPointerCapture: () => {
      if (session?.phase === 'dragging') finish(false);
    },
    onClickCapture: (event) => {
      if (!swallowClick) return;
      event.preventDefault();
      event.stopPropagation();
    },
  };
}

/** The row half for the 題庫 tab: `sourceProps(row, key, label)` to spread on a row. */
export function useBankRowDrag({
  enabled,
  onReport,
}: {
  enabled: boolean;
  onReport?: (report: InsertReport) => void;
}): { sourceProps: (row: BankRow, key: string, label: string) => RowDragProps | undefined } {
  const report = useRef(onReport);
  useEffect(() => {
    report.current = onReport;
  }, [onReport]);
  // The tab unmounting mid-drag (switching tabs, leaving the editor) ends the drag.
  useEffect(() => () => cancelBankDrag(), []);
  const sourceProps = (row: BankRow, key: string, label: string) =>
    enabled ? rowDragHandlers(row, key, label, { onReport: (r) => report.current?.(r) }) : undefined;
  return { sourceProps };
}

/**
 * Mount once in the editor: the chip under the pointer (moved imperatively), and the
 * keyboard while the drag lasts (Esc cancels; `useModalLayer` so page shortcuts stand down;
 * undo/redo swallowed, so not even a focused field's own undo runs).
 */
export function BankDragLayer() {
  const m = useMessages(BANK_REVIEW_MESSAGES);
  const active = useBankDrag((s) => s.active);
  const aimed = useBankDrag((s) => s.slot !== null);
  const dragging = active !== null;
  useModalLayer(dragging);
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      const action = bankDragKey(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'cancel') cancelBankDrag();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', cancelBankDrag);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', cancelBankDrag);
    };
  }, [dragging]);

  if (!active || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={(el) => {
        chip = el;
      }}
      aria-hidden
      data-print-hide
      data-bank-drag-chip
      className="pointer-events-none fixed left-0 top-0 z-[100]"
      style={{ transform: `translate(${active.x + CHIP_OFFSET.x}px, ${active.y + CHIP_OFFSET.y}px)` }}
    >
      <DragChip label={active.label} detail={aimed ? m.release : m.drop} />
    </div>,
    document.body,
  );
}
