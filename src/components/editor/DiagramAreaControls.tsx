'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  Diagram,
  DiagramAnchorRef,
  DiagramArea,
  DiagramAreaEdge,
  DiagramAreaFill,
  DiagramAreaX,
} from '@/model/diagram';
import {
  AREA_PRESETS,
  curveCrossing,
  freezeArea,
  guessMarketCurves,
  presetArea,
  type AreaPreset,
} from '@/model/diagramAreas';
import type { DiagramHandle } from '@/model/diagramDraw';
import { shiftCurve } from '@/model/diagramShift';
import { emptyBiText, plain } from '@/model/text';
import { BiTextField } from './BiTextField';
import { Button, IconButton, NumberField, Segmented, SelectField, Eyebrow } from '@/components/ui';

/**
 * The drawing canvas's controls for shaded areas and curve shifts (§ Shaded areas).
 * Kept apart from `DiagramCanvas` so the canvas only routes selections here.
 */

/** A short name for an area, for lists and headers. */
export function areaName(area: DiagramArea): string {
  return plain(area.label?.en) || plain(area.label?.zh) || 'Shaded area';
}

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

function anchorName(diagram: Diagram, ref: DiagramAnchorRef): string {
  if ('point' in ref) return pointName(diagram, ref.point);
  if ('cross' in ref) return `${curveName(diagram, ref.cross[0])} × ${curveName(diagram, ref.cross[1])}`;
  return `${curveName(diagram, ref.on)} below ${anchorName(diagram, ref.x)}`;
}

/** A stable key for a reference, blind to the order of a crossing's two curves. */
function refKey(value: unknown): string {
  return JSON.stringify(value, (_key, entry) =>
    entry && typeof entry === 'object' && 'cross' in entry
      ? { cross: [...(entry as { cross: string[] }).cross].sort() }
      : entry,
  );
}

/** Every crossing between two curves, as references. */
function crossings(diagram: Diagram): DiagramAnchorRef[] {
  const out: DiagramAnchorRef[] = [];
  diagram.curves.forEach((a, i) => {
    diagram.curves.slice(i + 1).forEach((b) => {
      if (curveCrossing(a, b)) out.push({ cross: [a.id, b.id] });
    });
  });
  return out;
}

function edgeOptions(diagram: Diagram, current: DiagramAreaEdge) {
  const anchors: DiagramAnchorRef[] = [
    ...diagram.points.map((p) => ({ point: p.id })),
    ...crossings(diagram),
  ];
  const options: Array<{ value: DiagramAreaEdge; label: string }> = [
    ...diagram.curves.map((c) => ({ value: { curve: c.id }, label: `Curve ${curveName(diagram, c.id)}` })),
    ...anchors.map((ref) => ({ value: { level: ref }, label: `Level of ${anchorName(diagram, ref)}` })),
    { value: { level: 0 }, label: 'The x-axis' },
  ];
  if (!options.some((o) => refKey(o.value) === refKey(current))) {
    options.push({
      value: current,
      label:
        'curve' in current
          ? `Curve ${curveName(diagram, current.curve)}`
          : typeof current.level === 'number'
            ? `Level ${Math.round(current.level * 100)}%`
            : `Level of ${anchorName(diagram, current.level)}`,
    });
  }
  return options;
}

function xOptions(diagram: Diagram, current: DiagramAreaX) {
  const options: Array<{ value: DiagramAreaX; label: string }> = [
    { value: 0, label: 'The y-axis' },
    ...diagram.points.map((p) => ({ value: { point: p.id }, label: `At ${pointName(diagram, p.id)}` })),
    ...crossings(diagram).map((ref) => ({ value: ref, label: `At ${anchorName(diagram, ref)}` })),
  ];
  if (!options.some((o) => refKey(o.value) === refKey(current))) {
    options.push({
      value: current,
      label: typeof current === 'number' ? `At ${Math.round(current * 100)}%` : `At ${anchorName(diagram, current)}`,
    });
  }
  return options;
}

/** A select over reference values, keyed by `refKey`. */
function RefSelect<T>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <SelectField
      label={label}
      value={refKey(value)}
      options={options.map((option) => ({ value: refKey(option.value), label: option.label }))}
      onChange={(key) => {
        const match = options.find((option) => refKey(option.value) === key);
        if (match) onChange(match.value);
      }}
    />
  );
}

/**
 * "Shade ▾" in the canvas header: the four welfare presets, built from the curves the
 * diagram already has, plus a free shape. A preset that cannot be built says why.
 */
export function ShadeMenu({
  diagram,
  open,
  onOpenChange,
  onAdd,
  newId,
}: {
  diagram: Diagram;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (area: DiagramArea) => void;
  newId: () => string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, onOpenChange]);

  const curves = guessMarketCurves(diagram);
  const items = AREA_PRESETS.map((preset) => {
    const area = presetArea(preset.id, curves, 'probe');
    const why = !curves.demand || !curves.supply
      ? 'Needs a falling demand and a rising supply curve'
      : preset.needsTax && !curves.taxed
        ? 'Needs a taxed supply curve — shift S up first'
        : undefined;
    return { preset, available: Boolean(area), why };
  });

  const add = (preset: AreaPreset) => {
    const area = presetArea(preset, curves, newId());
    if (area) onAdd(area);
    onOpenChange(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Shade an area — consumer surplus, producer surplus, deadweight loss, tax revenue"
        onClick={() => onOpenChange(!open)}
        className={
          'flex h-11 items-center gap-1.5 rounded-lg border px-3 text-base transition-colors ' +
          (open
            ? 'border-accent bg-accent text-on-accent'
            : 'border-line-strong bg-surface-raised text-ink hover:bg-surface-hover')
        }
      >
        <span aria-hidden className="text-lg leading-none">▨</span>
        <span className="text-xs font-medium">Shade ▾</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-20 mt-1.5 w-72 rounded-xl border border-line bg-surface-raised p-1 shadow-xl"
        >
          {items.map(({ preset, available, why }) => (
            <button
              key={preset.id}
              type="button"
              role="menuitem"
              disabled={!available}
              onClick={() => add(preset.id)}
              className="flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
            >
              <span className="text-[13px] text-ink">{preset.name}</span>
              {why && <span className="text-[11px] text-ink-subtle">{why}</span>}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onAdd({
                id: newId(),
                vertices: [
                  { x: 0.3, y: 0.25 },
                  { x: 0.5, y: 0.25 },
                  { x: 0.5, y: 0.4 },
                  { x: 0.3, y: 0.4 },
                ],
                label: emptyBiText(),
              });
              onOpenChange(false);
            }}
            className="flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover"
          >
            <span className="text-[13px] text-ink">Free shape</span>
            <span className="text-[11px] text-ink-subtle">Drag its corners anywhere</span>
          </button>
        </div>
      )}
    </div>
  );
}

/** The selected area's properties: label, fill, and what bounds it. */
export function AreaInspector({
  diagram,
  area,
  onChange,
  onDelete,
}: {
  diagram: Diagram;
  area: DiagramArea;
  onChange: (diagram: Diagram) => void;
  onDelete: () => void;
}) {
  const patch = (next: DiagramArea) =>
    onChange({ ...diagram, areas: (diagram.areas ?? []).map((a) => (a.id === area.id ? next : a)) });
  const band = area.band;

  return (
    <div>
      <header className="mb-2 flex items-center gap-1">
        <Eyebrow>{areaName(area)}</Eyebrow>
        <span className="flex-1" />
        <IconButton label="Delete" variant="danger" onClick={onDelete}>
          <span aria-hidden>✕</span>
        </IconButton>
      </header>
      <div className="space-y-2">
        <BiTextField
          label="Label"
          value={area.label ?? emptyBiText()}
          rows={1}
          onChange={(label) => patch({ ...area, label })}
        />
        <SelectField<DiagramAreaFill>
          label="Fill"
          value={area.fill ?? 'shade'}
          options={[
            { value: 'shade', label: 'Grey shade' },
            { value: 'hatch', label: 'Hatched' },
          ]}
          onChange={(fill) => patch({ ...area, fill })}
        />
        {band ? (
          <>
            <Eyebrow className="block pt-1">Bounded by</Eyebrow>
            <RefSelect
              label="Edge"
              value={band.edges[0]}
              options={edgeOptions(diagram, band.edges[0])}
              onChange={(edge) => patch({ ...area, band: { ...band, edges: [edge, band.edges[1]] } })}
            />
            <RefSelect
              label="Edge"
              value={band.edges[1]}
              options={edgeOptions(diagram, band.edges[1])}
              onChange={(edge) => patch({ ...area, band: { ...band, edges: [band.edges[0], edge] } })}
            />
            <RefSelect
              label="From"
              value={band.from}
              options={xOptions(diagram, band.from)}
              onChange={(from) => patch({ ...area, band: { ...band, from } })}
            />
            <RefSelect
              label="To"
              value={band.to}
              options={xOptions(diagram, band.to)}
              onChange={(to) => patch({ ...area, band: { ...band, to } })}
            />
            <p className="text-[11px] text-ink-muted">
              The shading follows these curves and points when they move.
            </p>
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                const frozen = freezeArea(diagram, area);
                if (frozen) patch(frozen);
              }}
            >
              Make it a free shape
            </Button>
          </>
        ) : (
          <p className="text-[11px] text-ink-muted">
            Drag a corner to reshape it, or the middle to move it. Delete a corner with ⌫
            once it is selected.
          </p>
        )}
        {area.labelOffset && (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => {
              const next = { ...area };
              delete next.labelOffset;
              patch(next);
            }}
          >
            Reset label position
          </Button>
        )}
      </div>
    </div>
  );
}

type Direction = 'left' | 'right' | 'up' | 'down';
const DIRECTIONS: Array<{ value: Direction; label: string; title: string }> = [
  { value: 'left', label: '←', title: 'Shift left — a decrease' },
  { value: 'right', label: '→', title: 'Shift right — an increase' },
  { value: 'up', label: '↑', title: 'Shift up — e.g. a per-unit tax on supply' },
  { value: 'down', label: '↓', title: 'Shift down — e.g. a subsidy' },
];

/**
 * "Shift this curve": a copy moved by a share of the axis, and the new equilibrium it
 * makes with the curve the original crossed.
 */
export function ShiftCurveControls({
  diagram,
  curveId,
  onChange,
  onSelect,
  newId,
}: {
  diagram: Diagram;
  curveId: string;
  onChange: (diagram: Diagram) => void;
  onSelect: (handles: DiagramHandle[]) => void;
  newId: () => string;
}) {
  const [direction, setDirection] = useState<Direction>('right');
  const [percent, setPercent] = useState(15);
  const [failed, setFailed] = useState(false);

  const shift = () => {
    const amount = percent / 100;
    const delta = {
      x: direction === 'right' ? amount : direction === 'left' ? -amount : 0,
      y: direction === 'up' ? amount : direction === 'down' ? -amount : 0,
    };
    const result = shiftCurve(diagram, curveId, delta, newId);
    setFailed(!result);
    if (!result) return;
    onChange(result.diagram);
    onSelect([{ kind: 'curve', curveId: result.curveId }]);
  };

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <Eyebrow>Shift curve</Eyebrow>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Direction>
          label="Shift direction"
          value={direction}
          options={DIRECTIONS}
          onChange={setDirection}
        />
        <NumberField label="by" min={1} max={80} suffix="%" value={percent} onChange={setPercent} />
      </div>
      <Button size="sm" onClick={shift}>
        Shift a copy
      </Button>
      <p className="text-[11px] text-ink-muted">
        {failed
          ? 'That shift moves the curve off the diagram — try a smaller one.'
          : 'Moves a copy by that share of the axis, with a shift arrow and the new equilibrium dashed to both axes.'}
      </p>
    </div>
  );
}
