'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MIN_BLOCK_WIDTH_PX } from '@/model/edits';

/**
 * Drag-to-resize for an image or diagram, on the page itself.
 *
 * Sizing a picture is a visual judgement — "as wide as the text", "small enough to fit
 * beside the table" — so it belongs where the picture is, not behind a number field in
 * the sidebar. This wraps the rendered block, draws corner handles once it is selected,
 * and turns a pointer drag into a width.
 *
 * Four decisions carry the behaviour:
 *
 *  - **Width is the only output.** Height follows the block's own aspect ratio
 *    (`applyResizeBlock`), the identical rule the sidebar's width field obeys, so
 *    neither surface can produce a shape the other cannot. That is also why the
 *    handles are corners rather than edges: an edge handle would promise independent
 *    width and height, which the model deliberately does not offer.
 *  - **The drag divides by the preview's scale.** The page sits inside a `scale()`
 *    transform, so a 100px pointer move is fewer than 100 page pixels at fit-to-width.
 *    Using raw client deltas would make the block grow faster than the cursor.
 *  - **The in-flight size is local state, committed once on release.** A drag emits
 *    dozens of widths a second; committing each would push dozens of undo entries and
 *    re-run pagination on every frame. The live width is applied as a CSS override
 *    instead, so what is on screen tracks the pointer exactly while the document sees
 *    a single edit — the same rule the page's drag-to-reorder follows by keeping
 *    `dragId` out of the store.
 *  - **Pointer capture, not window listeners.** `setPointerCapture` keeps the gesture
 *    with this handle even when the pointer outruns the block or leaves the sheet,
 *    which a drag that shrinks the block by 200px reliably does.
 */

interface Props {
  /** The block being sized, addressed by id so a reorder mid-drag stays correct. */
  blockId: string;
  widthPx: number;
  heightPx: number;
  /** Height ÷ width, kept locked through the gesture. */
  ratio: number;
  /** Preview zoom, so a pointer delta converts to page pixels. */
  scale: number;
  selected: boolean;
  onSelect: () => void;
  /**
   * Open this block's own editor, on double-click. Omitted for blocks that have none —
   * an uploaded picture has nothing to edit, whereas a diagram has a drawing canvas.
   */
  onOpen?: () => void;
  /** Commit the final width. Called once per gesture, on release. */
  onResize: (blockId: string, widthPx: number) => void;
  /**
   * The widest the block may become — the text column. Without a ceiling a drag can
   * make a diagram wider than the paper, which the preview clips and Word rescales,
   * so the size the teacher chose is not the size that prints.
   */
  maxWidthPx?: number;
  children: React.ReactNode;
}

/** Which corner is being dragged; the two left corners grow leftward. */
type Corner = 'nw' | 'ne' | 'sw' | 'se';

const CORNERS: Array<{ corner: Corner; className: string; cursor: string }> = [
  { corner: 'nw', className: '-left-1 -top-1', cursor: 'nwse-resize' },
  { corner: 'ne', className: '-right-1 -top-1', cursor: 'nesw-resize' },
  { corner: 'sw', className: '-bottom-1 -left-1', cursor: 'nesw-resize' },
  { corner: 'se', className: '-bottom-1 -right-1', cursor: 'nwse-resize' },
];

export function ResizableBlock({
  blockId,
  widthPx,
  heightPx,
  ratio,
  scale,
  selected,
  onSelect,
  onOpen,
  onResize,
  maxWidthPx,
  children,
}: Props) {
  // The width being dragged towards, or undefined when no gesture is in flight. Local
  // rather than in the store: it is transient interaction state that must never reach
  // an undo entry or an autosave.
  const [draftWidth, setDraftWidth] = useState<number | undefined>();

  // Captured at pointer-down and replayed from, so the gesture is one idempotent
  // transform rather than an accumulating one — the same rule the diagram canvas
  // follows. Reading the latest state each move would compound rounding.
  const gesture = useRef<{
    corner: Corner;
    startX: number;
    startWidth: number;
    pointerId: number;
  } | null>(null);

  const clamp = useCallback(
    (width: number) =>
      Math.max(MIN_BLOCK_WIDTH_PX, Math.min(maxWidthPx ?? Infinity, Math.round(width))),
    [maxWidthPx],
  );

  // The last width the gesture produced, kept in a ref as well as in state so that
  // release can read it without a state *updater* — React runs updaters during render,
  // and committing from inside one would call the store mid-render.
  const latestWidth = useRef<number | undefined>(undefined);

  const finish = useCallback(() => {
    const active = gesture.current;
    const width = latestWidth.current;
    gesture.current = null;
    latestWidth.current = undefined;
    setDraftWidth(undefined);
    // Committing an unchanged width would still push an undo entry, so a click that
    // merely brushed a handle would cost the teacher an undo press.
    if (active && width !== undefined && width !== active.startWidth) {
      onResize(blockId, width);
    }
  }, [blockId, onResize]);

  // Escape abandons the gesture, matching every other cancellable interaction on the
  // page. The listener only exists while dragging, so it cannot swallow the key that
  // clears a selection.
  useEffect(() => {
    if (draftWidth === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      gesture.current = null;
      latestWidth.current = undefined;
      setDraftWidth(undefined);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [draftWidth]);

  const beginDrag = (corner: Corner) => (event: React.PointerEvent<HTMLButtonElement>) => {
    // Left button only, and never let the page's drag-to-reorder or select-question
    // handlers see this — the gesture is entirely ours once it starts.
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      corner,
      startX: event.clientX,
      startWidth: widthPx,
      pointerId: event.pointerId,
    };
    latestWidth.current = widthPx;
    setDraftWidth(widthPx);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    // Divide out the preview transform so the edge tracks the cursor at any zoom.
    const delta = (event.clientX - active.startX) / (scale || 1);
    // A west handle grows the block as it moves left, which is the direction the
    // pointer has to travel for the corner under it to stay under it.
    const signed = active.corner === 'nw' || active.corner === 'sw' ? -delta : delta;
    const width = clamp(active.startWidth + signed);
    latestWidth.current = width;
    setDraftWidth(width);
  };

  const liveWidth = draftWidth ?? widthPx;
  const liveHeight = draftWidth === undefined ? heightPx : Math.max(1, Math.round(draftWidth * ratio));
  const dragging = draftWidth !== undefined;

  return (
    <div
      className="relative mx-auto inline-block align-top"
      style={{ width: liveWidth, lineHeight: 0 }}
    >
      {/* The block itself is told the live size, so the picture rescales under the
          pointer rather than snapping to its new size only on release.

          The descendant selector reaches the picture *and* the wrapper a diagram sits
          in: `diagramSvg` writes fixed `width`/`height` attributes on the `<svg>` and
          the diagram's own div is one level further down, so a child-only rule would
          leave the drawing at its stored size inside a resized box. A `viewBox` is
          always present, so overriding both dimensions rescales rather than crops. */}
      <div
        style={{ width: liveWidth, height: liveHeight }}
        className="[&_img]:!h-full [&_img]:!w-full [&_svg]:!h-full [&_svg]:!w-full [&>*]:!h-full [&>*]:!w-full"
      >
        {children}
      </div>

      {/* One click target over the whole block. The picture has no text to click, so
          without this a diagram could only be selected via its caption.

          It stays mounted **while selected**, which is not cosmetic: unmounting it let
          the next click fall through to the question wrapper underneath, whose own
          handler clears `selectedBlockId`. The selection was therefore gone before the
          teacher could act on it, which is why Delete on a selected picture appeared to
          do nothing at all. Inset so it never covers the corner handles, which sit on
          the boundary and must stay grabbable. */}
      <button
        type="button"
        aria-label={onOpen ? 'Select image — double-click to edit' : 'Select image to resize'}
        data-print-hide
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        // Double-click opens the editor for blocks that have one (a diagram); a picture
        // has nothing to open and simply keeps the selection.
        onDoubleClick={
          onOpen
            ? (event) => {
                event.stopPropagation();
                event.preventDefault();
                onOpen();
              }
            : undefined
        }
        style={selected ? { inset: 6 / (scale || 1) } : undefined}
        className={
          'absolute cursor-pointer rounded-sm ring-inset ring-[#7c5cff] transition-shadow ' +
          (selected ? '' : 'inset-0 hover:ring-2')
        }
      />

      {selected && (
        <>
          {/* Literal hex, not a theme token: this outline is drawn on the paper, which
              never themes (§UI tokens vs the paper). */}
          <div
            aria-hidden
            data-print-hide
            className="pointer-events-none absolute inset-0 rounded-sm shadow-[0_0_0_2px_#7c5cff]"
          />
          {CORNERS.map(({ corner, className, cursor }) => (
            <button
              key={corner}
              type="button"
              aria-label={`Resize image (${corner === 'nw' || corner === 'sw' ? 'left' : 'right'})`}
              data-print-hide
              // Handles keep a constant on-screen size by dividing out the preview
              // scale, so they stay grabbable at fit-to-width and do not become
              // slabs when zoomed in — the same trick the diagram canvas uses.
              style={{
                cursor,
                width: 10 / (scale || 1),
                height: 10 / (scale || 1),
                touchAction: 'none',
              }}
              className={`absolute ${className} z-10 rounded-[2px] border border-white bg-[#7c5cff] shadow-sm`}
              onPointerDown={beginDrag(corner)}
              onPointerMove={onPointerMove}
              onPointerUp={finish}
              onPointerCancel={finish}
              onLostPointerCapture={finish}
              onClick={(event) => event.stopPropagation()}
            />
          ))}

          {/* The live dimensions, so the drag is a measurement rather than a guess —
              this is what the sidebar's number field was really for. */}
          {dragging && (
            <div
              data-print-hide
              className="pointer-events-none absolute rounded bg-[#2c2a28] font-sans text-white shadow-sm"
              style={{
                // Inside the bottom-left corner rather than below the block. Hanging it
                // underneath overlapped whatever the picture sits above — on a real
                // worksheet that is the MCQ options — so the readout obscured the very
                // layout the teacher is resizing to fit.
                bottom: 4 / (scale || 1),
                left: 4 / (scale || 1),
                padding: `${1 / (scale || 1)}px ${4 / (scale || 1)}px`,
                // Sized in inverse-scaled units so it stays legible at any zoom.
                fontSize: 11 / (scale || 1),
                lineHeight: 1.4,
              }}
            >
              {liveWidth} × {liveHeight}
            </div>
          )}
        </>
      )}
    </div>
  );
}
