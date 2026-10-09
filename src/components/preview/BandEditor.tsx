'use client';

import { Fragment, createContext, useContext, useState } from 'react';
import { ZONES, bandIsEmpty, zonesOf, type ZoneName } from '@/model/bands';
import { bandFieldSegments, mirrorBilingualEdit } from '@/model/bandSegments';
import { plain } from '@/model/text';
import type { Band, BandField, BandFieldSide, BiText, LanguageMode } from '@/model/types';
import { InlineEditable } from './InlineEditable';
import { useMessages } from '@/i18n/language';
import { BAND_EDITOR_MESSAGES, BAND_LABEL_KEYS } from './BandEditor.messages';
import { BAND_FIELD_SEPARATOR, BAND_ZONE_CLASS, BandRowFrame, headerZonesPrinting, type BandRowKind } from './bandRow';

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
  /** Which paragraph these rows export as, which decides their tab stops (`bandTabPlan`). */
  kind: BandRowKind;
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
  /** The Teacher version's header marker, printed after this zone's fields (`teacherMarkPlacement`). */
  trail?: BandTrail;
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
 * The sheet a flow block is drawn on, for a title-block page number (§ `withPageNumber`).
 *
 * The masthead is built before pagination, so it cannot be handed its page as a prop;
 * each sheet (and the probe, as page 1) provides it instead. Absent: the placeholder.
 */
export const SheetPageContext = createContext<{ number: number; count: number } | undefined>(undefined);

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
export function bandFieldStyle(field: Pick<BandField, 'format'>): React.CSSProperties {
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

/** Derived text appended to one zone of one row; printed, never editable. */
export interface BandTrail {
  bandId: string;
  zone: ZoneName;
  text: string;
}

/** Never wraps: in Word the marker runs on along its zone's line after the fields. */
export function BandTrailText({ text }: { text: string }) {
  return <span className="mx-0.5 shrink-0 whitespace-pre font-bold">{text}</span>;
}

/**
 * A field's hover chrome, placed by `layoutBandRow`'s `data-room-*`/`data-remove`: an
 * affix `+` outside its side of the field where the row has room, over the field's own
 * edge where it has not; the ✕ beyond whichever side has room for it.
 */
const AFFIX_PLUS_CLASS =
  'absolute top-0 whitespace-nowrap rounded-sm opacity-0 transition-opacity duration-150 ease-out-soft group-hover/field:opacity-100 group-focus-within/field:opacity-100';
const PREFIX_PLUS_SPOT =
  'group-data-[room-before=out]/field:right-full group-data-[room-before=in]/field:left-0 group-data-[room-before=in]/field:bg-[#ffffff]';
const SUFFIX_PLUS_SPOT =
  'group-data-[room-after=out]/field:left-full group-data-[room-after=in]/field:right-0 group-data-[room-after=in]/field:bg-[#ffffff]';
const REMOVE_FIELD_SPOT = [
  'group-data-[remove=after]/field:left-full group-data-[remove=after]/field:ml-0.5',
  'group-data-[remove=after-plus]/field:left-full group-data-[remove=after-plus]/field:ml-[12px]',
  'group-data-[remove=before]/field:right-full group-data-[remove=before]/field:mr-0.5',
  'group-data-[remove=before-plus]/field:right-full group-data-[remove=before-plus]/field:mr-[12px]',
  'group-data-[remove=in]/field:left-1/2 group-data-[remove=in]/field:bg-[#ffffff]',
].join(' ');

/** Where an empty zone's `+` and drop target sit, in the row: on its own tab stop. */
const EMPTY_ZONE_SPOT: Record<ZoneName, string> = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
};

export function BandEditor({
  bands,
  kind,
  language,
  totalMarks,
  onMove,
  onEditField,
  onRemoveField,
  onAddField,
  onAddRow,
  onRemoveRow,
  label,
  trail,
  page,
  selection,
}: Props) {
  const m = useMessages(BAND_EDITOR_MESSAGES);
  // A header passes its sheet; the masthead takes the one it is drawn on.
  const sheet = useContext(SheetPageContext);
  const pageHere = page ?? sheet;
  // Transient drag state; never committed, so it can't reach an undo entry.
  const [dragging, setDragging] = useState<{ bandId: string; fieldId: string } | undefined>();
  const [over, setOver] = useState<{ bandId: string; zone: ZoneName } | undefined>();
  // An empty side of a computed field, unselected: only its positioned `+` shows.
  const affixPlus = (field: BandField, segment: { text: BiText; side: BandFieldSide }) =>
    field.kind !== 'text' &&
    plain(segment.text.en).length === 0 &&
    plain(segment.text.zh).length === 0 &&
    !(selection?.isSelected(field.id, segment.side) ?? false);

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
          className="pointer-events-none absolute -top-[18px] left-0 right-0 flex items-end gap-1.5 pb-[18px] opacity-0 transition-opacity duration-150 ease-out-soft group-hover/bands:opacity-100"
        >
          {label && (
            <span className="pointer-events-auto rounded bg-[#efece7] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-[#8f8a86]">
              {BAND_LABEL_KEYS[label] ? m[BAND_LABEL_KEYS[label]] : label}
            </span>
          )}
          {onAddRow && (
            <button
              type="button"
              onClick={onAddRow}
              className="pointer-events-auto cursor-pointer rounded px-1.5 py-0.5 text-[9px] font-medium text-[#8f8a86] transition-[background-color,color,scale] duration-150 ease-out-soft hover:bg-[#d9ebf8] hover:text-[#0a5c9e] active:scale-[0.97]"
            >
              {m.addRow}
            </button>
          )}
        </div>
      )}

      {bands.map((band) => {
        const zones = zonesOf(band);
        const trailOfBand = trail?.bandId === band.id ? trail : undefined;
        // A header row's stops follow what prints (`headerFooterLayout`); a zone holding
        // only an unfinished field still gets its tab here, so its prompt sits where the
        // text will.
        const printing =
          kind === 'header' ? headerZonesPrinting(band, { totalMarks }, language, trailOfBand) : undefined;
        const occupied = Object.fromEntries(
          ZONES.map((zone) => [zone, zones[zone].length > 0 || Boolean(printing?.[zone])]),
        ) as Record<ZoneName, boolean>;
        const renderZone = (zone: ZoneName) => {
          const isOver = over?.bandId === band.id && over.zone === zone;
          // Only the band being dragged from can be dropped into: a field belongs to
          // one printed row, and moving it between rows is a different operation.
          const droppable = dragging?.bandId === band.id;
          // The trail's zone never wraps (`BandTrailText`), as the read-only row.
          const trailHere = trail?.bandId === band.id && trail.zone === zone;

          return (
            <span
              data-band-zone=""
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
               * zone's `+` and drop target are positioned, so a bare zone stays
               * clickable without taking a width the read-only row does not give it
               * (an empty zone has none: § `BandRowFrame`). Not positioned, so those
               * are placed in the row.
               */
              className={`rounded transition-[background-color,box-shadow] duration-150 ease-out-soft ${BAND_ZONE_CLASS} ${trailHere ? 'whitespace-nowrap' : ''} ${
                isOver
                  ? 'bg-[#d9ebf8] ring-2 ring-[#0d77c9]'
                  : droppable
                    ? 'ring-1 ring-dashed ring-[#8fc2e9]'
                    : 'group-hover/band:ring-1 group-hover/band:ring-dashed group-hover/band:ring-[#d6d1cb]'
              }`}
            >
              {zones[zone].map((field, fieldIndex) => (
                <Fragment key={field.id}>
                {fieldIndex > 0 && BAND_FIELD_SEPARATOR}
                <span
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
                   *
                   * `inline`, as the read-only row: a field flows from wherever its tab
                   * leaves it and wraps at the margin, as its runs do in Word.
                   */
                  className={`group/field relative inline cursor-grab active:cursor-grabbing ${
                    trailHere ? 'whitespace-pre' : 'whitespace-pre-wrap'
                  } ${
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
                  {bandFieldSegments(field, { totalMarks, page: pageHere }).map((segment, index) =>
                    segment.kind === 'text' ? (
                      /*
                       * An empty side of a computed field is only its `+`, which the
                       * printed row has no room for: until it is selected it is
                       * positioned, so engaging the band moves nothing, and shown only
                       * while the field is hovered or focused. It sits outside the
                       * field (before a prefix, after a suffix) where `layoutBandRow`
                       * found room (`data-room-*`), else over the field's own edge, so
                       * it never reaches into the margin or over other text. `contents`
                       * otherwise, so the tree (and the editor's state) never changes.
                       */
                      <span
                        // Keyed by side, not by index: a page-number pattern change
                        // reshapes the middle of the list, and an index key would
                        // hand a prefix's editing state to a suffix.
                        key={`${field.id}:${segment.side}`}
                        data-affix-plus={affixPlus(field, segment) ? segment.side : undefined}
                        className={
                          affixPlus(field, segment)
                            ? `${AFFIX_PLUS_CLASS} ${segment.side === 'prefix' ? PREFIX_PLUS_SPOT : SUFFIX_PLUS_SPOT}`
                            : 'contents'
                        }
                      >
                      <InlineEditable
                        value={segment.text}
                        side={language === 'zh' ? 'zh' : 'en'}
                        placeholder={
                          field.kind === 'text' ? m.addText : '+'
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
                        onCommit={(next) =>
                          onEditField(
                            field.id,
                            mirrorBilingualEdit(segment.text, next, language),
                            segment.side,
                          )
                        }
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
                      </span>
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
                            ? m.totalMarksTitle
                            : segment.token === 'rule'
                              ? m.ruleTitle
                              : m.pageNumberTitle
                        }
                        className="cursor-default"
                      >
                        {plain(language === 'zh' ? segment.text.zh : segment.text.en)}
                      </span>
                    ),
                  )}
                  <button
                    type="button"
                    data-print-hide
                    aria-label={m.removeField}
                    title={m.removeField}
                    onClick={() => onRemoveField(field.id)}
                    // Positioned past the field's end (or over it, at the margin), so
                    // revealing it never widens the zone and moves the row being edited.
                    className={`absolute top-0 hidden rounded-sm text-[10px] leading-none text-[#8f8a86] transition-[color] duration-150 ease-out-soft hover:text-[#dc2626] group-hover/field:inline ${REMOVE_FIELD_SPOT}`}
                  >
                    ✕
                  </button>
                </span>
                </Fragment>
              ))}

              {trailHere && <BandTrailText text={trail.text} />}

              {/* An empty zone still needs a target, but it is a print preview first:
                  the affordance stays invisible until the row is hovered, so the page
                  reads as the worksheet rather than as a form. Positioned on the zone's
                  stop, so it takes no width the printed row does not give the zone; a
                  row with nothing in it keeps one line for them (the frame's chrome). */}
              {zones[zone].length === 0 && (
                <button
                  type="button"
                  // Transparent is not absent: without this its "+" reached the PDF's text.
                  data-print-hide
                  onClick={() => onAddField(band.id, zone)}
                  aria-label={m.addField(zone)}
                  className={`absolute bottom-0 z-20 text-[10px] text-transparent transition-[color] duration-150 ease-out-soft group-hover/band:text-[#a5a09b] hover:!text-[#0a5c9e] ${EMPTY_ZONE_SPOT[zone]}`}
                >
                  +
                </button>
              )}
              {/* While a field is dragged, an empty zone is a target even when its
                  track is narrow or zero (an empty centre beside two short sides). */}
              {zones[zone].length === 0 && droppable && (
                <span
                  aria-hidden
                  data-print-hide
                  className={`absolute inset-y-0 z-20 w-16 ${EMPTY_ZONE_SPOT[zone]}`}
                />
              )}
            </span>
          );
        };
        return (
          <BandRowFrame
            key={band.id}
            kind={kind}
            occupied={occupied}
            zones={{ left: renderZone('left'), center: renderZone('center'), right: renderZone('right') }}
            // The rule takes the literal `#999999` the exporter writes into `w:pBdr`,
            // matching `ReadOnlyBandRow` — the two paths draw the same rows, so a
            // `slate` token here would redraw the hairline the moment the region is
            // focused (§ Both band paths must agree).
            className={`group/band ${band.rule ? 'border-b border-[#999999] pb-0.5' : ''}`}
            chrome={
              <>
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
                className="pointer-events-none absolute -left-6 top-0 bottom-0 flex w-6 items-center justify-start opacity-0 transition-opacity duration-150 ease-out-soft group-hover/band:opacity-100"
              >
                <button
                  type="button"
                  aria-label={m.removeRow}
                  title={m.removeRow}
                  onClick={() => onRemoveRow(band.id)}
                  className="pointer-events-auto cursor-pointer px-1 py-0.5 text-[10px] leading-none text-[#a5a09b] transition-[color,scale] duration-150 ease-out-soft hover:text-[#dc2626] active:scale-[0.97]"
                >
                  ✕
                </button>
              </span>
            )}
                {/* A row with nothing in it still has its printed line, so its +s have
                    somewhere to sit. */}
                {bandIsEmpty(band) && <span aria-hidden>{'\u200b'}</span>}
              </>
            }
          />
        );
      })}
    </div>
  );
}
