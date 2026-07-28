'use client';

import { useState } from 'react';
import { nanoid } from 'nanoid';
import type {
  Diagram,
  DiagramArrow,
  DiagramCurve,
  DiagramLabel,
  DiagramPointMark,
} from '@/model/diagram';
import { DIAGRAM_TEMPLATES, buildFromTemplate } from '@/model/diagramTemplates';
import { emptyBiText, plain } from '@/model/text';
import type { DiagramBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { diagramSvg } from '@/render/diagram';
import { Button, CheckField, Eyebrow, IconButton, NumberField, SelectField } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { DiagramCanvas } from './DiagramCanvas';

/**
 * Diagram editing (§5.3).
 *
 * Two surfaces over one geometry. This panel works on *parts* — a curve, a marked
 * point, a label — with coordinates typed as percentages of the plot, which is how you
 * place something exactly. **Draw** opens `DiagramCanvas`, a full-surface overlay where
 * the same elements are dragged into place, which is how you place something quickly.
 *
 * They are two views, not two models: both edit the unit-space `Diagram` in the block,
 * so a curve drawn by hand is indistinguishable from one typed in and either can be
 * refined by the other. That is the whole reason the drawing surface stores geometry
 * rather than strokes (§7.5).
 *
 * A live SVG sits at the top of the panel so every edit is visible immediately; it is
 * the very same renderer the preview and the exporter use, so there is no way for the
 * panel to show something the printed page will not.
 */

const newId = () => nanoid(10);

interface Props {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
}

/** Model 0..1 <-> UI 0..100. */
const toPct = (value: number) => Math.round(value * 100);
const fromPct = (value: number) => Math.min(1, Math.max(0, value / 100));

export function DiagramEditor({ block, onChange }: Props) {
  const language = useWorksheetStore((s) => s.mode.language);
  const fonts = useWorksheetStore((s) => s.worksheet.fonts);
  const [tab, setTab] = useState<'curves' | 'points' | 'labels' | 'arrows' | 'axes'>('curves');
  const [drawing, setDrawing] = useState(false);

  const diagram = block.diagram;
  const patch = (next: Partial<Diagram>) => onChange({ ...block, diagram: { ...diagram, ...next } });

  const preview = diagramSvg(diagram, {
    widthPx: block.widthPx,
    heightPx: block.heightPx,
    language,
    fonts,
  });

  return (
    <div className="space-y-2">
      {/* The same renderer the page and the .docx use, so this is exactly what prints.
          The SVG is told to fill its box rather than to be `widthPx` wide: the sidebar
          is narrower than the printed diagram, and at print width the right-hand axis
          title would be cut off by the panel.

          The selector is `[&_svg]`, not `[&>svg]` — the markup is injected into a
          wrapping <span>, so the svg is a *grandchild*, and the direct-child form
          silently matched nothing. The SVG kept its full print width and pushed the
          panel past the 400px column, which is what scrolled the whole sidebar
          sideways and clipped "Width" and the x-axis title off the right edge. */}
      {/* The thumbnail is the way into the drawing surface: clicking a picture to edit
          it is the gesture teachers already expect, and it matches the rule the page
          preview follows — what you click is what you edit. */}
      <button
        type="button"
        title="Draw on this diagram"
        onClick={() => setDrawing(true)}
        className="group/preview relative block w-full overflow-hidden rounded border border-line bg-surface [&_svg]:h-auto [&_svg]:w-full "
        style={{ lineHeight: 0 }}
      >
        <span dangerouslySetInnerHTML={{ __html: preview }} />
        <span className="absolute inset-0 flex items-center justify-center bg-sky-500/0 opacity-0 transition-opacity group-hover/preview:bg-sky-500/10 group-hover/preview:opacity-100">
          <span className="rounded-md bg-slate-900/80 px-2 py-1 text-[11px] font-medium leading-none text-white">
            Draw
          </span>
        </span>
      </button>

      {drawing && (
        <DiagramCanvas block={block} onChange={onChange} onClose={() => setDrawing(false)} />
      )}

      {/* Wraps, because the three controls have genuinely different needs: Draw and
          Width are sized by their content, while the template select wants whatever is
          left. In a 400px column that sum exceeds the row often enough that a second
          line is the honest answer — squeezing instead clipped "Width" off the edge. */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setDrawing(true)}>
          ✎ Draw
        </Button>
        <SelectField
          label="Template"
          value={diagram.templateId ?? 'blank'}
          options={DIAGRAM_TEMPLATES.map((template) => ({
            value: template.id,
            label: plain(template.name.en),
          }))}
          onChange={(templateId) => {
            // Replacing the geometry wholesale is the point of picking a template, and
            // it routes through the store like any edit, so ⌘Z brings the old one back.
            onChange({ ...block, diagram: buildFromTemplate(String(templateId)) });
          }}
        />
        <NumberField
          label="Width"
          min={160}
          suffix="px"
          value={block.widthPx}
          onChange={(widthPx) => {
            const next = Math.max(160, widthPx);
            // The 4:3 proportion is kept so the axis titles keep their room.
            onChange({ ...block, widthPx: next, heightPx: Math.round((next * 3) / 4) });
          }}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-line pb-1 ">
        {(['curves', 'points', 'labels', 'arrows', 'axes'] as const).map((key) => (
          <Button
            key={key}
            size="sm"
            variant={tab === key ? 'default' : 'subtle'}
            onClick={() => setTab(key)}
          >
            {key[0].toUpperCase() + key.slice(1)}
            {key !== 'axes' && ` (${diagram[key].length})`}
          </Button>
        ))}
      </div>

      {tab === 'curves' && (
        <CurveList
          curves={diagram.curves}
          onChange={(curves) => patch({ curves })}
        />
      )}
      {tab === 'points' && (
        <PointList points={diagram.points} onChange={(points) => patch({ points })} />
      )}
      {tab === 'labels' && (
        <LabelList labels={diagram.labels} onChange={(labels) => patch({ labels })} />
      )}
      {tab === 'arrows' && (
        <ArrowList arrows={diagram.arrows} onChange={(arrows) => patch({ arrows })} />
      )}
      {tab === 'axes' && <AxesPanel diagram={diagram} onChange={patch} />}

      <BiTextField
        label="Alt text"
        value={block.altText}
        onChange={(altText) => onChange({ ...block, altText })}
        rows={1}
      />
      <BiTextField
        label="Caption"
        value={block.caption ?? emptyBiText()}
        onChange={(caption) => onChange({ ...block, caption })}
        rows={1}
      />
    </div>
  );
}

/** A titled frame with move/delete controls, shared by every element list. */
function ElementCard({
  title,
  index,
  count,
  onMove,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  count: number;
  onMove: (delta: number) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="group/el rounded border border-line bg-surface p-2 ">
      <header className="mb-1 flex items-center gap-1">
        <Eyebrow>{title}</Eyebrow>
        <span className="flex-1" />
        <span className="flex opacity-0 transition-opacity focus-within:opacity-100 group-hover/el:opacity-100">
          <IconButton label="Move up" onClick={() => onMove(-1)} disabled={index === 0}>
            <span aria-hidden>↑</span>
          </IconButton>
          <IconButton label="Move down" onClick={() => onMove(1)} disabled={index === count - 1}>
            <span aria-hidden>↓</span>
          </IconButton>
          <IconButton label="Delete" variant="danger" onClick={onRemove}>
            <span aria-hidden>✕</span>
          </IconButton>
        </span>
      </header>
      {children}
    </div>
  );
}

/** Generic add/move/remove wiring, so each list below only describes its own fields. */
function useList<T extends { id: string }>(items: T[], onChange: (items: T[]) => void) {
  return {
    replace: (index: number, item: T) =>
      onChange(items.map((current, i) => (i === index ? item : current))),
    move: (index: number, delta: number) => {
      const target = index + delta;
      if (target < 0 || target >= items.length) return;
      const next = [...items];
      [next[index], next[target]] = [next[target], next[index]];
      onChange(next);
    },
    remove: (index: number) => onChange(items.filter((_, i) => i !== index)),
    add: (item: T) => onChange([...items, item]),
  };
}

const XY = ({
  label,
  x,
  y,
  onChange,
}: {
  label: string;
  x: number;
  y: number;
  onChange: (x: number, y: number) => void;
}) => (
  <div className="flex flex-wrap items-end gap-1">
    <span className="w-10 shrink-0 pb-1 text-[10px] text-ink-subtle">{label}</span>
    <NumberField label="x" min={0} max={100} suffix="%" value={toPct(x)} onChange={(v) => onChange(fromPct(v), y)} />
    <NumberField label="y" min={0} max={100} suffix="%" value={toPct(y)} onChange={(v) => onChange(x, fromPct(v))} />
  </div>
);

function CurveList({
  curves,
  onChange,
}: {
  curves: DiagramCurve[];
  onChange: (curves: DiagramCurve[]) => void;
}) {
  const list = useList(curves, onChange);

  return (
    <div className="space-y-2">
      {curves.map((curve, index) => (
        <ElementCard
          key={curve.id}
          title={plain(curve.label?.en) || `Curve ${index + 1}`}
          index={index}
          count={curves.length}
          onMove={(delta) => list.move(index, delta)}
          onRemove={() => list.remove(index)}
        >
          <div className="space-y-1">
            <BiTextField
              label="Label"
              value={curve.label ?? emptyBiText()}
              onChange={(labelText) => list.replace(index, { ...curve, label: labelText })}
              rows={1}
            />
            <div className="flex flex-wrap gap-1">
              <SelectField
                label="Shape"
                value={curve.shape}
                options={[
                  { value: 'straight', label: 'Straight' },
                  { value: 'curved', label: 'Curved' },
                ]}
                onChange={(shape) =>
                  list.replace(index, { ...curve, shape: shape as DiagramCurve['shape'] })
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
                  list.replace(index, { ...curve, stroke: stroke as DiagramCurve['stroke'] })
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
                  list.replace(index, { ...curve, labelAt: labelAt as DiagramCurve['labelAt'] })
                }
              />
            </div>

            {curve.points.map((pt, pointIndex) => (
              <div key={pointIndex} className="flex flex-wrap items-end gap-1">
                <XY
                  label={pointIndex === 0 ? 'from' : pointIndex === curve.points.length - 1 ? 'to' : `pt ${pointIndex + 1}`}
                  x={pt.x}
                  y={pt.y}
                  onChange={(x, y) =>
                    list.replace(index, {
                      ...curve,
                      points: curve.points.map((p, i) => (i === pointIndex ? { x, y } : p)),
                    })
                  }
                />
                {/* Two points is the minimum a line can have. */}
                <IconButton
                  label={`Remove point ${pointIndex + 1}`}
                  variant="danger"
                  disabled={curve.points.length <= 2}
                  onClick={() =>
                    list.replace(index, {
                      ...curve,
                      points: curve.points.filter((_, i) => i !== pointIndex),
                    })
                  }
                >
                  <span aria-hidden>✕</span>
                </IconButton>
              </div>
            ))}
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                // New vertex at the midpoint of the last segment — a kink starts where
                // the line already is, so adding one never makes the curve jump.
                const last = curve.points[curve.points.length - 1];
                const prev = curve.points[curve.points.length - 2] ?? last;
                list.replace(index, {
                  ...curve,
                  points: [
                    ...curve.points.slice(0, -1),
                    { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 },
                    last,
                  ],
                });
              }}
            >
              + Point (kink)
            </Button>
          </div>
        </ElementCard>
      ))}

      <Button
        size="sm"
        variant="subtle"
        onClick={() =>
          list.add({
            id: newId(),
            points: [
              { x: 0.1, y: 0.8 },
              { x: 0.85, y: 0.15 },
            ],
            shape: 'straight',
            labelAt: 'end',
            label: emptyBiText(),
          })
        }
      >
        + Curve
      </Button>
    </div>
  );
}

const SIDES: Array<{ value: NonNullable<DiagramPointMark['labelSide']>; label: string }> = [
  { value: 'upRight', label: 'Up-right' },
  { value: 'upLeft', label: 'Up-left' },
  { value: 'downRight', label: 'Down-right' },
  { value: 'downLeft', label: 'Down-left' },
  { value: 'up', label: 'Above' },
  { value: 'down', label: 'Below' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

function PointList({
  points,
  onChange,
}: {
  points: DiagramPointMark[];
  onChange: (points: DiagramPointMark[]) => void;
}) {
  const list = useList(points, onChange);

  const toggleDrop = (mark: DiagramPointMark, axis: 'x' | 'y'): Array<'x' | 'y'> => {
    const current = mark.dropTo ?? [];
    return current.includes(axis) ? current.filter((a) => a !== axis) : [...current, axis];
  };

  return (
    <div className="space-y-2">
      {points.map((mark, index) => (
        <ElementCard
          key={mark.id}
          title={plain(mark.label?.en) || `Point ${index + 1}`}
          index={index}
          count={points.length}
          onMove={(delta) => list.move(index, delta)}
          onRemove={() => list.remove(index)}
        >
          <div className="space-y-1">
            <BiTextField
              label="Label"
              value={mark.label ?? emptyBiText()}
              onChange={(labelText) => list.replace(index, { ...mark, label: labelText })}
              rows={1}
            />
            <XY
              label="at"
              x={mark.at.x}
              y={mark.at.y}
              onChange={(x, y) => list.replace(index, { ...mark, at: { x, y } })}
            />
            <div className="flex flex-wrap gap-1">
              <SelectField
                label="Label side"
                value={mark.labelSide ?? 'right'}
                options={SIDES}
                onChange={(labelSide) =>
                  list.replace(index, {
                    ...mark,
                    labelSide: labelSide as DiagramPointMark['labelSide'],
                  })
                }
              />
              <CheckField
                label="Dot"
                checked={mark.dot !== false}
                onChange={(dot) => list.replace(index, { ...mark, dot })}
              />
              <CheckField
                label="Drop to x"
                checked={(mark.dropTo ?? []).includes('x')}
                onChange={() => list.replace(index, { ...mark, dropTo: toggleDrop(mark, 'x') })}
              />
              <CheckField
                label="Drop to y"
                checked={(mark.dropTo ?? []).includes('y')}
                onChange={() => list.replace(index, { ...mark, dropTo: toggleDrop(mark, 'y') })}
              />
            </div>
            {/* Axis tick labels, the "Q₁" / "P₁" of a DSE diagram. */}
            <BiTextField
              label="x-axis tick"
              value={mark.xTickLabel ?? emptyBiText()}
              onChange={(xTickLabel) => list.replace(index, { ...mark, xTickLabel })}
              rows={1}
            />
            <BiTextField
              label="y-axis tick"
              value={mark.yTickLabel ?? emptyBiText()}
              onChange={(yTickLabel) => list.replace(index, { ...mark, yTickLabel })}
              rows={1}
            />
          </div>
        </ElementCard>
      ))}

      <Button
        size="sm"
        variant="subtle"
        onClick={() =>
          list.add({
            id: newId(),
            at: { x: 0.5, y: 0.5 },
            label: emptyBiText(),
            labelSide: 'right',
            dot: true,
          })
        }
      >
        + Point
      </Button>
    </div>
  );
}

function LabelList({
  labels,
  onChange,
}: {
  labels: DiagramLabel[];
  onChange: (labels: DiagramLabel[]) => void;
}) {
  const list = useList(labels, onChange);

  return (
    <div className="space-y-2">
      {labels.map((item, index) => (
        <ElementCard
          key={item.id}
          title={plain(item.text.en) || `Label ${index + 1}`}
          index={index}
          count={labels.length}
          onMove={(delta) => list.move(index, delta)}
          onRemove={() => list.remove(index)}
        >
          <div className="space-y-1">
            <BiTextField
              label="Text"
              value={item.text}
              onChange={(text) => list.replace(index, { ...item, text })}
              rows={1}
            />
            <XY
              label="at"
              x={item.at.x}
              y={item.at.y}
              onChange={(x, y) => list.replace(index, { ...item, at: { x, y } })}
            />
            <div className="flex flex-wrap gap-1">
              <SelectField
                label="Align"
                value={item.align ?? 'center'}
                options={[
                  { value: 'center', label: 'Centre' },
                  { value: 'left', label: 'Left' },
                  { value: 'right', label: 'Right' },
                ]}
                onChange={(align) =>
                  list.replace(index, { ...item, align: align as DiagramLabel['align'] })
                }
              />
              <CheckField
                label="Italic"
                checked={Boolean(item.italic)}
                onChange={(italic) => list.replace(index, { ...item, italic })}
              />
            </div>
          </div>
        </ElementCard>
      ))}

      <Button
        size="sm"
        variant="subtle"
        onClick={() => list.add({ id: newId(), at: { x: 0.5, y: 0.5 }, text: emptyBiText() })}
      >
        + Label
      </Button>
    </div>
  );
}

function ArrowList({
  arrows,
  onChange,
}: {
  arrows: DiagramArrow[];
  onChange: (arrows: DiagramArrow[]) => void;
}) {
  const list = useList(arrows, onChange);

  return (
    <div className="space-y-2">
      {arrows.map((arrow, index) => (
        <ElementCard
          key={arrow.id}
          title={plain(arrow.label?.en) || `Arrow ${index + 1}`}
          index={index}
          count={arrows.length}
          onMove={(delta) => list.move(index, delta)}
          onRemove={() => list.remove(index)}
        >
          <div className="space-y-1">
            <XY
              label="from"
              x={arrow.from.x}
              y={arrow.from.y}
              onChange={(x, y) => list.replace(index, { ...arrow, from: { x, y } })}
            />
            <XY
              label="to"
              x={arrow.to.x}
              y={arrow.to.y}
              onChange={(x, y) => list.replace(index, { ...arrow, to: { x, y } })}
            />
            <CheckField
              label="Curved"
              checked={Boolean(arrow.curved)}
              onChange={(curved) => list.replace(index, { ...arrow, curved })}
            />
            <BiTextField
              label="Label"
              value={arrow.label ?? emptyBiText()}
              onChange={(labelText) => list.replace(index, { ...arrow, label: labelText })}
              rows={1}
            />
          </div>
        </ElementCard>
      ))}

      <Button
        size="sm"
        variant="subtle"
        onClick={() =>
          list.add({ id: newId(), from: { x: 0.35, y: 0.75 }, to: { x: 0.6, y: 0.75 } })
        }
      >
        + Arrow
      </Button>
    </div>
  );
}

function AxesPanel({
  diagram,
  onChange,
}: {
  diagram: Diagram;
  onChange: (patch: Partial<Diagram>) => void;
}) {
  return (
    <div className="space-y-2">
      <BiTextField
        label="x-axis title"
        value={diagram.x.title ?? emptyBiText()}
        onChange={(title) => onChange({ x: { ...diagram.x, title } })}
        rows={1}
      />
      <BiTextField
        label="y-axis title"
        value={diagram.y.title ?? emptyBiText()}
        onChange={(title) => onChange({ y: { ...diagram.y, title } })}
        rows={1}
      />
      <CheckField
        label='Show "0" at the origin'
        checked={diagram.showOrigin !== false}
        onChange={(showOrigin) => onChange({ showOrigin })}
      />
    </div>
  );
}
