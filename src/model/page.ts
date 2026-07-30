import { newId } from './factories';
import { emptyBiText, isBiTextEmpty } from './text';
import type {
  Band,
  BandField,
  HeaderFooter,
  PageMargins,
  PageSetup,
  PaperSize,
  Worksheet,
} from './types';

/**
 * Page geometry and header/footer defaults.
 *
 * One module owns paper dimensions so the preview and the .docx `w:pgSz` can never
 * drift: the exporter writes these twips directly, and the preview converts the same
 * numbers to millimetres. Sizes are in twips (1/1440") to match Word natively.
 */

const TWIPS_PER_INCH = 1440;
export const TWIPS_PER_MM = TWIPS_PER_INCH / 25.4;
export const TWIPS_PER_CM = TWIPS_PER_INCH / 2.54;

/** Portrait dimensions in twips; landscape swaps them at render time. */
export const PAPER_SIZES: Record<PaperSize, { width: number; height: number; label: string }> = {
  A4: { width: 11906, height: 16838, label: 'A4 (210 × 297 mm)' },
  A3: { width: 16838, height: 23811, label: 'A3 (297 × 420 mm)' },
  Letter: { width: 12240, height: 15840, label: 'Letter (8.5 × 11 in)' },
  Legal: { width: 12240, height: 20160, label: 'Legal (8.5 × 14 in)' },
};

export const twipsToMm = (twips: number) => twips / TWIPS_PER_MM;
export const twipsToCm = (twips: number) => twips / TWIPS_PER_CM;
export const cmToTwips = (cm: number) => Math.round(cm * TWIPS_PER_CM);
/** 20 twips to the point. Cell padding is authored in twips and drawn in points. */
export const twipsToPt = (twips: number) => twips / 20;
export const ptToTwips = (pt: number) => Math.round(pt * 20);

/** 2.54 cm all round — the previous hardcoded default (§7.1). */
export const DEFAULT_MARGINS: PageMargins = { top: 1440, right: 1440, bottom: 1440, left: 1440 };

/**
 * Margin presets, top/bottom first then left/right — the order Word states them in.
 *
 * Stored as twips computed from the centimetre figure in the label rather than as
 * round twip numbers, so the label can never drift from what is actually applied.
 * 1.5 cm is 850.39…, and `cmToTwips` rounds, which is why the preset is written as a
 * conversion rather than a literal.
 */
export const MARGIN_PRESETS: Array<{ label: string; margins: PageMargins }> = [
  { label: 'Normal (2.54 cm)', margins: DEFAULT_MARGINS },
  { label: 'Narrow (1.27 cm)', margins: { top: 720, right: 720, bottom: 720, left: 720 } },
  // The house style for a printed worksheet: full top and bottom margins to leave room
  // for the header, footer and a hole-punch, with the sides pulled in so a bilingual
  // question has the width it needs without wrapping mid-phrase.
  {
    label: 'Worksheet (2.54 / 1.5 cm)',
    margins: {
      top: cmToTwips(2.54),
      right: cmToTwips(1.5),
      bottom: cmToTwips(2.54),
      left: cmToTwips(1.5),
    },
  },
  { label: 'Moderate (2.54 / 1.91 cm)', margins: { top: 1440, right: 1080, bottom: 1440, left: 1080 } },
  { label: 'Wide (2.54 / 5.08 cm)', margins: { top: 1440, right: 2880, bottom: 1440, left: 2880 } },
];

export const DEFAULT_PAGE_SETUP: PageSetup = {
  paper: 'A4',
  orientation: 'portrait',
  margins: { ...DEFAULT_MARGINS },
};

export function pageSetupOf(worksheet: Worksheet): PageSetup {
  const setup = worksheet.pageSetup;
  if (!setup) return DEFAULT_PAGE_SETUP;
  return {
    paper: setup.paper ?? DEFAULT_PAGE_SETUP.paper,
    orientation: setup.orientation ?? DEFAULT_PAGE_SETUP.orientation,
    margins: { ...DEFAULT_MARGINS, ...(setup.margins ?? {}) },
  };
}

/** Actual page box after applying orientation. */
export function pageDimensions(setup: PageSetup): { width: number; height: number } {
  const { width, height } = PAPER_SIZES[setup.paper] ?? PAPER_SIZES.A4;
  return setup.orientation === 'landscape'
    ? { width: height, height: width }
    : { width, height };
}

/** Width available to content, i.e. the text column the preview must mirror. */
export function contentWidth(setup: PageSetup): number {
  const { width } = pageDimensions(setup);
  return Math.max(720, width - setup.margins.left - setup.margins.right);
}

/**
 * A page-number field, printed to a pattern.
 *
 * `longForm` is "Page 5 of 12", `pDot` is the "P.5" every DSE-style footer uses
 * (`real_life_reference/foot1.png`), `plain` is a bare number.
 */
export function createPageNumberField(
  pattern: 'plain' | 'pDot' | 'longForm' = 'plain',
): BandField {
  return { kind: 'pageNumber', id: newId(), pattern };
}

/**
 * The literal a page-number pattern prints, with `#` standing for the page.
 *
 * Shared by every backend so the pattern is defined once: the preview substitutes a
 * chip for `#`, and the .docx swaps it for a live `PAGE` field. Having each backend
 * spell "Page # of N" itself is how a footer ends up reading differently on screen than
 * it does in Word.
 */
export function pageNumberPlaceholder(
  pattern: 'plain' | 'pDot' | 'longForm' = 'plain',
): string {
  if (pattern === 'pDot') return 'P.#';
  if (pattern === 'longForm') return 'Page # of N';
  return '#';
}

export function defaultHeader(): HeaderFooter {
  return { enabled: false, bands: [], rule: true, showOnFirstPage: true };
}

export function defaultFooter(): HeaderFooter {
  return {
    enabled: true,
    bands: [{ id: newId(), zones: { left: [], center: [createPageNumberField()], right: [] } }],
    rule: false,
    showOnFirstPage: true,
  };
}

/** Normalise a possibly-absent header/footer so consumers can assume the shape. */
export function headerFooterOf(
  value: HeaderFooter | undefined,
  fallback: () => HeaderFooter,
): HeaderFooter {
  if (!value) return fallback();
  return {
    enabled: value.enabled ?? false,
    bands: value.bands ?? [],
    rule: value.rule,
    showOnFirstPage: value.showOnFirstPage ?? true,
    // Carried through rather than defaulted: absent is a meaningful state ("page 1 is
    // the same as every other page"), so inventing an empty object here would turn
    // every document into one that blanks its own first page.
    ...(value.firstPage ? { firstPage: value.firstPage } : {}),
  };
}

/**
 * What page 1 actually prints, and whether that differs from the rest.
 *
 * The three states of § `HeaderFooter.firstPage` resolved in one place, so the exporter,
 * the preview and the settings panel cannot disagree about which one a document is in.
 */
export function firstPageHeaderFooter(value: HeaderFooter): {
  /** Rows page 1 prints. Empty when page 1 is deliberately blank. */
  bands: Band[];
  rule: boolean | undefined;
  /** True when page 1 needs its own part at all (`w:titlePg`). */
  differs: boolean;
} {
  if (value.firstPage) {
    return {
      bands: value.firstPage.bands,
      rule: value.firstPage.rule ?? value.rule,
      differs: true,
    };
  }
  if (value.showOnFirstPage === false) {
    return { bands: [], rule: value.rule, differs: true };
  }
  return { bands: value.bands ?? [], rule: value.rule, differs: false };
}

/**
 * True when a field would print nothing.
 *
 * Only authored text can be blank: a page number and a fill-in rule always draw
 * something, which is why an empty-looking header carrying a "Name:____" rule is still
 * active and must still emit its part.
 */
export function bandFieldIsEmpty(field: BandField): boolean {
  return field.kind === 'text' && isBiTextEmpty(field.text);
}

/** True when a row of bands would render nothing, so backends can skip the part. */
export function bandsAreEmpty(bands: Band[]): boolean {
  return bands.every((band) =>
    (['left', 'center', 'right'] as const).every((zone) =>
      (band.zones?.[zone] ?? []).every(bandFieldIsEmpty),
    ),
  );
}

/** Does this header/footer contribute anything to the output? */
export function isHeaderFooterActive(value: HeaderFooter): boolean {
  return value.enabled && !bandsAreEmpty(value.bands ?? []);
}

/**
 * Should the preview draw this band list at all?
 *
 * Printing skips rows that would draw nothing, but **editing never does**: the surface is
 * where rows are added, so hiding it when it holds nothing removes the only place to put
 * something back. A blank row is precisely the state of a row a teacher just created.
 *
 * Qualifying this with `bands.length > 0` — the first attempt — inverted it: `bandsAreEmpty`
 * asks "does any row carry text", so the surface survived only while the list was
 * *literally* empty and unmounted the moment a row was added to it. Deleting the last row
 * that had text then took the whole footer off the page, blank rows and all.
 */
export function bandsShouldRender(bands: Band[], editing: boolean): boolean {
  return editing || !bandsAreEmpty(bands);
}

/**
 * How tall one printed row is, in twips.
 *
 * An estimate, not a measurement: the exporter has no font metrics and Word will lay the
 * text out itself. It only has to be close enough to place the header's *starting* edge,
 * and it errs on the generous side — a row assumed slightly too tall costs a little
 * unused margin, while one assumed too short puts the header back into the text.
 *
 * A band's own font size wins where a field sets one, since the exam presets set 14pt on
 * their title rows and those are exactly the rows that make a header overflow.
 */
/*
 * A band row is one paragraph, and every paragraph this exporter writes sits in the
 * fixed 12pt (240tw) line box mirrored from the reference paper — so a row's height is
 * that box exactly, not an estimate of Word's single-spaced leading.
 *
 * This used to be 264tw, Word's ~1.15 auto leading for an 11pt run. With
 * `w:lineRule="exact"` the box no longer depends on the font's own metrics, which is
 * what makes the height knowable here at all: neither a header nor a footer emits
 * paragraph spacing, so the row *is* the line.
 *
 * Kept in step with `FIXED_LINE_TWIPS` in `export/docx/styles.ts`. It is duplicated
 * rather than imported because `model/` must not depend on `export/` — a test asserts
 * the two agree.
 */
export const BAND_ROW_TWIPS = 240;
const RULE_GAP_TWIPS = 120; // The border and its padding, when a rule is drawn.

export function bandsHeight(bands: Band[], rule?: boolean): number {
  const rows = bands.reduce((total, band) => {
    const zones = band.zones ?? { left: [], center: [], right: [] };
    const sizes = (['left', 'center', 'right'] as const)
      .flatMap((zone) => zones[zone] ?? [])
      .map((field) => field.format?.fontSize)
      .filter((size): size is number => typeof size === 'number');
    const largest = sizes.length > 0 ? Math.max(...sizes) : 11;
    // Scale the row against the 11pt body default the estimate is calibrated for.
    return total + Math.round(BAND_ROW_TWIPS * (largest / 11));
  }, 0);
  return rows + (rule ? RULE_GAP_TWIPS : 0);
}

/**
 * Where the header and footer start, measured from the page edge (`w:header`/`w:footer`).
 *
 * **A header must use the margin before it uses the page.** Word grows a header *downward*
 * from `w:header` and only pushes the body text down once it passes `w:top`; the same in
 * reverse for the footer. So the room a header has to grow into is `top - header`, and
 * with both hardcoded — `w:header="720"` against a 1440 top margin — a five-row exam
 * header had 720 twips to fit into, overflowed, and shoved the questions down the page.
 * That is the bug this exists to fix: adding a header silently cost content space.
 *
 * The offset is therefore derived from what the header actually contains — pulled up
 * toward the page edge until the rows fit inside the margin — rather than fixed. A header
 * taller than the whole margin still pushes the body down, because there is genuinely
 * nowhere else for it to go, but it now does so only when the margin is really full.
 *
 * `MIN_EDGE_TWIPS` is the floor every desktop printer can reach; the reference paper uses
 * 567 (1 cm), which is comfortably above it.
 */
const MIN_EDGE_TWIPS = 284; // 0.5 cm — inside the non-printable area of most printers.
const DEFAULT_EDGE_TWIPS = 720; // 1.27 cm, the value Word itself defaults to.

/**
 * By how much a header/footer overruns the margin it was given, in twips.
 *
 * Zero in the normal case — the whole point of `headerFooterOffsets` is to keep it there.
 * A positive number is the amount Word will push the body text by, and is what the
 * paginator subtracts from the text column so the preview and the export agree about it.
 * It is also worth surfacing: a header that eats content is nearly always a sign the top
 * margin is too small for the rows the teacher has added, and the fix (a wider margin, or
 * one fewer row) is theirs to choose.
 */
export function bandsOverflow(
  margins: PageMargins,
  headerHeight: number,
  footerHeight: number,
): { header: number; footer: number } {
  const offsets = headerFooterOffsets(margins, headerHeight, footerHeight);
  return {
    header: Math.max(0, offsets.header + headerHeight - margins.top),
    footer: Math.max(0, offsets.footer + footerHeight - margins.bottom),
  };
}

export function headerFooterOffsets(
  margins: PageMargins,
  headerHeight: number,
  footerHeight: number,
): { header: number; footer: number } {
  /*
   * **The default is left alone unless the rows genuinely do not fit.**
   *
   * Word's own 1.27 cm is what a teacher expects a header to look like, and it is what
   * every document that has never overflowed should keep. Only a header too tall for the
   * room under that default gets moved, and then only as far as it needs — the first
   * version of this computed `margin - height` unconditionally, which *always* pushed the
   * header up to fill the margin, so even a one-row header ended up flattened against the
   * page edge for no reason.
   */
  const fit = (height: number, margin: number) => {
    if (height <= 0) return DEFAULT_EDGE_TWIPS;
    // Does it already fit in the space the default leaves? Then nothing to do.
    if (DEFAULT_EDGE_TWIPS + height <= margin) return DEFAULT_EDGE_TWIPS;
    // It does not, so pull it up — but never past the printable edge, and never further
    // than the rows actually need.
    return Math.max(MIN_EDGE_TWIPS, margin - height);
  };

  return {
    header: fit(headerHeight, margins.top),
    footer: fit(footerHeight, margins.bottom),
  };
}
