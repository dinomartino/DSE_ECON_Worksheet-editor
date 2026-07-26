'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GripIcon } from './icons';

/**
 * The thing that follows the cursor while dragging.
 *
 * The browser's native HTML5 drag image is a translucent snapshot of the dragged
 * element taken at `dragstart`. For a question on the page that snapshot is a full
 * A4-width slab of text, rendered at whatever zoom the preview happens to be at —
 * it covers the drop indicator it is supposed to be aimed at, and at 60% zoom it does
 * not even match the size of the thing being moved. In the sidebar it is a bare row
 * with no indication of *what* is being carried.
 *
 * This replaces it with a small labelled chip, the way a file drag looks on a desktop:
 * a compact card that says what is in hand and stays out of the way of where it is
 * going. `setDragImage` is pointed at a 1×1 transparent pixel to suppress the native
 * one — hiding the source element instead would collapse the layout mid-drag and make
 * the drop targets move under the pointer.
 */

/** A 1×1 transparent GIF, used to blank the native drag image. */
const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

let blankImage: HTMLImageElement | undefined;

/**
 * Suppresses the native drag image. Call from `onDragStart`.
 *
 * The image element is created once and kept, because Safari and Firefox read it
 * asynchronously — an element created inside the handler can be garbage collected
 * before the browser has used it, which silently restores the native ghost.
 */
export function hideNativeDragImage(event: React.DragEvent) {
  if (typeof window === 'undefined') return;
  if (!blankImage) {
    blankImage = new Image();
    blankImage.src = BLANK;
  }
  try {
    event.dataTransfer.setDragImage(blankImage, 0, 0);
  } catch {
    // Not fatal: the drag still works, it just keeps the browser's own ghost.
  }
}

/**
 * Renders the ghost at the pointer for as long as `label` is set.
 *
 * Tracking uses `dragover` rather than `drag`: Firefox reports (0, 0) for `drag`
 * coordinates, which would peg the ghost to the top-left corner for that whole
 * browser. `dragover` carries real coordinates everywhere.
 */
export function DragGhost({
  label,
  detail,
  icon,
}: {
  /** What is being dragged. Falsy means no drag is in progress. */
  label?: string;
  detail?: string;
  icon?: ReactNode;
}) {
  // The point is tagged with the drag it came from. Without the tag, the first frame
  // of a new drag would paint the chip at the *previous* drag's last position — a
  // visible flash across the screen — because coordinates only start arriving once
  // the pointer moves.
  const [point, setPoint] = useState<{ x: number; y: number; owner: string }>();

  useEffect(() => {
    // No reset when the drag ends: the render below already bails on a falsy `label`,
    // so a stale point is never read, and clearing it here would be a setState inside
    // an effect for no observable benefit.
    if (!label) return;

    const track = (event: DragEvent) => {
      if (event.clientX === 0 && event.clientY === 0) return;
      setPoint({ x: event.clientX, y: event.clientY, owner: label });
    };
    // Capture phase, so a handler that calls `stopPropagation` on the way up — the
    // drop targets do — cannot stop the ghost from tracking.
    document.addEventListener('dragover', track, true);
    document.addEventListener('drag', track, true);
    return () => {
      document.removeEventListener('dragover', track, true);
      document.removeEventListener('drag', track, true);
    };
  }, [label]);

  // `point.owner !== label` means the only coordinates we hold belong to a finished
  // drag, so nothing is drawn until this one reports a position of its own.
  if (!label || !point || point.owner !== label || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      aria-hidden
      className="pointer-events-none fixed z-[100]"
      style={{
        left: point.x,
        top: point.y,
        // Offset from the cursor rather than centred on it, so the chip sits below-right
        // the way a desktop file drag does and never hides the insertion line.
        transform: 'translate(12px, 10px)',
      }}
    >
      <div className="flex max-w-[260px] items-center gap-2 rounded-xl border border-accent/40 bg-surface-raised/95 py-1.5 pl-2 pr-3 shadow-2xl backdrop-blur">
        <span className="text-accent">{icon ?? <GripIcon size={14} />}</span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-medium leading-tight text-ink">
            {label}
          </span>
          {detail && (
            <span className="block truncate text-[10px] leading-tight text-ink-subtle">
              {detail}
            </span>
          )}
        </span>
      </div>
    </div>,
    document.body,
  );
}
