'use client';

import { emptyBiText, isBiTextEmpty } from '@/model/text';
import type { BiText, CaptionPlacement } from '@/model/types';
import { Segmented } from '@/components/ui';
import { BiTextField } from './BiTextField';

/**
 * A block's caption, plus which side of the block it prints on.
 *
 * One component rather than the field and the control written out per block type. The
 * two belong together — the placement is meaningless without a caption, and that
 * dependency is expressed here once instead of being re-remembered at each call site.
 * It was not: the placement control shipped on the diagram panel alone while tables and
 * images had only the text field, so the capability existed end-to-end in the model, the
 * IR and all three backends and was reachable from exactly one of the three blocks that
 * had it. A table is the block where "above" is the *conventional* choice, and it was
 * the one that could not be asked for.
 *
 * The placement appears only once there **is** a caption: most blocks carry none, and a
 * control over an empty field asks about something that does not exist. `below` is the
 * default and stays unstored, so an untouched document exports byte-identically.
 */
export function CaptionField({
  value,
  placement,
  onChange,
  /** Names the thing being captioned, for the control's tooltips ("above the table"). */
  noun,
}: {
  value?: BiText;
  placement?: CaptionPlacement;
  onChange: (patch: { caption?: BiText; captionPlacement?: CaptionPlacement }) => void;
  noun: string;
}) {
  return (
    <>
      <BiTextField
        label="Caption"
        value={value ?? emptyBiText()}
        onChange={(caption) =>
          /*
           * A field cleared to nothing stores nothing — not the husk the editing surface
           * returns. A contenteditable emptied with ⌘A-Backspace hands back a run holding
           * `"\n"`, which is whitespace: `isBiTextEmpty` hides the control below and the
           * renderers draw nothing, so the deletion looks complete while the husk stays
           * in the document, reaches the exporter and prints a phantom blank line. That
           * `{"en":[{"text":"\n"}]}` is exactly what turned up in the reference
           * worksheets. The placement goes too — with no caption it has no subject, and
           * leaving it makes a later re-captioning inherit a side nobody chose.
           */
          isBiTextEmpty(caption)
            ? onChange({ caption: undefined, captionPlacement: undefined })
            : onChange({ caption, captionPlacement: placement })
        }
        rows={1}
      />
      {!isBiTextEmpty(value) && (
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-ink-subtle">Caption sits</span>
          <Segmented<CaptionPlacement>
            label="Caption placement"
            value={placement ?? 'below'}
            options={[
              { value: 'above', label: 'Above', title: `Print the caption above the ${noun}` },
              { value: 'below', label: 'Below', title: `Print the caption below the ${noun}` },
            ]}
            onChange={(captionPlacement) =>
              onChange({ caption: value ?? emptyBiText(), captionPlacement })
            }
          />
        </div>
      )}
    </>
  );
}
