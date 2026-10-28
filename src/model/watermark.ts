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
 * **Where.** Centred on the page (not the text column, as Word centres its own), as wide as
 * `size` × the text column and never taller than `MAX_HEIGHT_SHARE` of the page's text
 * height. The geometry is in twips and shared by the preview and the `.docx`
 * (`watermarkBox`), so the two cannot drift.
 */

/** A light grey on paper: present on every page, never in the way of the text. */
export const WATERMARK_DEFAULT_OPACITY = 0.15;
/** Most of the text column: a logo that reads as a watermark, not as a figure. */
export const WATERMARK_DEFAULT_SIZE = 0.6;
export const WATERMARK_OPACITY_RANGE = { min: 0.05, max: 1 } as const;
export const WATERMARK_SIZE_RANGE = { min: 0.2, max: 1.4 } as const;
/** The tallest a watermark may be, as a share of the page's text height. */
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

export function watermarkSize(mark: Watermark): number {
  return finite(mark.size) ? clamp(mark.size, WATERMARK_SIZE_RANGE) : WATERMARK_DEFAULT_SIZE;
}

/** Where the picture's centre sits, as a share of the page; absent = the page's centre. */
export function watermarkCenter(mark: Watermark): { x: number; y: number } {
  const share = (value: unknown) => (finite(value) ? clamp(value, { min: 0, max: 1 }) : 0.5);
  return { x: share(mark.centerX), y: share(mark.centerY) };
}

/** The picture's box on the page, in twips from the page's top-left corner. */
export function watermarkBox(
  mark: Watermark,
  setup: PageSetup,
): { left: number; top: number; width: number; height: number } {
  const page = pageDimensions(setup);
  const textHeight = Math.max(720, page.height - setup.margins.top - setup.margins.bottom);
  let width = Math.min(contentWidth(setup) * watermarkSize(mark), page.width);
  let height = (width * mark.heightPx) / mark.widthPx;
  const tallest = textHeight * MAX_HEIGHT_SHARE;
  if (height > tallest) {
    width = (width * tallest) / height;
    height = tallest;
  }
  // Centred unless dragged; a dragged one is kept whole on the page, so it always prints.
  const center = watermarkCenter(mark);
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

/** The watermark back at the page's centre, at the default size (Setup's Reset to default). */
export function withDefaultPlacement(mark: Watermark): Watermark {
  const rest = { ...mark };
  delete rest.centerX;
  delete rest.centerY;
  delete rest.size;
  return rest;
}

/** Whether the teacher moved or resized it. */
export function hasCustomPlacement(mark: Watermark): boolean {
  return mark.centerX !== undefined || mark.centerY !== undefined || mark.size !== undefined;
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
 * menu's choice. The paper's own faintness, size and page choices stay: a teacher who
 * switches from one school's logo to another keeps the pages they turned off.
 */
export function withWatermarkPicture(previous: Watermark | undefined, picture: WatermarkPicture): Watermark {
  const kept = previous ? withPaperWatermark(previous, true) : { on: true };
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
