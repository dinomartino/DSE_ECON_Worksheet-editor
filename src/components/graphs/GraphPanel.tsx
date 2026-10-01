'use client';

import { emptyBiText, isBiTextEmpty } from '@/model/text';
import { withGraphLanguage, type SavedGraph } from '@/model/graph';
import type { CaptionPlacement, LanguageMode } from '@/model/types';
import { diagramSize } from '@/render/diagram';
import { NumberField, Segmented } from '@/components/ui';
import { BiTextField } from '@/components/editor/BiTextField';
import { useMessages } from '@/i18n/language';
import { GRAPH_PANEL_MESSAGES } from './messages';

/**
 * A saved graph's settings beside the canvas: what the canvas has no opinion about. The
 * title is edited here and only here, as in a worksheet's diagram panel; every field that
 * changes what is drawn re-measures the box.
 */
export function GraphPanel({ graph, onChange }: { graph: SavedGraph; onChange: (graph: SavedGraph) => void }) {
  const m = useMessages(GRAPH_PANEL_MESSAGES);
  const { block } = graph;
  const languageOptions: Array<{ value: LanguageMode; label: string; title: string }> = [
    { value: 'en', label: 'EN', title: m.langEn },
    { value: 'zh', label: '中', title: m.langZh },
    { value: 'bilingual', label: m.both, title: m.langBoth },
  ];
  const setBlock = (next: SavedGraph['block']) => onChange({ ...graph, block: next });
  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-ink-muted">{m.name}</span>
        <input
          type="text"
          value={graph.name}
          placeholder={m.namePlaceholder}
          onChange={(event) => onChange({ ...graph, name: event.target.value })}
          onBlur={() => {
            if (!graph.name.trim()) onChange({ ...graph, name: 'Untitled graph' });
          }}
          className="h-8 w-full rounded-lg border border-line bg-surface px-2 text-[13px] text-ink outline-none transition-colors duration-150 ease-out-soft placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <span className="block text-[11px] text-ink-subtle">{m.nameHint}</span>
      </label>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <NumberField
          label={m.printWidth}
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
        <span className="text-[11px] font-medium text-ink-muted">{m.labels}</span>
        <Segmented<LanguageMode>
          label={m.labelsLanguage}
          value={graph.language}
          options={languageOptions}
          onChange={(language) => onChange(withGraphLanguage(graph, language))}
        />
      </div>

      <BiTextField
        translate={{ kind: 'diagramTitle', fallsBack: true }}
        label={m.title}
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
          <span className="text-[11px] text-ink-subtle">{m.titleSits}</span>
          <Segmented<CaptionPlacement>
            label={m.titlePlacement}
            value={block.diagram.titlePlacement ?? 'above'}
            options={[
              { value: 'above', label: m.above, title: m.aboveTitle },
              { value: 'below', label: m.below, title: m.belowTitle },
            ]}
            onChange={(titlePlacement) => setBlock({ ...block, diagram: { ...block.diagram, titlePlacement } })}
          />
        </div>
      )}

      <BiTextField
        translate={{ kind: 'altText' }}
        label={m.altText}
        value={block.altText}
        onChange={(altText) => setBlock({ ...block, altText })}
        rows={1}
      />
    </div>
  );
}
