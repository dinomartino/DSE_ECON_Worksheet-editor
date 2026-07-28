'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { Diagram, DiagramPoint } from '@/model/diagram';
import {
  copyHandles,
  cursorFor,
  deleteHandles,
  dragHandles,
  drawn,
  handleId,
  hitTest,
  insertVertex,
  isBody,
  isClipEmpty,
  normalizeRect,
  pasteInto,
  pointAt,
  sameHandle,
  selectWithin,
  snapPoint,
  type DiagramClip,
  type DiagramHandle,
  type DiagramRect,
  type LabelAnchor,
} from '@/model/diagramDraw';
import { emptyBiText, plain } from '@/model/text';
import type { DiagramBlock } from '@/model/types';
import {
  arrowLabelAnchor,
  axisTickAnchor,
  axisTitleAnchor,
  curveLabelAnchor,
  diagramPlot,
  diagramSvg,
  pointLabelAnchor,
} from '@/render/diagram';
import { useWorksheetStore } from '@/store/worksheetStore';
import { Button, CheckField, Eyebrow, IconButton, SelectField } from '@/components/ui';
import { useModalLayer } from '@/components/ui/modalLayer';
import { BiTextField } from './BiTextField';

/**
 * The drawing surface (§5.3).
 *
 * The numeric panel is precise but it is not how anyone thinks about a supply curve —
 * a teacher wants to *draw* the line where it goes and label it. This overlay is that
 * surface, and it deliberately sits **on top of** the same live SVG the exporter uses
 * rather than being a second renderer: the drawing is the real diagram at every moment,
 * so there is no "apply" step and nothing that can render differently once closed.
 *
 * It edits the same unit-space geometry the panel does (§7.5). Drawing a curve produces
 * exactly the `DiagramCurve` the panel would have produced by typing four numbers, so
 * the two surfaces are interchangeable and neither owns anything the other cannot see.
 *
 * Every gesture is applied to the geometry captured at *pointer-down* rather than to
 * the latest state, so a drag is one idempotent transform replayed as the pointer
 * moves — no accumulated rounding, and releasing outside the plot still lands where
 * the pointer is rather than where the last frame happened to be.
 */

const newId = () => nanoid(10);

/**
 * Grab radius in CSS pixels, converted to unit space against the live plot size.
 *
 * Measured against the *rendered* plot, so zooming the stage in makes the grab area a
 * smaller share of the diagram — which is the point of zooming in to work on detail.
 */
const GRAB_PX = 11;
/** Snapping is looser than grabbing: it should catch an intersection you aimed near. */
const SNAP_PX = 14;
/** A drag shorter than this is a click that wobbled, not a marquee. */
const MARQUEE_MIN_PX = 4;
/**
 * A press that travels less than this is a click, not a move.
 *
 * Without it, every press on an element is a drag of zero-or-two pixels, so *selecting*
 * something silently nudges it — the click and the move gesture were indistinguishable.
 * Below the threshold no geometry is written at all, which is what makes clicking a
 * neighbouring element to inspect it a safe thing to do.
 */
const DRAG_MIN_PX = 4;

/**
 * Zoom levels for the stage.
 *
 * The diagram's stored size (typically 400×300) is a *print* size — on a 1500px screen
 * it occupies a quarter of the width, which is far too small to place a label into a
 * gap between two curves. Zoom scales what is displayed without touching the stored
 * geometry: `toUnit` divides the pointer position by the same factor, so unit space is
 * untouched and the export is unaffected.
 */
const ZOOMS = [1, 1.5, 2, 3];
const DEFAULT_ZOOM = 2;

/**
 * Arrow-key nudge distances, in unit space.
 *
 * `y` is inverted relative to the key because unit space grows upward while the key
 * names a screen direction — ArrowUp must raise the element, not lower it.
 *
 * The fine step is a fifth of a percent of the plot: small enough that a label can be
 * eased out of a collision one press at a time, large enough to see. Deliberately *not*
 * scaled by zoom — a nudge is a fixed edit to the geometry, and making it depend on how
 * far the stage happens to be zoomed in would mean the same keypress moved a curve a
 * different distance each session.
 */
const NUDGE_FINE = 0.002;
const NUDGE_COARSE = 0.02;
const NUDGE: Array<{ key: string; dx: number; dy: number }> = [
  { key: 'ArrowLeft', dx: -1, dy: 0 },
  { key: 'ArrowRight', dx: 1, dy: 0 },
  { key: 'ArrowUp', dx: 0, dy: 1 },
  { key: 'ArrowDown', dx: 0, dy: -1 },
];

type Tool = 'select' | 'curve' | 'point' | 'label' | 'arrow';

const TOOLS: Array<{ id: Tool; glyph: string; name: string; hint: string }> = [
  { id: 'select', glyph: '↖', name: 'Select', hint: 'Drag to move — it lets go on release. Click to select and edit. Drag empty space to box-select.' },
  { id: 'curve', glyph: '╱', name: 'Curve', hint: 'Drag to draw a line. Shift constrains it to horizontal or vertical.' },
  { id: 'point', glyph: '•', name: 'Point', hint: 'Click to mark a point. It snaps to curve intersections.' },
  { id: 'label', glyph: 'A', name: 'Label', hint: 'Click to place free text — the "a b c d" areas of a tariff diagram.' },
  { id: 'arrow', glyph: '→', name: 'Arrow', hint: 'Drag to draw a shift arrow between two curves.' },
];

interface Props {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
  onClose: () => void;
}

/**
 * A drag in progress, holding the geometry it started from.
 *
 * `move` drags a selection, `create` draws a new element, `marquee` sweeps a box. All
 * three carry `base` — the diagram at pointer-down — so every pointer move re-applies
 * one idempotent transform rather than compounding onto the previous frame.
 *
 * `moved` means "travelled past the threshold", not "the pointer produced an event". A
 * gesture that never sets it wrote no geometry, so releasing it is a click.
 *
 * A `move` also records whether it was a **transient** grab — a plain press on an element
 * the user had not already selected. Those release back to no selection, so grabbing a
 * curve, dropping it and clicking the next one cannot drag something the user believed
 * they had let go of.
 */
type Gesture =
  | {
      kind: 'move';
      handles: DiagramHandle[];
      from: DiagramPoint;
      base: Diagram;
      moved: boolean;
      transient: boolean;
    }
  | { kind: 'create'; handles: DiagramHandle[]; from: DiagramPoint; base: Diagram; moved: boolean }
  | { kind: 'marquee'; from: DiagramPoint; base: Diagram; moved: boolean; additive: boolean };

export function DiagramCanvas({ block, onChange, onClose }: Props) {
  // The canvas owns the keyboard while it is open. Without this, the preview's own
  // Delete handler fires on the same keypress and removes the whole diagram block that
  // is selected underneath — deleting one curve took the entire picture with it.
  useModalLayer();

  const language = useWorksheetStore((s) => s.mode.language);
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);

  const [tool, setTool] = useState<Tool>('select');
  /** Multi-selection. Empty means nothing is selected. */
  const [selected, setSelected] = useState<DiagramHandle[]>([]);
  const [snapping, setSnapping] = useState(true);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [marquee, setMarquee] = useState<DiagramRect | null>(null);
  /**
   * What the in-flight drag is moving.
   *
   * A transient grab deliberately leaves `selected` empty until release, so without this
   * the element under the pointer would lose its highlight for the whole drag — the one
   * moment feedback matters most. Kept in state rather than beside the gesture ref
   * because only state repaints the overlay.
   */
  const [dragging, setDragging] = useState<DiagramHandle[]>([]);
  /**
   * What is under the pointer right now. Drives the cursor only.
   *
   * Kept as the handle rather than a boolean because the *kind* is what the cursor
   * reports: grabbing a curve's endpoint reshapes the line, grabbing its body slides the
   * whole thing, and those are different enough edits that the pointer should say which
   * one a press will make before it is made.
   */
  const [hovering, setHovering] = useState<DiagramHandle | null>(null);
  /**
   * The clipboard lives in component state, not the system clipboard.
   *
   * Diagram geometry has no sensible text/plain form, and reading the system clipboard
   * needs a permission prompt that would interrupt a drawing session. Copying here is
   * scoped to the canvas, which is also what stops a stray ⌘V from pasting a curve into
   * a worksheet's text.
   */
  const [clip, setClip] = useState<DiagramClip | null>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  /**
   * The marquee's live far corner.
   *
   * Kept in a ref as well as in state because `onPointerUp` runs in the same tick as the
   * last `onPointerMove`: reading the state there would see the value from *before* that
   * move and select against a box one frame stale. State drives the drawn rectangle,
   * the ref decides what the release actually caught.
   */
  const marqueeEnd = useRef<DiagramPoint>({ x: 0, y: 0 });

  const diagram = block.diagram;
  const setDiagram = useCallback(
    (next: Diagram) => onChange({ ...block, diagram: next }),
    [block, onChange],
  );

  // The stage renders the diagram at its stored pixel size and then scales the whole
  // thing with CSS to fit the viewport. Drawing at the stored size is what keeps the
  // projection below identical to the exporter's — scaling the *rendered result* cannot
  // change where anything is in unit space, whereas re-rendering at a different pixel
  // size could shift the padding the axis titles claim.
  const projection = useMemo(
    () => diagramPlot(diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language, fonts }),
    [diagram, block.widthPx, block.heightPx, language, fonts],
  );

  const svg = useMemo(
    () => diagramSvg(diagram, { widthPx: block.widthPx, heightPx: block.heightPx, language, fonts }),
    [diagram, block.widthPx, block.heightPx, language, fonts],
  );

  /**
   * Every piece of anchored text, at the unit-space position it is actually drawn.
   *
   * Built from the render's own anchor functions and then run back through the shared
   * projection's inverses, so a label is grabbable exactly where it appears. Deriving
   * these positions here instead would be the mistake `diagramPlot` exists to prevent
   * (§7.5) — the anchors depend on font size and padding the renderer owns.
   *
   * Text with nothing in it is skipped: an empty label draws nothing, and an invisible
   * hit target is worse than none at all.
   */
  const labelAnchors = useMemo<LabelAnchor[]>(() => {
    const out: LabelAnchor[] = [];
    const toUnitPoint = (x: number, y: number) => ({ x: projection.ux(x), y: projection.uy(y) });
    const has = (text?: { en?: unknown[]; zh?: unknown[] }) =>
      Boolean(text && ((text.en?.length ?? 0) > 0 || (text.zh?.length ?? 0) > 0));

    for (const curve of diagram.curves) {
      if (!has(curve.label)) continue;
      const at = curveLabelAnchor(curve, projection, 1);
      if (at) out.push({ handle: { kind: 'curveLabel', curveId: curve.id }, at: toUnitPoint(at.x, at.y) });
    }
    for (const mark of diagram.points) {
      if (has(mark.label)) {
        const at = pointLabelAnchor(mark, projection, 1);
        out.push({ handle: { kind: 'pointLabel', pointId: mark.id }, at: toUnitPoint(at.x, at.y) });
      }
      if (has(mark.xTickLabel)) {
        const x = projection.px(mark.at.x) + (mark.xTickOffset ?? 0) * (projection.plot.right - projection.plot.left);
        out.push({ handle: { kind: 'pointTick', pointId: mark.id, axis: 'x' }, at: toUnitPoint(x, projection.plot.bottom + 8) });
      }
      if (has(mark.yTickLabel)) {
        const y = projection.py(mark.at.y) - (mark.yTickOffset ?? 0) * (projection.plot.bottom - projection.plot.top);
        out.push({ handle: { kind: 'pointTick', pointId: mark.id, axis: 'y' }, at: toUnitPoint(projection.plot.left - 8, y) });
      }
    }
    for (const arrow of diagram.arrows) {
      if (!has(arrow.label)) continue;
      const at = arrowLabelAnchor(arrow, projection, 1);
      out.push({ handle: { kind: 'arrowLabel', arrowId: arrow.id }, at: toUnitPoint(at.x, at.y) });
    }
    for (const axis of ['x', 'y'] as const) {
      if (has(diagram[axis].title)) {
        const at = axisTitleAnchor(diagram, axis, projection, block.widthPx, 1, language);
        out.push({ handle: { kind: 'axisTitle', axis }, at: toUnitPoint(at.x, at.y) });
      }
      for (const tick of diagram[axis].ticks ?? []) {
        const at = axisTickAnchor(tick, axis, projection, 1);
        out.push({ handle: { kind: 'axisTick', axis, tickId: tick.id }, at: toUnitPoint(at.x, at.y) });
      }
    }
    return out;
  }, [diagram, projection, block.widthPx, language]);

  /** Pointer event → unit space, undoing the CSS scale the stage is displayed at. */
  const toUnit = useCallback(
    (event: { clientX: number; clientY: number }): DiagramPoint => {
      const surface = surfaceRef.current;
      if (!surface) return { x: 0, y: 0 };
      const rect = surface.getBoundingClientRect();
      // rect is the on-screen size; the SVG's own coordinate system is widthPx wide.
      const scaleX = block.widthPx / (rect.width || 1);
      const scaleY = block.heightPx / (rect.height || 1);
      return {
        x: projection.ux((event.clientX - rect.left) * scaleX),
        y: projection.uy((event.clientY - rect.top) * scaleY),
      };
    },
    [projection, block.widthPx, block.heightPx],
  );

  /**
   * Grab/snap radii in unit space, derived from the plot's *displayed* pixel span.
   *
   * Dividing the pixel radius by the zoom is what makes the grab area a constant size
   * on screen: at 3× a curve is three times further from its neighbour in screen pixels,
   * so a fixed unit-space radius would feel three times stickier.
   */
  const radii = useMemo(() => {
    const span = Math.max(1, (projection.plot.right - projection.plot.left) * zoom);
    return {
      grab: GRAB_PX / span,
      snap: SNAP_PX / span,
      marquee: MARQUEE_MIN_PX / span,
      drag: DRAG_MIN_PX / span,
    };
  }, [projection, zoom]);

  const maybeSnap = useCallback(
    (at: DiagramPoint, exceptCurveId?: string) =>
      snapping ? snapPoint(diagram, at, radii.snap, exceptCurveId) : at,
    [snapping, diagram, radii.snap],
  );

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    (event.target as Element).setPointerCapture?.(event.pointerId);
    const at = toUnit(event);

    if (tool === 'select') {
      const handle = hitTest(diagram, at, radii.grab, labelAnchors);

      if (!handle) {
        // Empty space starts a marquee. Holding Shift keeps what is already selected,
        // so a box can be added to a click-selection rather than replacing it.
        if (!event.shiftKey) setSelected([]);
        gestureRef.current = {
          kind: 'marquee',
          from: at,
          base: diagram,
          moved: false,
          additive: event.shiftKey,
        };
        return;
      }

      // Shift-click toggles one element in or out of the selection and never drags: a
      // press meant to add a third curve to a group must not also move the group.
      if (event.shiftKey) {
        setSelected(
          selected.some((h) => sameHandle(h, handle))
            ? selected.filter((h) => !sameHandle(h, handle))
            : [...selected, handle],
        );
        return;
      }

      // A plain press on a member of the current selection drags the whole selection, so
      // a group can be moved by any one of its members. Anything else grabs just what is
      // under the pointer — including a vertex of an already-selected curve, which is why
      // this asks `sameHandle` rather than only comparing element ids: matching by id
      // alone made clicking a curve's endpoint drag the entire curve.
      const inSelection = selected.some(
        (h) => sameHandle(h, handle) || (isBody(h) && isBody(handle) && handleId(h) === handleId(handle)),
      );
      const handles = inSelection ? selected : [handle];
      gestureRef.current = {
        kind: 'move',
        handles,
        from: at,
        base: diagram,
        moved: false,
        // A drag lets go of what it moved, whatever it grabbed. Keeping a single element
        // armed after its own drag is the whole reported bug: the teacher has visibly
        // finished with it, reaches for the next one, and moves this one instead. Only a
        // *group* survives its drag, because a multi-element selection is deliberate work
        // that would be tedious to rebuild after every nudge.
        transient: handles.length === 1,
      };
      // The selection is *not* set here. A press that turns out to be a drag never needs
      // it, and a press that turns out to be a click sets it on release — so the handles
      // drawn during a drag are the ones being dragged, and nothing is left selected
      // afterwards to be caught by the next press.
      return;
    }

    if (tool === 'point' || tool === 'label') {
      // Click-to-place: no drag, so the element is committed immediately and selected
      // so the inspector on the right is already pointed at what was just created.
      const id = newId();
      if (tool === 'point') {
        const snapped = maybeSnap(at);
        // Snapping can land exactly on a point that is already there — aiming at an
        // intersection that is already marked. Select that one rather than stacking an
        // invisible duplicate on top of it.
        const existing = pointAt(diagram, snapped);
        if (existing) {
          setSelected([{ kind: 'point', pointId: existing.id }]);
        } else {
          setDiagram({ ...diagram, points: [...diagram.points, drawn.point(id, snapped)] });
          setSelected([{ kind: 'point', pointId: id }]);
        }
      } else {
        setDiagram({ ...diagram, labels: [...diagram.labels, drawn.label(id, at)] });
        setSelected([{ kind: 'label', labelId: id }]);
      }
      setTool('select');
      return;
    }

    // Curve and arrow are drag-to-draw. The element is created at pointer-down with
    // zero length and its far end is then dragged, which means the same `applyDrag`
    // path drives both creating and editing — one code path, one set of clamps.
    const id = newId();
    const start = maybeSnap(at);
    if (tool === 'curve') {
      const base = { ...diagram, curves: [...diagram.curves, drawn.curve(id, start, start)] };
      gestureRef.current = {
        kind: 'create',
        handles: [{ kind: 'vertex', curveId: id, index: 1 }],
        from: start,
        base,
        moved: false,
      };
      setDiagram(base);
      setSelected([{ kind: 'curve', curveId: id }]);
    } else {
      const base = { ...diagram, arrows: [...diagram.arrows, drawn.arrow(id, start, start)] };
      gestureRef.current = {
        kind: 'create',
        handles: [{ kind: 'arrowTo', arrowId: id }],
        from: start,
        base,
        moved: false,
      };
      setDiagram(base);
      setSelected([{ kind: 'arrow', arrowId: id }]);
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const gesture = gestureRef.current;
    let at = toUnit(event);

    // With no gesture running, a move is just a hover: report whether something is
    // grabbable so the cursor can say so. Grab-and-go has no visible arming step, so the
    // cursor is the only thing that tells you a press here will move something.
    if (!gesture) {
      if (tool === 'select') setHovering(hitTest(diagram, at, radii.grab, labelAnchors));
      return;
    }

    if (gesture.kind === 'marquee') {
      // A marquee that has not travelled far enough is still a click; not drawing the
      // box until then stops a one-pixel wobble from flashing a rectangle on screen.
      const far =
        Math.abs(at.x - gesture.from.x) > radii.marquee ||
        Math.abs(at.y - gesture.from.y) > radii.marquee;
      if (!far) return;
      gesture.moved = true;
      marqueeEnd.current = at;
      setMarquee({ from: gesture.from, to: at });
      return;
    }

    // Until the pointer has travelled past the threshold this press is still a click, so
    // no geometry is written. Creating is exempt: a curve is drawn *by* the drag, and its
    // stray-click case is already handled by the rollback on release.
    if (gesture.kind === 'move' && !gesture.moved) {
      const far =
        Math.abs(at.x - gesture.from.x) > radii.drag || Math.abs(at.y - gesture.from.y) > radii.drag;
      if (!far) return;
      setDragging(gesture.handles);
    }

    // Shift constrains to the axis the drag has travelled furthest along. Papers are
    // full of lines that must be exactly vertical (a quota) or exactly horizontal (a
    // world price), and freehand cannot hit those.
    const single = gesture.handles.length === 1 ? gesture.handles[0] : null;
    if (event.shiftKey) {
      const dx = Math.abs(at.x - gesture.from.x);
      const dy = Math.abs(at.y - gesture.from.y);
      at = dx > dy ? { x: at.x, y: gesture.from.y } : { x: gesture.from.x, y: at.y };
    } else if (single && single.kind !== 'curve' && single.kind !== 'arrow') {
      // Only a lone endpoint drag snaps. Dragging a whole body — or a multi-selection —
      // by its snapped position would jump everything the moment the pointer passed an
      // intersection, which is exactly what a group move must not do.
      at = maybeSnap(at, single.kind === 'vertex' ? single.curveId : undefined);
    }

    gesture.moved = true;
    setDiagram(dragHandles(gesture.base, gesture.handles, gesture.from, at));
  };

  const onPointerUp = () => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    setMarquee(null);
    setDragging([]);
    if (!gesture) return;

    if (gesture.kind === 'marquee') {
      if (!gesture.moved) return; // A click in empty space: the deselect already happened.
      const caught = selectWithin(gesture.base, { from: gesture.from, to: marqueeEnd.current }, labelAnchors);
      setSelected((current) => {
        if (!gesture.additive) return caught;
        const merged = [...current];
        for (const handle of caught) {
          if (!merged.some((h) => sameHandle(h, handle))) merged.push(handle);
        }
        return merged;
      });
      return;
    }

    if (gesture.kind === 'move') {
      // The press never travelled: it was a click, and a click selects. This is the only
      // place a plain click sets the selection, which is what keeps "click to inspect"
      // and "drag to move" from being the same gesture with different outcomes.
      if (!gesture.moved) {
        setSelected(gesture.handles);
        return;
      }
      // The drag is over. A transient grab releases its selection so the moved element is
      // no longer armed — clicking the next element then selects that element rather than
      // dragging one the user thought they had let go of.
      if (gesture.transient) setSelected([]);
      return;
    }

    // A "drawn" curve or arrow that never moved is a stray click, not an element.
    // Rolling back to the pre-gesture geometry is why `base` holds the created element
    // rather than the created element being committed separately.
    if (gesture.kind === 'create' && !gesture.moved) {
      const id = handleId(gesture.handles[0]);
      setDiagram({
        ...gesture.base,
        curves: gesture.base.curves.filter((c) => c.id !== id),
        arrows: gesture.base.arrows.filter((a) => a.id !== id),
      });
      setSelected([]);
      return;
    }
    if (gesture.kind === 'create') setTool('select');
  };

  /** Double-click on a curve puts a kink exactly where the pointer is. */
  const onDoubleClick = (event: React.MouseEvent) => {
    const at = toUnit(event);
    const handle = hitTest(diagram, at, radii.grab, labelAnchors);
    if (handle?.kind === 'curve') {
      setDiagram(insertVertex(diagram, handle.curveId, at));
    }
  };

  const doCopy = useCallback(() => {
    if (selected.length === 0) return;
    setClip(copyHandles(diagram, selected));
  }, [diagram, selected]);

  const doPaste = useCallback(() => {
    if (isClipEmpty(clip)) return;
    // The pasted copies become the selection, so the very next drag moves the new
    // elements rather than the originals — which is what makes paste-then-drag the
    // natural way to build "S₁ and S₂" out of one curve.
    const { diagram: next, handles } = pasteInto(diagram, clip!, newId);
    setDiagram(next);
    setSelected(handles);
  }, [clip, diagram, setDiagram]);

  const doDelete = useCallback(() => {
    if (selected.length === 0) return;
    setDiagram(deleteHandles(diagram, selected));
    setSelected([]);
  }, [diagram, selected, setDiagram]);

  // Shortcuts are scoped to the overlay and ignored while a field has focus, the same
  // rule the preview follows (§ "Direct manipulation on the page") — otherwise Backspace
  // in a label field would delete the element being labelled, and ⌘C would steal the
  // copy of the text the teacher had selected in that field.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);

      if (event.key === 'Escape') {
        if (typing) return;
        event.preventDefault();
        // Escape peels back one layer at a time: clear the selection first, close only
        // when there is nothing left to deselect. Closing out from under a selection
        // would lose the drawing context with no warning.
        if (selected.length > 0) setSelected([]);
        else onClose();
        return;
      }
      if (typing) return;

      const accel = event.metaKey || event.ctrlKey;
      if (accel && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        doCopy();
        return;
      }
      if (accel && event.key.toLowerCase() === 'v') {
        event.preventDefault();
        doPaste();
        return;
      }
      if (accel && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        doCopy();
        doDelete();
        return;
      }
      if (accel && event.key.toLowerCase() === 'd') {
        // Duplicate in place: copy and paste in one stroke, without disturbing the clip.
        event.preventDefault();
        if (selected.length === 0) return;
        const { diagram: next, handles } = pasteInto(diagram, copyHandles(diagram, selected), newId);
        setDiagram(next);
        setSelected(handles);
        return;
      }
      if (accel && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelected(selectWithin(diagram, { from: { x: 0, y: 0 }, to: { x: 1, y: 1 } }, labelAnchors));
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        doDelete();
        return;
      }

      // Arrow keys nudge the selection. Dragging is how a shape is placed roughly;
      // this is how it is placed exactly — a curve label one step clear of the line it
      // names is a judgement the pointer cannot make at 400px wide. It routes through
      // the same `dragHandles` a drag does, so a nudge and a drag produce identical
      // geometry and every handle kind (including a tick's along-axis constraint and a
      // label's offset) obeys its own rule for free.
      const step = NUDGE.find((n) => n.key === event.key);
      if (step) {
        if (selected.length === 0) return;
        event.preventDefault();
        // Shift takes the coarse step, matching the modifier's meaning everywhere else
        // on the page; the fine step is the default because this gesture exists for
        // precision.
        const size = event.shiftKey ? NUDGE_COARSE : NUDGE_FINE;
        setDiagram(
          dragHandles(
            diagram,
            selected,
            { x: 0, y: 0 },
            { x: step.dx * size, y: step.dy * size },
          ),
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, diagram, labelAnchors, setDiagram, onClose, doCopy, doPaste, doDelete]);

  const activeTool = TOOLS.find((t) => t.id === tool);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 backdrop-blur-sm">
      <header className="flex flex-wrap items-center gap-3 border-b border-slate-700 bg-slate-800 px-5 py-3 text-slate-100">
        <span className="text-sm font-semibold tracking-wide text-slate-200">Draw diagram</span>

        <div className="flex gap-1.5">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              title={`${item.name} — ${item.hint}`}
              aria-pressed={tool === item.id}
              onClick={() => setTool(item.id)}
              className={
                'flex h-11 min-w-11 items-center gap-1.5 rounded-lg border px-3 text-base transition-colors ' +
                (tool === item.id
                  ? 'border-sky-400 bg-sky-500 text-white'
                  : 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600')
              }
            >
              <span aria-hidden className="text-lg leading-none">{item.glyph}</span>
              <span className="text-xs font-medium">{item.name}</span>
            </button>
          ))}
        </div>

        <span className="h-8 w-px bg-slate-600" />

        {/* Clipboard actions are buttons as well as shortcuts: a teacher who has never
            met ⌘D should still find "Duplicate", and the labels double as the place the
            shortcut is discovered. */}
        <div className="flex gap-1.5">
          <ToolbarButton label="Copy" hint="⌘C" onClick={doCopy} disabled={selected.length === 0} />
          <ToolbarButton label="Paste" hint="⌘V" onClick={doPaste} disabled={isClipEmpty(clip)} />
          <ToolbarButton
            label="Duplicate"
            hint="⌘D"
            disabled={selected.length === 0}
            onClick={() => {
              if (selected.length === 0) return;
              const { diagram: next, handles } = pasteInto(diagram, copyHandles(diagram, selected), newId);
              setDiagram(next);
              setSelected(handles);
            }}
          />
          <ToolbarButton
            label="Delete"
            hint="⌫"
            danger
            onClick={doDelete}
            disabled={selected.length === 0}
          />
        </div>

        <span className="h-8 w-px bg-slate-600" />

        <label className="flex items-center gap-2 text-xs font-medium text-slate-200">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={snapping}
            onChange={(event) => setSnapping(event.target.checked)}
          />
          Snap
        </label>

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
        <span className="text-xs text-slate-400">
          {selected.length > 1 ? `${selected.length} selected` : activeTool?.hint}
        </span>
        <Button onClick={onClose}>Done</Button>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Stage. The SVG is rendered at its stored pixel size and scaled to fit, so
            what is drawn on is exactly the geometry that will be exported. */}
        <div className="flex min-w-0 flex-1 items-center justify-center overflow-auto p-8">
          {/* The stage is sized by the zoom rather than CSS-transformed, so the browser
              lays the SVG out at the larger size and text stays crisp. `toUnit` divides
              the pointer position by the same factor, so unit space never notices. */}
          <div
            ref={surfaceRef}
            className="relative select-none bg-white shadow-2xl"
            style={{
              width: block.widthPx * zoom,
              height: block.heightPx * zoom,
              // Grab-and-go: the cursor is what distinguishes "press here and it moves"
              // from empty space that will start a marquee, since there is no arming step
              // to see, and it separates reshaping one end from sliding the whole line.
              cursor:
                tool !== 'select'
                  ? 'crosshair'
                  : dragging.length > 0
                    ? cursorFor(diagram, dragging[0], dragging.length > 1, true)
                    : hovering
                      ? cursorFor(diagram, hovering, false, false)
                      : 'default',
              touchAction: 'none',
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onPointerLeave={() => setHovering(null)}
            onDoubleClick={onDoubleClick}
          >
            <div
              className="pointer-events-none absolute inset-0 [&>svg]:h-full [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
            <HandleOverlay
              diagram={diagram}
              projection={projection}
              width={block.widthPx}
              height={block.heightPx}
              selected={dragging.length > 0 ? dragging : selected}
              marquee={marquee}
              zoom={zoom}
              labels={labelAnchors}
            />
          </div>
        </div>

        <aside className="w-80 shrink-0 overflow-y-auto border-l border-slate-700 bg-white p-4 dark:bg-slate-900">
          <SelectionInspector
            diagram={diagram}
            selected={selected}
            onChange={setDiagram}
            onDelete={doDelete}
            onSelect={(handles) => setSelected(handles)}
          />
        </aside>
      </div>
    </div>
  );
}

/**
 * The handles drawn over the diagram.
 *
 * A separate, `pointer-events-none` SVG layered on the real one, so the diagram below
 * stays byte-identical to what gets exported — handles are editing chrome and must
 * never reach the geometry, the same rule `EditTarget` follows in the preview IR.
 */
function HandleOverlay({
  diagram,
  projection,
  width,
  height,
  selected,
  marquee,
  zoom,
  labels,
}: {
  diagram: Diagram;
  projection: ReturnType<typeof diagramPlot>;
  width: number;
  height: number;
  selected: DiagramHandle[];
  marquee: DiagramRect | null;
  zoom: number;
  labels: LabelAnchor[];
}) {
  // Handles are drawn in the SVG's own coordinate system, which the stage then scales
  // by `zoom`. Dividing the sizes back out keeps a handle the same size on screen at
  // every zoom — otherwise 3× would paint dots big enough to hide the curve they mark.
  const r = 5 / zoom;
  const stroke = 1.75 / zoom;

  const isOn = (handle: DiagramHandle) =>
    selected.some((h) => sameHandle(h, handle) || handleId(h) === handleId(handle));

  const dot = (key: string, at: DiagramPoint, handle: DiagramHandle, shape: 'square' | 'round') => {
    const on = isOn(handle);
    const cx = projection.px(at.x);
    const cy = projection.py(at.y);
    const fill = on ? '#0ea5e9' : '#fff';
    return shape === 'square' ? (
      <rect
        key={key}
        x={cx - r}
        y={cy - r}
        width={r * 2}
        height={r * 2}
        fill={fill}
        stroke="#0284c7"
        strokeWidth={stroke}
      />
    ) : (
      <circle key={key} cx={cx} cy={cy} r={r} fill={fill} stroke="#0284c7" strokeWidth={stroke} />
    );
  };

  const box = marquee ? normalizeRect(marquee) : null;

  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${width} ${height}`}
    >
      {/* Selected curves get a highlight along their whole length: with a multi-selection
          the endpoint dots alone do not read as "these three lines", especially when two
          of them share an endpoint. */}
      {diagram.curves
        .filter((curve) => isOn({ kind: 'curve', curveId: curve.id }))
        .map((curve) => (
          <polyline
            key={`hl-${curve.id}`}
            points={curve.points.map((p) => `${projection.px(p.x)},${projection.py(p.y)}`).join(' ')}
            fill="none"
            stroke="#0ea5e9"
            strokeOpacity={0.35}
            strokeWidth={7 / zoom}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      {diagram.arrows
        .filter((arrow) => isOn({ kind: 'arrow', arrowId: arrow.id }))
        .map((arrow) => (
          <line
            key={`hl-${arrow.id}`}
            x1={projection.px(arrow.from.x)}
            y1={projection.py(arrow.from.y)}
            x2={projection.px(arrow.to.x)}
            y2={projection.py(arrow.to.y)}
            stroke="#0ea5e9"
            strokeOpacity={0.35}
            strokeWidth={7 / zoom}
            strokeLinecap="round"
          />
        ))}

      {diagram.curves.flatMap((curve) =>
        curve.points.map((point, index) =>
          dot(`${curve.id}-${index}`, point, { kind: 'vertex', curveId: curve.id, index }, 'square'),
        ),
      )}
      {diagram.points.map((mark) =>
        dot(mark.id, mark.at, { kind: 'point', pointId: mark.id }, 'round'),
      )}
      {diagram.arrows.flatMap((arrow) => [
        dot(`${arrow.id}-from`, arrow.from, { kind: 'arrowFrom', arrowId: arrow.id }, 'round'),
        dot(`${arrow.id}-to`, arrow.to, { kind: 'arrowTo', arrowId: arrow.id }, 'round'),
      ])}
      {diagram.labels.map((label) =>
        dot(label.id, label.at, { kind: 'label', labelId: label.id }, 'round'),
      )}

      {/* Anchored text gets a hollow ring rather than a filled handle: it marks a piece
          of writing that can be nudged, not a coordinate that defines the geometry, and
          the two should not be mistaken for each other at a glance. Drawn last so a
          label's marker sits above the curve it names. */}
      {labels.map((label) => {
        const on = isOn(label.handle);
        return (
          <circle
            key={`text-${label.handle.kind}-${handleId(label.handle)}-${
              label.handle.kind === 'pointTick' ? label.handle.axis : ''
            }`}
            cx={projection.px(label.at.x)}
            cy={projection.py(label.at.y)}
            r={(on ? 8 : 6) / zoom}
            fill={on ? '#0ea5e9' : '#fff'}
            fillOpacity={on ? 0.25 : 0.55}
            stroke="#0284c7"
            strokeWidth={stroke}
            strokeDasharray={on ? undefined : `${2.5 / zoom},${2 / zoom}`}
          />
        );
      })}

      {box && (
        <rect
          x={projection.px(box.x0)}
          y={projection.py(box.y1)}
          width={projection.px(box.x1) - projection.px(box.x0)}
          height={projection.py(box.y0) - projection.py(box.y1)}
          fill="#0ea5e9"
          fillOpacity={0.12}
          stroke="#0284c7"
          strokeWidth={stroke}
          strokeDasharray={`${4 / zoom},${3 / zoom}`}
        />
      )}
    </svg>
  );
}

/** A labelled toolbar button, sized for the larger canvas chrome. */
function ToolbarButton({
  label,
  hint,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={`${label} (${hint})`}
      className={
        'flex h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors ' +
        'disabled:pointer-events-none disabled:opacity-35 ' +
        (danger
          ? 'border-rose-500/60 bg-rose-600/20 text-rose-200 hover:bg-rose-600/40'
          : 'border-slate-600 bg-slate-700 text-slate-200 hover:bg-slate-600')
      }
    >
      {label}
      <span aria-hidden className="text-[10px] text-slate-400">
        {hint}
      </span>
    </button>
  );
}

/**
 * Properties of the current selection.
 *
 * Only the fields that cannot be expressed by dragging live here — a label's text, a
 * curve's stroke, which axes a point drops to. Anything positional is deliberately
 * absent: it is set by moving the thing, and offering a second way to type it would
 * invite the two to disagree.
 */
function SelectionInspector({
  diagram,
  selected,
  onChange,
  onDelete,
  onSelect,
}: {
  diagram: Diagram;
  selected: DiagramHandle[];
  onChange: (diagram: Diagram) => void;
  onDelete: () => void;
  onSelect: (handles: DiagramHandle[]) => void;
}) {
  // Nothing selected is the state the panel is in most often, so it earns real content
  // rather than a sentence: an index of what is on the diagram, where each row selects
  // its element. Clicking a name is how you reach a curve whose line is under another.
  if (selected.length === 0) {
    return <ElementIndex diagram={diagram} onSelect={onSelect} />;
  }

  // A multi-selection has no single set of properties to show — a curve's stroke and a
  // label's text have nothing in common — so it offers the operations that *do* apply
  // to a group and lists what is in it.
  if (selected.length > 1) {
    return (
      <div>
        <header className="mb-3 flex items-center gap-2">
          <Eyebrow>{selected.length} selected</Eyebrow>
          <span className="flex-1" />
          <IconButton label="Delete selection" variant="danger" onClick={onDelete}>
            <span aria-hidden>✕</span>
          </IconButton>
        </header>
        <ul className="mb-3 space-y-1">
          {selected.map((handle) => (
            <li
              key={`${handle.kind}-${handleId(handle)}`}
              className="truncate rounded bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {describeHandle(diagram, handle)}
            </li>
          ))}
        </ul>
        <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
          Drag any one of them to move the whole group, or nudge it with the arrow keys.
          ⌘C copies, ⌘V pastes offset, ⌘D duplicates, ⌫ deletes. Shift-click a shape to
          add or remove it.
        </p>
      </div>
    );
  }

  const handle = selected[0];
  const id = handleId(handle);

  // The axes are not elements in a list, so they get their own panel.
  if (handle.kind === 'axisTitle' || handle.kind === 'axisTick') {
    return <AxisInspector diagram={diagram} handle={handle} onChange={onChange} onDelete={onDelete} />;
  }

  const curve = diagram.curves.find((c) => c.id === id);
  const mark = diagram.points.find((p) => p.id === id);
  const label = diagram.labels.find((l) => l.id === id);
  const arrow = diagram.arrows.find((a) => a.id === id);

  const header = (title: string) => (
    <header className="mb-2 flex items-center gap-1">
      <Eyebrow>{title}</Eyebrow>
      <span className="flex-1" />
      <IconButton label="Delete" variant="danger" onClick={onDelete}>
        <span aria-hidden>✕</span>
      </IconButton>
    </header>
  );

  if (curve) {
    return (
      <div>
        {header(plain(curve.label?.en) || 'Curve')}
        <div className="space-y-2">
          <BiTextField
            label="Label"
            value={curve.label ?? emptyBiText()}
            rows={1}
            onChange={(next) =>
              onChange({
                ...diagram,
                curves: diagram.curves.map((c) => (c.id === id ? { ...c, label: next } : c)),
              })
            }
          />
          <SelectField
            label="Shape"
            value={curve.shape}
            options={[
              { value: 'straight', label: 'Straight' },
              { value: 'curved', label: 'Curved' },
            ]}
            onChange={(shape) =>
              onChange({
                ...diagram,
                curves: diagram.curves.map((c) =>
                  c.id === id ? { ...c, shape: shape as typeof curve.shape } : c,
                ),
              })
            }
          />
          <SelectField
            label="Line"
            value={curve.stroke ?? 'solid'}
            options={[
              { value: 'solid', label: 'Solid' },
              { value: 'dashed', label: 'Dashed' },
            ]}
            onChange={(stroke) =>
              onChange({
                ...diagram,
                curves: diagram.curves.map((c) =>
                  c.id === id ? { ...c, stroke: stroke as typeof curve.stroke } : c,
                ),
              })
            }
          />
          <SelectField
            label="Label at"
            value={curve.labelAt ?? 'end'}
            options={[
              { value: 'end', label: 'End' },
              { value: 'start', label: 'Start' },
            ]}
            onChange={(labelAt) =>
              onChange({
                ...diagram,
                curves: diagram.curves.map((c) =>
                  c.id === id ? { ...c, labelAt: labelAt as typeof curve.labelAt } : c,
                ),
              })
            }
          />
          <ResetLabelPosition
            moved={Boolean(curve.labelOffset)}
            onReset={() =>
              onChange({
                ...diagram,
                curves: diagram.curves.map((c) =>
                  c.id === id ? (({ labelOffset, ...rest }) => rest)(c) : c,
                ),
              })
            }
          />
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Double-click the line to add a kink. Drag a square handle to move one end.
            Drag the label ring to move its name.
          </p>
        </div>
      </div>
    );
  }

  if (mark) {
    const patch = (next: Partial<typeof mark>) =>
      onChange({
        ...diagram,
        points: diagram.points.map((p) => (p.id === id ? { ...p, ...next } : p)),
      });
    const toggleDrop = (axis: 'x' | 'y') => {
      const current = mark.dropTo ?? [];
      patch({ dropTo: current.includes(axis) ? current.filter((a) => a !== axis) : [...current, axis] });
    };
    return (
      <div>
        {header(plain(mark.label?.en) || 'Point')}
        <div className="space-y-2">
          <BiTextField
            label="Label"
            value={mark.label ?? emptyBiText()}
            rows={1}
            onChange={(next) => patch({ label: next })}
          />
          <div className="flex flex-wrap gap-1">
            <CheckField label="Dot" checked={mark.dot !== false} onChange={(dot) => patch({ dot })} />
            <CheckField
              label="Drop to x"
              checked={(mark.dropTo ?? []).includes('x')}
              onChange={() => toggleDrop('x')}
            />
            <CheckField
              label="Drop to y"
              checked={(mark.dropTo ?? []).includes('y')}
              onChange={() => toggleDrop('y')}
            />
          </div>
          {/* Picking a side is also how a hand-placed label is put back on the rails:
              the eight slots are the tidy defaults, so choosing one clears the free
              offset a drag wrote rather than fighting with it. */}
          <SelectField
            label="Label side"
            value={mark.labelSide ?? 'right'}
            options={[
              { value: 'upRight', label: 'Up-right' },
              { value: 'up', label: 'Up' },
              { value: 'upLeft', label: 'Up-left' },
              { value: 'left', label: 'Left' },
              { value: 'downLeft', label: 'Down-left' },
              { value: 'down', label: 'Down' },
              { value: 'downRight', label: 'Down-right' },
              { value: 'right', label: 'Right' },
            ]}
            onChange={(labelSide) =>
              onChange({
                ...diagram,
                points: diagram.points.map((p) =>
                  p.id === id
                    ? (({ labelOffset, ...rest }) => ({
                        ...rest,
                        labelSide: labelSide as typeof mark.labelSide,
                      }))(p)
                    : p,
                ),
              })
            }
          />
          <ResetLabelPosition
            moved={Boolean(mark.labelOffset)}
            onReset={() =>
              onChange({
                ...diagram,
                points: diagram.points.map((p) =>
                  p.id === id ? (({ labelOffset, ...rest }) => rest)(p) : p,
                ),
              })
            }
          />
          <BiTextField
            label="x-axis tick"
            value={mark.xTickLabel ?? emptyBiText()}
            rows={1}
            onChange={(xTickLabel) => patch({ xTickLabel })}
          />
          <BiTextField
            label="y-axis tick"
            value={mark.yTickLabel ?? emptyBiText()}
            rows={1}
            onChange={(yTickLabel) => patch({ yTickLabel })}
          />
        </div>
      </div>
    );
  }

  if (label) {
    return (
      <div>
        {header(plain(label.text.en) || 'Label')}
        <BiTextField
          label="Text"
          value={label.text}
          rows={1}
          onChange={(text) =>
            onChange({
              ...diagram,
              labels: diagram.labels.map((l) => (l.id === id ? { ...l, text } : l)),
            })
          }
        />
      </div>
    );
  }

  if (arrow) {
    return (
      <div>
        {header(plain(arrow.label?.en) || 'Arrow')}
        <div className="space-y-2">
          <BiTextField
            label="Label"
            value={arrow.label ?? emptyBiText()}
            rows={1}
            onChange={(next) =>
              onChange({
                ...diagram,
                arrows: diagram.arrows.map((a) => (a.id === id ? { ...a, label: next } : a)),
              })
            }
          />
          <CheckField
            label="Curved"
            checked={Boolean(arrow.curved)}
            onChange={(curved) =>
              onChange({
                ...diagram,
                arrows: diagram.arrows.map((a) => (a.id === id ? { ...a, curved } : a)),
              })
            }
          />
          <ResetLabelPosition
            moved={Boolean(arrow.labelOffset)}
            onReset={() =>
              onChange({
                ...diagram,
                arrows: diagram.arrows.map((a) =>
                  a.id === id ? (({ labelOffset, ...rest }) => rest)(a) : a,
                ),
              })
            }
          />
        </div>
      </div>
    );
  }

  return null;
}

/**
 * "Put this label back where it belongs."
 *
 * A dragged label has no other way home — its offset is invisible in the sidebar and
 * undo only helps while the drag is still the last thing that happened. Hidden until
 * there is something to reset, so it never advertises a state the diagram is not in.
 */
function ResetLabelPosition({ moved, onReset }: { moved: boolean; onReset: () => void }) {
  if (!moved) return null;
  return (
    <Button size="sm" variant="subtle" onClick={onReset}>
      Reset label position
    </Button>
  );
}

/**
 * The axis panel: a title, or one of its tick labels.
 *
 * Reached by clicking the text on the page, which is the only way to select an axis —
 * the axes are part of the diagram rather than entries in the element index, so there
 * is no row to click.
 */
function AxisInspector({
  diagram,
  handle,
  onChange,
  onDelete,
}: {
  diagram: Diagram;
  handle: Extract<DiagramHandle, { kind: 'axisTitle' | 'axisTick' }>;
  onChange: (diagram: Diagram) => void;
  onDelete: () => void;
}) {
  const axis = diagram[handle.axis];
  const axisName = handle.axis === 'x' ? 'x-axis' : 'y-axis';

  const header = (title: string) => (
    <header className="mb-2 flex items-center gap-1">
      <Eyebrow>{title}</Eyebrow>
      <span className="flex-1" />
      <IconButton label="Delete" variant="danger" onClick={onDelete}>
        <span aria-hidden>✕</span>
      </IconButton>
    </header>
  );

  if (handle.kind === 'axisTitle') {
    return (
      <div>
        {header(`${axisName} title`)}
        <div className="space-y-2">
          <BiTextField
            label="Title"
            value={axis.title ?? emptyBiText()}
            rows={1}
            onChange={(title) => onChange({ ...diagram, [handle.axis]: { ...axis, title } })}
          />
          <ResetLabelPosition
            moved={Boolean(axis.titleOffset)}
            onReset={() =>
              onChange({
                ...diagram,
                [handle.axis]: (({ titleOffset, ...rest }) => rest)(axis),
              })
            }
          />
        </div>
      </div>
    );
  }

  const tick = (axis.ticks ?? []).find((t) => t.id === handle.tickId);
  if (!tick) return null;
  return (
    <div>
      {header(`${axisName} tick`)}
      <div className="space-y-2">
        <BiTextField
          label="Label"
          value={tick.label}
          rows={1}
          onChange={(label) =>
            onChange({
              ...diagram,
              [handle.axis]: {
                ...axis,
                ticks: (axis.ticks ?? []).map((t) => (t.id === tick.id ? { ...t, label } : t)),
              },
            })
          }
        />
        <ResetLabelPosition
          moved={Boolean(tick.offset)}
          onReset={() =>
            onChange({
              ...diagram,
              [handle.axis]: {
                ...axis,
                ticks: (axis.ticks ?? []).map((t) =>
                  t.id === tick.id ? (({ offset, ...rest }) => rest)(t) : t,
                ),
              },
            })
          }
        />
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Drag it to slide along the {axisName}. It stays on the axis by design.
        </p>
      </div>
    </div>
  );
}

/** A short human name for whatever a handle addresses, for selection lists. */
function describeHandle(diagram: Diagram, handle: DiagramHandle): string {
  const id = handleId(handle);

  // Anchored text names both itself and what it belongs to, since selecting "S" and
  // selecting the supply curve are different things that would otherwise read alike.
  if (handle.kind === 'axisTitle') return `${handle.axis}-axis title`;
  if (handle.kind === 'axisTick') {
    const tick = (diagram[handle.axis].ticks ?? []).find((t) => t.id === handle.tickId);
    return `${handle.axis}-axis tick ${plain(tick?.label.en) || ''}`.trim();
  }
  if (handle.kind === 'pointTick') {
    const owner = diagram.points.find((p) => p.id === id);
    const text = handle.axis === 'x' ? owner?.xTickLabel : owner?.yTickLabel;
    return `${plain(text?.en) || handle.axis + '-tick'} (tick)`;
  }
  if (handle.kind === 'curveLabel') {
    const owner = diagram.curves.find((c) => c.id === id);
    return `${plain(owner?.label?.en) || 'Curve'} (label)`;
  }
  if (handle.kind === 'pointLabel') {
    const owner = diagram.points.find((p) => p.id === id);
    return `${plain(owner?.label?.en) || 'Point'} (label)`;
  }
  if (handle.kind === 'arrowLabel') {
    const owner = diagram.arrows.find((a) => a.id === id);
    return `${plain(owner?.label?.en) || 'Arrow'} (label)`;
  }

  const curve = diagram.curves.find((c) => c.id === id);
  if (curve) return plain(curve.label?.en) || plain(curve.label?.zh) || 'Curve';
  const mark = diagram.points.find((p) => p.id === id);
  if (mark) return plain(mark.label?.en) || plain(mark.label?.zh) || 'Point';
  const label = diagram.labels.find((l) => l.id === id);
  if (label) return plain(label.text.en) || plain(label.text.zh) || 'Label';
  const arrow = diagram.arrows.find((a) => a.id === id);
  if (arrow) return plain(arrow.label?.en) || 'Arrow';
  return 'Element';
}

/**
 * Everything on the diagram, as a selectable list.
 *
 * This is what the panel shows when nothing is selected. Two things make it worth the
 * space rather than a "nothing selected" message: a curve hidden under another can be
 * reached by name when it cannot be reached by clicking, and the list is the only place
 * that says out loud how many elements a diagram actually has.
 */
function ElementIndex({
  diagram,
  onSelect,
}: {
  diagram: Diagram;
  onSelect: (handles: DiagramHandle[]) => void;
}) {
  const rows: Array<{ handle: DiagramHandle; name: string; kind: string }> = [
    ...diagram.curves.map((c) => ({
      handle: { kind: 'curve', curveId: c.id } as DiagramHandle,
      name: plain(c.label?.en) || plain(c.label?.zh) || 'Curve',
      kind: 'Curve',
    })),
    ...diagram.points.map((p) => ({
      handle: { kind: 'point', pointId: p.id } as DiagramHandle,
      name: plain(p.label?.en) || plain(p.label?.zh) || 'Point',
      kind: 'Point',
    })),
    ...diagram.labels.map((l) => ({
      handle: { kind: 'label', labelId: l.id } as DiagramHandle,
      name: plain(l.text.en) || plain(l.text.zh) || 'Label',
      kind: 'Label',
    })),
    ...diagram.arrows.map((a) => ({
      handle: { kind: 'arrow', arrowId: a.id } as DiagramHandle,
      name: plain(a.label?.en) || 'Arrow',
      kind: 'Arrow',
    })),
  ];

  return (
    <div>
      <Eyebrow>On this diagram</Eyebrow>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Nothing here yet. Pick <strong>Curve</strong> and drag to draw a line, or{' '}
          <strong>Point</strong> and click to mark an equilibrium.
        </p>
      ) : (
        <ul className="mt-2 space-y-1">
          {rows.map((row) => (
            <li key={`${row.kind}-${handleId(row.handle)}`}>
              <button
                type="button"
                onClick={() => onSelect([row.handle])}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-slate-700 transition-colors hover:bg-sky-50 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <span className="truncate font-medium">{row.name}</span>
                <span className="flex-1" />
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                  {row.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 border-t border-slate-200 pt-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Drag anything to move it. Click it instead to select it and edit its properties
        here. Drag empty space to box-select; shift-click adds. Arrow keys nudge a
        selection — hold Shift for bigger steps. ⌘C / ⌘V / ⌘D / ⌫ act on a selection,
        ⌘A selects everything.
      </p>
    </div>
  );
}
