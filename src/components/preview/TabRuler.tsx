'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import {
  cleanTabStops,
  DEFAULT_TAB_STOP_TWIPS,
  movedTabStop,
  snapTabPos,
  TAB_ALIGNS,
  TAB_LEADERS,
  TAB_PRESETS,
  TWIPS_PER_CM,
  withoutTabStop,
  withTabStop,
  type TabPreset,
} from '@/model/tabStops';
import type { TabLeader, TabStop, TabStopAlign } from '@/model/types';
import { useMessages } from '@/i18n/language';
import { TAB_RULER_MESSAGES } from './messages';
import { TOOLBAR_BTN, TOOLBAR_IDLE } from './FormatToolbar';

/**
 * Word's ruler, for the paragraph being formatted (docs/Tabs vs Word.md, phase 2): a row
 * under the format bar whose track sits exactly over that paragraph's text column, so a
 * stop is placed where it will print. Click to add a stop of the chosen type, drag to
 * move, drag off to remove, double-click for the Tab stops panel. The panel also holds
 * the quick layouts (phase 3). Chrome, outside the page, so nothing here prints.
 */

/** Where the paragraph's text column is on screen, measured by the dock. */
export interface RulerGeometry {
  /** Viewport x of the column's left edge (the margin, or a cell's text edge). */
  left: number;
  /** Its width in viewport px. */
  width: number;
  /** Viewport px per twip at the current zoom. */
  pxPerTwip: number;
  /** The column's width in twips: the page setup's, or a cell's as measured. */
  widthTwips: number;
}

interface Props {
  geometry: RulerGeometry;
  stops: TabStop[] | undefined;
  onStops: (stops: TabStop[] | undefined) => void;
  onPreset: (preset: TabPreset, widthTwips: number) => void;
  /** The Tab stops panel, toggled from the bar (and by double-clicking a stop). */
  panelOpen: boolean;
  onPanelOpen: (open: boolean) => void;
}

/** Word's tab-selector glyphs: the stop's foot points the way the text runs. */
const GLYPH: Record<TabStopAlign, string> = { left: '└', center: '┴', right: '┘', decimal: '┴·' };

/** Dragged further than this off the track, a stop is removed on release, as in Word. */
const DRAG_OFF_PX = 18;

const cm = (twips: number) => (twips / TWIPS_PER_CM).toFixed(2).replace(/\.?0+$/, '');

const FIELD =
  'h-6 rounded bg-[#33302c] px-1 text-xs text-[#f1eee9] outline-none focus-visible:ring-2 focus-visible:ring-[#5ba8dd]';

export function TabRuler({ geometry, stops: stored, onStops, onPreset, panelOpen, onPanelOpen }: Props) {
  const m = useMessages(TAB_RULER_MESSAGES);
  const rowRef = useRef<HTMLDivElement>(null);
  const [rowLeft, setRowLeft] = useState<number | undefined>();
  const [type, setType] = useState<TabStopAlign>('left');
  const [drag, setDrag] = useState<{ from: number; to: number; off: boolean } | undefined>();

  const stops = cleanTabStops(stored);
  const { widthTwips } = geometry;
  const commit = (next: TabStop[]) => onStops(next.length ? next : undefined);

  // The track is placed over the column in viewport terms; the row is where it is drawn from.
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (row) setRowLeft(row.getBoundingClientRect().left);
  }, [geometry.left, geometry.width]);

  const posAt = (clientX: number) => snapTabPos((clientX - geometry.left) / geometry.pxPerTwip, widthTwips);
  const x = (twips: number) => twips * geometry.pxPerTwip;

  // Default stops show past the last custom one, where Word still uses them.
  const lastCustom = stops.length ? stops[stops.length - 1].pos : 0;
  const defaults: number[] = [];
  for (let pos = DEFAULT_TAB_STOP_TWIPS; pos <= widthTwips; pos += DEFAULT_TAB_STOP_TWIPS) {
    if (pos > lastCustom) defaults.push(pos);
  }
  const ticks: number[] = [];
  for (let quarter = 1; quarter * (TWIPS_PER_CM / 4) <= widthTwips; quarter += 1) ticks.push(quarter);

  const alignName = (align: TabStopAlign) => m[align];
  const nextType = () => setType(TAB_ALIGNS[(TAB_ALIGNS.indexOf(type) + 1) % TAB_ALIGNS.length]);

  return (
    <div
      ref={rowRef}
      className="relative h-7 w-full basis-full"
      aria-label={m.ruler}
      role="group"
      // The page treats a click on anything it does not know as blank paper and drops
      // the selection (`isBlankAreaClick`); the track is not paper.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-label={`${m.tabType}: ${alignName(type)}`}
        title={`${m.tabType}: ${alignName(type)}`}
        className={`${TOOLBAR_BTN} ${TOOLBAR_IDLE} absolute left-0 top-0 w-7 font-mono`}
        onClick={nextType}
      >
        {GLYPH[type]}
      </button>

      {rowLeft !== undefined && (
        <div
          className="absolute top-0.5 h-6 cursor-copy select-none rounded-sm bg-[#f4f1ea] text-[#57534a]"
          style={{ left: geometry.left - rowLeft, width: geometry.width }}
          title={m.rulerHint}
          onClick={(event) => {
            // The track or a tick on it; a press on a stop is that stop's own gesture.
            const target = event.target as HTMLElement;
            if (target !== event.currentTarget && !target.hasAttribute('data-ruler-tick')) return;
            commit(withTabStop(stops, { pos: posAt(event.clientX), align: type }));
          }}
        >
          {ticks.map((quarter) => (
            <span
              key={quarter}
              data-ruler-tick=""
              aria-hidden
              className="absolute top-0 bg-[#8a847a]"
              style={{
                left: x((quarter * TWIPS_PER_CM) / 4),
                width: 1,
                height: quarter % 4 === 0 ? 0 : quarter % 2 === 0 ? 6 : 3,
              }}
            />
          ))}
          {ticks
            .filter((quarter) => quarter % 4 === 0)
            .map((quarter) => (
              <span
                key={`n${quarter}`}
                data-ruler-tick=""
                aria-hidden
                className="absolute top-0 -translate-x-1/2 text-[9px] leading-[12px] tabular-nums"
                style={{ left: x((quarter * TWIPS_PER_CM) / 4) }}
              >
                {quarter / 4}
              </span>
            ))}
          {defaults.map((pos) => (
            <span
              key={`d${pos}`}
              aria-hidden
              className="pointer-events-none absolute bottom-0 h-1 bg-[#b5aea2]"
              style={{ left: x(pos), width: 1 }}
            />
          ))}
          {stops.map((stop) => {
            const dragging = drag?.from === stop.pos;
            const at = dragging ? drag.to : stop.pos;
            return (
              <button
                key={stop.pos}
                type="button"
                aria-label={m.stopAt(alignName(stop.align), cm(stop.pos))}
                title={`${m.stopAt(alignName(stop.align), cm(stop.pos))}${stop.leader ? ` · ${m[stop.leader]}` : ''}`}
                className={`absolute bottom-0 flex h-4 w-4 -translate-x-1/2 cursor-ew-resize items-end justify-center font-mono text-[13px] font-bold leading-none text-[#0d77c9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5ba8dd] ${
                  dragging && drag.off ? 'opacity-30' : ''
                }`}
                style={{ left: x(at) }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDrag({ from: stop.pos, to: stop.pos, off: false });
                }}
                onPointerMove={(event) => {
                  if (!dragging) return;
                  const box = event.currentTarget.parentElement!.getBoundingClientRect();
                  const off = event.clientY < box.top - DRAG_OFF_PX || event.clientY > box.bottom + DRAG_OFF_PX;
                  setDrag({ from: stop.pos, to: posAt(event.clientX), off });
                }}
                onPointerUp={() => {
                  if (!dragging) return;
                  setDrag(undefined);
                  if (drag.off) commit(withoutTabStop(stops, stop.pos));
                  else if (drag.to !== stop.pos) commit(movedTabStop(stops, stop.pos, drag.to));
                }}
                onPointerCancel={() => setDrag(undefined)}
                onDoubleClick={() => onPanelOpen(true)}
                onKeyDown={(event) => {
                  const step = Math.round(TWIPS_PER_CM / 4);
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    const to = snapTabPos(stop.pos + (event.key === 'ArrowLeft' ? -step : step), widthTwips);
                    commit(movedTabStop(stops, stop.pos, to));
                  } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault();
                    commit(withoutTabStop(stops, stop.pos));
                  }
                }}
              >
                <span aria-hidden>{GLYPH[stop.align]}</span>
              </button>
            );
          })}
        </div>
      )}

      {panelOpen && (
        <TabStopsPanel
          stops={stops}
          defaultType={type}
          onStops={commit}
          onPreset={(preset) => onPreset(preset, widthTwips)}
        />
      )}
    </div>
  );
}

/** Word's Tabs dialog: each stop's exact position, alignment and leader, and the quick layouts. */
function TabStopsPanel({
  stops,
  defaultType,
  onStops,
  onPreset,
}: {
  stops: TabStop[];
  defaultType: TabStopAlign;
  onStops: (stops: TabStop[]) => void;
  onPreset: (preset: TabPreset) => void;
}) {
  const m = useMessages(TAB_RULER_MESSAGES);
  const [draft, setDraft] = useState('');
  const [draftAlign, setDraftAlign] = useState<TabStopAlign>(defaultType);
  const [draftLeader, setDraftLeader] = useState<TabLeader | ''>('');

  const twipsOf = (value: string) => {
    const number = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(number) && number > 0 ? Math.round(number * TWIPS_PER_CM) : undefined;
  };
  const replace = (from: TabStop, to: TabStop) =>
    onStops(withTabStop(stops.filter((stop) => stop.pos !== from.pos), to));
  const set = () => {
    const pos = twipsOf(draft);
    if (pos === undefined) return;
    onStops(withTabStop(stops, { pos, align: draftAlign, ...(draftLeader ? { leader: draftLeader } : {}) }));
    setDraft('');
  };

  const alignSelect = (value: TabStopAlign, change: (align: TabStopAlign) => void) => (
    <select aria-label={m.alignment} className={FIELD} value={value} onChange={(event) => change(event.target.value as TabStopAlign)}>
      {TAB_ALIGNS.map((align) => (
        <option key={align} value={align}>
          {m[align]}
        </option>
      ))}
    </select>
  );
  const leaderSelect = (value: TabLeader | undefined, change: (leader: TabLeader | undefined) => void) => (
    <select
      aria-label={m.leader}
      className={FIELD}
      value={value ?? ''}
      onChange={(event) => change((event.target.value || undefined) as TabLeader | undefined)}
    >
      <option value="">{m.leaderNone}</option>
      {TAB_LEADERS.map((leader) => (
        <option key={leader} value={leader}>
          {m[leader]}
        </option>
      ))}
    </select>
  );

  return (
    <div
      role="dialog"
      aria-label={m.dialog}
      className="absolute right-0 top-8 z-10 w-[340px] origin-top-right animate-pop-in rounded-md border border-[#454138] bg-[#211f1d] p-2 text-xs text-[#e6e2db] shadow-xl"
    >
      <div className="mb-1 flex items-center gap-1 text-[11px] text-[#a39d94]">
        <span className="w-[72px]">{m.position}</span>
        <span className="w-[76px]">{m.alignment}</span>
        <span>{m.leader}</span>
      </div>
      {stops.length === 0 && <p className="mb-1 text-[#a39d94]">{m.noStops}</p>}
      {stops.map((stop) => (
        <div key={stop.pos} className="mb-1 flex items-center gap-1">
          <input
            aria-label={m.position}
            className={`${FIELD} w-[72px] tabular-nums`}
            defaultValue={cm(stop.pos)}
            inputMode="decimal"
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            onBlur={(event) => {
              const pos = twipsOf(event.target.value);
              if (pos !== undefined && pos !== stop.pos) replace(stop, { ...stop, pos });
              else event.target.value = cm(stop.pos);
            }}
          />
          <span className="w-[76px]">{alignSelect(stop.align, (align) => replace(stop, { ...stop, align }))}</span>
          {leaderSelect(stop.leader, (leader) =>
            replace(stop, leader ? { ...stop, leader } : { pos: stop.pos, align: stop.align }),
          )}
          <button
            type="button"
            aria-label={m.remove}
            title={m.remove}
            className={`${TOOLBAR_BTN} ${TOOLBAR_IDLE} ml-auto`}
            onClick={() => onStops(withoutTabStop(stops, stop.pos))}
          >
            ✕
          </button>
        </div>
      ))}
      <div className="mb-1 flex items-center gap-1 border-t border-[#3d3a35] pt-1">
        <input
          aria-label={m.position}
          placeholder="cm"
          className={`${FIELD} w-[72px] tabular-nums`}
          value={draft}
          inputMode="decimal"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') set();
          }}
        />
        <span className="w-[76px]">{alignSelect(draftAlign, setDraftAlign)}</span>
        {leaderSelect(draftLeader || undefined, (leader) => setDraftLeader(leader ?? ''))}
        <button type="button" className={`${TOOLBAR_BTN} ${TOOLBAR_IDLE} ml-auto`} onClick={set} disabled={!twipsOf(draft)}>
          {m.set}
        </button>
      </div>
      <div className="mb-2 flex items-center justify-between text-[11px] text-[#a39d94]">
        <span>{m.defaultStops(cm(DEFAULT_TAB_STOP_TWIPS))}</span>
        {stops.length > 0 && (
          <button type="button" className={`${TOOLBAR_BTN} ${TOOLBAR_IDLE}`} onClick={() => onStops([])}>
            {m.clearAll}
          </button>
        )}
      </div>
      <div className="border-t border-[#3d3a35] pt-1">
        <div className="mb-1 text-[11px] text-[#a39d94]">{m.presets}</div>
        {TAB_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            title={m[`${preset}Hint`]}
            className="mb-0.5 flex w-full flex-col items-start rounded px-1.5 py-1 text-left transition-[background-color] duration-150 ease-out-soft hover:bg-[#3d3a35] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5ba8dd]"
            onClick={() => onPreset(preset)}
          >
            <span className="font-medium">{m[preset]}</span>
            <span className="text-[11px] text-[#a39d94]">{m[`${preset}Hint`]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
