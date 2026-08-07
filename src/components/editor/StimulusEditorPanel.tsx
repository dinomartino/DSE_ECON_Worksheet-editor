'use client';

import { DEFAULT_STIMULUS_SPAN, DEFAULT_STIMULUS_WORDING } from '@/model/flow';
import type { LayoutElement } from '@/model/types';
import { GroupHeader, NumberField } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';

type StimulusElement = Extract<LayoutElement, { kind: 'stimulus' }>;

/**
 * The shared stimulus's panel: the lead-in wording, how many questions it covers, and
 * the stimulus content through the same `BlockEditor` a question stem uses — so a
 * table or diagram inside a stimulus is authored exactly as one in a stem.
 *
 * The question numbers themselves never appear here: the range is derived at render
 * (§ `stimulus` in the walker), which is the whole point of the element.
 */
export function StimulusEditorPanel({
  element,
  onChange,
}: {
  element: StimulusElement;
  onChange: (patch: Partial<StimulusElement>) => void;
}) {
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <GroupHeader
          title="Lead-in"
          hint="the question numbers between the two halves are derived"
        />
        <BiTextField
          label="Before the numbers"
          value={element.prefix ?? DEFAULT_STIMULUS_WORDING.prefix}
          onChange={(prefix) => onChange({ prefix })}
        />
        <BiTextField
          label="After the numbers"
          value={element.suffix ?? DEFAULT_STIMULUS_WORDING.suffix}
          onChange={(suffix) => onChange({ suffix })}
        />
        <NumberField
          label="Questions covered"
          min={1}
          value={element.span ?? DEFAULT_STIMULUS_SPAN}
          onChange={(span) => onChange({ span })}
        />
      </section>

      <BlockEditor
        label="Stimulus content"
        labelHint="the diagram, table or text the questions share"
        blocks={element.blocks}
        onChange={(blocks) => onChange({ blocks })}
      />
    </div>
  );
}
