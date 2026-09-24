'use client';

import { ANSWER_GRAPH_PRESETS } from '@/model/answerGraph';
import { emptyBiText, isBiTextEmpty } from '@/model/text';
import type { AnswerGraph, BiText } from '@/model/types';
import { Button, CheckField, GroupHeader, Segmented } from '@/components/ui';
import { BiTextField } from './BiTextField';

/**
 * The inspector for one graph answer space (§ `AnswerGraph`). Its words are drawn inside
 * the picture, so — like a diagram's title — they are edited here and nowhere else.
 */
export function AnswerGraphFields({
  graph,
  onChange,
  onRemove,
}: {
  graph: AnswerGraph;
  onChange: (graph: AnswerGraph) => void;
  onRemove: () => void;
}) {
  const patch = (next: Partial<AnswerGraph>) => onChange({ ...graph, ...next });
  // A field cleared to nothing stores nothing, not the editor's empty husk.
  const title = (text: BiText) => (isBiTextEmpty(text) ? undefined : text);
  const heights = ANSWER_GRAPH_PRESETS.map((lines) => ({
    value: String(lines),
    label: String(lines),
    title: `${lines} lines (${Math.round(lines * 12 * 0.03528 * 10) / 10} cm)`,
  }));

  return (
    <div
      data-answer-graph-fields=""
      className="space-y-2 rounded-md border border-dashed border-line p-2"
    >
      <GroupHeader
        title="Graph space"
        hint="blank axes to draw on"
        action={
          <Button size="sm" variant="danger" onClick={onRemove}>
            Remove
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="flex items-center text-xs text-ink-muted">
          Height
          <Segmented
            label="Height in lines"
            value={String(graph.lines)}
            options={heights}
            onChange={(lines) => patch({ lines: Number(lines) })}
          />
          lines
        </span>
        <span className="flex items-center text-xs text-ink-muted">
          Width
          <Segmented
            label="Width"
            value={graph.width === 'half' ? 'half' : 'full'}
            options={[
              { value: 'half', label: 'Half' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={(width) => patch({ width: width === 'half' ? 'half' : undefined })}
          />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <CheckField
          label="Grid"
          checked={Boolean(graph.grid)}
          onChange={(grid) => patch({ grid: grid || undefined })}
        />
        <CheckField
          label='Origin "0"'
          checked={Boolean(graph.showOrigin)}
          onChange={(showOrigin) => patch({ showOrigin: showOrigin || undefined })}
        />
      </div>
      <BiTextField
        label="Vertical axis"
        rows={1}
        value={graph.yTitle ?? emptyBiText()}
        onChange={(text) => patch({ yTitle: title(text) })}
      />
      <BiTextField
        label="Horizontal axis"
        rows={1}
        value={graph.xTitle ?? emptyBiText()}
        onChange={(text) => patch({ xTitle: title(text) })}
      />
    </div>
  );
}
