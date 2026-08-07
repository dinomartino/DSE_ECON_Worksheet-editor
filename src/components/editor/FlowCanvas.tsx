'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FlowChart, FlowNode } from '@/model/diagram';
import { addFlowNode, connectFlow, moveNodeToSlot, removeFlowNode } from '@/model/flowEdits';
import { emptyBiText, isBiTextEmpty, parseRuns, plain, serializeRuns } from '@/model/text';
import type { BiText, DiagramBlock, LanguageMode } from '@/model/types';
import {
  diagramSize,
  diagramSvg,
  flowChartLayout,
  type FlowArrowLayout,
  type FlowBoxLayout,
} from '@/render/diagram';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, Eyebrow, IconButton, SelectField } from '@/components/ui';
import { useModalLayer } from '@/components/ui/modalLayer';
import { BiTextField } from './BiTextField';

/**
 * The flow chart's editor: direct manipulation on the chart itself.
 *
 * The sidebar's field list could edit a flow chart but not *show* one — moving a stage
 * meant guessing what ◀▲▼▶ would do to a picture rendered elsewhere. This surface is
 * the flow equivalent of `DiagramCanvas`: the stage draws the same SVG the export
 * rasterizes, boxes are dragged between slots on the picture, arrows are drawn
 * box-to-box, and text is retyped where it prints.
 *
 * The layout stays **slot-based** under every gesture: a drag commits a column and an
 * insertion index (`moveNodeToSlot`), never a pixel position — the dashed drop
 * indicator shows the slot, not the pointer. Canvas house rules apply: in-flight state
 * is local and the store is written once on release; a single dragged box deselects
 * itself; the projection is shared (`flowChartLayout` returns the exact rectangles
 * `flowSvg` drew, so hit-testing is pointer ÷ zoom).
 */

const ZOOMS = [1, 1.5, 2, 3];
const DEFAULT_ZOOM = 1.5;
/** How far past a chart's outermost column a drag must travel to mean "new column". */
const NEW_COLUMN_REACH = 30;

type FlowSelection = { kind: 'node'; id: string } | { kind: 'arrow'; id: string } | null;

/** What the inline editor is retyping: a box, or one side of an arrow's label pair. */
type FlowEditing =
  | { kind: 'node'; id: string }
  | { kind: 'arrow'; id: string; side: 'above' | 'below' }
  | null;

interface SlotTarget {
  col: number;
  index: number;
  /** Indicator rectangle, natural units. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Distance from a point to the arrow's segment, for shaft hit-testing. */
function distToSegment(p: { x: number; y: number }, seg: FlowArrowLayout): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - seg.x1) * dx + (p.y - seg.y1) * dy) / lengthSq));
  return Math.hypot(p.x - (seg.x1 + t * dx), p.y - (seg.y1 + t * dy));
}

/** What an arrow endpoint select calls a box: its own words, or a positional name. */
function nodeName(node: FlowNode, index: number): string {
  return plain(node.label.en).trim() || plain(node.label.zh).trim() || `Box ${index + 1}`;
}

export function FlowCanvas({
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
  // Memoised so the fallback's identity is stable for the hooks that depend on it.
  const flow = useMemo(() => diagram.flow ?? { nodes: [], arrows: [] }, [diagram.flow]);

  const [tool, setTool] = useState<'select' | 'arrow'>('select');
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [selection, setSelection] = useState<FlowSelection>(null);
  const [editing, setEditing] = useState<FlowEditing>(null);
  /**
   * In-flight node drag: what is dragged and where the pointer is, natural units.
   * State (not the gesture ref) because the ghost and slot indicator render from it —
   * refs may not be read during render. Store written on release only.
   */
  const [drag, setDrag] = useState<{ nodeId: string; x: number; y: number } | null>(null);
  const [arrowDraft, setArrowDraft] = useState<{
    from?: string;
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const [hover, setHover] = useState<FlowSelection>(null);

  const gesture = useRef<{ nodeId: string; startX: number; startY: number; moved: boolean } | null>(
    null,
  );
  const stageRef = useRef<HTMLDivElement>(null);

  // The shared projection: these are the rectangles the SVG below actually drew.
  const layout = useMemo(() => flowChartLayout(diagram, flow, language), [diagram, flow, language]);
  const svg = useMemo(
    () =>
      diagramSvg(diagram, {
        widthPx: layout.width,
        heightPx: layout.height,
        language,
        fonts,
      }),
    [diagram, layout, language, fonts],
  );

  const commit = useCallback(
    (nextFlow: FlowChart) => {
      // Every commit re-measures: a moved or reworded stage changes the chart's box.
      const next = { ...block.diagram, flow: nextFlow };
      onChange({ ...block, ...diagramSize(next, block.widthPx, language), diagram: next });
    },
    [block, onChange, language],
  );

  const toNatural = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = stageRef.current!.getBoundingClientRect();
      return { x: (event.clientX - rect.left) / zoom, y: (event.clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const boxAt = useCallback(
    (p: { x: number; y: number }): FlowBoxLayout | undefined =>
      [...layout.boxes]
        .reverse()
        .find(
          (b) => p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2,
        ),
    [layout],
  );

  const arrowAt = useCallback(
    (p: { x: number; y: number }): FlowArrowLayout | undefined =>
      layout.arrows.find((seg) => distToSegment(p, seg) < 7),
    [layout],
  );

  /**
   * Which slot a drag at `p` would land in. Columns are matched by their drawn x
   * centres; travelling past the outermost column means a new one, whose value is
   * simply one beyond the current extreme (the layout compacts sparse values).
   */
  const slotAt = useCallback(
    (p: { x: number; y: number }, dragId: string): SlotTarget => {
      const dragged = layout.boxes.find((b) => b.node.id === dragId)!;
      const groups = new Map<number, FlowBoxLayout[]>();
      for (const box of layout.boxes) {
        if (box.node.id === dragId || box.node.id === '__empty') continue;
        const list = groups.get(box.node.col) ?? [];
        list.push(box);
        groups.set(box.node.col, list);
      }
      const cols = [...groups.entries()]
        .map(([col, boxes]) => ({
          col,
          boxes: boxes.sort((a, b) => a.y - b.y),
          center: boxes.reduce((sum, b) => sum + b.x + b.w / 2, 0) / boxes.length,
          left: Math.min(...boxes.map((b) => b.x)),
          right: Math.max(...boxes.map((b) => b.x + b.w)),
        }))
        .sort((a, b) => a.center - b.center);

      // The dragged box was the whole chart: it stays the only column.
      if (cols.length === 0)
        return { col: dragged.node.col, index: 0, x: p.x - dragged.w / 2, y: p.y - dragged.h / 2, w: dragged.w, h: dragged.h };

      const colValues = cols.map((c) => c.col);
      if (p.x < cols[0].left - NEW_COLUMN_REACH) {
        return {
          col: Math.min(...colValues) - 1,
          index: 0,
          x: p.x - dragged.w / 2,
          y: p.y - dragged.h / 2,
          w: dragged.w,
          h: dragged.h,
        };
      }
      if (p.x > cols[cols.length - 1].right + NEW_COLUMN_REACH) {
        return {
          col: Math.max(...colValues) + 1,
          index: 0,
          x: p.x - dragged.w / 2,
          y: p.y - dragged.h / 2,
          w: dragged.w,
          h: dragged.h,
        };
      }

      const target = cols.reduce((best, c) =>
        Math.abs(c.center - p.x) < Math.abs(best.center - p.x) ? c : best,
      );
      const index = target.boxes.filter((b) => b.y + b.h / 2 < p.y).length;
      // The indicator sits in the gap the box would land in, centred on the column.
      const y =
        target.boxes.length === 0
          ? p.y - dragged.h / 2
          : index === 0
            ? target.boxes[0].y - dragged.h - 8
            : index === target.boxes.length
              ? target.boxes[index - 1].y + target.boxes[index - 1].h + 8
              : (target.boxes[index - 1].y +
                  target.boxes[index - 1].h +
                  target.boxes[index].y -
                  dragged.h) /
                2;
      return {
        col: target.col,
        index,
        x: target.center - dragged.w / 2,
        y,
        w: dragged.w,
        h: dragged.h,
      };
    },
    [layout],
  );

  const doDelete = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'node') commit(removeFlowNode(flow, selection.id));
    else commit({ ...flow, arrows: flow.arrows.filter((a) => a.id !== selection.id) });
    setSelection(null);
  }, [selection, flow, commit]);

  /** Add an empty box (to the selected box's column, else the rightmost) and name it. */
  const addBox = useCallback(
    (col?: number) => {
      const target =
        col ??
        (selection?.kind === 'node'
          ? flow.nodes.find((n) => n.id === selection.id)?.col
          : undefined) ??
        (flow.nodes.length > 0 ? Math.max(...flow.nodes.map((n) => n.col)) : 0);
      const made = addFlowNode(flow, target);
      commit(made.flow);
      setSelection({ kind: 'node', id: made.node.id });
      // Straight into typing: an unnamed box is not yet a stage.
      setEditing({ kind: 'node', id: made.node.id });
    },
    [flow, selection, commit],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      )
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        // One step back per press: abandon the arrow, then the tool, then the
        // selection, and only then the whole editor.
        if (arrowDraft) setArrowDraft(null);
        else if (tool === 'arrow') setTool('select');
        else if (selection) setSelection(null);
        else onClose();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault();
        doDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [arrowDraft, tool, selection, doDelete, onClose]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    const p = toNatural(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    if (tool === 'arrow') {
      const box = boxAt(p);
      const from = box && box.node.id !== '__empty' ? box.node.id : undefined;
      setArrowDraft({ from, start: p, current: p });
      return;
    }

    const box = boxAt(p);
    if (box && box.node.id !== '__empty') {
      gesture.current = { nodeId: box.node.id, startX: p.x, startY: p.y, moved: false };
      return;
    }
    const seg = arrowAt(p);
    if (seg) {
      setSelection({ kind: 'arrow', id: seg.arrow.id });
      return;
    }
    setSelection(null);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const p = toNatural(event);
    if (arrowDraft) {
      setArrowDraft({ ...arrowDraft, current: p });
      return;
    }
    const g = gesture.current;
    if (g) {
      if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) * zoom < 4) return;
      g.moved = true;
      setDrag({ nodeId: g.nodeId, x: p.x, y: p.y });
      return;
    }
    // Hover affordance: the cursor is what says "this box will move if you press".
    const box = boxAt(p);
    if (box && box.node.id !== '__empty') setHover({ kind: 'node', id: box.node.id });
    else {
      const seg = arrowAt(p);
      setHover(seg ? { kind: 'arrow', id: seg.arrow.id } : null);
    }
  };

  const onPointerUp = (event: React.PointerEvent) => {
    const p = toNatural(event);
    if (arrowDraft) {
      const box = boxAt(p);
      const to = box && box.node.id !== '__empty' ? box.node.id : undefined;
      const made = connectFlow(flow, arrowDraft.from, to);
      setArrowDraft(null);
      setTool('select');
      if (made) {
        commit(made.flow);
        setSelection({ kind: 'arrow', id: made.arrowId });
      }
      return;
    }
    const g = gesture.current;
    gesture.current = null;
    setDrag(null);
    if (!g) return;
    if (!g.moved) {
      setSelection({ kind: 'node', id: g.nodeId });
      return;
    }
    const slot = slotAt(p, g.nodeId);
    commit(moveNodeToSlot(flow, g.nodeId, slot.col, slot.index));
    // A drag lets go of what it moved, so the next click starts clean.
    setSelection(null);
  };

  const onDoubleClick = (event: React.MouseEvent) => {
    const p = toNatural(event);
    const box = boxAt(p);
    if (box) {
      if (box.node.id === '__empty') {
        addBox(0);
        return;
      }
      setSelection({ kind: 'node', id: box.node.id });
      setEditing({ kind: 'node', id: box.node.id });
      return;
    }
    const seg = arrowAt(p);
    if (seg) {
      // Retype whichever side has words; a bare arrow opens the above slot.
      const side = seg.arrow.label || !seg.arrow.labelBelow ? 'above' : 'below';
      setSelection({ kind: 'arrow', id: seg.arrow.id });
      setEditing({ kind: 'arrow', id: seg.arrow.id, side });
    }
  };

  // Resolve what the in-flight chrome needs, tolerating stale ids after deletes.
  const selectedBox =
    selection?.kind === 'node'
      ? layout.boxes.find((b) => b.node.id === selection.id)
      : undefined;
  const selectedSeg =
    selection?.kind === 'arrow'
      ? layout.arrows.find((a) => a.arrow.id === selection.id)
      : undefined;
  const slot = drag ? slotAt(drag, drag.nodeId) : null;
  const draggedBox = drag ? layout.boxes.find((b) => b.node.id === drag.nodeId) : undefined;

  // Where the inline text editor opens: over the words it replaces.
  const editingBox =
    editing?.kind === 'node' ? layout.boxes.find((b) => b.node.id === editing.id) : undefined;
  const editingSeg =
    editing?.kind === 'arrow' ? layout.arrows.find((a) => a.arrow.id === editing.id) : undefined;
  const editingNode = editing?.kind === 'node' ? flow.nodes.find((n) => n.id === editing.id) : undefined;
  const editingArrow =
    editing?.kind === 'arrow' ? flow.arrows.find((a) => a.id === editing.id) : undefined;

  const hint =
    tool === 'arrow'
      ? 'Drag from one box to another to connect them. Release on empty paper for an open-ended stub.'
      : flow.nodes.length === 0
        ? 'Double-click the empty box (or press + Box) to add the first stage.'
        : 'Drag a box to move it between columns. Click to select and edit. Double-click text to retype it.';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-700 bg-slate-800 px-5 py-3 text-slate-100">
        <span className="text-sm font-semibold tracking-wide text-slate-200">Edit flow chart</span>

        <div className="flex gap-1.5">
          {(
            [
              ['select', '↖', 'Select', 'Drag boxes between columns; click to select and edit.'],
              ['arrow', '→', 'Arrow', 'Drag from one box to another to connect them.'],
            ] as const
          ).map(([id, glyph, name, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={
                'flex h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 text-base transition-colors ' +
                (tool === id
                  ? 'border-sky-400 bg-sky-500 text-white'
                  : 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600')
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {glyph}
              </span>
              <span className="text-xs font-medium">{name}</span>
            </button>
          ))}
        </div>

        <span className="h-8 w-px bg-slate-600" />

        <div className="flex gap-1.5">
          <button
            type="button"
            title="Add a box to the selected column"
            onClick={() => addBox()}
            className="flex h-11 items-center rounded-lg border border-slate-600 bg-slate-700 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-600"
          >
            + Box
          </button>
          <button
            type="button"
            title="Add a new column on the right, with one box"
            onClick={() =>
              addBox(flow.nodes.length > 0 ? Math.max(...flow.nodes.map((n) => n.col)) + 1 : 0)
            }
            className="flex h-11 items-center rounded-lg border border-slate-600 bg-slate-700 px-3 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-600"
          >
            + Column
          </button>
          <button
            type="button"
            title="Delete the selection (⌫)"
            onClick={doDelete}
            disabled={!selection}
            className={
              'flex h-11 items-center rounded-lg border px-3 text-xs font-medium transition-colors ' +
              'disabled:pointer-events-none disabled:opacity-35 ' +
              (selection
                ? 'border-rose-500/60 bg-rose-600/20 text-rose-200 hover:bg-rose-600/40'
                : 'border-slate-600 bg-slate-700 text-slate-200')
            }
          >
            Delete
          </button>
        </div>

        <span className="h-8 w-px bg-slate-600" />

        <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
          Zoom
          <select
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="h-9 rounded-md border border-slate-600 bg-slate-700 px-2 text-xs text-slate-100"
          >
            {ZOOMS.map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
        </label>

        <span className="flex-1" />
        <span className="max-w-96 text-xs leading-snug text-slate-300">{hint}</span>
        <Button onClick={onClose}>Done</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-8">
          <div
            ref={stageRef}
            className="relative select-none bg-white shadow-2xl"
            style={{
              width: layout.width * zoom,
              height: layout.height * zoom,
              touchAction: 'none',
              cursor:
                tool === 'arrow'
                  ? 'crosshair'
                  : drag
                    ? 'grabbing'
                    : hover?.kind === 'node'
                      ? 'grab'
                      : hover?.kind === 'arrow'
                        ? 'pointer'
                        : 'default',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHover(null)}
            onDoubleClick={onDoubleClick}
          >
            <div
              className="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />

            {/* Selection, hover, drop indicator and the arrow draft, drawn over the
                real SVG so the geometry underneath stays exactly what exports. */}
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox={`0 0 ${layout.width} ${layout.height}`}
            >
              {selectedBox && (
                <rect
                  x={selectedBox.x - 3}
                  y={selectedBox.y - 3}
                  width={selectedBox.w + 6}
                  height={selectedBox.h + 6}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={1.5 / zoom}
                  rx={2}
                />
              )}
              {selectedSeg && (
                <line
                  x1={selectedSeg.x1}
                  y1={selectedSeg.y1}
                  x2={selectedSeg.x2}
                  y2={selectedSeg.y2}
                  stroke="#0284c7"
                  strokeWidth={4 / zoom}
                  strokeLinecap="round"
                  opacity={0.45}
                />
              )}
              {hover && hover.kind === 'node' && hover.id !== selection?.id && !drag && (
                (() => {
                  const box = layout.boxes.find((b) => b.node.id === hover.id);
                  return box ? (
                    <rect
                      x={box.x - 2}
                      y={box.y - 2}
                      width={box.w + 4}
                      height={box.h + 4}
                      fill="none"
                      stroke="#7dd3fc"
                      strokeWidth={1.25 / zoom}
                      rx={2}
                    />
                  ) : null;
                })()
              )}
              {slot && (
                <rect
                  x={slot.x}
                  y={slot.y}
                  width={slot.w}
                  height={slot.h}
                  fill="#0ea5e9"
                  fillOpacity={0.1}
                  stroke="#0284c7"
                  strokeWidth={1.25 / zoom}
                  strokeDasharray={`${4 / zoom},${3 / zoom}`}
                  rx={2}
                />
              )}
              {slot && draggedBox && drag && (
                <rect
                  x={drag.x - draggedBox.w / 2}
                  y={drag.y - draggedBox.h / 2}
                  width={draggedBox.w}
                  height={draggedBox.h}
                  fill="#fff"
                  fillOpacity={0.65}
                  stroke="#0284c7"
                  strokeWidth={1 / zoom}
                  rx={2}
                />
              )}
              {arrowDraft && (
                <line
                  x1={arrowDraft.start.x}
                  y1={arrowDraft.start.y}
                  x2={arrowDraft.current.x}
                  y2={arrowDraft.current.y}
                  stroke="#0284c7"
                  strokeWidth={1.5 / zoom}
                  strokeDasharray={`${5 / zoom},${3 / zoom}`}
                />
              )}
            </svg>

            {editing && (editingBox || editingSeg) && (editingNode || editingArrow) && (
              <FlowTextEditor
                at={(() => {
                  if (editingBox)
                    return { x: editingBox.x + editingBox.w / 2, y: editingBox.y + editingBox.h / 2 };
                  const seg = editingSeg!;
                  const below = editing.kind === 'arrow' && editing.side === 'below';
                  const placed = below ? seg.labelBelow : seg.label;
                  if (placed) return { x: placed.x, y: placed.y - 4 };
                  return {
                    x: (seg.x1 + seg.x2) / 2,
                    y: (seg.y1 + seg.y2) / 2 + (below ? 10 : -10),
                  };
                })()}
                value={
                  editingNode
                    ? editingNode.label
                    : ((editing.kind === 'arrow' && editing.side === 'below'
                        ? editingArrow!.labelBelow
                        : editingArrow!.label) ?? emptyBiText())
                }
                language={language}
                zoom={zoom}
                onCommit={(text) => {
                  if (editing.kind === 'node') {
                    commit({
                      ...flow,
                      nodes: flow.nodes.map((n) =>
                        n.id === editing.id ? { ...n, label: text } : n,
                      ),
                    });
                  } else {
                    // A label cleared to nothing stores nothing.
                    const field = editing.side === 'below' ? 'labelBelow' : 'label';
                    commit({
                      ...flow,
                      arrows: flow.arrows.map((a) =>
                        a.id === editing.id
                          ? { ...a, [field]: isBiTextEmpty(text) ? undefined : text }
                          : a,
                      ),
                    });
                  }
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-700 bg-white p-4 dark:bg-slate-900">
          <FlowInspector
            flow={flow}
            selection={selection}
            onChange={commit}
            onSelect={setSelection}
            onDelete={doDelete}
          />
        </aside>
      </div>
    </div>
  );
}

/**
 * Retyping flow text where it prints — the `DiagramCanvas` text editor's shape: a
 * plain input over the words, storage markers round-trip through `parseRuns`, the
 * shown language side is the one being edited.
 */
function FlowTextEditor({
  at,
  value,
  language,
  zoom,
  onCommit,
  onCancel,
}: {
  at: { x: number; y: number };
  value: BiText;
  language: LanguageMode;
  zoom: number;
  onCommit: (text: BiText) => void;
  onCancel: () => void;
}) {
  const side: 'en' | 'zh' = language === 'zh' ? 'zh' : 'en';
  const [draft, setDraft] = useState(() => serializeRuns(value[side]));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => onCommit({ ...value, [side]: parseRuns(draft) });

  return (
    <div
      style={{
        position: 'absolute',
        left: at.x * zoom,
        top: at.y * zoom,
        transform: 'translate(-50%, -50%)',
      }}
      className="z-10"
    >
      <input
        ref={inputRef}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        style={{
          width: `${Math.max(110, draft.length * 9 + 40)}px`,
          font: `${13 * zoom}px/1.2 inherit`,
          textAlign: 'center',
        }}
        className="rounded border-2 border-sky-500 bg-white px-1.5 py-0.5 text-slate-900 shadow-lg outline-none"
        aria-label="Edit flow chart text"
      />
    </div>
  );
}

/**
 * The right panel: properties of the selection, or the chart's index when nothing is
 * selected. Everything here is a fallback with a precise value — the chart itself is
 * where boxes move and arrows are drawn.
 */
function FlowInspector({
  flow,
  selection,
  onChange,
  onSelect,
  onDelete,
}: {
  flow: FlowChart;
  selection: FlowSelection;
  onChange: (flow: FlowChart) => void;
  onSelect: (selection: FlowSelection) => void;
  onDelete: () => void;
}) {
  const node = selection?.kind === 'node' ? flow.nodes.find((n) => n.id === selection.id) : undefined;
  const arrow =
    selection?.kind === 'arrow' ? flow.arrows.find((a) => a.id === selection.id) : undefined;

  const header = (title: string) => (
    <header className="mb-2 flex items-center gap-1">
      <Eyebrow>{title}</Eyebrow>
      <span className="flex-1" />
      <IconButton label="Delete" variant="danger" onClick={onDelete}>
        <span aria-hidden>✕</span>
      </IconButton>
    </header>
  );

  if (node) {
    const patch = (change: Partial<FlowNode>) =>
      onChange({
        ...flow,
        nodes: flow.nodes.map((n) => (n.id === node.id ? { ...n, ...change } : n)),
      });
    return (
      <div>
        {header(nodeName(node, flow.nodes.indexOf(node)))}
        <div className="space-y-2">
          <BiTextField label="Text" value={node.label} rows={2} onChange={(label) => patch({ label })} />
          <CheckField
            label="Draw the box"
            checked={node.boxed !== false}
            onChange={(boxed) => patch({ boxed: boxed ? undefined : false })}
          />
          <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
            Drag the box on the chart to move it — past the outermost column starts a
            new column.
          </p>
        </div>
      </div>
    );
  }

  if (arrow) {
    const patch = (change: Partial<typeof arrow>) =>
      onChange({
        ...flow,
        arrows: flow.arrows.map((a) => (a.id === arrow.id ? { ...a, ...change } : a)),
      });
    const options = [
      { value: '', label: '(open end)' },
      ...flow.nodes.map((n, index) => ({ value: n.id, label: nodeName(n, index) })),
    ];
    return (
      <div>
        {header('Arrow')}
        <div className="space-y-2">
          <SelectField
            label="From"
            value={arrow.from ?? ''}
            options={options}
            onChange={(value) => patch({ from: value === '' ? undefined : String(value) })}
          />
          <SelectField
            label="To"
            value={arrow.to ?? ''}
            options={options}
            onChange={(value) => patch({ to: value === '' ? undefined : String(value) })}
          />
          {/* Two slots, as the reference charts use them: flow4's stub carries "$200"
              above the shaft and "raw materials" below it, at once. */}
          <BiTextField
            label="Label above"
            value={arrow.label ?? emptyBiText()}
            rows={2}
            onChange={(label) => patch({ label: isBiTextEmpty(label) ? undefined : label })}
          />
          <BiTextField
            label="Label below"
            value={arrow.labelBelow ?? emptyBiText()}
            rows={2}
            onChange={(labelBelow) =>
              patch({ labelBelow: isBiTextEmpty(labelBelow) ? undefined : labelBelow })
            }
          />
        </div>
      </div>
    );
  }

  // Nothing selected: the chart's index, with every row a way in — an arrow buried
  // under another is reachable here by name when it cannot be clicked.
  const colValues = [...new Set(flow.nodes.map((n) => n.col))].sort((a, b) => a - b);
  return (
    <div>
      <Eyebrow>On this chart</Eyebrow>
      {flow.nodes.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Nothing here yet. Press <strong>+ Box</strong> (or double-click the empty box)
          to add the first stage.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {colValues.map((col, colIdx) => (
            <li key={col}>
              <span className="block px-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Column {colIdx + 1}
              </span>
              <ul>
                {flow.nodes
                  .filter((n) => n.col === col)
                  .sort((a, b) => a.row - b.row)
                  .map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => onSelect({ kind: 'node', id: n.id })}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        <span className="truncate font-medium">
                          {nodeName(n, flow.nodes.indexOf(n))}
                        </span>
                        <span className="flex-1" />
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                          {n.boxed === false ? 'Text' : 'Box'}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
          {flow.arrows.length > 0 && (
            <li className="pt-1">
              <span className="block px-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Arrows
              </span>
              <ul>
                {flow.arrows.map((a, index) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ kind: 'arrow', id: a.id })}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <span className="truncate font-medium">
                        {plain(a.label?.en ?? []) ||
                          plain(a.labelBelow?.en ?? []) ||
                          `Arrow ${index + 1}`}
                      </span>
                      <span className="flex-1" />
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                        Arrow
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
      <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Drag a box to move it between columns — past the outermost column starts a new
        one. Double-click any text to retype it. Pick <strong>Arrow</strong> and drag
        box-to-box to connect stages; release on empty paper for an open-ended stub.
        ⌫ deletes the selection.
      </p>
    </div>
  );
}
