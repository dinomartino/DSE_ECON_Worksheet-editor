'use client';

import { useRef } from 'react';
import { nanoid } from 'nanoid';
import { emptyBiText } from '@/model/text';
import {
  MAX_CHART_CATEGORIES,
  MAX_CHART_SERIES,
  MAX_STAKEHOLDERS,
  type DataChart,
  type DataChartKind,
  type DataChartSeries,
  type ForumBubble,
  type ForumChart,
  type ForumSlot,
  type PieSlice,
  type StakeholderBox,
  type StakeholderChart,
  type StakeholderLinks,
} from '@/model/diagram';
import { prepareImageForStorage } from '@/export/imageImport';
import { Button, IconButton, NumberField, Segmented } from '@/components/ui';
import type { TextKey } from '@/i18n/catalogue';
import { useMessages } from '@/i18n/language';
import { BiTextField } from './BiTextField';
import { DIAGRAM_PANEL_MESSAGES } from './diagramEditing.messages';

/*
 * The data of the chart kinds not drawn on axes: a pie's slices, a forum's bubbles, a
 * stakeholder diagram's issue and boxes, and a data chart's table of figures.
 * One set of fields for a worksheet's diagram panel and a saved graph's (Graphs 圖表庫),
 * so the two never edit a chart differently.
 */

/** The four corner slots, in reading order, with the labels the picker shows. */
const FORUM_SLOTS: Array<{ value: ForumSlot; label: string; title: TextKey<typeof DIAGRAM_PANEL_MESSAGES> }> = [
  { value: 'topLeft', label: '◤', title: 'topLeft' }, // i18n-ignore: catalogue key
  { value: 'topRight', label: '◥', title: 'topRight' }, // i18n-ignore: catalogue key
  { value: 'bottomLeft', label: '◣', title: 'bottomLeft' }, // i18n-ignore: catalogue key
  { value: 'bottomRight', label: '◢', title: 'bottomRight' }, // i18n-ignore: catalogue key
];

/**
 * The forum figure's data: a speech bubble per row (speaker + view + corner slot)
 * and the central picture. Placement is slot-based, never free — the same reason a
 * band's zones are — so the panel offers corners, not coordinates.
 */
export function ForumFields({
  forum,
  onChange,
  resizeHint,
}: {
  forum: ForumChart;
  onChange: (forum: ForumChart) => void;
  /** Where the bubble widths are dragged: the worksheet's preview opens a canvas. */
  resizeHint?: string;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const fileInput = useRef<HTMLInputElement>(null);
  const slotOptions = FORUM_SLOTS.map((slot) => ({ ...slot, title: m[slot.title] }));
  const bubbles = forum.bubbles;
  const patch = (id: string, change: Partial<ForumBubble>) =>
    onChange({
      ...forum,
      bubbles: bubbles.map((bubble) =>
        bubble.id === id ? { ...bubble, ...change } : bubble,
      ),
    });

  const handleImageFile = async (file: File) => {
    // The same reduction every stored picture takes (§ `prepareImageForStorage`) —
    // the figure rides inline in the document's JSON like an `ImageBlock` does.
    const prepared = await prepareImageForStorage(file);
    onChange({
      ...forum,
      image: {
        src: prepared.src,
        // Zero means it could not be decoded here; a 4:3 guess still gives the
        // layout a ratio to draw by, the same fallback `BlockEditor` uses.
        naturalWidthPx: prepared.naturalWidthPx || 400,
        naturalHeightPx: prepared.naturalHeightPx || 300,
      },
    });
  };

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-ink-subtle">
        {m.bubblesHeading}
      </span>
      {bubbles.map((bubble, index) => (
        <div key={bubble.id} className="space-y-1 rounded border border-line p-1.5">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <BiTextField
                translate={{ kind: 'speaker', fallsBack: true }}
                ariaLabel={m.bubbleSpeaker(index + 1)}
                value={bubble.speaker}
                onChange={(speaker) => patch(bubble.id, { speaker })}
                rows={1}
              />
            </div>
            <Segmented<ForumSlot>
              label={m.bubbleCorner(index + 1)}
              value={bubble.slot}
              options={slotOptions}
              onChange={(slot) => patch(bubble.id, { slot })}
            />
            <IconButton
              label={m.bubbleRemove(index + 1)}
              onClick={() =>
                onChange({
                  ...forum,
                  bubbles: bubbles.filter((other) => other.id !== bubble.id),
                })
              }
            >
              ✕
            </IconButton>
          </div>
          <BiTextField
            translate={{ kind: 'bubble', fallsBack: true }}
            ariaLabel={m.bubbleView(index + 1)}
            value={bubble.text}
            onChange={(text) => patch(bubble.id, { text })}
            rows={2}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          onClick={() => {
            // Seed the first corner nothing occupies, reading order — the reference
            // figures fill top-left, top-right, then bottom-left.
            const taken = new Set(bubbles.map((bubble) => bubble.slot));
            const slot =
              FORUM_SLOTS.find((option) => !taken.has(option.value))?.value ?? 'topLeft';
            onChange({
              ...forum,
              bubbles: [
                ...bubbles,
                { id: nanoid(10), slot, speaker: emptyBiText(), text: emptyBiText() },
              ],
            });
          }}
        >
          {m.addBubble}
        </Button>
        <Button size="sm" variant="subtle" onClick={() => fileInput.current?.click()}>
          {forum.image ? m.replacePicture : m.addPicture}
        </Button>
        {forum.image && (
          <Button
            size="sm"
            variant="subtle"
            onClick={() => onChange({ ...forum, image: undefined })}
          >
            {m.removePicture}
          </Button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Cleared so choosing the same file again still fires a change event.
            event.target.value = '';
            if (file) void handleImageFile(file);
          }}
        />
      </div>
      <span className="text-[11px] text-ink-subtle">
        {m.bubblesPoint} {resizeHint ?? m.resizeHint}
      </span>
    </div>
  );
}

/**
 * The pie chart's slices: name + share per row, in draw order (clockwise from 12
 * o'clock). The printed percent is derived from share ÷ total, so the fields never
 * show it — a stored percent is exactly what would go stale when a slice is added.
 *
 * Slice edits never re-measure the block: the labels draw *inside* the circle, so no
 * name or value can change the picture's box (only the title does that).
 */
export function PieSliceFields({
  slices,
  onChange,
}: {
  slices: PieSlice[];
  onChange: (slices: PieSlice[]) => void;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const patch = (id: string, change: Partial<PieSlice>) =>
    onChange(slices.map((slice) => (slice.id === id ? { ...slice, ...change } : slice)));

  return (
    <div className="space-y-1">
      <span className="text-[11px] font-medium text-ink-subtle">
        {m.slicesHeading}
      </span>
      {slices.map((slice, index) => (
        <div key={slice.id} className="flex items-center gap-1">
          <div className="min-w-0 flex-1">
            <BiTextField
              translate={{ kind: 'diagramLabel', fallsBack: true }}
              ariaLabel={m.sliceName(index + 1)}
              value={slice.label}
              onChange={(label) => patch(slice.id, { label })}
              rows={1}
            />
          </div>
          <NumberField
            label={m.share}
            min={0}
            value={slice.value}
            onChange={(value) => patch(slice.id, { value })}
          />
          <IconButton
            label={m.sliceRemove(index + 1)}
            onClick={() => onChange(slices.filter((other) => other.id !== slice.id))}
          >
            ✕
          </IconButton>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          onClick={() =>
            onChange([...slices, { id: nanoid(10), label: emptyBiText(), value: 10 }])
          }
        >
          {m.addSlice}
        </Button>
        <span className="text-[11px] text-ink-subtle">
          {m.percentNote}
        </span>
      </div>
    </div>
  );
}

/**
 * The stakeholder diagram's data (k-0469): the issue, then one row per stakeholder (name,
 * optional view, move up/down, remove) and how the links are drawn. Placement is derived
 * from list order, so the panel offers order, never positions; there is no canvas.
 */
export function StakeholderFields({
  chart,
  onChange,
}: {
  chart: StakeholderChart;
  onChange: (chart: StakeholderChart) => void;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const stakeholders = chart.stakeholders;
  const patch = (id: string, change: Partial<StakeholderBox>) =>
    onChange({
      ...chart,
      stakeholders: stakeholders.map((box) => (box.id === id ? { ...box, ...change } : box)),
    });
  const move = (index: number, by: -1 | 1) => {
    const next = [...stakeholders];
    const [box] = next.splice(index, 1);
    next.splice(index + by, 0, box);
    onChange({ ...chart, stakeholders: next });
  };
  const full = stakeholders.length >= MAX_STAKEHOLDERS;
  const linkOptions: Array<{ value: StakeholderLinks; label: string; title: string }> = [
    { value: 'fromIssue', label: m.linksFromIssue, title: m.linksFromIssueTitle },
    { value: 'toIssue', label: m.linksToIssue, title: m.linksToIssueTitle },
    { value: 'lines', label: m.linksLines, title: m.linksLinesTitle },
  ];

  return (
    <div className="space-y-1" data-stakeholder-fields="">
      <span className="text-[11px] font-medium text-ink-subtle">{m.issueHeading}</span>
      <BiTextField
        translate={{ kind: 'flowNode', fallsBack: true }}
        ariaLabel={m.issueField}
        value={chart.issue}
        onChange={(issue) => onChange({ ...chart, issue })}
        rows={1}
      />
      <span className="block pt-1 text-[11px] font-medium text-ink-subtle">
        {m.stakeholdersHeading}
      </span>
      {stakeholders.map((box, index) => (
        <div key={box.id} className="space-y-1 rounded border border-line p-1.5">
          <div className="flex items-center gap-1">
            <div className="min-w-0 flex-1">
              <BiTextField
                translate={{ kind: 'speaker', fallsBack: true }}
                ariaLabel={m.stakeholderName(index + 1)}
                value={box.label}
                onChange={(label) => patch(box.id, { label })}
                rows={1}
              />
            </div>
            <IconButton
              label={m.stakeholderUp(index + 1)}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </IconButton>
            <IconButton
              label={m.stakeholderDown(index + 1)}
              disabled={index === stakeholders.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </IconButton>
            <IconButton
              label={m.stakeholderRemove(index + 1)}
              onClick={() =>
                onChange({ ...chart, stakeholders: stakeholders.filter((other) => other.id !== box.id) })
              }
            >
              ✕
            </IconButton>
          </div>
          <BiTextField
            translate={{ kind: 'bubble', fallsBack: true }}
            ariaLabel={m.stakeholderView(index + 1)}
            value={box.view}
            onChange={(view) => patch(box.id, { view })}
            rows={2}
          />
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="subtle"
          disabled={full}
          title={full ? m.stakeholderLimit(MAX_STAKEHOLDERS) : undefined}
          onClick={() =>
            onChange({
              ...chart,
              stakeholders: [...stakeholders, { id: nanoid(10), label: emptyBiText(), view: emptyBiText() }],
            })
          }
        >
          {m.addStakeholder}
        </Button>
        <span className="inline-flex items-center gap-1">
          <span className="text-[11px] text-ink-subtle">{m.stakeholderLinks}</span>
          <Segmented<StakeholderLinks>
          label={m.stakeholderLinks}
          value={chart.links ?? 'fromIssue'}
          options={linkOptions}
          onChange={(links) =>
            // The default stays unstored, as every other diagram default does.
            onChange({ ...chart, links: links === 'fromIssue' ? undefined : links })
          }
          />
        </span>
      </div>
      <span className="block text-[11px] leading-snug text-ink-subtle">
        {full ? m.stakeholderLimit(MAX_STAKEHOLDERS) : m.stakeholdersPlaced}
      </span>
    </div>
  );
}

/** The legend swatch a series prints with, as a glyph for the panel's column heads. */
const SERIES_GLYPHS = { bar: ['■', '□', '▒', '▨'], line: ['━■', '╌●', '┈▲', '─◆'] } as const;

/**
 * One figure: empty is a real state (no bar, a gap in the line), and negative is allowed
 * (a deficit). A number input reports '' while a "-" is half-typed, which reads as empty
 * and leaves the box alone.
 */
function ChartValueInput({
  value,
  label,
  width,
  onChange,
}: {
  value: number | null;
  label: string;
  width: string;
  onChange: (value: number | null) => void;
}) {
  return (
    <input
      type="number"
      step="any"
      aria-label={label}
      value={value ?? ''}
      // No spinner: it ate a third of the box, and "-85000" must show whole.
      className={`${width} h-8 shrink-0 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none rounded-md border border-line bg-surface px-1.5 text-right text-xs tabular-nums text-ink outline-none transition-colors duration-150 ease-out-soft focus:border-accent focus:ring-2 focus:ring-accent/25`}
      onChange={(event) => {
        const raw = event.target.value.trim();
        const parsed = raw === '' ? null : Number(raw);
        onChange(parsed === null || Number.isFinite(parsed) ? parsed : null);
      }}
    />
  );
}

/** An optional axis pin; empty = derived from the figures. */
function AxisPinInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <label className="inline-flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
      {label}
      <input
        type="number"
        step="any"
        value={value ?? ''}
        className="h-8 w-16 rounded-lg border border-line bg-surface px-2 text-xs tabular-nums text-ink outline-none transition-colors duration-150 ease-out-soft focus:border-accent focus:ring-2 focus:ring-accent/25"
        onChange={(event) => {
          const raw = event.target.value.trim();
          const parsed = Number(raw);
          onChange(raw === '' || !Number.isFinite(parsed) ? undefined : parsed);
        }}
      />
    </label>
  );
}

/**
 * The data chart's data (k-0474): bar or line, the series (legend names), then one row
 * per category with its label and a figure per series, the unit above the y-axis and an
 * optional title under the categories. The scale is derived; "Axis range" pins it. There
 * is no canvas: what the panel holds is the whole chart.
 */
export function DataChartFields({
  chart,
  onChange,
}: {
  chart: DataChart;
  onChange: (chart: DataChart) => void;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const series = Array.isArray(chart.series) ? chart.series : [];
  const categories = Array.isArray(chart.categories) ? chart.categories : [];
  const glyphs = SERIES_GLYPHS[chart.kind === 'line' ? 'line' : 'bar'];
  const seriesFull = series.length >= MAX_CHART_SERIES;
  const categoriesFull = categories.length >= MAX_CHART_CATEGORIES;
  // Figure boxes as wide as the row allows: one or two series fit "-250000" whole; four
  // still leave the category label a usable field in the 380px sidebar.
  const valueWidth = series.length <= 2 ? 'w-20' : series.length === 3 ? 'w-[4.25rem]' : 'w-[3.75rem]';

  const patchSeries = (id: string, change: Partial<DataChartSeries>) =>
    onChange({ ...chart, series: series.map((entry) => (entry.id === id ? { ...entry, ...change } : entry)) });
  const setValue = (seriesId: string, category: number, value: number | null) =>
    onChange({
      ...chart,
      series: series.map((entry) => {
        if (entry.id !== seriesId) return entry;
        const values = categories.map((_, c) => entry.values?.[c] ?? null);
        values[category] = value;
        return { ...entry, values };
      }),
    });
  const removeCategory = (index: number) =>
    onChange({
      ...chart,
      categories: categories.filter((_, c) => c !== index),
      series: series.map((entry) => ({ ...entry, values: (entry.values ?? []).filter((_, c) => c !== index) })),
    });
  /** A cleared pin is dropped, not stored as `undefined`. */
  const pin = (key: 'yMin' | 'yMax' | 'yStep', value: number | undefined) => {
    const next = { ...chart };
    if (value === undefined || (key === 'yStep' && value <= 0)) delete next[key];
    else next[key] = value;
    onChange(next);
  };

  return (
    <div className="space-y-2" data-chart-fields="">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium text-ink-subtle">{m.chartKind}</span>
        <Segmented<DataChartKind>
          label={m.chartKind}
          value={chart.kind === 'line' ? 'line' : 'bar'}
          options={[
            { value: 'bar', label: m.chartBar },
            { value: 'line', label: m.chartLine },
          ]}
          onChange={(kind) => onChange({ ...chart, kind })}
        />
      </div>

      <div className="space-y-1">
        <span className="text-[11px] font-medium text-ink-subtle">{m.seriesHeading}</span>
        {series.map((entry, index) => (
          <div key={entry.id} className="flex items-center gap-1">
            <span aria-hidden className="w-7 shrink-0 text-center text-xs text-ink-muted">
              {glyphs[index % glyphs.length]}
            </span>
            <div className="min-w-0 flex-1">
              <BiTextField
                translate={{ kind: 'diagramLabel', fallsBack: true }}
                ariaLabel={m.seriesName(index + 1)}
                value={entry.name}
                onChange={(name) => patchSeries(entry.id, { name })}
                rows={1}
              />
            </div>
            <IconButton
              label={m.seriesRemove(index + 1)}
              disabled={series.length <= 1}
              onClick={() => onChange({ ...chart, series: series.filter((other) => other.id !== entry.id) })}
            >
              ✕
            </IconButton>
          </div>
        ))}
        <Button
          size="sm"
          variant="subtle"
          disabled={seriesFull}
          title={seriesFull ? m.seriesLimit(MAX_CHART_SERIES) : undefined}
          onClick={() =>
            onChange({
              ...chart,
              series: [...series, { id: nanoid(10), name: emptyBiText(), values: categories.map(() => null) }],
            })
          }
        >
          {m.addSeries}
        </Button>
      </div>

      <div className="space-y-1">
        <span className="text-[11px] font-medium text-ink-subtle">{m.categoriesHeading}</span>
        {/* Column heads: each figure column wears its series' legend glyph. */}
        <div aria-hidden className="flex items-center gap-1 pr-8">
          <span className="min-w-0 flex-1" />
          {series.map((entry, index) => (
            <span key={entry.id} className={`${valueWidth} shrink-0 text-center text-xs text-ink-muted`}>
              {glyphs[index % glyphs.length]}
            </span>
          ))}
        </div>
        {categories.map((category, c) => (
          <div key={c} className="flex items-start gap-1" data-chart-category="">
            <div className="min-w-0 flex-1">
              <BiTextField
                translate={{ kind: 'tickLabel', fallsBack: true }}
                ariaLabel={m.categoryLabel(c + 1)}
                value={category}
                onChange={(label) =>
                  onChange({ ...chart, categories: categories.map((other, i) => (i === c ? label : other)) })
                }
                rows={1}
              />
            </div>
            {series.map((entry, s) => (
              <ChartValueInput
                key={entry.id}
                label={m.categoryValue(c + 1, s + 1)}
                width={valueWidth}
                value={typeof entry.values?.[c] === 'number' ? (entry.values[c] as number) : null}
                onChange={(value) => setValue(entry.id, c, value)}
              />
            ))}
            <IconButton label={m.categoryRemove(c + 1)} onClick={() => removeCategory(c)}>
              ✕
            </IconButton>
          </div>
        ))}
        <Button
          size="sm"
          variant="subtle"
          disabled={categoriesFull}
          title={categoriesFull ? m.categoryLimit(MAX_CHART_CATEGORIES) : undefined}
          onClick={() =>
            onChange({
              ...chart,
              categories: [...categories, emptyBiText()],
              series: series.map((entry) => ({
                ...entry,
                values: [...categories.map((_, c) => entry.values?.[c] ?? null), null],
              })),
            })
          }
        >
          {m.addCategory}
        </Button>
        <span className="block text-[11px] leading-snug text-ink-subtle">
          {categoriesFull ? m.categoryLimit(MAX_CHART_CATEGORIES) : m.valueNote}
        </span>
      </div>

      <BiTextField
        translate={{ kind: 'axisTitle', fallsBack: true }}
        label={m.yAxisTitle}
        value={chart.yTitle ?? emptyBiText()}
        onChange={(yTitle) => onChange({ ...chart, yTitle })}
        rows={1}
      />
      <BiTextField
        translate={{ kind: 'axisTitle', fallsBack: true }}
        label={m.xAxisTitle}
        value={chart.xTitle ?? emptyBiText()}
        onChange={(xTitle) => onChange({ ...chart, xTitle })}
        rows={1}
      />

      <details className="rounded border border-line px-2 py-1">
        <summary className="cursor-pointer text-[11px] font-medium text-ink-subtle">{m.axisRange}</summary>
        <div className="flex flex-wrap items-center gap-2 py-1.5">
          <AxisPinInput label={m.axisMin} value={chart.yMin} onChange={(value) => pin('yMin', value)} />
          <AxisPinInput label={m.axisMax} value={chart.yMax} onChange={(value) => pin('yMax', value)} />
          <AxisPinInput label={m.axisStep} value={chart.yStep} onChange={(value) => pin('yStep', value)} />
        </div>
        <span className="block pb-1 text-[11px] text-ink-subtle">{m.axisRangeHint}</span>
      </details>
    </div>
  );
}
