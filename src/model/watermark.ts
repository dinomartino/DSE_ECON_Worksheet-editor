import type { PageSetup, Watermark, Worksheet } from './types';
import { contentWidth, pageDimensions } from './page';

export type { Watermark } from './types';

/*
 * The watermark: a faint picture behind the paper's pages (k-0242).
 *
 * **Which pages.** The paper has one switch (`Watermark.on`); a page may say otherwise.
 * A page is derived (§ A page is derived), so its choice cannot be stored against "page 3":
 * page 3 of the student copy is not page 3 of the teacher copy, and the next edit moves
 * every page boundary. It is stored against the content instead, keyed by a flow id on the
 * page, and a sheet takes the first choice among the items that start on it
 * (`sheetWatermarks`). A sheet holding only the tail of an item cut across sheets has no
 * item of its own and follows the sheet before it, where that item starts.
 *
 * **Where.** A watermark placed since k-0557 (`fit: 'margins'`, user u-8m22) starts as
 * large as the margin box allows, its shape kept, centred in that box; the teacher may then
 * resize and move it as before, and that size and place are stored. One placed before
 * (no `fit`) keeps the old rule, so a saved paper never changes size on its own: centred on
 * the page, `size` × the text column, never taller than `MAX_HEIGHT_SHARE` of the text
 * height. The geometry is in twips and shared by the preview and the `.docx`
 * (`watermarkBox`), so the two cannot drift.
 */

/** A light grey on paper: present on every page, never in the way of the text. */
export const WATERMARK_DEFAULT_OPACITY = 0.15;
/** Most of the text column: a logo that reads as a watermark, not as a figure. */
export const WATERMARK_DEFAULT_SIZE = 0.6;
export const WATERMARK_OPACITY_RANGE = { min: 0.05, max: 1 } as const;
export const WATERMARK_SIZE_RANGE = { min: 0.2, max: 1.4 } as const;
/** The tallest a watermark placed before k-0557 may be, as a share of the page's text height. */
const MAX_HEIGHT_SHARE = 0.8;

/** The key a first page with no flow item of its own stores its choice under. */
export const WATERMARK_FIRST_PAGE = '#first-page';

const clamp = (value: number, range: { min: number; max: number }) =>
  Math.min(range.max, Math.max(range.min, value));

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A picture the exporter can embed (`export/docx`'s `DATA_URL`) and a browser can draw. */
const PICTURE_URL = /^data:image\/(png|jpe?g|gif);base64,/i;

/**
 * The paper's watermark when it can be drawn, else `undefined`.
 *
 * Read through here, never off the document directly: the field is free-form JSON in a
 * saved file, and a hand-edited or half-synced one must print without a watermark rather
 * than throw in the middle of a render.
 */
export function watermarkOf(worksheet: Pick<Worksheet, 'watermark'>): Watermark | undefined {
  const mark = worksheet.watermark;
  if (!mark || typeof mark !== 'object') return undefined;
  if (typeof mark.src !== 'string' || !PICTURE_URL.test(mark.src)) return undefined;
  if (!finite(mark.widthPx) || !finite(mark.heightPx) || mark.widthPx <= 0 || mark.heightPx <= 0) return undefined;
  return mark;
}

export function watermarkOpacity(mark: Watermark): number {
  return finite(mark.opacity) ? clamp(mark.opacity, WATERMARK_OPACITY_RANGE) : WATERMARK_DEFAULT_OPACITY;
}

/** Whether it follows the margin-box rule (placed since k-0557), not the old page rule. */
export function fitsMargins(mark: Watermark): boolean {
  return mark.fit === 'margins';
}

/** The page inside its margins, in twips from the page's top-left corner. */
function marginBox(setup: PageSetup): { left: number; top: number; width: number; height: number } {
  const page = pageDimensions(setup);
  return {
    left: setup.margins.left,
    top: setup.margins.top,
    width: contentWidth(setup),
    height: Math.max(720, page.height - setup.margins.top - setup.margins.bottom),
  };
}

/**
 * The width that fills the margin box, as a share of the text column: the whole column,
 * unless the picture would then be taller than the box.
 */
function fittedShare(mark: Watermark, setup: PageSetup): number {
  const box = marginBox(setup);
  return Math.min(1, (box.height * mark.widthPx) / mark.heightPx / box.width);
}

/**
 * Its width as a share of the text column. An unsized one placed since k-0557 fills the
 * margin box (with `setup`; without, the whole column); an unsized older one is the default.
 */
export function watermarkSize(mark: Watermark, setup?: PageSetup): number {
  if (finite(mark.size)) return clamp(mark.size, WATERMARK_SIZE_RANGE);
  if (!fitsMargins(mark)) return WATERMARK_DEFAULT_SIZE;
  return setup ? fittedShare(mark, setup) : 1;
}

/**
 * Where the picture's centre sits, as a share of the page. Absent = the margin box's centre
 * for one placed since k-0557 (with `setup`), the page's centre for an older one.
 */
export function watermarkCenter(mark: Watermark, setup?: PageSetup): { x: number; y: number } {
  let home = { x: 0.5, y: 0.5 };
  if (setup && fitsMargins(mark)) {
    const page = pageDimensions(setup);
    const box = marginBox(setup);
    home = { x: (box.left + box.width / 2) / page.width, y: (box.top + box.height / 2) / page.height };
  }
  const share = (value: unknown, fallback: number) => (finite(value) ? clamp(value, { min: 0, max: 1 }) : fallback);
  return { x: share(mark.centerX, home.x), y: share(mark.centerY, home.y) };
}

/** The picture's box on the page, in twips from the page's top-left corner. */
export function watermarkBox(
  mark: Watermark,
  setup: PageSetup,
): { left: number; top: number; width: number; height: number } {
  const page = pageDimensions(setup);
  const margins = marginBox(setup);
  let width = Math.min(margins.width * watermarkSize(mark, setup), page.width);
  let height = (width * mark.heightPx) / mark.widthPx;
  // The margin box's height for one placed since k-0557 (so it can fill the box, and a
  // resize from there never jumps); 80% of it for an older one, as it always printed.
  const tallest = margins.height * (fitsMargins(mark) ? 1 : MAX_HEIGHT_SHARE);
  if (height > tallest) {
    width = (width * tallest) / height;
    height = tallest;
  }
  // Centred unless dragged; a dragged one is kept whole on the page, so it always prints.
  const center = watermarkCenter(mark, setup);
  const left = clamp(center.x * page.width - width / 2, { min: 0, max: page.width - width });
  const top = clamp(center.y * page.height - height / 2, { min: 0, max: page.height - height });
  return {
    left: Math.round(left),
    top: Math.round(top),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/**
 * The watermark placed where a drag left its box (twips, as `watermarkBox` gives it): its
 * centre as a share of the page, its width as a share of the text column.
 */
export function withWatermarkPlacement(
  mark: Watermark,
  setup: PageSetup,
  box: { left: number; top: number; width: number },
): Watermark {
  const page = pageDimensions(setup);
  const size = clamp(box.width / contentWidth(setup), WATERMARK_SIZE_RANGE);
  const placed = { ...mark, size };
  const placedBox = watermarkBox(placed, setup);
  const round = (value: number) => Math.round(value * 10000) / 10000;
  return {
    ...placed,
    centerX: round(clamp((box.left + placedBox.width / 2) / page.width, { min: 0, max: 1 })),
    centerY: round(clamp((box.top + placedBox.height / 2) / page.height, { min: 0, max: 1 })),
  };
}

/**
 * The watermark as large as the margin box allows, its shape kept, centred in the box (k-0557,
 * user u-8m22): how a picture is placed, and Setup's and the page's Fit to margins. Stored
 * as `fit: 'margins'` with no size and no centre, so it is worked out from the page each
 * time it is drawn and follows a change of paper size, orientation or margins until the
 * teacher resizes or moves it.
 */
export function withFittedPlacement(mark: Watermark): Watermark {
  const rest = { ...mark };
  delete rest.centerX;
  delete rest.centerY;
  delete rest.size;
  return { ...rest, fit: 'margins' };
}

/** Whether it is fitted to the margins, as placed (so Fit to margins has nothing to do). */
export function isFitted(mark: Watermark): boolean {
  return fitsMargins(mark) && mark.size === undefined && mark.centerX === undefined && mark.centerY === undefined;
}

/**
 * The watermark back at its centre, both ways, at the size the teacher set (Setup's and the
 * page's Center): the margin box's centre for one placed since k-0557, the page's for an
 * older one. Stored as "no centre", the same as a watermark never moved, so the preview,
 * print, PDF and `.docx` all read the one rule (`watermarkBox`).
 */
export function withCenteredPlacement(mark: Watermark): Watermark {
  const rest = { ...mark };
  delete rest.centerX;
  delete rest.centerY;
  return rest;
}

/** Whether the picture sits off its centre (so Center has something to do). */
export function isOffCenter(mark: Watermark, setup?: PageSetup): boolean {
  const center = watermarkCenter(mark, setup);
  const home = watermarkCenter(withCenteredPlacement(mark), setup);
  return Math.abs(center.x - home.x) > 1e-6 || Math.abs(center.y - home.y) > 1e-6;
}

/** What a sheet is made of, as the paginator names it (`PageComposition`). */
export interface SheetItems {
  /** The flow items that start on the sheet, its opening page break first. */
  flowIds: readonly string[];
}

/** The ids a sheet's choice can be stored under, in the order they are read. */
export function sheetKeys(sheet: SheetItems, index: number): string[] {
  return index === 0 ? [WATERMARK_FIRST_PAGE, ...sheet.flowIds] : [...sheet.flowIds];
}

/**
 * Whether each sheet carries the watermark, in order.
 *
 * A sheet takes the first page choice among its keys, else the paper's switch; a sheet
 * with no keys (the tail of an item cut across sheets) follows the one before it.
 */
export function sheetWatermarks(mark: Watermark | undefined, sheets: readonly SheetItems[]): boolean[] {
  if (!mark) return sheets.map(() => false);
  const pages = mark.pages ?? {};
  const out: boolean[] = [];
  sheets.forEach((sheet, index) => {
    const keys = sheetKeys(sheet, index);
    if (keys.length === 0) {
      out.push(index > 0 ? out[index - 1] : mark.on);
      return;
    }
    const chosen = keys.find((key) => typeof pages[key] === 'boolean');
    out.push(chosen === undefined ? mark.on : pages[chosen]);
  });
  return out;
}

/** Whether the cover sheet carries the watermark. */
export function coverWatermark(mark: Watermark | undefined): boolean {
  if (!mark) return false;
  return typeof mark.cover === 'boolean' ? mark.cover : mark.on;
}

/**
 * The watermark with one sheet turned on or off. Every choice stored under the sheet's
 * keys is cleared (a moved-in item's old choice must not outvote the click), and the new
 * one is stored under its first key, unless it is what the paper's switch says anyway.
 * `undefined` when the sheet has nothing to store a choice under (§ `sheetKeys`).
 */
export function withSheetWatermark(
  mark: Watermark,
  sheet: SheetItems,
  index: number,
  on: boolean,
): Watermark | undefined {
  const keys = sheetKeys(sheet, index);
  if (keys.length === 0) return undefined;
  const pages: Record<string, boolean> = { ...(mark.pages ?? {}) };
  for (const key of keys) delete pages[key];
  if (on !== mark.on) pages[keys[0]] = on;
  return withPages(mark, pages);
}

/** The watermark with the cover turned on or off; stored only when it differs from `on`. */
export function withCoverWatermark(mark: Watermark, on: boolean): Watermark {
  const rest = { ...mark };
  delete rest.cover;
  return on === mark.on ? rest : { ...rest, cover: on };
}

/**
 * The paper's switch flipped. Page choices are kept: a page turned off stays off when the
 * paper's switch comes back on, and one turned on while the paper was off keeps its mark
 * when the switch goes off — the teacher said so about that page.
 *
 * A choice that now agrees with the switch is dropped, so the stored list holds only the
 * pages that differ from the paper.
 */
export function withPaperWatermark(mark: Watermark, on: boolean): Watermark {
  const pages = Object.fromEntries(Object.entries(mark.pages ?? {}).filter(([, value]) => value !== on));
  const next = withPages({ ...mark, on }, pages);
  return mark.cover === on ? withCoverWatermark(next, on) : next;
}

function withPages(mark: Watermark, pages: Record<string, boolean>): Watermark {
  const rest = { ...mark };
  delete rest.pages;
  return Object.keys(pages).length > 0 ? { ...rest, pages } : rest;
}

/**
 * How the `.docx` carries the body's watermark.
 *
 * - `every`: every body sheet has it — one anchored picture in the running header, as Word's
 *   own Design → Watermark does, so it is on every page however Word paginates.
 * - `some`: sheets differ — a picture anchored in the first paragraph of each sheet that has
 *   it, at the sheet heads the preview measured.
 * - `none`.
 *
 * Decided from the stored choices alone (the exporter has no sheets), counting only those
 * stored under an id still in the document.
 */
export function docxWatermarkPlan(worksheet: Worksheet): 'every' | 'some' | 'none' {
  const mark = watermarkOf(worksheet);
  if (!mark) return 'none';
  const live = new Set<string>([
    WATERMARK_FIRST_PAGE,
    ...worksheet.flow.map((item) => item.id),
    ...worksheet.questions.map((question) => question.id),
    ...worksheet.layout.map((element) => element.id),
  ]);
  const differs = Object.entries(mark.pages ?? {}).some(([key, value]) => live.has(key) && value !== mark.on);
  if (!differs) return mark.on ? 'every' : 'none';
  return 'some';
}

/** A picture from the library, as the paper takes it. */
export interface WatermarkPicture {
  id: string;
  name: string;
  src: string;
  widthPx: number;
  heightPx: number;
}

/**
 * The paper's watermark set to `picture` and switched on — the one-click button and the
 * menu's choice. A picture placed starts fitted to the margins (`withFittedPlacement`,
 * k-0557): another picture has another shape, so the old size and place mean nothing for it.
 * The paper's own faintness and page choices stay: a teacher who switches from one school's
 * logo to another keeps the pages they turned off.
 */
export function withWatermarkPicture(previous: Watermark | undefined, picture: WatermarkPicture): Watermark {
  const kept = withFittedPlacement(previous ? withPaperWatermark(previous, true) : ({ on: true } as Watermark));
  return {
    ...kept,
    on: true,
    src: picture.src,
    widthPx: picture.widthPx,
    heightPx: picture.heightPx,
    name: picture.name,
    libraryId: picture.id,
  };
}

/**
 * Each question's state on the paper: that of the sheet it starts on (`sheetWatermarks`).
 * Without the paper's sheets (not measured yet, a node test) a question takes the choice
 * stored under its own id, else the paper's switch.
 */
export function questionWatermarks(
  mark: Watermark | undefined,
  paperSheets?: readonly SheetItems[],
): (questionId: string) => boolean {
  if (!mark) return () => false;
  const onSheet = new Map<string, boolean>();
  if (paperSheets) {
    const states = sheetWatermarks(mark, paperSheets);
    paperSheets.forEach((sheet, index) => {
      for (const id of sheet.flowIds) onSheet.set(id, states[index]);
    });
  }
  return (questionId) => {
    const measured = onSheet.get(questionId);
    if (measured !== undefined) return measured;
    const own = mark.pages?.[questionId];
    return typeof own === 'boolean' ? own : mark.on;
  };
}

/**
 * Whether each sheet of the marking scheme carries the watermark (k-0242, user u-hggh):
 * the key follows the paper. A key sheet takes the state of the first question it holds
 * any of (its answers, its scheme), as that question has it on the paper; a sheet holding
 * no question's lines (the title, a version map) takes the sheet before's, and the first
 * sheet the paper's first page's. `owners`: per key sheet, the questions on it in order.
 */
export function keySheetWatermarks(
  mark: Watermark | undefined,
  owners: readonly (readonly (string | undefined)[])[],
  paperSheets?: readonly SheetItems[],
): boolean[] {
  if (!mark) return owners.map(() => false);
  const question = questionWatermarks(mark, paperSheets);
  const firstPage = paperSheets?.length
    ? sheetWatermarks(mark, paperSheets)[0]
    : typeof mark.pages?.[WATERMARK_FIRST_PAGE] === 'boolean'
      ? mark.pages[WATERMARK_FIRST_PAGE]
      : mark.on;
  const out: boolean[] = [];
  owners.forEach((onSheet, index) => {
    const first = onSheet.find((id): id is string => id !== undefined);
    out.push(first !== undefined ? question(first) : index > 0 ? out[index - 1] : firstPage);
  });
  return out;
}
