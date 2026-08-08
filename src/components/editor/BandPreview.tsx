'use client';

import { ZONES, zonesOf } from '@/model/bands';
import { plain } from '@/model/text';
import type { Band, BandField } from '@/model/types';
import { bandFieldText } from '@/render/worksheet';

/**
 * A miniature of a band list, for choosing between layouts.
 *
 * The header presets used to be a row of name-only buttons — "Course, title and name
 * line", "Exam paper (school, paper, date)". A name is not a layout: the only way to
 * find out what one did was to click it (destroying whatever was there), close the
 * dialog that covers the page, and look. Three of them, so up to three rounds of that.
 *
 * These draw the actual zones at the actual weights, so the difference between "three
 * centred lines" and "a line beside a page number" is visible before committing to it.
 * They are deliberately *not* the real `BandEditor`: nothing here is editable or
 * draggable, sizes are fixed rather than inherited from the page, and the text is
 * truncated — this is a picture of a choice, not a second editing surface that would
 * have to stay in step with the first.
 */

/**
 * The literal a field shows in a thumbnail, kept short enough to read at this size.
 *
 * Composed from `bandFieldText` with a specimen page, rather than each kind's wording
 * being spelled again here: this used to hardcode "Full marks: 45" and a "Name:" default,
 * so a teacher who retyped their header saw the *old* wording in the preset picker. The
 * numbers are specimens (45 marks, page 5 of 12) because a thumbnail illustrates a shape,
 * not this document.
 */
function fieldText(field: BandField): string {
  const text = bandFieldText(field, 45, { number: 5, count: 12 });
  return plain(text.en) || plain(text.zh) || '—';
}

export function BandPreview({
  bands,
  rule,
  /** Draws the rule above rather than below — a footer frames its block from the top. */
  edge = 'header',
  /** Renders an explicit "nothing prints here" state rather than an empty box. */
  emptyLabel,
}: {
  bands: Band[];
  rule?: boolean;
  edge?: 'header' | 'footer';
  emptyLabel?: string;
}) {
  if (bands.length === 0) {
    return (
      <div className="flex min-h-[38px] items-center justify-center rounded border border-dashed border-line px-2 py-2">
        <span className="text-[10px] italic text-ink-subtle">{emptyLabel ?? 'Nothing'}</span>
      </div>
    );
  }

  return (
    <div
      className={`space-y-[3px] px-1.5 py-1 ${
        rule
          ? edge === 'header'
            ? 'border-b border-[#94a3b8]'
            : 'border-t border-[#94a3b8]'
          : ''
      }`}
    >
      {bands.map((band) => {
        const zones = zonesOf(band);
        return (
          <div key={band.id} className="flex items-baseline gap-1">
            {ZONES.map((zone) => (
              <div
                key={zone}
                className={`min-w-0 flex-1 truncate text-[8px] leading-[1.4] ${
                  zone === 'left'
                    ? 'text-left'
                    : zone === 'center'
                      ? 'text-center'
                      : 'text-right'
                }`}
              >
                {zones[zone].map((field) => (
                  <span
                    key={field.id}
                    className="mx-[1px]"
                    style={{
                      // Weight and size carry most of what distinguishes one preset from
                      // another — a bold 14pt school name against a plain running line —
                      // so the thumbnail shows them rather than flattening everything to
                      // one grey. Scaled down, not literal: 14pt in a 38px card would
                      // overflow the row it is meant to illustrate.
                      ...(field.format?.bold ? { fontWeight: 700 } : {}),
                      ...(field.format?.italic ? { fontStyle: 'italic' } : {}),
                      ...(field.format?.fontSize && field.format.fontSize > 12
                        ? { fontSize: '9px' }
                        : {}),
                    }}
                  >
                    {fieldText(field)}
                  </span>
                ))}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A preset as a pickable card: the miniature, with its name underneath.
 *
 * A card rather than a button with a tooltip, because the layout *is* the label — the
 * name only disambiguates two that look similar.
 */
export function BandPresetCard({
  name,
  bands,
  edge = 'header',
  onClick,
}: {
  name: string;
  bands: Band[];
  edge?: 'header' | 'footer';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full cursor-pointer flex-col gap-1.5 rounded-lg border border-line bg-surface p-2 text-left transition-[background-color,border-color,color,box-shadow,opacity] hover:border-accent hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <div className="rounded border border-line/70 bg-[#fdfcfa] py-1 text-[#3f3b38]">
        <BandPreview bands={bands} edge={edge} />
      </div>
      <span className="text-[11px] font-medium text-ink-muted transition-colors group-hover:text-ink">
        {name}
      </span>
    </button>
  );
}
