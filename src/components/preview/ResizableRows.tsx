'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drag-to-extend for answer lines and spacers: a handle on the bottom edge turns a
 * vertical drag into a count. A sibling of `ResizableBlock`, not a mode (height-only
 * in whole steps vs width-with-aspect). Standard gesture rules: delta ÷ scale,
 * in-flight value local + one commit, replay from pointer-down, pointer capture.
 * Bottom edge only — a top handle would promise growing upward, which is a reorder.
 */

interface Props {
  /** The layout element being sized, addressed by id so a reorder mid-drag stays correct. */
  elementId: string;
  /** The current count: lines for answer lines, points of height for a spacer. */
  value: number;
  /** Page pixels one unit occupies, for converting a pointer delta into units. */
  pxPerUnit: number;
  /** The floor a drag may not go below — one line, or a spacer that still takes space. */
  min: number;
  /**
   * The ceiling: the largest value that still fits on this element's own sheet.
   *
   * A **hard stop**. Pulling further does nothing — the element cannot be dragged past
   * the bottom of its page, and nothing is created to absorb the excess. Wanting more
   * room than a page holds is expressed by adding a second element, which is a
   * different action from resizing this one.
   *
   * Read once at pointer-down, so the gesture keeps one cap for its whole duration
   * rather than chasing a number that the repagination it is causing keeps moving.
   */
  maxFor: () => number;
  /** How much one drag step changes the value. Points move in fives, lines one at a time. */
  step: number;
  /** Preview zoom, so a pointer delta converts to page pixels. */
  scale: number;
  selected: boolean;
  onSelect: () => void;
  /** Commit the final value. Called once per gesture, on release. */
  onResize: (elementId: string, value: number) => void;
  /** Singular/plural noun for the live readout, e.g. `['line', 'lines']`. */
  unit: [string, string];
  /**
   * Draw the element at a given size — the in-flight one while dragging, the stored one
   * otherwise.
   *
   * A function rather than a `ReactNode` because these elements are sized by a *count*,
   * and a count cannot be faked with a CSS override the way `ResizableBlock` rescales a
   * picture. Without it the outline grew under the pointer while the rows underneath
   * stayed at their old number, so the drag read as broken until it was released.
   */
  children: (value: number) => React.ReactNode;
}

export function ResizableRows({
  elementId,
  value,
  pxPerUnit,
  min,
  maxFor,
  step,
  scale,
  selected,
  onSelect,
  onResize,
  unit,
  children,
}: Props) {
  // The value being dragged towards, or undefined when no gesture is in flight. Local
  // rather than in the store: transient interaction state that must never reach an
  // undo entry or an autosave.
  const [draft, setDraft] = useState<number | undefined>();

  const gesture = useRef<{
    startY: number;
    startValue: number;
    pointerId: number;
    /** The cap, captured once so it cannot move under the gesture causing it. */
    max: number;
  } | null>(null);

  /**
   * Whether the pointer is being pulled past the cap.
   *
   * Only to say so — the value itself stops. Without the readout changing, a drag that
   * has hit the bottom of the page reads as the gesture having jammed rather than as
   * the page being full.
   */
  const [atMax, setAtMax] = useState(false);

  // Kept in a ref as well as in state so release can read it without a state *updater* —
  // React runs updaters during render, and committing from inside one would call the
  // store mid-render.
  const latest = useRef<number | undefined>(undefined);

  const clamp = useCallback(
    (next: number) => Math.max(min, Math.round(next / step) * step),
    [min, step],
  );

  const finish = useCallback(() => {
    const active = gesture.current;
    const next = latest.current;
    gesture.current = null;
    latest.current = undefined;
    setDraft(undefined);
    setAtMax(false);
    if (!active || next === undefined) return;
    // Committing an unchanged value would still push an undo entry, so a click that
    // merely brushed the handle would cost the teacher an undo press.
    if (next !== active.startValue) onResize(elementId, next);
  }, [elementId, onResize]);

  // Escape abandons the gesture, matching every other cancellable interaction on the
  // page. The listener exists only while dragging, so it cannot swallow the key that
  // clears a selection.
  useEffect(() => {
    if (draft === undefined) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      gesture.current = null;
      latest.current = undefined;
      setDraft(undefined);
      setAtMax(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [draft]);

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    // Left button only, and never let the page's drag-to-reorder or select handlers
    // see this — the gesture is entirely ours once it starts.
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      startY: event.clientY,
      startValue: value,
      pointerId: event.pointerId,
      // The cap is whatever fits today plus what this element already occupies, since
      // the slack is the room *beside* it. Captured once: growing the element shrinks
      // the slack, so re-reading it every move would have the ceiling retreat from the
      // pointer and the drag would never reach it.
      max: Math.max(min, value + Math.floor(maxFor() / (pxPerUnit || 1))),
    };
    latest.current = value;
    setDraft(value);
    setAtMax(false);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    // Divide out the preview transform so the edge tracks the cursor at any zoom, then
    // convert page pixels into the element's own unit.
    const delta = (event.clientY - active.startY) / (scale || 1) / (pxPerUnit || 1);
    const asked = clamp(active.startValue + delta);
    // A hard stop at the bottom of the page. Pulling further changes nothing, so the
    // element can never be sized past the sheet it sits on.
    const next = Math.min(asked, active.max);
    latest.current = next;
    setDraft(next);
    setAtMax(asked > active.max);
  };

  const live = draft ?? value;
  const dragging = draft !== undefined;

  return (
    <div className="relative">
      {children(live)}

      {/* One click target over the whole element. Ruled lines and whitespace have no
          text to click, so without this the only handle on either is the sidebar.

          It stays mounted **while selected**, which is not cosmetic: unmounting it lets
          the next click fall through to the wrapper underneath, whose handler clears
          the selection — the same trap `ResizableBlock` documents. Inset while selected
          so it never covers the drag handle. */}
      <button
        type="button"
        aria-label={`Select to resize (${live} ${live === 1 ? unit[0] : unit[1]})`}
        data-print-hide
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
        style={selected ? { inset: 6 / (scale || 1) } : undefined}
        className={
          'absolute cursor-pointer rounded-sm ring-inset ring-[#0d77c9] transition-shadow ' +
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
            className="pointer-events-none absolute inset-0 rounded-sm shadow-[0_0_0_2px_#0d77c9]"
          />

          {/* The handle spans the bottom edge rather than sitting at one corner. The
              gesture is vertical and the element is a full-width band, so a wide grip
              is both easier to hit and an honest picture of what moves. */}
          <button
            type="button"
            aria-label="Drag to add or remove lines"
            data-print-hide
            style={{
              cursor: 'ns-resize',
              // Inverse-scaled so the grip keeps a constant on-screen size at any zoom,
              // the same trick the diagram canvas and ResizableBlock use.
              height: 10 / (scale || 1),
              width: 44 / (scale || 1),
              bottom: -5 / (scale || 1),
              touchAction: 'none',
            }}
            className="absolute left-1/2 z-10 -translate-x-1/2 rounded-full border border-white bg-[#0d77c9] shadow-sm"
            onPointerDown={beginDrag}
            onPointerMove={onPointerMove}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onClick={(event) => event.stopPropagation()}
          />

          {/* The live count, so the drag is a measurement rather than a guess. Inside
              the bottom-left corner rather than below the element, which would put it
              over whatever follows on the page. */}
          {dragging && (
            <div
              data-print-hide
              className={`pointer-events-none absolute rounded font-sans text-white shadow-sm ${
                // Violet at the ceiling: the element has stopped growing under the
                // pointer, and without saying why that reads as the drag having jammed
                // rather than as the page being full.
                atMax ? 'bg-[#0d77c9]' : 'bg-[#2c2a28]'
              }`}
              style={{
                bottom: 4 / (scale || 1),
                left: 4 / (scale || 1),
                padding: `${1 / (scale || 1)}px ${4 / (scale || 1)}px`,
                fontSize: 11 / (scale || 1),
                lineHeight: 1.4,
              }}
            >
              {live} {live === 1 ? unit[0] : unit[1]}
              {atMax && ' · fills the page'}
            </div>
          )}
        </>
      )}
    </div>
  );
}
