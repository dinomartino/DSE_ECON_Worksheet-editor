'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { FlowArrow, FlowChart, FlowNode } from '@/model/diagram';
import {
  addFlowNode,
  connectFlow,
  moveNodeToCell,
  moveNodeToSlot,
  removeFlowNode,
  setFlowLayout,
} from '@/model/flowEdits';
import { bi, emptyBiText, isBiTextEmpty, parseRuns, plain, serializeRuns } from '@/model/text';
import type { BiText, DiagramBlock, FontPair, LanguageMode } from '@/model/types';
import {
  diagramSize,
  diagramSvg,
  distToFlowArrow,
  flowChartLayout,
  type FlowArrowLayout,
  type FlowBoxLayout,
} from '@/render/diagram';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, Eyebrow, IconButton, SelectField } from '@/components/ui';
import { useModalLayer } from '@/components/ui/modalLayer';
import { BiTextField } from './BiTextField';
import { useMessages } from '@/i18n/language';
import { FieldScopeContext } from './fieldScope';
import { DIAGRAM_COMMON_MESSAGES, FLOW_CANVAS_MESSAGES } from './diagramEditing.messages';
import { isImeKeydown } from '@/components/ui/ime';

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
  /** Grid layout (k-0588): the row the box lands in; `index` is then unused. */
  row?: number;
  /** Indicator rectangle, natural units. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A drawn arrow's corners: a straight shaft's two ends, or a routed loop's points. */
function segPoints(seg: FlowArrowLayout): Array<{ x: number; y: number }> {
  return seg.points ?? [
    { x: seg.x1, y: seg.y1 },
    { x: seg.x2, y: seg.y2 },
  ];
}

/** Where an arrow's words go when it has none yet: the middle of its run (a loop's lane). */
function segMiddle(seg: FlowArrowLayout): { x: number; y: number } {
  const points = segPoints(seg);
  const [a, b] = points.length === 4 ? [points[1], points[2]] : [points[0], points[points.length - 1]];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Drop the keys set to undefined, so an untouched field stays absent in the file. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}

/** The money / real flow key's default words, printed text (k-0588). */
const DEFAULT_KEY = { dashed: bi('Money flow', '貨幣流程'), solid: bi('Real flow', '實質流程') };

/** What an arrow endpoint select calls a box: its own words, or a positional name. */
function nodeName(node: FlowNode, index: number, m: { box: (n: number) => string }, side: 'en' | 'zh' = 'en'): string {
  const other = side === 'en' ? 'zh' : 'en';
  return plain(node.label[side]).trim() || plain(node.label[other]).trim() || m.box(index + 1);
}

export function FlowCanvas({
  block,
  onChange,
  onClose,
  language: languageProp,
  fonts: fontsProp,
  embedded = false,
  panel,
  keysSuspended = false,
}: {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
  onClose?: () => void;
  /** Win over the worksheet store: a saved graph draws in its own language and fonts. */
  language?: LanguageMode;
  fonts?: FontPair;
  /** A page surface (Graphs): no Done, Escape never leaves. */
  embedded?: boolean;
  /** Shown above the inspector (embedded: the graph's own settings). */
  panel?: ReactNode;
  /** A dialog over the embedded canvas owns the keyboard; the shortcuts stand down. */
  keysSuspended?: boolean;
}) {
  useModalLayer();
  const m = useMessages(FLOW_CANVAS_MESSAGES);
  const storeLanguage = useWorksheetStore((s) => s.mode.language);
  const storeFonts = useWorksheetStore((s) => s.worksheet.fonts);
  const language = languageProp ?? storeLanguage;
  const fonts = fontsProp ?? storeFonts;

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
  /**
   * "Clear chart" is armed by a first click and fired by a second — undo lives in the
   * page's keyboard scope, unreachable while this modal owns it, so a single misclick
   * must not cost the whole chart. Any other gesture (or a pause) disarms.
   */
  const [confirmClear, setConfirmClear] = useState(false);
  const [arrowDraft, setArrowDraft] = useState<{
    from?: string;
    /** The gesture started on the empty-chart placeholder box. */
    fromEmpty?: boolean;
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
      layout.arrows.find((seg) => distToFlowArrow(p, seg) < 7),
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
      if (flow.layout === 'grid') {
        // Grid (k-0588): the nearest column and the nearest row, each by its drawn centre;
        // past the outermost one on either axis starts a new one. The indicator is the cell.
        const others = layout.boxes.filter((b) => b.node.id !== dragId && b.node.id !== '__empty');
        const lines = (axis: 'col' | 'row') => {
          const byValue = new Map<number, FlowBoxLayout[]>();
          for (const box of others) byValue.set(box.node[axis], [...(byValue.get(box.node[axis]) ?? []), box]);
          return [...byValue.entries()]
            .map(([value, boxes]) => ({
              value,
              center:
                boxes.reduce((sum, b) => sum + (axis === 'col' ? b.x + b.w / 2 : b.y + b.h / 2), 0) / boxes.length,
              lo: Math.min(...boxes.map((b) => (axis === 'col' ? b.x : b.y))),
              hi: Math.max(...boxes.map((b) => (axis === 'col' ? b.x + b.w : b.y + b.h))),
            }))
            .sort((a, b) => a.center - b.center);
        };
        const pick = (axis: 'col' | 'row', at: number) => {
          const list = lines(axis);
          if (list.length === 0) return { value: dragged.node[axis], center: at };
          if (at < list[0].lo - NEW_COLUMN_REACH) return { value: Math.min(...list.map((l) => l.value)) - 1, center: at };
          if (at > list[list.length - 1].hi + NEW_COLUMN_REACH)
            return { value: Math.max(...list.map((l) => l.value)) + 1, center: at };
          return list.reduce((best, l) => (Math.abs(l.center - at) < Math.abs(best.center - at) ? l : best));
        };
        const col = pick('col', p.x);
        const row = pick('row', p.y);
        return {
          col: col.value,
          row: row.value,
          index: 0,
          x: col.center - dragged.w / 2,
          y: row.center - dragged.h / 2,
          w: dragged.w,
          h: dragged.h,
        };
      }
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
    [layout, flow.layout],
  );

  const doDelete = useCallback(() => {
    if (!selection) return;
    if (selection.kind === 'node') commit(removeFlowNode(flow, selection.id));
    else commit({ ...flow, arrows: flow.arrows.filter((a) => a.id !== selection.id) });
    setSelection(null);
  }, [selection, flow, commit]);

  /** Empty the whole chart in one commit — the template's seeded stages go together. */
  const clearChart = useCallback(() => {
    commit({ nodes: [], arrows: [] });
    setSelection(null);
    setEditing(null);
    setConfirmClear(false);
  }, [commit]);

  useEffect(() => {
    if (!confirmClear) return;
    const timer = window.setTimeout(() => setConfirmClear(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirmClear]);

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
      if (keysSuspended) return;
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
        // One step back per press: disarm the clear, abandon the arrow, then the
        // tool, then the selection, and only then the whole editor.
        if (confirmClear) setConfirmClear(false);
        else if (arrowDraft) setArrowDraft(null);
        else if (tool === 'arrow') setTool('select');
        else if (selection) setSelection(null);
        else if (!embedded) onClose?.();
        return;
      }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selection) {
        event.preventDefault();
        doDelete();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmClear, arrowDraft, tool, selection, doDelete, onClose, embedded, keysSuspended]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    setConfirmClear(false);
    const p = toNatural(event);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);

    if (tool === 'arrow') {
      const box = boxAt(p);
      const from = box && box.node.id !== '__empty' ? box.node.id : undefined;
      setArrowDraft({ from, fromEmpty: box?.node.id === '__empty', start: p, current: p });
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
      const releasedOnEmpty = box?.node.id === '__empty';
      let chart = flow;
      let from = arrowDraft.from;
      let to = box && !releasedOnEmpty ? box.node.id : undefined;
      let newNodeId: string | undefined;
      // An arrow gesture touching the empty-chart placeholder makes the first stage —
      // the reference's entering stub ("$200 raw materials →") exists before its
      // chain does, so refusing it here dead-ended a fresh chart. A gesture wholly
      // inside the placeholder names no direction and still draws nothing.
      if (flow.nodes.length === 0 && arrowDraft.fromEmpty !== releasedOnEmpty) {
        const made = addFlowNode(chart, 0);
        chart = made.flow;
        newNodeId = made.node.id;
        if (releasedOnEmpty) to = newNodeId;
        else from = newNodeId;
      }
      const made = connectFlow(chart, from, to);
      setArrowDraft(null);
      setTool('select');
      if (made) {
        commit(made.flow);
        setSelection({ kind: 'arrow', id: made.arrowId });
        // Straight into naming the stage the gesture just created.
        if (newNodeId) setEditing({ kind: 'node', id: newNodeId });
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
    commit(
      slot.row !== undefined
        ? moveNodeToCell(flow, g.nodeId, slot.col, slot.row)
        : moveNodeToSlot(flow, g.nodeId, slot.col, slot.index),
    );
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
      ? m.hintArrowTool
      : flow.nodes.length === 0
        ? m.hintEmpty
        : flow.layout === 'grid'
          ? m.hintSelectGrid
          : m.hintSelect;

  const surface = (
    <div
      className={
        embedded
          ? 'zone-dark flex h-full min-h-0 flex-col bg-desk'
          : 'zone-dark fixed inset-0 z-50 flex animate-fade-in flex-col bg-desk/95 backdrop-blur-sm'
      }
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-5 py-3 text-ink">
        {!embedded && <span className="text-sm font-semibold tracking-wide text-ink">{m.heading}</span>}

        <div className="flex gap-1.5">
          {(
            [
              ['select', '↖', m.select, m.selectHint],
              ['arrow', '→', m.arrow, m.arrowHint],
            ] as const
          ).map(([id, glyph, name, title]) => (
            <button
              key={id}
              type="button"
              title={title}
              aria-pressed={tool === id}
              onClick={() => setTool(id)}
              className={
                'flex h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 text-base ' +
                'transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.97] ' +
                (tool === id
                  ? 'border-accent bg-accent text-on-accent'
                  : 'border-line-strong bg-surface-raised text-ink hover:bg-surface-hover')
              }
            >
              <span aria-hidden className="text-lg leading-none">
                {glyph}
              </span>
              <span className="text-xs font-medium">{name}</span>
            </button>
          ))}
        </div>

        <span className="h-8 w-px bg-line-strong" />

        <div className="flex gap-1.5">
          <button
            type="button"
            title={m.addBoxHint}
            onClick={() => addBox()}
            className="flex h-11 items-center rounded-lg border border-line-strong bg-surface-raised px-3 text-xs font-medium text-ink transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.97] hover:bg-surface-hover"
          >
            {m.addBox}
          </button>
          <button
            type="button"
            title={m.addColumnHint}
            onClick={() =>
              addBox(flow.nodes.length > 0 ? Math.max(...flow.nodes.map((n) => n.col)) + 1 : 0)
            }
            className="flex h-11 items-center rounded-lg border border-line-strong bg-surface-raised px-3 text-xs font-medium text-ink transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.97] hover:bg-surface-hover"
          >
            {m.addColumn}
          </button>
          <button
            type="button"
            title={m.deleteHint}
            onClick={doDelete}
            disabled={!selection}
            className={
              'flex h-11 items-center rounded-lg border px-3 text-xs font-medium ' +
              'transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.97] ' +
              'disabled:pointer-events-none disabled:opacity-35 ' +
              (selection
                ? 'border-danger/60 bg-danger-soft text-danger-ink hover:border-danger'
                : 'border-line-strong bg-surface-raised text-ink')
            }
          >
            {m.delete}
          </button>
          <button
            type="button"
            title={m.clearHint}
            onClick={() => (confirmClear ? clearChart() : setConfirmClear(true))}
            disabled={flow.nodes.length === 0 && flow.arrows.length === 0}
            className={
              'flex h-11 items-center rounded-lg border px-3 text-xs font-medium ' +
              'transition-[background-color,border-color,color,opacity,transform,scale] duration-150 ease-out-soft active:scale-[0.97] ' +
              'disabled:pointer-events-none disabled:opacity-35 ' +
              (confirmClear
                ? 'border-danger bg-danger text-on-danger hover:brightness-110'
                : 'border-line-strong bg-surface-raised text-ink hover:bg-surface-hover')
            }
          >
            {confirmClear ? m.clearConfirm : m.clear}
          </button>
        </div>

        <span className="h-8 w-px bg-line-strong" />

        <label className="flex items-center gap-2 text-xs font-medium text-ink">
          {m.zoom}
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
        <span className="max-w-96 text-xs leading-snug text-ink-muted">{hint}</span>
        {!embedded && <Button onClick={onClose}>{m.done}</Button>}
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
                <polyline
                  points={segPoints(selectedSeg)
                    .map((point) => `${point.x},${point.y}`)
                    .join(' ')}
                  fill="none"
                  stroke="#0284c7"
                  strokeWidth={4 / zoom}
                  strokeLinecap="round"
                  strokeLinejoin="round"
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
                  const middle = segMiddle(seg);
                  return { x: middle.x, y: middle.y + (below ? 10 : -10) };
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

        <aside className="zone-light w-80 shrink-0 overflow-y-auto border-l border-line bg-surface p-4">
          {panel && <div className="mb-4 border-b border-line pb-4">{panel}</div>}
          <FlowInspector
            flow={flow}
            selection={selection}
            onChange={commit}
            onSelect={setSelection}
            onDelete={doDelete}
            side={language === 'zh' ? 'zh' : 'en'}
          />
        </aside>
      </div>
    </div>
  );
  // A graph's own language reaches every field under the canvas; the editor's reads the store.
  return languageProp ? (
    <FieldScopeContext.Provider value={{ language: languageProp, readOnly: false }}>{surface}</FieldScopeContext.Provider>
  ) : (
    surface
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
  const m = useMessages(FLOW_CANVAS_MESSAGES);
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
          if (isImeKeydown(event.nativeEvent)) return;
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
        className="rounded border-2 border-[#2563eb] bg-white px-1.5 py-0.5 text-slate-900 shadow-lg outline-none"
        aria-label={m.editText}
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
  side,
}: {
  flow: FlowChart;
  selection: FlowSelection;
  onChange: (flow: FlowChart) => void;
  onSelect: (selection: FlowSelection) => void;
  onDelete: () => void;
  /** The paper's side: the index names boxes and arrows in the words the chart prints. */
  side: 'en' | 'zh';
}) {
  const m = useMessages(FLOW_CANVAS_MESSAGES);
  const common = useMessages(DIAGRAM_COMMON_MESSAGES);
  const node = selection?.kind === 'node' ? flow.nodes.find((n) => n.id === selection.id) : undefined;
  const arrow =
    selection?.kind === 'arrow' ? flow.arrows.find((a) => a.id === selection.id) : undefined;

  const header = (title: string) => (
    <header className="mb-2 flex items-center gap-1">
      <Eyebrow>{title}</Eyebrow>
      <span className="flex-1" />
      <IconButton label={common.delete} variant="danger" onClick={onDelete}>
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
        {header(nodeName(node, flow.nodes.indexOf(node), m, side))}
        <div className="space-y-2">
          <BiTextField
            label={m.text}
            translate={{ kind: 'flowNode', fallsBack: true }}
            value={node.label}
            rows={2}
            onChange={(label) => patch({ label })}
          />
          <CheckField
            label={m.drawBox}
            checked={node.boxed !== false}
            onChange={(boxed) => patch({ boxed: boxed ? undefined : false })}
          />
          <p className="text-[11px] leading-relaxed text-ink-muted">{m.moveNote}</p>
        </div>
      </div>
    );
  }

  if (arrow) {
    // A field set to undefined is removed, not stored as undefined: an untouched field
    // stays absent in the file, as every build before it wrote it.
    const patch = (change: Partial<FlowArrow>) =>
      onChange({
        ...flow,
        arrows: flow.arrows.map((a) => (a.id === arrow.id ? withoutUndefined({ ...a, ...change }) : a)),
      });
    const options = [
      { value: '', label: m.openEnd },
      ...flow.nodes.map((n, index) => ({ value: n.id, label: nodeName(n, index, m, side) })),
    ];
    return (
      <div>
        {header(m.arrow)}
        <div className="space-y-2">
          <SelectField
            label={m.from}
            value={arrow.from ?? ''}
            options={options}
            onChange={(value) => patch({ from: value === '' ? undefined : String(value) })}
          />
          <SelectField
            label={m.to}
            value={arrow.to ?? ''}
            options={options}
            onChange={(value) => patch({ to: value === '' ? undefined : String(value) })}
          />
          <CheckField
            label={m.dashed}
            checked={arrow.dashed === true}
            onChange={(dashed) => patch({ dashed: dashed ? true : undefined })}
          />
          {arrow.from && arrow.to && (
            <SelectField
              label={m.route}
              value={arrow.route ?? ''}
              options={[
                { value: '', label: m.routeStraight },
                { value: 'above', label: m.routeAbove },
                { value: 'below', label: m.routeBelow },
              ]}
              onChange={(value) =>
                patch({ route: value === 'above' || value === 'below' ? value : undefined })
              }
            />
          )}
          {/* Two slots, as the reference charts use them: flow4's stub carries "$200"
              above the shaft and "raw materials" below it, at once. */}
          <BiTextField
            translate={{ kind: 'flowNode', fallsBack: true }}
            label={m.labelAbove}
            value={arrow.label ?? emptyBiText()}
            rows={2}
            onChange={(label) => patch({ label: isBiTextEmpty(label) ? undefined : label })}
          />
          <BiTextField
            translate={{ kind: 'flowNode', fallsBack: true }}
            label={m.labelBelow}
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
  const setKey = (key: FlowChart['key']) => {
    const { key: _old, ...rest } = flow;
    void _old;
    onChange(key ? { ...rest, key } : rest);
  };
  return (
    <div>
      {/* The chart's own settings (k-0588): the grid draws a triangle of stages; the key
          explains dashed and solid arrows (a circular flow's money and real flows). */}
      <div className="mb-4 space-y-2 border-b border-line pb-4">
        <Eyebrow>{m.chartSettings}</Eyebrow>
        <SelectField
          label={m.layout}
          value={flow.layout === 'grid' ? 'grid' : 'columns'}
          options={[
            { value: 'columns', label: m.layoutColumns },
            { value: 'grid', label: m.layoutGrid },
          ]}
          onChange={(value) => onChange(setFlowLayout(flow, value === 'grid' ? 'grid' : 'columns'))}
        />
        <p className="text-[11px] leading-relaxed text-ink-muted">
          {flow.layout === 'grid' ? m.layoutGridNote : m.layoutColumnsNote}
        </p>
        <CheckField
          label={m.showKey}
          checked={!!flow.key}
          onChange={(on) => setKey(on ? DEFAULT_KEY : undefined)}
        />
        {flow.key && (
          <>
            <BiTextField
              translate={{ kind: 'flowNode', fallsBack: true }}
              label={m.keyDashed}
              value={flow.key.dashed ?? emptyBiText()}
              rows={1}
              onChange={(text) =>
                setKey(withoutUndefined({ ...flow.key, dashed: isBiTextEmpty(text) ? undefined : text }))
              }
            />
            <BiTextField
              translate={{ kind: 'flowNode', fallsBack: true }}
              label={m.keySolid}
              value={flow.key.solid ?? emptyBiText()}
              rows={1}
              onChange={(text) =>
                setKey(withoutUndefined({ ...flow.key, solid: isBiTextEmpty(text) ? undefined : text }))
              }
            />
          </>
        )}
      </div>
      <Eyebrow>{m.onChart}</Eyebrow>
      {flow.nodes.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">
          {m.emptyPre}
          <strong>{m.addBox}</strong>
          {m.emptyPost}
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {colValues.map((col, colIdx) => (
            <li key={col}>
              <span className="block px-2 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                {m.column(colIdx + 1)}
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
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft"
                      >
                        <span className="truncate font-medium">
                          {nodeName(n, flow.nodes.indexOf(n), m, side)}
                        </span>
                        <span className="flex-1" />
                        <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-subtle">
                          {n.boxed === false ? m.text : m.boxKind}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
          {flow.arrows.length > 0 && (
            <li className="pt-1">
              <span className="block px-2 text-[10px] font-medium uppercase tracking-wide text-ink-subtle">
                {m.arrows}
              </span>
              <ul>
                {flow.arrows.map((a, index) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => onSelect({ kind: 'arrow', id: a.id })}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-ink transition-colors duration-150 ease-out-soft hover:bg-accent-soft"
                    >
                      <span className="truncate font-medium">
                        {plain(a.label?.[side] ?? []) ||
                          plain(a.labelBelow?.[side] ?? []) ||
                          m.arrowN(index + 1)}
                      </span>
                      <span className="flex-1" />
                      <span className="shrink-0 text-[10px] uppercase tracking-wide text-ink-subtle">
                        {m.arrow}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )}
        </ul>
      )}
      <p className="mt-4 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-muted">
        {m.helpPre}
        <strong>{m.arrow}</strong>
        {m.helpPost}
      </p>
    </div>
  );
}
