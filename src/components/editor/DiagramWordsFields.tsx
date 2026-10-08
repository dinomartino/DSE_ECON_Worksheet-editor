'use client';

import { emptyBiText, isBiTextEmpty } from '@/model/text';
import type { CaptionPlacement, DiagramBlock } from '@/model/types';
import { useWorksheetStore } from '@/store/worksheetStore';
import { diagramSize } from '@/render/diagram';
import { Segmented } from '@/components/ui';
import { useMessages } from '@/i18n/language';
import { BiTextField } from './BiTextField';
import { DIAGRAM_PANEL_MESSAGES } from './diagramEditing.messages';

/**
 * A diagram's words the canvas does not edit: alt text and the title (with its
 * placement). Shared by a stem diagram's panel and a model answer diagram's row.
 */
export function DiagramWordsFields({
  block,
  onChange,
}: {
  block: DiagramBlock;
  onChange: (block: DiagramBlock) => void;
}) {
  const m = useMessages(DIAGRAM_PANEL_MESSAGES);
  const language = useWorksheetStore((s) => s.mode.language);
  return (
    <>
      {/* Alt text is document metadata, not geometry: it never appears in the drawing.
          A diagram has no caption — its words are `diagram.title`, typed on the canvas
          and drawn inside the image itself. */}
      <BiTextField
        translate={{ kind: 'altText' }}
        label={m.altText}
        value={block.altText}
        onChange={(altText) => onChange({ ...block, altText })}
        rows={1}
      />
      {/* The title, edited here and **only** here.

          It is drawn inside the picture and rasterizes into the same PNG, so it is not a
          caption printed beside the figure — but it is still writing, and writing belongs
          in a field. The canvas draws it so the drawing surface shows the printed picture,
          and deliberately does not let it be selected, dragged or retyped there: one
          address for a diagram's words, with no second surface to disagree with. */}
      <BiTextField
        translate={{ kind: 'diagramTitle', fallsBack: true }}
        label={m.title}
        value={block.diagram.title ?? emptyBiText()}
        onChange={(title) => {
          /*
           * Clearing the field deletes the title outright, rather than storing the empty
           * husk the editing surface hands back.
           *
           * A contenteditable emptied with ⌘A-Backspace does not return `[]` — it returns
           * a run holding `"\n"`. That is whitespace, so `isBiTextEmpty` correctly hides
           * the placement control and `pickSides` draws nothing, and the deletion *looks*
           * complete. But the husk is still in the document: it reaches the exporter, it
           * round-trips through save/load, and it is exactly the `{"en":[{"text":"\\n"}]}`
           * that turned up in the reference worksheets and printed a phantom blank line.
           * A field cleared to nothing must store nothing.
           *
           * `titlePlacement` goes with it. It answers "which side does the title print
           * on"; with no title the question has no subject, and leaving it behind means a
           * later re-titling silently inherits a side the teacher never chose for it.
           */
          const cleared = isBiTextEmpty(title);
          const next = cleared
            ? (({ title: _t, titlePlacement: _p, ...rest }) => rest)(block.diagram)
            : { ...block.diagram, title };

          onChange({
            ...block,
            // The picture is measured, so gaining or losing a title resizes it. Doing
            // this on every keystroke keeps the stored size honest — a title added and
            // never re-measured would print into room nothing reserved.
            ...diagramSize(next, block.widthPx, language),
            diagram: next,
          });
        }}
        rows={1}
      />
      {/* Which side of the plot it prints on. Offered only once there *is* a title:
          most DSE diagrams carry none, and a placement control over an empty field asks
          about something that does not exist. */}
      {!isBiTextEmpty(block.diagram.title) && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-subtle">{m.titleSits}</span>
          <Segmented<CaptionPlacement>
            label={m.titlePlacement}
            value={block.diagram.titlePlacement ?? 'above'}
            options={[
              { value: 'above', label: m.above, title: m.aboveHint },
              { value: 'below', label: m.below, title: m.belowHint },
            ]}
            onChange={(titlePlacement) =>
              onChange({ ...block, diagram: { ...block.diagram, titlePlacement } })
            }
          />
        </div>
      )}
    </>
  );
}
