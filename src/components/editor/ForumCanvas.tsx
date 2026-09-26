'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForumChart } from '@/model/diagram';
import type { DiagramBlock } from '@/model/types';
import { diagramSize, diagramSvg, forumChartLayout } from '@/render/diagram';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button } from '@/components/ui';
import { useModalLayer } from '@/components/ui/modalLayer';

/**
 * The forum figure's canvas: resizing bubbles on the picture itself.
 *
 * The one geometric decision a forum offers is each bubble's width — everything else
 * (wording, corner, the picture) is data the sidebar panel edits. So this surface is
 * deliberately small: the real SVG, and a drag grip on every bubble's **inner** edge.
 * The outer edge is the slot's anchor and never moves; dragging the inner edge
 * re-wraps the text live, and the box's height follows the wrapped lines — the width
 * is the teacher's choice, the height is always measured.
 *
 * Canvas house rules apply: the in-flight width is local state, the store is written
 * once on release, no travel commits nothing, and hit-testing reads
 * `forumChartLayout()` — the exact rectangles `forumSvg` drew.
 */

const ZOOMS = [1, 1.5, 2, 3];
const DEFAULT_ZOOM = 1.5;
/** How close to the inner edge (natural px) a press must land to grab it. */
const EDGE_REACH = 7;
/** The gutter a drag must leave between two bubbles sharing a row. */
const ROW_GUTTER = 18;
/** The same clamps the renderer applies, so the grip cannot promise an impossible width. */
const MIN_SHARE = 0.15;
const MAX_SHARE = 0.92;

/** A bubble anchored left drags its right edge; anchored right, its left. */
function innerEdgeX(box: { x: number; w: number }, onLeft: boolean): number {
  return onLeft ? box.x + box.w : box.x;
}

function onLeftSide(slot: string): boolean {
  return slot === 'topLeft' || slot === 'bottomLeft';
}

export function ForumCanvas({
  block,
  onChange,
  onClose,
}: {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
  onClose: () => void;
}) {
  useModalLayer();
  const language = useWorksheetStore((s) => s.mode.language);
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);

  const diagram = block.diagram;
  const forum = useMemo(() => diagram.forum ?? { bubbles: [] }, [diagram.forum]);

  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  /** In-flight drag: which bubble, and the width fraction under the pointer now. */
  const [drag, setDrag] = useState<{ bubbleId: string; share: number } | null>(null);
  const [hoverEdge, setHoverEdge] = useState<string | null>(null);
  const gesture = useRef<{ bubbleId: string; moved: boolean } | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // The diagram as the pointer currently has it. Re-wrapped every render — that is
  // the whole point: the words re-fit the box while the edge is still moving.
  const effective: ForumChart = useMemo(() => {
    if (!drag) return forum;
    return {
      ...forum,
      bubbles: forum.bubbles.map((bubble) =>
        bubble.id === drag.bubbleId ? { ...bubble, width: drag.share } : bubble,
      ),
    };
  }, [forum, drag]);
  const effectiveDiagram = useMemo(
    () => ({ ...diagram, forum: effective }),
    [diagram, effective],
  );

  // The height follows the wrap, so the stage is re-measured per render too.
  const size = useMemo(
    () => diagramSize(effectiveDiagram, block.widthPx, language),
    [effectiveDiagram, block.widthPx, language],
  );
  const layout = useMemo(
    () => forumChartLayout(effectiveDiagram, effective, block.widthPx, language),
    [effectiveDiagram, effective, block.widthPx, language],
  );
  const svg = useMemo(
    () =>
      diagramSvg(effectiveDiagram, {
        widthPx: size.widthPx,
        heightPx: size.heightPx,
        language,
        fonts,
      }),
    [effectiveDiagram, size, language, fonts],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      // One step back per press: abandon the drag, then the whole editor.
      if (gesture.current) {
        gesture.current = null;
        setDrag(null);
      } else {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toNatural = (event: React.PointerEvent) => {
    const rect = stageRef.current!.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / zoom,
      y: (event.clientY - rect.top) / zoom,
    };
  };

  /** The bubble whose inner edge is under the point, if any. */
  const edgeAt = (p: { x: number; y: number }) => {
    for (const box of layout.bubbles) {
      if (box.bubble.id === 'placeholder') continue;
      const edge = innerEdgeX(box, onLeftSide(box.bubble.slot));
      if (Math.abs(p.x - edge) <= EDGE_REACH && p.y >= box.y && p.y <= box.y + box.h) {
        return box;
      }
    }
    return undefined;
  };

  /** The widest fraction this bubble may take without crossing its row-mate. */
  const maxShareFor = (bubbleId: string): number => {
    const me = forum.bubbles.find((bubble) => bubble.id === bubbleId);
    if (!me) return MAX_SHARE;
    const mate = layout.bubbles.find(
      (box) =>
        box.bubble.id !== bubbleId &&
        box.bubble.slot.startsWith(me.slot.startsWith('top') ? 'top' : 'bottom'),
    );
    if (!mate) return MAX_SHARE;
    return Math.min(MAX_SHARE, (layout.width - mate.w - ROW_GUTTER) / layout.width);
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const p = toNatural(event);
    const box = edgeAt(p);
    if (!box) return;
    event.preventDefault();
    (event.target as Element).setPointerCapture?.(event.pointerId);
    gesture.current = { bubbleId: box.bubble.id, moved: false };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const p = toNatural(event);
    if (!gesture.current) {
      const box = edgeAt(p);
      setHoverEdge(box?.bubble.id ?? null);
      return;
    }
    gesture.current.moved = true;
    const stored = forum.bubbles.find((bubble) => bubble.id === gesture.current!.bubbleId);
    const box = layout.bubbles.find((b) => b.bubble.id === gesture.current!.bubbleId);
    if (!stored || !box) return;
    const onLeft = onLeftSide(stored.slot);
    // The outer edge is the anchor: width = pointer distance from it.
    const outer = onLeft ? box.x : box.x + box.w;
    const widthPx = onLeft ? p.x - outer : outer - p.x;
    const share = Math.min(
      maxShareFor(stored.id),
      Math.max(MIN_SHARE, widthPx / layout.width),
    );
    setDrag({ bubbleId: stored.id, share });
  };

  const onPointerUp = () => {
    const active = gesture.current;
    gesture.current = null;
    if (!active || !drag || !active.moved) {
      setDrag(null);
      return;
    }
    // One commit per gesture, and the block is re-measured with it — the height is
    // the wrap's output, never the drag's.
    const next = {
      ...diagram,
      forum: {
        ...forum,
        bubbles: forum.bubbles.map((bubble) =>
          bubble.id === drag.bubbleId
            ? { ...bubble, width: Math.round(drag.share * 1000) / 1000 }
            : bubble,
        ),
      },
    };
    setDrag(null);
    onChange({ ...block, ...diagramSize(next, block.widthPx, language), diagram: next });
  };

  return (
    <div className="zone-dark fixed inset-0 z-50 flex animate-fade-in flex-col bg-desk/95 backdrop-blur-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3 text-ink">
        <span className="text-sm font-semibold tracking-wide text-ink">Adjust forum bubbles</span>

        <label className="flex items-center gap-2 text-xs font-medium text-ink">
          Zoom
          <select
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-9 rounded-md border border-line-strong bg-surface-raised px-2 text-xs text-ink"
          >
            {ZOOMS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>

        <span className="flex-1" />
        <span className="max-w-96 text-xs leading-snug text-ink-muted">
          Drag a bubble&rsquo;s inner edge to resize it — the words re-wrap to fit. Wording,
          corners and the picture are edited in the sidebar.
        </span>
        <Button onClick={onClose}>Done</Button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-8">
        <div
          ref={stageRef}
          className="relative select-none bg-white shadow-2xl"
          style={{
            width: size.widthPx * zoom,
            height: size.heightPx * zoom,
            touchAction: 'none',
            cursor: drag || hoverEdge ? 'ew-resize' : 'default',
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={() => setHoverEdge(null)}
        >
          <div
            className="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          {/* Grips drawn over the real SVG, so the geometry underneath stays exactly
              what exports. Always live, never gated on hover (§ canvas rules); the
              hover state only paints them. */}
          <svg
            className="pointer-events-none absolute inset-0 h-full w-full"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            {layout.bubbles
              .filter((box) => box.bubble.id !== 'placeholder')
              .map((box) => {
                const edge = innerEdgeX(box, onLeftSide(box.bubble.slot));
                const active = drag?.bubbleId === box.bubble.id || hoverEdge === box.bubble.id;
                return (
                  <g key={box.bubble.id}>
                    <line
                      x1={edge}
                      y1={box.y}
                      x2={edge}
                      y2={box.y + box.h}
                      stroke="#0284c7"
                      strokeWidth={(active ? 2.5 : 1.25) / zoom}
                      opacity={active ? 0.9 : 0.35}
                    />
                    <rect
                      x={edge - 2.5}
                      y={box.y + box.h / 2 - 7}
                      width={5}
                      height={14}
                      rx={2}
                      fill={active ? '#0284c7' : '#7dd3fc'}
                    />
                  </g>
                );
              })}
          </svg>
        </div>
      </div>
    </div>
  );
}
