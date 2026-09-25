'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { SheetIcon } from '@/components/ui/icons';
import { useModalLayer } from '@/components/ui/modalLayer';
import {
  IDLE,
  parseDropTarget,
  stepDrag,
  type DragInput,
  type DragState,
  type DropTarget,
} from './dashboardDrag';

/** Presses here never start a drag: the ⋯ trigger, anything typed into. */
const IGNORE = '[aria-haspopup], input, textarea, select, a[href], [data-drag-ignore]';

/** The ghost sits below-right of the pointer, clear of the target it is aimed at. */
const GHOST_OFFSET = 14;

function targetAt(x: number, y: number): DropTarget | null {
  const hit = document.elementFromPoint(x, y)?.closest('[data-folder-drop]');
  return parseDropTarget(hit?.getAttribute('data-folder-drop'));
}

function place(ghost: HTMLElement | null, x: number, y: number) {
  if (ghost) ghost.style.transform = `translate(${x + GHOST_OFFSET}px, ${y + GHOST_OFFSET}px)`;
}

export interface DocumentDrag {
  /** Spread on a card or row. `undefined` when dragging is off. */
  sourceProps: (docId: string, title: string) => SourceProps | undefined;
  /** The document being dragged, for dimming its card. */
  draggingId: string | undefined;
  /** The folder row under the pointer, for its highlight. */
  over: DropTarget | null;
  /** Render once, anywhere: the title chip that follows the pointer. */
  ghost: ReactNode;
}

export interface SourceProps {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerCancel: () => void;
  onLostPointerCapture: () => void;
  onClickCapture: (event: ReactMouseEvent<HTMLElement>) => void;
}

/**
 * Drag a document onto a folder with pointer events (rules in `dashboardDrag.ts`).
 *
 * The pointer is captured only once the press becomes a drag — captured from the press,
 * the release would retarget the click and a plain click would stop opening the
 * document. The ghost moves imperatively; React state changes only when the drag starts,
 * ends, or crosses onto another folder. `onDrop` is called once, on release.
 */
export function useDocumentDrag(
  onDrop: ((docId: string, folderId: string | undefined) => void) | undefined,
): DocumentDrag {
  const state = useRef<DragState>(IDLE);
  const source = useRef<HTMLElement | null>(null);
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const swallowClick = useRef(false);
  const onDropRef = useRef(onDrop);
  const [active, setActive] = useState<{ docId: string; title: string; x: number; y: number }>();
  const [over, setOver] = useState<DropTarget | null>(null);
  const title = useRef('');

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  const release = useCallback(() => {
    const el = source.current;
    source.current = null;
    if (el) {
      el.style.touchAction = '';
      el.style.cursor = '';
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  const apply = useCallback(
    (input: DragInput, at?: { x: number; y: number }) => {
      const step = stepDrag(state.current, input);
      state.current = step.state;
      if (step.started && step.state.phase === 'dragging') {
        const el = source.current;
        if (el && input.type === 'move') {
          try {
            el.setPointerCapture(input.pointerId);
          } catch {
            // The pointer is already gone; the next event cancels.
          }
          el.style.touchAction = 'none';
          el.style.cursor = 'grabbing';
        }
        document.body.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        window.getSelection()?.removeAllRanges();
        const docId = step.state.docId;
        setActive({ docId, title: title.current, x: at?.x ?? 0, y: at?.y ?? 0 });
      }
      if (step.state.phase === 'dragging') {
        if (at) place(ghostRef.current, at.x, at.y);
        setOver(step.state.target);
      }
      if (step.ended) {
        release();
        setActive(undefined);
        setOver(null);
        // The release's click lands on the card; it must not open the document.
        swallowClick.current = true;
        window.setTimeout(() => {
          swallowClick.current = false;
        }, 0);
      }
      if (step.state.phase === 'idle') source.current = null;
      if (step.drop) onDropRef.current?.(step.drop.docId, step.drop.folderId);
    },
    [release],
  );

  const dragging = active !== undefined;
  // Escape belongs to the drag while it lasts — not to whatever else listens on window.
  useModalLayer(dragging);
  useEffect(() => {
    if (!dragging) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      apply({ type: 'cancel' });
    };
    const onBlur = () => apply({ type: 'cancel' });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [dragging, apply]);

  // Unmounted mid-drag (the list reloaded): leave the page as it was found.
  useEffect(() => () => release(), [release]);

  const sourceProps = (docId: string, docTitle: string): SourceProps | undefined => {
    if (!onDrop) return undefined;
    return {
      onPointerDown: (event) => {
        if (event.button !== 0 || !event.isPrimary || event.ctrlKey || event.metaKey) return;
        if ((event.target as Element).closest(IGNORE)) return;
        source.current = event.currentTarget;
        title.current = docTitle;
        apply({ type: 'down', docId, pointerId: event.pointerId, x: event.clientX, y: event.clientY });
      },
      onPointerMove: (event) => {
        if (state.current.phase === 'idle') return;
        const at = { x: event.clientX, y: event.clientY };
        apply({ type: 'move', pointerId: event.pointerId, ...at, target: targetAt(at.x, at.y) }, at);
      },
      onPointerLeave: (event) => {
        if (state.current.phase !== 'pressed') return;
        const at = { x: event.clientX, y: event.clientY };
        apply(
          { type: 'move', pointerId: event.pointerId, ...at, target: targetAt(at.x, at.y), left: true },
          at,
        );
      },
      onPointerUp: (event) => {
        if (state.current.phase === 'idle') return;
        apply({ type: 'up', pointerId: event.pointerId, target: targetAt(event.clientX, event.clientY) });
      },
      onPointerCancel: () => apply({ type: 'cancel' }),
      onLostPointerCapture: () => apply({ type: 'cancel' }),
      onClickCapture: (event) => {
        if (!swallowClick.current) return;
        event.preventDefault();
        event.stopPropagation();
      },
    };
  };

  const ghost =
    active && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={ghostRef}
            aria-hidden
            data-print-hide
            className="pointer-events-none fixed left-0 top-0 z-50 flex max-w-[260px] items-center gap-2 rounded-lg border border-line bg-surface-raised py-1.5 pl-2 pr-3 text-[12.5px] font-medium text-ink shadow-xl"
            style={{
              transform: `translate(${active.x + GHOST_OFFSET}px, ${active.y + GHOST_OFFSET}px)`,
            }}
          >
            <span className="shrink-0 text-ink-subtle">
              <SheetIcon size={15} />
            </span>
            <span className="min-w-0 truncate">{active.title || 'Untitled'}</span>
          </div>,
          document.body,
        )
      : null;

  return { sourceProps, draggingId: active?.docId, over, ghost };
}
