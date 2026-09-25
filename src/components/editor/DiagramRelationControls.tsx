'use client';

import { useState } from 'react';
import {
  axisUnit,
  axisValue,
  clampUnit,
  formatAxisValue,
  type Diagram,
  type DiagramAnchorRef,
  type DiagramAxis,
  type DiagramCurve,
  type DiagramCurveDerive,
  type DiagramPlace,
  type DiagramPointMark,
  type DiagramSpan,
  type DiagramSpanStyle,
} from '@/model/diagram';
import { isFixedPlace } from '@/model/diagramAnchors';
import { DEFAULT_SPAN_OFFSET } from '@/model/diagramSpans';
import type { DiagramHandle } from '@/model/diagramDraw';
import { emptyBiText, plain } from '@/model/text';
import type { BiText } from '@/model/types';
import { Button, Eyebrow, IconButton, SelectField } from '@/components/ui';
import { BiTextField } from './BiTextField';

/**
 * The canvas's controls for relations: what an anchored point follows, derived curves
 * (MR, parallel, tangent, level lines), spans, and numeric axis scales. Positions stay
 * set by dragging; these only name, create and cut relations.
 */

export const SPAN_STYLES: Array<{ value: DiagramSpanStyle; label: string }> = [
  { value: 'doubleArrow', label: 'Double arrow' },
  { value: 'arrow', label: 'Arrow' },
  { value: 'bracket', label: 'Bracket' },
  { value: 'dimension', label: 'Dimension (t)' },
];

export type SpanAlong = 'none' | 'x' | 'y';

export const SPAN_ALONG: Array<{ value: SpanAlong; label: string }> = [
  { value: 'none', label: 'Between the ends' },
  { value: 'x', label: 'On the x-axis' },
  { value: 'y', label: 'On the y-axis' },
];

const same = (text: string): BiText => ({ en: [{ text }], zh: [{ text }] });

const curveName = (diagram: Diagram, id: string) => {
  const index = diagram.curves.findIndex((c) => c.id === id);
  const curve = diagram.curves[index];
  if (!curve) return 'a deleted curve';
  return plain(curve.label?.en) || plain(curve.label?.zh) || `Curve ${index + 1}`;
};

const pointName = (diagram: Diagram, id: string) => {
  const index = diagram.points.findIndex((p) => p.id === id);
  const mark = diagram.points[index];
  if (!mark) return 'a deleted point';
  return plain(mark.label?.en) || plain(mark.label?.zh) || `Point ${index + 1}`;
};

/** A reference in words: "D × S", "S at E₁'s level". */
export function anchorName(diagram: Diagram, ref: DiagramAnchorRef): string {
  const part = (value: DiagramAnchorRef | number, axis: DiagramAxis) =>
    typeof value === 'number' ? formatAxisValue(axisValue(axis, value)) : anchorName(diagram, value);
  if ('point' in ref) return pointName(diagram, ref.point);
  if ('cross' in ref) return `${curveName(diagram, ref.cross[0])} × ${curveName(diagram, ref.cross[1])}`;
  if ('on' in ref) {
    return 'x' in ref
      ? `${curveName(diagram, ref.on)} under ${anchorName(diagram, ref.x)}`
      : `${curveName(diagram, ref.on)} level with ${part(ref.y, diagram.y)}`;
  }
  return `(${part(ref.x, diagram.x)}, ${part(ref.y, diagram.y)})`;
}

export const placeName = (diagram: Diagram, place: DiagramPlace) =>
  isFixedPlace(place) ? 'a free spot' : anchorName(diagram, place);

/** What a derived curve is, in words. */
export function deriveName(diagram: Diagram, derive: DiagramCurveDerive): string {
  const at = (value: DiagramAnchorRef | number, axis: DiagramAxis) =>
    typeof value === 'number' ? formatAxisValue(axisValue(axis, value)) : anchorName(diagram, value);
  switch (derive.kind) {
    case 'marginalRevenue':
      return `MR of ${curveName(diagram, derive.of)}`;
    case 'parallel':
      return `Parallel to ${curveName(diagram, derive.to)} through ${placeName(diagram, derive.through)}`;
    case 'shift':
      return `${curveName(diagram, derive.of)}, shifted`;
    case 'tangent':
      return `Tangent to ${curveName(diagram, derive.to)} at ${placeName(diagram, derive.at)}`;
    case 'level':
      return `Horizontal at ${at(derive.y, diagram.y)}`;
    case 'vertical':
      return `Vertical at ${at(derive.x, diagram.x)}`;
  }
}

/**
 * A number typed as text and committed on blur or Enter, so a half-typed "0." is not
 * written (and not pushed onto undo) keystroke by keystroke.
 */
export function ValueField({
  label,
  value,
  onCommit,
  clearable = false,
}: {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  clearable?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? '' : formatAxisValue(value));
  const commit = () => {
    if (draft === null) return;
    const text = draft.trim();
    setDraft(null);
    if (text === '') {
      if (clearable) onCommit(undefined);
      return;
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed)) onCommit(parsed);
  };
  return (
    <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
      {label}
      <input
        type="text"
        inputMode="decimal"
        value={shown}
        placeholder={clearable ? '—' : undefined}
        className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-xs tabular-nums text-ink outline-none transition-colors placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            setDraft(null);
          }
        }}
      />
    </label>
  );
}

const mapCurve = (diagram: Diagram, id: string, patch: (curve: DiagramCurve) => DiagramCurve): Diagram => ({
  ...diagram,
  curves: diagram.curves.map((c) => (c.id === id ? patch(c) : c)),
});

/** A new derived curve: the source's points stand in until the first resolve. */
function derivedCurve(id: string, derive: DiagramCurveDerive, points: DiagramCurve['points'], label?: BiText): DiagramCurve {
  const curve: DiagramCurve = { id, points: points.map((p) => ({ ...p })), shape: 'straight', labelAt: 'end', derive };
  if (label) curve.label = label;
  return curve;
}

/** The curve inspector's relation section: what it follows, or the curves it can spawn. */
export function CurveRelationControls({
  diagram,
  curve,
  onChange,
  onSelect,
  newId,
}: {
  diagram: Diagram;
  curve: DiagramCurve;
  onChange: (diagram: Diagram) => void;
  onSelect: (handles: DiagramHandle[]) => void;
  newId: () => string;
}) {
  const derive = curve.derive;
  if (derive) {
    const detach = () =>
      onChange(
        mapCurve(diagram, curve.id, (c) => {
          const rest = { ...c };
          delete rest.derive;
          return rest;
        }),
      );
    const numeric =
      (derive.kind === 'level' && typeof derive.y === 'number') ||
      (derive.kind === 'vertical' && typeof derive.x === 'number');
    const axis = derive.kind === 'vertical' ? diagram.x : diagram.y;
    return (
      <div className="space-y-1.5 rounded-lg bg-surface-sunken p-2">
        <p className="text-[11px] leading-snug text-ink">
          <span className="text-ink-muted">Follows:</span> {deriveName(diagram, derive)}
        </p>
        {numeric && (
          <ValueField
            label={derive.kind === 'vertical' ? 'At x =' : 'At y ='}
            value={axisValue(axis, derive.kind === 'vertical' ? (derive.x as number) : (derive.y as number))}
            onCommit={(value) => {
              if (value === undefined) return;
              const unit = clampUnit(axisUnit(axis, value));
              onChange(
                mapCurve(diagram, curve.id, (c) => ({
                  ...c,
                  derive: derive.kind === 'vertical' ? { ...derive, x: unit } : { ...derive, y: unit },
                })),
              );
            }}
          />
        )}
        <Button size="sm" variant="subtle" onClick={detach}>
          Detach — keep it where it is
        </Button>
      </div>
    );
  }

  const add = (next: DiagramCurve) => {
    onChange({ ...diagram, curves: [...diagram.curves, next] });
    onSelect([{ kind: 'curve', curveId: next.id }]);
  };
  const pointOptions = [
    { value: '', label: 'Choose a point…' },
    ...diagram.points.map((p) => ({ value: p.id, label: pointName(diagram, p.id) })),
  ];
  return (
    <div className="space-y-1.5 border-t border-line pt-2">
      <Eyebrow>Draw from this curve</Eyebrow>
      {curve.points.length === 2 && (
        <Button
          size="sm"
          variant="subtle"
          onClick={() => add(derivedCurve(newId(), { kind: 'marginalRevenue', of: curve.id }, curve.points, same('MR')))}
        >
          MR — same intercept, twice as steep
        </Button>
      )}
      {diagram.points.length > 0 && (
        <>
          <SelectField
            label="Parallel through"
            value=""
            options={pointOptions}
            onChange={(pointId) =>
              pointId &&
              add(derivedCurve(newId(), { kind: 'parallel', to: curve.id, through: { point: pointId } }, curve.points))
            }
          />
          <SelectField
            label="Tangent at"
            value=""
            options={pointOptions}
            onChange={(pointId) =>
              pointId && add(derivedCurve(newId(), { kind: 'tangent', to: curve.id, at: { point: pointId } }, curve.points))
            }
          />
        </>
      )}
    </div>
  );
}

/** The point inspector's relation section: its values on a scaled axis, and what it follows. */
export function PointRelationControls({
  diagram,
  mark,
  onChange,
}: {
  diagram: Diagram;
  mark: DiagramPointMark;
  onChange: (diagram: Diagram) => void;
}) {
  const patch = (next: (p: DiagramPointMark) => DiagramPointMark) =>
    onChange({ ...diagram, points: diagram.points.map((p) => (p.id === mark.id ? next(p) : p)) });
  const place = (axis: 'x' | 'y', value: number | undefined) => {
    if (value === undefined) return;
    // A typed position is a free one: it replaces whatever the point followed.
    patch((p) => {
      const rest = { ...p, at: { ...p.at, [axis]: clampUnit(axisUnit(diagram[axis], value)) } };
      delete rest.anchor;
      return rest;
    });
  };
  const scaled = Boolean(diagram.x.max || diagram.y.max);
  return (
    <div className="space-y-1.5">
      {scaled && (
        <div className="flex flex-wrap gap-2">
          <ValueField label="x" value={axisValue(diagram.x, mark.at.x)} onCommit={(v) => place('x', v)} />
          <ValueField label="y" value={axisValue(diagram.y, mark.at.y)} onCommit={(v) => place('y', v)} />
        </div>
      )}
      {mark.anchor && (
        <div className="space-y-1.5 rounded-lg bg-surface-sunken p-2">
          <p className="text-[11px] leading-snug text-ink">
            <span className="text-ink-muted">Follows:</span> {anchorName(diagram, mark.anchor)}
          </p>
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              patch((p) => {
                const rest = { ...p };
                delete rest.anchor;
                return rest;
              })
            }
          >
            Detach — keep it where it is
          </Button>
        </div>
      )}
    </div>
  );
}

/** The inspector for one span. */
export function SpanInspector({
  diagram,
  span,
  onChange,
  onDelete,
}: {
  diagram: Diagram;
  span: DiagramSpan;
  onChange: (diagram: Diagram) => void;
  onDelete: () => void;
}) {
  const patch = (next: (s: DiagramSpan) => DiagramSpan) =>
    onChange({ ...diagram, spans: (diagram.spans ?? []).map((s) => (s.id === span.id ? next(s) : s)) });
  const style = SPAN_STYLES.find((entry) => entry.value === span.style)?.label ?? 'Span';
  return (
    <div>
      <header className="mb-2 flex items-center gap-1">
        <Eyebrow>{plain(span.label?.en) || style}</Eyebrow>
        <span className="flex-1" />
        <IconButton label="Delete" variant="danger" onClick={onDelete}>
          <span aria-hidden>✕</span>
        </IconButton>
      </header>
      <div className="space-y-2">
        <BiTextField
          label="Label"
          value={span.label ?? emptyBiText()}
          rows={1}
          onChange={(label) => patch((s) => ({ ...s, label }))}
        />
        <SelectField
          label="Style"
          value={span.style}
          options={SPAN_STYLES}
          onChange={(value) => patch((s) => ({ ...s, style: value }))}
        />
        <SelectField
          label="Sits"
          value={span.along ?? 'none'}
          options={SPAN_ALONG}
          onChange={(value) =>
            patch((s) => {
              // The offset is measured from a different rest on an axis, so it restarts there.
              const rest = { ...s };
              if (value === 'none') {
                delete rest.along;
                rest.offset = DEFAULT_SPAN_OFFSET;
              } else {
                rest.along = value;
                delete rest.offset;
              }
              return rest;
            })
          }
        />
        <p className="text-[11px] leading-snug text-ink">
          <span className="text-ink-muted">From</span> {placeName(diagram, span.from)}{' '}
          <span className="text-ink-muted">to</span> {placeName(diagram, span.to)}
        </p>
        {span.labelOffset && (
          <Button
            size="sm"
            variant="subtle"
            onClick={() =>
              patch((s) => {
                const rest = { ...s };
                delete rest.labelOffset;
                return rest;
              })
            }
          >
            Reset label position
          </Button>
        )}
        <p className="text-[11px] text-ink-muted">
          Drag the span to move it off its line. Drag an end onto a point or a crossing to attach it
          there; drop it elsewhere to leave it free.
        </p>
      </div>
    </div>
  );
}

/** Whole-diagram relation settings for the element index: axis scales and level lines. */
export function DiagramScaleControls({
  diagram,
  onChange,
  onSelect,
  newId,
}: {
  diagram: Diagram;
  onChange: (diagram: Diagram) => void;
  onSelect: (handles: DiagramHandle[]) => void;
  newId: () => string;
}) {
  const setMax = (axis: 'x' | 'y', max: number | undefined) => {
    const next = { ...diagram[axis] };
    if (max && max > 0) next.max = max;
    else delete next.max;
    onChange({ ...diagram, [axis]: next });
  };
  const addTick = (axis: 'x' | 'y') => {
    const id = newId();
    const ticks = [...(diagram[axis].ticks ?? []), { id, at: 0.5, label: emptyBiText() }];
    onChange({ ...diagram, [axis]: { ...diagram[axis], ticks } });
    onSelect([{ kind: 'axisTick', axis, tickId: id }]);
  };
  const addLine = (kind: 'level' | 'vertical') => {
    const id = newId();
    const derive: DiagramCurveDerive = kind === 'level' ? { kind, y: 0.5 } : { kind, x: 0.5 };
    const points = kind === 'level' ? [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] : [{ x: 0.5, y: 0 }, { x: 0.5, y: 1 }];
    onChange({ ...diagram, curves: [...diagram.curves, derivedCurve(id, derive, points)] });
    onSelect([{ kind: 'curve', curveId: id }]);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <ValueField label="x max" clearable value={diagram.x.max} onCommit={(v) => setMax('x', v)} />
        <ValueField label="y max" clearable value={diagram.y.max} onCommit={(v) => setMax('y', v)} />
      </div>
      {(diagram.x.max || diagram.y.max) && (
        <div className="flex flex-wrap gap-1.5">
          {diagram.x.max ? (
            <Button size="sm" variant="subtle" onClick={() => addTick('x')}>
              + x tick
            </Button>
          ) : null}
          {diagram.y.max ? (
            <Button size="sm" variant="subtle" onClick={() => addTick('y')}>
              + y tick
            </Button>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="subtle" onClick={() => addLine('level')}>
          + Horizontal line
        </Button>
        <Button size="sm" variant="subtle" onClick={() => addLine('vertical')}>
          + Vertical line
        </Button>
      </div>
    </div>
  );
}

/** A tick's value on a scaled axis, typed rather than dragged. */
export function TickValueField({
  diagram,
  axis,
  tickId,
  onChange,
}: {
  diagram: Diagram;
  axis: 'x' | 'y';
  tickId: string;
  onChange: (diagram: Diagram) => void;
}) {
  const scale = diagram[axis];
  const tick = (scale.ticks ?? []).find((t) => t.id === tickId);
  if (!scale.max || !tick) return null;
  return (
    <ValueField
      label="Value"
      value={axisValue(scale, tick.at)}
      onCommit={(value) => {
        if (value === undefined) return;
        const at = clampUnit(axisUnit(scale, value));
        onChange({
          ...diagram,
          [axis]: { ...scale, ticks: (scale.ticks ?? []).map((t) => (t.id === tickId ? { ...t, at } : t)) },
        });
      }}
    />
  );
}
