'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { computeNumbering } from '@/model/numbering';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Inspector } from './Inspector';
import { Outline } from './Outline';
import { PageSetupPanel } from './PageSetupPanel';
import { WorksheetSettings } from './WorksheetSettings';

/**
 * The right sidebar — the editing home (§5.1).
 *
 * Three distinct regions, top to bottom: collapsed worksheet settings, the question
 * outline, and the inspector for the selection. The outline/inspector split is
 * draggable, because the previous fixed `max-h-[45%]` meant a long worksheet always
 * showed a clipped list no matter how much room the inspector was wasting.
 */

const MIN_OUTLINE = 120;
const MIN_INSPECTOR = 180;
/**
 * The outline's ceiling before the user takes over the split.
 *
 * Paired with the `max-height` behaviour below, this is a *cap*, not a reservation:
 * a three-question list is three rows tall, and only a long one grows to here. It is
 * deliberately generous — at the old 240px a list started scrolling at about six
 * questions while the inspector underneath still had empty space, which is the worst
 * of both (a scrollbar *and* wasted room).
 */
const DEFAULT_OUTLINE = 420;

export function Sidebar() {
  const worksheet = useWorksheetStore((s) => s.worksheet);
  const numbering = computeNumbering(worksheet);

  const containerRef = useRef<HTMLDivElement>(null);
  const [outlineHeight, setOutlineHeight] = useState(DEFAULT_OUTLINE);
  const [dragging, setDragging] = useState(false);
  // Whether the user has taken control of the split. Before they do, the outline is
  // allowed to shrink to its content (see the style below).
  const [resized, setResized] = useState(false);

  const applyHeight = useCallback((clientY: number) => {
    const container = containerRef.current;
    if (!container) return;
    const bounds = container.getBoundingClientRect();
    const next = clientY - bounds.top;
    const max = bounds.height - MIN_INSPECTOR;
    setOutlineHeight(Math.max(MIN_OUTLINE, Math.min(next, Math.max(MIN_OUTLINE, max))));
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: MouseEvent) => {
      event.preventDefault();
      applyHeight(event.clientY);
    };
    const onUp = () => setDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, applyHeight]);

  return (
    <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-line bg-surface">
      <WorksheetSettings />
      <PageSetupPanel />

      <div ref={containerRef} className="flex min-h-0 flex-1 flex-col">
        {/* Until the divider is dragged the outline is sized by `max-height`, not
            `height`. A fixed height reserved 240px whether the worksheet had twenty
            questions or none, which is what left a blank band above the inspector on
            a new document. Once the user drags, their explicit height wins — they
            have said how much room the list should have. */}
        <div
          className="flex min-h-0 flex-col"
          style={
            resized
              ? { height: outlineHeight, flexShrink: 0 }
              : { maxHeight: outlineHeight, flexShrink: 0 }
          }
        >
          <Outline numbering={numbering} />
        </div>

        {/* Draggable divider. Also keyboard-adjustable, since it is a real control. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize question list"
          tabIndex={0}
          onMouseDown={(event) => {
            event.preventDefault();
            setDragging(true);
            setResized(true);
          }}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            setResized(true);
            if (event.key === 'ArrowUp') setOutlineHeight((h) => Math.max(MIN_OUTLINE, h - 24));
            else setOutlineHeight((h) => h + 24);
          }}
          className={`group relative h-2 shrink-0 cursor-row-resize bg-surface-sunken transition-colors hover:bg-accent-soft focus-visible:bg-accent-soft focus-visible:outline-none ${
            dragging ? 'bg-accent-soft' : ''
          }`}
        >
          <span
            className={`pointer-events-none absolute left-1/2 top-1/2 h-1 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors group-hover:bg-accent ${
              dragging ? 'bg-accent' : 'bg-line-strong'
            }`}
          />
        </div>

        <Inspector numbering={numbering} />
      </div>
    </aside>
  );
}
