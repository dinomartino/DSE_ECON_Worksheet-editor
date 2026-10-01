'use client';

import { ANSWER_GRAPH_PRESETS } from '@/model/answerGraph';
import { emptyBiText, isBiTextEmpty } from '@/model/text';
import type { AnswerGraph, BiText } from '@/model/types';
import { useMessages } from '@/i18n/language';
import { Button, CheckField, GroupHeader, Segmented } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { ANSWER_GRAPH_MESSAGES } from './AnswerGraphFields.messages';

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
  const m = useMessages(ANSWER_GRAPH_MESSAGES);
  const patch = (next: Partial<AnswerGraph>) => onChange({ ...graph, ...next });
  // A field cleared to nothing stores nothing, not the editor's empty husk.
  const title = (text: BiText) => (isBiTextEmpty(text) ? undefined : text);
  const heights = ANSWER_GRAPH_PRESETS.map((lines) => ({
    value: String(lines),
    label: String(lines),
    title: m.linesTitle(lines, Math.round(lines * 12 * 0.03528 * 10) / 10),
  }));

  return (
    <div
      data-answer-graph-fields=""
      className="space-y-2 rounded-md border border-dashed border-line p-2"
    >
      <GroupHeader
        title={m.title}
        hint={m.hint}
        action={
          <Button size="sm" variant="danger" onClick={onRemove}>
            {m.remove}
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
        <span className="flex items-center text-xs text-ink-muted">
          {m.height}
          <Segmented
            label={m.heightIn}
            value={String(graph.lines)}
            options={heights}
            onChange={(lines) => patch({ lines: Number(lines) })}
          />
          {m.lines}
        </span>
        <span className="flex items-center text-xs text-ink-muted">
          {m.width}
          <Segmented
            label={m.width}
            value={graph.width === 'half' ? 'half' : 'full'}
            options={[
              { value: 'half', label: m.half },
              { value: 'full', label: m.full },
            ]}
            onChange={(width) => patch({ width: width === 'half' ? 'half' : undefined })}
          />
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <CheckField
          label={m.grid}
          checked={Boolean(graph.grid)}
          onChange={(grid) => patch({ grid: grid || undefined })}
        />
        <CheckField
          label={m.origin}
          checked={Boolean(graph.showOrigin)}
          onChange={(showOrigin) => patch({ showOrigin: showOrigin || undefined })}
        />
      </div>
      <BiTextField
        translate={{ kind: 'axisTitle', fallsBack: true }}
        label={m.vertical}
        rows={1}
        value={graph.yTitle ?? emptyBiText()}
        onChange={(text) => patch({ yTitle: title(text) })}
      />
      <BiTextField
        translate={{ kind: 'axisTitle', fallsBack: true }}
        label={m.horizontal}
        rows={1}
        value={graph.xTitle ?? emptyBiText()}
        onChange={(text) => patch({ xTitle: title(text) })}
      />
    </div>
  );
}
