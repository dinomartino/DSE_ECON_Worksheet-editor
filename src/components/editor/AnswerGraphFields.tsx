'use client';

import { useState } from 'react';
import {
  ANSWER_GRAPH_MAX_LINES,
  ANSWER_GRAPH_MIN_LINES,
  ANSWER_GRAPH_PRESETS,
  clampAnswerGraphLines,
} from '@/model/answerGraph';
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
          <LinesInput
            label={m.customLines}
            value={graph.lines}
            onChange={(lines) => patch({ lines })}
          />
          <span className="ml-1.5">{m.lines}</span>
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

/**
 * Any whole number of lines in the allowed range, beside the presets. Typed digits are a
 * draft until they make a valid height, so typing "24" never passes through a clamped
 * "6"; leaving the field settles whatever is there into range.
 */
function LinesInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (lines: number) => void;
}) {
  const [draft, setDraft] = useState<string | undefined>();
  const settle = () => {
    if (draft === undefined) return;
    const lines = clampAnswerGraphLines(draft.trim() === '' ? value : Number(draft));
    setDraft(undefined);
    if (lines !== value) onChange(lines);
  };
  return (
    <input
      type="number"
      aria-label={label}
      title={label}
      data-answer-graph-lines=""
      min={ANSWER_GRAPH_MIN_LINES}
      max={ANSWER_GRAPH_MAX_LINES}
      step={1}
      value={draft ?? String(value)}
      onChange={(event) => {
        const text = event.target.value;
        const lines = Number(text);
        const valid =
          text.trim() !== '' &&
          Number.isInteger(lines) &&
          lines >= ANSWER_GRAPH_MIN_LINES &&
          lines <= ANSWER_GRAPH_MAX_LINES;
        if (valid) {
          setDraft(undefined);
          if (lines !== value) onChange(lines);
        } else {
          setDraft(text);
        }
      }}
      onBlur={settle}
      onKeyDown={(event) => {
        if (event.key === 'Enter') settle();
      }}
      className="ml-1 h-8 w-14 rounded-lg border border-line bg-surface px-2 text-xs tabular-nums text-ink outline-none transition-colors duration-150 ease-out-soft focus:border-accent focus:ring-2 focus:ring-accent/25"
    />
  );
}
