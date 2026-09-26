import type { OutputMode, Worksheet } from '@/model/types';

/**
 * Whether the preview draws a cover sheet ahead of the body — the rule
 * `renderWorksheet` applies, so the rail and the page count agree with the page.
 */
export function hasCoverSheet(
  worksheet: Pick<Worksheet, 'cover'>,
  mode: Pick<OutputMode, 'omitCover'>,
): boolean {
  return Boolean(worksheet.cover) && !mode.omitCover;
}

/**
 * Whether the page rail earns its column: two or more sheets to choose between.
 * `bodySheets` is the paginator's count, which never includes the cover — so a cover
 * and one page is two sheets, and shows the rail.
 */
export function showsPageRail(bodySheets: number, coverSheet: boolean): boolean {
  return bodySheets + (coverSheet ? 1 : 0) > 1;
}
