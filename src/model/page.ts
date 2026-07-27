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
