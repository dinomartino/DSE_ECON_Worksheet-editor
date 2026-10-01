'use client';

import { DEFAULT_STIMULUS_SPAN, DEFAULT_STIMULUS_WORDING } from '@/model/flow';
import type { LayoutElement } from '@/model/types';
import { useMessages } from '@/i18n/language';
import { GroupHeader, NumberField } from '@/components/ui';
import { BiTextField } from './BiTextField';
import { BlockEditor } from './BlockEditor';
import { STIMULUS_PANEL_MESSAGES } from './StimulusEditorPanel.messages';

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
  const m = useMessages(STIMULUS_PANEL_MESSAGES);
  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <GroupHeader
          title={m.leadIn}
          hint={m.leadInHint}
        />
        <BiTextField
          translate={{ kind: 'wording', aroundValue: 'before' }}
          label={m.before}
          value={element.prefix ?? DEFAULT_STIMULUS_WORDING.prefix}
          onChange={(prefix) => onChange({ prefix })}
        />
        <BiTextField
          translate={{ kind: 'wording', aroundValue: 'after' }}
          label={m.after}
          value={element.suffix ?? DEFAULT_STIMULUS_WORDING.suffix}
          onChange={(suffix) => onChange({ suffix })}
        />
        <NumberField
          label={m.covered}
          min={1}
          value={element.span ?? DEFAULT_STIMULUS_SPAN}
          onChange={(span) => onChange({ span })}
        />
      </section>

      <BlockEditor
        label={m.content}
        labelHint={m.contentHint}
        blocks={element.blocks}
        onChange={(blocks) => onChange({ blocks })}
      />
    </div>
  );
}
