'use client';

import { useState } from 'react';
import { CheckField } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import {
  WATERMARK_OPACITY_RANGE,
  WATERMARK_SIZE_RANGE,
  watermarkOf,
  watermarkOpacity,
  watermarkSize,
  hasCustomPlacement,
  isOffCenter,
  withCenteredPlacement,
  withDefaultPlacement,
  withPaperWatermark,
  withWatermarkPicture,
  type Watermark,
} from '@/model/watermark';
import { useWorksheetStore } from '@/store/worksheetStore';
import { openWatermarkLibrary, WatermarkThumb } from './WatermarkThumb';
import { useWatermarkLibrary } from './useWatermarkLibrary';
import { WATERMARK_MESSAGES } from './watermark.messages';

/**
 * Setup → Page → Watermark (k-0242): which saved watermark this paper uses, the paper's
 * switch, how strong and how large. A slider drag is one undo step per release
 * (`onPointerUp` / `onKeyUp` commit; the drag itself only previews through `setLive`).
 */
export function WatermarkField() {
  const m = useMessages(WATERMARK_MESSAGES);
  const mark = useWorksheetStore((s) => watermarkOf(s.worksheet));
  const updateWorksheet = useWorksheetStore((s) => s.updateWorksheet);
  const { library, markUsed } = useWatermarkLibrary();
  const set = (next: Watermark) => updateWorksheet({ watermark: next });
  const differing = mark ? Object.values(mark.pages ?? {}).filter((value) => value !== mark.on).length : 0;
  const inLibrary = mark?.libraryId && library.some((entry) => entry.id === mark.libraryId);

  return (
    <section className="space-y-2.5 border-t border-line pt-4" data-testid="watermark-field">
      <div className="space-y-0.5">
        <h3 className="text-[13px] font-semibold text-ink">{m.heading}</h3>
        <p className="text-[11px] text-ink-muted">{m.fieldHint}</p>
      </div>

      <div role="radiogroup" aria-label={m.choose} className="flex flex-wrap gap-2">
        <Choice active={!mark || !mark.on} onClick={() => mark && set(withPaperWatermark(mark, false))}>
          <span aria-hidden className="block aspect-[4/3] w-20 rounded-md border border-dashed border-line" />
          <span className="w-20 truncate text-[11px]">{m.noneOnPaper}</span>
        </Choice>
        {mark && !inLibrary && (
          <Choice active={mark.on} onClick={() => set(withPaperWatermark(mark, true))}>
            <WatermarkThumb entry={mark} className="aspect-[4/3] w-20" />
            <span className="w-20 truncate text-[11px]" title={m.notInLibrary}>
              {mark.name || m.untitled}
            </span>
          </Choice>
        )}
        {[...library].reverse().map((entry) => (
          <Choice
            key={entry.id}
            active={Boolean(mark?.on && mark.libraryId === entry.id)}
            onClick={() => {
              set(withWatermarkPicture(mark, entry));
              markUsed(entry.id);
            }}
          >
            <WatermarkThumb entry={entry} className="aspect-[4/3] w-20" />
            <span className="w-20 truncate text-[11px]">{entry.name || m.untitled}</span>
          </Choice>
        ))}
        <button
          type="button"
          onClick={openWatermarkLibrary}
          className="cursor-pointer self-center rounded-md px-2 py-1 text-[11px] font-medium text-accent transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {library.length > 0 ? m.manage : m.addNew}
        </button>
      </div>

      {mark && (
        <div className="space-y-2.5">
          <CheckField label={m.printOnPages} checked={mark.on} onChange={(on) => set(withPaperWatermark(mark, on))} />
          {differing > 0 && (
            <p className="flex items-center gap-2 pl-6 text-[11px] text-ink-muted">
              {m.pagesDiffer(differing)}
              <button
                type="button"
                onClick={() => {
                  const rest = { ...mark };
                  delete rest.pages;
                  delete rest.cover;
                  set(rest);
                }}
                className="cursor-pointer font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {m.resetPages}
              </button>
            </p>
          )}
          <Slider
            // Keyed by the stored value, so an undo moves the thumb back.
            key={`opacity-${watermarkOpacity(mark)}`}
            label={m.faintness}
            value={watermarkOpacity(mark)}
            range={WATERMARK_OPACITY_RANGE}
            step={0.05}
            onCommit={(opacity) => set({ ...mark, opacity })}
          />
          <Slider
            key={`size-${watermarkSize(mark)}`}
            label={m.size}
            value={watermarkSize(mark)}
            range={WATERMARK_SIZE_RANGE}
            step={0.05}
            onCommit={(size) => set({ ...mark, size })}
          />
          <div className="flex items-center gap-3 pl-[76px] text-[11px] text-ink-muted">
            <span>{m.placementHint}</span>
            {isOffCenter(mark) && (
              <button
                type="button"
                data-testid="watermark-center"
                title={m.centerPlacementTitle}
                onClick={() => set(withCenteredPlacement(mark))}
                className="shrink-0 cursor-pointer font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {m.centerPlacement}
              </button>
            )}
            {hasCustomPlacement(mark) && (
              <button
                type="button"
                data-testid="watermark-reset"
                title={m.resetPlacementTitle}
                onClick={() => set(withDefaultPlacement(mark))}
                className="shrink-0 cursor-pointer font-medium text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {m.resetPlacement}
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Choice({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-1.5 transition-colors duration-150 ease-out-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
        active ? 'border-accent bg-accent-soft text-ink' : 'border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}

/** A percentage slider that commits once, on release. */
function Slider({
  label,
  value,
  range,
  step,
  onCommit,
}: {
  label: string;
  value: number;
  range: { min: number; max: number };
  step: number;
  onCommit: (value: number) => void;
}) {
  const [live, setLive] = useState(value);
  const commit = (target: HTMLInputElement) => {
    const next = Number(target.value);
    if (Math.abs(next - value) > 1e-9) onCommit(next);
  };
  return (
    <label className="flex items-center gap-3 text-xs text-ink-muted">
      <span className="w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={step}
        defaultValue={value}
        onChange={(event) => setLive(Number(event.target.value))}
        onPointerUp={(event) => commit(event.currentTarget)}
        onKeyUp={(event) => commit(event.currentTarget)}
        onBlur={(event) => commit(event.currentTarget)}
        className="h-1.5 w-56 cursor-pointer accent-[var(--accent)]"
      />
      <output className="w-10 tabular-nums text-ink">{Math.round(live * 100)}%</output>
    </label>
  );
}
