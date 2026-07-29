'use client';

import { useState } from 'react';
import { ZONES, zonesOf, type ZoneName } from '@/model/bands';
import { plain } from '@/model/text';
import type { Band, BandField, BiText, LanguageMode } from '@/model/types';
import { bandFieldText } from '@/render/worksheet';
import { InlineEditable } from './InlineEditable';

/**
 * The masthead, edited in place with fixed drop zones.
 *
 * This is the constrained answer to "like Canva, but not free positioning": each band row
 * exposes exactly three targets — left, centre, right — and a field can be dragged between
 * them or reordered inside one. There is no arbitrary x/y, so every arrangement maps onto a
 * Word paragraph with tab stops and the export always matches what is on screen.
 *
 * Zones are only outlined while a drag is in progress or on hover. An always-visible grid
 * would make the page look like a form rather than the printed worksheet it represents.
 */

interface Props {
  bands: Band[];
  language: LanguageMode;
  totalMarks: number;
  /** Move a field to a zone, landing before `beforeId` when given. */
  onMove: (bandId: string, fieldId: string, zone: ZoneName, beforeId?: string) => void;
  onEditField: (fieldId: string, text: BiText) => void;
  onRemoveField: (fieldId: string) => void;
  onAddField: (bandId: string, zone: ZoneName) => void;
  /**
   * Add a printed row, and remove one.
   *
   * Rows were the one part of a band list with no on-page control: a teacher could edit
   * every field on the header in front of them but had to open a dialog — which covers
   * that header — to add a line to it. Worse, on page 1 the dialog's "+ Row" wrote to
   * the *other* pages, so the documented "edit it directly on the first sheet" was not
   * something the interface actually allowed.
   *
   * Optional: a masthead in a read-only preview has no row controls at all.
   */
  onAddRow?: () => void;
  onRemoveRow?: (bandId: string) => void;
  /**
   * What this list of rows is, shown on hover.
   *
   * Three band lists can print on one sheet — the page header, the masthead, the page
   * footer — and they look alike, so a teacher clicking one has no way to tell which
   * they are about to change. Naming the surface is what makes "this is page 1's own
   * header, not every page's" visible at the point of editing.
   */
  label?: string;
  /**
   * The sheet these rows are printing on, so a page-number field shows a number.
   *
   * `bandFieldText` returns the *placeholder* ("P.#", "Page # of N") because the model
   * has no page to report — the number only exists once the flow has been packed onto
   * sheets, and the .docx backend substitutes a live `PAGE` field rather than a literal.
   * The preview does know, so leaving a bare `#` on the paper made the one part of the
   * footer a teacher most wants to check unreadable.
   */
  page?: { number: number; count: number };
  /**
   * Selection, so band text gets the format toolbar every other text element has.
   *
   * Without it a header field could be *typed into* but never *selected*, and the
   * toolbar only appears for a selection — which is why header text was the one text on
   * the page whose size, weight and colour could not be changed. The model always
   * supported it (`isFormattable` accepts `bandField`); nothing emitted the target.
   */
  selection?: {
    isSelected: (fieldId: string) => boolean;
    onSelect: (fieldId: string) => void;
    onClear: () => void;
  };
}

/**
 * Substitute a page-number placeholder for the sheet actually being drawn.
 *
 * The placeholders are the ones `pageNumberPlaceholder` defines, so the two cannot drift:
 * `#` is the page and `N` the total. Without a page (a preset thumbnail, a document not
 * yet paginated) the placeholder is left alone rather than guessed at.
 */
export function withPageNumber(
  text: string,
  page?: { number: number; count: number },
): string {
  if (!page) return text;
  return text.replace(/#/g, String(page.number)).replace(/\bN\b/g, String(page.count));
}

/**
 * A band field's `TextFormat` as inline CSS.
 *
 * Exported and shared with the read-only row, which is what the print and PDF paths draw.
 * It used to render `field.format` not at all — so a 14pt bold school name previewed and
 * *printed* at the container's 12pt regular, while the editing path applied the override
 * faithfully. Entering the header therefore appeared to enlarge the text, when in truth
 * the idle state had been silently dropping the formatting all along.
 *
 * Every property the toolbar can set, not just size and weight: an underline or a colour
 * that reached the export but not the page would break the rule that the preview is the
 * document.
 */
export function bandFieldStyle(field: BandField): React.CSSProperties {
  return {
    ...(field.format?.fontSize ? { fontSize: `${field.format.fontSize}pt` } : {}),
    ...(field.format?.bold ? { fontWeight: 700 } : {}),
    ...(field.format?.italic ? { fontStyle: 'italic' } : {}),
    ...(field.format?.underline ? { textDecoration: 'underline' } : {}),
    ...(field.format?.color ? { color: `#${field.format.color}` } : {}),
    ...(field.format?.fonts?.latin ? { fontFamily: field.format.fonts.latin } : {}),
  };
}

const ALIGN: Record<ZoneName, string> = {
  left: 'justify-start text-left',
  center: 'justify-center text-center',
  right: 'justify-end text-right',
};

export function BandEditor({
  bands,
  language,
  totalMarks,
  onMove,
  onEditField,
  onRemoveField,
  onAddField,
  onAddRow,
  onRemoveRow,
  label,
  page,
  selection,
}: Props) {
  // Transient drag state; never committed, so it can't reach an undo entry.
  const [dragging, setDragging] = useState<{ bandId: string; fieldId: string } | undefined>();
  const [over, setOver] = useState<{ bandId: string; zone: ZoneName } | undefined>();

  return (
    // No margin of its own: the read-only row this replaces has none, so a `mb-3` here
    // moved the whole band list the moment its region was activated. Spacing around the
    // header and footer belongs to `HeaderFooterBand`, which applies it in both paths.
    <div className="group/bands relative">
      {/* The surface's name, and the control that adds a row to it.
          Absolutely positioned in the margin and revealed on hover, so this is editing
          chrome that never occupies space the printed page would use — the same rule the
          reorder grip and the page number follow. `data-print-hide` keeps it out of the
          PDF path, which prints the real sheets. */}
      {(label || onAddRow) && (
        <div
          data-print-hide
          // Clear of the first row rather than overlapping it: the chrome names the rows
          // below it, so sitting on top of the one it names hides the thing being
          // identified. Negative offset keeps it out of the printed flow entirely.
          // `-top-[18px]` with a matching `pb` rather than a bare offset: the strip has to
          // reach back down to the first row, or the gap between them belongs to neither
          // and the pointer loses the hover on the way up (see the per-row ✕ below).
          className="pointer-events-none absolute -top-[18px] left-0 right-0 flex items-end gap-1.5 pb-[18px] opacity-0 transition-opacity group-hover/bands:opacity-100"
        >
          {label && (
            <span className="pointer-events-auto rounded bg-[#efece7] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#8f8a86]">
              {label}
            </span>
          )}
          {onAddRow && (
            <button
              type="button"
              onClick={onAddRow}
              className="pointer-events-auto cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium text-[#8f8a86] transition-colors hover:bg-[#ede8ff] hover:text-[#6a48f5]"
            >
              + Row
            </button>
          )}
        </div>
      )}

      {bands.map((band) => {
        const zones = zonesOf(band);
        return (
          <div
            key={band.id}
            // The rule takes the literal `#999999` the exporter writes into `w:pBdr`,
            // matching `ReadOnlyBandRow` — the two paths draw the same rows, so a
            // `slate` token here would redraw the hairline the moment the region is
            // focused (§ Both band paths must agree).
            className={`group/band relative flex items-baseline gap-1 ${
              band.rule ? 'border-b border-[#999999] pb-0.5' : ''
            }`}
          >
            {/* Remove this printed row. In the left margin rather than inline, because a
                control between the zones would take width from the row it is deleting and
                shift the layout being previewed. Hidden until the row is hovered.

                The button sits *outside* the row's own box, so it cannot be the thing that
                keeps `group-hover/band` true: reaching for it left the row, hid the button
                mid-approach, and the click landed on bare paper. The wrapper therefore
                spans from the button's edge back to the row, making the pointer's path part
                of the group's hover area — it is `pointer-events-none` so only the button
                itself is clickable and the gap never steals a click from the page. */}
            {onRemoveRow && (
              <span
                data-print-hide
                className="pointer-events-none absolute -left-6 top-0 bottom-0 flex w-6 items-center justify-start opacity-0 transition-opacity group-hover/band:opacity-100"
              >
                <button
                  type="button"
                  aria-label="Remove this row"
                  title="Remove this row"
                  onClick={() => onRemoveRow(band.id)}
                  className="pointer-events-auto cursor-pointer px-1 py-0.5 text-[10px] leading-none text-[#a5a09b] transition-colors hover:text-[#dc2626]"
                >
                  ✕
                </button>
              </span>
            )}

            {ZONES.map((zone) => {
              const isOver = over?.bandId === band.id && over.zone === zone;
              // Only the band being dragged from can be dropped into: a field belongs to
              // one printed row, and moving it between rows is a different operation.
              const droppable = dragging?.bandId === band.id;

              return (
                <div
                  key={zone}
                  data-band-id={band.id}
                  data-zone={zone}
                  onDragOver={(event) => {
                    if (!droppable) return;
                    event.preventDefault();
                    setOver({ bandId: band.id, zone });
                  }}
                  onDragLeave={() => setOver(undefined)}
                  onDrop={(event) => {
                    if (!droppable || !dragging) return;
                    event.preventDefault();
                    onMove(band.id, dragging.fieldId, zone);
                    setDragging(undefined);
                    setOver(undefined);
                  }}
                  /*
                   * The editing surface must occupy exactly the space the printed row
                   * does, or activating the header changes the layout it is previewing.
                   * `min-h-[1.6em]` and `px-1` did precisely that — a header grew from
                   * 104px to 137px on being double-clicked into, and every row's line box
                   * from 14px to 16px, so the teacher sized their furniture against
                   * geometry Word will not reproduce.
                   *
                   * The drop-zone outline is therefore drawn *outside* the flow: `ring`
                   * paints beyond the border box without reserving width, and the empty
                   * zone's own `+` keeps a bare zone clickable without a min-height. The
                   * horizontal breathing room comes back as a negative-inset ring rather
                   * than as padding that would shift the text.
                   */
                  className={`flex flex-1 flex-wrap items-baseline gap-x-1 rounded transition-colors ${ALIGN[zone]} ${
                    isOver
                      ? 'bg-[#ede8ff] ring-2 ring-[#7c5cff]'
                      : droppable
                        ? 'ring-1 ring-dashed ring-[#c4b5fd]'
                        : 'group-hover/band:ring-1 group-hover/band:ring-dashed group-hover/band:ring-[#d6d1cb]'
                  }`}
                >
                  {zones[zone].map((field) => (
                    <span
                      key={field.id}
                      data-field-id={field.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'move';
                        setDragging({ bandId: band.id, fieldId: field.id });
                      }}
                      onDragEnd={() => {
                        setDragging(undefined);
                        setOver(undefined);
                      }}
                      onDragOver={(event) => {
                        // Dropping onto a sibling inserts before it, so order within a
                        // zone is controllable and not just append-only.
                        if (!dragging || dragging.fieldId === field.id) return;
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDrop={(event) => {
                        if (!dragging || dragging.fieldId === field.id) return;
                        event.preventDefault();
                        event.stopPropagation();
                        onMove(band.id, dragging.fieldId, zone, field.id);
                        setDragging(undefined);
                        setOver(undefined);
                      }}
                      className={`group/field inline-flex cursor-grab items-baseline active:cursor-grabbing ${
                        dragging?.fieldId === field.id ? 'opacity-40' : ''
                      }`}
                      style={bandFieldStyle(field)}
                    >
                      {field.kind === 'text' ? (
                        <InlineEditable
                          value={field.text}
                          side={language === 'zh' ? 'zh' : 'en'}
                          placeholder="Double-click to add text"
                          onCommit={(next) => onEditField(field.id, next)}
                          selected={selection?.isSelected(field.id) ?? false}
                          onSelect={selection ? () => selection.onSelect(field.id) : undefined}
                          onDeselect={selection?.onClear}
                        >
                          {plain(language === 'zh' ? field.text.zh : field.text.en)}
                        </InlineEditable>
                      ) : (
                        // A derived total and a generated rule are not editable text:
                        // there would be nowhere to write a change back to.
                        <span
                          title={
                            field.kind === 'totalMarks'
                              ? 'Computed from question marks'
                              : field.kind === 'pageNumber'
                                ? 'Numbered by Word when the document is opened'
                                : undefined
                          }
                        >
                          {withPageNumber(
                            plain(
                              language === 'zh'
                                ? bandFieldText(field, totalMarks).zh
                                : bandFieldText(field, totalMarks).en,
                            ),
                            page,
                          )}
                        </span>
                      )}
                      <button
                        type="button"
                        aria-label="Remove field"
                        title="Remove field"
                        onClick={() => onRemoveField(field.id)}
                        className="ml-0.5 hidden text-[10px] leading-none text-[#8f8a86] hover:text-[#dc2626] group-hover/field:inline"
                      >
                        ✕
                      </button>
                    </span>
                  ))}

                  {/* An empty zone still needs a target, but it is a print preview first:
                      the affordance stays invisible until the row is hovered, so the page
                      reads as the worksheet rather than as a form. */}
                  {zones[zone].length === 0 && (
                    <button
                      type="button"
                      onClick={() => onAddField(band.id, zone)}
                      aria-label={`Add a field to the ${zone} zone`}
                      className="text-[10px] italic text-transparent transition-colors group-hover/band:text-[#a5a09b] hover:!text-[#6a48f5]"
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
