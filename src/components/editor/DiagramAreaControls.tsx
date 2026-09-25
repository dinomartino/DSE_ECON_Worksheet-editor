'use client';

import { useEffect, useRef, useState } from 'react';
import type {
  Diagram,
  DiagramAnchorRef,
  DiagramArea,
  DiagramAreaColor,
  DiagramAreaDensity,
  DiagramAreaEdge,
  DiagramAreaFill,
  DiagramAreaLabelPlacement,
  DiagramAreaPattern,
  DiagramAreaRevenue,
  DiagramAreaX,
} from '@/model/diagram';
import {
  AREA_PRESETS,
  REVENUE_PRESETS,
  areaPolygon,
  curveCrossing,
  freezeArea,
  guessMarketCurves,
  guessRevenuePoints,
  newPresetArea,
  revenueArea,
  type AreaPreset,
  type RevenuePreset,
} from '@/model/diagramAreas';
import type { DiagramHandle } from '@/model/diagramDraw';
import { shiftCurve } from '@/model/diagramShift';
import { emptyBiText, plain } from '@/model/text';
import { AREA_PALETTE, areaFillMarkup } from '@/render/diagram';
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

/** Marked points and crossings, as the anchors a revenue area can be measured at. */
function anchorOptions(diagram: Diagram, current: DiagramAnchorRef) {
  const options: Array<{ value: DiagramAnchorRef; label: string }> = [
    ...diagram.points.map((p) => ({ value: { point: p.id }, label: pointName(diagram, p.id) })),
    ...crossings(diagram).map((ref) => ({ value: ref, label: anchorName(diagram, ref) })),
  ];
  if (!options.some((o) => refKey(o.value) === refKey(current))) {
    options.push({ value: current, label: anchorName(diagram, current) });
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
    const area = newPresetArea(preset.id, curves, 'probe');
    const why = !curves.demand || !curves.supply
      ? 'Needs a falling demand and a rising supply curve'
      : preset.needsTax && !curves.taxed
        ? 'Needs a taxed supply curve — shift S up first'
        : undefined;
    return { preset, available: Boolean(area), why };
  });

  const points = guessRevenuePoints(diagram);
  const revenueItems = REVENUE_PRESETS.map((preset) => {
    const area = revenueArea(preset.id, points, 'probe');
    const empty = area && !areaPolygon(diagram, area);
    const why = !points.before
      ? 'Needs a marked point, such as an equilibrium E'
      : preset.id !== 'totalRevenue' && !points.after
        ? 'Needs two equilibrium points — shift a curve first'
        : empty
          ? preset.id === 'revenueGain'
            ? 'No gain: the new price and quantity are both lower'
            : 'No loss: the new price and quantity are both higher'
          : undefined;
    return { preset, available: Boolean(area) && !empty, why };
  });

  const add = (preset: AreaPreset) => {
    const area = newPresetArea(preset, curves, newId());
    if (area) onAdd(area);
    onOpenChange(false);
  };
  const addRevenue = (preset: RevenuePreset) => {
    const area = revenueArea(preset, points, newId());
    if (area) onAdd(area);
    onOpenChange(false);
  };
  const itemClass =
    'flex w-full flex-col items-start rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Shade an area — welfare (CS, PS, DWL, tax revenue) or revenue (TR, gain, loss)"
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
              className={itemClass}
            >
              <span className="text-[13px] text-ink">{preset.name}</span>
              {why && <span className="text-[11px] text-ink-subtle">{why}</span>}
            </button>
          ))}
          <div className="my-1 h-px bg-line" />
          {revenueItems.map(({ preset, available, why }) => (
            <button
              key={preset.id}
              type="button"
              role="menuitem"
              disabled={!available}
              onClick={() => addRevenue(preset.id)}
              className={itemClass}
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

const PLACEMENTS: Array<{ value: DiagramAreaLabelPlacement; label: string; title: string }> = [
  { value: 'auto', label: 'Auto', title: 'Inside when the label fits, else outside with an arrow' },
  { value: 'inside', label: 'Inside', title: 'Always on the shading' },
  { value: 'leader', label: 'Leader', title: 'Outside, with an arrow into the shading' },
];

/**
 * The palette as a row of swatches. Each shows the paper colour it prints (literal hex:
 * it is a sample of the paper, not chrome); a hatched area previews its ink as stripes.
 */
function AreaColorSwatches({
  value,
  fill,
  onChange,
}: {
  value: DiagramAreaColor;
  fill: DiagramAreaFill;
  onChange: (color: DiagramAreaColor) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Colour" className="flex items-center gap-1.5">
      <span className="mr-1 text-xs text-ink-muted">Colour</span>
      {(Object.keys(AREA_PALETTE) as DiagramAreaColor[]).map((key) => {
        const paint = AREA_PALETTE[key];
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={paint.name}
            title={paint.name}
            onClick={() => onChange(key)}
            className={
              'h-6 w-6 rounded-full border transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
              (active ? 'border-ink ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-line-strong hover:border-ink-muted')
            }
            style={{
              background:
                fill === 'hatch'
                  ? `repeating-linear-gradient(-45deg, ${paint.hatch} 0 1px, #fff 1px 4px)`
                  : paint.shade,
            }}
          />
        );
      })}
    </div>
  );
}

const PATTERNS: Array<{ value: DiagramAreaPattern; name: string }> = [
  { value: 'diagonal', name: 'Diagonal' },
  { value: 'reverse', name: 'Reverse diagonal' },
  { value: 'cross', name: 'Cross-hatch' },
  { value: 'horizontal', name: 'Horizontal' },
  { value: 'vertical', name: 'Vertical' },
  { value: 'dots', name: 'Dots' },
];

const DENSITIES: Array<{ value: DiagramAreaDensity; label: string; title: string }> = [
  { value: 'normal', label: 'Normal', title: 'The usual spacing' },
  { value: 'dense', label: 'Dense', title: 'Lines or dots closer together — a darker area' },
];

const SWATCH = 22;
const SWATCH_BOX = [
  { x: 0, y: 0 },
  { x: SWATCH, y: 0 },
  { x: SWATCH, y: SWATCH },
  { x: 0, y: SWATCH },
];

/**
 * The six hatch patterns as tiny previews, each drawn by the paper's own renderer in
 * the area's ink — the swatch is a sample of what prints, so it takes paper hex.
 */
function AreaPatternSwatches({
  area,
  onChange,
}: {
  area: DiagramArea;
  onChange: (pattern: DiagramAreaPattern) => void;
}) {
  const value = area.pattern ?? 'diagonal';
  return (
    <div role="radiogroup" aria-label="Pattern" className="flex items-center gap-1.5">
      <span className="mr-1 text-xs text-ink-muted">Pattern</span>
      {PATTERNS.map(({ value: pattern, name }) => {
        const active = pattern === value;
        const markup = areaFillMarkup(SWATCH_BOX, { ...area, fill: 'hatch', pattern }, 1);
        return (
          <button
            key={pattern}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={name}
            title={name}
            onClick={() => onChange(pattern)}
            className={
              'h-7 w-7 overflow-hidden rounded-md border bg-white p-0 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ' +
              (active ? 'border-ink ring-2 ring-accent ring-offset-1 ring-offset-surface' : 'border-line-strong hover:border-ink-muted')
            }
          >
            <svg
              aria-hidden
              width="100%"
              height="100%"
              viewBox={`0 0 ${SWATCH} ${SWATCH}`}
              dangerouslySetInnerHTML={{ __html: markup }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** What a revenue area measures: its two points, re-pickable, and what the shape means. */
function RevenueBounds({
  diagram,
  area,
  revenue,
  patch,
}: {
  diagram: Diagram;
  area: DiagramArea;
  revenue: DiagramAreaRevenue;
  patch: (next: DiagramArea) => void;
}) {
  const set = (next: Partial<DiagramAreaRevenue>) => patch({ ...area, revenue: { ...revenue, ...next } });
  return (
    <>
      <Eyebrow className="block pt-1">{revenue.change === 'gain' ? 'Revenue gain' : 'Revenue loss'} between</Eyebrow>
      <RefSelect
        label="Before (E₀)"
        value={revenue.from}
        options={anchorOptions(diagram, revenue.from)}
        onChange={(from) => set({ from })}
      />
      <RefSelect
        label="After (E₁)"
        value={revenue.to}
        options={anchorOptions(diagram, revenue.to)}
        onChange={(to) => set({ to })}
      />
      <p className="text-[11px] text-ink-muted">
        {areaPolygon(diagram, area)
          ? revenue.change === 'gain'
            ? 'The part of the new P × Q rectangle outside the old one. It follows both points.'
            : 'The part of the old P × Q rectangle outside the new one. It follows both points.'
          : revenue.change === 'gain'
            ? 'Nothing to shade: the new rectangle lies inside the old one.'
            : 'Nothing to shade: the old rectangle lies inside the new one.'}
      </p>
    </>
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
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-ink-muted">Fill</span>
          <Segmented<DiagramAreaFill>
            label="Fill"
            value={area.fill ?? 'shade'}
            options={[
              { value: 'shade', label: 'Shade', title: 'A flat tint' },
              { value: 'hatch', label: 'Hatch', title: 'A pattern of lines or dots — reads on a black-and-white copy' },
            ]}
            onChange={(fill) => patch({ ...area, fill })}
          />
        </div>
        {area.fill === 'hatch' && (
          <>
            <AreaPatternSwatches
              area={area}
              onChange={(pattern) => {
                // Diagonal is the default: stored as absent, like grey.
                const next: DiagramArea = { ...area, pattern };
                if (pattern === 'diagonal') delete next.pattern;
                patch(next);
              }}
            />
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-ink-muted">Spacing</span>
              <Segmented<DiagramAreaDensity>
                label="Pattern spacing"
                value={area.density ?? 'normal'}
                options={DENSITIES}
                onChange={(density) => {
                  const next: DiagramArea = { ...area, density };
                  if (density === 'normal') delete next.density;
                  patch(next);
                }}
              />
            </div>
          </>
        )}
        <AreaColorSwatches
          value={area.color ?? 'grey'}
          fill={area.fill ?? 'shade'}
          onChange={(color) => {
            // Grey is the default: stored as absent, so the area stays as it always was.
            const next: DiagramArea = { ...area, color };
            if (color === 'grey') delete next.color;
            patch(next);
          }}
        />
        <div className="flex items-center gap-1">
          <span className="mr-1 text-xs text-ink-muted">Placement</span>
          <Segmented<DiagramAreaLabelPlacement>
            label="Label placement"
            value={area.labelPlacement ?? 'auto'}
            options={PLACEMENTS}
            onChange={(placement) => {
              // A new side starts from its own default spot, like a point label's slot.
              const next: DiagramArea = { ...area, labelPlacement: placement };
              if (placement === 'auto') delete next.labelPlacement;
              delete next.labelOffset;
              patch(next);
            }}
          />
        </div>
        {area.revenue ? (
          <>
            <RevenueBounds diagram={diagram} area={area} revenue={area.revenue} patch={patch} />
            <FreezeButton diagram={diagram} area={area} patch={patch} />
          </>
        ) : band ? (
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
            <FreezeButton diagram={diagram} area={area} patch={patch} />
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

function FreezeButton({
  diagram,
  area,
  patch,
}: {
  diagram: Diagram;
  area: DiagramArea;
  patch: (next: DiagramArea) => void;
}) {
  return (
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
