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
import { DEFAULT_SPAN_OFFSET, isShiftWedge } from '@/model/diagramSpans';
import { pointTitle } from '@/model/diagramShift';
import type { DiagramHandle } from '@/model/diagramDraw';
import { emptyBiText, plain } from '@/model/text';
import type { BiText } from '@/model/types';
import { Button, Eyebrow, IconButton, SelectField } from '@/components/ui';
import type { TextKey } from '@/i18n/catalogue';
import { resolveMessages, sideOf } from '@/i18n/catalogue';
import { uiLanguage, useMessages } from '@/i18n/language';
import { BiTextField } from './BiTextField';
import { DIAGRAM_RELATION_MESSAGES, pointTitleText } from './diagramEditing.messages';

/**
 * The canvas's controls for relations: what an anchored point follows, derived curves
 * (MR, parallel, tangent, level lines), spans, and numeric axis scales. Positions stay
 * set by dragging; these only name, create and cut relations.
 */

type RelationKey = TextKey<typeof DIAGRAM_RELATION_MESSAGES>;

export const SPAN_STYLES: Array<{ value: DiagramSpanStyle; label: RelationKey }> = [
  { value: 'doubleArrow', label: 'doubleArrow' },
  { value: 'arrow', label: 'arrow' },
  { value: 'bracket', label: 'bracket' },
  { value: 'dimension', label: 'dimension' },
];

export type SpanAlong = 'none' | 'x' | 'y';

export const SPAN_ALONG: Array<{ value: SpanAlong; label: RelationKey }> = [
  { value: 'none', label: 'between' },
  { value: 'x', label: 'onX' },
  { value: 'y', label: 'onY' },
];

/** The span options with their labels in the interface language. */
export function spanOptions(m: { [K in RelationKey]: string }) {
  return {
    styles: SPAN_STYLES.map((entry) => ({ value: entry.value, label: m[entry.label] })),
    along: SPAN_ALONG.map((entry) => ({ value: entry.value, label: m[entry.label] })),
  };
}

const text = () => resolveMessages(DIAGRAM_RELATION_MESSAGES, uiLanguage());

const same = (text: string): BiText => ({ en: [{ text }], zh: [{ text }] });

const curveName = (diagram: Diagram, id: string) => {
  const m = text();
  const index = diagram.curves.findIndex((c) => c.id === id);
  const curve = diagram.curves[index];
  if (!curve) return m.deletedCurve;
  return plain(curve.label?.en) || plain(curve.label?.zh) || m.curveN(index + 1);
};

const pointName = (diagram: Diagram, id: string) => {
  const index = diagram.points.findIndex((p) => p.id === id);
  const mark = diagram.points[index];
  if (!mark) return text().deletedPoint;
  const title = pointTitle(mark);
  return title === 'Point' ? text().pointN(index + 1) : pointTitleText(title, sideOf(uiLanguage()));
};

/** A reference in words: "D × S", "S at E₁'s level". */
export function anchorName(diagram: Diagram, ref: DiagramAnchorRef): string {
  const part = (value: DiagramAnchorRef | number, axis: DiagramAxis) =>
    typeof value === 'number' ? formatAxisValue(axisValue(axis, value)) : anchorName(diagram, value);
  if ('point' in ref) return pointName(diagram, ref.point);
  if ('cross' in ref) return `${curveName(diagram, ref.cross[0])} × ${curveName(diagram, ref.cross[1])}`;
  if ('on' in ref) {
    return 'x' in ref
      ? text().under(curveName(diagram, ref.on), anchorName(diagram, ref.x))
      : text().levelWith(curveName(diagram, ref.on), part(ref.y, diagram.y));
  }
  return `(${part(ref.x, diagram.x)}, ${part(ref.y, diagram.y)})`;
}

export const placeName = (diagram: Diagram, place: DiagramPlace) =>
  isFixedPlace(place) ? text().freeSpot : anchorName(diagram, place);

/** What a derived curve is, in words. */
export function deriveName(diagram: Diagram, derive: DiagramCurveDerive): string {
  const at = (value: DiagramAnchorRef | number, axis: DiagramAxis) =>
    typeof value === 'number' ? formatAxisValue(axisValue(axis, value)) : anchorName(diagram, value);
  switch (derive.kind) {
    case 'marginalRevenue':
      return text().marginalRevenue(curveName(diagram, derive.of));
    case 'parallel':
      return text().parallel(curveName(diagram, derive.to), placeName(diagram, derive.through));
    case 'shift':
      return text().shifted(curveName(diagram, derive.of));
    case 'tangent':
      return text().tangent(curveName(diagram, derive.to), placeName(diagram, derive.at));
    case 'level':
      return text().horizontalAt(at(derive.y, diagram.y));
    case 'vertical':
      return text().verticalAt(at(derive.x, diagram.x));
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
        placeholder={clearable ? '–' : undefined}
        className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-xs tabular-nums text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
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
  const m = useMessages(DIAGRAM_RELATION_MESSAGES);
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
          <span className="text-ink-muted">{m.follows}</span> {deriveName(diagram, derive)}
        </p>
        {numeric && (
          <ValueField
            label={derive.kind === 'vertical' ? m.atX : m.atY}
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
          {m.detach}
        </Button>
      </div>
    );
  }

  const add = (next: DiagramCurve) => {
    onChange({ ...diagram, curves: [...diagram.curves, next] });
    onSelect([{ kind: 'curve', curveId: next.id }]);
  };
  const pointOptions = [
    { value: '', label: m.choosePoint },
    ...diagram.points.map((p) => ({ value: p.id, label: pointName(diagram, p.id) })),
  ];
  return (
    <div className="space-y-1.5 border-t border-line pt-2">
      <Eyebrow>{m.drawFrom}</Eyebrow>
      {curve.points.length === 2 && (
        <Button
          size="sm"
          variant="subtle"
          onClick={() => add(derivedCurve(newId(), { kind: 'marginalRevenue', of: curve.id }, curve.points, same('MR')))}
        >
          {m.mrButton}
        </Button>
      )}
      {diagram.points.length > 0 && (
        <>
          <SelectField
            label={m.parallelThrough}
            value=""
            options={pointOptions}
            onChange={(pointId) =>
              pointId &&
              add(derivedCurve(newId(), { kind: 'parallel', to: curve.id, through: { point: pointId } }, curve.points))
            }
          />
          <SelectField
            label={m.tangentAt}
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
  const m = useMessages(DIAGRAM_RELATION_MESSAGES);
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
            <span className="text-ink-muted">{m.follows}</span> {anchorName(diagram, mark.anchor)}
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
            {m.detach}
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
  const m = useMessages(DIAGRAM_RELATION_MESSAGES);
  const options = spanOptions(m);
  const wedge = isShiftWedge(diagram, span);
  const style = wedge ? m.wedge : (options.styles.find((entry) => entry.value === span.style)?.label ?? m.span);
  return (
    <div>
      <header className="mb-2 flex items-center gap-1">
        <Eyebrow>{plain(span.label?.en) || style}</Eyebrow>
        <span className="flex-1" />
        <IconButton label={m.delete} variant="danger" onClick={onDelete}>
          <span aria-hidden>✕</span>
        </IconButton>
      </header>
      <div className="space-y-2">
        <BiTextField
          translate={{ kind: 'diagramLabel', fallsBack: true }}
          label={m.label}
          value={span.label ?? emptyBiText()}
          rows={1}
          onChange={(label) => patch((s) => ({ ...s, label }))}
        />
        {/* A tax or subsidy wedge is always an arrow from S₀ to S₁: nothing to choose. */}
        {!wedge && (
          <>
            <SelectField
              label={m.style}
              value={span.style}
              options={options.styles}
              onChange={(value) => patch((s) => ({ ...s, style: value }))}
            />
            <SelectField
              label={m.sits}
              value={span.along ?? 'none'}
              options={options.along}
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
          </>
        )}
        <p className="text-[11px] leading-snug text-ink">
          <span className="text-ink-muted">{m.fromWord}</span> {placeName(diagram, span.from)}{' '}
          <span className="text-ink-muted">{m.toWord}</span> {placeName(diagram, span.to)}
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
            {m.resetLabel}
          </Button>
        )}
        <p className="text-[11px] text-ink-muted">{m.spanNote}</p>
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
  const m = useMessages(DIAGRAM_RELATION_MESSAGES);
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
        <ValueField label={m.xMax} clearable value={diagram.x.max} onCommit={(v) => setMax('x', v)} />
        <ValueField label={m.yMax} clearable value={diagram.y.max} onCommit={(v) => setMax('y', v)} />
      </div>
      {(diagram.x.max || diagram.y.max) && (
        <div className="flex animate-fade-in flex-wrap gap-1.5">
          {diagram.x.max ? (
            <Button size="sm" variant="subtle" onClick={() => addTick('x')}>
              {m.addXTick}
            </Button>
          ) : null}
          {diagram.y.max ? (
            <Button size="sm" variant="subtle" onClick={() => addTick('y')}>
              {m.addYTick}
            </Button>
          ) : null}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="subtle" onClick={() => addLine('level')}>
          {m.addHorizontal}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => addLine('vertical')}>
          {m.addVertical}
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
  const m = useMessages(DIAGRAM_RELATION_MESSAGES);
  const scale = diagram[axis];
  const tick = (scale.ticks ?? []).find((t) => t.id === tickId);
  if (!scale.max || !tick) return null;
  return (
    <ValueField
      label={m.value}
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
