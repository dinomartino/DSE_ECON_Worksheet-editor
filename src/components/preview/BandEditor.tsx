'use client';

import { useState } from 'react';
import { ZONES, zonesOf, type ZoneName } from '@/model/bands';
import { bandFieldSegments } from '@/model/bandSegments';
import { plain } from '@/model/text';
import type { Band, BandField, BandFieldSide, BiText, LanguageMode } from '@/model/types';
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
  /**
   * Write authored text back to one side of a field.
   *
   * `side` is what makes a computed field editable: "Full marks: " is the prefix,
   * " marks" the suffix, and the total between them is derived and carries no side at
   * all. A plain `text` field is all prefix.
   */
  onEditField: (fieldId: string, text: BiText, side: BandFieldSide) => void;
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
    // Keyed by field *and* side, so selecting "Full marks: " and selecting " marks"
    // are different selections — the toolbar formats one without the other.
    isSelected: (fieldId: string, side: BandFieldSide) => boolean;
    onSelect: (fieldId: string, side: BandFieldSide) => void;
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
    /*
     * An enlarged field needs a line box to match, or it overprints the row above.
     *
     * A band row inherits the page's fixed 12pt line (§ one fixed line, no paragraph
     * spacing), and `fontSize` alone left a 14pt school name drawing outside it — two
     * large rows in one masthead landed on top of each other. `bandsHeight()` already
     * scales its estimate by the largest field size, so without this the DOM disagreed
     * with the height the exporter and the paginator were both working from.
     *
     * Expressed as a unitless multiple of the field's own size, which is what
     * `exactLineFor` computes in twips for the .docx — one rule, two units.
     */
    ...(field.format?.fontSize
      ? { fontSize: `${field.format.fontSize}pt`, lineHeight: 12 / 11 }
      : {}),
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
              className="pointer-events-auto cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium text-[#8f8a86] transition-colors hover:bg-[#d9ebf8] hover:text-[#0a5c9e]"
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
                      ? 'bg-[#d9ebf8] ring-2 ring-[#0d77c9]'
                      : droppable
                        ? 'ring-1 ring-dashed ring-[#8fc2e9]'
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
                      /*
                       * `whitespace-pre-wrap`, because a field's wording carries its own
                       * spacing.
                       *
                       * "Full marks: " ends in a space and " marks" begins with one — that
                       * is what separates them from the number between. HTML collapses
                       * whitespace at an inline boundary, so the three segments rendered
                       * as "Full marks:5marks" while the .docx (which writes
                       * `xml:space="preserve"`) spaced them correctly: a preview that
                       * lied about the document. `pre-wrap` rather than `pre` so a long
                       * header row still wraps.
                       */
                      className={`group/field inline-flex cursor-grab items-baseline whitespace-pre-wrap active:cursor-grabbing ${
                        dragging?.fieldId === field.id ? 'opacity-40' : ''
                      }`}
                      style={bandFieldStyle(field)}
                    >
                      {/*
                        Every kind is editable, segment by segment.

                        A field is authored wording around a derived value, so the two
                        halves get different treatment rather than the whole field being
                        one dead `<span>`: each authored segment is a full `InlineEditable`
                        — typing, Shift+Enter, and the format toolbar via its own
                        selection — while the computed value between them is inert and
                        says so on hover.

                        The segments come from `bandFieldSegments`, the same
                        decomposition the IR and the .docx use, so what is editable here
                        is exactly what carries an `EditTarget` there.
                      */}
                      {bandFieldSegments(field, { totalMarks, page }).map((segment, index) =>
                        segment.kind === 'text' ? (
                          <InlineEditable
                            // Keyed by side, not by index: a page-number pattern change
                            // reshapes the middle of the list, and an index key would
                            // hand a prefix's editing state to a suffix.
                            key={`${field.id}:${segment.side}`}
                            value={segment.text}
                            side={language === 'zh' ? 'zh' : 'en'}
                            placeholder={
                              field.kind === 'text' ? 'Double-click to add text' : '+'
                            }
                            /*
                             * An *empty* side of a computed field is pure affordance.
                             *
                             * A `pageNumber` ships with no wording at all, so both its
                             * sides are empty and each renders a `+` inviting one. That is
                             * editing chrome, not content: without `data-print-hide` the
                             * bare `+` printed on the sheet and appeared in the PDF beside
                             * every page number. The plain `text` field is exempt — its
                             * prompt is the existing "Double-click to add text", which the
                             * `data-empty-placeholder` rule already hides while keeping
                             * the box, since an empty text field *is* the whole field.
                             */
                            printHidden={
                              field.kind !== 'text' &&
                              plain(segment.text.en).length === 0 &&
                              plain(segment.text.zh).length === 0
                            }
                            onCommit={(next) => onEditField(field.id, next, segment.side)}
                            selected={selection?.isSelected(field.id, segment.side) ?? false}
                            onSelect={
                              selection
                                ? () => selection.onSelect(field.id, segment.side)
                                : undefined
                            }
                            onDeselect={selection?.onClear}
                          >
                            {plain(language === 'zh' ? segment.text.zh : segment.text.en)}
                          </InlineEditable>
                        ) : (
                          // Derived: computed at render time, so there is nowhere to
                          // write a change back to. It still takes the field's format,
                          // so "Full marks: 45 marks" stays one visual phrase when the
                          // teacher makes the wording 14pt bold.
                          <span
                            key={`${field.id}:value:${index}`}
                            data-band-value
                            title={
                              segment.token === 'totalMarks'
                                ? 'Computed from the question marks'
                                : segment.token === 'rule'
                                  ? 'A ruled space, sized by the field width'
                                  : 'Numbered by Word when the document is opened'
                            }
                            className="cursor-default"
                          >
                            {plain(language === 'zh' ? segment.text.zh : segment.text.en)}
                          </span>
                        ),
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
                      className="text-[10px] text-transparent transition-colors group-hover/band:text-[#a5a09b] hover:!text-[#0a5c9e]"
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
