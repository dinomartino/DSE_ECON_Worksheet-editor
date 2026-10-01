'use client';

import { emptyBiText, isBiTextEmpty } from '@/model/text';
import { withGraphLanguage, type SavedGraph } from '@/model/graph';
import type { CaptionPlacement, LanguageMode } from '@/model/types';
import { diagramSize } from '@/render/diagram';
import { NumberField, Segmented } from '@/components/ui';
import { BiTextField } from '@/components/editor/BiTextField';

const LANGUAGE_OPTIONS: Array<{ value: LanguageMode; label: string; title: string }> = [
  { value: 'en', label: 'EN', title: 'Labels in English' },
  { value: 'zh', label: '中', title: 'Labels in Chinese' },
  { value: 'bilingual', label: 'Both', title: 'Axis titles in both languages' },
];

/**
 * A saved graph's settings beside the canvas: what the canvas has no opinion about. The
 * title is edited here and only here, as in a worksheet's diagram panel; every field that
 * changes what is drawn re-measures the box.
 */
export function GraphPanel({ graph, onChange }: { graph: SavedGraph; onChange: (graph: SavedGraph) => void }) {
  const { block } = graph;
  const setBlock = (next: SavedGraph['block']) => onChange({ ...graph, block: next });
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-ink-muted">Name</span>
        <input
          type="text"
          value={graph.name}
          placeholder="Graph name"
          onChange={(event) => onChange({ ...graph, name: event.target.value })}
          onBlur={() => {
            if (!graph.name.trim()) onChange({ ...graph, name: 'Untitled graph' });
          }}
          className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <span className="block text-[11px] text-ink-subtle">Never printed. Names the file you download.</span>
      </label>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <NumberField
          label="Print width"
          min={160}
          suffix="px"
          value={block.widthPx}
          onChange={(widthPx) => setBlock({ ...block, ...diagramSize(block.diagram, Math.max(160, widthPx), graph.language) })}
        />
        <span className="text-[11px] tabular-nums text-ink-subtle">
          {(block.widthPx / 96).toFixed(1)} × {(block.heightPx / 96).toFixed(1)} in
        </span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[11px] font-medium text-ink-muted">Labels</span>
        <Segmented<LanguageMode>
          label="Labels language"
          value={graph.language}
          options={LANGUAGE_OPTIONS}
          onChange={(language) => onChange(withGraphLanguage(graph, language))}
        />
      </div>

      <BiTextField
        translate={{ kind: 'diagramTitle', fallsBack: true }}
        label="Title"
        value={block.diagram.title ?? emptyBiText()}
        onChange={(title) => {
          // Cleared means gone, with its placement (as in the worksheet's diagram panel).
          const next: typeof block.diagram = { ...block.diagram, title };
          if (isBiTextEmpty(title)) {
            delete next.title;
            delete next.titlePlacement;
          }
          setBlock({ ...block, ...diagramSize(next, block.widthPx, graph.language), diagram: next });
        }}
        rows={1}
      />
      {!isBiTextEmpty(block.diagram.title) && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-subtle">Title sits</span>
          <Segmented<CaptionPlacement>
            label="Title placement"
            value={block.diagram.titlePlacement ?? 'above'}
            options={[
              { value: 'above', label: 'Above', title: 'Draw the title above the plot' },
              { value: 'below', label: 'Below', title: 'Draw the title below the plot' },
            ]}
            onChange={(titlePlacement) => setBlock({ ...block, diagram: { ...block.diagram, titlePlacement } })}
          />
        </div>
      )}

      <BiTextField
        translate={{ kind: 'altText' }}
        label="Alt text"
        value={block.altText}
        onChange={(altText) => setBlock({ ...block, altText })}
        rows={1}
      />
    </div>
  );
}
